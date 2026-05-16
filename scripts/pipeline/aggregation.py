"""Aggregation functions — turn clean games into stats.

All functions take a list of clean game dicts and return aggregated data.
No I/O, no side effects.
"""

import math
from collections import Counter, defaultdict
from datetime import datetime
from itertools import combinations


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


def aggregate_matchup_details(games):
    """Compute per-matchup first-turn stats and top card winrates.

    For each ordered pair (commander, opponent), tracks:
    - Win/loss counts
    - First-turn advantage (games where cmd went first vs second, wins for each)
    - Per-card played and drawn winrates for each commander in the matchup

    Returns list of matchup detail records.
    """
    if not games:
        return []

    # (cmd, opp) -> tracking dict
    matchup_data = defaultdict(lambda: {
        "wins": 0, "losses": 0,
        "cmd_first_games": 0, "cmd_first_wins": 0,
        "opp_first_games": 0, "opp_first_wins": 0,
        "cmd_cards": defaultdict(lambda: {"played": 0, "played_wins": 0, "drawn": 0, "drawn_wins": 0}),
        "opp_cards": defaultdict(lambda: {"played": 0, "played_wins": 0, "drawn": 0, "drawn_wins": 0}),
    })

    for game in games:
        if len(game["players"]) != 2:
            continue
        p1, p2 = game["players"][0], game["players"][1]
        c1, c2 = p1["commander"], p2["commander"]
        if not c1 or not c2:
            continue

        p1_won = p1["winner"]
        p2_won = p2["winner"]

        # Track from c1's perspective (c1 vs c2)
        key1 = (c1, c2)
        if p1_won:
            matchup_data[key1]["wins"] += 1
        elif p2_won:
            matchup_data[key1]["losses"] += 1

        # Track from c2's perspective (c2 vs c1)
        key2 = (c2, c1)
        if p2_won:
            matchup_data[key2]["wins"] += 1
        elif p1_won:
            matchup_data[key2]["losses"] += 1

        # First-turn tracking
        fp = game.get("first_player")
        if fp in ("1", "2"):
            first_idx = int(fp) - 1
            # From c1's perspective
            if first_idx == 0:  # p1 (c1) went first
                matchup_data[key1]["cmd_first_games"] += 1
                matchup_data[key2]["opp_first_games"] += 1
                if p1_won:
                    matchup_data[key1]["cmd_first_wins"] += 1
                    matchup_data[key2]["opp_first_wins"] += 1
            else:  # p2 (c2) went first
                matchup_data[key1]["opp_first_games"] += 1
                matchup_data[key2]["cmd_first_games"] += 1
                if p2_won:
                    matchup_data[key1]["opp_first_wins"] += 1
                    matchup_data[key2]["cmd_first_wins"] += 1

        # Card tracking — p1's cards (cmd perspective for key1, opp perspective for key2)
        for c in p1["cards_played"]:
            matchup_data[key1]["cmd_cards"][c["name"]]["played"] += 1
            matchup_data[key2]["opp_cards"][c["name"]]["played"] += 1
            if p1_won:
                matchup_data[key1]["cmd_cards"][c["name"]]["played_wins"] += 1
                matchup_data[key2]["opp_cards"][c["name"]]["played_wins"] += 1
        for c in p1["cards_drawn"]:
            matchup_data[key1]["cmd_cards"][c["name"]]["drawn"] += 1
            matchup_data[key2]["opp_cards"][c["name"]]["drawn"] += 1
            if p1_won:
                matchup_data[key1]["cmd_cards"][c["name"]]["drawn_wins"] += 1
                matchup_data[key2]["opp_cards"][c["name"]]["drawn_wins"] += 1

        # Card tracking — p2's cards
        for c in p2["cards_played"]:
            matchup_data[key2]["cmd_cards"][c["name"]]["played"] += 1
            matchup_data[key1]["opp_cards"][c["name"]]["played"] += 1
            if p2_won:
                matchup_data[key2]["cmd_cards"][c["name"]]["played_wins"] += 1
                matchup_data[key1]["opp_cards"][c["name"]]["played_wins"] += 1
        for c in p2["cards_drawn"]:
            matchup_data[key2]["cmd_cards"][c["name"]]["drawn"] += 1
            matchup_data[key1]["opp_cards"][c["name"]]["drawn"] += 1
            if p2_won:
                matchup_data[key2]["cmd_cards"][c["name"]]["drawn_wins"] += 1
                matchup_data[key1]["opp_cards"][c["name"]]["drawn_wins"] += 1

    # Build output
    def top_cards(card_dict, limit=10, min_games=3):
        cards = []
        for name, d in card_dict.items():
            if d["played"] < min_games:
                continue
            cards.append({
                "name": name,
                "played": d["played"],
                "played_winrate": round(d["played_wins"] / d["played"], 4),
                "drawn": d["drawn"],
                "drawn_winrate": round(d["drawn_wins"] / d["drawn"], 4) if d["drawn"] > 0 else None,
            })
        cards.sort(key=lambda x: (-x["played_winrate"], -x["played"]))
        return cards[:limit]

    result = []
    for (cmd, opp), data in matchup_data.items():
        total = data["wins"] + data["losses"]
        if total < 1:
            continue
        result.append({
            "commander": cmd,
            "opponent": opp,
            "wins": data["wins"],
            "losses": data["losses"],
            "total": total,
            "winrate": round(data["wins"] / total, 4),
            "first_turn": {
                "cmd_first_games": data["cmd_first_games"],
                "cmd_first_wins": data["cmd_first_wins"],
                "opp_first_games": data["opp_first_games"],
                "opp_first_wins": data["opp_first_wins"],
            },
            "cmd_cards": top_cards(data["cmd_cards"]),
            "opp_cards": top_cards(data["opp_cards"]),
        })

    return result


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
        "total_copies": 0,
        "drawn_instances": 0,
        "played_instances": 0,
    })

    for game in games:
        for p in game["players"]:
            won = p["winner"]

            # Cards in deck
            for c in p["cards_in_deck"]:
                card_data[c["name"]]["deck_count"] += 1
                card_data[c["name"]]["total_copies"] += c.get("count", 1)
                if won:
                    card_data[c["name"]]["deck_wins"] += 1

            # Cards drawn
            for c in p["cards_drawn"]:
                card_data[c["name"]]["drawn_count"] += 1
                card_data[c["name"]]["drawn_instances"] += c.get("count", 1)
                if won:
                    card_data[c["name"]]["drawn_wins"] += 1

            # Cards played
            for c in p["cards_played"]:
                card_data[c["name"]]["played_count"] += 1
                card_data[c["name"]]["played_instances"] += c.get("count", 1)
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


def aggregate_first_turn(games):
    """Compute first-player advantage stats.

    Only includes games where first_player is "1" or "2" (explicit).
    Games with first_player="99" (random/unknown) are excluded.
    """
    fp_games = [g for g in games if g.get("first_player") in ("1", "2")]
    total = len(fp_games)

    if total == 0:
        return {
            "total_games": 0,
            "first_player_wins": 0,
            "first_player_winrate": None,
            "per_commander": {},
        }

    first_wins = 0
    cmd_stats = defaultdict(lambda: {
        "first_games": 0, "first_wins": 0,
        "second_games": 0, "second_wins": 0,
    })

    for game in fp_games:
        fp = game["first_player"]
        players = game["players"]
        if len(players) != 2:
            continue

        first_idx = int(fp) - 1
        if first_idx not in (0, 1):
            continue

        first_p = players[first_idx]
        second_p = players[1 - first_idx]

        if first_p["winner"]:
            first_wins += 1

        c1 = first_p["commander"]
        c2 = second_p["commander"]
        if c1:
            cmd_stats[c1]["first_games"] += 1
            if first_p["winner"]:
                cmd_stats[c1]["first_wins"] += 1
        if c2:
            cmd_stats[c2]["second_games"] += 1
            if second_p["winner"]:
                cmd_stats[c2]["second_wins"] += 1

    per_commander = {}
    for cmd, s in cmd_stats.items():
        fg, sg = s["first_games"], s["second_games"]
        per_commander[cmd] = {
            "first_games": fg,
            "first_wins": s["first_wins"],
            "first_winrate": round(s["first_wins"] / fg, 4) if fg > 0 else None,
            "second_games": sg,
            "second_wins": s["second_wins"],
            "second_winrate": round(s["second_wins"] / sg, 4) if sg > 0 else None,
        }

    return {
        "total_games": total,
        "first_player_wins": first_wins,
        "first_player_winrate": round(first_wins / total, 4) if total > 0 else None,
        "per_commander": per_commander,
    }


def aggregate_commander_trends(games):
    """Compute weekly per-commander popularity (usage %)."""
    weekly = defaultdict(lambda: defaultdict(int))
    weekly_total = defaultdict(int)

    for game in games:
        dt_str = game.get("datetime")
        if not dt_str:
            continue
        try:
            dt = datetime.fromisoformat(dt_str)
            week = dt.strftime("%Y-W%W")
        except ValueError:
            continue

        for p in game["players"]:
            cmd = p["commander"]
            if not cmd:
                continue
            weekly[week][cmd] += 1
            weekly_total[week] += 1

    sorted_weeks = sorted(weekly.keys())
    dates = []
    commanders = defaultdict(list)

    for week in sorted_weeks:
        total = weekly_total[week]
        if total < 4:
            continue
        dates.append(week)
        for cmd in set(c for w in weekly.values() for c in w):
            pct = round((weekly[week].get(cmd, 0) / total) * 100, 1) if total > 0 else 0
            commanders[cmd].append(pct)

    return {"dates": dates, "commanders": dict(commanders)}


def aggregate_commander_winrate_trends(games):
    """Compute weekly per-commander winrate, with and without mirror matches."""
    # Per-week per-commander: {cmd: {wins, total, wins_no_mirror, total_no_mirror}}
    weekly = defaultdict(lambda: defaultdict(lambda: {"w": 0, "t": 0, "w_nm": 0, "t_nm": 0}))
    weekly_total = defaultdict(int)

    for game in games:
        dt_str = game.get("datetime")
        if not dt_str:
            continue
        try:
            dt = datetime.fromisoformat(dt_str)
            week = dt.strftime("%Y-W%W")
        except ValueError:
            continue

        players = game["players"]
        if len(players) != 2:
            continue

        is_mirror = players[0]["commander"] == players[1]["commander"]
        weekly_total[week] += 1

        for p in players:
            cmd = p["commander"]
            if not cmd:
                continue
            bucket = weekly[week][cmd]
            bucket["t"] += 1
            if p.get("winner"):
                bucket["w"] += 1
            if not is_mirror:
                bucket["t_nm"] += 1
                if p.get("winner"):
                    bucket["w_nm"] += 1

    sorted_weeks = sorted(weekly.keys())
    all_cmds = set(c for w in weekly.values() for c in w)
    dates = []
    commanders = {cmd: {"winrate": [], "games": [], "winrate_no_mirror": [], "games_no_mirror": []} for cmd in all_cmds}

    for week in sorted_weeks:
        if weekly_total[week] < 4:
            continue
        dates.append(week)
        for cmd in all_cmds:
            b = weekly[week][cmd]
            wr = round((b["w"] / b["t"]) * 100, 1) if b["t"] > 0 else None
            wr_nm = round((b["w_nm"] / b["t_nm"]) * 100, 1) if b["t_nm"] > 0 else None
            commanders[cmd]["winrate"].append(wr)
            commanders[cmd]["games"].append(b["t"])
            commanders[cmd]["winrate_no_mirror"].append(wr_nm)
            commanders[cmd]["games_no_mirror"].append(b["t_nm"])

    return {"dates": dates, "commanders": commanders}


def aggregate_duration_winrates(games):
    """Compute per-commander winrate bucketed by game duration."""
    BUCKETS = ["0-10", "10-20", "20-30", "30+"]

    def get_bucket(mins):
        if mins < 10:
            return 0
        elif mins < 20:
            return 1
        elif mins < 30:
            return 2
        return 3

    # cmd -> bucket_idx -> {wins, total}
    stats = defaultdict(lambda: [{"wins": 0, "total": 0} for _ in BUCKETS])

    for game in games:
        dur = game.get("duration_minutes")
        if dur is None:
            continue
        bucket = get_bucket(dur)
        for p in game["players"]:
            cmd = p["commander"]
            if not cmd:
                continue
            stats[cmd][bucket]["total"] += 1
            if p["winner"]:
                stats[cmd][bucket]["wins"] += 1

    commanders = {}
    for cmd, buckets in stats.items():
        commanders[cmd] = [
            {
                "winrate": round(b["wins"] / b["total"], 4) if b["total"] > 0 else None,
                "games": b["total"],
            }
            for b in buckets
        ]

    return {"buckets": BUCKETS, "commanders": commanders}


def aggregate_action_winrates(games):
    """Compute per-commander winrate bucketed by player action count."""
    BUCKETS = ["0-30", "30-60", "60-90", "90-120", "120+"]

    def get_bucket(actions):
        if actions < 30:
            return 0
        elif actions < 60:
            return 1
        elif actions < 90:
            return 2
        elif actions < 120:
            return 3
        return 4

    # cmd -> bucket_idx -> {wins, total}
    stats = defaultdict(lambda: [{"wins": 0, "total": 0} for _ in BUCKETS])

    for game in games:
        for p in game["players"]:
            cmd = p["commander"]
            if not cmd:
                continue
            actions = p.get("actions", 0)
            if not actions:
                continue
            bucket = get_bucket(actions)
            stats[cmd][bucket]["total"] += 1
            if p["winner"]:
                stats[cmd][bucket]["wins"] += 1

    commanders = {}
    for cmd, buckets in stats.items():
        commanders[cmd] = [
            {
                "winrate": round(b["wins"] / b["total"], 4) if b["total"] > 0 else None,
                "games": b["total"],
            }
            for b in buckets
        ]

    return {"buckets": BUCKETS, "commanders": commanders}


def aggregate_turn_winrates(games):
    """Compute per-commander winrate bucketed by player turn count."""
    BUCKETS = ["1-5", "5-8", "8-11", "11-14", "14+"]

    def get_bucket(turns):
        if turns < 5:
            return 0
        elif turns < 8:
            return 1
        elif turns < 11:
            return 2
        elif turns < 14:
            return 3
        return 4

    # cmd -> bucket_idx -> {wins, total}
    stats = defaultdict(lambda: [{"wins": 0, "total": 0} for _ in BUCKETS])

    for game in games:
        for p in game["players"]:
            cmd = p["commander"]
            if not cmd:
                continue
            turns = p.get("turns", 0)
            if not turns:
                continue
            bucket = get_bucket(turns)
            stats[cmd][bucket]["total"] += 1
            if p["winner"]:
                stats[cmd][bucket]["wins"] += 1

    commanders = {}
    for cmd, buckets in stats.items():
        commanders[cmd] = [
            {
                "winrate": round(b["wins"] / b["total"], 4) if b["total"] > 0 else None,
                "games": b["total"],
            }
            for b in buckets
        ]

    return {"buckets": BUCKETS, "commanders": commanders}


def aggregate_commander_card_stats(games):
    """Compute per-commander card usage rates and winrates.

    Returns dict: commander -> list of all cards sorted by inclusion rate.
    """
    if not games:
        return {}

    # cmd -> card_name -> {deck, deck_wins, drawn, drawn_wins, played, played_wins, total_copies}
    stats = defaultdict(lambda: defaultdict(lambda: {
        "deck": 0, "deck_wins": 0,
        "drawn": 0, "drawn_wins": 0,
        "played": 0, "played_wins": 0,
        "total_copies": 0,
        "drawn_instances": 0, "played_instances": 0,
    }))
    cmd_games = defaultdict(int)

    for game in games:
        for p in game["players"]:
            cmd = p["commander"]
            if not cmd:
                continue
            won = p["winner"]
            cmd_games[cmd] += 1

            for c in p["cards_in_deck"]:
                stats[cmd][c["name"]]["deck"] += 1
                stats[cmd][c["name"]]["total_copies"] += c.get("count", 1)
                if won:
                    stats[cmd][c["name"]]["deck_wins"] += 1

            for c in p["cards_drawn"]:
                stats[cmd][c["name"]]["drawn"] += 1
                stats[cmd][c["name"]]["drawn_instances"] += c.get("count", 1)
                if won:
                    stats[cmd][c["name"]]["drawn_wins"] += 1

            for c in p["cards_played"]:
                stats[cmd][c["name"]]["played"] += 1
                stats[cmd][c["name"]]["played_instances"] += c.get("count", 1)
                if won:
                    stats[cmd][c["name"]]["played_wins"] += 1

    result = {}
    for cmd, cards in stats.items():
        total = cmd_games[cmd]
        if total == 0:
            continue
        card_list = []
        for name, d in cards.items():
            card_list.append({
                "name": name,
                "inclusion_rate": round(d["deck"] / total, 4),
                "drawn_rate": round(d["drawn"] / total, 4),
                "drawn_winrate": round(d["drawn_wins"] / d["drawn"], 4) if d["drawn"] > 0 else None,
                "played_rate": round(d["played"] / total, 4),
                "played_winrate": round(d["played_wins"] / d["played"], 4) if d["played"] > 0 else None,
                "drawn_count": d["drawn"],
                "played_count": d["played"],
                "drawn_instances": d["drawn_instances"],
                "played_instances": d["played_instances"],
                "avg_copies": round(d["total_copies"] / d["deck"], 2) if d["deck"] > 0 else 0,
                "deck_count": d["deck"],
                "games": total,
            })
        card_list.sort(key=lambda x: x["inclusion_rate"], reverse=True)
        result[cmd] = card_list

    return result


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


def aggregate_archetypes(games, min_commander_decks=8, min_card_decks=3,
                         min_edge_weight=2, min_package_cards=2,
                         min_archetype_decks=3, representative_card_rate=0.25,
                         min_representative_cards=15, staple_threshold=0.40):
    """Discover commander-specific deck archetypes from card co-occurrence.

    The model has two layers:
    1. Build a card co-occurrence graph per commander and run a deterministic
       Louvain local-moving pass to find card packages.
    2. Assign each deck to the strongest package combination and aggregate
       those deck groups into archetype rows for the metagame page.

    staple_threshold controls which cards are excluded from package names.
    A card is considered a staple if its global inclusion rate (fraction of
    all player-deck entries containing it across all commanders) exceeds this
    value. Using a global rate rather than a per-commander rate means faction-
    specific cards that are popular within one commander's pool (e.g. Quickling
    for Jagris) are not incorrectly labelled staples.
    """
    commander_decks = defaultdict(list)
    total_player_decks = 0

    # Precompute global card inclusion rate (card present in X% of all decks).
    global_card_counts: Counter = Counter()
    global_total_decks = 0

    for game in games:
        for p in game["players"]:
            cmd = p.get("commander")
            cards = p.get("cards_in_deck", [])
            if not cmd or not cards:
                continue

            card_counts = Counter()
            for card in cards:
                name = card.get("name")
                count = card.get("count", 1)
                if name:
                    card_counts[name] += count

            if not card_counts:
                continue

            global_card_counts.update(card_counts.keys())
            global_total_decks += 1

            commander_decks[cmd].append({
                "winner": bool(p.get("winner")),
                "cards": dict(card_counts),
                "deck_name": p.get("deck_name", "") or "",
                "username": p.get("name", "") or "",
            })
            total_player_decks += 1

    global_card_rate: dict = {
        card: count / global_total_decks
        for card, count in global_card_counts.items()
    } if global_total_decks else {}

    result = {
        "total_decks": total_player_decks,
        "commanders": {},
    }

    for cmd, decks in sorted(commander_decks.items()):
        deck_count = len(decks)
        if deck_count < min_commander_decks:
            result["commanders"][cmd] = {
                "deck_count": deck_count,
                "skipped": True,
                "reason": "insufficient_decks",
                "packages": [],
                "archetypes": [],
            }
            continue

        nodes, edges, card_deck_counts = _build_card_graph(
            decks, min_card_decks, min_edge_weight
        )
        communities = _louvain_local_moving(nodes, edges)
        packages = _build_card_packages(
            communities, decks, card_deck_counts, deck_count, min_package_cards,
            global_card_rate, staple_threshold
        )
        archetypes = _build_archetype_rows(
            decks, packages, card_deck_counts, deck_count, total_player_decks,
            min_archetype_decks, representative_card_rate,
            min_representative_cards
        )

        result["commanders"][cmd] = {
            "deck_count": deck_count,
            "skipped": False,
            "packages": packages,
            "archetypes": archetypes,
        }

    return result


def _build_card_graph(decks, min_card_decks, min_edge_weight):
    card_deck_counts = Counter()
    edge_counts = Counter()

    for deck in decks:
        present = sorted(deck["cards"].keys())
        card_deck_counts.update(present)
        for a, b in combinations(present, 2):
            edge_counts[(a, b)] += 1

    nodes = {
        card for card, count in card_deck_counts.items()
        if count >= min_card_decks
    }
    edges = defaultdict(dict)
    for (a, b), weight in edge_counts.items():
        if weight < min_edge_weight or a not in nodes or b not in nodes:
            continue
        edges[a][b] = weight
        edges[b][a] = weight

    # Drop isolated cards after edge filtering; Louvain communities with one
    # card do not help define an archetype package.
    connected_nodes = {node for node in nodes if edges.get(node)}
    return connected_nodes, edges, card_deck_counts


def _louvain_local_moving(nodes, edges, resolution=1.0, max_passes=25):
    """Deterministic single-level Louvain community detection.

    This is the local-moving phase of Louvain. It is intentionally small and
    dependency-free because the pipeline runs in GitHub Actions.
    """
    if not nodes:
        return {}

    communities = {node: i for i, node in enumerate(sorted(nodes))}
    degrees = {
        node: sum(edges.get(node, {}).values())
        for node in nodes
    }
    total_weight = sum(
        weight for a, neighbors in edges.items()
        for b, weight in neighbors.items()
        if a < b
    )
    if total_weight == 0:
        return {}

    comm_totals = defaultdict(float)
    comm_internal = defaultdict(float)
    for node, comm in communities.items():
        comm_totals[comm] += degrees[node]

    for _ in range(max_passes):
        moved = False
        ordered_nodes = sorted(
            nodes,
            key=lambda n: (-sum(edges.get(n, {}).values()), n)
        )

        for node in ordered_nodes:
            original = communities[node]
            neighbor_weights = defaultdict(float)
            for neighbor, weight in edges.get(node, {}).items():
                neighbor_weights[communities[neighbor]] += weight

            neighbor_comms = sorted(neighbor_weights)
            best_comm = original
            best_delta = 0

            for comm in neighbor_comms:
                if comm == original:
                    continue
                delta = _move_modularity_delta(
                    node, original, comm, degrees, comm_totals, comm_internal,
                    neighbor_weights, total_weight, resolution
                )
                if delta > best_delta + 1e-12:
                    best_delta = delta
                    best_comm = comm

            if best_comm != original:
                node_degree = degrees[node]
                comm_totals[original] -= node_degree
                comm_internal[original] -= neighbor_weights.get(original, 0)
                comm_totals[best_comm] += node_degree
                comm_internal[best_comm] += neighbor_weights.get(best_comm, 0)
                communities[node] = best_comm
                moved = True

        if not moved:
            break

    grouped = defaultdict(list)
    for node, comm in communities.items():
        grouped[comm].append(node)

    normalized = {}
    for idx, cards in enumerate(sorted(grouped.values(), key=lambda c: (-len(c), sorted(c)))):
        for card in cards:
            normalized[card] = idx
    return normalized


def _move_modularity_delta(node, old_comm, new_comm, degrees, comm_totals,
                           comm_internal, neighbor_weights, total_weight,
                           resolution):
    node_degree = degrees[node]
    old_links = neighbor_weights.get(old_comm, 0)
    new_links = neighbor_weights.get(new_comm, 0)

    old_before = _community_modularity(
        comm_internal[old_comm], comm_totals[old_comm], total_weight, resolution
    )
    new_before = _community_modularity(
        comm_internal[new_comm], comm_totals[new_comm], total_weight, resolution
    )
    old_after = _community_modularity(
        comm_internal[old_comm] - old_links,
        comm_totals[old_comm] - node_degree,
        total_weight,
        resolution,
    )
    new_after = _community_modularity(
        comm_internal[new_comm] + new_links,
        comm_totals[new_comm] + node_degree,
        total_weight,
        resolution,
    )
    return (old_after + new_after) - (old_before + new_before)


def _community_modularity(internal_weight, total_degree, total_weight, resolution):
    return (
        internal_weight / total_weight
        - resolution * (total_degree / (2 * total_weight)) ** 2
    )


def _build_card_packages(communities, decks, card_deck_counts, deck_count,
                         min_package_cards, global_card_rate=None,
                         staple_threshold=0.40):
    grouped = defaultdict(list)
    for card, comm in communities.items():
        grouped[comm].append(card)

    _global_rate = global_card_rate or {}
    packages = []
    for cards in grouped.values():
        if len(cards) < min_package_cards:
            continue

        card_set = set(cards)
        containing_decks = []
        for deck in decks:
            overlap = card_set.intersection(deck["cards"])
            if len(overlap) >= min(2, len(card_set)):
                containing_decks.append(deck)

        package_deck_count = len(containing_decks)
        if package_deck_count == 0:
            continue

        card_rows = []
        for card in sorted(cards):
            in_package = sum(1 for deck in containing_decks if card in deck["cards"])
            package_rate = in_package / package_deck_count
            baseline_rate = card_deck_counts[card] / deck_count
            # IDF: penalises cards that are globally common across all commanders.
            # Falls back to per-commander rate when global data is unavailable.
            g_rate = _global_rate.get(card) or baseline_rate
            idf = math.log(1.0 / (g_rate + 1e-9))
            card_rows.append({
                "name": card,
                "package_rate": round(package_rate, 4),
                "baseline_rate": round(baseline_rate, 4),
                "lift": round(package_rate - baseline_rate, 4),
                "tfidf": round(package_rate * idf, 4),
                "deck_count": card_deck_counts[card],
            })

        card_rows.sort(key=lambda c: (-c["tfidf"], -c["package_rate"], c["name"]))
        packages.append({
            "cards": [c["name"] for c in card_rows],
            "deck_count": package_deck_count,
            "inclusion_rate": round(package_deck_count / deck_count, 4),
            "signature_cards": card_rows[:8],
        })

    packages.sort(key=lambda p: (-p["deck_count"], p["cards"][0]))
    for i, package in enumerate(packages, start=1):
        package["id"] = f"pkg-{i}"
        # signature_cards is already sorted by TF-IDF descending, so the top-2
        # are the most distinctive cards for this package.
        sig = package["signature_cards"]
        package["name"] = " / ".join(c["name"] for c in sig[:2])

    return packages


def _build_archetype_rows(decks, packages, card_deck_counts, commander_deck_count,
                          total_player_decks, min_archetype_decks,
                          representative_card_rate, min_representative_cards):
    if not packages:
        return []

    package_lookup = {p["id"]: set(p["cards"]) for p in packages}
    package_names = {p["id"]: p["name"] for p in packages}
    grouped = defaultdict(list)

    for deck in decks:
        deck_cards = set(deck["cards"])
        scores = []
        for package_id, cards in package_lookup.items():
            overlap = deck_cards.intersection(cards)
            if len(overlap) < 2:
                continue
            score = len(overlap) / len(cards)
            if score >= 0.3:
                scores.append((package_id, score, len(overlap)))

        if scores:
            scores.sort(key=lambda x: (-x[1], -x[2], x[0]))
            key = tuple(package_id for package_id, _, _ in scores[:2])
        else:
            key = ("misc",)
        grouped[key].append(deck)

    archetypes = []
    for key, group in grouped.items():
        if len(group) < min_archetype_decks:
            continue

        wins = sum(1 for deck in group if deck["winner"])
        card_totals = Counter()
        card_decks = Counter()
        for deck in group:
            card_totals.update(deck["cards"])
            card_decks.update(deck["cards"].keys())

        cards = []
        for card, seen in card_decks.items():
            inclusion = seen / len(group)
            baseline = card_deck_counts[card] / commander_deck_count
            cards.append({
                "name": card,
                "inclusion_rate": round(inclusion, 4),
                "baseline_rate": round(baseline, 4),
                "lift": round(inclusion - baseline, 4),
                "avg_copies": round(card_totals[card] / seen, 2),
            })
        representative_cards = sorted(
            cards,
            key=lambda c: (-c["inclusion_rate"], -c["avg_copies"], -c["lift"], c["name"])
        )
        representative_cutoff = sum(
            1 for c in representative_cards
            if c["inclusion_rate"] >= representative_card_rate
        )
        representative_limit = min(
            len(representative_cards),
            max(min_representative_cards, representative_cutoff)
        )
        signature_cards = sorted(
            cards,
            key=lambda c: (-c["lift"], -c["inclusion_rate"], c["name"])
        )

        # Collect unique deck names with their play counts and primary username.
        # If multiple players share a deck name the most frequent user is shown.
        deck_name_counts: dict = defaultdict(lambda: {"count": 0, "usernames": Counter()})
        for deck in group:
            dn = deck.get("deck_name") or "Unknown"
            uname = deck.get("username") or "Unknown"
            deck_name_counts[dn]["count"] += 1
            deck_name_counts[dn]["usernames"][uname] += 1
        decklists = [
            {
                "deck_name": dn,
                "username": data["usernames"].most_common(1)[0][0],
                "count": data["count"],
            }
            for dn, data in sorted(deck_name_counts.items(), key=lambda x: -x[1]["count"])
        ]

        package_ids = list(key)
        raw_names = [package_names.get(pid, "Misc") for pid in package_ids]
        # For multi-package archetypes use only the first card from each package
        # name to keep labels short; single-package archetypes keep the full
        # "CardA / CardB" form since both cards are meaningful there.
        if len(raw_names) > 1:
            package_label = " + ".join(n.split(" / ")[0] for n in raw_names)
        else:
            package_label = raw_names[0] if raw_names else "Misc"
        archetypes.append({
            "id": "-".join(package_ids),
            "name": package_label,
            "package_ids": package_ids,
            "deck_count": len(group),
            "wins": wins,
            "winrate": round(wins / len(group), 4),
            "commander_share": round(len(group) / commander_deck_count, 4),
            "meta_share": round(len(group) / total_player_decks, 4) if total_player_decks else 0,
            "cards": representative_cards[:representative_limit],
            "total_cards_seen": len(representative_cards),
            "card_display_threshold": representative_card_rate,
            "card_display_minimum": min_representative_cards,
            "key_cards": signature_cards[:12],
            "decklists": decklists,
        })

    archetypes.sort(key=lambda a: (-a["deck_count"], a["name"]))
    return archetypes


def aggregate_mulligan_stats(games, intellect_lookup=None):
    """Compute per-card mulligan keep rate and winrate impact.

    Count-weighted: if a player keeps 2 copies of a card, that's 2 kept instances.
    Only counts games where mulligan data exists.

    When intellect_lookup is provided (commander name -> intellect int),
    computes a normalized keep delta that removes commander/turn-order bias.
    Turn order is inferred from kept count: 3 = first player, 4 = second.
    Expected keep rate per card = cards_to_keep / intellect.

    Returns (card_data dict, total_player_games_with_mulligan).
    """
    if not games:
        return {}, 0

    card_data = defaultdict(lambda: {
        "kept_count": 0, "kept_wins": 0,
        "returned_count": 0, "returned_wins": 0,
        "expected_sum": 0.0, "appearances": 0,
    })
    total_mulligan_games = 0

    for game in games:
        for p in game["players"]:
            kept = p.get("mulligan_kept", [])
            returned = p.get("mulligan_returned", [])
            if not kept and not returned:
                continue
            total_mulligan_games += 1
            won = p["winner"]
            cmd = p.get("commander", "")

            # Compute expected keep rate for this hand
            cards_to_keep = sum(c.get("count", 1) for c in kept)
            intellect = intellect_lookup.get(cmd) if intellect_lookup else None
            expected_rate = cards_to_keep / intellect if intellect else None

            for c in kept:
                count = c.get("count", 1)
                card_data[c["name"]]["kept_count"] += count
                if won:
                    card_data[c["name"]]["kept_wins"] += count
                if expected_rate is not None:
                    card_data[c["name"]]["expected_sum"] += expected_rate * count
                    card_data[c["name"]]["appearances"] += count

            for c in returned:
                count = c.get("count", 1)
                card_data[c["name"]]["returned_count"] += count
                if won:
                    card_data[c["name"]]["returned_wins"] += count
                if expected_rate is not None:
                    card_data[c["name"]]["expected_sum"] += expected_rate * count
                    card_data[c["name"]]["appearances"] += count

    return card_data, total_mulligan_games


def aggregate_commander_mulligan_stats(games, intellect_lookup=None):
    """Compute per-commander per-card mulligan stats.

    When intellect_lookup is provided, computes normalized keep delta.
    Returns dict: commander -> list of card mulligan stats sorted by total_seen.
    """
    if not games:
        return {}

    stats = defaultdict(lambda: defaultdict(lambda: {
        "kept": 0, "kept_wins": 0,
        "returned": 0, "returned_wins": 0,
        "expected_sum": 0.0, "appearances": 0,
    }))
    cmd_mulligan_games = defaultdict(int)

    for game in games:
        for p in game["players"]:
            cmd = p["commander"]
            if not cmd:
                continue
            kept = p.get("mulligan_kept", [])
            returned = p.get("mulligan_returned", [])
            if not kept and not returned:
                continue
            cmd_mulligan_games[cmd] += 1
            won = p["winner"]

            cards_to_keep = sum(c.get("count", 1) for c in kept)
            intellect = intellect_lookup.get(cmd) if intellect_lookup else None
            expected_rate = cards_to_keep / intellect if intellect else None

            for c in kept:
                count = c.get("count", 1)
                stats[cmd][c["name"]]["kept"] += count
                if won:
                    stats[cmd][c["name"]]["kept_wins"] += count
                if expected_rate is not None:
                    stats[cmd][c["name"]]["expected_sum"] += expected_rate * count
                    stats[cmd][c["name"]]["appearances"] += count

            for c in returned:
                count = c.get("count", 1)
                stats[cmd][c["name"]]["returned"] += count
                if won:
                    stats[cmd][c["name"]]["returned_wins"] += count
                if expected_rate is not None:
                    stats[cmd][c["name"]]["expected_sum"] += expected_rate * count
                    stats[cmd][c["name"]]["appearances"] += count

    result = {}
    for cmd, cards in stats.items():
        total = cmd_mulligan_games[cmd]
        if total == 0:
            continue
        card_list = []
        for name, d in cards.items():
            total_seen = d["kept"] + d["returned"]
            if total_seen == 0:
                continue
            keep_rate = round(d["kept"] / total_seen, 4)
            keep_wr = round(d["kept_wins"] / d["kept"], 4) if d["kept"] > 0 else None
            return_wr = round(d["returned_wins"] / d["returned"], 4) if d["returned"] > 0 else None
            wr_delta = None
            if keep_wr is not None and return_wr is not None:
                wr_delta = round(keep_wr - return_wr, 4)
            norm_delta = None
            if d["appearances"] > 0:
                expected_rate = d["expected_sum"] / d["appearances"]
                norm_delta = round(keep_rate - expected_rate, 4)
            card_list.append({
                "name": name,
                "kept_count": d["kept"],
                "returned_count": d["returned"],
                "total_seen": total_seen,
                "keep_rate": keep_rate,
                "norm_keep_delta": norm_delta,
                "keep_winrate": keep_wr,
                "return_winrate": return_wr,
                "winrate_delta": wr_delta,
                "games": total,
            })
        card_list.sort(key=lambda x: x["total_seen"], reverse=True)
        result[cmd] = card_list

    return result
