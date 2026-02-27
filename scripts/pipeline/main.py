"""Pipeline orchestration — build_and_write_all and main entry point."""

from collections import defaultdict
from datetime import datetime, timezone

from pipeline.constants import PERIODS, MAPS
from pipeline.cleaning import clean_game
from pipeline.filtering import filter_games_by_period, filter_games_by_map
from pipeline.aggregation import (
    aggregate_commander_stats,
    aggregate_matchups,
    aggregate_matchup_details,
    aggregate_card_stats,
    aggregate_trends,
    aggregate_first_turn,
    aggregate_commander_trends,
    aggregate_duration_winrates,
    aggregate_action_winrates,
    aggregate_turn_winrates,
    aggregate_commander_card_stats,
    aggregate_game_distributions,
    aggregate_deck_composition,
    aggregate_commander_winrate_trends,
    aggregate_mulligan_stats,
    aggregate_commander_mulligan_stats,
)
from pipeline.io_helpers import (
    load_cache, save_cache, write_json,
    get_dynamo_table, scan_all_games,
    generate_thumbnails,
    load_cards_csv, load_commanders_csv,
)


def build_and_write_all(games, cards_csv, commanders_csv):
    """Run all aggregations for each time period × map and write JSON files.

    Output nesting: data[period][map] for all stats files.
    """

    # Build lookups (period-independent)
    faction_lookup = {c["name"]: c["faction"] for c in commanders_csv}
    card_info = {c["name"]: {"faction": c["faction"], "type": c["type"], "cost": c.get("cost")} for c in cards_csv}
    cmd_faction = {c["name"]: c["faction"] for c in commanders_csv}
    intellect_lookup = {c["name"]: c["intellect"] for c in commanders_csv}

    # Reference data (no time/map filtering)
    write_json("cards.json", cards_csv)
    write_json("commanders.json", commanders_csv)

    # Per-period × map aggregation
    out = {
        "metadata": {},
        "commander_stats": {},
        "matchups": {},
        "matchup_details": {},
        "card_stats": {},
        "trends": {},
        "distributions": {},
        "deck_comp": {},
        "first_turn": {},
        "cmd_trends": {},
        "duration_wr": {},
        "action_wr": {},
        "turn_wr": {},
        "cmd_card_stats": {},
        "cmd_wr_trends": {},
        "mulligan_stats": {},
        "cmd_mulligan_stats": {},
    }

    for period_key, days in PERIODS.items():
        period_games = filter_games_by_period(games, days)
        print(f"  Period '{period_key}': {len(period_games)} games")

        for key in out:
            out[key][period_key] = {}

        for map_name in MAPS:
            map_games = filter_games_by_map(period_games, map_name)
            n = len(map_games)
            print(f"    Map '{map_name}': {n} games")

            # ── metadata ──
            unique_players = set()
            for g in map_games:
                for p in g["players"]:
                    unique_players.add(p["name"])

            out["metadata"][period_key][map_name] = {
                "last_updated": datetime.now(timezone.utc).isoformat(),
                "total_matches": n,
                "total_players": len(unique_players),
                "data_version": "3.0.0",
            }

            # ── commander_stats ──
            cmd_stats_raw = aggregate_commander_stats(map_games)
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
            out["commander_stats"][period_key][map_name] = cmd_stats

            # ── matchups ──
            matchup_raw = aggregate_matchups(map_games)
            all_commanders = sorted(set(cmd for cmd in matchup_raw.keys()))
            matchup_list = []
            for c1 in all_commanders:
                for c2 in all_commanders:
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
            out["matchups"][period_key][map_name] = {
                "commanders": all_commanders,
                "matchups": matchup_list,
            }

            # ── matchup details ──
            out["matchup_details"][period_key][map_name] = aggregate_matchup_details(map_games)

            # ── card_stats ──
            result = aggregate_card_stats(map_games)
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
                    "avg_copies": round(data["total_copies"] / data["deck_count"], 2) if data["deck_count"] > 0 else 0,
                    "drawn_instances": data["drawn_instances"],
                    "played_instances": data["played_instances"],
                })
            out["card_stats"][period_key][map_name] = card_stats

            # ── trends ──
            weekly, weekly_total = aggregate_trends(map_games)
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
            out["trends"][period_key][map_name] = {
                "dates": dates,
                "factions": dict(faction_weekly),
            }

            # ── game distributions ──
            out["distributions"][period_key][map_name] = aggregate_game_distributions(map_games)

            # ── deck composition ──
            out["deck_comp"][period_key][map_name] = aggregate_deck_composition(map_games, card_info, cmd_faction)

            # ── first-turn advantage ──
            out["first_turn"][period_key][map_name] = aggregate_first_turn(map_games)

            # ── commander popularity trends ──
            out["cmd_trends"][period_key][map_name] = aggregate_commander_trends(map_games)

            # ── commander winrate trends ──
            out["cmd_wr_trends"][period_key][map_name] = aggregate_commander_winrate_trends(map_games)

            # ── winrate by duration ──
            out["duration_wr"][period_key][map_name] = aggregate_duration_winrates(map_games)

            # ── winrate by actions ──
            out["action_wr"][period_key][map_name] = aggregate_action_winrates(map_games)

            # ── winrate by turns ──
            out["turn_wr"][period_key][map_name] = aggregate_turn_winrates(map_games)

            # ── per-commander card stats ──
            out["cmd_card_stats"][period_key][map_name] = aggregate_commander_card_stats(map_games)

            # ── mulligan stats ──
            mull_data, mull_player_games = aggregate_mulligan_stats(map_games, intellect_lookup)
            mulligan_list = []
            for name, data in sorted(mull_data.items(),
                                     key=lambda x: x[1]["kept_count"] + x[1]["returned_count"],
                                     reverse=True):
                total_seen = data["kept_count"] + data["returned_count"]
                if total_seen == 0:
                    continue
                keep_wr = round(data["kept_wins"] / data["kept_count"], 4) if data["kept_count"] > 0 else None
                return_wr = round(data["returned_wins"] / data["returned_count"], 4) if data["returned_count"] > 0 else None
                wr_delta = None
                if keep_wr is not None and return_wr is not None:
                    wr_delta = round(keep_wr - return_wr, 4)
                keep_rate = round(data["kept_count"] / total_seen, 4)
                norm_delta = None
                if data["appearances"] > 0:
                    expected_rate = data["expected_sum"] / data["appearances"]
                    norm_delta = round(keep_rate - expected_rate, 4)
                mulligan_list.append({
                    "name": name,
                    "kept_count": data["kept_count"],
                    "returned_count": data["returned_count"],
                    "total_seen": total_seen,
                    "keep_rate": keep_rate,
                    "norm_keep_delta": norm_delta,
                    "keep_winrate": keep_wr,
                    "return_winrate": return_wr,
                    "winrate_delta": wr_delta,
                    "mulligan_games": mull_player_games,
                })
            out["mulligan_stats"][period_key][map_name] = mulligan_list

            # ── per-commander mulligan stats ──
            out["cmd_mulligan_stats"][period_key][map_name] = aggregate_commander_mulligan_stats(map_games, intellect_lookup)

    # Write all period×map-nested files
    write_json("metadata.json", out["metadata"])
    write_json("commander_stats.json", out["commander_stats"])
    write_json("matchups.json", out["matchups"])
    write_json("matchup_details.json", out["matchup_details"], compact=True)
    write_json("card_stats.json", out["card_stats"])
    write_json("trends.json", out["trends"])
    write_json("game_distributions.json", out["distributions"])
    write_json("deck_composition.json", out["deck_comp"])
    write_json("first_turn.json", out["first_turn"])
    write_json("commander_trends.json", out["cmd_trends"])
    write_json("duration_winrates.json", out["duration_wr"])
    write_json("action_winrates.json", out["action_wr"])
    write_json("turn_winrates.json", out["turn_wr"])
    write_json("commander_card_stats.json", out["cmd_card_stats"])
    write_json("commander_winrate_trends.json", out["cmd_wr_trends"])
    write_json("mulligan_stats.json", out["mulligan_stats"])
    write_json("commander_mulligan_stats.json", out["cmd_mulligan_stats"])


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Atlas Conquest Data Pipeline")
    parser.add_argument("--skip-fetch", action="store_true",
                        help="Skip DynamoDB fetch, re-aggregate from cache only")
    args = parser.parse_args()

    print("Atlas Conquest Data Pipeline")
    print("=" * 50)

    # Step 1: Load cache
    print("\n[1/6] Loading cache...")
    cached_games, cached_ids = load_cache()

    if args.skip_fetch:
        print("\n[2/6] Skipping DynamoDB fetch (--skip-fetch)")
        all_games = cached_games
        print(f"  Using {len(all_games)} cached games")
    else:
        # Step 2: Scan DynamoDB for new games
        print("\n[2/6] Scanning DynamoDB...")
        table = get_dynamo_table()
        raw_items = scan_all_games(table, cached_ids)
        print(f"  Found {len(raw_items)} new items from DynamoDB")

        # Step 3: Clean new games
        print("\n[3/6] Cleaning data...")
        new_games = []
        skip_log = []
        for item in raw_items:
            cleaned = clean_game(item, skip_log=skip_log)
            if cleaned:
                new_games.append(cleaned)
        print(f"  Cleaned {len(new_games)} new games, skipped {len(skip_log)}")
        if skip_log:
            skip_counts = defaultdict(int)
            for reason in skip_log:
                skip_counts[reason] += 1
            for reason, count in sorted(skip_counts.items(), key=lambda x: -x[1]):
                print(f"    {reason}: {count}")

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
