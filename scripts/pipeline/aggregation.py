"""Aggregation functions — turn clean games into stats.

All functions take a list of clean game dicts and return aggregated data.
No I/O, no side effects.
"""

from collections import defaultdict
from datetime import datetime


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
