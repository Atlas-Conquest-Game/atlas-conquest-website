"""Insights layer tests (scripts/insights/, scripts/build_insights.py).

Mostly synthetic fixtures; the last class builds the whole layer from the real
published site/data/*.json into a temp directory (skipped when absent).
"""

import json
import math
import os
import random
import re
import shutil
import subprocess
import warnings
from datetime import date, datetime, timedelta, timezone

import pytest

from helpers import DATA_DIR

from insights import card_changelog as cl
from insights import matchup_model as mm
from insights import meta_pulse as mp
from insights import profiles as pf
from insights import stats_kit as sk
from insights import weeks as wk
from insights.common import SiteData, card_slug, commander_slug, dumps
from insights.community_decks import build_community_decks
from insights.concentration import concentration


# ─── Stats kit ────────────────────────────────────────────────────

class TestWilson:
    @pytest.mark.parametrize("w,n,lo,hi", [
        (50, 100, 0.40383, 0.59617),
        (1, 10, 0.01788, 0.40416),
        (0, 10, 0.0, 0.27753),
        (10, 10, 0.72247, 1.0),
    ])
    def test_known_values(self, w, n, lo, hi):
        got_lo, got_hi = sk.wilson(w, n)
        assert got_lo == pytest.approx(lo, abs=1e-4)
        assert got_hi == pytest.approx(hi, abs=1e-4)

    def test_empty(self):
        assert sk.wilson(0, 0) == (None, None)

    def test_bounds_contain_point(self):
        for n in (1, 5, 20, 133):
            for w in range(n + 1):
                lo, hi = sk.wilson(w, n)
                assert 0.0 <= lo <= w / n <= hi <= 1.0


class TestVerdict:
    def test_no_estimate_below_20(self):
        v = sk.verdict(0.6, 0.9, 19)
        assert v["code"] == "too_early" and not v["show_estimate"] and v["low_data"]
        rb = sk.rate_block(15, 19)
        assert rb["wr"] is None and rb["lo"] is None and rb["hi"] is None
        assert rb["games"] == 19 and rb["wins"] == 15

    def test_low_data_flag_below_40(self):
        rb = sk.rate_block(30, 35)  # clearly above even, but < 40 games
        assert rb["verdict"] == "above_even" and rb["low_data"] is True and rb["wr"] is not None

    def test_straddle_low_data_is_too_early(self):
        assert sk.verdict(0.4, 0.7, 30)["code"] == "too_early"
        assert sk.verdict(0.4, 0.7, 30)["show_estimate"] is True

    def test_straddle_enough_data_is_even(self):
        v = sk.verdict(0.45, 0.55, 400)
        assert v["code"] == "even" and v["label"] == "Even as far as we can tell"

    def test_above_and_below(self):
        assert sk.verdict(0.51, 0.6, 400)["code"] == "above_even"
        assert sk.verdict(0.40, 0.49, 400)["code"] == "below_even"


class TestBetaAndHelpers:
    @pytest.mark.parametrize("q", [0.025, 0.25, 0.5, 0.9, 0.975])
    def test_beta_ppf_closed_forms(self, q):
        assert sk.beta_ppf(q, 1, 1) == pytest.approx(q, abs=1e-8)
        assert sk.beta_ppf(q, 2, 1) == pytest.approx(math.sqrt(q), abs=1e-8)
        assert sk.beta_ppf(q, 1, 2) == pytest.approx(1 - math.sqrt(1 - q), abs=1e-8)

    def test_beta_ppf_symmetry(self):
        for a, b in [(3.5, 12.2), (40, 7), (0.8, 2.5)]:
            assert sk.beta_ppf(0.025, a, b) == pytest.approx(1 - sk.beta_ppf(0.975, b, a), abs=1e-8)

    def test_two_proportion_z(self):
        assert sk.two_proportion_z(60, 100, 40, 100) == pytest.approx(2.8284, abs=1e-3)
        assert sk.two_proportion_z(1, 0, 1, 10) is None

    def test_histogram_quantile(self):
        labels, counts = ["0-2", "2-4", "4-6"], [0, 10, 10]
        assert sk.histogram_quantile(labels, counts, 0.5) == pytest.approx(4.0)
        assert sk.histogram_quantile(labels, counts, 0.25) == pytest.approx(3.0)
        assert sk.histogram_quantile(labels, [0, 0, 0], 0.5) is None

    def test_dumps_refuses_nan(self):
        with pytest.raises(ValueError):
            dumps({"x": float("nan")})
        with pytest.raises(ValueError):
            dumps([float("inf")])

    def test_slugs(self):
        assert commander_slug("Lazim, Thief of Gods") == "lazim-thief-of-gods"
        assert card_slug("Skerr'drix") == "skerrdrix"
        assert card_slug("Yorefell, Blade of Lusheim") == "yorefell-blade-of-lusheim"

    def test_card_slug_matches_pipeline(self):
        io = pytest.importorskip("pipeline.io_helpers")
        for name in ["Skerr'drix", "Dr. Who, the Great", "Royal  Commandant", "Gruth, Ogre Champion"]:
            assert card_slug(name) == io.mention_slug(name)


# ─── Week keys ────────────────────────────────────────────────────

class TestWeeks:
    def test_detect_scheme(self):
        assert wk.detect_scheme(["2025-W52", "2026-W00"], "3.1.0") == wk.STRFTIME
        assert wk.detect_scheme(["2026-W01"], "3.1.0") == wk.ISO
        assert wk.detect_scheme(["2026-W01"], "3.0.0") == wk.STRFTIME
        assert wk.detect_scheme(["2026-W01"], None) == wk.STRFTIME

    def test_split_legacy_week_merges(self):
        a = wk.to_iso_key("2025-W52", wk.STRFTIME)
        b = wk.to_iso_key("2026-W00", wk.STRFTIME)
        assert a == b == "2026-W01"

    def test_legacy_and_iso_agree(self):
        # strftime %W numbering is one below ISO in 2026
        assert wk.week_monday("2026-W39", wk.STRFTIME) == date(2026, 9, 28)
        assert wk.week_monday("2026-W40", wk.ISO) == date(2026, 9, 28)

    def test_bad_keys(self):
        assert wk.week_monday("2026-13", wk.ISO) is None
        assert wk.week_monday("garbage", wk.STRFTIME) is None
        assert wk.week_monday("2025-W53", wk.ISO) is None  # 2025 has 52 ISO weeks

    def test_complete_weeks_before(self):
        ms = wk.complete_weeks_before(date(2026, 10, 5), 4)
        assert ms == [date(2026, 9, 7), date(2026, 9, 14), date(2026, 9, 21), date(2026, 9, 28)]
        prior = wk.complete_weeks_before(date(2026, 10, 8), 8, skip=4)
        assert prior[0] == date(2026, 7, 13) and prior[-1] == date(2026, 8, 31)
        assert len(prior) == 8 and prior[-1] < ms[0]


# ─── Matchup model ────────────────────────────────────────────────

def _matchups_block(results):
    """results: {(a, b): (wins_a, wins_b)} -> matchups.json block (both orientations)."""
    rows, names = [], set()
    for (a, b), (wa, wb) in results.items():
        names.update((a, b))
        if a == b:
            rows.append({"commander": a, "opponent": a, "wins": wa, "losses": wa,
                         "total": 2 * wa, "winrate": 0.5})
            continue
        rows.append({"commander": a, "opponent": b, "wins": wa, "losses": wb,
                     "total": wa + wb, "winrate": wa / (wa + wb) if wa + wb else 0})
        rows.append({"commander": b, "opponent": a, "wins": wb, "losses": wa,
                     "total": wa + wb, "winrate": wb / (wa + wb) if wa + wb else 0})
    return {"commanders": sorted(names), "matchups": rows}


TRUE_STRENGTHS = {"A": 2.0, "B": 1.0, "C": 0.5, "D": 1.5}


def _expected_results(strengths, n=4000):
    names = sorted(strengths)
    out = {}
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            pa = strengths[a] / (strengths[a] + strengths[b])
            wa = round(n * pa)
            out[(a, b)] = (wa, n - wa)
    return out


class TestMatchupModel:
    def test_bt_recovers_known_strengths(self):
        wins = {}
        for (a, b), (wa, wb) in _expected_results(TRUE_STRENGTHS).items():
            wins[(a, b)] = wa
            wins[(b, a)] = wb
        fit, iters, converged = mm.fit_bradley_terry(TRUE_STRENGTHS, wins)
        assert converged
        gm = math.exp(sum(math.log(v) for v in TRUE_STRENGTHS.values()) / 4)
        for name, s in TRUE_STRENGTHS.items():
            assert fit[name] == pytest.approx(s / gm, rel=0.02)

    def test_mirrors_do_not_change_the_fit(self):
        base = _expected_results(TRUE_STRENGTHS, n=200)
        with_mirrors = dict(base)
        with_mirrors[("A", "A")] = (50, 50)
        b1 = mm.build_block(_matchups_block(base))
        b2 = mm.build_block(_matchups_block(with_mirrors))
        assert [c["strength"] for c in b1["commanders"]] == [c["strength"] for c in b2["commanders"]]
        assert b1["pairs"] == b2["pairs"]
        assert all(p["a"] != p["b"] for p in b2["pairs"])

    def test_est_ab_is_one_minus_est_ba(self):
        res = _expected_results(TRUE_STRENGTHS, n=37)
        res[("A", "C")] = (3, 30)  # an upset-heavy pair
        blk = mm.build_block(_matchups_block(res))
        idx = {(p["a"], p["b"]): p for p in blk["pairs"]}
        assert len(idx) == 12
        for (a, b), p in idx.items():
            q = idx[(b, a)]
            assert abs(p["est"] + q["est"] - 1) < 1e-9
            assert abs(p["lo"] + q["hi"] - 1) < 1e-9
            assert abs(p["expected"] + q["expected"] - 1) < 1e-9
            assert p["wins"] + q["wins"] == p["n"]
            assert p["evidence"] == q["evidence"]
            assert p["lo"] <= p["est"] <= p["hi"]

    def test_shrinkage_weakens_with_n(self):
        gaps = []
        for n in (8, 40, 200, 1000):
            est, lo, hi = mm.pair_posterior(round(0.75 * n), n, 0.5)
            gaps.append(abs(est - 0.75))
            assert lo < est < hi
        assert gaps == sorted(gaps, reverse=True) and gaps[-1] < 0.01
        est0, _, _ = mm.pair_posterior(0, 0, 0.62)
        assert est0 == pytest.approx(0.62)

    def test_low_data_below_10(self):
        assert mm.classify_evidence(9, 0.9, 0.7, 0.99, 0.5) == "low-data"
        # straddles 0.5: "unclear" below 40 games, "even" from 40
        assert mm.classify_evidence(10, 0.5, 0.3, 0.7, 0.5) == "unclear"
        assert mm.classify_evidence(39, 0.5, 0.35, 0.65, 0.5, wins=19) == "unclear"
        assert mm.classify_evidence(40, 0.5, 0.36, 0.64, 0.5, wins=20) == "even"
        res = {("A", "B"): (5, 4), ("A", "C"): (30, 30), ("B", "C"): (30, 30)}
        blk = mm.build_block(_matchups_block(res))
        ab = next(p for p in blk["pairs"] if p["a"] == "A" and p["b"] == "B")
        assert ab["n"] == 9 and ab["evidence"] == "low-data" and ab["raw_wr"] is None
        # below 10 games: record only, the estimate would be mostly the prior
        assert ab["est"] is None and ab["lo"] is None and ab["hi"] is None
        assert ab["favored"] is None and ab["wins"] == 5

    def test_counter_needs_n_and_deviation(self):
        even = {(a, b): (100, 100) for a, b in [("A", "B"), ("A", "C"), ("B", "C"), ("A", "D"),
                                                ("B", "D"), ("C", "D")]}
        strong = dict(even)
        strong[("A", "B")] = (45, 5)
        blk = mm.build_block(_matchups_block(strong))
        ab = next(p for p in blk["pairs"] if p["a"] == "A" and p["b"] == "B")
        assert ab["evidence"] == "counter" and ab["favored"] == "a"
        assert blk["summary"]["counters"] == 1
        assert blk["counters"][0]["winner"] == "A"
        thin = dict(even)
        thin[("A", "B")] = (14, 1)  # lopsided but n < 20
        blk2 = mm.build_block(_matchups_block(thin))
        ab2 = next(p for p in blk2["pairs"] if p["a"] == "A" and p["b"] == "B")
        assert ab2["evidence"] != "counter"

    def test_unplayed_pairs_are_omitted_and_never_estimated(self):
        res = {("A", "B"): (30, 10), ("B", "C"): (30, 10)}
        blk = mm.build_block(_matchups_block(res))
        assert not [p for p in blk["pairs"] if {p["a"], p["b"]} == {"A", "C"}]
        assert blk["summary"]["pairs_played"] == 2
        full = mm.build_block(_matchups_block(res), include_unplayed=True)
        ac = next(p for p in full["pairs"] if p["a"] == "A" and p["b"] == "C")
        assert ac["n"] == 0 and ac["evidence"] == "low-data"
        assert ac["est"] is None and ac["favored"] is None
        assert ac["expected"] > 0.5  # the model expectation is still shown

    def test_favored_needs_interval_and_raw_record(self):
        # A is far stronger overall; A-B is 5-5 over 10 games. The 20-game
        # prior alone would push the posterior above 50% — that must not make
        # A "favored" against a record that says even.
        res = {("A", "C"): (180, 20), ("A", "D"): (170, 30), ("B", "C"): (100, 100),
               ("B", "D"): (100, 100), ("C", "D"): (100, 100), ("A", "B"): (5, 5)}
        blk = mm.build_block(_matchups_block(res))
        ab = next(p for p in blk["pairs"] if p["a"] == "A" and p["b"] == "B")
        assert ab["est"] > 0.5 and ab["lo"] > 0.5        # prior-driven posterior
        assert ab["favored"] is None and ab["evidence"] == "unclear"
        ba = next(p for p in blk["pairs"] if p["a"] == "B" and p["b"] == "A")
        assert ba["favored"] is None and ba["evidence"] == "unclear"

    def test_counter_must_beat_expectation_on_the_favored_side(self):
        # A is expected to win 90% but wins only 62%: A is still favored, yet
        # it is B who outperforms the model — not "A counters B".
        assert mm.classify_evidence(200, 0.62, 0.55, 0.69, 0.9, wins=124) == "lean"
        assert mm.classify_evidence(200, 0.62, 0.55, 0.69, 0.4, wins=124) == "counter"
        assert mm.classify_evidence(200, 0.38, 0.31, 0.45, 0.6, wins=76) == "counter"

    def test_strength_gate_interval_and_order(self):
        res = _expected_results(TRUE_STRENGTHS, n=200)
        res[("A", "E")] = (6, 4)   # E: 10 non-mirror games only
        blk = mm.build_block(_matchups_block(res))
        names = [c["name"] for c in blk["commanders"]]
        assert names == sorted(names)                     # alphabetical, not a ranking
        e = next(c for c in blk["commanders"] if c["name"] == "E")
        assert e["games"] == 10
        assert e["strength"] is None and e["strength_lo"] is None and e["expected_vs_field"] is None
        for c in blk["commanders"]:
            if c["name"] != "E":
                assert c["strength_lo"] < c["strength"] < c["strength_hi"]
                assert c["expected_vs_field_lo"] < c["expected_vs_field"] < c["expected_vs_field_hi"]
        ae = next(p for p in blk["pairs"] if p["a"] == "A" and p["b"] == "E")
        assert ae["expected"] is None and ae["est"] is not None   # n = 10: estimate, no expectation

    def test_strength_se_shrinks_with_games(self):
        small = mm.build_block(_matchups_block(_expected_results(TRUE_STRENGTHS, n=100)))
        big = mm.build_block(_matchups_block(_expected_results(TRUE_STRENGTHS, n=1000)))
        for cs, cb in zip(small["commanders"], big["commanders"]):
            ratio = cs["log_strength_se"] / cb["log_strength_se"]
            assert 2.8 < ratio < 3.4   # ~sqrt(10)

    def test_bt_recovers_strengths_from_noisy_results(self):
        rng = random.Random(20261005)
        true = {"A": 2.0, "B": 1.0, "C": 0.5, "D": 1.5, "E": 0.8, "F": 1.2}
        names = sorted(true)
        wins = {}
        for i, a in enumerate(names):
            for b in names[i + 1:]:
                pa = true[a] / (true[a] + true[b])
                w = sum(rng.random() < pa for _ in range(300))
                wins[(a, b)], wins[(b, a)] = w, 300 - w
        fit, _, converged = mm.fit_bradley_terry(names, wins)
        se = mm.log_strength_se(names, wins, fit)
        gm = math.exp(sum(math.log(v) for v in true.values()) / len(true))
        assert converged
        for n in names:
            err = abs(math.log(fit[n]) - math.log(true[n] / gm))
            assert err < 3 * se[n], (n, err, se[n])

    def test_bt_zero_win_and_disconnected_commanders(self):
        res = _expected_results(TRUE_STRENGTHS, n=100)
        res[("A", "Z")] = (25, 0)   # Z never wins
        res[("M", "M")] = (5, 5)    # M only ever played mirrors
        blk = mm.build_block(_matchups_block(res))
        assert blk["fit"]["converged"]
        z = next(c for c in blk["commanders"] if c["name"] == "Z")
        m = next(c for c in blk["commanders"] if c["name"] == "M")
        assert z["games"] == 25 and z["strength"] is not None and z["strength"] < 0.5
        assert math.isfinite(z["strength"]) and z["strength_hi"] < 1.0
        assert m["games"] == 0 and m["strength"] is None
        assert not [p for p in blk["pairs"] if "M" in (p["a"], p["b"])]
        az = next(p for p in blk["pairs"] if p["a"] == "A" and p["b"] == "Z")
        assert az["favored"] == "a" and az["lo"] > 0.5


# ─── Synthetic site data helpers ──────────────────────────────────

def _write_site(tmp_path, files):
    d = tmp_path / "data"
    d.mkdir(parents=True, exist_ok=True)
    for name, obj in files.items():
        (d / f"{name}.json").write_text(json.dumps(obj))
    return SiteData(d)


COMMANDERS = [
    {"name": "Alpha One", "faction": "skaal", "patron": "Skaal", "text": "Gain <sprite name=\"health_4\">.",
     "subtype": "Human", "dominion": 5, "intellect": 7, "speed": 1, "health": 30,
     "art": "assets/commanders/alpha-one.jpg"},
    {"name": "Beta, Two", "faction": "lucia", "patron": "Lucia", "text": "", "subtype": "Dwarf",
     "dominion": 6, "intellect": 8, "speed": 1, "health": 28, "art": "assets/commanders/beta-two.jpg"},
    {"name": "Gamma", "faction": "shadis", "patron": "Shadis", "text": "", "subtype": "Vampire",
     "dominion": 6, "intellect": 8, "speed": 1, "health": 28, "art": "assets/commanders/gamma.jpg"},
]


def _cwt(weeks, per_week, key_fn):
    """commander_winrate_trends block. per_week: list of {cmd: (games, wins)}."""
    names = sorted({c for w in per_week for c in w})
    block = {"dates": [key_fn(m) for m in weeks], "commanders": {}}
    for n in names:
        g = [w.get(n, (0, 0))[0] for w in per_week]
        wins = [w.get(n, (0, 0))[1] for w in per_week]
        wr = [round(100 * x / y, 1) if y else None for x, y in zip(wins, g)]
        block["commanders"][n] = {"winrate": wr, "games": g, "winrate_no_mirror": wr, "games_no_mirror": g}
    return block


def _pulse_site(tmp_path, recent_wr, prior_wr, games_per_week, key_scheme="iso", gamma_recent=0):
    as_of = datetime(2026, 10, 5, 14, 0, tzinfo=timezone.utc)
    mondays = wk.complete_weeks_before(as_of.date(), 12)
    per_week = []
    for i, m in enumerate(mondays):
        recent = i >= 8
        g = games_per_week
        w = round((recent_wr if recent else prior_wr) * g)
        row = {"Alpha One": (g, w), "Beta, Two": (g, g - w)}
        if recent and gamma_recent:
            row["Gamma"] = (gamma_recent, gamma_recent // 2)
        per_week.append(row)
    if key_scheme == "iso":
        key_fn, version = wk.iso_key, "3.1.0"
    else:
        key_fn, version = (lambda m: m.strftime("%Y-W%W")), "3.0.0"
    files = {
        "commanders": COMMANDERS,
        "metadata": {"all": {"all": {"last_updated": as_of.isoformat(), "total_matches": 100,
                                     "data_version": version}}},
        "commander_winrate_trends": {"all": {"all": _cwt(mondays, per_week, key_fn)}},
    }
    return _write_site(tmp_path, files), as_of


class TestMetaPulse:
    def test_detects_synthetic_winrate_shift(self, tmp_path):
        site, as_of = _pulse_site(tmp_path, recent_wr=0.75, prior_wr=0.45, games_per_week=40)
        pulse, diag = mp.build_meta_pulse(site, as_of, "2026-10-05T14:00:00Z")
        assert pulse["windows"]["recent"]["weeks"] == ["2026-W37", "2026-W38", "2026-W39", "2026-W40"]
        assert pulse["windows"]["recent"]["games"] == 160 and not pulse["quiet"]
        moves = {i["subject"]: i for i in pulse["items"] if i["kind"] == "winrate_move"}
        assert moves["Alpha One"]["direction"] == "up"
        assert moves["Beta, Two"]["direction"] == "down"
        rng = pulse["windows"]["recent"]["range_text"]
        for item in pulse["items"]:
            text = item["discord_text"]
            assert "last 4 weeks" in text and rng in text
            if item["kind"] == "winrate_move":
                assert f"of {item['n']['recent_games']} mirror-free games" in text
                assert f"of {item['n']['prior_games']} in the previous 8 weeks" in text
            else:
                assert f"({item['n']['recent_picks']} of {item['n']['recent_total']}," in text
        a = next(c for c in pulse["commanders"] if c["name"] == "Alpha One")
        assert a["winrate"]["recent"]["games"] == 160 and a["winrate"]["reportable"]
        assert diag["unparsed_week_keys"] == []

    def test_suppresses_small_samples(self, tmp_path):
        site, as_of = _pulse_site(tmp_path, recent_wr=0.8, prior_wr=0.4, games_per_week=10)
        pulse, _ = mp.build_meta_pulse(site, as_of, "x")
        assert pulse["quiet"] is True  # 40 games < 150
        assert not [i for i in pulse["items"] if i["kind"] == "winrate_move"]
        a = next(c for c in pulse["commanders"] if c["name"] == "Alpha One")
        assert a["winrate"]["reportable"] is False
        assert pulse["items"][0]["kind"] == "quiet"
        assert "40 games" in pulse["items"][0]["discord_text"]

    def test_popularity_shift(self, tmp_path):
        site, as_of = _pulse_site(tmp_path, 0.5, 0.5, 40, gamma_recent=20)
        pulse, _ = mp.build_meta_pulse(site, as_of, "x")
        pop = {i["subject"]: i for i in pulse["items"] if i["kind"] == "popularity"}
        assert pop["Gamma"]["direction"] == "up"
        assert pop["Gamma"]["n"]["recent_picks"] == 80

    def test_popularity_needs_persistence(self, tmp_path):
        # Gamma: 80 picks, all in ONE of the 4 recent weeks -> a burst, not a trend.
        as_of = datetime(2026, 10, 5, 14, 0, tzinfo=timezone.utc)
        mondays = wk.complete_weeks_before(as_of.date(), 12)
        per_week = [{"Alpha One": (40, 20), "Beta, Two": (40, 20)} for _ in mondays]
        per_week[-1]["Gamma"] = (80, 40)
        site = _write_site(tmp_path, {
            "commanders": COMMANDERS,
            "metadata": {"all": {"all": {"last_updated": as_of.isoformat(), "data_version": "3.1.0"}}},
            "commander_winrate_trends": {"all": {"all": _cwt(mondays, per_week, wk.iso_key)}},
        })
        pulse, _ = mp.build_meta_pulse(site, as_of, "x")
        g = next(c for c in pulse["commanders"] if c["name"] == "Gamma")["popularity"]
        assert g["z"] >= mp.POP_Z_THRESHOLD and g["persistent_weeks"] == 1
        assert g["notable"] is False
        assert not [i for i in pulse["items"] if i["subject"] == "Gamma"]

    def test_popularity_items_capped(self, tmp_path):
        as_of = datetime(2026, 10, 5, 14, 0, tzinfo=timezone.utc)
        mondays = wk.complete_weeks_before(as_of.date(), 12)
        cmds = [{"name": f"C{i}", "faction": "neutral"} for i in range(8)]
        per_week = []
        for k, _ in enumerate(mondays):
            recent = k >= 8
            # C0-C3 surge in the recent weeks, C4-C7 fade
            per_week.append({c["name"]: ((60 if i < 4 else 10) if recent else (10 if i < 4 else 60), 0)
                             for i, c in enumerate(cmds)})
        site = _write_site(tmp_path, {
            "commanders": cmds,
            "metadata": {"all": {"all": {"last_updated": as_of.isoformat(), "data_version": "3.1.0"}}},
            "commander_winrate_trends": {"all": {"all": _cwt(mondays, per_week, wk.iso_key)}},
        })
        pulse, _ = mp.build_meta_pulse(site, as_of, "x")
        notable = [c for c in pulse["commanders"] if c["popularity"]["notable"]]
        pop_items = [i for i in pulse["items"] if i["kind"].endswith("popularity")]
        assert len(notable) == 8 and len(pop_items) == mp.POP_MAX_ITEMS
        zs = [abs(i["z"]) for i in pop_items]
        assert zs == sorted(zs, reverse=True)

    def test_winrate_move_needs_pilot_check(self, tmp_path):
        site, as_of = _pulse_site(tmp_path, recent_wr=0.75, prior_wr=0.45, games_per_week=40)
        # Add a 1m archetypes block where one account played most Alpha games,
        # and a 3.1.0 commander_stats block where Beta had < 5 pilots.
        d = site.data_dir
        (d / "archetypes.json").write_text(json.dumps({"1m": {"all": {"total_decks": 100, "commanders": {
            "Alpha One": {"deck_count": 100, "archetypes": [{"id": "p", "name": "A: x", "deck_count": 100,
                          "decklists": [{"username": "solo", "count": 70, "deck_code": "c"},
                                        {"username": "other", "count": 30, "deck_code": "d"}]}]}}}}}))
        (d / "commander_stats.json").write_text(json.dumps({"1m": {"all": [
            {"name": "Alpha One", "matches": 100, "wins": 70, "pilots": 9},
            {"name": "Beta, Two", "matches": 100, "wins": 30, "pilots": None}]}}))
        pulse, _ = mp.build_meta_pulse(SiteData(d), as_of, "x")
        assert not [i for i in pulse["items"] if i["kind"] == "winrate_move"]
        a = next(c for c in pulse["commanders"] if c["name"] == "Alpha One")["winrate"]
        b = next(c for c in pulse["commanders"] if c["name"] == "Beta, Two")["winrate"]
        assert abs(a["z"]) >= 2 and a["reportable"] is False
        assert a["pilot_check"]["top_pilot_share"] == 0.7 and a["pilot_check"]["passed"] is False
        assert b["pilot_check"]["pilots_status"] == "below_min" and b["reportable"] is False

    def test_legacy_keys_give_same_windows(self, tmp_path):
        s1, as_of = _pulse_site(tmp_path / "iso", 0.75, 0.45, 40, key_scheme="iso")
        s2, _ = _pulse_site(tmp_path / "legacy", 0.75, 0.45, 40, key_scheme="strftime")
        p1, _ = mp.build_meta_pulse(s1, as_of, "x")
        p2, _ = mp.build_meta_pulse(s2, as_of, "x")
        assert p2["week_key_scheme"] == "strftime" and p1["week_key_scheme"] == "iso"
        assert p1["windows"] == p2["windows"]
        assert p1["items"] == p2["items"]
        assert p1["weekly"] == p2["weekly"]

    def test_split_new_year_week_merges(self, tmp_path):
        block = {"dates": ["2025-W52", "2026-W00"], "commanders": {
            "Alpha One": {"winrate": [50.0, 100.0], "games": [4, 2], "winrate_no_mirror": [50.0, 100.0],
                          "games_no_mirror": [4, 2]}}}
        counts, bad = mp.weekly_counts(block, wk.STRFTIME)
        assert bad == [] and list(counts) == [date(2025, 12, 29)]
        assert counts[date(2025, 12, 29)]["Alpha One"] == [6, 4, 6, 4]

    def test_headline_facts(self, tmp_path):
        site = _write_site(tmp_path, {
            "metadata": {"3m": {"all": {"total_matches": 100}}},
            "game_distributions": {"3m": {"all": {
                "duration": {"labels": ["0-10", "10-20"], "counts": [50, 50], "total": 100},
                "turns": {"labels": ["10-12", "12-14"], "counts": [50, 50], "total": 100}}}},
            "card_stats": {"3m": {"all": [
                {"name": "X", "token": False, "drawn_instances": 2000, "played_instances": 1000},
                {"name": "Tok", "token": True, "drawn_instances": 500, "played_instances": 500}]}},
            "first_turn": {"3m": {"all": {"total_games": 100, "first_player_wins": 60}}},
            "feedback_stats": {"3m": {"all": {"total_ratings": 50, "fun_rate": 0.9}}},
        })
        facts = {f["id"]: f for f in mp.headline_facts(site, "3m")}
        assert facts["game_minutes"]["value"] == 10 and facts["game_minutes"]["n"] == 100
        assert facts["cards_per_game"]["drawn"] == 10.0  # tokens excluded, 200 player-games
        assert facts["going_first"]["games"] == 100 and facts["going_first"]["wr"] == 0.6
        assert facts["fun"]["fun"] == 45 and facts["fun"]["n_label"] == "post-game answers"
        assert "45 of 50 answers" in facts["fun"]["discord_text"]
        assert "players who answered" not in facts["fun"]["text"]
        for f in facts.values():
            assert "last 3 months" in f["discord_text"]
            assert f"{f['n']:,}" in f["discord_text"]


# ─── Card changelog ───────────────────────────────────────────────

def _card(name, cost=3, attack=2, speed=1, health=2, text="Do a thing.", patron="Skaal",
          faction="skaal", token=False, ctype="Minion", legendary=False):
    return {"name": name, "type": ctype, "text": text, "subtype": "", "cost": cost, "attack": attack,
            "speed": speed, "health": health, "legendary": legendary, "patron": patron,
            "faction": faction, "token": token}


class TestCardChangelog:
    def test_records_stat_change(self):
        pub, rev = cl.diff_states(cl.snapshot([_card("X", cost=3)]), cl.snapshot([_card("X", cost=2)]),
                                  "2026-10-01", "run")
        assert len(pub) == 1 and rev == []
        e = pub[0]
        assert e["kind"] == "changed" and e["changes"] == [{"field": "cost", "from": 3, "to": 2}]
        assert e["direction"] == "buff" and e["summary"] == "Cost 3 → 2" and e["slug"] == "x"

    def test_ignores_text_only_and_patron(self):
        old = [_card("X"), _card("Y")]
        new = [_card("X", text="Do a thing better."), _card("Y", patron="Adora", faction="adora")]
        pub, rev = cl.diff_states(cl.snapshot(old), cl.snapshot(new), "2026-10-01", "run",
                                  old_records={c["name"]: c for c in old},
                                  new_records={c["name"]: c for c in new})
        assert pub == []
        fields = sorted((r["card"], r["field"]) for r in rev)
        assert fields == [("X", "text"), ("Y", "faction"), ("Y", "patron")]
        text_row = next(r for r in rev if r["field"] == "text")
        assert text_row["from"] == "Do a thing." and text_row["to"] == "Do a thing better."

    def test_added_removed_renamed_and_tokens(self):
        old = [_card("Old Name", attack=3), _card("Gone"), _card("Tok", token=True)]
        new = [_card("New Name", attack=4), _card("Fresh"), _card("Tok2", token=True)]
        pub, rev = cl.diff_states(cl.snapshot(old), cl.snapshot(new), "2026-10-01", "run",
                                  renames={"Old Name": "New Name"})
        kinds = {(e["card"], e["kind"]) for e in pub}
        assert kinds == {("New Name", "renamed"), ("Fresh", "added"), ("Gone", "removed")}
        ren = next(e for e in pub if e["kind"] == "renamed")
        assert ren["from_name"] == "Old Name" and ren["changes"][0]["field"] == "attack"
        assert {r["field"] for r in rev} == {"token-added", "token-removed"}

    def test_schema_additions_are_not_changes(self):
        old = [{"name": "X", "type": "Minion", "cost": 3, "attack": 2, "speed": 1, "health": 2,
                "legendary": False, "faction": "skaal", "text": "t"}]
        new = [_card("X", cost=3, text="t")]
        pub, rev = cl.diff_states(cl.snapshot(old), cl.snapshot(new), "d", "run")
        assert pub == [] and rev == []

    def test_absent_fields_survive_the_stored_state(self):
        """CI path: the snapshot round-trips through JSON, so a field the old
        cards.json lacked must stay 'absent', not become null."""
        old = [{"name": "X", "type": "Minion", "cost": 3, "attack": 2, "speed": 1, "health": 2,
                "faction": "skaal", "text": "t"}]          # no legendary/patron/token/subtype
        state = json.loads(dumps(cl.encode_state(cl.snapshot(old))))
        decoded = cl.decode_state(state)
        assert decoded["X"]["legendary"] is cl.ABSENT and decoded["X"]["attack"] == 2
        new = [_card("X", cost=3, text="t", legendary=False)]
        pub, rev = cl.diff_states(decoded, cl.snapshot(new), "d", "run")
        assert pub == [] and rev == []
        # ...while a real null -> value change is still a change
        spell = [_card("S", ctype="Spell", attack=None)]
        st2 = cl.decode_state(json.loads(dumps(cl.encode_state(cl.snapshot(spell)))))
        assert st2["S"]["attack"] is None
        pub2, _ = cl.diff_states(st2, cl.snapshot([_card("S", ctype="Minion", attack=2)]), "d", "run")
        assert {c["field"] for c in pub2[0]["changes"]} == {"type", "attack"}

    def test_incremental_is_idempotent(self):
        v1 = [_card("X", cost=3), _card("Y")]
        v2 = [_card("X", cost=2), _card("Y")]
        log0, _, mode0, st0 = cl.update_changelog(None, v1, "2026-09-01", "t0")
        assert mode0 == "baseline-only" and log0["entries"] == []
        assert "last_state" not in log0          # bookkeeping lives in its own file
        log1, _, mode1, st1 = cl.update_changelog(log0, v2, "2026-10-01", "t1", state=st0)
        assert mode1 == "incremental" and len(log1["entries"]) == 1
        log2, rev2, _, st2 = cl.update_changelog(log1, v2, "2026-10-01", "t1", state=st1)
        assert dumps(log2) == dumps(log1) and rev2 == [] and dumps(st2) == dumps(st1)
        log3, _, _, _ = cl.update_changelog(log2, v2, "2026-10-02", "t2", state=st2)
        assert log3["entries"] == log1["entries"]

    def test_legacy_embedded_state_is_migrated(self):
        v1, v2 = [_card("X", cost=3)], [_card("X", cost=2)]
        legacy = {"entries": [], "baseline": {"date": "2026-09-01"},
                  "last_state": cl.encode_state(cl.snapshot(v1))}
        log, _, mode, st = cl.update_changelog(legacy, v2, "2026-10-01", "t")
        assert mode == "incremental" and len(log["entries"]) == 1 and "last_state" not in log
        assert st["cards"]["X"][0] == 2

    def test_same_day_runs_merge(self):
        v1, v2, v3 = [_card("X", cost=3)], [_card("X", cost=2)], [_card("X", cost=1)]
        base, _, _, s0 = cl.update_changelog(None, v1, "2026-09-01", "t")
        a, _, _, s1 = cl.update_changelog(base, v2, "2026-10-01", "t", state=s0)
        b, _, _, _ = cl.update_changelog(a, v3, "2026-10-01", "t", state=s1)
        assert b["entries"][0]["changes"] == [{"field": "cost", "from": 3, "to": 1}]
        c, _, _, _ = cl.update_changelog(a, v1, "2026-10-01", "t", state=s1)
        assert c["entries"] == []

    def test_refuses_silent_fresh_baseline(self, tmp_path):
        data = tmp_path / "data"
        data.mkdir()
        (data / "cards.json").write_text(json.dumps([_card("X")]))
        out = tmp_path / "out" / "card_changelog.json"
        review = tmp_path / "review" / "changelog_text.json"
        with pytest.raises(cl.FreshBaselineError):
            cl.build_card_changelog(data, out, review, tmp_path, "2026-10-01", "t", use_git=False)
        log, _, mode, st = cl.build_card_changelog(data, out, review, tmp_path, "2026-10-01", "t",
                                                   use_git=False, allow_fresh_baseline=True)
        assert mode == "baseline-only" and log["entries"] == [] and "X" in st["cards"]
        # with both files present, a no-git run is incremental
        out.parent.mkdir(parents=True)
        out.write_text(dumps(log))
        (out.parent / cl.STATE_REL_PATH).parent.mkdir(parents=True)
        (out.parent / cl.STATE_REL_PATH).write_text(dumps(st))
        _, _, mode2, _ = cl.build_card_changelog(data, out, review, tmp_path, "2026-10-01", "t",
                                                 use_git=False)
        assert mode2 == "incremental"

    def test_backfill_from_history(self):
        h = [
            ("2026-01-01", "a" * 40, [_card("X", cost=3)]),
            ("2026-02-01", "b" * 40, [_card("X", cost=3), _card("Y")]),
            ("2026-03-01", "c" * 40, [_card("X", cost=4, text="new"), _card("Y")]),
        ]
        log, rev, mode, st = cl.update_changelog(None, h[-1][2], "2026-04-01", "t", history=h)
        assert mode == "backfill" and log["baseline"]["date"] == "2026-01-01"
        assert [(e["date"], e["card"], e["kind"]) for e in log["entries"]] == [
            ("2026-03-01", "X", "changed"), ("2026-02-01", "Y", "added")]
        assert log["entries"][0]["direction"] == "nerf"
        assert [r["field"] for r in rev] == ["text"]
        again, _, mode2, _ = cl.update_changelog(log, h[-1][2], "2026-04-01", "t", state=st)
        assert mode2 == "incremental" and dumps(again) == dumps(log)

    def test_git_backfill_integration(self, tmp_path):
        if shutil.which("git") is None:
            pytest.skip("git not available")
        repo = tmp_path / "repo"
        (repo / "site" / "data").mkdir(parents=True)

        def git(*args, when=None):
            env = dict(os.environ)
            if when:
                env["GIT_AUTHOR_DATE"] = env["GIT_COMMITTER_DATE"] = when
            subprocess.run(["git", "-c", "user.email=t@example.com", "-c", "user.name=t",
                            "-c", "commit.gpgsign=false", *args], cwd=repo, check=True,
                           capture_output=True, env=env)

        git("init", "-q")
        versions = [
            ("2026-01-01T10:00:00+00:00", [_card("X", cost=3)]),
            ("2026-01-01T12:00:00+00:00", [_card("X", cost=3), _card("Y")]),  # same day: baseline
            ("2026-02-01T10:00:00+00:00", [_card("X", cost=2), _card("Y")]),
            ("2026-03-01T10:00:00+00:00", [_card("X", cost=2, text="changed"), _card("Y")]),
        ]
        cards_path = repo / "site" / "data" / "cards.json"
        for when, cards in versions:
            cards_path.write_text(json.dumps(cards))
            git("add", "-A")
            git("commit", "-q", "-m", "v", when=when)
        hist = cl.git_history(repo)
        assert [d for d, _, _ in hist] == ["2026-01-01", "2026-02-01", "2026-03-01"]
        out = tmp_path / "out" / "card_changelog.json"
        review = tmp_path / "review" / "changelog_text.json"
        log, rev_doc, mode, _ = cl.build_card_changelog(repo / "site" / "data", out, review, repo,
                                                        "2026-03-02", "t")
        assert mode == "backfill" and log["baseline"]["cards"] == 2
        assert [(e["date"], e["card"], e["summary"]) for e in log["entries"]] == [
            ("2026-02-01", "X", "Cost 3 → 2")]
        assert [r["field"] for r in rev_doc["entries"]] == ["text"]


# ─── Profiles (synthetic gates) ───────────────────────────────────

def _turn_rows(counts, wr=0.5):
    return [{"winrate": wr if g else None, "games": g} for g in counts]


class TestProfiles:
    def _site(self, tmp_path, recent_turns, all_turns, first=(25, 13), second=(19, 9)):
        tw = lambda rows: {"buckets": ["1-5", "5-8", "8-11", "11-14", "14+"], "commanders": {
            "Alpha One": _turn_rows(rows), "Beta, Two": _turn_rows([10, 10, 10, 10, 10])}}
        return _write_site(tmp_path, {
            "commanders": COMMANDERS,
            "cards": [],
            "commander_stats": {w: {m: [{"name": "Alpha One", "faction": "skaal", "matches": 44,
                                          "wins": 22, "winrate": 0.5}] for m in pf.MAPS}
                                for w in ("all", "6m", "3m")},
            "turn_winrates": {"3m": {"all": tw(recent_turns)}, "6m": {"all": tw(recent_turns)},
                              "all": {"all": tw(all_turns)}},
            "first_turn": {w: {"all": {"per_commander": {"Alpha One": {
                "first_games": first[0], "first_wins": first[1],
                "second_games": second[0], "second_wins": second[1]}}}} for w in ("all", "6m", "3m")},
        })

    def test_tempo_falls_back_and_flags(self, tmp_path):
        site = self._site(tmp_path, [5, 20, 40, 30, 10], [50, 60, 80, 60, 30])
        t = pf._tempo(site, "3m", "Alpha One")
        assert t["fallback"] is True and t["source_window"] == "all"
        assert [b["games"] for b in t["buckets"]] == [110, 80, 90]
        assert abs(sum(b["share"] for b in t["buckets"]) - 1) < 1e-3
        t2 = pf._tempo(site, "all", "Alpha One")
        assert t2["fallback"] is False

    def test_turn_order_gated_each_side(self, tmp_path):
        site = self._site(tmp_path, [40] * 5, [40] * 5)
        to = pf._turn_order(site, "3m", "Alpha One", (None, "unknown"))
        assert to["reportable"] is False
        assert to["first"]["wr"] is None and to["second"]["wr"] is None
        assert to["first"]["games"] == 25
        site2 = self._site(tmp_path / "b", [40] * 5, [40] * 5, second=(30, 15))
        to2 = pf._turn_order(site2, "3m", "Alpha One", (None, "unknown"))
        assert to2["reportable"] is True and to2["first"]["wr"] == 0.52
        to3 = pf._turn_order(site2, "3m", "Alpha One", ({"concentrated": True}, "ok"))
        assert to3["first"]["wr"] is None and to3["first"]["verdict"] == "one_player"

    def test_archetype_label_and_ways_to_play_gate(self, tmp_path):
        assert pf.archetype_label("Macks: Red Dragon / Lay Claim") == "Red Dragon / Lay Claim"
        site = _write_site(tmp_path, {"archetypes": {"3m": {"all": {"total_decks": 100, "commanders": {
            "Alpha One": {"deck_count": 60, "skipped": False, "packages": [], "archetypes": [
                {"id": "pkg-1", "name": "Alpha: Big / Small", "deck_count": 40, "wins": 25,
                 "commander_share": 0.66, "key_cards": [{"name": "Big"}],
                 "decklists": [{"deck_name": "d", "username": "u", "count": 9, "deck_code": "c1"}]},
                {"id": "pkg-2", "name": "Alpha: Odd", "deck_count": 12, "wins": 9,
                 "commander_share": 0.2, "key_cards": [], "decklists": []}]}}}}}})
        w = pf._ways_to_play(site, "3m", "Alpha One")
        est, emg = w["archetypes"]
        assert est["status"] == "established" and est["record"]["games"] == 40
        assert est["record"]["wr"] == 0.625 and est["concentration"]["top_pilot_share"] == 0.225
        assert est["decks"] == [{"deck_name": "d", "username": "u", "deck_code": "c1", "games": 9}]
        assert emg["status"] == "emerging" and "record" not in emg and "wins" not in emg

    def test_archetype_mostly_one_player_has_no_verdict(self, tmp_path):
        site = _write_site(tmp_path, {"archetypes": {"3m": {"all": {"total_decks": 100, "commanders": {
            "Alpha One": {"deck_count": 60, "skipped": False, "packages": [], "archetypes": [
                {"id": "pkg-1", "name": "Alpha: Big / Small", "deck_count": 55, "wins": 43,
                 "commander_share": 0.9, "key_cards": [], "decklists": [
                     {"deck_name": "d", "username": "Mad", "count": 42, "deck_code": "c1"},
                     {"deck_name": "d2", "username": "Mad", "count": 11, "deck_code": "c2"},
                     {"deck_name": "e", "username": "Unknown", "count": 2, "deck_code": "c3"}]}]}}}}}})
        a = pf._ways_to_play(site, "3m", "Alpha One")["archetypes"][0]
        assert a["concentration"] == {"top_pilot_share": 0.9636, "pilots_listed": 1,
                                      "listed_share": 1.0, "concentrated": True}
        rec = a["record"]
        assert rec["games"] == 55 and rec["wins"] == 43
        assert rec["wr"] is None and rec["lo"] is None and rec["verdict"] == "one_player"
        assert rec["verdict_label"] == "Mostly one player's games"

    def _record_site(self, tmp_path, pilots_key=True, pilots=7, top=10):
        rows = [{"name": "Alpha One", "matches": 110, "wins": 70},
                {"name": "Beta, Two", "matches": 90, "wins": 30}]
        if pilots_key:
            rows[0]["pilots"] = pilots
        matchups = {"commanders": ["Alpha One", "Beta, Two"], "matchups": [
            {"commander": "Alpha One", "opponent": "Beta, Two", "wins": 60, "losses": 30, "total": 90},
            {"commander": "Beta, Two", "opponent": "Alpha One", "wins": 30, "losses": 60, "total": 90},
            {"commander": "Alpha One", "opponent": "Alpha One", "wins": 10, "losses": 10, "total": 20}]}
        return _write_site(tmp_path, {
            "commander_stats": {"3m": {"all": rows}},
            "matchups": {"3m": {"all": matchups}},
            "archetypes": {"3m": {"all": {"commanders": {"Alpha One": {"deck_count": 110, "archetypes": [
                {"deck_count": 110, "decklists": [{"username": "p1", "count": top},
                                                  {"username": "p2", "count": 10}]}]}}}}},
        })

    def test_record_is_mirror_free_with_pilot_gates(self, tmp_path):
        rec = pf.commander_record(self._record_site(tmp_path), "3m", "all", "Alpha One")
        assert rec["basis"] == "mirror-free" and rec["games"] == 90 and rec["wins"] == 60
        assert rec["games_incl_mirrors"] == 110 and rec["mirror_games"] == 10
        assert rec["verdict"] == "above_even" and rec["pick_share"] == 0.55
        assert rec["pilots"] == 7 and rec["pilots_status"] == "ok"
        few = pf.commander_record(self._record_site(tmp_path / "f", pilots=None), "3m", "all", "Alpha One")
        assert few["pilots_status"] == "below_min" and few["verdict"] == "few_players" and few["wr"] is None
        old = pf.commander_record(self._record_site(tmp_path / "o", pilots_key=False), "3m", "all", "Alpha One")
        assert old["pilots_status"] == "unknown" and old["verdict"] == "above_even"
        one = pf.commander_record(self._record_site(tmp_path / "c", top=80), "3m", "all", "Alpha One")
        assert one["concentration"]["concentrated"] and one["verdict"] == "one_player"

    def test_peer_baseline_only_counts_commanders_that_run_the_faction(self):
        card_ref = {"Warcry": {"faction": "skaal"}, "Scout": {"faction": "neutral"},
                    "S1": {"faction": "skaal"}, "S2": {"faction": "skaal"}, "S3": {"faction": "skaal"}}
        cmds = {"K1": {"faction": "skaal"}, "K2": {"faction": "skaal"}, "Lz": {"faction": "neutral"},
                "L1": {"faction": "lucia"}, "L2": {"faction": "lucia"}}
        ccs = {
            "K1": [{"name": "Warcry", "inclusion_rate": 0.8}, {"name": "Scout", "inclusion_rate": 0.5}],
            "K2": [{"name": "Warcry", "inclusion_rate": 0.4}],
            "Lz": [{"name": n, "inclusion_rate": 0.2} for n in ("S1", "S2", "S3")],
            "L1": [{"name": "Scout", "inclusion_rate": 0.5}],
            "L2": [],
        }
        base = pf.peer_baselines(ccs, card_ref, cmds)
        assert base["Warcry"] == (pytest.approx(0.4), 3)   # K1, K2, Lz (runs 3 skaal cards)
        assert base["Scout"] == (pytest.approx(0.2), 5)    # neutral: every commander


# ─── Community decks ──────────────────────────────────────────────

def _arch(rows_by_window):
    out = {}
    for (period, map_name), decklists in rows_by_window.items():
        out.setdefault(period, {})[map_name] = {"total_decks": 1, "commanders": {"Alpha One": {
            "deck_count": 10, "skipped": False, "packages": [],
            "archetypes": [{"id": "pkg-1", "name": "Alpha: Burn", "deck_count": 10, "wins": 5,
                            "decklists": decklists}]}}}
    return out


class TestCommunityDecks:
    def test_dedup_recency_and_username(self):
        arch = _arch({
            ("all", "all"): [{"deck_name": "Fire", "username": "ann", "count": 30, "deck_code": "AAA"},
                             {"deck_name": "Old", "username": "bob", "count": 50, "deck_code": "BBB"}],
            ("1m", "all"): [{"deck_name": "Fire", "username": "cat", "count": 4, "deck_code": "AAA"}],
            ("3m", "Dunes"): [{"deck_name": "Fire", "username": "ann", "count": 9, "deck_code": "AAA"}],
            ("6m", "all"): [{"deck_name": "NoCode", "username": "x", "count": 9}],
        })
        files = build_community_decks(arch, COMMANDERS, "t")
        doc = files["community_decks.json"]
        assert doc["count"] == 2 and doc["chunks"] is None
        first, second = doc["decks"]
        assert first["deck_code"] == "AAA" and first["last_seen"] == "1m"
        assert first["games"] == 30 and first["games_30d"] == 4 and first["maps"] == ["Dunes"]
        assert first["username"] == "ann" and first["archetype"] == "Burn"
        assert first["faction"] == "skaal" and first["commander_slug"] == "alpha-one"
        assert second["deck_code"] == "BBB" and second["last_seen"] == "all" and second["games_30d"] is None

    def test_chunking_preserves_rows(self):
        lists = [{"deck_name": f"Deck {i}", "username": f"user{i}", "count": i + 1,
                  "deck_code": f"CODE{i:04d}" + "x" * 60} for i in range(200)]
        arch = _arch({("all", "all"): lists})
        files = build_community_decks(arch, COMMANDERS, "t", chunk_bytes=8000)
        head = files["community_decks.json"]
        assert head["chunks"] and head["decks"] == [] and head["count"] == 200
        rows = [r for rel in head["chunks"] for r in files[rel]["decks"]]
        assert len(rows) == 200 and len({r["deck_code"] for r in rows}) == 200
        for rel in head["chunks"]:
            assert len(dumps(files[rel]).encode()) <= 8000


# ─── End-to-end on the real published data ────────────────────────

def _walk_numbers(obj):
    if isinstance(obj, float):
        yield obj
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from _walk_numbers(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from _walk_numbers(v)


@pytest.fixture(scope="module")
def real_build(tmp_path_factory):
    needed = ["metadata", "commanders", "cards", "matchups", "commander_stats", "archetypes",
              "commander_card_stats", "commander_winrate_trends"]
    if not all((DATA_DIR / f"{n}.json").exists() for n in needed):
        pytest.skip("published site/data not available")
    from insights.build import build_all
    out = tmp_path_factory.mktemp("insights")
    review = tmp_path_factory.mktemp("review")
    res = build_all(DATA_DIR, out, review, DATA_DIR.parent.parent, use_git=False,
                    allow_fresh_baseline=True)
    res2 = build_all(DATA_DIR, out, review, DATA_DIR.parent.parent, use_git=False)
    return out, res, res2


class TestRealBuild:
    def test_outputs_are_finite_and_parse(self, real_build):
        out, _, _ = real_build
        files = list(out.rglob("*.json"))
        assert len(files) >= 5 + 16
        for f in files:
            data = json.loads(f.read_text(), parse_constant=lambda c: pytest.fail(f"{c} in {f}"))
            for x in _walk_numbers(data):
                assert math.isfinite(x)

    def test_profiles_small_and_slugs_match(self, real_build):
        out, res, _ = real_build
        commanders = json.loads((DATA_DIR / "commanders.json").read_text())
        expected = {commander_slug(c["name"]) for c in commanders}
        got = {p.stem for p in (out / "commanders").glob("*.json")}
        assert got == expected
        assets = DATA_DIR.parent / "assets" / "commanders"
        for slug in got:
            path = out / "commanders" / f"{slug}.json"
            assert path.stat().st_size <= pf.MAX_PROFILE_BYTES, f"{slug} profile too large"
            prof = json.loads(path.read_text())
            assert prof["identity"]["slug"] == slug
            if assets.exists() and not (assets / f"{slug}.jpg").exists():
                # A new commander can land before its art; never block the
                # daily data commit on that.
                warnings.warn(f"no commander art for {slug}")

    def test_rebuild_is_byte_identical(self, real_build):
        _, res, res2 = real_build
        assert res["written"] == res2["written"]
        assert dumps(res["pulse"]) == dumps(res2["pulse"])
        assert dumps(res["changelog"]) == dumps(res2["changelog"])

    def test_manifest_lists_every_file(self, real_build):
        out, _, _ = real_build
        index = json.loads((out / "index.json").read_text())
        listed = {f["path"] for f in index["files"]}
        on_disk = {str(p.relative_to(out)) for p in out.rglob("*.json")} - {"index.json"}
        assert on_disk <= listed | {"index.json"}
        assert index["gates"]["stats_kit"]["min_games_for_estimate"] == 20
        assert index["gates"]["stats_kit"]["low_data_below_games"] == 40

    def test_no_point_estimates_below_gate(self, real_build):
        out, _, _ = real_build
        seen = {"rate": 0, "pair": 0, "strength": 0}

        def check(o):
            if isinstance(o, dict):
                if "games" in o and "wr" in o and isinstance(o["games"], int):
                    seen["rate"] += 1
                    if o["games"] < 20 or o["verdict"] in ("one_player", "few_players"):
                        assert o["wr"] is None and o["lo"] is None and o["hi"] is None
                    else:
                        assert o["lo"] <= o["wr"] <= o["hi"]
                if "n" in o and "est" in o and "favored" in o:       # matchup rows
                    seen["pair"] += 1
                    if o["n"] < mm.LOW_DATA_N:
                        assert o["est"] is None and o["lo"] is None and o["favored"] is None
                    if o["favored"] is not None:
                        my_wins = o["wins"]
                        if o["favored"] == "a":
                            assert o["lo"] > 0.5 and my_wins * 2 > o["n"]
                        else:
                            assert o["hi"] < 0.5 and my_wins * 2 < o["n"]
                if "strength" in o and "games" in o:                  # BT commanders
                    seen["strength"] += 1
                    if o["games"] < mm.STRENGTH_MIN_GAMES:
                        assert o["strength"] is None and o["expected_vs_field"] is None
                for v in o.values():
                    check(v)
            elif isinstance(o, list):
                for v in o:
                    check(v)
        for f in (out / "commanders").glob("*.json"):
            prof = json.loads(f.read_text())
            check(prof)
            for win in prof["windows"].values():
                m = win["matchups"]
                ops = {o["opponent"]: o for o in m["opponents"]}
                for name in m["best"] + m["worst"]:
                    o = ops[name]
                    assert o["n"] >= mm.RELIABLE_N and not (o["lo"] <= 0.5 <= o["hi"])
                assert all(ops[n]["favored"] == "a" for n in m["best"])
                assert all(ops[n]["favored"] == "b" for n in m["worst"])
        check(json.loads((out / "meta_pulse.json").read_text()))
        check(json.loads((out / "matchup_model.json").read_text()))
        assert seen["rate"] > 500 and seen["pair"] > 500 and seen["strength"] > 100

    def test_no_tier_fields(self, real_build):
        """Owner decision: no tier lists or tier labels anywhere (keys and
        generated labels; user-written deck names are left alone)."""
        out, _, _ = real_build

        tier = re.compile(r"\btiers?\b", re.I)   # "Frontier Scout" is fine

        def check(o, where):
            if isinstance(o, dict):
                for k, v in o.items():
                    assert not tier.search(k), f"tier key {k} in {where}"
                    if k in ("verdict_label", "text", "discord_text", "summary", "label"):
                        assert not tier.search(str(v)), f"tier wording in {where}: {v}"
                    check(v, where)
            elif isinstance(o, list):
                for v in o:
                    check(v, where)
        for f in out.rglob("*.json"):
            check(json.loads(f.read_text()), f.name)


class TestBuildSafety:
    """CI safety: a failing builder writes nothing, and a missing changelog
    on a history-less checkout is refused instead of silently reset."""

    def _needs_data(self):
        if not (DATA_DIR / "metadata.json").exists():
            pytest.skip("published site/data not available")

    def test_failure_writes_nothing(self, tmp_path, monkeypatch):
        self._needs_data()
        from insights import build

        def boom(*a, **k):
            raise RuntimeError("synthetic failure")
        monkeypatch.setattr(build.mp, "build_meta_pulse", boom)
        out, review = tmp_path / "out", tmp_path / "review"
        with pytest.raises(RuntimeError):
            build.build_all(DATA_DIR, out, review, tmp_path, use_git=False, allow_fresh_baseline=True)
        assert not out.exists() or not list(out.rglob("*.json"))
        assert not review.exists() or not list(review.rglob("*.json"))

    def test_cli_exit_code_when_changelog_state_missing(self, tmp_path, capsys):
        self._needs_data()
        import build_insights
        args = ["--out-dir", str(tmp_path / "out"), "--review-dir", str(tmp_path / "review"), "--no-git"]
        assert build_insights.main(args) == 2
        assert "Refusing" in capsys.readouterr().err
        assert not (tmp_path / "out").exists()
        assert build_insights.main(args + ["--allow-fresh-baseline"]) == 0
        assert (tmp_path / "out" / "card_changelog.json").exists()
        assert (tmp_path / "out" / "_state" / "card_changelog_state.json").exists()
        assert build_insights.main(args) == 0        # state now present: incremental
