"""Category E: Filtering & Data Flow Tests

Tests for filter_games_by_period(), filter_games_by_map(), bucket boundary
conditions, and cache round-trips. See docs/TEST_DESIGN.md.
"""

import json
import tempfile
from datetime import datetime, timezone, timedelta
from pathlib import Path

import pytest
from helpers import make_clean_game, make_games

from fetch_data import (
    filter_games_by_period,
    filter_games_by_map,
    aggregate_duration_winrates,
    aggregate_action_winrates,
    aggregate_turn_winrates,
    load_cache,
    save_cache,
    DATA_DIR,
    RAW_CACHE,
)


# ─── E1: Period filtering boundary ───────────────────────────────

class TestE1_PeriodFilterBoundary:
    """Games at the exact boundary date should be included/excluded correctly."""

    def test_game_within_period_included(self):
        now = datetime.now(timezone.utc)
        recent = (now - timedelta(days=5)).isoformat()
        games = [make_clean_game(datetime=recent)]
        result = filter_games_by_period(games, 30)
        assert len(result) == 1

    def test_game_outside_period_excluded(self):
        now = datetime.now(timezone.utc)
        old = (now - timedelta(days=60)).isoformat()
        games = [make_clean_game(datetime=old)]
        result = filter_games_by_period(games, 30)
        assert len(result) == 0

    def test_game_missing_datetime_excluded(self):
        games = [make_clean_game(datetime=None)]
        result = filter_games_by_period(games, 30)
        assert len(result) == 0

    def test_game_with_invalid_datetime_excluded(self):
        games = [make_clean_game(datetime="not-a-date")]
        result = filter_games_by_period(games, 30)
        assert len(result) == 0


# ─── E2: Period None returns all ──────────────────────────────────

class TestE2_PeriodNoneReturnsAll:
    """filter_games_by_period(games, None) should return all games unchanged."""

    def test_none_returns_all(self):
        games = make_games(10)
        result = filter_games_by_period(games, None)
        assert len(result) == 10

    def test_none_returns_same_objects(self):
        games = make_games(5)
        result = filter_games_by_period(games, None)
        assert result is games  # Should be the same list, not a copy


# ─── E3: Map filtering ───────────────────────────────────────────

class TestE3_MapFiltering:
    """filter_games_by_map should correctly filter by map name."""

    def test_filter_dunes(self):
        games = (
            make_games(5, map_name="Dunes") +
            make_games(3, map_name="Snowmelt")
        )
        # Give unique IDs
        for i, g in enumerate(games):
            g["game_id"] = f"map-{i}"

        result = filter_games_by_map(games, "Dunes")
        assert len(result) == 5
        assert all(g["map"] == "Dunes" for g in result)

    def test_filter_all_returns_everything(self):
        games = (
            make_games(5, map_name="Dunes") +
            make_games(3, map_name="Snowmelt")
        )
        result = filter_games_by_map(games, "all")
        assert len(result) == 8

    def test_filter_nonexistent_map_returns_empty(self):
        games = make_games(5, map_name="Dunes")
        result = filter_games_by_map(games, "Mars")
        assert len(result) == 0


# ─── E4: Bucket boundary conditions ──────────────────────────────

class TestE4_BucketBoundaries:
    """Edge values at exact bucket boundaries must land in the correct bucket."""

    def test_duration_at_exactly_10_minutes(self):
        """10 min should go in the 10-20 bucket, not 0-10."""
        game = make_clean_game(
            duration_minutes=10.0,
            players_overrides=[
                {"commander": "A", "winner": True},
                {"commander": "B", "winner": False},
            ],
        )
        result = aggregate_duration_winrates([game])
        # Bucket 0 = 0-10, Bucket 1 = 10-20
        for cmd, buckets in result["commanders"].items():
            assert buckets[0]["games"] == 0, f"{cmd}: 10 min landed in 0-10 bucket"
            assert buckets[1]["games"] == 1, f"{cmd}: 10 min missing from 10-20 bucket"

    def test_duration_at_exactly_30_minutes(self):
        """30 min should go in the 30+ bucket."""
        game = make_clean_game(
            duration_minutes=30.0,
            players_overrides=[
                {"commander": "A", "winner": True},
                {"commander": "B", "winner": False},
            ],
        )
        result = aggregate_duration_winrates([game])
        for cmd, buckets in result["commanders"].items():
            assert buckets[3]["games"] == 1, f"{cmd}: 30 min missing from 30+ bucket"

    def test_actions_at_exactly_30(self):
        """30 actions should go in 30-60 bucket, not 0-30."""
        game = make_clean_game(
            players_overrides=[
                {"commander": "A", "winner": True, "actions": 30},
                {"commander": "B", "winner": False, "actions": 30},
            ],
        )
        result = aggregate_action_winrates([game])
        for cmd, buckets in result["commanders"].items():
            assert buckets[0]["games"] == 0, f"{cmd}: 30 actions landed in 0-30 bucket"
            assert buckets[1]["games"] == 1, f"{cmd}: 30 actions missing from 30-60 bucket"

    def test_turns_at_exactly_5(self):
        """5 turns should go in 5-8 bucket, not 1-5."""
        game = make_clean_game(
            players_overrides=[
                {"commander": "A", "winner": True, "turns": 5},
                {"commander": "B", "winner": False, "turns": 5},
            ],
        )
        result = aggregate_turn_winrates([game])
        for cmd, buckets in result["commanders"].items():
            assert buckets[0]["games"] == 0, f"{cmd}: 5 turns landed in 1-5 bucket"
            assert buckets[1]["games"] == 1, f"{cmd}: 5 turns missing from 5-8 bucket"


# ─── E5: Cache round-trip ────────────────────────────────────────

class TestE5_CacheRoundTrip:
    """Games saved to cache should load back identically."""

    def test_round_trip(self, tmp_path, monkeypatch):
        """Save games to a temp cache, load them back, verify equality."""
        temp_cache = tmp_path / "test_cache.json"
        monkeypatch.setattr("fetch_data.RAW_CACHE", temp_cache)
        monkeypatch.setattr("fetch_data.DATA_DIR", tmp_path)

        original_games = make_games(5)
        save_cache(original_games)

        loaded_games, loaded_ids = load_cache()
        assert len(loaded_games) == 5
        assert len(loaded_ids) == 5

        # Verify game IDs match
        original_ids = {g["game_id"] for g in original_games}
        assert loaded_ids == original_ids

    def test_empty_cache_returns_empty(self, tmp_path, monkeypatch):
        temp_cache = tmp_path / "nonexistent.json"
        monkeypatch.setattr("fetch_data.RAW_CACHE", temp_cache)

        games, ids = load_cache()
        assert games == []
        assert ids == set()

    def test_corrupted_cache_returns_empty(self, tmp_path, monkeypatch):
        temp_cache = tmp_path / "bad_cache.json"
        temp_cache.write_text("{corrupted json[[[[")
        monkeypatch.setattr("fetch_data.RAW_CACHE", temp_cache)

        games, ids = load_cache()
        assert games == []
        assert ids == set()
