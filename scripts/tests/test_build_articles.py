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
from pipeline.deckcode_py import DeckCodec


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
    # Cards get the 400×560 transparent WebP render the deck builder uses.
    assert 'src="/assets/media/cards/acid-rain.webp"' in a.body_html
    assert 'width="400"' in a.body_html and 'height="560"' in a.body_html
    assert 'data-card="Acid Rain"' in a.body_html
    assert 'loading="lazy"' in a.body_html
    assert 'decoding="async"' in a.body_html


def test_card_img_falls_back_without_a_render(codec, cards_index, tmp_path, monkeypatch):
    """No WebP render → the transparent PNG (cards) as before."""
    monkeypatch.setattr(ba, "CARD_RENDER_DIR", tmp_path)
    a = _render("[[card-img:Acid Rain]]", "x", codec, cards_index)
    assert 'src="/assets/card-art-png/acid-rain.png"' in a.body_html
    assert 'width="400"' not in a.body_html


def test_card_img_renders_mentioned_cards_side_by_side(codec, cards_index):
    """Conscription creates Lucian Soldier (MentionedCards in the card CSV), so
    both images ship in one group."""
    a = _render("[[card-img:Conscription]]", "x", codec, cards_index)
    assert 'class="card-art-group"' in a.body_html
    assert 'data-card="Conscription"' in a.body_html
    assert 'class="card-art-inline card-art-mention"' in a.body_html
    assert 'data-card="Lucian Soldier"' in a.body_html
    # The card itself comes first.
    assert a.body_html.index("Conscription") < a.body_html.index("Lucian Soldier")


def test_card_img_without_mentions_has_no_group_wrapper(codec, cards_index):
    a = _render("[[card-img:Acid Rain]]", "x", codec, cards_index)
    assert "card-art-group" not in a.body_html


def test_commander_img_renders_mentioned_cards(codec, cards_index):
    """Commanders carry MentionedCards too — Elyse of the Order makes Lucian
    Soldiers."""
    a = _render("[[card-img:Elyse of the Order]]", "x", codec, cards_index)
    assert 'class="card-art-group"' in a.body_html
    assert 'data-card="Lucian Soldier"' in a.body_html


def test_token_resolves_as_a_card(cards_index):
    """Tokens live in cards.json now, so [[card:Zombie]] resolves instead of
    failing the build."""
    assert cards_index.resolve_card("Zombie") == "Zombie"


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


def test_text_icon_token(codec, cards_index):
    a = _render("Gains {power_2} and {health}.", "x", codec, cards_index)
    assert 'class="text-icon"' in a.body_html
    assert 'src="/assets/icons/text/power_2.png"' in a.body_html
    assert 'alt="2 power"' in a.body_html
    assert 'src="/assets/icons/text/health.png"' in a.body_html
    assert "{" not in a.body_html


def test_every_game_icon_family_renders(codec, cards_index):
    tokens = ["mana_X", "power_1", "speed_2", "health_3", "durability_4",
              "intellect_5", "intellect", "dominion_6", "dominion"]
    a = _render(" ".join(f"{{{t}}}" for t in tokens), "x", codec, cards_index)
    for t in tokens:
        assert f'src="/assets/icons/text/{t}.png"' in a.body_html


def test_text_icon_run_kept_together(codec, cards_index):
    a = _render("Gains +{power_1}{speed_1}{health_1} and {mana_2}.", "x", codec, cards_index)
    assert a.body_html.count('class="text-icon-run"') == 1
    assert '<span class="text-icon-run">+<img' in a.body_html
    assert a.body_html.count('class="text-icon"') == 4


def test_unknown_text_icon_raises(codec, cards_index):
    with pytest.raises(ba.BuildError, match="power_12"):
        _render("Way too strong: {power_12}", "x", codec, cards_index)


def test_non_icon_braces_left_alone(codec, cards_index):
    a = _render("A {curly} aside and {mana-ish}.", "x", codec, cards_index)
    assert "{curly}" in a.body_html
    assert "text-icon" not in a.body_html


def test_text_icon_in_code_not_expanded(codec, cards_index):
    a = _render("Write `{power_3}` in Markdown.", "x", codec, cards_index)
    assert "{power_3}" in a.body_html
    assert "text-icon" not in a.body_html


def test_video_block_with_caption(codec, cards_index):
    body = "[[video:battle.mp4|Two minions battle]]\n[[card:Acid Rain]] deals {power_2}.\n\nAfter."
    a = _render(body, "detailed-rules", codec, cards_index)
    assert '<figure class="article-video">' in a.body_html
    assert 'src="/assets/articles/detailed-rules/battle.mp4"' in a.body_html
    for attr in ("data-autoplay", "loop", "muted", "playsinline", "controls"):
        assert f" {attr}" in a.body_html
    # Nothing downloads until the clip scrolls into view (article.js).
    assert 'preload="none"' in a.body_html
    assert " autoplay" not in a.body_html
    # detailed-rules ships a battle-poster.webp next to the clip.
    assert 'poster="/assets/articles/detailed-rules/battle-poster.webp"' in a.body_html
    assert "battle-poster.webp" in a.referenced_images
    assert 'aria-label="Two minions battle"' in a.body_html
    # The caption is Markdown: card links and icons render inside it.
    assert '<figcaption><a class="card-link"' in a.body_html
    assert 'class="text-icon"' in a.body_html
    assert "<p>After.</p>" in a.body_html
    assert "battle.mp4" in a.referenced_images


def test_video_without_caption(codec, cards_index):
    a = _render("[[video:battle.mp4|Two minions battle]]", "x", codec, cards_index)
    assert "<figcaption>" not in a.body_html


def test_video_requires_description(codec, cards_index):
    with pytest.raises(ba.BuildError, match="needs a description"):
        _render("[[video:battle.mp4]]", "x", codec, cards_index)


def test_video_must_be_mp4(codec, cards_index):
    with pytest.raises(ba.BuildError, match=".mp4"):
        _render("[[video:battle.gif|Clip]]", "x", codec, cards_index)


def test_webp_sibling_wraps_image_in_picture(codec, cards_index, tmp_path, monkeypatch):
    img_dir = tmp_path / "article"
    img_dir.mkdir()
    (img_dir / "map.jpg").write_bytes(b"")
    (img_dir / "map.webp").write_bytes(b"")
    (img_dir / "plain.png").write_bytes(b"")
    monkeypatch.setattr(ba, "ARTICLES_IMG_SRC", tmp_path)
    a = _render("![A map](map.jpg)\n\n![Plain](plain.png)", "article", codec, cards_index)
    assert ('<picture><source srcset="/assets/articles/article/map.webp" type="image/webp">'
            '<img alt="A map" src="/assets/articles/article/map.jpg"></picture>') in a.body_html
    assert a.body_html.count("<picture>") == 1
    assert a.referenced_images == {"map.jpg", "map.webp", "plain.png"}


def _png(path, size, mode="RGBA"):
    from PIL import Image
    Image.new(mode, size, (200, 120, 40, 255) if mode == "RGBA" else (200, 120, 40)).save(path)


def test_optimize_body_images_writes_renditions_once(codec, cards_index, tmp_path, monkeypatch):
    src = tmp_path / "src"
    out = tmp_path / "out"
    (src / "article").mkdir(parents=True)
    _png(src / "article" / "diagram.png", (2480, 1240))
    _png(src / "article" / "small.png", (600, 300))
    monkeypatch.setattr(ba, "ARTICLES_IMG_SRC", src)
    monkeypatch.setattr(ba, "ARTICLE_ASSETS_OUT", out)
    a = _render("![Big](diagram.png){: .wide }\n\n![Small](small.png)", "article", codec, cards_index)
    ba.optimize_body_images(a)
    html = a.body_html
    webps = sorted(p.name for p in (out / "article").glob("img-*.webp"))
    assert [n.rsplit("-", 1)[1] for n in webps] == ["1600.webp", "800.webp"]
    assert '<picture><source type="image/webp" srcset="/assets/articles/article/img-' in html
    assert 'sizes="(max-width: 1234px) 94vw, 1160px"' in html
    assert 'data-full="/assets/articles/article/diagram.png"' in html
    assert 'width="2480" height="1240"' in html
    # Small images just get their size and lazy loading.
    assert 'width="600" height="300"' in html
    assert html.count("<picture>") == 1
    assert html.count('loading="lazy"') == 2 and html.count('decoding="async"') == 2
    # A second run re-uses the files byte for byte (no re-encode) and is stable.
    stamp = {p: p.stat().st_mtime_ns for p in (out / "article").glob("img-*.webp")}
    b = _render("![Big](diagram.png){: .wide }\n\n![Small](small.png)", "article", codec, cards_index)
    ba.optimize_body_images(b)
    assert b.body_html == html
    assert stamp == {p: p.stat().st_mtime_ns for p in (out / "article").glob("img-*.webp")}


def test_optimize_body_images_drops_stale_renditions(codec, cards_index, tmp_path, monkeypatch):
    src = tmp_path / "src"
    out = tmp_path / "out"
    (src / "article").mkdir(parents=True)
    (out / "article").mkdir(parents=True)
    (out / "article" / "img-0123456789-800.webp").write_bytes(b"old")
    _png(src / "article" / "diagram.png", (1000, 500), mode="RGB")
    monkeypatch.setattr(ba, "ARTICLES_IMG_SRC", src)
    monkeypatch.setattr(ba, "ARTICLE_ASSETS_OUT", out)
    a = _render("![Big](diagram.png)", "article", codec, cards_index)
    ba.optimize_body_images(a)
    names = sorted(p.name for p in (out / "article").glob("img-*.webp"))
    assert "img-0123456789-800.webp" not in names
    # 1000px source: one rendition at 800 plus the full width.
    assert [n.rsplit("-", 1)[1] for n in names] == ["1000.webp", "800.webp"]


def test_deck_block_renders(codec, cards_index):
    # Build a real deck code from cards we know exist.
    deck = {
        "commander": "Captain Greenbeard",
        "deck_name": "Test Deck",
        "cards": [{"name": "Acid Rain", "count": 3}, {"name": "Action Surge", "count": 2}],
    }
    code = codec.encode(deck)
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
    code = codec.encode(deck)
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
    code = codec.encode(deck)
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


def test_list_items_opening_with_an_icon_are_marked(codec, cards_index):
    body = "- {power} **Power**: damage.\n- Gain {mana_2} this turn.\n- Plain item."
    a = _render(body, "x", codec, cards_index)
    assert a.body_html.count('<li class="icon-item">') == 1
    assert '<li class="icon-item"><img alt="power"' in a.body_html


# ─── Page furniture: hero renditions, meta, anchors, reading time ─────


def test_reading_minutes_counts_prose_and_figures():
    words = " ".join(["word"] * 440)            # 2 minutes of prose
    assert ba.reading_minutes(words) == 2
    # Card links count as their names; deck codes and icon tokens don't count.
    assert ba.reading_minutes("[[card:Acid Rain]] {power_3} [[deck:AAAA]]") == 1
    # Figures add time: 10 diagrams ≈ 2 extra minutes.
    figs = "\n\n".join("![d](x.png)" for _ in range(10))
    assert ba.reading_minutes(words + "\n\n" + figs) == 4


def test_heading_anchors_are_unique_and_skip_reserved_ids():
    body = "<h2>Main</h2><p>x</p><h2>The &ldquo;Map&rdquo;</h2><h2>The “Map”</h2><h3>Sub</h3>"
    out, toc = ba.add_heading_anchors(body)
    assert [hid for hid, _ in toc] == ["main-section", "the-map", "the-map-2"]
    assert toc[1][1] == "The “Map”"
    assert '<h2 id="the-map-2">' in out
    assert "<h3>Sub</h3>" in out  # only h2s get anchors


def _build_with_hero(tmp_path, monkeypatch, article_factory, **front):
    from PIL import Image
    article_factory("hero-test", "Hello.\n\n## One\n\nA.\n\n## Two\n\nB.", hero_image="hero.png", **front)
    Image.new("RGB", (2000, 1000), (200, 120, 40)).save(
        article_factory.src_root / "images" / "hero-test" / "hero.png")
    out = tmp_path / "out"
    monkeypatch.setattr(ba, "ARTICLES_SRC", article_factory.src_root)
    monkeypatch.setattr(ba, "ARTICLES_IMG_SRC", article_factory.src_root / "images")
    monkeypatch.setattr(ba, "ARTICLES_OUT", out / "articles")
    monkeypatch.setattr(ba, "ARTICLE_ASSETS_OUT", out / "assets" / "articles")
    monkeypatch.setattr(ba, "DATA_DIR", out / "data")
    monkeypatch.setattr(ba, "ARTICLES_INDEX_JSON", out / "data" / "articles.json")
    assert ba.build() == 0
    return out


def test_hero_renditions_meta_and_contents(tmp_path, monkeypatch, article_factory):
    out = _build_with_hero(tmp_path, monkeypatch, article_factory)
    assets = out / "assets" / "articles" / "hero-test"
    webps = sorted(p.name for p in assets.glob("hero-*-*.webp"))
    assert [n.rsplit("-", 1)[1] for n in webps] == ["1280.webp", "1920.webp", "640.webp"]
    og = next(assets.glob("hero-*-og.jpg"))
    from PIL import Image
    assert Image.open(og).size == ba.OG_IMAGE_SIZE

    page = (out / "articles" / "hero-test" / "index.html").read_text(encoding="utf-8")
    assert '<link rel="canonical" href="https://atlas-conquest.com/articles/hero-test/">' in page
    assert f'content="https://atlas-conquest.com/assets/articles/hero-test/{og.name}"' in page
    assert 'og:image:width" content="1200"' in page
    assert 'srcset="/assets/articles/hero-test/' in page
    assert '<h2 id="one">' in page and 'href="#two"' in page   # contents menu
    assert "min read" in page

    index = (out / "articles" / "index.html").read_text(encoding="utf-8")
    assert 'class="article-card article-card--featured"' in index
    assert 'data-tag=""' in index                                  # "All" filter chip

    # A second build re-encodes nothing.
    stamps = {p.name: p.stat().st_mtime_ns for p in assets.iterdir()}
    assert ba.build() == 0
    assert {p.name: p.stat().st_mtime_ns for p in assets.iterdir()} == stamps


def test_article_without_hero_unfurls_with_the_site_card(codec, cards_index):
    a = _render("Body.", "x", codec, cards_index)
    meta = ba.build_meta_block(a)
    assert f"https://atlas-conquest.com{ba.DEFAULT_SOCIAL_IMAGE}" in meta
    assert (ba.SITE_DIR / ba.DEFAULT_SOCIAL_IMAGE.lstrip("/")).exists()
