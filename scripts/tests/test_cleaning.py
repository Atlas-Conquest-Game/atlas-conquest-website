"""Category A: Data Cleaning Tests

Tests for clean_game() — the gatekeeper that decides which raw DynamoDB
items become valid games. See docs/TEST_DESIGN.md for the
question each test answers.
"""

import json
import pytest
from helpers import make_raw_item

from pipeline.cleaning import clean_game, parse_datetime, parse_players_json, normalize_commander


# ─── A1: firstPlayer="0" rejected ────────────────────────────────

class TestA1_FirstPlayerZero:
    """Games that never started (firstPlayer=0) must be filtered out."""

    def test_string_zero_rejected(self):
        item = make_raw_item(firstPlayer="0")
        assert clean_game(item) is None

    def test_int_zero_rejected(self):
        item = make_raw_item(firstPlayer=0)
        assert clean_game(item) is None


# ─── A2: No/empty players rejected ───────────────────────────────

class TestA2_NoPlayers:
    """Games with missing or unparseable players data must be rejected."""

    def test_empty_string_rejected(self):
        item = make_raw_item(players="")
        assert clean_game(item) is None

    def test_none_rejected(self):
        item = make_raw_item(players=None)
        assert clean_game(item) is None

    def test_invalid_json_rejected(self):
        item = make_raw_item(players="not valid json{{{")
        assert clean_game(item) is None

    def test_missing_players_key_rejected(self):
        item = make_raw_item(players=json.dumps({"numPlayers": 2}))
        assert clean_game(item) is None


# ─── A3: numPlayers < 2 rejected ─────────────────────────────────

class TestA3_TooFewPlayers:
    """Games with fewer than 2 players must be rejected."""

    def test_num_players_one(self):
        item = make_raw_item(players=json.dumps({
            "numPlayers": 1,
            "players": [{"name": "Solo", "turnsTaken": 5, "actionsTaken": 10,
                         "winner": True, "decklist": {"_commander": "X", "_cards": []},
                         "cardsDrawn": [], "cardsPlayed": []}],
        }))
        assert clean_game(item) is None

    def test_num_players_zero(self):
        item = make_raw_item(players=json.dumps({
            "numPlayers": 0,
            "players": [],
        }))
        assert clean_game(item) is None

    def test_num_players_string_one(self):
        """numPlayers as string "1" should still be rejected."""
        item = make_raw_item(players=json.dumps({
            "numPlayers": "1",
            "players": [{"name": "Solo", "turnsTaken": 5, "actionsTaken": 10,
                         "winner": True, "decklist": {"_commander": "X", "_cards": []},
                         "cardsDrawn": [], "cardsPlayed": []}],
        }))
        assert clean_game(item) is None


# ─── A4: Low turns rejected ──────────────────────────────────────

class TestA4_LowTurns:
    """Games where either player has fewer than MIN_TURNS (3) turns must be rejected."""

    def test_player1_zero_turns(self):
        item = make_raw_item(player1_overrides={"turnsTaken": 0})
        assert clean_game(item) is None

    def test_player2_one_turn(self):
        item = make_raw_item(player2_overrides={"turnsTaken": 1})
        assert clean_game(item) is None

    def test_two_turns_rejected(self):
        """2 turns per player is too short — should be rejected."""
        item = make_raw_item(
            player1_overrides={"turnsTaken": 2},
            player2_overrides={"turnsTaken": 2},
        )
        assert clean_game(item) is None

    def test_both_at_minimum_accepted(self):
        """Exactly MIN_TURNS=3 should be accepted."""
        item = make_raw_item(
            player1_overrides={"turnsTaken": 3},
            player2_overrides={"turnsTaken": 3},
        )
        result = clean_game(item)
        assert result is not None

    def test_string_turns_below_minimum(self):
        """turnsTaken as string "2" should be rejected with MIN_TURNS=3."""
        item = make_raw_item(player1_overrides={"turnsTaken": "2"})
        assert clean_game(item) is None


# ─── A5: firstPlayer type coercion ────────────────────────────────

class TestA5_FirstPlayerTypes:
    """firstPlayer must work as int or string. This is the exact bug we had."""

    def test_string_one_accepted(self):
        item = make_raw_item(firstPlayer="1")
        result = clean_game(item)
        assert result is not None
        assert result["first_player"] == "1"

    def test_int_one_accepted(self):
        item = make_raw_item(firstPlayer=1)
        result = clean_game(item)
        assert result is not None
        assert result["first_player"] == "1"

    def test_string_two_accepted(self):
        item = make_raw_item(firstPlayer="2")
        result = clean_game(item)
        assert result is not None
        assert result["first_player"] == "2"

    def test_int_two_accepted(self):
        item = make_raw_item(firstPlayer=2)
        result = clean_game(item)
        assert result is not None
        assert result["first_player"] == "2"

    def test_string_99_accepted(self):
        """99 means random/unknown — game is still valid, just excluded from first-turn stats."""
        item = make_raw_item(firstPlayer="99")
        result = clean_game(item)
        assert result is not None
        assert result["first_player"] == "99"

    def test_int_99_accepted(self):
        item = make_raw_item(firstPlayer=99)
        result = clean_game(item)
        assert result is not None
        assert result["first_player"] == "99"


# ─── A6: winner type coercion ─────────────────────────────────────

class TestA6_WinnerTypes:
    """winner field must handle bool and string representations."""

    def test_bool_true(self):
        item = make_raw_item(player1_overrides={"winner": True})
        result = clean_game(item)
        assert result["players"][0]["winner"] is True

    def test_bool_false(self):
        item = make_raw_item(player1_overrides={"winner": False})
        result = clean_game(item)
        assert result["players"][0]["winner"] is False

    def test_string_true(self):
        item = make_raw_item(player1_overrides={"winner": "true"})
        result = clean_game(item)
        assert result["players"][0]["winner"] is True

    def test_string_false(self):
        item = make_raw_item(player1_overrides={"winner": "false"})
        result = clean_game(item)
        assert result["players"][0]["winner"] is False

    def test_string_True_capitalized(self):
        item = make_raw_item(player1_overrides={"winner": "True"})
        result = clean_game(item)
        assert result["players"][0]["winner"] is True

    def test_missing_winner_defaults_false(self):
        """Missing winner field should default to False, not crash."""
        item = make_raw_item(player1_overrides={"winner": False})
        # Remove winner key entirely from the raw player
        players_data = json.loads(item["players"])
        del players_data["players"][0]["winner"]
        item["players"] = json.dumps(players_data)
        result = clean_game(item)
        assert result is not None
        assert result["players"][0]["winner"] is False


# ─── A7: Numeric string coercion ─────────────────────────────────

class TestA7_NumericCoercion:
    """turnsTaken, actionsTaken, and card Count must coerce from string to int."""

    def test_turns_as_string(self):
        item = make_raw_item(player1_overrides={"turnsTaken": "7"})
        result = clean_game(item)
        assert result["players"][0]["turns"] == 7

    def test_actions_as_string(self):
        item = make_raw_item(player1_overrides={"actionsTaken": "42"})
        result = clean_game(item)
        assert result["players"][0]["actions"] == 42

    def test_card_count_as_string(self):
        item = make_raw_item(player1_overrides={
            "decklist": {
                "_commander": "Captain Greenbeard",
                "_name": "Test",
                "_cards": [{"CardName": "Fire Bolt", "Count": "3"}],
            },
        })
        result = clean_game(item)
        assert result["players"][0]["cards_in_deck"][0]["count"] == 3

    def test_non_numeric_turns_defaults_zero(self):
        """Non-numeric string for turnsTaken should default to 0 and be rejected (< MIN_TURNS)."""
        item = make_raw_item(player1_overrides={"turnsTaken": "abc"})
        assert clean_game(item) is None


# ─── A8: Commander name normalization ─────────────────────────────

class TestA8_CommanderNormalization:
    """Old/misspelled commander names must be normalized to canonical names."""

    def test_emmisary_to_emissary(self):
        item = make_raw_item(player1_overrides={
            "decklist": {
                "_commander": "Elber, Jungle Emmisary",
                "_name": "Test",
                "_cards": [{"CardName": "X", "Count": 1}],
            },
        })
        result = clean_game(item)
        assert result["players"][0]["commander"] == "Elber, Jungle Emissary"

    def test_layna_to_viessa(self):
        item = make_raw_item(player1_overrides={
            "decklist": {
                "_commander": "Layna, Soulcatcher",
                "_name": "Test",
                "_cards": [{"CardName": "X", "Count": 1}],
            },
        })
        result = clean_game(item)
        assert result["players"][0]["commander"] == "Soultaker Viessa"

    def test_canonical_name_unchanged(self):
        item = make_raw_item(player1_overrides={
            "decklist": {
                "_commander": "Captain Greenbeard",
                "_name": "Test",
                "_cards": [{"CardName": "X", "Count": 1}],
            },
        })
        result = clean_game(item)
        assert result["players"][0]["commander"] == "Captain Greenbeard"


# ─── A9: Card name normalization ─────────────────────────────────

class TestA9_CardNormalization:
    """Card names must go through normalize_card()."""

    def test_canonical_card_unchanged(self):
        item = make_raw_item()
        result = clean_game(item)
        card_names = [c["name"] for c in result["players"][0]["cards_in_deck"]]
        assert "Fire Bolt" in card_names

    def test_empty_card_name_skipped(self):
        """Cards with empty names should not appear in the output."""
        item = make_raw_item(player1_overrides={
            "decklist": {
                "_commander": "Captain Greenbeard",
                "_name": "Test",
                "_cards": [
                    {"CardName": "Fire Bolt", "Count": 1},
                    {"CardName": "", "Count": 1},
                ],
            },
        })
        result = clean_game(item)
        card_names = [c["name"] for c in result["players"][0]["cards_in_deck"]]
        assert "" not in card_names
        assert len(card_names) == 1


# ─── A10: Valid game output shape ─────────────────────────────────

class TestA10_OutputShape:
    """A valid game must produce a dict with all expected keys."""

    def test_has_required_keys(self):
        item = make_raw_item()
        result = clean_game(item)
        assert result is not None

        required_keys = {"game_id", "datetime", "datetime_started", "duration_minutes",
                         "map", "format", "first_player", "players"}
        assert set(result.keys()) == required_keys

    def test_players_have_required_keys(self):
        item = make_raw_item()
        result = clean_game(item)

        player_keys = {"name", "winner", "commander", "deck_name", "turns", "actions",
                       "cards_in_deck", "cards_drawn", "cards_played",
                       "mulligan_kept", "mulligan_returned"}
        for p in result["players"]:
            assert set(p.keys()) == player_keys

    def test_has_two_players(self):
        item = make_raw_item()
        result = clean_game(item)
        assert len(result["players"]) == 2


# ─── A11: Duration computation ────────────────────────────────────

class TestA11_Duration:
    """Duration should be computed correctly from start and end datetimes."""

    def test_20_minute_game(self):
        item = make_raw_item(
            datetimeStarted="01/15/2025 14:00:00",
            datetime="01/15/2025 14:20:00",
        )
        result = clean_game(item)
        assert result["duration_minutes"] == 20.0

    def test_90_second_game(self):
        item = make_raw_item(
            datetimeStarted="01/15/2025 14:00:00",
            datetime="01/15/2025 14:01:30",
        )
        result = clean_game(item)
        assert result["duration_minutes"] == 1.5

    def test_end_before_start_no_duration(self):
        """If end is before start, duration should be None (not negative)."""
        item = make_raw_item(
            datetimeStarted="01/15/2025 14:30:00",
            datetime="01/15/2025 14:00:00",
        )
        result = clean_game(item)
        assert result["duration_minutes"] is None


# ─── A12: Missing datetime still cleans ───────────────────────────

class TestA12_MissingDatetime:
    """Games with partial timestamps should still be accepted with duration=None."""

    def test_missing_end_datetime(self):
        item = make_raw_item(datetime="")
        result = clean_game(item)
        assert result is not None
        assert result["datetime"] is None
        assert result["duration_minutes"] is None

    def test_missing_start_datetime(self):
        item = make_raw_item(datetimeStarted="")
        result = clean_game(item)
        assert result is not None
        assert result["duration_minutes"] is None

    def test_both_datetimes_missing(self):
        item = make_raw_item(datetime="", datetimeStarted="")
        result = clean_game(item)
        assert result is not None
        assert result["duration_minutes"] is None


# ─── Helper function tests ────────────────────────────────────────

class TestParseDatetime:
    def test_valid_format(self):
        dt = parse_datetime("01/15/2025 14:30:00")
        assert dt is not None
        assert dt.month == 1
        assert dt.day == 15
        assert dt.hour == 14

    def test_empty_string(self):
        assert parse_datetime("") is None

    def test_none(self):
        assert parse_datetime(None) is None

    def test_wrong_format(self):
        assert parse_datetime("2025-01-15T14:30:00") is None


class TestParsePlayersJson:
    def test_normal_json(self):
        data = {"numPlayers": 2, "players": []}
        result = parse_players_json(json.dumps(data))
        assert result["numPlayers"] == 2

    def test_double_encoded(self):
        """DynamoDB sometimes wraps JSON with extra quotes using "" convention."""
        inner = '{"numPlayers": 2, "players": []}'
        # The double-quoted format: outer quotes + "" for inner quotes
        double = '"' + inner.replace('"', '""') + '"'
        result = parse_players_json(double)
        assert result is not None
        assert result["numPlayers"] == 2

    def test_none_returns_none(self):
        assert parse_players_json(None) is None

    def test_empty_returns_none(self):
        assert parse_players_json("") is None


class TestNormalizeCommander:
    def test_known_rename(self):
        assert normalize_commander("Elber, Jungle Emmisary") == "Elber, Jungle Emissary"

    def test_unknown_name_unchanged(self):
        assert normalize_commander("New Commander") == "New Commander"

    def test_empty_returns_empty(self):
        assert normalize_commander("") == ""

    def test_none_returns_none(self):
        assert normalize_commander(None) is None
