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
import subprocess
import sys
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

# ─── Paths ──────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
DATA_DIR = PROJECT_DIR / "site" / "data"
ASSETS_DIR = PROJECT_DIR / "site" / "assets" / "commanders"
CARD_ASSETS_DIR = PROJECT_DIR / "site" / "assets" / "cards"
ARTWORK_DIR = PROJECT_DIR / "Artwork"
CARD_SCREENSHOTS_DIR = PROJECT_DIR / "CardScreenshots"
RAW_CACHE = DATA_DIR / "raw_games.json"

# Reference CSVs — project root is the source of truth
CARDS_CSV = PROJECT_DIR / "StandardFormatCards.csv"
COMMANDERS_CSV = PROJECT_DIR / "StandardFormatCommanders.csv"

# ─── Constants ──────────────────────────────────────────────────

DYNAMO_TABLE = "games"
DYNAMO_REGION = os.environ.get("AWS_DEFAULT_REGION", "us-east-2")

# Commander name normalization map (old DB names → canonical)
COMMANDER_RENAMES = {
    "Elber, Jungle Emmisary": "Elber, Jungle Emissary",
    "Layna, Soulcatcher": "Soultaker Viessa",
    "Lyre, Tactician of the Order": "Elyse of the Order",
}

# Card name normalization map (old DB names → canonical)
CARD_RENAMES = {
    # Add any card renames here as the game evolves
    # "Old Card Name": "New Card Name",
}

# Minimum turns per player to count as a real game
MIN_TURNS = 2

# Time periods for aggregation: key → days (None = all time)
PERIODS = {"all": None, "6m": 180, "3m": 90, "1m": 30}

# Patron (faction) color mapping
PATRON_MAP = {
    "Skaal": "skaal",
    "Grenalia": "grenalia",
    "Lucia": "lucia",
    "Neutral": "neutral",
    "Shadis": "shadis",
    "Archaeon": "archaeon",
}


# ─── Thumbnail Generation ──────────────────────────────────────

def _resize_image(source, target, max_width, quality=85):
    """Resize a source image to max_width, save as JPEG. Returns True on success."""
    try:
        from PIL import Image
        img = Image.open(source)
        if img.width > max_width:
            ratio = max_width / img.width
            new_size = (max_width, int(img.height * ratio))
            img = img.resize(new_size, Image.LANCZOS)
        img = img.convert("RGB")
        img.save(target, "JPEG", quality=quality)
        return True
    except ImportError:
        try:
            subprocess.run([
                "sips", "-s", "format", "jpeg",
                "-Z", str(max_width), str(source),
                "--out", str(target),
            ], check=True, capture_output=True)
            return True
        except (FileNotFoundError, subprocess.CalledProcessError):
            return False


def _art_slug(name):
    """Convert a name like 'Elber, Jungle Emissary' to 'elber-jungle-emissary'."""
    return name.lower().replace(" ", "-").replace(",", "").replace("'", "")


def generate_thumbnails():
    """Generate optimized thumbnails for commanders (from Artwork/) and cards (from CardScreenshots/).

    Commander art:  Artwork/*.png → site/assets/commanders/*.jpg  (400px wide)
    Card previews:  CardScreenshots/*.png → site/assets/cards/*.jpg  (600px wide)

    Only regenerates if source is newer than target or target is missing.
    """
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    CARD_ASSETS_DIR.mkdir(parents=True, exist_ok=True)

    cmd_count = 0
    card_count = 0

    # Commander thumbnails from Artwork/
    if ARTWORK_DIR.exists():
        for source in ARTWORK_DIR.iterdir():
            if source.suffix.lower() not in (".png", ".jpg", ".jpeg"):
                continue
            if source.stem.lower() in ("default", "default-loading", "desktop"):
                continue
            target = ASSETS_DIR / f"{source.stem.lower()}.jpg"
            if target.exists() and target.stat().st_mtime >= source.stat().st_mtime:
                continue
            if _resize_image(source, target, 400):
                cmd_count += 1

    # Card thumbnails from CardScreenshots/
    if CARD_SCREENSHOTS_DIR.exists():
        for source in CARD_SCREENSHOTS_DIR.iterdir():
            if source.suffix.lower() not in (".png", ".jpg", ".jpeg"):
                continue
            slug = source.stem.lower()
            target = CARD_ASSETS_DIR / f"{slug}.jpg"
            if target.exists() and target.stat().st_mtime >= source.stat().st_mtime:
                continue
            if _resize_image(source, target, 600):
                card_count += 1

    print(f"  Thumbnails: {cmd_count} commander + {card_count} card images generated")
    if cmd_count == 0 and card_count == 0:
        print("  (all thumbnails up to date)")


# ─── Time Period Filtering ─────────────────────────────────────

def filter_games_by_period(games, days):
    """Filter games to those within the last N days. None = all games."""
    if days is None:
        return games
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    result = []
    for g in games:
        dt_str = g.get("datetime")
        if not dt_str:
            continue
        try:
            dt = datetime.fromisoformat(dt_str)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            if dt >= cutoff:
                result.append(g)
        except ValueError:
            continue
    return result


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


def normalize_card(name):
    """Apply card name fixes."""
    if not name:
        return name
    return CARD_RENAMES.get(name, name)


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
            name = normalize_card(c.get("CardName", ""))
            count = c.get("Count", 1)
            if isinstance(count, str):
                count = int(count) if count.isdigit() else 1
            if name:
                cards_in_deck.append({"name": name, "count": count})

        cards_drawn = []
        for c in p.get("cardsDrawn", []):
            name = normalize_card(c.get("CardName", ""))
            count = c.get("Count", 1)
            if isinstance(count, str):
                count = int(count) if count.isdigit() else 1
            if name:
                cards_drawn.append({"name": name, "count": count})

        cards_played = []
        for c in p.get("cardsPlayed", []):
            name = normalize_card(c.get("CardName", ""))
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


def aggregate_game_distributions(games):
    """Compute pre-bucketed histograms for game duration, turns, and actions."""
    # Duration: 2-min buckets, 0-50
    dur_w, dur_max = 2, 50
    dur_labels = [f"{i}-{i+dur_w}" for i in range(0, dur_max, dur_w)]
    dur_counts = [0] * len(dur_labels)
    dur_total = 0

    # Turns: 2-turn buckets, 0-42
    trn_w, trn_max = 2, 42
    trn_labels = [f"{i}-{i+trn_w}" for i in range(0, trn_max, trn_w)]
    trn_counts = [0] * len(trn_labels)
    trn_total = 0

    # Actions: 20-action buckets, 0-240
    act_w, act_max = 20, 240
    act_labels = [f"{i}-{i+act_w}" for i in range(0, act_max, act_w)]
    act_counts = [0] * len(act_labels)
    act_total = 0

    for game in games:
        dur = game.get("duration_minutes")
        if dur is not None and dur >= 0:
            bucket = min(int(dur // dur_w), len(dur_labels) - 1)
            dur_counts[bucket] += 1
            dur_total += 1

        total_turns = sum(p.get("turns", 0) for p in game["players"])
        bucket = min(int(total_turns // trn_w), len(trn_labels) - 1)
        trn_counts[bucket] += 1
        trn_total += 1

        total_actions = sum(p.get("actions", 0) for p in game["players"])
        bucket = min(int(total_actions // act_w), len(act_labels) - 1)
        act_counts[bucket] += 1
        act_total += 1

    return {
        "duration": {"labels": dur_labels, "counts": dur_counts, "total": dur_total},
        "turns": {"labels": trn_labels, "counts": trn_counts, "total": trn_total},
        "actions": {"labels": act_labels, "counts": act_counts, "total": act_total},
    }


def aggregate_deck_composition(games, card_info, cmd_faction):
    """Compute per-commander deck composition: avg cost, cost histogram,
    minion/spell ratio, patron/neutral/other ratio. Includes win/loss splits."""
    COST_LABELS = [str(i) for i in range(12)] + ["12+"]
    NUM_BUCKETS = len(COST_LABELS)

    cmd_data = defaultdict(lambda: {"faction": "", "all": [], "win": [], "loss": []})

    for game in games:
        for p in game["players"]:
            cmd = p.get("commander")
            if not cmd:
                continue
            commander_faction = cmd_faction.get(cmd, "neutral")
            cmd_data[cmd]["faction"] = commander_faction

            total_cost_weighted = 0
            total_card_count = 0
            cost_curve = [0] * NUM_BUCKETS
            minion_count = 0
            spell_count = 0
            patron_count = 0
            neutral_count = 0
            other_count = 0

            for card in p.get("cards_in_deck", []):
                name = card["name"]
                count = card.get("count", 1)
                info = card_info.get(name, {})

                card_cost = info.get("cost")
                card_type = info.get("type", "")
                card_faction = info.get("faction", "neutral")

                if card_cost is not None:
                    total_cost_weighted += card_cost * count
                    bucket = min(card_cost, 12)
                    cost_curve[bucket] += count
                total_card_count += count

                if card_type == "Minion":
                    minion_count += count
                elif card_type == "Spell":
                    spell_count += count

                if card_faction == commander_faction:
                    patron_count += count
                elif card_faction == "neutral":
                    neutral_count += count
                else:
                    other_count += count

            avg_cost = total_cost_weighted / total_card_count if total_card_count > 0 else 0
            deck_stats = {
                "avg_cost": avg_cost,
                "cost_curve": cost_curve,
                "minion_count": minion_count,
                "spell_count": spell_count,
                "patron_count": patron_count,
                "neutral_count": neutral_count,
                "other_count": other_count,
            }

            cmd_data[cmd]["all"].append(deck_stats)
            if p.get("winner"):
                cmd_data[cmd]["win"].append(deck_stats)
            else:
                cmd_data[cmd]["loss"].append(deck_stats)

    def avg_field(decks, field):
        if not decks:
            return 0
        return round(sum(d[field] for d in decks) / len(decks), 2)

    def avg_curve(decks):
        if not decks:
            return [0] * NUM_BUCKETS
        n = len(decks)
        return [round(sum(d["cost_curve"][i] for d in decks) / n, 2) for i in range(NUM_BUCKETS)]

    result = {}
    for cmd, data in cmd_data.items():
        a, w, l = data["all"], data["win"], data["loss"]
        result[cmd] = {
            "faction": data["faction"],
            "deck_count": len(a),
            "avg_cost": avg_field(a, "avg_cost"),
            "cost_histogram": {
                "labels": COST_LABELS,
                "all_decks": avg_curve(a),
                "winning_decks": avg_curve(w),
                "losing_decks": avg_curve(l),
            },
            "avg_minion_count": avg_field(a, "minion_count"),
            "avg_spell_count": avg_field(a, "spell_count"),
            "avg_patron_cards": avg_field(a, "patron_count"),
            "avg_neutral_cards": avg_field(a, "neutral_count"),
            "avg_other_cards": avg_field(a, "other_count"),
            "win_avg_minion_count": avg_field(w, "minion_count"),
            "win_avg_spell_count": avg_field(w, "spell_count"),
            "loss_avg_minion_count": avg_field(l, "minion_count"),
            "loss_avg_spell_count": avg_field(l, "spell_count"),
        }

    return result


def build_and_write_all(games, cards_csv, commanders_csv):
    """Run all aggregations for each time period and write JSON files."""

    # Build lookups (period-independent)
    faction_lookup = {c["name"]: c["faction"] for c in commanders_csv}
    card_info = {c["name"]: {"faction": c["faction"], "type": c["type"], "cost": c.get("cost")} for c in cards_csv}
    cmd_faction = {c["name"]: c["faction"] for c in commanders_csv}

    # Reference data (no time filtering)
    write_json("cards.json", cards_csv)
    write_json("commanders.json", commanders_csv)

    # Per-period aggregation
    metadata_by_period = {}
    cmd_stats_by_period = {}
    matchups_by_period = {}
    card_stats_by_period = {}
    trends_by_period = {}
    distributions_by_period = {}
    deck_comp_by_period = {}

    for period_key, days in PERIODS.items():
        period_games = filter_games_by_period(games, days)
        print(f"  Period '{period_key}': {len(period_games)} games")

        # ── metadata ──
        unique_players = set()
        for g in period_games:
            for p in g["players"]:
                unique_players.add(p["name"])

        metadata_by_period[period_key] = {
            "last_updated": datetime.now(timezone.utc).isoformat(),
            "total_matches": len(period_games),
            "total_players": len(unique_players),
            "data_version": "2.0.0",
        }

        # ── commander_stats ──
        cmd_stats_raw = aggregate_commander_stats(period_games)
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
        cmd_stats_by_period[period_key] = cmd_stats

        # ── matchups ──
        matchup_raw = aggregate_matchups(period_games)
        all_commanders = sorted(set(cmd for cmd in matchup_raw.keys()))
        matchup_list = []
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
        matchups_by_period[period_key] = {
            "commanders": all_commanders,
            "matchups": matchup_list,
        }

        # ── card_stats ──
        result = aggregate_card_stats(period_games)
        if isinstance(result, tuple):
            card_data, total_player_games = result
        else:
            card_data, total_player_games = {}, 0

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
                "deck_rate": round(data["deck_count"] / total_player_games, 4) if total_player_games > 0 else 0,
                "deck_winrate": round(deck_wr, 4),
                "drawn_count": data["drawn_count"],
                "drawn_rate": round(data["drawn_count"] / total_player_games, 4) if total_player_games > 0 else 0,
                "drawn_winrate": round(drawn_wr, 4),
                "played_count": data["played_count"],
                "played_rate": round(data["played_count"] / total_player_games, 4) if total_player_games > 0 else 0,
                "played_winrate": round(played_wr, 4),
            })
        card_stats_by_period[period_key] = card_stats

        # ── trends ──
        weekly, weekly_total = aggregate_trends(period_games)
        sorted_weeks = sorted(weekly.keys())
        faction_weekly = defaultdict(list)
        dates = []
        for week in sorted_weeks:
            total = weekly_total[week]
            if total < 4:
                continue
            dates.append(week)
            faction_counts = defaultdict(int)
            for cmd, count in weekly[week].items():
                faction = cmd_faction.get(cmd, "neutral")
                faction_counts[faction] += count
            for faction in ["skaal", "grenalia", "lucia", "neutral", "shadis", "archaeon"]:
                pct = round((faction_counts[faction] / total) * 100, 1) if total > 0 else 0
                faction_weekly[faction].append(pct)
        trends_by_period[period_key] = {
            "dates": dates,
            "factions": dict(faction_weekly),
        }

        # ── game distributions ──
        distributions_by_period[period_key] = aggregate_game_distributions(period_games)

        # ── deck composition ──
        deck_comp_by_period[period_key] = aggregate_deck_composition(period_games, card_info, cmd_faction)

    # Write all period-nested files
    write_json("metadata.json", metadata_by_period)
    write_json("commander_stats.json", cmd_stats_by_period)
    write_json("matchups.json", matchups_by_period)
    write_json("card_stats.json", card_stats_by_period)
    write_json("trends.json", trends_by_period)
    write_json("game_distributions.json", distributions_by_period)
    write_json("deck_composition.json", deck_comp_by_period)


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

    # Step 5: Generate optimized thumbnails from Artwork/ and CardScreenshots/
    print("\n[5/7] Generating thumbnails...")
    generate_thumbnails()

    print("\n[6/7] Loading reference data...")
    cards_csv = load_cards_csv()
    commanders_csv = load_commanders_csv()

    # Step 7: Aggregate and write JSONs (per time period)
    print("\n[7/7] Aggregating and writing data files...")
    build_and_write_all(all_games, cards_csv, commanders_csv)

    print(f"\nDone! {len(all_games)} games processed → site/data/")


if __name__ == "__main__":
    main()
