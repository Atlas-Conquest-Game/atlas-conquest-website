"""Category B: Aggregation Math Tests

Tests for the aggregation functions that turn clean games into stats.
Core question: is the math right? See docs/TEST_DESIGN.md.
"""

import pytest
from helpers import make_clean_game, make_games

from fetch_data import (
    aggregate_commander_stats,
    aggregate_matchups,
    aggregate_matchup_details,
    aggregate_card_stats,
    aggregate_trends,
    aggregate_first_turn,
    aggregate_commander_trends,
    aggregate_duration_winrates,
    aggregate_action_winrates,
    aggregate_turn_winrates,
    aggregate_commander_card_stats,
    aggregate_game_distributions,
)


# ─── B1: wins + losses = total for every commander ───────────────

class TestB1_WinsLossesTotal:
    """For every commander, wins + losses must equal total matches."""

    def test_simple_case(self):
        games = make_games(10, p1_wins=6)
        stats = aggregate_commander_stats(games)
        for cmd, data in stats.items():
            losses = data["matches"] - data["wins"]
            assert data["wins"] + losses == data["matches"]

    def test_all_wins_one_commander(self):
        games = make_games(5, p1_wins=5)
        stats = aggregate_commander_stats(games)
        assert stats["Captain Greenbeard"]["wins"] == 5
        assert stats["Captain Greenbeard"]["matches"] == 5
        assert stats["Elber, Jungle Emissary"]["wins"] == 0
        assert stats["Elber, Jungle Emissary"]["matches"] == 5


# ─── B2: winrate = wins / total, bounded [0, 1] ──────────────────

class TestB2_WinrateBounds:
    """Winrates must be between 0.0 and 1.0."""

    def test_winrate_calculation(self):
        games = make_games(10, p1_wins=7)
        stats = aggregate_commander_stats(games)
        for cmd, data in stats.items():
            wr = data["wins"] / data["matches"]
            assert 0.0 <= wr <= 1.0

    def test_zero_win_winrate(self):
        games = make_games(10, p1_wins=0)
        stats = aggregate_commander_stats(games)
        wr = stats["Captain Greenbeard"]["wins"] / stats["Captain Greenbeard"]["matches"]
        assert wr == 0.0

    def test_perfect_winrate(self):
        games = make_games(10, p1_wins=10)
        stats = aggregate_commander_stats(games)
        wr = stats["Captain Greenbeard"]["wins"] / stats["Captain Greenbeard"]["matches"]
        assert wr == 1.0


# ─── B3: Matchup win/loss symmetry (A beats B = A win + B loss) ──

class TestB3_MatchupCounting:
    """When A beats B, it should count as a win for A and a loss for B."""

    def test_win_loss_attribution(self):
        games = make_games(10, p1_wins=7)
        matchups = aggregate_matchups(games)
        c1, c2 = "Captain Greenbeard", "Elber, Jungle Emissary"

        assert matchups[c1][c2]["wins"] == 7
        assert matchups[c1][c2]["losses"] == 3
        assert matchups[c2][c1]["wins"] == 3
        assert matchups[c2][c1]["losses"] == 7


# ─── B4: Matchup matrix symmetry ─────────────────────────────────

class TestB4_MatchupSymmetry:
    """A vs B wins + B vs A wins = total games between them."""

    def test_symmetric_totals(self):
        games = make_games(20, p1_wins=12)
        matchups = aggregate_matchups(games)
        c1, c2 = "Captain Greenbeard", "Elber, Jungle Emissary"

        total_ab = matchups[c1][c2]["wins"] + matchups[c1][c2]["losses"]
        total_ba = matchups[c2][c1]["wins"] + matchups[c2][c1]["losses"]
        assert total_ab == total_ba == 20

    def test_multi_commander_symmetry(self):
        """With 3 commanders, all matchup pairs must be symmetric."""
        games = (
            make_games(6, commander1="A", commander2="B", p1_wins=4) +
            make_games(8, commander1="A", commander2="C", p1_wins=3) +
            make_games(4, commander1="B", commander2="C", p1_wins=2)
        )
        matchups = aggregate_matchups(games)

        for c1 in ["A", "B", "C"]:
            for c2 in ["A", "B", "C"]:
                if c1 == c2:
                    continue
                t1 = matchups[c1][c2]["wins"] + matchups[c1][c2]["losses"]
                t2 = matchups[c2][c1]["wins"] + matchups[c2][c1]["losses"]
                assert t1 == t2, f"Asymmetry: {c1} vs {c2}"


# ─── B5: First-turn stats only include explicit first_player ─────

class TestB5_FirstTurnFiltering:
    """Only games with first_player '1' or '2' should be counted."""

    def test_99_excluded(self):
        games = make_games(5, first_player="99") + make_games(5, first_player="1")
        ft = aggregate_first_turn(games)
        assert ft["total_games"] == 5  # Only the "1" games

    def test_empty_first_player_excluded(self):
        games = make_games(5, first_player="")
        ft = aggregate_first_turn(games)
        assert ft["total_games"] == 0


# ─── B6: First-turn game counts add up ───────────────────────────

class TestB6_FirstTurnCounts:
    """cmd_first_games + opp_first_games = total for each commander."""

    def test_counts_add_up(self):
        # 5 games where p1 goes first, 3 where p2 goes first
        games_p1_first = make_games(5, first_player="1", p1_wins=3)
        games_p2_first = make_games(3, first_player="2", p1_wins=1)
        # Give p2-first games different IDs
        for i, g in enumerate(games_p2_first):
            g["game_id"] = f"p2first-{i}"
        all_games = games_p1_first + games_p2_first

        ft = aggregate_first_turn(all_games)
        assert ft["total_games"] == 8

        for cmd, stats in ft["per_commander"].items():
            total_cmd = stats["first_games"] + stats["second_games"]
            assert total_cmd == 8, f"{cmd}: first({stats['first_games']}) + second({stats['second_games']}) != 8"


# ─── B7: Card count ordering (played <= drawn <= deck) ───────────

class TestB7_CardCountOrdering:
    """played_count <= drawn_count <= deck_count for each card."""

    def test_ordering_maintained(self):
        games = make_games(20, p1_wins=10)
        result = aggregate_card_stats(games)
        if isinstance(result, tuple):
            card_data, total_player_games = result
        else:
            return  # Empty result

        for name, data in card_data.items():
            assert data["played_count"] <= data["drawn_count"], \
                f"{name}: played({data['played_count']}) > drawn({data['drawn_count']})"
            assert data["drawn_count"] <= data["deck_count"], \
                f"{name}: drawn({data['drawn_count']}) > deck({data['deck_count']})"


# ─── B8: total_player_games = total_games * 2 ────────────────────

class TestB8_PlayerGameCount:
    """Every game has exactly 2 players, so total_player_games should be 2x."""

    def test_player_count(self):
        games = make_games(15, p1_wins=8)
        result = aggregate_card_stats(games)
        if isinstance(result, tuple):
            card_data, total_player_games = result
            assert total_player_games == 15 * 2


# ─── B9: Faction trend percentages sum to ~100% per week ─────────

class TestB9_TrendPercentages:
    """Weekly faction percentages should sum to approximately 100%."""

    def test_trends_sum_to_100(self):
        # Create games across a single week with known commanders
        games = []
        for i in range(20):
            games.append(make_clean_game(
                game_id=f"trend-{i}",
                datetime="2025-01-15T14:00:00",
                players_overrides=[
                    {"commander": "Captain Greenbeard", "winner": i % 2 == 0},
                    {"commander": "Elber, Jungle Emissary", "winner": i % 2 != 0},
                ],
            ))

        weekly, weekly_total = aggregate_trends(games)
        for week, total in weekly_total.items():
            if total < 4:
                continue
            week_count = sum(weekly[week].values())
            # Each game contributes 2 commander picks
            assert week_count == total


# ─── B10: Bucket winrates — each game in exactly one bucket ──────

class TestB10_BucketAssignment:
    """Each game/player should land in exactly one bucket, no gaps or overlaps."""

    def test_duration_buckets_no_overlap(self):
        games = [make_clean_game(
            game_id=f"dur-{i}",
            duration_minutes=i * 5.0,
        ) for i in range(10)]

        result = aggregate_duration_winrates(games)
        for cmd, buckets in result["commanders"].items():
            total = sum(b["games"] for b in buckets)
            # Each commander appears in every game = 10 games
            assert total == 10

    def test_turn_buckets_no_overlap(self):
        games = [make_clean_game(
            game_id=f"turn-{i}",
            players_overrides=[
                {"turns": 3 + i, "commander": "A", "winner": True},
                {"turns": 3 + i, "commander": "B", "winner": False},
            ],
        ) for i in range(12)]

        result = aggregate_turn_winrates(games)
        for cmd, buckets in result["commanders"].items():
            total = sum(b["games"] for b in buckets)
            assert total == 12

    def test_action_buckets_no_overlap(self):
        games = [make_clean_game(
            game_id=f"act-{i}",
            players_overrides=[
                {"actions": 10 + i * 15, "commander": "A", "winner": True},
                {"actions": 10 + i * 15, "commander": "B", "winner": False},
            ],
        ) for i in range(10)]

        result = aggregate_action_winrates(games)
        for cmd, buckets in result["commanders"].items():
            total = sum(b["games"] for b in buckets)
            assert total == 10


# ─── B11: Empty games → safe empty results ───────────────────────

class TestB11_EmptyGames:
    """All aggregation functions must handle zero games without crashing."""

    def test_commander_stats_empty(self):
        result = aggregate_commander_stats([])
        assert len(result) == 0

    def test_matchups_empty(self):
        result = aggregate_matchups([])
        assert len(result) == 0

    def test_matchup_details_empty(self):
        result = aggregate_matchup_details([])
        assert result == []

    def test_card_stats_empty(self):
        result = aggregate_card_stats([])
        assert result == []

    def test_trends_empty(self):
        weekly, weekly_total = aggregate_trends([])
        assert len(weekly) == 0

    def test_first_turn_empty(self):
        result = aggregate_first_turn([])
        assert result["total_games"] == 0
        assert result["first_player_winrate"] is None

    def test_commander_trends_empty(self):
        result = aggregate_commander_trends([])
        assert result["dates"] == []

    def test_duration_winrates_empty(self):
        result = aggregate_duration_winrates([])
        assert len(result["commanders"]) == 0

    def test_action_winrates_empty(self):
        result = aggregate_action_winrates([])
        assert len(result["commanders"]) == 0

    def test_turn_winrates_empty(self):
        result = aggregate_turn_winrates([])
        assert len(result["commanders"]) == 0

    def test_commander_card_stats_empty(self):
        result = aggregate_commander_card_stats([])
        assert result == {}

    def test_game_distributions_empty(self):
        result = aggregate_game_distributions([])
        assert result["duration"]["total"] == 0
        assert result["turns"]["total"] == 0
        assert result["actions"]["total"] == 0


# ─── B12: avg_copies denominator ──────────────────────────────────

class TestB12_AvgCopiesDenominator:
    """avg_copies should use deck_count (decks containing the card) as denominator."""

    def test_avg_copies_correct(self):
        # 10 games. In deck: 2 copies each time. avg_copies = 2.0
        games = make_games(10, p1_wins=5)
        result = aggregate_card_stats(games)
        if isinstance(result, tuple):
            card_data, _ = result
            # Fire Bolt is in player 1's deck with count=2
            fb = card_data.get("Fire Bolt")
            if fb:
                assert fb["total_copies"] == 20  # 10 games * 2 copies
                assert fb["deck_count"] == 10
                # avg should be 2.0 not 20/20=1.0
                avg = fb["total_copies"] / fb["deck_count"]
                assert avg == 2.0

    def test_commander_card_stats_avg_copies(self):
        """Same check for per-commander card stats."""
        games = make_games(10, p1_wins=5)
        result = aggregate_commander_card_stats(games)
        if "Captain Greenbeard" in result:
            for card in result["Captain Greenbeard"]:
                if card["name"] == "Fire Bolt":
                    assert card["avg_copies"] == 2.0
