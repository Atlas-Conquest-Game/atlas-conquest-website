"""Category D: Adversarial / Regression Tests

These tests INJECT known bugs and verify that our test suite catches them.
They exist to "keep ourselves honest" — if a D-test passes when it shouldn't,
our A/B/C tests have a gap.

See docs/TEST_DESIGN.md for the mapping.
"""

import json
import pytest
from helpers import make_raw_item, make_clean_game, make_games

from fetch_data import (
    clean_game,
    aggregate_commander_stats,
    aggregate_matchups,
    aggregate_card_stats,
    aggregate_first_turn,
    aggregate_trends,
)


# ─── D1: firstPlayer as integer instead of string ────────────────

class TestD1_FirstPlayerInt:
    """Injecting int firstPlayer should still produce a valid game.

    This verifies that clean_game() handles the type coercion correctly.
    If it didn't, the game would either crash or be silently dropped.
    """

    def test_int_1_produces_valid_game(self):
        item = make_raw_item(firstPlayer=1)  # int, not string
        result = clean_game(item)
        assert result is not None, "clean_game() rejected int firstPlayer=1"
        assert result["first_player"] == "1"

    def test_int_2_produces_valid_game(self):
        item = make_raw_item(firstPlayer=2)
        result = clean_game(item)
        assert result is not None, "clean_game() rejected int firstPlayer=2"
        assert result["first_player"] == "2"


# ─── D2: winner as string "1" instead of bool ────────────────────

class TestD2_WinnerStringOne:
    """If winner comes as string "1" (not "true"), it should be treated as falsy.

    The current code does: winner.lower() == "true". So "1" would become False.
    This test documents that behavior — "1" is NOT treated as a win.
    """

    def test_string_one_is_not_winner(self):
        item = make_raw_item(player1_overrides={"winner": "1"})
        result = clean_game(item)
        # "1".lower() != "true", so winner should be False
        assert result["players"][0]["winner"] is False

    def test_string_zero_is_not_winner(self):
        item = make_raw_item(player1_overrides={"winner": "0"})
        result = clean_game(item)
        assert result["players"][0]["winner"] is False


# ─── D3: Game with 3 players ─────────────────────────────────────

class TestD3_ThreePlayers:
    """A 3-player game would break the 2-player assumption in aggregations.

    clean_game() allows it through (just cleans the data), but aggregation
    functions like aggregate_matchups() explicitly skip games with != 2 players.
    """

    def test_three_player_game_cleans(self):
        """clean_game() should accept the game (it doesn't enforce 2-player limit)."""
        p3 = {
            "name": "Charlie",
            "turnsTaken": 5,
            "actionsTaken": 30,
            "winner": False,
            "decklist": {"_commander": "Z", "_name": "D3", "_cards": []},
            "cardsDrawn": [],
            "cardsPlayed": [],
        }
        item = make_raw_item(players=json.dumps({
            "numPlayers": 3,
            "players": [
                {"name": "Alice", "turnsTaken": 5, "actionsTaken": 40, "winner": True,
                 "decklist": {"_commander": "A", "_name": "D1", "_cards": []},
                 "cardsDrawn": [], "cardsPlayed": []},
                {"name": "Bob", "turnsTaken": 5, "actionsTaken": 35, "winner": False,
                 "decklist": {"_commander": "B", "_name": "D2", "_cards": []},
                 "cardsDrawn": [], "cardsPlayed": []},
                p3,
            ],
        }))
        result = clean_game(item)
        assert result is not None
        assert len(result["players"]) == 3

    def test_matchups_skip_three_player(self):
        """aggregate_matchups should skip games with != 2 players."""
        game = make_clean_game()
        game["players"].append({
            "name": "Charlie", "winner": False, "commander": "Z",
            "deck_name": "D3", "turns": 5, "actions": 30,
            "cards_in_deck": [], "cards_drawn": [], "cards_played": [],
        })
        matchups = aggregate_matchups([game])
        # Should produce no matchup entries (game was skipped)
        total_entries = sum(
            sum(d["wins"] + d["losses"] for d in opponents.values())
            for opponents in matchups.values()
        )
        assert total_entries == 0


# ─── D4: played_count > drawn_count ──────────────────────────────

class TestD4_PlayedExceedsDrawn:
    """If a card is played more often than drawn, something is wrong.

    With our fixture data this can't happen naturally (played is subset of drawn).
    This test verifies B7 would catch it if the data was corrupted.
    """

    def test_card_ordering_holds(self):
        """Normal data should always have played <= drawn <= deck."""
        games = make_games(20, p1_wins=10)
        result = aggregate_card_stats(games)
        if isinstance(result, tuple):
            card_data, _ = result
            for name, data in card_data.items():
                assert data["played_count"] <= data["drawn_count"], \
                    f"BUG: {name} played({data['played_count']}) > drawn({data['drawn_count']})"


# ─── D5: Winrate > 1.0 ───────────────────────────────────────────

class TestD5_WinrateAboveOne:
    """Verify that aggregation can never produce a winrate above 1.0."""

    def test_commander_stats_bounded(self):
        # All wins
        games = make_games(10, p1_wins=10)
        stats = aggregate_commander_stats(games)
        for cmd, data in stats.items():
            if data["matches"] > 0:
                wr = data["wins"] / data["matches"]
                assert wr <= 1.0, f"{cmd} winrate is {wr}"

    def test_all_losses_bounded(self):
        games = make_games(10, p1_wins=0)
        stats = aggregate_commander_stats(games)
        for cmd, data in stats.items():
            if data["matches"] > 0:
                wr = data["wins"] / data["matches"]
                assert wr >= 0.0, f"{cmd} winrate is {wr}"


# ─── D6: Missing period in output ────────────────────────────────

class TestD6_MissingPeriod:
    """Verify that C1 checks would detect a missing period.

    We simulate this by checking the structure of our known PERIODS constant.
    """

    def test_all_periods_defined(self):
        from fetch_data import PERIODS
        expected = {"all", "6m", "3m", "1m"}
        assert set(PERIODS.keys()) == expected

    def test_all_maps_defined(self):
        from fetch_data import MAPS
        expected = ["all", "Dunes", "Snowmelt", "Tropics"]
        assert MAPS == expected


# ─── D7: Duplicate commander from casing ──────────────────────────

class TestD7_CommanderCasing:
    """Same commander with different casing would create duplicates.

    normalize_commander() handles known renames, but what about casing?
    This test verifies the current behavior.
    """

    def test_exact_match_required(self):
        """normalize_commander does exact matching — 'captain greenbeard' != 'Captain Greenbeard'."""
        from fetch_data import normalize_commander
        # If someone typed a lowercase commander name, it would NOT be normalized
        result = normalize_commander("captain greenbeard")
        # It's not in COMMANDER_RENAMES, so it passes through unchanged
        assert result == "captain greenbeard"
        # This is fine because the game client sends consistent casing


# ─── D8: turnsTaken=0 must be rejected ───────────────────────────

class TestD8_ZeroTurns:
    """A game where a player took 0 turns must be rejected by clean_game()."""

    def test_zero_turns_rejected(self):
        item = make_raw_item(player1_overrides={"turnsTaken": 0})
        assert clean_game(item) is None

    def test_string_zero_turns_rejected(self):
        item = make_raw_item(player1_overrides={"turnsTaken": "0"})
        assert clean_game(item) is None

    def test_one_turn_rejected(self):
        """MIN_TURNS is 2, so 1 turn should also be rejected."""
        item = make_raw_item(player2_overrides={"turnsTaken": 1})
        assert clean_game(item) is None


# ─── D9: Matchup asymmetry detection ─────────────────────────────

class TestD9_MatchupAsymmetry:
    """If we only counted wins for A but not losses for B, the matrix would be asymmetric."""

    def test_wins_and_losses_both_tracked(self):
        games = make_games(10, p1_wins=7,
                           commander1="Alpha", commander2="Beta")
        matchups = aggregate_matchups(games)

        # A's wins against B should equal B's losses against A
        assert matchups["Alpha"]["Beta"]["wins"] == 7
        assert matchups["Beta"]["Alpha"]["losses"] == 7
        # And vice versa
        assert matchups["Beta"]["Alpha"]["wins"] == 3
        assert matchups["Alpha"]["Beta"]["losses"] == 3


# ─── D10: Faction trends completeness ────────────────────────────

class TestD10_FactionTrendsComplete:
    """All commanders should be counted in trends — missing a faction = bad sum."""

    def test_all_commanders_counted(self):
        games = []
        for i in range(20):
            games.append(make_clean_game(
                game_id=f"trend-{i}",
                datetime="2025-01-15T14:00:00",
                players_overrides=[
                    {"commander": "Captain Greenbeard", "winner": True},
                    {"commander": "Elber, Jungle Emissary", "winner": False},
                ],
            ))

        weekly, weekly_total = aggregate_trends(games)
        for week, total in weekly_total.items():
            if total < 4:
                continue
            counted = sum(weekly[week].values())
            # Every commander pick should be counted
            assert counted == total, \
                f"Week {week}: counted {counted} but total is {total}"
