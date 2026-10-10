"""Build every insights file from the published site data.

Deterministic: the only notion of "now" is ``as_of`` (default: the published
metadata.json ``last_updated``), output JSON is written with a stable key order
and only when the bytes change, so re-running on the same inputs is a no-op.
Writes only into ``out_dir`` (site/data/insights/) plus the review file.

Everything is computed in memory first and written only when every builder
has succeeded, so a failure never leaves a half-updated set of files for CI to
commit.
"""

from __future__ import annotations

import math
from collections import Counter
from pathlib import Path

from insights import matchup_model as mm
from insights import meta_pulse as mp
from insights import profiles as pf
from insights import stats_kit as sk
from insights.card_changelog import STATE_REL_PATH, build_card_changelog
from insights.common import (
    ALL_PERIODS, DEFAULT_PERIOD, MAPS, MODEL_PERIODS, PERIOD_LABELS, PROFILE_WINDOWS,
    SiteData, iso_z, parse_timestamp, write_json,
)
from insights.community_decks import CHUNK_BYTES, build_community_decks

FILE_DESCRIPTIONS = {
    "index.json": "Manifest: as_of, source data version, files, gates and thresholds",
    "matchup_model.json": "Bradley-Terry strengths + shrunk pairwise matchup estimates per period × map",
    "meta_pulse.json": ("State of the Meta hub: what changed (last 4 ISO weeks vs prior 8), "
                        "commander overview with intervals, counters, headline facts, weekly popularity"),
    "card_changelog.json": "Dated card stat changes, additions, removals and renames",
    "community_decks.json": "Flat searchable index of named community decklists",
    STATE_REL_PATH: "Bookkeeping for the card changelog (not for the frontend)",
}


def gates():
    return {
        "stats_kit": {
            "z": sk.Z95,
            "interval": "95% Wilson score interval",
            "min_games_for_estimate": sk.MIN_GAMES_FOR_ESTIMATE,
            "low_data_below_games": sk.LOW_DATA_GAMES,
            "max_top_pilot_share": sk.MAX_TOP_PILOT_SHARE,
            "min_pilots": sk.MIN_PILOTS,
            "verdicts": sk.VERDICT_LABELS,
            "verdict_rules": [
                "n < 20: too_early (no point estimate)",
                "fewer than 5 pilots (commander_stats pilots null): few_players (no estimate)",
                "top pilot > 50% of the games: one_player (no estimate)",
                "lo > 0.5: above_even",
                "hi < 0.5: below_even",
                "interval straddles 0.5 and n < 40: too_early",
                "interval straddles 0.5 and n >= 40: even",
            ],
        },
        "matchup_model": {
            "prior_games": mm.PRIOR_GAMES, "bt_prior_games": mm.BT_PRIOR_GAMES,
            "low_data_below_n": mm.LOW_DATA_N, "counter_min_n": mm.COUNTER_MIN_N,
            "counter_margin": mm.COUNTER_MARGIN, "counter_min_edge": mm.COUNTER_MIN_EDGE,
            "even_min_n": mm.EVEN_MIN_N, "raw_wr_min_n": mm.RELIABLE_N,
            "strength_min_games": mm.STRENGTH_MIN_GAMES,
            "evidence_labels": mm.EVIDENCE_LABELS,
        },
        "meta_pulse": mp.gates(),
        "profiles": {
            "max_bytes": pf.MAX_PROFILE_BYTES, "turn_order_min_games_each_side": pf.SPLIT_MIN_GAMES,
            "tempo_min_games_per_bucket": pf.TEMPO_MIN_BUCKET,
            "archetype_min_games_for_record": pf.ARCHETYPE_MIN_GAMES,
            "best_worst_min_games": mm.RELIABLE_N,
            "mulligan_min_seen": pf.MULLIGAN_MIN_SEEN,
            "signature_min_inclusion": pf.SIGNATURE_MIN_INCLUSION,
            "peer_min_distinct_cards": pf.PEER_MIN_DISTINCT_CARDS,
        },
        "community_decks": {"chunk_bytes": CHUNK_BYTES},
    }


def resolve_as_of(site, as_of=None):
    if as_of:
        dt = parse_timestamp(as_of)
    else:
        meta = site.block("metadata", "all") or {}
        if not meta.get("last_updated"):
            raise SystemExit("metadata.json has no last_updated; pass --as-of")
        dt = parse_timestamp(meta["last_updated"])
    return dt, iso_z(dt)


def _check_finite(obj, path="$"):
    """Raise if any float in the tree is NaN/inf (belt and braces — dumps()
    already refuses them)."""
    if isinstance(obj, float):
        if not math.isfinite(obj):
            raise ValueError(f"non-finite number at {path}")
    elif isinstance(obj, dict):
        for k, v in obj.items():
            _check_finite(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            _check_finite(v, f"{path}[{i}]")


def build_all(data_dir, out_dir, review_dir, repo_dir, as_of=None, rebuild_changelog=False,
              use_git=True, allow_fresh_baseline=False):
    data_dir, out_dir, review_dir = Path(data_dir), Path(out_dir), Path(review_dir)
    site = SiteData(data_dir)
    as_of_dt, as_of_s = resolve_as_of(site, as_of)
    as_of_date = as_of_dt.date().isoformat()
    outputs = {}   # rel path -> document; written only after everything succeeded

    def emit(rel, obj):
        _check_finite(obj)
        outputs[rel] = obj

    # 1. Card changelog (first: the hub embeds its latest entries)
    changelog, review_doc, cl_mode, cl_state = build_card_changelog(
        data_dir, out_dir / "card_changelog.json", review_dir / "changelog_text.json",
        Path(repo_dir), as_of_date, as_of_s, rebuild=rebuild_changelog, use_git=use_git,
        state_path=out_dir / STATE_REL_PATH, allow_fresh_baseline=allow_fresh_baseline)
    emit("card_changelog.json", changelog)
    emit(STATE_REL_PATH, cl_state)

    # 2. Matchup model
    model = mm.build_matchup_model(site["matchups"], as_of_s)
    emit("matchup_model.json", model)

    # 3. Commander profiles
    profiles = pf.build_profiles(site, model, as_of_s)
    for slug, prof in profiles.items():
        emit(f"commanders/{slug}.json", prof)

    # 4. Meta pulse
    pulse, pulse_diag = mp.build_meta_pulse(site, as_of_dt, as_of_s, model=model, changelog=changelog)
    emit("meta_pulse.json", pulse)

    # 5. Community decks
    deck_files = build_community_decks(site["archetypes"], site.get("commanders", default=[]), as_of_s)
    for rel, doc in deck_files.items():
        emit(rel, doc)

    # 6. Write (only now that every builder succeeded), then drop stale files
    written = {rel: write_json(out_dir / rel, obj) for rel, obj in outputs.items()}
    write_json(review_dir / "changelog_text.json", review_doc, pretty=True)
    for sub in ("commanders", "community_decks"):
        d = out_dir / sub
        if d.exists():
            for stale in d.glob("*.json"):
                if f"{sub}/{stale.name}" not in outputs:
                    stale.unlink()

    # 7. Manifest
    meta = site.block("metadata", "all") or {}
    files = []
    for rel in sorted(written):
        desc = FILE_DESCRIPTIONS.get(rel)
        if rel.startswith("commanders/"):
            desc = "Commander profile"
        elif rel.startswith("community_decks/"):
            desc = "Community decks index chunk"
        files.append({"path": rel, "bytes": written[rel], "description": desc})
    index = {
        "schema_version": 1,
        "as_of": as_of_s,
        "source": {
            "last_updated": meta.get("last_updated"),
            "total_matches": meta.get("total_matches"),
            "total_players": meta.get("total_players"),
            "data_version": meta.get("data_version"),
            "week_key_scheme": pulse["week_key_scheme"],
        },
        "windows": {
            "labels": PERIOD_LABELS, "all_periods": ALL_PERIODS, "model_periods": MODEL_PERIODS,
            "profile_windows": PROFILE_WINDOWS, "maps": MAPS, "default_period": DEFAULT_PERIOD,
        },
        "commanders": [
            {"name": p["identity"]["name"], "slug": slug, "faction": p["identity"]["faction"],
             "path": f"commanders/{slug}.json"}
            for slug, p in sorted(profiles.items())
        ],
        "files": files,
        "gates": gates(),
        "pipeline_steps": [
            "scripts/fetch_data.py -> site/data/*.json",
            "scripts/build_insights.py -> site/data/insights/*.json (this manifest)",
            "generate_commander_pages (frontend, later) consumes insights/commanders/<slug>.json",
        ],
    }
    _check_finite(index)
    written["index.json"] = write_json(out_dir / "index.json", index)

    return {
        "as_of": as_of_s,
        "changelog_mode": cl_mode,
        "changelog": changelog,
        "review_rows": len(review_doc["entries"]),
        "model": model,
        "pulse": pulse,
        "pulse_diag": pulse_diag,
        "profiles": profiles,
        "community": deck_files["community_decks.json"],
        "written": written,
    }


def format_report(res):
    lines = [f"Insights as of {res['as_of']}"]
    lines.append("")
    lines.append("Matchup model (map=all):")
    for p in MODEL_PERIODS:
        s = res["model"]["data"][p]["all"]["summary"]
        fit = res["model"]["data"][p]["all"]["fit"]
        lines.append(f"  {p:>3}: {res['model']['data'][p]['all']['games']} games, "
                     f"{s['pairs_n20']} pairs n>=20, {s['counters']} counters, "
                     f"consistent {s['consistent_with_strength']}/{s['pairs_n20']} "
                     f"({s['consistent_share']}), BT iters {fit['iterations']}")
        for c in res["model"]["data"][p]["all"]["counters"]:
            lines.append(f"       counter: {c['winner']} > {c['loser']} "
                         f"{c['wins']}/{c['n']} est {c['est']} [{c['lo']}, {c['hi']}] exp {c['expected']}")
    pulse = res["pulse"]
    w = pulse["windows"]
    lines.append("")
    lines.append(f"Meta pulse ({pulse['week_key_scheme']} keys): recent {w['recent']['weeks'][0]}..."
                 f"{w['recent']['weeks'][-1]} = {w['recent']['games']} games; prior "
                 f"{w['prior']['weeks'][0]}...{w['prior']['weeks'][-1]} = {w['prior']['games']} games; "
                 f"quiet={pulse['quiet']}")
    diag = res["pulse_diag"]
    lines.append(f"  share cross-check vs commander_trends: max diff {diag['share_check_max_abs_diff_pct']} pp; "
                 f"unparsed keys {diag['unparsed_week_keys']}")
    kinds = Counter(i["kind"] for i in pulse["items"])
    lines.append(f"  items: {dict(kinds) or 'none'}")
    for i in pulse["items"]:
        lines.append(f"    - {i['discord_text']}")
    lines.append("  headline facts (3m):")
    for f in pulse["headline_facts"]["periods"]["3m"]:
        lines.append(f"    - {f['discord_text']}")
    cl = res["changelog"]
    lines.append("")
    lines.append(f"Card changelog ({res['changelog_mode']}): baseline {cl['baseline']}, "
                 f"{len(cl['entries'])} entries; {res['review_rows']} review rows")
    by_date = Counter(e["date"] for e in cl["entries"])
    for d in sorted(by_date, reverse=True):
        kinds = Counter(e["kind"] for e in cl["entries"] if e["date"] == d)
        lines.append(f"    {d}: {by_date[d]} ({', '.join(f'{k} {v}' for k, v in sorted(kinds.items()))})")
    lines.append("")
    lines.append("Profiles (record verdicts per window, mirror-free, pilot gates applied):")
    for w in PROFILE_WINDOWS:
        verdicts = Counter(p["windows"][w]["record"]["verdict"] for p in res["profiles"].values())
        arch = Counter(a["record"]["verdict"] for p in res["profiles"].values()
                       for a in p["windows"][w]["ways_to_play"]["archetypes"] if "record" in a)
        bw = sum(len(p["windows"][w]["matchups"]["best"]) + len(p["windows"][w]["matchups"]["worst"])
                 for p in res["profiles"].values())
        lines.append(f"  {w:>3}: records {dict(sorted(verdicts.items()))}; "
                     f"archetype records {dict(sorted(arch.items()))}; best/worst picks {bw}")
    notable = sum(1 for c in pulse["commanders"] + pulse["factions"] if c["popularity"]["notable"])
    lines.append(f"  pulse popularity rows passing every gate: {notable} (items capped at {mp.POP_MAX_ITEMS})")
    lines.append("")
    lines.append(f"Community decks: {res['community']['count']} lists")
    lines.append("")
    lines.append("Files:")
    for rel, size in sorted(res["written"].items()):
        lines.append(f"  {rel:<45} {size / 1024:8.1f} KB")
    return "\n".join(lines)
