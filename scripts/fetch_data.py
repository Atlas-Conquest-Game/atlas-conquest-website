"""
Atlas Conquest — Data Pipeline

Connects to AWS DynamoDB, pulls game data, cleans it, and writes
aggregated JSON files to site/data/ for the static frontend.

Supports incremental fetching: caches processed games in site/data/raw_games.json
so subsequent runs only fetch new games from DynamoDB.

Usage:
    python scripts/fetch_data.py

Environment variables (set via GitHub Secrets in CI):
    AWS_ACCESS_KEY_ID
    AWS_SECRET_ACCESS_KEY
    AWS_DEFAULT_REGION
"""

import csv
import json
import os
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

# ─── Paths ──────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
DATA_DIR = PROJECT_DIR / "site" / "data"
ASSETS_DIR = PROJECT_DIR / "site" / "assets" / "commanders"
CARD_SCREENSHOTS_DIR = PROJECT_DIR / "CardScreenshots"
RAW_CACHE = DATA_DIR / "raw_games.json"

# Intern's reference CSVs (local only, not in repo)
INTERN_DIR = PROJECT_DIR / "drive-download-20260222T043305Z-1-001"
CARDS_CSV = INTERN_DIR / "StandardFormatCards.csv"
COMMANDERS_CSV = INTERN_DIR / "StandardFormatCommanders.csv"

# ─── Constants ──────────────────────────────────────────────────

DYNAMO_TABLE = "games"
DYNAMO_REGION = os.environ.get("AWS_DEFAULT_REGION", "us-east-2")

# Commander name normalization map (typos → canonical)
COMMANDER_RENAMES = {
    "Elber, Jungle Emmisary": "Elber, Jungle Emissary",
    "Layna, Soulcatcher": "Soultaker Viessa",
}

# Minimum turns per player to count as a real game
MIN_TURNS = 2

# Patron (faction) color mapping
PATRON_MAP = {
    "Skaal": "skaal",
    "Grenalia": "grenalia",
    "Lucia": "lucia",
    "Neutral": "neutral",
    "Shadis": "shadis",
    "Archaeon": "archaeon",
}


# ─── AWS / DynamoDB ─────────────────────────────────────────────

def get_dynamo_table():
    """Create DynamoDB table resource with retry-friendly config."""
    try:
        import boto3
        from botocore.config import Config
    except ImportError:
        print("Error: boto3 is required. Install with: pip install boto3")
        sys.exit(1)

    config = Config(
        retries={"max_attempts": 10, "mode": "adaptive"},
        read_timeout=120,
        connect_timeout=10,
    )
    dynamodb = boto3.resource("dynamodb", region_name=DYNAMO_REGION, config=config)
    return dynamodb.Table(DYNAMO_TABLE)


def scan_all_games(table, cached_game_ids=None):
    """Scan DynamoDB table for all games. Returns list of raw items.

    If cached_game_ids is provided, we still do a full scan (DynamoDB has no
    GSI on datetime), but skip items we've already processed.
    """
    cached_game_ids = cached_game_ids or set()
    items = []
    new_count = 0
    scan_kwargs = {}
    page = 0

    while True:
        page += 1
        try:
            response = table.scan(**scan_kwargs)
        except Exception as e:
            if "ProvisionedThroughputExceededException" in str(type(e).__name__) or "Throughput" in str(e):
                wait = min(2 ** page, 30)
                print(f"    Throttled, waiting {wait}s...")
                time.sleep(wait)
                continue
            raise

        for item in response.get("Items", []):
            gid = item.get("gameid", "")
            if gid not in cached_game_ids:
                items.append(item)
                new_count += 1

        scanned = response.get("ScannedCount", 0)
        print(f"    Page {page}: scanned {scanned} items, {new_count} new so far")

        if "LastEvaluatedKey" not in response:
            break
        scan_kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]

    return items


# ─── Parsing & Cleaning ─────────────────────────────────────────

def parse_datetime(dt_str):
    """Parse 'MM/DD/YYYY HH:MM:SS' into datetime object."""
    if not dt_str:
        return None
    try:
        return datetime.strptime(dt_str.strip(), "%m/%d/%Y %H:%M:%S")
    except ValueError:
        return None


def parse_players_json(raw):
    """Parse the nested players JSON string from DynamoDB."""
    if not raw:
        return None
    try:
        # DynamoDB stores it as a JSON string, sometimes double-encoded
        if isinstance(raw, str):
            # Handle double-quoted wrapping: ""key"" → "key"
            cleaned = raw
            if cleaned.startswith('"') and cleaned.endswith('"'):
                cleaned = cleaned[1:-1]
            cleaned = cleaned.replace('""', '"')
            return json.loads(cleaned)
        return raw
    except (json.JSONDecodeError, TypeError):
        # Try alternate parsing
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return None


def normalize_commander(name):
    """Apply commander name fixes."""
    if not name:
        return name
    return COMMANDER_RENAMES.get(name, name)


def clean_game(raw_item):
    """Parse a raw DynamoDB item into a clean game dict. Returns None if invalid."""
    game_id = raw_item.get("gameid", "")
    first_player = str(raw_item.get("firstPlayer", "0"))

    # Filter: games that never started
    if first_player == "0":
        return None

    # Parse datetimes
    dt_end = parse_datetime(raw_item.get("datetime", ""))
    dt_start = parse_datetime(raw_item.get("datetimeStarted", ""))

    # Parse players
    players_data = parse_players_json(raw_item.get("players", ""))
    if not players_data:
        return None

    num_players = players_data.get("numPlayers", 0)
    if isinstance(num_players, str):
        num_players = int(num_players) if num_players.isdigit() else 0

    # Filter: need at least 2 players
    if num_players < 2:
        return None

    players = players_data.get("players", [])
    if len(players) < 2:
        return None

    # Filter: both players must have taken at least MIN_TURNS turns
    for p in players:
        turns = p.get("turnsTaken", 0)
        if isinstance(turns, str):
            turns = int(turns) if turns.isdigit() else 0
        if turns < MIN_TURNS:
            return None

    # Build clean player records
    clean_players = []
    for p in players:
        decklist = p.get("decklist", {})
        commander = normalize_commander(decklist.get("_commander", ""))

        turns = p.get("turnsTaken", 0)
        if isinstance(turns, str):
            turns = int(turns) if turns.isdigit() else 0

        actions = p.get("actionsTaken", 0)
        if isinstance(actions, str):
            actions = int(actions) if actions.isdigit() else 0

        winner = p.get("winner", False)
        if isinstance(winner, str):
            winner = winner.lower() == "true"

        cards_in_deck = []
        for c in decklist.get("_cards", []):
            name = c.get("CardName", "")
            count = c.get("Count", 1)
            if isinstance(count, str):
                count = int(count) if count.isdigit() else 1
            if name:
                cards_in_deck.append({"name": name, "count": count})

        cards_drawn = []
        for c in p.get("cardsDrawn", []):
            name = c.get("CardName", "")
            count = c.get("Count", 1)
            if isinstance(count, str):
                count = int(count) if count.isdigit() else 1
            if name:
                cards_drawn.append({"name": name, "count": count})

        cards_played = []
        for c in p.get("cardsPlayed", []):
            name = c.get("CardName", "")
            count = c.get("Count", 1)
            if isinstance(count, str):
                count = int(count) if count.isdigit() else 1
            if name:
                cards_played.append({"name": name, "count": count})

        clean_players.append({
            "name": p.get("name", "Unknown"),
            "winner": winner,
            "commander": commander,
            "deck_name": decklist.get("_name", ""),
            "turns": turns,
            "actions": actions,
            "cards_in_deck": cards_in_deck,
            "cards_drawn": cards_drawn,
            "cards_played": cards_played,
        })

    # Compute duration in minutes
    duration = None
    if dt_start and dt_end:
        diff = (dt_end - dt_start).total_seconds()
        if diff > 0:
            duration = round(diff / 60, 1)

    return {
        "game_id": game_id,
        "datetime": dt_end.isoformat() if dt_end else None,
        "datetime_started": dt_start.isoformat() if dt_start else None,
        "duration_minutes": duration,
        "map": raw_item.get("map", ""),
        "format": raw_item.get("format", ""),
        "first_player": first_player,
        "players": clean_players,
    }


# ─── Reference Data (CSVs) ──────────────────────────────────────

def load_cards_csv():
    """Load card definitions from intern's CSV."""
    cards = []
    if not CARDS_CSV.exists():
        print(f"  Warning: {CARDS_CSV} not found, skipping card definitions")
        return cards

    with open(CARDS_CSV, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = row.get("Name", "").strip()
            if not name:
                continue

            patron = row.get("Patron", "Neutral").strip()
            cost = row.get("Cost", "")
            attack = row.get("Attack", "")
            speed = row.get("Speed", "")
            health = row.get("Health", "")

            # Build card art filename: "Card Name" → "Card-Name.png"
            art_slug = name.replace(" ", "-").replace(",", "").replace("'", "")
            art_file = f"{art_slug}.png"
            has_art = (CARD_SCREENSHOTS_DIR / art_file).exists() if CARD_SCREENSHOTS_DIR.exists() else False

            cards.append({
                "name": name,
                "type": row.get("Type", "").strip(),
                "text": row.get("TextBox", "").strip(),
                "subtype": row.get("Subtype", "").strip() if row.get("Subtype", "").strip() != "None" else "",
                "cost": int(cost) if cost.isdigit() else None,
                "attack": int(attack) if attack.isdigit() else None,
                "speed": int(speed) if speed.isdigit() else None,
                "health": int(health) if health.isdigit() else None,
                "legendary": row.get("Legendary", "").strip().lower() == "true",
                "faction": PATRON_MAP.get(patron, "neutral"),
                "art": f"CardScreenshots/{art_file}" if has_art else None,
            })

    print(f"  Loaded {len(cards)} cards from CSV")
    return cards


def load_commanders_csv():
    """Load commander definitions from intern's CSV."""
    commanders = []
    if not COMMANDERS_CSV.exists():
        print(f"  Warning: {COMMANDERS_CSV} not found, skipping commander definitions")
        return commanders

    with open(COMMANDERS_CSV, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = normalize_commander(row.get("Name", "").strip())
            if not name:
                continue

            patron = row.get("Patron", "Neutral").strip()

            # Commander artwork slug
            art_slug = name.lower().replace(" ", "-").replace(",", "").replace("'", "")
            art_file = f"{art_slug}.jpg"
            has_art = (ASSETS_DIR / art_file).exists() if ASSETS_DIR.exists() else False

            commanders.append({
                "name": name,
                "text": row.get("TextBox", "").strip(),
                "subtype": row.get("Subtype", "").strip() if row.get("Subtype", "").strip() != "None" else "",
                "dominion": int(row.get("Dominion", 0) or 0),
                "intellect": int(row.get("Intellect", 0) or 0),
                "speed": int(row.get("Speed", 0) or 0),
                "health": int(row.get("Health", 0) or 0),
                "faction": PATRON_MAP.get(patron, "neutral"),
                "art": f"assets/commanders/{art_file}" if has_art else None,
            })

    print(f"  Loaded {len(commanders)} commanders from CSV")
    return commanders


# ─── Aggregation ─────────────────────────────────────────────────

def aggregate_commander_stats(games):
    """Compute per-commander winrate, matches, popularity."""
    stats = defaultdict(lambda: {"matches": 0, "wins": 0, "faction": ""})

    for game in games:
        for p in game["players"]:
            cmd = p["commander"]
            if not cmd:
                continue
            stats[cmd]["matches"] += 1
            stats[cmd]["faction"] = stats[cmd]["faction"] or ""
            if p["winner"]:
                stats[cmd]["wins"] += 1

    # Enrich with faction from commanders CSV
    return stats


def aggregate_matchups(games):
    """Compute commander-vs-commander winrate matrix."""
    # matchups[cmd_a][cmd_b] = {"wins": N, "losses": N}
    matchups = defaultdict(lambda: defaultdict(lambda: {"wins": 0, "losses": 0}))

    for game in games:
        if len(game["players"]) != 2:
            continue
        p1, p2 = game["players"][0], game["players"][1]
        c1, c2 = p1["commander"], p2["commander"]
        if not c1 or not c2:
            continue

        if p1["winner"]:
            matchups[c1][c2]["wins"] += 1
            matchups[c2][c1]["losses"] += 1
        elif p2["winner"]:
            matchups[c2][c1]["wins"] += 1
            matchups[c1][c2]["losses"] += 1

    return matchups


def aggregate_card_stats(games):
    """Compute per-card play rate, drawn rate, deck inclusion rate, and winrates."""
    total_games = len(games)
    if total_games == 0:
        return []

    # Track per card: deck count, drawn count, played count, wins for each
    card_data = defaultdict(lambda: {
        "deck_count": 0, "deck_wins": 0,
        "drawn_count": 0, "drawn_wins": 0,
        "played_count": 0, "played_wins": 0,
    })

    for game in games:
        for p in game["players"]:
            won = p["winner"]

            # Cards in deck
            for c in p["cards_in_deck"]:
                card_data[c["name"]]["deck_count"] += 1
                if won:
                    card_data[c["name"]]["deck_wins"] += 1

            # Cards drawn
            for c in p["cards_drawn"]:
                card_data[c["name"]]["drawn_count"] += 1
                if won:
                    card_data[c["name"]]["drawn_wins"] += 1

            # Cards played
            for c in p["cards_played"]:
                card_data[c["name"]]["played_count"] += 1
                if won:
                    card_data[c["name"]]["played_wins"] += 1

    total_player_games = total_games * 2  # Each game has 2 players
    return card_data, total_player_games


def aggregate_player_stats(games):
    """Compute per-player leaderboard."""
    stats = defaultdict(lambda: {"games": 0, "wins": 0})

    for game in games:
        for p in game["players"]:
            name = p["name"]
            stats[name]["games"] += 1
            if p["winner"]:
                stats[name]["wins"] += 1

    return stats


def aggregate_trends(games):
    """Compute weekly faction popularity and commander trends."""
    # Group games by week
    weekly = defaultdict(lambda: defaultdict(int))
    weekly_total = defaultdict(int)

    for game in games:
        dt_str = game.get("datetime")
        if not dt_str:
            continue
        try:
            dt = datetime.fromisoformat(dt_str)
            # Week key: YYYY-WNN
            week = dt.strftime("%Y-W%W")
        except ValueError:
            continue

        for p in game["players"]:
            cmd = p["commander"]
            if not cmd:
                continue
            weekly[week][cmd] += 1
            weekly_total[week] += 1

    return weekly, weekly_total


# ─── JSON Writers ────────────────────────────────────────────────

def write_json(filename, data):
    """Write data to a JSON file in the data directory."""
    path = DATA_DIR / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2, default=str)
    print(f"  Wrote {path.name}")


def build_and_write_all(games, cards_csv, commanders_csv):
    """Run all aggregations and write JSON files."""

    # ── metadata.json ──
    unique_players = set()
    for g in games:
        for p in g["players"]:
            unique_players.add(p["name"])

    write_json("metadata.json", {
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "total_matches": len(games),
        "total_players": len(unique_players),
        "data_version": "1.0.0",
    })

    # ── cards.json (from CSV) ──
    write_json("cards.json", cards_csv)

    # ── commanders.json (from CSV) ──
    write_json("commanders.json", commanders_csv)

    # ── commander_stats.json ──
    cmd_stats_raw = aggregate_commander_stats(games)

    # Build faction lookup from CSV
    faction_lookup = {}
    for c in commanders_csv:
        faction_lookup[c["name"]] = c["faction"]

    cmd_stats = []
    for name, data in sorted(cmd_stats_raw.items(), key=lambda x: x[1]["matches"], reverse=True):
        winrate = data["wins"] / data["matches"] if data["matches"] > 0 else 0
        cmd_stats.append({
            "name": name,
            "faction": faction_lookup.get(name, "neutral"),
            "matches": data["matches"],
            "wins": data["wins"],
            "winrate": round(winrate, 4),
        })

    write_json("commander_stats.json", cmd_stats)

    # ── matchups.json ──
    matchup_raw = aggregate_matchups(games)
    # Convert to serializable format
    matchup_list = []
    all_commanders = sorted(set(
        cmd for cmd in matchup_raw.keys()
    ))
    for c1 in all_commanders:
        for c2 in all_commanders:
            if c1 == c2:
                continue
            data = matchup_raw[c1][c2]
            total = data["wins"] + data["losses"]
            if total == 0:
                continue
            matchup_list.append({
                "commander": c1,
                "opponent": c2,
                "wins": data["wins"],
                "losses": data["losses"],
                "total": total,
                "winrate": round(data["wins"] / total, 4) if total > 0 else 0,
            })

    write_json("matchups.json", {
        "commanders": all_commanders,
        "matchups": matchup_list,
    })

    # ── card_stats.json ──
    card_data, total_player_games = aggregate_card_stats(games)

    # Build card info lookup from CSV
    card_info = {}
    for c in cards_csv:
        card_info[c["name"]] = {"faction": c["faction"], "type": c["type"]}

    card_stats = []
    for name, data in sorted(card_data.items(), key=lambda x: x[1]["deck_count"], reverse=True):
        deck_wr = data["deck_wins"] / data["deck_count"] if data["deck_count"] > 0 else 0
        drawn_wr = data["drawn_wins"] / data["drawn_count"] if data["drawn_count"] > 0 else 0
        played_wr = data["played_wins"] / data["played_count"] if data["played_count"] > 0 else 0

        info = card_info.get(name, {"faction": "neutral", "type": ""})

        card_stats.append({
            "name": name,
            "faction": info["faction"],
            "type": info["type"],
            "deck_count": data["deck_count"],
            "deck_rate": round(data["deck_count"] / total_player_games, 4),
            "deck_winrate": round(deck_wr, 4),
            "drawn_count": data["drawn_count"],
            "drawn_rate": round(data["drawn_count"] / total_player_games, 4),
            "drawn_winrate": round(drawn_wr, 4),
            "played_count": data["played_count"],
            "played_rate": round(data["played_count"] / total_player_games, 4),
            "played_winrate": round(played_wr, 4),
        })

    write_json("card_stats.json", card_stats)

    # ── players.json ──
    player_raw = aggregate_player_stats(games)
    player_stats = []
    for name, data in sorted(player_raw.items(), key=lambda x: x[1]["games"], reverse=True):
        winrate = data["wins"] / data["games"] if data["games"] > 0 else 0
        player_stats.append({
            "name": name,
            "games": data["games"],
            "wins": data["wins"],
            "winrate": round(winrate, 4),
        })

    write_json("players.json", player_stats)

    # ── trends.json ──
    weekly, weekly_total = aggregate_trends(games)

    # Get all factions from commanders in the data
    cmd_faction = {}
    for c in commanders_csv:
        cmd_faction[c["name"]] = c["faction"]

    # Aggregate by faction per week
    sorted_weeks = sorted(weekly.keys())
    faction_weekly = defaultdict(list)
    dates = []

    for week in sorted_weeks:
        total = weekly_total[week]
        if total < 4:  # Skip weeks with very few games
            continue
        dates.append(week)

        faction_counts = defaultdict(int)
        for cmd, count in weekly[week].items():
            faction = cmd_faction.get(cmd, "neutral")
            faction_counts[faction] += count

        for faction in ["skaal", "grenalia", "lucia", "neutral", "shadis", "archaeon"]:
            pct = round((faction_counts[faction] / total) * 100, 1) if total > 0 else 0
            faction_weekly[faction].append(pct)

    write_json("trends.json", {
        "dates": dates,
        "factions": dict(faction_weekly),
    })


# ─── Cache Management ────────────────────────────────────────────

def load_cache():
    """Load previously processed games from cache."""
    if not RAW_CACHE.exists():
        return [], set()

    try:
        with open(RAW_CACHE, "r") as f:
            cached = json.load(f)
        game_ids = {g["game_id"] for g in cached}
        print(f"  Loaded {len(cached)} cached games")
        return cached, game_ids
    except (json.JSONDecodeError, KeyError):
        return [], set()


def save_cache(games):
    """Save processed games to cache for incremental fetching."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(RAW_CACHE, "w") as f:
        json.dump(games, f, separators=(",", ":"))
    print(f"  Cached {len(games)} games to {RAW_CACHE.name}")


# ─── Main ────────────────────────────────────────────────────────

def main():
    print("Atlas Conquest Data Pipeline")
    print("=" * 50)

    # Step 1: Load cache
    print("\n[1/6] Loading cache...")
    cached_games, cached_ids = load_cache()

    # Step 2: Scan DynamoDB for new games
    print("\n[2/6] Scanning DynamoDB...")
    table = get_dynamo_table()
    raw_items = scan_all_games(table, cached_ids)
    print(f"  Found {len(raw_items)} new items from DynamoDB")

    # Step 3: Clean new games
    print("\n[3/6] Cleaning data...")
    new_games = []
    skipped = 0
    for item in raw_items:
        cleaned = clean_game(item)
        if cleaned:
            new_games.append(cleaned)
        else:
            skipped += 1
    print(f"  Cleaned {len(new_games)} new games, skipped {skipped}")

    # Merge with cache
    all_games = cached_games + new_games
    print(f"  Total games: {len(all_games)}")

    # Step 4: Save updated cache
    print("\n[4/6] Saving cache...")
    save_cache(all_games)

    # Step 5: Load reference data
    print("\n[5/6] Loading reference data...")
    cards_csv = load_cards_csv()
    commanders_csv = load_commanders_csv()

    # Step 6: Aggregate and write JSONs
    print("\n[6/6] Aggregating and writing data files...")
    build_and_write_all(all_games, cards_csv, commanders_csv)

    print(f"\nDone! {len(all_games)} games processed → site/data/")


if __name__ == "__main__":
    main()
