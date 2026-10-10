"""Pilot concentration: how much of a sample comes from one player.

The pipeline publishes no per-player game counts, but archetypes.json lists
each archetype's top exact decklists with the list's game ``count`` and its
most common pilot ``username``. Crediting every listed game to that list's
most common pilot gives an estimate of the busiest pilot's share of a
commander's (or archetype's) games:

    top_pilot_share = max over pilots of (credited games) / deck_count

It is an estimate, not a bound: lists outside the published top 20 are not
seen (pushes it down), and other people's games on the same exact list are
credited to its main pilot (pushes it up). ``listed_share`` says how much of
the sample the published lists cover. Usernames "Unknown"/blank are never
credited. Different accounts of one person (e.g. "Michael1"/"Michael") are
counted separately.
"""

from __future__ import annotations

from collections import Counter

from insights.common import r4
from insights.stats_kit import MAX_TOP_PILOT_SHARE

_ANON = {"", "unknown"}


def concentration(decklists, total):
    """{top_pilot_share, pilots_listed, listed_share, concentrated} for a
    sample of ``total`` games whose published lists are ``decklists``."""
    users = Counter()
    listed = 0
    for d in decklists or []:
        c = int(d.get("count") or 0)
        if c <= 0:
            continue
        listed += c
        u = (d.get("username") or "").strip()
        if u.lower() not in _ANON:
            users[u] += c
    total = int(total or 0)
    if total <= 0 or not users:
        return {"top_pilot_share": None, "pilots_listed": len(users),
                "listed_share": r4(min(1.0, listed / total)) if total else None,
                "concentrated": False}
    share = min(1.0, max(users.values()) / total)
    return {
        "top_pilot_share": r4(share),
        "pilots_listed": len(users),
        "listed_share": r4(min(1.0, listed / total)),
        "concentrated": share > MAX_TOP_PILOT_SHARE,
    }


def commander_concentration(site, period, map_name, name):
    """Concentration of one commander's games in archetypes.json[period][map]
    (all archetypes together). None when the commander isn't listed."""
    blk = site.block("archetypes", period, map_name) or {}
    cmd = (blk.get("commanders") or {}).get(name)
    if not cmd:
        return None
    lists = [d for a in cmd.get("archetypes", []) for d in (a.get("decklists") or [])]
    return concentration(lists, cmd.get("deck_count", 0))


def archetype_concentration(archetype):
    return concentration(archetype.get("decklists"), archetype.get("deck_count", 0))
