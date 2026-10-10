"""Meta pulse: what changed recently, plus the hub's headline facts.

Windows: the most recent RECENT_WEEKS complete ISO weeks before ``as_of``
versus the PRIOR_WEEKS complete weeks before those. Weekly counts come from
commander_winrate_trends.json (the only weekly series that publishes game
counts; commander_trends.json / trends.json carry percentages only and are used
as a cross-check). Week keys are parsed with insights.weeks, so legacy
strftime("%W") keys — including the split ``YYYY-W00`` week — and ISO keys
both land on proper ISO weeks. Weeks absent from the published series (the
pipeline drops weeks with fewer than 4 games) count as zero.

Reporting gates:
  * popularity change (commander or faction share of seats): |z| >= 3 on a
    two-proportion test (picks cluster by player and ~22 tests run at once,
    so the usual 2 is far too loose), |share change| >= 2 points, >= 20 picks
    combined, and the change persists: at least 2 of the 4 recent weeks sit
    on the same side of the prior-window share. At most 5 popularity items
    (commanders and factions together, largest |z| first).
  * winrate move: mirror-free games, both windows >= 50 games, |z| >= 2, and
    the commander's last-30-days sample passes the pilot gates (not mostly one
    player's games, not fewer than 5 players).
  * quiet: the recent window has fewer than 150 games (flag only).

Every item carries ``discord_text`` that names the sample size and window.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from insights.common import (
    ALL_PERIODS, DEFAULT_PERIOD, FACTIONS, PERIOD_LABELS, MODEL_PERIODS,
    commander_slug, int_text, pct_text, r2, r4,
)
from insights.concentration import commander_concentration
from insights.profiles import commander_record
from insights.stats_kit import (
    histogram_quantile, pilots_status, rate_block, two_proportion_z, wilson,
)
from insights.weeks import (
    complete_weeks_before, detect_scheme, iso_key, week_monday,
)

RECENT_WEEKS = 4
PRIOR_WEEKS = 8
WR_MIN_GAMES = 50
WR_Z_THRESHOLD = 2.0
POP_Z_THRESHOLD = 3.0
POP_MIN_PERSISTENT_WEEKS = 2   # of the RECENT_WEEKS
POP_MAX_ITEMS = 5
QUIET_GAMES = 150
POP_MIN_SHARE_CHANGE = 0.02
POP_MIN_PICKS = 20
PILOT_CHECK_PERIOD = "1m"      # pilot gates for winrate moves use this period
SERIES_WEEKS = 26
LATEST_CHANGES_DAYS = 45
LATEST_CHANGES_MAX = 12


# ─── Weekly counts ────────────────────────────────────────────────

def _wins(wr_pct, games):
    """Recover integer wins from a published 0.1%-rounded winrate.
    Exact for games < 1000 (rounding error < 0.5)."""
    if not games or wr_pct is None:
        return 0
    return int(round(wr_pct * games / 100.0))


def weekly_counts(block, scheme):
    """{monday: {commander: [games, wins, games_no_mirror, wins_no_mirror]}}
    from one commander_winrate_trends period × map block. Split legacy weeks
    (``2025-W52`` + ``2026-W00``) merge into one ISO week. Returns
    (counts, unparseable_keys)."""
    counts = defaultdict(lambda: defaultdict(lambda: [0, 0, 0, 0]))
    bad = []
    if not block:
        return counts, bad
    dates = block.get("dates", [])
    cmds = block.get("commanders", {})
    for i, key in enumerate(dates):
        monday = week_monday(key, scheme)
        if monday is None:
            bad.append(key)
            continue
        for cmd, s in cmds.items():
            g = (s.get("games") or [0] * len(dates))[i] or 0
            gn = (s.get("games_no_mirror") or [0] * len(dates))[i] or 0
            if not g and not gn:
                continue
            acc = counts[monday][cmd]
            acc[0] += g
            acc[1] += _wins((s.get("winrate") or [None] * len(dates))[i], g)
            acc[2] += gn
            acc[3] += _wins((s.get("winrate_no_mirror") or [None] * len(dates))[i], gn)
    return counts, bad


def _sum_window(counts, mondays):
    per_cmd = defaultdict(lambda: [0, 0, 0, 0])
    for m in mondays:
        for cmd, acc in counts.get(m, {}).items():
            tgt = per_cmd[cmd]
            for k in range(4):
                tgt[k] += acc[k]
    picks = sum(v[0] for v in per_cmd.values())
    return per_cmd, picks


def _fmt_day(d: date) -> str:
    return f"{d.strftime('%b')} {d.day}"


def _window_meta(mondays, label, picks):
    start = mondays[0]
    end = mondays[-1] + timedelta(days=6)
    return {
        "label": label,
        "weeks": [iso_key(m) for m in mondays],
        "start": start.isoformat(),
        "end": end.isoformat(),
        "range_text": f"{_fmt_day(start)} – {_fmt_day(end)}",
        "games": picks // 2,
        "picks": picks,
    }


# ─── Popularity and winrate rows ──────────────────────────────────

def _persistent_weeks(weekly, prior_share, change):
    """Recent weeks whose share sits on the same side of ``prior_share`` as
    the overall change. weekly: [(subject_picks, total_picks)] per week."""
    if prior_share is None or not change:
        return 0
    n = 0
    for picks, total in weekly:
        if not total:
            continue
        share = picks / total
        if (change > 0 and share > prior_share) or (change < 0 and share < prior_share):
            n += 1
    return n


def _popularity_row(recent_picks, recent_total, prior_picks, prior_total, weekly=None):
    rs = recent_picks / recent_total if recent_total else None
    ps = prior_picks / prior_total if prior_total else None
    z = two_proportion_z(recent_picks, recent_total, prior_picks, prior_total)
    change = (rs - ps) if rs is not None and ps is not None else None
    persistent = _persistent_weeks(weekly or [], ps, change)
    notable = (
        z is not None and abs(z) >= POP_Z_THRESHOLD
        and change is not None and abs(change) >= POP_MIN_SHARE_CHANGE
        and recent_picks + prior_picks >= POP_MIN_PICKS
        and persistent >= POP_MIN_PERSISTENT_WEEKS
    )
    return {
        "recent": {"picks": recent_picks, "share": r4(rs),
                   "per_week": r2(recent_picks / RECENT_WEEKS)},
        "prior": {"picks": prior_picks, "share": r4(ps),
                  "per_week": r2(prior_picks / PRIOR_WEEKS)},
        "share_change": r4(change),
        "z": r2(z),
        "persistent_weeks": persistent,
        "notable": bool(notable),
    }


def _pilot_check(site, name):
    """Pilot gates for a commander's recent sample (PILOT_CHECK_PERIOD, all maps)."""
    conc = commander_concentration(site, PILOT_CHECK_PERIOD, "all", name)
    rows = site.block("commander_stats", PILOT_CHECK_PERIOD, "all") or []
    row = next((r for r in rows if r.get("name") == name), None)
    status = pilots_status(row)
    passed = not (status == "below_min" or (conc or {}).get("concentrated"))
    return {
        "window": PILOT_CHECK_PERIOD,
        "top_pilot_share": (conc or {}).get("top_pilot_share"),
        "pilots_status": status,
        "passed": passed,
    }


def _winrate_row(rw, rn, pw, pn, pilot_check=None):
    z = two_proportion_z(rw, rn, pw, pn)
    passed = pilot_check is None or pilot_check["passed"]
    reportable = (rn >= WR_MIN_GAMES and pn >= WR_MIN_GAMES
                  and z is not None and abs(z) >= WR_Z_THRESHOLD and passed)
    out = {
        "basis": "mirror-free games",
        "recent": rate_block(rw, rn),
        "prior": rate_block(pw, pn),
        "change": r4(rw / rn - pw / pn) if rn and pn else None,
        "z": r2(z),
        "reportable": bool(reportable),
    }
    if pilot_check is not None:
        out["pilot_check"] = pilot_check
    return out


def _direction(change):
    if change is None or change == 0:
        return "flat"
    return "up" if change > 0 else "down"


# ─── Headline facts ───────────────────────────────────────────────

def headline_facts(site, period):
    """Plain facts for one period (map 'all'), each with n and window."""
    label = PERIOD_LABELS[period]
    facts = []

    gd = site.block("game_distributions", period) or {}
    dur = gd.get("duration") or {}
    if dur.get("total"):
        med = histogram_quantile(dur["labels"], dur["counts"], 0.5)
        p25 = histogram_quantile(dur["labels"], dur["counts"], 0.25)
        p75 = histogram_quantile(dur["labels"], dur["counts"], 0.75)
        n = dur["total"]
        facts.append({
            "id": "game_minutes", "label": "Typical game length", "unit": "minutes",
            "value": round(med), "p25": round(p25), "p75": round(p75), "n": n,
            "n_label": "timed games", "window": period, "window_label": label,
            "text": (f"A typical game lasts about {round(med)} minutes; half run "
                     f"{round(p25)}–{round(p75)} minutes ({int_text(n)} timed games, {label})."),
            "discord_text": (f"Typical game: ~{round(med)} min (half run {round(p25)}–{round(p75)} min) "
                             f"— {int_text(n)} timed games, {label}."),
        })
    trn = gd.get("turns") or {}
    if trn.get("total"):
        med = histogram_quantile(trn["labels"], trn["counts"], 0.5)
        p25 = histogram_quantile(trn["labels"], trn["counts"], 0.25)
        p75 = histogram_quantile(trn["labels"], trn["counts"], 0.75)
        n = trn["total"]
        facts.append({
            "id": "game_turns", "label": "Typical game length", "unit": "turns (both players combined)",
            "value": round(med), "p25": round(p25), "p75": round(p75),
            "per_player": round(med / 2), "n": n, "n_label": "games",
            "window": period, "window_label": label,
            "text": (f"A typical game runs about {round(med)} turns in total (about {round(med / 2)} each); "
                     f"half run {round(p25)}–{round(p75)} ({int_text(n)} games, {label})."),
            "discord_text": (f"Typical game: ~{round(med)} turns total, ~{round(med / 2)} each "
                             f"(half run {round(p25)}–{round(p75)}) — {int_text(n)} games, {label}."),
        })

    meta = site.block("metadata", period) or {}
    matches = meta.get("total_matches") or 0
    cards = site.block("card_stats", period) or []
    if matches and cards:
        player_games = 2 * matches
        drawn = sum(c.get("drawn_instances", 0) for c in cards if not c.get("token"))
        played = sum(c.get("played_instances", 0) for c in cards if not c.get("token"))
        d_avg, p_avg = drawn / player_games, played / player_games
        facts.append({
            "id": "cards_per_game", "label": "Cards per player per game", "unit": "cards",
            "drawn": round(d_avg, 1), "played": round(p_avg, 1), "n": player_games,
            "n_label": "player-games", "window": period, "window_label": label,
            "note": "deck cards only; generated tokens excluded",
            "text": (f"Players draw about {d_avg:.0f} cards and play about {p_avg:.0f} per game "
                     f"({int_text(player_games)} player-games, {label})."),
            "discord_text": (f"Each player draws ~{d_avg:.0f} cards and plays ~{p_avg:.0f} per game "
                             f"— {int_text(player_games)} player-games, {label}."),
        })

    ft = site.block("first_turn", period) or {}
    if ft.get("total_games"):
        n, w = ft["total_games"], ft.get("first_player_wins", 0)
        rb = rate_block(w, n)
        if rb["wr"] is not None:
            text = (f"Going first wins {pct_text(rb['wr'])} of games (95% range "
                    f"{pct_text(rb['lo'])}–{pct_text(rb['hi'])}; {int_text(n)} games with known turn "
                    f"order, {label}). {rb['verdict_label']}.")
        else:
            text = f"Too early to tell whether going first matters ({int_text(n)} games, {label})."
        facts.append({
            "id": "going_first", "label": "Going first", **rb, "n": n,
            "n_label": "games with known turn order", "window": period, "window_label": label,
            "text": text,
            "discord_text": text,
        })

    fb = site.block("feedback_stats", period) or {}
    total = fb.get("total_ratings") or 0
    if total and fb.get("fun_rate") is not None:
        fun = int(round(fb["fun_rate"] * total))
        lo, hi = wilson(fun, total)
        # n counts answers (one per player per game), not distinct players.
        facts.append({
            "id": "fun", "label": "Had fun", "fun": fun, "n": total,
            "share": r4(fun / total), "lo": r4(lo), "hi": r4(hi),
            "n_label": "post-game answers", "window": period, "window_label": label,
            "text": (f"{pct_text(fun / total, 0)} of post-game answers said the game was fun "
                     f"({int_text(fun)} of {int_text(total)} answers, {label})."),
            "discord_text": (f"{pct_text(fun / total, 0)} of post-game answers said fun "
                             f"— {int_text(fun)} of {int_text(total)} answers, {label}."),
        })
    return facts


# ─── Commander overview (honest ranges, no tiers) ─────────────────

def commander_overview(site, period, ref):
    """Per-commander record vs the field (mirror-free, pilot gates applied),
    alphabetical. Same shape as a profile's ``record`` plus name/slug/faction."""
    rows = site.block("commander_stats", period) or []
    out = []
    for r in rows:
        name = r["name"]
        out.append({
            "name": name,
            "slug": commander_slug(name),
            "faction": (ref.get(name) or {}).get("faction", r.get("faction")),
            **commander_record(site, period, "all", name),
        })
    out.sort(key=lambda x: x["name"])
    return out


# ─── Build ────────────────────────────────────────────────────────

def build_meta_pulse(site, as_of_dt, as_of, model=None, changelog=None):
    commanders_ref = {c["name"]: c for c in site.get("commanders", default=[])}
    meta_all = site.block("metadata", "all") or {}
    cwt_block = site.block("commander_winrate_trends", "all")
    keys = (cwt_block or {}).get("dates", [])
    scheme = detect_scheme(keys, meta_all.get("data_version"))
    counts, bad_keys = weekly_counts(cwt_block, scheme)

    as_of_date = as_of_dt.date()
    recent_m = complete_weeks_before(as_of_date, RECENT_WEEKS)
    prior_m = complete_weeks_before(as_of_date, PRIOR_WEEKS, skip=RECENT_WEEKS)
    recent, r_picks = _sum_window(counts, recent_m)
    prior, p_picks = _sum_window(counts, prior_m)
    win_recent = _window_meta(recent_m, f"last {RECENT_WEEKS} weeks", r_picks)
    win_prior = _window_meta(prior_m, f"previous {PRIOR_WEEKS} weeks", p_picks)
    quiet = win_recent["games"] < QUIET_GAMES

    def faction_of(cmd):
        return (commanders_ref.get(cmd) or {}).get("faction", "neutral")

    names = sorted(set(commanders_ref) | set(recent) | set(prior))
    week_totals = [sum(v[0] for v in counts.get(m, {}).values()) for m in recent_m]

    def weekly_for(pred):
        return [(sum(v[0] for c, v in counts.get(m, {}).items() if pred(c)), t)
                for m, t in zip(recent_m, week_totals)]

    cmd_rows = []
    for name in names:
        r, p = recent.get(name, [0, 0, 0, 0]), prior.get(name, [0, 0, 0, 0])
        cmd_rows.append({
            "name": name,
            "slug": commander_slug(name),
            "faction": faction_of(name),
            "popularity": _popularity_row(r[0], r_picks, p[0], p_picks,
                                          weekly_for(lambda c, n=name: c == n)),
            "winrate": _winrate_row(r[3], r[2], p[3], p[2], _pilot_check(site, name)),
        })

    fac_recent, fac_prior = defaultdict(int), defaultdict(int)
    for name, acc in recent.items():
        fac_recent[faction_of(name)] += acc[0]
    for name, acc in prior.items():
        fac_prior[faction_of(name)] += acc[0]
    faction_rows = [
        {"faction": f, "popularity": _popularity_row(
            fac_recent[f], r_picks, fac_prior[f], p_picks,
            weekly_for(lambda c, f=f: faction_of(c) == f))}
        for f in FACTIONS
    ]

    rl, rr = win_recent["label"], win_recent["range_text"]
    pl, pr = win_prior["label"], win_prior["range_text"]
    items = []
    if quiet:
        items.append({
            "id": "quiet", "kind": "quiet", "subject": None, "direction": None,
            "n": {"recent_games": win_recent["games"]},
            "window": {"recent": win_recent["weeks"]},
            "text": (f"Quiet stretch: {int_text(win_recent['games'])} games in the {rl} ({rr}), so "
                     "week-to-week changes are hard to read."),
            "discord_text": (f"Quiet stretch: only {int_text(win_recent['games'])} games in the {rl} "
                             f"({rr}) — treat changes with caution."),
        })

    wr_items = []
    for row in cmd_rows:
        w = row["winrate"]
        if not w["reportable"]:
            continue
        d = _direction(w["change"])
        r_, p_ = w["recent"], w["prior"]
        text = (f"{row['name']} won {pct_text(r_['wr'], 0)} of {int_text(r_['games'])} mirror-free games "
                f"in the {rl}, {rr} (95% range {pct_text(r_['lo'], 0)}–{pct_text(r_['hi'], 0)}), "
                f"{'up' if d == 'up' else 'down'} from {pct_text(p_['wr'], 0)} of "
                f"{int_text(p_['games'])} in the {pl}, {pr}.")
        wr_items.append({
            "id": f"winrate:{row['slug']}", "kind": "winrate_move", "subject": row["name"],
            "subject_slug": row["slug"], "faction": row["faction"], "direction": d,
            "z": w["z"], "change": w["change"],
            "n": {"recent_games": r_["games"], "prior_games": p_["games"]},
            "window": {"recent": win_recent["weeks"], "prior": win_prior["weeks"]},
            "text": text,
            "discord_text": f"**{row['name']}** " + text[len(row["name"]) + 1:],
        })
    wr_items.sort(key=lambda x: (-abs(x["z"]), x["subject"]))

    pop_items = []
    for row in cmd_rows:
        pop = row["popularity"]
        if not pop["notable"]:
            continue
        d = _direction(pop["share_change"])
        text = (f"{row['name']} took {pct_text(pop['recent']['share'])} of seats in the {rl} "
                f"({int_text(pop['recent']['picks'])} of {int_text(r_picks)}, {rr}), "
                f"{'up' if d == 'up' else 'down'} from {pct_text(pop['prior']['share'])} in the {pl} "
                f"({int_text(pop['prior']['picks'])} of {int_text(p_picks)}, {pr}).")
        pop_items.append({
            "id": f"popularity:{row['slug']}", "kind": "popularity", "subject": row["name"],
            "subject_slug": row["slug"], "faction": row["faction"], "direction": d,
            "z": pop["z"], "change": pop["share_change"],
            "n": {"recent_picks": pop["recent"]["picks"], "recent_total": r_picks,
                  "prior_picks": pop["prior"]["picks"], "prior_total": p_picks},
            "window": {"recent": win_recent["weeks"], "prior": win_prior["weeks"]},
            "text": text,
            "discord_text": f"**{row['name']}** " + text[len(row["name"]) + 1:],
        })
    for row in faction_rows:
        pop = row["popularity"]
        if not pop["notable"]:
            continue
        d = _direction(pop["share_change"])
        fname = row["faction"].capitalize()
        text = (f"{fname} commanders took {pct_text(pop['recent']['share'])} of seats in the {rl} "
                f"({int_text(pop['recent']['picks'])} of {int_text(r_picks)}, {rr}), "
                f"{'up' if d == 'up' else 'down'} from {pct_text(pop['prior']['share'])} in the {pl} "
                f"({int_text(pop['prior']['picks'])} of {int_text(p_picks)}, {pr}).")
        pop_items.append({
            "id": f"faction:{row['faction']}", "kind": "faction_popularity", "subject": fname,
            "subject_slug": row["faction"], "faction": row["faction"], "direction": d,
            "z": pop["z"], "change": pop["share_change"],
            "n": {"recent_picks": pop["recent"]["picks"], "recent_total": r_picks,
                  "prior_picks": pop["prior"]["picks"], "prior_total": p_picks},
            "window": {"recent": win_recent["weeks"], "prior": win_prior["weeks"]},
            "text": text,
            "discord_text": f"**{fname}** " + text[len(fname) + 1:],
        })
    pop_items.sort(key=lambda x: (-abs(x["z"]), x["kind"], x["subject"]))
    items.extend(wr_items)
    items.extend(pop_items[:POP_MAX_ITEMS])

    # Weekly popularity series (complete ISO weeks only)
    series_m = complete_weeks_before(as_of_date, SERIES_WEEKS)
    series = {
        "weeks": [iso_key(m) for m in series_m],
        "week_start": [m.isoformat() for m in series_m],
        "games": [],
        "picks": [],
        "commanders": {n: [] for n in names},
        "factions": {f: [] for f in FACTIONS},
    }
    for m in series_m:
        wk = counts.get(m, {})
        picks = sum(v[0] for v in wk.values())
        series["games"].append(picks // 2)
        series["picks"].append(picks)
        fac = defaultdict(int)
        for n in names:
            g = wk.get(n, [0])[0]
            series["commanders"][n].append(g)
            fac[faction_of(n)] += g
        for f in FACTIONS:
            series["factions"][f].append(fac[f])

    headline = {
        "default_period": DEFAULT_PERIOD,
        "periods": {p: headline_facts(site, p) for p in ALL_PERIODS},
    }
    overview = {
        "default_period": DEFAULT_PERIOD,
        "periods": {p: commander_overview(site, p, commanders_ref) for p in ALL_PERIODS},
    }

    counters = {}
    if model:
        for p in MODEL_PERIODS:
            blk = model["data"].get(p, {}).get("all")
            if blk:
                counters[p] = {
                    "pairs_n20": blk["summary"]["pairs_n20"],
                    "consistent_share": blk["summary"]["consistent_share"],
                    "counters": blk["counters"],
                }

    latest_changes = []
    if changelog:
        cutoff = (as_of_date - timedelta(days=LATEST_CHANGES_DAYS)).isoformat()
        latest_changes = [e for e in changelog.get("entries", []) if e["date"] >= cutoff][:LATEST_CHANGES_MAX]

    pulse = {
        "schema_version": 1,
        "as_of": as_of,
        "week_key_scheme": scheme,
        "windows": {"recent": win_recent, "prior": win_prior},
        "quiet": quiet,
        "gates": gates(),
        "items": items,
        "commanders": cmd_rows,
        "factions": faction_rows,
        "weekly": series,
        "headline_facts": headline,
        "commander_overview": overview,
        "counters": counters,
        "latest_card_changes": latest_changes,
    }
    diagnostics = {
        "scheme": scheme,
        "unparsed_week_keys": bad_keys,
        "share_check_max_abs_diff_pct": _share_crosscheck(site, counts, scheme),
    }
    return pulse, diagnostics


def gates():
    return {
        "recent_weeks": RECENT_WEEKS, "prior_weeks": PRIOR_WEEKS,
        "winrate_min_games_each_side": WR_MIN_GAMES, "winrate_z_threshold": WR_Z_THRESHOLD,
        "winrate_pilot_check_period": PILOT_CHECK_PERIOD,
        "popularity_z_threshold": POP_Z_THRESHOLD,
        "popularity_min_share_change": POP_MIN_SHARE_CHANGE,
        "popularity_min_picks": POP_MIN_PICKS,
        "popularity_min_persistent_weeks": POP_MIN_PERSISTENT_WEEKS,
        "popularity_max_items": POP_MAX_ITEMS,
        "quiet_below_games": QUIET_GAMES,
        "series_weeks": SERIES_WEEKS,
    }


def _share_crosscheck(site, counts, scheme):
    """Max |recomputed share − commander_trends pct| (percentage points) over
    weeks published in both series — a sanity check on the count recovery."""
    ct = site.block("commander_trends", "all")
    if not ct:
        return None
    worst = 0.0
    # Only compare keys that map 1:1 to a week (split legacy weeks excluded).
    monday_keys = defaultdict(list)
    for key in ct.get("dates", []):
        m = week_monday(key, scheme)
        if m:
            monday_keys[m].append(key)
    for i, key in enumerate(ct.get("dates", [])):
        m = week_monday(key, scheme)
        if not m or len(monday_keys[m]) != 1 or m not in counts:
            continue
        picks = sum(v[0] for v in counts[m].values())
        if not picks:
            continue
        for cmd, arr in ct.get("commanders", {}).items():
            mine = 100.0 * counts[m].get(cmd, [0])[0] / picks
            worst = max(worst, abs(mine - (arr[i] or 0)))
    return round(worst, 2)
