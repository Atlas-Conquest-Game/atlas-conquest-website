"""Commander profiles: one small JSON per commander (≤ 80 KB).

A profile page (and mobile) loads only ``insights/commanders/<slug>.json`` —
never the multi-megabyte commander_card_stats / commander_mulligan_stats /
archetypes files the numbers are distilled from.

Every winrate here follows the stats-kit gates, plus the pilot gates: a
sample that is mostly one player's games (concentration.py) or comes from
fewer than 5 players (commander_stats ``pilots`` null) gets no estimate.
"""

from __future__ import annotations

import re
from collections import Counter

from insights.common import (
    MAPS, PERIOD_LABELS, PROFILE_WINDOWS, card_slug, commander_slug, dumps,
    mirror_free_counts, plain_text, r2, r4,
)
from insights.concentration import archetype_concentration, commander_concentration
from insights.matchup_model import RELIABLE_N
from insights.stats_kit import apply_pilot_gates, pilots_status, rate_block

MAX_PROFILE_BYTES = 80 * 1024
SPLIT_MIN_GAMES = 20          # first/second split: each side needs this many
TEMPO_MIN_BUCKET = 30         # else fall back to the all-time window
ARCHETYPE_MIN_GAMES = 30      # ways to play: record + interval at/above this
MULLIGAN_MIN_SEEN = 30        # opening-hand guide: times a card was seen
SIGNATURE_MIN_INCLUSION = 0.25
SIGNATURE_MIN_DECKS = 5
SIGNATURE_COUNT = 8
CORE_COUNT = 10
MULLIGAN_COUNT = 5
DECKS_PER_ARCHETYPE = 3
KEY_CARDS_PER_ARCHETYPE = 6
BEST_WORST_COUNT = 3
# A commander is a "peer" for a card of faction F when F is its own faction or
# its decks in the window run at least this many distinct cards of F.
PEER_MIN_DISTINCT_CARDS = 3
OPEN_FACTIONS = {None, "", "neutral", "treasure"}

# turn_winrates buckets are ["1-5", "5-8", "8-11", "11-14", "14+"] (the
# player's own turns, lower bound inclusive).
TEMPO_BUCKETS = [
    ("short", "Under 8 turns", [0, 1]),
    ("mid", "8–10 turns", [2]),
    ("long", "11+ turns", [3, 4]),
]

_PREFIX_RE = re.compile(r"^[^:]{1,40}:\s+")


def archetype_label(name):
    """'Macks: Red Dragon / Lay Claim' -> 'Red Dragon / Lay Claim'."""
    return _PREFIX_RE.sub("", name or "", count=1) or (name or "")


def _row_for(rows, name):
    for r in rows or []:
        if r.get("name") == name:
            return r
    return None


def commander_record(site, window, map_name, name):
    """Headline record vs the field: mirror-free rate block with the pilot
    gates applied, plus with-mirror counts, pick share and pilot info.

    Shared by profiles (record, maps) and the meta pulse overview."""
    rows = site.block("commander_stats", window, map_name) or []
    row = _row_for(rows, name)
    total = sum(r.get("matches", 0) for r in rows)
    w, g, mirrors = mirror_free_counts(site, window, map_name, name)
    rb = rate_block(w, g)
    conc = commander_concentration(site, window, map_name, name)
    status = pilots_status(row)
    apply_pilot_gates(rb, conc, status)
    matches = (row or {}).get("matches", 0)
    rb.update({
        "basis": "mirror-free",
        "games_incl_mirrors": matches,
        "mirror_games": mirrors,
        "pick_share": r4(matches / total) if matches and total else None,
        "pilots": (row or {}).get("pilots"),
        "pilots_status": status,
        "concentration": conc,
    })
    return rb


def _gate_from(record):
    return record.get("concentration"), record.get("pilots_status")


def _turn_order(site, window, name, gate):
    ft = (site.block("first_turn", window) or {}).get("per_commander", {}).get(name) or {}
    first = rate_block(ft.get("first_wins", 0), ft.get("first_games", 0))
    second = rate_block(ft.get("second_wins", 0), ft.get("second_games", 0))
    reportable = first["games"] >= SPLIT_MIN_GAMES and second["games"] >= SPLIT_MIN_GAMES
    if reportable:
        for side in (first, second):
            apply_pilot_gates(side, *gate)
    else:
        for side in (first, second):
            side["wr"] = side["lo"] = side["hi"] = None
            side["verdict"] = "too_early"
            side["verdict_label"] = "Too early to tell"
    return {"first": first, "second": second, "reportable": reportable,
            "min_games_each_side": SPLIT_MIN_GAMES}


def _maps(site, window, name):
    return [{"map": m, **commander_record(site, window, m, name)} for m in MAPS[1:]]


def _tempo_counts(block, name):
    rows = (block or {}).get("commanders", {}).get(name)
    if not rows:
        return None
    out = []
    for key, label, idxs in TEMPO_BUCKETS:
        g = sum((rows[i] or {}).get("games", 0) for i in idxs if i < len(rows))
        w = sum(int(round(((rows[i] or {}).get("winrate") or 0) * (rows[i] or {}).get("games", 0)))
                for i in idxs if i < len(rows))
        out.append((key, label, g, w))
    return out


def _field_shares(block):
    totals = [0] * len(TEMPO_BUCKETS)
    for rows in (block or {}).get("commanders", {}).values():
        for k, (_, _, idxs) in enumerate(TEMPO_BUCKETS):
            totals[k] += sum((rows[i] or {}).get("games", 0) for i in idxs if i < len(rows))
    s = sum(totals)
    return [r4(t / s) if s else None for t in totals]


def _tempo(site, window, name, gate=None):
    source = window
    block = site.block("turn_winrates", window)
    counts = _tempo_counts(block, name)
    fallback = False
    if counts is None or any(g < TEMPO_MIN_BUCKET for _, _, g, _ in counts):
        if window != "all":
            all_block = site.block("turn_winrates", "all")
            all_counts = _tempo_counts(all_block, name)
            if all_counts is not None:
                block, counts, source, fallback = all_block, all_counts, "all", True
    if counts is None:
        return None
    if fallback or gate is None:
        rec = _row_for(site.block("commander_stats", source, "all") or [], name)
        gate = (commander_concentration(site, source, "all", name), pilots_status(rec))
    total = sum(g for _, _, g, _ in counts)
    field = _field_shares(block)
    buckets = []
    for k, (key, label, g, w) in enumerate(counts):
        rb = apply_pilot_gates(rate_block(w, g), *gate)
        buckets.append({
            "key": key, "label": label,
            "share": r4(g / total) if total else None,
            "field_share": field[k],
            **rb,
        })
    return {
        "source_window": source, "fallback": fallback,
        "min_games_per_bucket": TEMPO_MIN_BUCKET, "games": total,
        "turns": "the commander's own turns (mirror games included)",
        "buckets": buckets,
    }


def _est_key(o):
    return (o["est"] is None, -(o["est"] or 0.0), -o["n"], o["opponent"])


def _matchups(model, window, name):
    blk = ((model or {}).get("data", {}).get(window) or {}).get("all")
    if not blk:
        return None
    me = next((c for c in blk["commanders"] if c["name"] == name), None)
    opponents = []
    for p in blk["pairs"]:
        if p["a"] != name:
            continue
        opponents.append({
            "opponent": p["b"], "slug": commander_slug(p["b"]),
            "n": p["n"], "wins": p["wins"], "losses": p["n"] - p["wins"],
            "raw_wr": p["raw_wr"], "expected": p["expected"],
            "est": p["est"], "lo": p["lo"], "hi": p["hi"],
            "evidence": p["evidence"], "favored": p["favored"],
        })
    opponents.sort(key=_est_key)
    played = {o["opponent"] for o in opponents}
    unplayed = sorted(c["name"] for c in blk["commanders"] if c["name"] != name and c["name"] not in played)
    # Superlatives only from pairs with enough games whose posterior interval
    # excludes 50% and whose raw record agrees (favored is set).
    solid = [o for o in opponents if o["n"] >= RELIABLE_N and o["evidence"] in ("counter", "lean")]
    best = [o["opponent"] for o in solid if o["favored"] == "a"][:BEST_WORST_COUNT]
    worst = [o["opponent"] for o in sorted(solid, key=lambda o: (o["est"], o["opponent"]))
             if o["favored"] == "b"][:BEST_WORST_COUNT]
    me = me or {}
    return {
        "model_window": window,
        "non_mirror_games": me.get("games", 0),
        "strength": me.get("strength"),
        "strength_lo": me.get("strength_lo"),
        "strength_hi": me.get("strength_hi"),
        "expected_vs_field": me.get("expected_vs_field"),
        "expected_vs_field_lo": me.get("expected_vs_field_lo"),
        "expected_vs_field_hi": me.get("expected_vs_field_hi"),
        "best": best,
        "worst": worst,
        "min_games_for_best_worst": RELIABLE_N,
        "opponents": opponents,
        "unplayed": unplayed,
    }


def _ways_to_play(site, window, name):
    blk = site.block("archetypes", window) or {}
    cmd = (blk.get("commanders") or {}).get(name)
    if not cmd:
        return {"deck_count": 0, "skipped": True, "min_games_for_record": ARCHETYPE_MIN_GAMES,
                "archetypes": []}
    out = []
    for a in cmd.get("archetypes", []):
        n = a.get("deck_count", 0)
        established = n >= ARCHETYPE_MIN_GAMES
        conc = archetype_concentration(a)
        row = {
            "id": a.get("id"),
            "label": archetype_label(a.get("name")),
            "games": n,
            "share": a.get("commander_share"),
            "status": "established" if established else "emerging",
            "concentration": conc,
        }
        if established:
            row["record"] = apply_pilot_gates(rate_block(a.get("wins", 0), n), conc)
        row["key_cards"] = [{"name": c["name"], "slug": card_slug(c["name"])}
                            for c in (a.get("key_cards") or [])[:KEY_CARDS_PER_ARCHETYPE]]
        row["decks"] = [{
            "deck_name": d.get("deck_name"), "username": d.get("username"),
            "deck_code": d.get("deck_code"), "games": d.get("count"),
        } for d in (a.get("decklists") or []) if d.get("deck_code")][:DECKS_PER_ARCHETYPE]
        out.append(row)
    out.sort(key=lambda r: (-r["games"], r["label"]))
    return {
        "deck_count": cmd.get("deck_count", 0),
        "skipped": bool(cmd.get("skipped")),
        "min_games_for_record": ARCHETYPE_MIN_GAMES,
        "archetypes": out,
    }


def peer_baselines(ccs_block, card_ref, commanders_ref):
    """Card -> (mean inclusion rate across peer commanders, number of peers).

    Peers of a card are the commanders that can and do run its faction: the
    card's faction is their own, or their decks in this window run at least
    PEER_MIN_DISTINCT_CARDS distinct cards of that faction. Neutral (and
    treasure / unknown-faction) cards: every commander. A peer that never runs
    the card counts as 0; the commander itself is included."""
    cmds = sorted((ccs_block or {}).keys())
    incl, runs = {}, {}
    for c in cmds:
        rows = ccs_block[c] or []
        incl[c] = {r["name"]: r.get("inclusion_rate", 0.0) for r in rows}
        cnt = Counter()
        for r in rows:
            ref = card_ref.get(r["name"]) or {}
            if not ref.get("token"):
                cnt[ref.get("faction")] += 1
        fac = {f for f, k in cnt.items() if k >= PEER_MIN_DISTINCT_CARDS}
        own = (commanders_ref.get(c) or {}).get("faction")
        if own:
            fac.add(own)
        runs[c] = fac
    out = {}
    for card in sorted(set().union(*incl.values()) if incl else ()):
        f = (card_ref.get(card) or {}).get("faction")
        peers = cmds if f in OPEN_FACTIONS else [c for c in cmds if f in runs[c]]
        if not peers:
            peers = cmds
        out[card] = (sum(incl[c].get(card, 0.0) for c in peers) / len(peers), len(peers))
    return out


def _cards(site, window, name, card_ref, commanders_ref, peer_cache):
    ccs = site.block("commander_card_stats", window) or {}
    rows = ccs.get(name) or []
    if window not in peer_cache:
        peer_cache[window] = peer_baselines(ccs, card_ref, commanders_ref)
    peers = peer_cache[window]
    rows = [r for r in rows if not (card_ref.get(r["name"]) or {}).get("token")]

    def base(r):
        ref = card_ref.get(r["name"]) or {}
        return {"name": r["name"], "slug": card_slug(r["name"]), "type": ref.get("type"),
                "cost": ref.get("cost"), "faction": ref.get("faction")}

    sig = []
    for r in rows:
        if r.get("inclusion_rate", 0) < SIGNATURE_MIN_INCLUSION or r.get("deck_count", 0) < SIGNATURE_MIN_DECKS:
            continue
        avg, n_peers = peers.get(r["name"], (0.0, 0))
        sig.append({**base(r), "inclusion_rate": r4(r["inclusion_rate"]),
                    "avg_inclusion_peers": r4(avg), "peers": n_peers,
                    "lift": r4(r["inclusion_rate"] - avg), "avg_copies": r2(r.get("avg_copies")),
                    "decks": r.get("deck_count", 0)})
    sig.sort(key=lambda s: (-s["lift"], -s["inclusion_rate"], s["name"]))
    core = sorted(rows, key=lambda r: (-r.get("inclusion_rate", 0), r["name"]))[:CORE_COUNT]
    return {
        "games": rows[0]["games"] if rows else 0,
        "signature": sig[:SIGNATURE_COUNT],
        "core": [{**base(r), "inclusion_rate": r4(r["inclusion_rate"]),
                  "avg_copies": r2(r.get("avg_copies"))} for r in core],
        "baseline": ("avg_inclusion_peers = mean inclusion rate across the commanders that can and do "
                     "run the card's faction in this window (own faction, or >= "
                     f"{PEER_MIN_DISTINCT_CARDS} distinct cards of it; neutral cards: all commanders); "
                     "lift = inclusion_rate - avg_inclusion_peers"),
    }


def _opening_hand(site, window, name, card_ref):
    rows = (site.block("commander_mulligan_stats", window) or {}).get(name) or []
    hands = rows[0].get("games", 0) if rows else 0
    eligible = [r for r in rows if r.get("total_seen", 0) >= MULLIGAN_MIN_SEEN
                and not (card_ref.get(r["name"]) or {}).get("token")]

    def fmt(r):
        return {"name": r["name"], "slug": card_slug(r["name"]), "keep_rate": r4(r["keep_rate"]),
                "kept": r["kept_count"], "seen": r["total_seen"],
                "norm_keep_delta": r4(r.get("norm_keep_delta"))}

    kept = sorted(eligible, key=lambda r: (-r["keep_rate"], -r["total_seen"], r["name"]))[:MULLIGAN_COUNT]
    kept_names = {r["name"] for r in kept}
    returned = [r for r in sorted(eligible, key=lambda r: (r["keep_rate"], -r["total_seen"], r["name"]))
                if r["name"] not in kept_names][:MULLIGAN_COUNT]
    return {"hands": hands, "min_seen": MULLIGAN_MIN_SEEN,
            "most_kept": [fmt(r) for r in kept], "most_returned": [fmt(r) for r in returned]}


def _deck_composition(site, window, name):
    d = (site.block("deck_composition", window) or {}).get(name)
    if not d:
        return None
    hist = d.get("cost_histogram") or {}
    return {
        "decks": d.get("deck_count", 0),
        "avg_cost": d.get("avg_cost"),
        "avg_minions": d.get("avg_minion_count"),
        "avg_spells": d.get("avg_spell_count"),
        "avg_patron_cards": d.get("avg_patron_cards"),
        "avg_neutral_cards": d.get("avg_neutral_cards"),
        "avg_other_cards": d.get("avg_other_cards"),
        "cost_curve": {"labels": hist.get("labels", []), "avg_cards": hist.get("all_decks", [])},
    }


def identity(cmd):
    name = cmd["name"]
    slug = commander_slug(name)
    return {
        "name": name,
        "slug": slug,
        "faction": cmd.get("faction"),
        "patron": cmd.get("patron"),
        "subtype": cmd.get("subtype"),
        "ability_text": cmd.get("text"),
        "ability_text_plain": plain_text(cmd.get("text")),
        "stats": {k: cmd.get(k) for k in ("dominion", "intellect", "speed", "health")},
        "art": cmd.get("art") or f"assets/commanders/{slug}.jpg",
        "deck_page": f"decks/{slug}/",
    }


def build_profile(site, cmd, model, as_of, card_ref, commanders_ref, peer_cache):
    name = cmd["name"]
    windows = {}
    for w in PROFILE_WINDOWS:
        record = commander_record(site, w, "all", name)
        gate = _gate_from(record)
        windows[w] = {
            "label": PERIOD_LABELS[w],
            "record": record,
            "turn_order": _turn_order(site, w, name, gate),
            "maps": _maps(site, w, name),
            "tempo": _tempo(site, w, name, gate),
            "matchups": _matchups(model, w, name),
            "ways_to_play": _ways_to_play(site, w, name),
            "cards": _cards(site, w, name, card_ref, commanders_ref, peer_cache),
            "opening_hand": _opening_hand(site, w, name, card_ref),
            "deck_composition": _deck_composition(site, w, name),
        }
    profile = {
        "schema_version": 1,
        "as_of": as_of,
        "identity": identity(cmd),
        "default_window": "3m",
        "windows": windows,
    }
    return _fit_budget(profile)


def _fit_budget(profile):
    """Trim the bulkiest optional lists until the file fits MAX_PROFILE_BYTES."""
    steps = [
        ("decks", 2), ("decks", 1), ("key_cards", 3), ("archetypes", 6), ("archetypes", 4),
    ]
    for what, keep in steps:
        if len(dumps(profile).encode("utf-8")) <= MAX_PROFILE_BYTES:
            break
        for w in profile["windows"].values():
            wtp = w["ways_to_play"]
            if what == "archetypes":
                wtp["archetypes"] = wtp["archetypes"][:keep]
            else:
                for a in wtp["archetypes"]:
                    a[what] = a[what][:keep]
    profile["trimmed"] = len(dumps(profile).encode("utf-8")) > MAX_PROFILE_BYTES
    return profile


def build_profiles(site, model, as_of):
    card_ref = {c["name"]: c for c in site.get("cards", default=[])}
    commanders = site.get("commanders", default=[])
    commanders_ref = {c["name"]: c for c in commanders}
    peer_cache = {}
    out = {}
    for cmd in sorted(commanders, key=lambda c: c["name"]):
        out[commander_slug(cmd["name"])] = build_profile(site, cmd, model, as_of, card_ref,
                                                         commanders_ref, peer_cache)
    return out
