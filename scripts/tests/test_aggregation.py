"""Category B: Aggregation Math Tests

Tests for the aggregation functions that turn clean games into stats.
Core question: is the math right? See docs/TEST_DESIGN.md.
"""

import pytest
from helpers import make_clean_game, make_games

from pipeline.aggregation import (
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
    aggregate_archetypes,
    aggregate_goals,
)


# ─── Goals fixtures ──────────────────────────────────────────────

def _art_type(art_type, commissioned):
    """Default the raw ArtType to something consistent with `commissioned`
    (the non-AI flag), so callers only spell it out when the distinction
    between commissioned and purchased art matters."""
    if art_type is not None:
        return art_type
    return "ARTIST_COMMISSIONED" if commissioned else "AI_GENERATED"


def _card(name, *, type="Minion", legendary=False, commissioned=False,
          has_animation=False, patron="Neutral", faction="neutral",
          starter_decks=None, art_type=None):
    return {
        "name": name, "type": type, "legendary": legendary,
        "commissioned": commissioned, "has_animation": has_animation,
        "patron": patron, "faction": faction,
        "starter_decks": starter_decks or [],
        "art_type": _art_type(art_type, commissioned),
    }


def _commander(name, *, commissioned=False, has_animation=False,
               patron="Neutral", faction="neutral", art_type=None):
    return {
        "name": name, "commissioned": commissioned,
        "has_animation": has_animation, "patron": patron, "faction": faction,
        "art_type": _art_type(art_type, commissioned),
    }


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


# ─── B5: First-turn stats exclude undeterminable turn order ──────

class TestB5_FirstTurnFiltering:
    """Games count only when turn order is known: an explicit first_player
    of '1'/'2', or an unambiguous mulligan kept-count (3 vs 4)."""

    def test_99_excluded_without_mulligan(self):
        # No mulligan data, so first_player="99" can't be resolved.
        games = make_games(5, first_player="99") + make_games(5, first_player="1")
        ft = aggregate_first_turn(games)
        assert ft["total_games"] == 5  # Only the "1" games

    def test_empty_first_player_excluded(self):
        games = make_games(5, first_player="")
        ft = aggregate_first_turn(games)
        assert ft["total_games"] == 0


# ─── B5b: First-turn order inferred from mulligan kept counts ────

def _set_mulligan(game, p0_kept, p1_kept):
    """Attach mulligan_kept lists of the given sizes to each player."""
    game["players"][0]["mulligan_kept"] = [{"name": "X", "count": p0_kept}]
    game["players"][1]["mulligan_kept"] = [{"name": "Y", "count": p1_kept}]
    return game


class TestB5b_FirstTurnMulliganInference:
    """When first_player is missing/unknown, turn order is inferred from
    mulligan kept counts: the player who kept 3 went first, 4 went second."""

    def test_inferred_when_first_player_missing(self):
        games = make_games(4, first_player="99", p1_wins=4)
        for g in games:
            _set_mulligan(g, 3, 4)  # p1 (index 0) went first
        ft = aggregate_first_turn(games)
        assert ft["total_games"] == 4
        assert ft["first_player_wins"] == 4  # p1 went first and won all
        assert ft["first_player_winrate"] == 1.0

    def test_inferred_second_player_first(self):
        games = make_games(4, first_player="99", p1_wins=0)
        for g in games:
            _set_mulligan(g, 4, 3)  # p2 (index 1) went first, and p2 wins all
        ft = aggregate_first_turn(games)
        assert ft["total_games"] == 4
        assert ft["first_player_wins"] == 4

    def test_ambiguous_mulligan_excluded(self):
        games = make_games(4, first_player="99")
        for g in games:
            _set_mulligan(g, 3, 3)  # both kept 3 — can't disambiguate
        ft = aggregate_first_turn(games)
        assert ft["total_games"] == 0

    def test_explicit_field_takes_precedence(self):
        # Explicit "1" should win even if mulligan would suggest otherwise.
        games = make_games(2, first_player="1", p1_wins=2)
        for g in games:
            _set_mulligan(g, 4, 3)  # mulligan would say p2 first
        ft = aggregate_first_turn(games)
        assert ft["total_games"] == 2
        assert ft["first_player_wins"] == 2  # p1 (explicit first) won both


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


# ─── B13: Archetype discovery ─────────────────────────────────────

class TestB13_ArchetypeDiscovery:
    """Louvain card packages should separate cards that co-occur together."""

    def test_separates_two_card_packages_for_one_commander(self):
        games = []
        burn_cards = [
            {"name": "Flame Volley", "count": 3},
            {"name": "War Chant", "count": 3},
            {"name": "Ash Raider", "count": 2},
        ]
        ramp_cards = [
            {"name": "Root Bloom", "count": 3},
            {"name": "Ancient Beast", "count": 2},
            {"name": "Wild Growth", "count": 3},
        ]

        for i in range(5):
            games.append(make_clean_game(
                game_id=f"burn-{i}",
                players_overrides=[
                    {
                        "commander": "Captain Greenbeard",
                        "winner": i < 3,
                        "cards_in_deck": burn_cards,
                    },
                    {"commander": "Opponent", "winner": i >= 3},
                ],
            ))
        for i in range(5):
            games.append(make_clean_game(
                game_id=f"ramp-{i}",
                players_overrides=[
                    {
                        "commander": "Captain Greenbeard",
                        "winner": i < 2,
                        "cards_in_deck": ramp_cards,
                    },
                    {"commander": "Opponent", "winner": i >= 2},
                ],
            ))

        result = aggregate_archetypes(
            games,
            min_commander_decks=4,
            min_card_decks=2,
            min_edge_weight=2,
            min_archetype_decks=2,
        )

        commander = result["commanders"]["Captain Greenbeard"]
        assert commander["skipped"] is False
        assert len(commander["packages"]) == 2
        assert len(commander["archetypes"]) == 2

        package_sets = [set(p["cards"]) for p in commander["packages"]]
        assert set(c["name"] for c in burn_cards) in package_sets
        assert set(c["name"] for c in ramp_cards) in package_sets

        archetype = commander["archetypes"][0]
        assert "cards" in archetype
        assert len(archetype["cards"]) == 3
        assert archetype["cards"][0]["inclusion_rate"] == 1.0
        assert archetype["cards"][0]["avg_copies"] > 0
        assert archetype["total_cards_seen"] == 3
        assert archetype["card_display_threshold"] == 0.25

    def test_skips_commanders_with_too_few_decks(self):
        games = make_games(2, commander1="Tiny Sample", commander2="Other")
        result = aggregate_archetypes(games, min_commander_decks=8)

        assert result["commanders"]["Tiny Sample"]["skipped"] is True
        assert result["commanders"]["Tiny Sample"]["reason"] == "insufficient_decks"

    def test_representative_cards_trim_low_prevalence_tail(self):
        games = []
        for i in range(20):
            cards = [
                {"name": "Core A", "count": 3},
                {"name": "Core B", "count": 2},
                {"name": "Core C", "count": 1},
            ]
            if i < 2:
                cards.append({"name": f"Rare Tech {i}", "count": 1})
            games.append(make_clean_game(
                game_id=f"tail-{i}",
                players_overrides=[
                    {
                        "commander": "Captain Greenbeard",
                        "winner": i % 2 == 0,
                        "cards_in_deck": cards,
                    },
                    {"commander": "Opponent", "winner": i % 2 != 0},
                ],
            ))

        result = aggregate_archetypes(
            games,
            min_commander_decks=4,
            min_card_decks=2,
            min_edge_weight=2,
            min_archetype_decks=2,
            representative_card_rate=0.25,
            min_representative_cards=3,
        )
        archetype = result["commanders"]["Captain Greenbeard"]["archetypes"][0]
        displayed_names = {card["name"] for card in archetype["cards"]}

        assert archetype["total_cards_seen"] == 5
        assert displayed_names == {"Core A", "Core B", "Core C"}


# ─── B14: Decklist grouping (multiset + deck codes) ──────────────

# Real card names from site/data/cardlist.json so codec.encode() succeeds.
_REAL_CARDS_A = [
    {"name": "Acid Rain", "count": 3},
    {"name": "Action Surge", "count": 2},
    {"name": "Alchemist", "count": 1},
]
_REAL_CARDS_B = [
    {"name": "Angelic Captain", "count": 2},
    {"name": "Angel's Grace", "count": 2},
    {"name": "Apothecary", "count": 1},
]


def _real_codec():
    from pathlib import Path

    from pipeline.deckcode_py import DeckCodec
    cardlist = Path(__file__).resolve().parent.parent.parent / "site" / "data" / "cardlist.json"
    return DeckCodec.from_cardlist_json(cardlist)


def _archetype_with_decklists(player_specs, codec=None, **agg_kwargs):
    """Build games where each player_spec is (player_name, deck_name, cards) for
    player 1 (Captain Greenbeard). Player 2 is a fixed loser with cards_B so the
    Greenbeard side has a clean archetype to inspect."""
    games = []
    for i, (player, deck_name, cards) in enumerate(player_specs):
        games.append(make_clean_game(
            game_id=f"dl-{i}",
            players_overrides=[
                {
                    "name": player,
                    "commander": "Captain Greenbeard",
                    "winner": True,
                    "deck_name": deck_name,
                    "cards_in_deck": cards,
                },
                {"commander": "Elber, Jungle Emissary", "winner": False,
                 "cards_in_deck": _REAL_CARDS_B},
            ],
        ))
    return aggregate_archetypes(
        games,
        min_commander_decks=min(4, len(player_specs)),
        min_card_decks=2,
        min_edge_weight=2,
        min_archetype_decks=2,
        codec=codec,
        **agg_kwargs,
    )


class TestB14_DecklistGrouping:
    """Decklists are grouped by card multiset and carry deck codes."""

    def test_identical_multisets_collapse_with_representative_name(self):
        # Three games, same cards, three different names — should collapse into
        # one row with count==3 and the most-common name/user.
        specs = [
            ("alice", "Goblin Rush", _REAL_CARDS_A),
            ("alice", "Goblin Rush", _REAL_CARDS_A),  # alice + "Goblin Rush" twice
            ("bob",   "Starter Goblins", _REAL_CARDS_A),
        ]
        codec = _real_codec()
        result = _archetype_with_decklists(specs, codec=codec)
        decklists = result["commanders"]["Captain Greenbeard"]["archetypes"][0]["decklists"]

        assert len(decklists) == 1
        row = decklists[0]
        assert row["count"] == 3
        assert row["deck_name"] == "Goblin Rush"
        assert row["username"] == "alice"
        assert row["deck_code"]

    def test_top_n_threshold(self):
        # 25 unique multisets (vary count of Acid Rain). Top 20 by count desc.
        specs = []
        for i in range(25):
            cards = [
                {"name": "Acid Rain", "count": (i % 3) + 1},
                {"name": "Action Surge", "count": 1},
                {"name": "Alchemist", "count": i + 1},  # makes each unique
            ]
            # Submit the higher-index decks more times so they rank top
            for _ in range(i + 1):
                specs.append((f"p{i}", f"Deck {i}", cards))

        codec = _real_codec()
        result = _archetype_with_decklists(specs, codec=codec, decklists_top_n=20)
        decklists = result["commanders"]["Captain Greenbeard"]["archetypes"][0]["decklists"]

        assert len(decklists) == 20
        counts = [d["count"] for d in decklists]
        assert counts == sorted(counts, reverse=True)
        assert min(counts) == 6  # indices 5..24 contribute 6..25 games

    def test_tie_break_is_alphabetical_on_deck_name(self):
        # Two decks both with count==1, different multisets and different names.
        specs = [
            ("p", "Zeta",  [{"name": "Acid Rain", "count": 1}, {"name": "Action Surge", "count": 1}]),
            ("p", "Alpha", [{"name": "Acid Rain", "count": 2}, {"name": "Action Surge", "count": 1}]),
            ("p", "Mu",    [{"name": "Acid Rain", "count": 3}, {"name": "Action Surge", "count": 1}]),
        ]
        codec = _real_codec()
        result = _archetype_with_decklists(specs, codec=codec)
        decklists = result["commanders"]["Captain Greenbeard"]["archetypes"][0]["decklists"]

        names_in_order = [d["deck_name"] for d in decklists]
        assert names_in_order == ["Alpha", "Mu", "Zeta"]

    def test_unknown_card_drops_row_but_keeps_deck_count(self):
        # 4 known-card decks + 1 deck that's the same real cards plus an
        # unknown card. The bogus deck overlaps enough to land in the same
        # archetype, but its multiset differs (extra card), so it gets its
        # own row — which then must be dropped because encoding fails.
        bogus = _REAL_CARDS_A + [{"name": "Definitely Not A Real Card", "count": 1}]
        specs = [
            ("p1", "Real A", _REAL_CARDS_A),
            ("p2", "Real A", _REAL_CARDS_A),
            ("p3", "Real A", _REAL_CARDS_A),
            ("p4", "Real A", _REAL_CARDS_A),
            ("p5", "Bogus",  bogus),
        ]
        codec = _real_codec()
        result = _archetype_with_decklists(specs, codec=codec)
        archetype = result["commanders"]["Captain Greenbeard"]["archetypes"][0]
        decklists = archetype["decklists"]

        # The bogus row drops; only the real one remains.
        assert len(decklists) == 1
        assert decklists[0]["deck_name"] == "Real A"
        assert decklists[0]["count"] == 4
        # But the archetype's overall deck_count includes the bogus deck.
        assert archetype["deck_count"] == 5

    def test_deck_code_round_trips(self):
        codec = _real_codec()
        specs = [("alice", "Round Trip", _REAL_CARDS_A)] * 3
        result = _archetype_with_decklists(specs, codec=codec)
        row = result["commanders"]["Captain Greenbeard"]["archetypes"][0]["decklists"][0]

        decoded = codec.decode(row["deck_code"])
        assert decoded["commander"] == "Captain Greenbeard"
        assert decoded["deck_name"] == "Round Trip"
        decoded_multiset = {c["name"]: c["count"] for c in decoded["cards"]}
        expected_multiset = {c["name"]: c["count"] for c in _REAL_CARDS_A}
        assert decoded_multiset == expected_multiset

    def test_no_codec_omits_deck_code_but_still_groups(self):
        # Backwards-compatible path: aggregate_archetypes() with no codec still
        # collapses by multiset, but the deck_code field is absent.
        specs = [
            ("alice", "Goblin Rush", _REAL_CARDS_A),
            ("bob",   "Goblin Rush", _REAL_CARDS_A),
        ]
        result = _archetype_with_decklists(specs, codec=None)
        decklists = result["commanders"]["Captain Greenbeard"]["archetypes"][0]["decklists"]
        assert len(decklists) == 1
        assert "deck_code" not in decklists[0]
        assert decklists[0]["count"] == 2


# ─── B-Goals: art/animation goal aggregation ─────────────────────

class TestGoals_Aggregation:
    """aggregate_goals turns card/commander art metadata into the Goals payload."""

    def _goal(self, result, section, gid):
        return next(g for g in result[section] if g["id"] == gid)

    def test_art_count_counts_commissioned_cards(self):
        cards = [
            _card("A", commissioned=True),
            _card("B", commissioned=True),
            _card("C", commissioned=False),
        ]
        result = aggregate_goals(cards, [])
        g = self._goal(result, "art_goals", "art_count")
        assert g["kind"] == "count"
        assert g["current"] == 2
        assert g["target"] == 100
        assert g["met"] is False

    def test_commander_commission_percent_and_met(self):
        commanders = [
            _commander("X", commissioned=True),
            _commander("Y", commissioned=True),
        ]
        result = aggregate_goals([], commanders)
        g = self._goal(result, "art_goals", "art_commanders")
        assert g["numerator"] == 2 and g["denominator"] == 2
        assert g["current"] == 1.0
        assert g["met"] is True  # 100% >= 100% target

    def test_legendary_minion_filter(self):
        cards = [
            _card("Leg1", type="Minion", legendary=True, commissioned=True),
            _card("Leg2", type="Minion", legendary=True, commissioned=False),
            _card("LegSpell", type="Spell", legendary=True, commissioned=True),  # excluded
            _card("Plain", type="Minion", legendary=False, commissioned=True),   # excluded
        ]
        result = aggregate_goals(cards, [])
        g = self._goal(result, "art_goals", "art_legendary")
        # Only the two legendary minions count; 1 of 2 commissioned.
        assert g["denominator"] == 2
        assert g["numerator"] == 1
        assert g["current"] == 0.5
        assert g["met"] is False  # below 0.75

    def test_starter_decks_per_deck_rollup(self):
        # Deck Alpha: 2/2 commissioned (meets 0.75). Deck Beta: 1/3 (fails).
        cards = [
            _card("a1", commissioned=True, starter_decks=["Starter Alpha"]),
            _card("a2", commissioned=True, starter_decks=["Starter Alpha"]),
            _card("b1", commissioned=True, starter_decks=["Starter Beta"]),
            _card("b2", commissioned=False, starter_decks=["Starter Beta"]),
            _card("b3", commissioned=False, starter_decks=["Starter Beta"]),
        ]
        result = aggregate_goals(cards, [])
        g = self._goal(result, "art_goals", "art_starters")
        assert g["kind"] == "decks"
        assert g["target"] == 2          # two distinct decks
        assert g["current"] == 1         # only Alpha meets threshold
        assert g["met"] is False
        by_deck = {d["deck"]: d for d in g["detail"]}
        assert by_deck["Starter Alpha"]["met"] is True
        assert by_deck["Starter Beta"]["met"] is False

    def test_animation_goals_use_has_animation(self):
        cards = [_card("a", has_animation=True), _card("b", has_animation=False)]
        result = aggregate_goals(cards, [])
        g = self._goal(result, "animation_goals", "anim_all")
        assert g["numerator"] == 1 and g["denominator"] == 2
        assert g["current"] == 0.5
        assert g["met"] is True  # 50% >= 20%

    def test_by_patron_keeps_raw_patrons_separate(self):
        cards = [
            _card("a", patron="Skaal", faction="skaal", commissioned=True),
            _card("b", patron="Mechanus", faction="neutral", has_animation=True),
            _card("c", patron="Neutral", faction="neutral"),
        ]
        commanders = [_commander("X", patron="Skaal", faction="skaal")]
        result = aggregate_goals(cards, commanders)
        patrons = {p["patron"]: p for p in result["by_patron"]}
        assert set(patrons) == {"Skaal", "Mechanus", "Neutral"}
        assert patrons["Skaal"]["cards"]["total"] == 1
        assert patrons["Skaal"]["commanders"]["total"] == 1
        assert patrons["Mechanus"]["cards"]["animated"] == 1

    def test_overall_totals_match_inputs(self):
        cards = [
            _card("a", commissioned=True, has_animation=True),
            _card("b", commissioned=False, has_animation=False),
        ]
        result = aggregate_goals(cards, [])
        assert result["overall"]["cards"]["total"] == 2
        assert result["overall"]["cards"]["commissioned"] == 1
        assert result["overall"]["cards"]["animated"] == 1
        # rates within [0,1]
        for stats in (result["overall"]["cards"], result["overall"]["commanders"]):
            assert 0.0 <= stats["commissioned_rate"] <= 1.0
            assert 0.0 <= stats["animated_rate"] <= 1.0


# ─── B-Goals: tokens and the art-source breakdown ────────────────

class TestGoals_TokensAndArtSources:
    """Tokens have no goal of their own — they only reach the overall
    breakdown — and every pool reports where its artwork came from."""

    def _goal(self, result, section, gid):
        return next(g for g in result[section] if g["id"] == gid)

    def test_tokens_do_not_move_any_goal(self):
        cards = [_card("a", commissioned=True), _card("b", commissioned=True)]
        tokens = [_card("t1"), _card("t2"), _card("t3")]  # all AI, no animation
        without = aggregate_goals(cards, [])
        with_tokens = aggregate_goals(cards, [], tokens)
        assert with_tokens["art_goals"] == without["art_goals"]
        assert with_tokens["animation_goals"] == without["animation_goals"]

    def test_tokens_excluded_from_card_totals_and_patron_table(self):
        cards = [_card("a", patron="Skaal", faction="skaal")]
        tokens = [_card("t", patron="Skaal", faction="skaal")]
        result = aggregate_goals(cards, [], tokens)
        assert result["overall"]["cards"]["total"] == 1
        assert result["overall"]["tokens"]["total"] == 1
        patrons = {p["patron"]: p for p in result["by_patron"]}
        assert patrons["Skaal"]["cards"]["total"] == 1

    def test_all_row_sums_every_pool(self):
        cards = [_card("a", commissioned=True, has_animation=True), _card("b")]
        tokens = [_card("t", has_animation=True)]
        commanders = [_commander("X", commissioned=True)]
        result = aggregate_goals(cards, commanders, tokens)
        combined = result["overall"]["all"]
        assert combined["total"] == 4
        assert combined["commissioned"] == 2
        assert combined["animated"] == 2
        assert combined["commissioned_rate"] == 0.5

    def test_tokens_default_to_empty_pool(self):
        """Callers that don't pass tokens still get a well-formed payload."""
        result = aggregate_goals([_card("a")], [])
        assert result["overall"]["tokens"]["total"] == 0
        assert result["overall"]["tokens"]["commissioned_rate"] == 0.0
        assert result["overall"]["all"]["total"] == 1

    def test_art_types_split_commissioned_from_purchased(self):
        cards = [
            _card("a", commissioned=True, art_type="ARTIST_COMMISSIONED"),
            _card("b", commissioned=True, art_type="PURCHASED_ASSET"),
            _card("c", art_type="AI_GENERATED"),
            _card("d", art_type="AI_GENERATED"),
        ]
        buckets = aggregate_goals(cards, [])["overall"]["cards"]["art_types"]
        assert buckets["commissioned"] == {"count": 1, "rate": 0.25}
        assert buckets["purchased"] == {"count": 1, "rate": 0.25}
        assert buckets["ai"] == {"count": 2, "rate": 0.5}
        assert buckets["other"]["count"] == 0

    def test_art_type_buckets_sum_to_total(self):
        cards = [
            _card("a", art_type="ARTIST_COMMISSIONED"),
            _card("b", art_type="PURCHASED_ASSET"),
            _card("c", art_type="AI_GENERATED"),
            _card("d", art_type=""),          # missing ArtType in the CSV
            _card("e", art_type="SOMETHING"),  # value the pipeline doesn't know
        ]
        stats = aggregate_goals(cards, [])["overall"]["cards"]
        assert sum(b["count"] for b in stats["art_types"].values()) == stats["total"]
        assert stats["art_types"]["other"]["count"] == 2

    def test_non_ai_flag_equals_commissioned_plus_purchased(self):
        cards = [
            _card("a", commissioned=True, art_type="ARTIST_COMMISSIONED"),
            _card("b", commissioned=True, art_type="PURCHASED_ASSET"),
            _card("c", art_type="AI_GENERATED"),
        ]
        stats = aggregate_goals(cards, [])["overall"]["cards"]
        buckets = stats["art_types"]
        assert stats["commissioned"] == buckets["commissioned"]["count"] + buckets["purchased"]["count"]

    def test_empty_pool_rates_are_zero(self):
        stats = aggregate_goals([], [])["overall"]["cards"]
        assert stats["total"] == 0
        for bucket in stats["art_types"].values():
            assert bucket == {"count": 0, "rate": 0.0}
