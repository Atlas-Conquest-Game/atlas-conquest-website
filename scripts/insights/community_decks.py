"""Community decks: a flat, searchable index of named decklists.

Source: the ``decklists`` rows inside archetypes.json, across every period ×
map. Each row there is one exact card list (most common deck name and pilot
username for that list) among the top lists of an archetype. Usernames and
deck names are kept on purpose — players search and copy-paste them.

One index row per (commander, deck_code). The deck code encodes the deck name
and the card multiset, so the same list under a different name is a separate
row.

  games       largest per-window count seen for the list — a lower bound on
              its all-time games (lists outside an archetype's top-N in a
              window are not published there)
  games_30d   count in the 1m / all-maps listing (null if not listed there)
  last_seen   narrowest period whose listings include it: 1m | 3m | 6m | all
              (recency proxy; the pipeline publishes no per-list dates)
  maps        maps whose map-specific listings include it

Per-list wins are not published by the pipeline, so there is no winrate here;
the archetype's record lives in the commander profile.
"""

from __future__ import annotations

from collections import Counter

from insights.common import MAPS, commander_slug, dumps
from insights.profiles import archetype_label

PERIOD_ORDER = ["1m", "3m", "6m", "all"]
CHUNK_BYTES = 1_500_000


def build_rows(archetypes, commanders_ref):
    idx = {}
    for period in PERIOD_ORDER:
        for map_name in MAPS:
            blk = (archetypes.get(period) or {}).get(map_name) or {}
            for cmd, v in sorted((blk.get("commanders") or {}).items()):
                for a in v.get("archetypes", []):
                    label = archetype_label(a.get("name"))
                    for d in a.get("decklists", []):
                        code = d.get("deck_code")
                        if not code:
                            continue
                        key = (cmd, code)
                        rec = idx.get(key)
                        count = int(d.get("count") or 0)
                        if rec is None:
                            rec = idx[key] = {
                                "deck_name": d.get("deck_name") or "Unknown",
                                "users": Counter(),
                                "commander": cmd,
                                "archetype": label,
                                "archetype_id": a.get("id"),
                                "deck_code": code,
                                "games": 0,
                                "games_30d": None,
                                "last_seen": period,
                                "maps": set(),
                            }
                        rec["users"][d.get("username") or "Unknown"] += count
                        rec["games"] = max(rec["games"], count)
                        if period == "1m" and map_name == "all":
                            rec["games_30d"] = max(rec["games_30d"] or 0, count)
                        if map_name != "all":
                            rec["maps"].add(map_name)
    rows = []
    for rec in idx.values():
        user = sorted(rec["users"].items(), key=lambda kv: (-kv[1], kv[0].lower()))[0][0]
        cmd = rec["commander"]
        rows.append({
            "deck_name": rec["deck_name"],
            "username": user,
            "commander": cmd,
            "commander_slug": commander_slug(cmd),
            "faction": (commanders_ref.get(cmd) or {}).get("faction"),
            "archetype": rec["archetype"],
            "deck_code": rec["deck_code"],
            "games": rec["games"],
            "games_30d": rec["games_30d"],
            "last_seen": rec["last_seen"],
            "maps": sorted(rec["maps"]),
        })
    rank = {p: i for i, p in enumerate(PERIOD_ORDER)}
    rows.sort(key=lambda r: (rank[r["last_seen"]], -r["games"], r["deck_name"].lower(),
                             r["username"].lower(), r["commander"], r["deck_code"]))
    return rows


def build_community_decks(archetypes, commanders, as_of, chunk_bytes=CHUNK_BYTES):
    """Returns {relative_path: document}. One file normally; when the index
    would exceed ``chunk_bytes`` it is split into community_decks/part-NNN.json
    files and community_decks.json lists them."""
    commanders_ref = {c["name"]: c for c in commanders or []}
    rows = build_rows(archetypes, commanders_ref)
    head = {
        "schema_version": 1,
        "as_of": as_of,
        "count": len(rows),
        "sort": "last_seen (1m, 3m, 6m, all) then games desc",
        "fields": {
            "games": "lower bound on all-time games with this exact list",
            "games_30d": "games in the last 30 days (null when not among that window's top lists)",
            "last_seen": "narrowest period whose published listings include the list",
        },
    }
    single = {**head, "chunks": None, "decks": rows}
    if len(dumps(single).encode("utf-8")) <= chunk_bytes:
        return {"community_decks.json": single}

    files, chunk, size = {}, [], 0
    parts = []
    for row in rows:
        b = len(dumps(row).encode("utf-8")) + 1
        if chunk and size + b > chunk_bytes - 1024:
            parts.append(chunk)
            chunk, size = [], 0
        chunk.append(row)
        size += b
    if chunk:
        parts.append(chunk)
    names = []
    for i, part in enumerate(parts, start=1):
        rel = f"community_decks/part-{i:03d}.json"
        names.append(rel)
        files[rel] = {"schema_version": 1, "as_of": as_of, "part": i, "of": len(parts), "decks": part}
    files["community_decks.json"] = {**head, "chunks": names, "decks": []}
    return files
