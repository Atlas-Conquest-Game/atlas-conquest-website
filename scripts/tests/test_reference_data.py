"""Reference-data tests: token loading and the MentionedCards index.

Covers the CSV → JSON side of the pipeline (tokens.csv, the MentionedCards
column) rather than game aggregation. See docs/TEST_DESIGN.md.
"""

import json

import pytest
from helpers import load_real_json, DATA_DIR

from pipeline.io_helpers import (
    parse_mentioned_cards,
    build_mentions_index,
    mention_slug,
)


def _rec(name, mentions=()):
    return {"name": name, "mentions": list(mentions)}


# ─── MentionedCards parsing ──────────────────────────────────────

class TestParseMentionedCards:
    def test_empty_and_missing(self):
        assert parse_mentioned_cards({}) == []
        assert parse_mentioned_cards({"MentionedCards": ""}) == []
        assert parse_mentioned_cards({"MentionedCards": "   "}) == []
        assert parse_mentioned_cards({"MentionedCards": None}) == []

    def test_single_name(self):
        assert parse_mentioned_cards({"MentionedCards": "Lucian Soldier"}) == ["Lucian Soldier"]

    def test_strips_whitespace(self):
        assert parse_mentioned_cards({"MentionedCards": "  Zombie  "}) == ["Zombie"]

    def test_semicolon_and_comma_separated(self):
        row = {"MentionedCards": "Zombie; Dragon , Illusion"}
        assert parse_mentioned_cards(row) == ["Zombie", "Dragon", "Illusion"]

    def test_dedupes_preserving_order(self):
        row = {"MentionedCards": "Zombie;Dragon;Zombie"}
        assert parse_mentioned_cards(row) == ["Zombie", "Dragon"]

    def test_drops_empty_entries(self):
        assert parse_mentioned_cards({"MentionedCards": "Zombie;;"}) == ["Zombie"]


# ─── Slug + index construction ───────────────────────────────────

class TestMentionSlug:
    @pytest.mark.parametrize("name,expected", [
        ("Lucian Soldier", "lucian-soldier"),
        ("Vergis, Doomed Archaeologist", "vergis-doomed-archaeologist"),
        ("Heaven's Legion", "heavens-legion"),
        ("Jagris, the Huntsman", "jagris-the-huntsman"),
    ])
    def test_matches_frontend_card_art_slug(self, name, expected):
        assert mention_slug(name) == expected

    def test_idempotent_on_a_slug(self):
        assert mention_slug("lucian-soldier") == "lucian-soldier"


class TestBuildMentionsIndex:
    def test_keys_and_targets_are_slugs(self):
        index = build_mentions_index(
            [_rec("Conscription", ["Lucian Soldier"]), _rec("Lucian Soldier")],
        )
        assert index == {
            "conscription": [{"name": "Lucian Soldier", "slug": "lucian-soldier"}],
        }

    def test_cards_without_mentions_are_absent(self):
        index = build_mentions_index([_rec("Plain Card"), _rec("Other")])
        assert index == {}

    def test_unresolvable_mentions_are_dropped(self):
        index = build_mentions_index([_rec("Conscription", ["No Such Card"])])
        assert index == {}

    def test_self_reference_is_dropped(self):
        index = build_mentions_index([_rec("Echo", ["Echo"])])
        assert index == {}

    def test_resolves_across_groups(self):
        """A commander can mention a card, and a card can mention a token."""
        commanders = [_rec("Elyse of the Order", ["Lucian Soldier"])]
        tokens = [_rec("Lucian Soldier")]
        index = build_mentions_index(tokens, commanders)
        assert index["elyse-of-the-order"] == [
            {"name": "Lucian Soldier", "slug": "lucian-soldier"}
        ]

    def test_resolution_is_slug_insensitive_to_punctuation(self):
        index = build_mentions_index(
            [_rec("Vergis, Doomed Archaeologist", ["Artifact of the End"]),
             _rec("Artifact of the End")],
        )
        assert index["vergis-doomed-archaeologist"][0]["name"] == "Artifact of the End"


# ─── Published files ─────────────────────────────────────────────

def _skip_if_missing(*filenames):
    for filename in filenames:
        if not (DATA_DIR / filename).exists():
            pytest.skip(f"{filename} not found — run pipeline first")


class TestPublishedTokens:
    def test_tokens_are_flagged_and_typed(self):
        _skip_if_missing("cards.json")
        cards = load_real_json("cards.json")
        tokens = [c for c in cards if c.get("token")]
        assert tokens, "cards.json has no token records"
        for token in tokens:
            assert token["type"], f"{token['name']}: token published without a type"
            assert token["faction"], f"{token['name']}: token published without a faction"

    def test_every_card_has_the_token_flag(self):
        _skip_if_missing("cards.json")
        for card in load_real_json("cards.json"):
            assert isinstance(card.get("token"), bool), (
                f"{card['name']}: missing boolean `token` flag"
            )

    def test_card_stats_rows_carry_the_token_flag(self):
        """The Cards page hides tokens using this flag alone — it never loads
        cards.json."""
        _skip_if_missing("card_stats.json", "cards.json")
        tokens = {c["name"] for c in load_real_json("cards.json") if c.get("token")}
        rows = load_real_json("card_stats.json")["all"]["all"]
        for row in rows:
            assert isinstance(row.get("token"), bool), f"{row['name']}: missing `token`"
            assert row["token"] == (row["name"] in tokens), (
                f"{row['name']}: token flag disagrees with cards.json"
            )


class TestPublishedMentions:
    def test_every_slug_resolves_to_a_known_card_or_commander(self):
        _skip_if_missing("mentions.json", "cards.json", "commanders.json")
        mentions = json.loads((DATA_DIR / "mentions.json").read_text(encoding="utf-8"))
        known = {mention_slug(c["name"]) for c in load_real_json("cards.json")}
        known |= {mention_slug(c["name"]) for c in load_real_json("commanders.json")}

        for slug, entries in mentions.items():
            assert slug in known, f"mentions.json key {slug} is not a known card"
            for entry in entries:
                assert entry["slug"] in known, (
                    f"{slug} mentions unknown card {entry['slug']}"
                )
                assert mention_slug(entry["name"]) == entry["slug"]

    def test_mentioned_cards_have_art(self):
        """Both preview paths (framed JPG, transparent PNG) must resolve, or the
        side-by-side render shows a broken image."""
        _skip_if_missing("mentions.json")
        mentions = json.loads((DATA_DIR / "mentions.json").read_text(encoding="utf-8"))
        site = DATA_DIR.parent
        missing = []
        for entries in mentions.values():
            for entry in entries:
                if not (site / "assets" / "cards" / f"{entry['slug']}.jpg").exists():
                    missing.append(f"assets/cards/{entry['slug']}.jpg")
                if not (site / "assets" / "card-art-png" / f"{entry['slug']}.png").exists():
                    missing.append(f"assets/card-art-png/{entry['slug']}.png")
        assert not missing, f"Mentioned cards without art: {sorted(set(missing))}"
