"""Category C: Output Schema Validation Tests

Tests run against the REAL JSON files in site/data/ to validate the
contract between the pipeline and the frontend.
See docs/TEST_DESIGN.md.

These tests are skipped if the JSON files don't exist (e.g., fresh clone
without running the pipeline).
"""

import json
from datetime import datetime, timezone, timedelta
from pathlib import Path

import pytest
from helpers import load_real_json, DATA_DIR

PERIODS = ["all", "6m", "3m", "1m"]
MAPS = ["all", "Dunes", "Snowmelt", "Tropics"]

# Files that use the period x map nesting structure
NESTED_FILES = [
    "metadata.json",
    "commander_stats.json",
    "matchups.json",
    "matchup_details.json",
    "card_stats.json",
    "trends.json",
    "game_distributions.json",
    "deck_composition.json",
    "first_turn.json",
    "commander_trends.json",
    "duration_winrates.json",
    "action_winrates.json",
    "turn_winrates.json",
    "commander_card_stats.json",
]


def skip_if_no_data():
    """Skip test if site/data/ doesn't exist or is empty."""
    if not DATA_DIR.exists():
        pytest.skip("site/data/ not found — run pipeline first")
    if not any(DATA_DIR.glob("*.json")):
        pytest.skip("No JSON files in site/data/")


# ─── C1: All period x map combinations present ───────────────────

class TestC1_PeriodMapCombinations:
    """Every nested JSON file must have all 4 periods x 4 maps = 16 combinations."""

    @pytest.fixture(autouse=True)
    def check_data(self):
        skip_if_no_data()

    @pytest.mark.parametrize("filename", NESTED_FILES)
    def test_all_combinations_present(self, filename):
        data = load_real_json(filename)
        if data is None:
            pytest.skip(f"{filename} not found")

        for period in PERIODS:
            assert period in data, f"{filename}: missing period '{period}'"
            for map_name in MAPS:
                assert map_name in data[period], \
                    f"{filename}: missing map '{map_name}' in period '{period}'"


# ─── C2: All winrates between 0.0 and 1.0 ────────────────────────

class TestC2_WinrateBounds:
    """No winrate should be outside [0.0, 1.0]."""

    @pytest.fixture(autouse=True)
    def check_data(self):
        skip_if_no_data()

    def _check_winrates(self, data, path=""):
        """Recursively find all keys containing 'winrate' and check bounds."""
        if isinstance(data, dict):
            for key, value in data.items():
                new_path = f"{path}.{key}"
                if "winrate" in key.lower() and isinstance(value, (int, float)):
                    assert 0.0 <= value <= 1.0, \
                        f"Winrate out of bounds at {new_path}: {value}"
                else:
                    self._check_winrates(value, new_path)
        elif isinstance(data, list):
            for i, item in enumerate(data):
                self._check_winrates(item, f"{path}[{i}]")

    def test_commander_stats_winrates(self):
        data = load_real_json("commander_stats.json")
        if data is None:
            pytest.skip("commander_stats.json not found")
        self._check_winrates(data)

    def test_matchup_winrates(self):
        data = load_real_json("matchups.json")
        if data is None:
            pytest.skip("matchups.json not found")
        self._check_winrates(data)

    def test_matchup_detail_winrates(self):
        data = load_real_json("matchup_details.json")
        if data is None:
            pytest.skip("matchup_details.json not found")
        self._check_winrates(data)

    def test_card_stats_winrates(self):
        data = load_real_json("card_stats.json")
        if data is None:
            pytest.skip("card_stats.json not found")
        self._check_winrates(data)

    def test_first_turn_winrates(self):
        data = load_real_json("first_turn.json")
        if data is None:
            pytest.skip("first_turn.json not found")
        self._check_winrates(data)

    def test_duration_winrates(self):
        data = load_real_json("duration_winrates.json")
        if data is None:
            pytest.skip("duration_winrates.json not found")
        self._check_winrates(data)

    def test_commander_card_stats_winrates(self):
        data = load_real_json("commander_card_stats.json")
        if data is None:
            pytest.skip("commander_card_stats.json not found")
        self._check_winrates(data)


# ─── C3: All counts non-negative ─────────────────────────────────

class TestC3_NonNegativeCounts:
    """No count fields should be negative."""

    @pytest.fixture(autouse=True)
    def check_data(self):
        skip_if_no_data()

    def _check_counts(self, data, path=""):
        """Recursively find count/games/total fields and check >= 0."""
        count_keys = {"matches", "wins", "losses", "total", "games",
                      "deck_count", "drawn_count", "played_count",
                      "total_matches", "total_players",
                      "first_games", "second_games", "first_wins", "second_wins",
                      "first_player_wins", "total_games",
                      "drawn_instances", "played_instances"}
        if isinstance(data, dict):
            for key, value in data.items():
                new_path = f"{path}.{key}"
                if key in count_keys and isinstance(value, (int, float)):
                    assert value >= 0, f"Negative count at {new_path}: {value}"
                else:
                    self._check_counts(value, new_path)
        elif isinstance(data, list):
            for i, item in enumerate(data):
                self._check_counts(item, f"{path}[{i}]")

    def test_commander_stats_counts(self):
        data = load_real_json("commander_stats.json")
        if data is None:
            pytest.skip("commander_stats.json not found")
        self._check_counts(data)

    def test_matchup_counts(self):
        data = load_real_json("matchups.json")
        if data is None:
            pytest.skip("matchups.json not found")
        self._check_counts(data)

    def test_card_stats_counts(self):
        data = load_real_json("card_stats.json")
        if data is None:
            pytest.skip("card_stats.json not found")
        self._check_counts(data)

    def test_first_turn_counts(self):
        data = load_real_json("first_turn.json")
        if data is None:
            pytest.skip("first_turn.json not found")
        self._check_counts(data)

    def test_metadata_counts(self):
        data = load_real_json("metadata.json")
        if data is None:
            pytest.skip("metadata.json not found")
        self._check_counts(data)


# ─── C4: Commander name consistency across files ──────────────────

class TestC4_CommanderNameConsistency:
    """Commander names in commander_stats.json should match those in matchups.json."""

    @pytest.fixture(autouse=True)
    def check_data(self):
        skip_if_no_data()

    def test_stats_vs_matchups(self):
        stats_data = load_real_json("commander_stats.json")
        matchup_data = load_real_json("matchups.json")
        if stats_data is None or matchup_data is None:
            pytest.skip("Required files not found")

        # Check "all" period, "all" map
        stats_cmds = {c["name"] for c in stats_data.get("all", {}).get("all", [])}
        matchup_cmds = set(matchup_data.get("all", {}).get("all", {}).get("commanders", []))

        if stats_cmds and matchup_cmds:
            # Every commander in matchups should be in stats
            missing = matchup_cmds - stats_cmds
            assert len(missing) == 0, f"Commanders in matchups but not stats: {missing}"


# ─── C5: metadata.json has recent timestamp ───────────────────────

class TestC5_MetadataTimestamp:
    """last_updated should be within 48 hours (generous for CI reruns)."""

    @pytest.fixture(autouse=True)
    def check_data(self):
        skip_if_no_data()

    def test_recent_timestamp(self):
        data = load_real_json("metadata.json")
        if data is None:
            pytest.skip("metadata.json not found")

        ts_str = data.get("all", {}).get("all", {}).get("last_updated", "")
        if not ts_str:
            pytest.fail("No last_updated in metadata.json")

        ts = datetime.fromisoformat(ts_str)
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        age = datetime.now(timezone.utc) - ts
        assert age < timedelta(hours=48), f"metadata.json is {age} old"


# ─── C6: No duplicate commanders ─────────────────────────────────

class TestC6_NoDuplicateCommanders:
    """No commander should appear twice in commander_stats.json."""

    @pytest.fixture(autouse=True)
    def check_data(self):
        skip_if_no_data()

    def test_no_duplicates(self):
        data = load_real_json("commander_stats.json")
        if data is None:
            pytest.skip("commander_stats.json not found")

        for period in PERIODS:
            for map_name in MAPS:
                entries = data.get(period, {}).get(map_name, [])
                names = [e["name"] for e in entries]
                dupes = [n for n in names if names.count(n) > 1]
                assert len(dupes) == 0, \
                    f"Duplicate commanders in {period}/{map_name}: {set(dupes)}"


# ─── C7: matchup_details total = wins + losses ───────────────────

class TestC7_MatchupDetailConsistency:
    """Every matchup detail record must satisfy total = wins + losses."""

    @pytest.fixture(autouse=True)
    def check_data(self):
        skip_if_no_data()

    def test_total_consistency(self):
        data = load_real_json("matchup_details.json")
        if data is None:
            pytest.skip("matchup_details.json not found")

        for period in PERIODS:
            for map_name in MAPS:
                matchups = data.get(period, {}).get(map_name, [])
                for m in matchups:
                    assert m["total"] == m["wins"] + m["losses"], \
                        f"{m['commander']} vs {m['opponent']}: " \
                        f"total({m['total']}) != wins({m['wins']}) + losses({m['losses']})"


# ─── C8: Card stats vs cards reference ────────────────────────────

class TestC8_CardReferenceConsistency:
    """Cards in card_stats should ideally exist in cards.json reference."""

    @pytest.fixture(autouse=True)
    def check_data(self):
        skip_if_no_data()

    def test_card_stats_have_references(self):
        cards_ref = load_real_json("cards.json")
        card_stats = load_real_json("card_stats.json")
        if cards_ref is None or card_stats is None:
            pytest.skip("Required files not found")

        ref_names = {c["name"] for c in cards_ref}
        stats_names = {c["name"] for c in card_stats.get("all", {}).get("all", [])}

        # Flag cards in stats that don't have reference data (informational, not a hard failure)
        orphans = stats_names - ref_names
        if orphans:
            import warnings
            warnings.warn(f"Cards in stats without reference data: {orphans}")


# ─── C9: JSON file size sanity check ─────────────────────────────

class TestC9_FileSizes:
    """JSON files should be within reasonable size ranges."""

    @pytest.fixture(autouse=True)
    def check_data(self):
        skip_if_no_data()

    # (filename, min_kb, max_kb)
    SIZE_EXPECTATIONS = [
        ("metadata.json", 0.5, 100),
        ("commander_stats.json", 1, 500),
        ("matchups.json", 1, 2000),
        ("matchup_details.json", 10, 10000),
        ("card_stats.json", 5, 5000),
        ("commanders.json", 0.5, 100),
        ("cards.json", 1, 500),
        ("trends.json", 1, 1000),
        ("first_turn.json", 0.5, 500),
    ]

    @pytest.mark.parametrize("filename,min_kb,max_kb", SIZE_EXPECTATIONS)
    def test_file_size(self, filename, min_kb, max_kb):
        path = DATA_DIR / filename
        if not path.exists():
            pytest.skip(f"{filename} not found")

        size_kb = path.stat().st_size / 1024
        assert size_kb >= min_kb, \
            f"{filename} is too small ({size_kb:.1f}KB < {min_kb}KB) — possible truncation"
        assert size_kb <= max_kb, \
            f"{filename} is too large ({size_kb:.1f}KB > {max_kb}KB) — possible explosion"


# ─── C10: commanders.json sanity floor ────────────────────────────

class TestC10_CommanderSanityFloor:
    """commanders.json should have at least 10 commanders (the game has ~15)."""

    @pytest.fixture(autouse=True)
    def check_data(self):
        skip_if_no_data()

    def test_minimum_commanders(self):
        data = load_real_json("commanders.json")
        if data is None:
            pytest.skip("commanders.json not found")

        assert len(data) >= 10, \
            f"Only {len(data)} commanders — expected at least 10"

    def test_each_has_required_fields(self):
        data = load_real_json("commanders.json")
        if data is None:
            pytest.skip("commanders.json not found")

        required = {"name", "faction"}
        for cmd in data:
            for field in required:
                assert field in cmd, f"Commander missing '{field}': {cmd}"
