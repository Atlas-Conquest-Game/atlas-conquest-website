"""Card changelog: dated card stat changes, additions and removals.

Two modes, chosen automatically:

* **Backfill** (no changelog yet, or ``--rebuild-changelog``): walk the git
  history of ``site/data/cards.json`` (``git log --follow``, committer dates in
  UTC, commits ordered by committer time so merged branches can't interleave).
  Commits are grouped by UTC day and the last state of each day is diffed
  against the previous day. Everything published on the first day of history
  is the baseline (the initial imports that day are setup, not patches). Needs
  full history (``fetch-depth: 0``).
* **Incremental** (normal CI run): diff the current ``cards.json`` against the
  compact snapshot stored in ``site/data/insights/_state/card_changelog_state.json``
  (bookkeeping, not loaded by the site), date any differences with the run's
  ``as_of`` day, then store the new snapshot. No git history needed, so the
  default shallow checkout works. Re-running with the same inputs changes
  nothing.
* **No state and no history** (shallow clone, files missing): refuse
  (FreshBaselineError) unless ``allow_fresh_baseline`` — silently starting an
  empty changelog would overwrite the committed history in CI.

Published (``site/data/insights/card_changelog.json``): cost / attack / speed /
health / type / legendary changes, cards added or removed, and renames from
``pipeline.constants.CARD_RENAMES``. NOT published — written to
``scripts/review/changelog_text.json`` for a human to look at: card text
rewordings, subtype edits, patron/faction reclassification, the token flag,
and token additions/removals (tokens are generated cards; a new token arrives
with the card that makes it).
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from collections import OrderedDict
from datetime import timezone
from pathlib import Path

from insights.common import card_slug, parse_timestamp

try:  # the rename map lives with the pipeline; keep working if it moves
    from pipeline.constants import CARD_RENAMES
except Exception:  # pragma: no cover
    CARD_RENAMES = {}

TRACKED_FIELDS = ["cost", "attack", "speed", "health", "type", "legendary"]
REVIEW_FIELDS = ["text", "subtype", "patron", "faction", "token"]
STATE_FIELDS = TRACKED_FIELDS + ["patron", "faction", "token", "subtype", "text_sha"]

# Lower cost is stronger; higher attack/speed/health is stronger.
_BUFF_SIGN = {"cost": -1, "attack": 1, "speed": 1, "health": 1}
_FIELD_LABELS = {"cost": "Cost", "attack": "Attack", "speed": "Speed", "health": "Health",
                 "type": "Type", "legendary": "Legendary"}

CARDS_REL_PATH = "site/data/cards.json"
STATE_REL_PATH = "_state/card_changelog_state.json"   # relative to the insights dir
ABSENT_TOKEN = "__absent__"   # how a missing field is stored in the snapshot


class FreshBaselineError(RuntimeError):
    """No stored state and no git history: refusing to start an empty changelog."""


class _Absent:
    """A field the record didn't have (older cards.json schema)."""

    def __repr__(self):
        return "ABSENT"


ABSENT = _Absent()


def _sha(text):
    return hashlib.sha1((text or "").encode("utf-8")).hexdigest()[:12]


def card_state(card):
    st = {f: card.get(f, ABSENT) for f in TRACKED_FIELDS + ["patron", "faction", "token", "subtype"]}
    st["text_sha"] = _sha(card["text"]) if "text" in card else ABSENT
    return st


def snapshot(cards):
    return {c["name"]: card_state(c) for c in cards if c.get("name")}


def encode_state(snap):
    """Compact snapshot: one value list per card in ``fields`` order. A field
    the card did not have is stored as ABSENT_TOKEN (distinct from null), so a
    later schema addition is not mistaken for a change."""
    return {
        "fields": list(STATE_FIELDS),
        "absent": ABSENT_TOKEN,
        "cards": {name: [ABSENT_TOKEN if snap[name].get(f, ABSENT) is ABSENT else snap[name][f]
                         for f in STATE_FIELDS]
                  for name in sorted(snap)},
    }


def decode_state(last_state):
    fields = last_state.get("fields") or STATE_FIELDS
    token = last_state.get("absent", ABSENT_TOKEN)
    snap = {}
    for name, values in (last_state.get("cards") or {}).items():
        st = {f: ABSENT for f in STATE_FIELDS}
        for f, v in zip(fields, values):
            st[f] = ABSENT if v == token else v
        snap[name] = st
    return snap


def _comparable(a, b):
    return a is not ABSENT and b is not ABSENT


def _stats(st):
    return {f: (None if st.get(f, ABSENT) is ABSENT else st[f]) for f in TRACKED_FIELDS}


def _direction(changes):
    signs = set()
    for c in changes:
        sign = _BUFF_SIGN.get(c["field"])
        if sign is None or c["from"] is None or c["to"] is None:
            continue
        signs.add("buff" if (c["to"] - c["from"]) * sign > 0 else "nerf")
    if not signs:
        return None
    return signs.pop() if len(signs) == 1 else "mixed"


def _summary(changes):
    parts = []
    for c in changes:
        label = _FIELD_LABELS.get(c["field"], c["field"])
        if c["field"] == "legendary":
            parts.append("Now legendary" if c["to"] else "No longer legendary")
        else:
            fr = "—" if c["from"] is None else c["from"]
            to = "—" if c["to"] is None else c["to"]
            parts.append(f"{label} {fr} → {to}")
    return ", ".join(parts)


def field_changes(old, new):
    out = []
    for f in TRACKED_FIELDS:
        a, b = old.get(f, ABSENT), new.get(f, ABSENT)
        if _comparable(a, b) and a != b:
            out.append({"field": f, "from": a, "to": b})
    return out


def _entry(date, name, kind, st, source, **extra):
    e = {
        "date": date,
        "card": name,
        "slug": card_slug(name),
        "kind": kind,
        "faction": None if st.get("faction", ABSENT) is ABSENT else st["faction"],
        "type": None if st.get("type", ABSENT) is ABSENT else st["type"],
        "token": bool(st.get("token")) if st.get("token", ABSENT) is not ABSENT else False,
    }
    e.update(extra)
    e["source"] = source
    return e


def _review_rows(date, name, old, new, source, old_rec=None, new_rec=None):
    rows = []
    for f in ["subtype", "patron", "faction", "token"]:
        a, b = old.get(f, ABSENT), new.get(f, ABSENT)
        if _comparable(a, b) and a != b:
            rows.append({"date": date, "card": name, "field": f, "from": a, "to": b, "source": source})
    a, b = old.get("text_sha", ABSENT), new.get("text_sha", ABSENT)
    if _comparable(a, b) and a != b:
        fr = old_rec.get("text") if old_rec and _sha(old_rec.get("text")) == a else None
        to = new_rec.get("text") if new_rec and _sha(new_rec.get("text")) == b else None
        rows.append({"date": date, "card": name, "field": "text", "from": fr, "to": to,
                     "from_sha": a, "to_sha": b, "source": source})
    return rows


def diff_states(old, new, date, source, renames=None, old_records=None, new_records=None):
    """Diff two snapshots. Returns (published_entries, review_rows)."""
    renames = CARD_RENAMES if renames is None else renames
    old_records = old_records or {}
    new_records = new_records or {}
    published, review = [], []
    removed = set(old) - set(new)
    added = set(new) - set(old)
    rename_pairs = []
    for o in sorted(removed):
        n = renames.get(o)
        if n and n in added:
            rename_pairs.append((o, n))
    for o, n in rename_pairs:
        removed.discard(o)
        added.discard(n)

    for name in sorted(added):
        st = new[name]
        if st.get("token") is True:
            review.append({"date": date, "card": name, "field": "token-added", "from": None,
                           "to": _stats(st), "source": source})
            continue
        published.append(_entry(date, name, "added", st, source, stats=_stats(st),
                                changes=[], direction=None, summary="New card"))
    for name in sorted(removed):
        st = old[name]
        if st.get("token") is True:
            review.append({"date": date, "card": name, "field": "token-removed",
                           "from": _stats(st), "to": None, "source": source})
            continue
        published.append(_entry(date, name, "removed", st, source, stats=_stats(st),
                                changes=[], direction=None, summary="Removed from the card pool"))
    for o, n in rename_pairs:
        changes = field_changes(old[o], new[n])
        summary = f"Renamed from {o}" + (f"; {_summary(changes)}" if changes else "")
        published.append(_entry(date, n, "renamed", new[n], source, from_name=o,
                                changes=changes, direction=_direction(changes), summary=summary))
        review.extend(_review_rows(date, n, old[o], new[n], source,
                                   old_records.get(o), new_records.get(n)))
    for name in sorted(set(old) & set(new)):
        changes = field_changes(old[name], new[name])
        if changes:
            published.append(_entry(date, name, "changed", new[name], source, changes=changes,
                                    direction=_direction(changes), summary=_summary(changes)))
        review.extend(_review_rows(date, name, old[name], new[name], source,
                                   old_records.get(name), new_records.get(name)))
    return published, review


def _entry_key(e):
    return (e["date"], e["card"], e["kind"])


def merge_entries(existing, new):
    """Fold new entries into existing ones. Same (date, card, kind) entries
    combine their field changes (first ``from`` → last ``to``); a change that
    nets out to nothing disappears."""
    merged = OrderedDict((_entry_key(e), json.loads(json.dumps(e))) for e in existing)
    for e in new:
        k = _entry_key(e)
        added_k = (e["date"], e["card"], "added")
        if e["kind"] == "changed" and added_k in merged:
            # Added and then tweaked on the same day: it's still just "new".
            for c in e["changes"]:
                merged[added_k]["stats"][c["field"]] = c["to"]
            continue
        if k not in merged or e["kind"] != "changed":
            merged[k] = e
            continue
        cur = merged[k]
        by_field = OrderedDict((c["field"], dict(c)) for c in cur.get("changes", []))
        for c in e["changes"]:
            if c["field"] in by_field:
                by_field[c["field"]]["to"] = c["to"]
            else:
                by_field[c["field"]] = dict(c)
        changes = [c for c in by_field.values() if c["from"] != c["to"]]
        if not changes:
            del merged[k]
            continue
        cur.update(e)
        cur["changes"] = [c for f in TRACKED_FIELDS for c in changes if c["field"] == f]
        cur["direction"] = _direction(cur["changes"])
        cur["summary"] = _summary(cur["changes"])
    return sort_entries(list(merged.values()))


def sort_entries(entries):
    kind_order = {"renamed": 0, "added": 1, "changed": 2, "removed": 3}
    entries = sorted(entries, key=lambda e: (e["card"].lower(), kind_order.get(e["kind"], 9)))
    return sorted(entries, key=lambda e: e["date"], reverse=True)


# ─── Git history ──────────────────────────────────────────────────

def _git(repo_dir, *args):
    try:
        res = subprocess.run(["git", *args], cwd=str(repo_dir), capture_output=True,
                             text=True, check=False)
    except FileNotFoundError:
        return None
    if res.returncode != 0:
        return None
    return res.stdout


def is_shallow(repo_dir):
    out = _git(repo_dir, "rev-parse", "--is-shallow-repository")
    return out is None or out.strip() == "true"


def git_history(repo_dir, rel_path=CARDS_REL_PATH):
    """[(utc_date, commit, cards_list)] oldest first, one per UTC day (that
    day's last commit). Empty when git or history is unavailable."""
    out = _git(repo_dir, "log", "--follow", "--format=%x1e%H %cI", "--name-only", "--", rel_path)
    if not out:
        return []
    commits = []
    for chunk in out.split("\x1e"):
        lines = [ln for ln in chunk.strip().splitlines() if ln.strip()]
        if not lines:
            continue
        commit, ts = lines[0].split()
        path = lines[1].strip() if len(lines) > 1 else rel_path
        commits.append((commit, ts, path))
    commits.reverse()
    # Order by committer time (stable, so git's order breaks ties): with merge
    # commits, git log's topological order can interleave parallel branches
    # and make a change look like change-then-revert.
    commits = sorted(commits, key=lambda c: parse_timestamp(c[1]))
    by_day = OrderedDict()
    for commit, ts, path in commits:
        day = parse_timestamp(ts).astimezone(timezone.utc).date().isoformat()
        by_day[day] = (commit, path)  # last commit of the day wins
    history = []
    for day, (commit, path) in by_day.items():
        raw = _git(repo_dir, "show", f"{commit}:{path}")
        if raw is None:
            continue
        try:
            cards = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if isinstance(cards, list):
            history.append((day, commit, cards))
    return history


def head_cards(repo_dir, rel_path=CARDS_REL_PATH):
    raw = _git(repo_dir, "show", f"HEAD:{rel_path}")
    if raw is None:
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, list) else None


# ─── Build ────────────────────────────────────────────────────────

def _records(cards):
    return {c["name"]: c for c in cards or [] if c.get("name")}


def update_changelog(existing, current_cards, as_of_date, as_of, history=None,
                     previous_records=None, renames=None, state=None):
    """Return (changelog_dict, review_rows, mode, state_dict).

    existing:          the current card_changelog.json (or None)
    current_cards:     cards.json as published now
    as_of_date:        'YYYY-MM-DD' used to date incremental changes
    history:           git_history() output, used only without a stored state
    previous_records:  optional full cards list matching the stored state (e.g.
                       HEAD's cards.json) so review rows can show the old text
    state:             the stored snapshot (card_changelog_state.json); falls
                       back to a legacy ``last_state`` inside ``existing``
    mode:              "incremental" | "backfill" | "baseline-only"
    """
    current = snapshot(current_cards)
    current_records = _records(current_cards)
    review = []
    if state is None and existing:
        state = existing.get("last_state")  # files written before the split
    if existing is not None and state:
        mode = "incremental"
        old = decode_state(state)
        pub, rev = diff_states(old, current, as_of_date, "run", renames,
                               _records(previous_records), current_records)
        entries = merge_entries(existing.get("entries", []), pub)
        baseline = existing.get("baseline")
        review.extend(rev)
    elif history:
        mode = "backfill"
        base_day, base_commit, base_cards = history[0]
        baseline = {"date": base_day, "cards": len(base_cards), "source": f"git:{base_commit[:7]}"}
        prev, prev_records = snapshot(base_cards), _records(base_cards)
        entries = []
        for day, commit, cards in history[1:]:
            snap = snapshot(cards)
            pub, rev = diff_states(prev, snap, day, f"git:{commit[:7]}", renames,
                                   prev_records, _records(cards))
            entries = merge_entries(entries, pub)
            review.extend(rev)
            prev, prev_records = snap, _records(cards)
        pub, rev = diff_states(prev, current, as_of_date, "run", renames, prev_records, current_records)
        entries = merge_entries(entries, pub)
        review.extend(rev)
    else:
        mode = "baseline-only"
        baseline = {"date": as_of_date, "cards": len(current_cards), "source": "run"}
        entries = []

    changelog = {
        "schema_version": 1,
        "as_of": as_of,
        "baseline": baseline,
        "tracked_fields": list(TRACKED_FIELDS),
        "date_semantics": ("UTC date the change first appeared in the published cards.json "
                           "(on or after the in-game patch)"),
        "not_published": ("text rewordings, subtype, patron/faction reclassification, token flag and "
                          "token additions/removals (see scripts/review/changelog_text.json)"),
        "entries": entries,
    }
    state_doc = {
        "schema_version": 1,
        "note": ("Bookkeeping for card_changelog.json (snapshot of the last cards.json seen). "
                 "Not for the frontend. Delete only together with card_changelog.json, then run "
                 "build_insights.py --rebuild-changelog in a full clone."),
        **encode_state(current),
    }
    return changelog, review, mode, state_doc


def merge_review(existing, rows):
    """Accumulate review rows (deduped, newest first)."""
    seen = OrderedDict()
    for r in (existing or {}).get("entries", []) + list(rows):
        key = (r["date"], r["card"], r["field"], json.dumps(r.get("to"), sort_keys=True),
               r.get("to_sha"))
        seen[key] = r
    entries = sorted(seen.values(), key=lambda r: (r["card"].lower(), r["field"]))
    entries = sorted(entries, key=lambda r: r["date"], reverse=True)
    return {
        "note": ("Card edits deliberately NOT published in site/data/insights/card_changelog.json "
                 "(text rewordings, subtype, patron/faction reclassification, token flag, token "
                 "additions/removals). Review by hand; promote anything gameplay-relevant."),
        "entries": entries,
    }


def _read_json(path):
    if path is None or not Path(path).exists():
        return None
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def build_card_changelog(data_dir: Path, out_path: Path, review_path: Path, repo_dir: Path,
                         as_of_date, as_of, rebuild=False, use_git=True, state_path=None,
                         allow_fresh_baseline=False):
    """Returns (changelog, review_doc, mode, state_doc). Writes nothing.

    Raises FreshBaselineError when there is no stored state and no git history
    (e.g. card_changelog.json missing on a shallow CI clone) unless
    ``allow_fresh_baseline``."""
    out_path = Path(out_path)
    if state_path is None:
        state_path = out_path.parent / STATE_REL_PATH
    current_cards = json.loads((Path(data_dir) / "cards.json").read_text(encoding="utf-8"))
    existing = None if rebuild else _read_json(out_path)
    state = None if rebuild else _read_json(state_path)
    if state is None and existing:
        state = existing.get("last_state")
    history = None
    previous_records = None
    if use_git:
        if existing is not None and state:
            previous_records = head_cards(repo_dir)
        elif not is_shallow(repo_dir):
            history = git_history(repo_dir)
    changelog, review, mode, state_doc = update_changelog(
        existing, current_cards, as_of_date, as_of, history=history,
        previous_records=previous_records, state=state)
    if mode == "baseline-only":
        missing = [str(p.name) for p, present in ((out_path, existing is not None),
                                                   (Path(state_path), bool(state))) if not present]
        msg = (f"no stored changelog state ({' and '.join(missing) or 'state'} missing) and no git "
               "history is available (shallow clone or --no-git).")
        if not allow_fresh_baseline:
            raise FreshBaselineError(
                msg + " Refusing to start an empty changelog over the committed one. Restore "
                "site/data/insights/card_changelog.json + _state/, run build_insights.py "
                "--rebuild-changelog in a full clone, or pass --allow-fresh-baseline.")
        print("WARNING: " + msg + " Starting a fresh baseline with no past entries "
              "(--allow-fresh-baseline).", file=sys.stderr)
    review_existing = None
    if review_path.exists() and not rebuild:
        try:
            review_existing = json.loads(review_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            review_existing = None
    review_doc = merge_review(review_existing, review)
    return changelog, review_doc, mode, state_doc
