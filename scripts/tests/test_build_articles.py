"""Tests for scripts/build_articles.py.

Covers frontmatter parsing, draft/future-date filtering, slug-collision detection,
shortcode expansion ([[card:]], [[card-img:]], [[deck:]]), strict card-name
validation, image path rewriting, index ordering, standard Markdown features,
and a deck-code round-trip fixture.
"""
from __future__ import annotations

import datetime as dt
import json
import textwrap
from pathlib import Path

import pytest

import build_articles as ba
from pipeline.deckcode_py import DeckCodec, _encode_deck


# ─── Fixtures ──────────────────────────────────────────────


@pytest.fixture
def cardlist_path():
    return Path(__file__).resolve().parent.parent.parent / "site" / "data" / "cardlist.json"


@pytest.fixture
def codec(cardlist_path):
    return DeckCodec.from_cardlist_json(cardlist_path)


@pytest.fixture
def cards_index():
    return ba.CardIndex.load()


@pytest.fixture
def article_factory(tmp_path):
    """Returns a function that writes articles/<slug>.md under tmp_path and
    returns the path. The fixture also seeds an empty images/<slug>/ folder."""
    src_root = tmp_path / "articles"
    src_root.mkdir()
    (src_root / "images").mkdir()

    def _make(filename: str, body: str, **frontmatter) -> Path:
        meta = {
            "title": frontmatter.pop("title", f"Title for {filename}"),
            "author": frontmatter.pop("author", "Tester"),
            "date": frontmatter.pop("date", "2026-01-01"),
            "summary": frontmatter.pop("summary", "A summary."),
        }
        meta.update(frontmatter)
        front = "---\n"
        for k, v in meta.items():
            if isinstance(v, list):
                front += f"{k}: {json.dumps(v)}\n"
            elif isinstance(v, bool):
                front += f"{k}: {'true' if v else 'false'}\n"
            else:
                front += f"{k}: {v}\n"
        front += "---\n"
        path = src_root / f"{filename}.md"
        path.write_text(front + body, encoding="utf-8")
        (src_root / "images" / filename).mkdir(exist_ok=True)
        return path

    _make.src_root = src_root
    return _make


# ─── Frontmatter ───────────────────────────────────────────


def test_frontmatter_parses_basic():
    text = "---\ntitle: Foo\nauthor: Bar\n---\nHello body."
    meta, body = ba.parse_frontmatter(text)
    assert meta == {"title": "Foo", "author": "Bar"}
    assert body == "Hello body."


def test_frontmatter_missing_raises():
    with pytest.raises(ba.BuildError, match="Missing YAML frontmatter"):
        ba.parse_frontmatter("no frontmatter here")


def test_frontmatter_invalid_yaml_raises():
    with pytest.raises(ba.BuildError, match="Invalid YAML"):
        ba.parse_frontmatter("---\ntitle: [unbalanced\n---\nbody")


def test_required_fields_enforced(tmp_path):
    bad = tmp_path / "x.md"
    bad.write_text("---\ntitle: Only a Title\n---\nbody", encoding="utf-8")
    with pytest.raises(ba.BuildError, match="missing required fields"):
        ba.load_article(bad)


# ─── Slug handling ─────────────────────────────────────────


def test_slug_defaults_from_filename(article_factory):
    path = article_factory("my-article", "body")
    a = ba.load_article(path)
    assert a.slug == "my-article"


def test_explicit_slug_wins(article_factory):
    path = article_factory("filename", "body", slug="custom-slug")
    a = ba.load_article(path)
    assert a.slug == "custom-slug"


def test_invalid_slug_raises(article_factory):
    path = article_factory("ok", "body", slug="Has Spaces")
    with pytest.raises(ba.BuildError, match="must be lowercase"):
        ba.load_article(path)


def test_slug_collision_raises(article_factory, monkeypatch):
    article_factory("first", "body", slug="shared")
    article_factory("second", "body", slug="shared")
    monkeypatch.setattr(ba, "ARTICLES_SRC", article_factory.src_root)
    with pytest.raises(ba.BuildError, match="collides"):
        ba.discover_articles(include_drafts=False, today=dt.date(2026, 12, 31))


# ─── Draft / future-date filtering ────────────────────────


def test_draft_skipped_by_default(article_factory, monkeypatch):
    article_factory("pub", "body", date="2026-01-01")
    article_factory("draft", "body", date="2026-01-01", draft=True)
    monkeypatch.setattr(ba, "ARTICLES_SRC", article_factory.src_root)
    out = ba.discover_articles(include_drafts=False, today=dt.date(2026, 12, 31))
    slugs = {a.slug for a in out}
    assert "pub" in slugs
    assert "draft" not in slugs


def test_draft_included_with_flag(article_factory, monkeypatch):
    article_factory("draft", "body", draft=True)
    monkeypatch.setattr(ba, "ARTICLES_SRC", article_factory.src_root)
    out = ba.discover_articles(include_drafts=True, today=dt.date(2026, 12, 31))
    assert any(a.slug == "draft" for a in out)


def test_future_date_skipped(article_factory, monkeypatch):
    article_factory("future", "body", date="2099-01-01")
    monkeypatch.setattr(ba, "ARTICLES_SRC", article_factory.src_root)
    out = ba.discover_articles(include_drafts=False, today=dt.date(2026, 1, 1))
    assert not out


def test_index_sorted_desc_by_date(article_factory, monkeypatch):
    article_factory("older", "body", date="2025-01-01")
    article_factory("newer", "body", date="2026-01-01")
    article_factory("middle", "body", date="2025-06-01")
    monkeypatch.setattr(ba, "ARTICLES_SRC", article_factory.src_root)
    out = ba.discover_articles(include_drafts=False, today=dt.date(2026, 12, 31))
    assert [a.slug for a in out] == ["newer", "middle", "older"]


# ─── Shortcode expansion ──────────────────────────────────


def _render(article_md: str, slug: str, codec, cards, source=Path("dummy.md")) -> ba.Article:
    a = ba.Article(
        source=source,
        slug=slug,
        title="t",
        author="a",
        date=dt.date(2026, 1, 1),
        summary="s",
        hero_image=None,
        tags=[],
        draft=False,
        body_md=article_md,
    )
    ba.render_article_body(a, codec, cards)
    return a


def test_card_link_shortcode(codec, cards_index):
    a = _render("Hello [[card:Acid Rain]] world.", "x", codec, cards_index)
    assert 'class="card-link"' in a.body_html
    assert 'data-card="Acid Rain"' in a.body_html
    assert 'href="/cards.html#acid-rain"' in a.body_html


def test_card_link_case_insensitive_emits_canonical(codec, cards_index):
    a = _render("[[card:acid rain]]", "x", codec, cards_index)
    assert 'data-card="Acid Rain"' in a.body_html
    assert ">Acid Rain<" in a.body_html


def test_unknown_card_raises(codec, cards_index):
    with pytest.raises(ba.BuildError, match="Unknown card"):
        _render("[[card:Bogus Nonexistent Card]]", "x", codec, cards_index)


def test_card_img_shortcode(codec, cards_index):
    a = _render("[[card-img:Acid Rain]]", "x", codec, cards_index)
    assert 'class="card-art-inline"' in a.body_html
    # Cards get the transparent PNG path (sourced from CardScreenshots/);
    # commanders without an RGBA source would fall back to /assets/cards/<slug>.jpg.
    assert 'src="/assets/card-art-png/acid-rain.png"' in a.body_html
    assert 'data-card="Acid Rain"' in a.body_html
    assert 'loading="lazy"' in a.body_html


def test_unknown_card_img_raises(codec, cards_index):
    with pytest.raises(ba.BuildError, match="Unknown card"):
        _render("[[card-img:Not A Real Card 9000]]", "x", codec, cards_index)


def test_card_shortcode_in_code_block_not_expanded(codec, cards_index):
    body = "Inline code: `[[card:Acid Rain]]` should stay literal."
    a = _render(body, "x", codec, cards_index)
    # Literal text remains, no card-link anchor wrapping it.
    assert "[[card:Acid Rain]]" in a.body_html
    assert 'class="card-link"' not in a.body_html


def test_card_shortcode_in_fenced_code_not_expanded(codec, cards_index):
    body = textwrap.dedent("""
        ```
        [[card:Acid Rain]]
        ```
    """).strip()
    a = _render(body, "x", codec, cards_index)
    assert "[[card:Acid Rain]]" in a.body_html
    assert 'class="card-link"' not in a.body_html


def test_deck_block_renders(codec, cards_index):
    # Build a real deck code from cards we know exist.
    deck = {
        "commander": "Captain Greenbeard",
        "deck_name": "Test Deck",
        "cards": [{"name": "Acid Rain", "count": 3}, {"name": "Action Surge", "count": 2}],
    }
    code = _encode_deck(codec, deck)
    a = _render(f"[[deck:{code}]]", "x", codec, cards_index)
    assert 'class="article-deck"' in a.body_html
    assert 'data-commander="Captain Greenbeard"' in a.body_html
    assert 'Test Deck' in a.body_html
    assert 'data-card="Acid Rain"' in a.body_html
    assert 'data-card="Action Surge"' in a.body_html
    # Verify deck-row count badge
    assert "×3" in a.body_html


def test_deck_inline_pill(codec, cards_index):
    deck = {
        "commander": "Captain Greenbeard",
        "deck_name": "Pill",
        "cards": [{"name": "Acid Rain", "count": 1}],
    }
    code = _encode_deck(codec, deck)
    # Inline use (not the entire paragraph) — should render as a pill.
    a = _render(f"See [[deck:{code}]] here.", "x", codec, cards_index)
    assert 'class="article-deck-pill"' in a.body_html


def test_invalid_deck_code_raises(codec, cards_index):
    with pytest.raises(ba.BuildError, match="Failed to decode"):
        _render("[[deck:NOT A REAL CODE]]", "x", codec, cards_index)


# ─── Image rewriting ──────────────────────────────────────


def test_relative_image_rewritten(codec, cards_index):
    a = _render("![alt](screenshot.png)", "my-slug", codec, cards_index)
    assert 'src="/assets/articles/my-slug/screenshot.png"' in a.body_html
    assert "screenshot.png" in a.referenced_images


def test_absolute_url_image_untouched(codec, cards_index):
    a = _render("![](https://example.com/x.png)", "x", codec, cards_index)
    assert 'src="https://example.com/x.png"' in a.body_html
    assert not a.referenced_images


def test_root_relative_image_untouched(codec, cards_index):
    a = _render("![](/assets/cards/acid-rain.jpg)", "x", codec, cards_index)
    assert 'src="/assets/cards/acid-rain.jpg"' in a.body_html


# ─── Standard Markdown features still work ────────────────


def test_standard_markdown(codec, cards_index):
    body = textwrap.dedent("""
        # heading 1 (used here as content, even though h2 is more typical)
        ## heading 2

        - item one
        - item two

        > a blockquote

        **bold** and *italic*.

        [a link](https://example.com)
    """).strip()
    a = _render(body, "x", codec, cards_index)
    assert "<h1>" in a.body_html
    assert "<h2>" in a.body_html
    assert "<ul>" in a.body_html
    assert "<blockquote>" in a.body_html
    assert "<strong>bold</strong>" in a.body_html
    assert "<em>italic</em>" in a.body_html
    assert 'href="https://example.com"' in a.body_html


# ─── Deck codec round-trip ────────────────────────────────


def test_python_codec_roundtrip(codec):
    deck = {
        "commander": "Captain Greenbeard",
        "deck_name": "Roundtrip",
        "cards": [
            {"name": "Acid Rain", "count": 3},
            {"name": "Action Surge", "count": 2},
            {"name": "Alchemist", "count": 1},
        ],
    }
    code = _encode_deck(codec, deck)
    decoded = codec.decode(code)
    assert decoded["commander"] == deck["commander"]
    assert decoded["deck_name"] == deck["deck_name"]
    assert decoded["cards"] == deck["cards"]


def test_codec_rejects_missing_separator(codec):
    from pipeline.deckcode_py import DeckCodecError
    with pytest.raises(DeckCodecError, match="missing ':'"):
        codec.decode("no_colon_here")


# ─── End-to-end build ─────────────────────────────────────


def test_end_to_end_build(tmp_path, monkeypatch, article_factory):
    """Run the full build() against an isolated tmp_path and verify the
    expected files materialize."""
    body = textwrap.dedent("""
        Hello world. [[card:Acid Rain]] is a card.

        ![inline](pic.png)
    """).strip()
    article_factory("end-to-end", body)
    # Provide the image referenced in the body.
    (article_factory.src_root / "images" / "end-to-end" / "pic.png").write_bytes(b"PNG")

    out_articles = tmp_path / "site_out" / "articles"
    out_assets = tmp_path / "site_out" / "assets" / "articles"
    out_data = tmp_path / "site_out" / "data"
    out_articles.parent.mkdir()

    monkeypatch.setattr(ba, "ARTICLES_SRC", article_factory.src_root)
    monkeypatch.setattr(ba, "ARTICLES_IMG_SRC", article_factory.src_root / "images")
    monkeypatch.setattr(ba, "ARTICLES_OUT", out_articles)
    monkeypatch.setattr(ba, "ARTICLE_ASSETS_OUT", out_assets)
    monkeypatch.setattr(ba, "DATA_DIR", out_data)
    monkeypatch.setattr(ba, "ARTICLES_INDEX_JSON", out_data / "articles.json")
    # Templates still come from real site/ — that's fine, they're read-only inputs.

    code = ba.build(include_drafts=False, verbose=False)
    assert code == 0
    assert (out_articles / "end-to-end" / "index.html").exists()
    assert (out_articles / "index.html").exists()
    assert (out_assets / "end-to-end" / "pic.png").exists()
    assert (out_data / "articles.json").exists()
    index_json = json.loads((out_data / "articles.json").read_text(encoding="utf-8"))
    assert len(index_json["articles"]) == 1
    assert index_json["articles"][0]["slug"] == "end-to-end"
