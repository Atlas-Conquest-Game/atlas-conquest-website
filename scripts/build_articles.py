"""Build the Articles section: turn articles/*.md into static HTML pages.

Inputs:
  articles/<slug>.md            — article sources (YAML frontmatter + Markdown body)
  articles/images/<slug>/*      — per-article images
  site/articles.html            — index template (sentinel-replaced)
  site/article.html             — per-article template (sentinel-replaced)
  site/data/cardlist.json       — card id ↔ name (used by the Python deck codec)
  site/data/cards.json          — full card metadata (cost, faction, type)
  site/data/commanders.json     — commander metadata (faction, art)
  site/assets/icons/text/icons.json — inline stat icons (scripts/import_text_icons.py)
  site/partials/*.html          — shared nav/footer/head chrome, applied via sync_chrome

Outputs:
  site/articles/index.html              — index page with all published articles
  site/articles/<slug>/index.html       — per-article static page
  site/assets/articles/<slug>/*         — copied article images
  site/data/articles.json               — index metadata for future RSS/pagination

Custom Markdown syntax (all square-bracket "shortcodes" share the [[type:value]]
shape for consistency):
  [[card:Acid Rain]]      — inline card link with hover preview
  [[card-img:Acid Rain]]  — inline card image
  [[deck:<DECKCODE>]]     — embedded deck listing (block form when on its own line)
  [[video:clip.mp4|Description]] — silent looping clip; lines after it in the
                            same paragraph become its caption (block form only)
Plus the game's own inline stat-icon tokens, written exactly as in card text:
  {power_3} {health} {mana_X} — inline icon from the CardTextIcons sprite sheet

CLI:
  python scripts/build_articles.py                # build all non-draft, non-future articles
  python scripts/build_articles.py --include-drafts
  python scripts/build_articles.py --verbose
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import html
import json
import re
import shutil
import sys
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

import urllib.parse

import yaml
import markdown
from markdown.blockprocessors import BlockProcessor
from markdown.extensions import Extension
from markdown.inlinepatterns import InlineProcessor
from markdown.preprocessors import Preprocessor
from markdown.treeprocessors import Treeprocessor

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pipeline.deckcode_py import DeckCodec, DeckCodecError
import sync_chrome  # shared nav/footer/head chrome (site/partials/)


# ─── Paths ─────────────────────────────────────────────────

REPO_ROOT = Path(__file__).resolve().parent.parent
SITE_DIR = REPO_ROOT / "site"
ARTICLES_SRC = REPO_ROOT / "articles"
ARTICLES_IMG_SRC = ARTICLES_SRC / "images"
ARTICLES_OUT = SITE_DIR / "articles"
ARTICLE_ASSETS_OUT = SITE_DIR / "assets" / "articles"
DATA_DIR = SITE_DIR / "data"

INDEX_TEMPLATE = SITE_DIR / "articles.html"
ARTICLE_TEMPLATE = SITE_DIR / "article.html"
CARDLIST_JSON = DATA_DIR / "cardlist.json"
CARDS_JSON = DATA_DIR / "cards.json"
COMMANDERS_JSON = DATA_DIR / "commanders.json"
ARTICLES_INDEX_JSON = DATA_DIR / "articles.json"
TEXT_ICONS_DIR = SITE_DIR / "assets" / "icons" / "text"
TEXT_ICONS_JSON = TEXT_ICONS_DIR / "icons.json"

SITE_ROOT_URL = "https://atlas-conquest.com"

# Hero art. Authors drop in whatever they have (one hero is a 7000px, 15 MB JPEG),
# so the build makes small WebP renditions for the index cards and the article
# header, plus a 1200×630 JPEG crop for link unfurls. Renditions live next to the
# article's images as hero-<hash>-<width>.webp / hero-<hash>-og.jpg; the hash is
# of the source file, so an existing rendition is never re-encoded (keeps CI
# output byte-stable) and a new hero image gets fresh files.
HERO_WIDTHS = (640, 1280, 1920)
OG_IMAGE_SIZE = (1200, 630)
HERO_RENDITION_RE = re.compile(r"^hero-[0-9a-f]{10}-(?:\d+\.webp|og\.jpg)$")
# Body images (diagrams, maps) arrive as 2,480px PNGs of 1–2 MB. Anything wider
# than BODY_RENDITION_MIN gets WebP renditions at BODY_WIDTHS (never wider than
# the source) served through srcset, named img-<hash>-<width>.webp after the
# source bytes so — like the hero — an existing rendition is never re-encoded.
# The original stays as the <img> fallback and the lightbox's full-size view.
BODY_WIDTHS = (800, 1600)
BODY_RENDITION_MIN = 900
BODY_RENDITION_RE = re.compile(r"^img-[0-9a-f]{10}-\d+\.webp$")
# Rendered card art (400×560, transparent WebP) — what the deck builder shows.
CARD_RENDER_DIR = SITE_DIR / "assets" / "media" / "cards"
CARD_RENDER_SIZE = (400, 560)
# Unfurl image for articles without a hero (brand card: key art + wordmark).
DEFAULT_SOCIAL_IMAGE = "/assets/social/atlas-conquest-og.jpg"
# hero_align → focal point inside the cropped header art.
HERO_FOCUS = {"top": "70% 12%", "center": "70% 45%", "bottom": "70% 88%"}
WORDS_PER_MINUTE = 220
# Ids the page chrome already uses; a heading anchor never takes one of these.
RESERVED_IDS = {"main", "ac-nav-menu", "article-toc", "card-preview"}

# Sentinels mirror the GEN:META pattern in scripts/generate_deck_pages.py.
SENTINEL_META_BEGIN = "<!-- GEN:META:BEGIN"
SENTINEL_META_END = "<!-- GEN:META:END -->"
SENTINEL_ARTICLE_BEGIN = "<!-- GEN:ARTICLE:BEGIN"
SENTINEL_ARTICLE_END = "<!-- GEN:ARTICLE:END -->"
SENTINEL_INDEX_BEGIN = "<!-- GEN:ARTICLES:BEGIN"
SENTINEL_INDEX_END = "<!-- GEN:ARTICLES:END -->"

META_RE = re.compile(
    rf"{re.escape(SENTINEL_META_BEGIN)}.*?{re.escape(SENTINEL_META_END)}",
    flags=re.DOTALL,
)
ARTICLE_RE = re.compile(
    rf"{re.escape(SENTINEL_ARTICLE_BEGIN)}.*?{re.escape(SENTINEL_ARTICLE_END)}",
    flags=re.DOTALL,
)
INDEX_RE = re.compile(
    rf"{re.escape(SENTINEL_INDEX_BEGIN)}.*?{re.escape(SENTINEL_INDEX_END)}",
    flags=re.DOTALL,
)


FACTION_COLORS = {
    "skaal": "#D55E00",
    "grenalia": "#009E73",
    "lucia": "#E8B630",
    "neutral": "#A89078",
    "shadis": "#7B7B8E",
    "archaeon": "#0072B2",
}


# ─── Helpers ───────────────────────────────────────────────


def slugify(name: str) -> str:
    """Match site/js/shared.js commanderSlug() and scripts/generate_deck_pages.py."""
    cleaned = re.sub(r"[,']", "", name.lower())
    return re.sub(r"\s+", "-", cleaned.strip())


@dataclass
class BuildError(Exception):
    """Raised when an article fails to build. Carries the offending file."""
    message: str
    source: Path | None = None

    def __str__(self) -> str:
        if self.source:
            try:
                rel = self.source.relative_to(REPO_ROOT)
            except ValueError:
                rel = self.source
            return f"{rel}: {self.message}"
        return self.message


# ─── Frontmatter ───────────────────────────────────────────

_FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)

REQUIRED_FIELDS = {"title", "author", "date", "summary"}


def parse_frontmatter(text: str, source: Path | None = None) -> tuple[dict, str]:
    """Split YAML frontmatter from body. Returns (metadata, body)."""
    m = _FRONTMATTER_RE.match(text)
    if not m:
        raise BuildError("Missing YAML frontmatter (must start with --- ... ---)", source)
    try:
        meta = yaml.safe_load(m.group(1)) or {}
    except yaml.YAMLError as exc:
        raise BuildError(f"Invalid YAML in frontmatter: {exc}", source) from exc
    if not isinstance(meta, dict):
        raise BuildError("Frontmatter must be a YAML mapping", source)
    body = text[m.end():]
    return meta, body


def validate_frontmatter(meta: dict, source: Path) -> None:
    missing = REQUIRED_FIELDS - set(meta)
    if missing:
        raise BuildError(
            f"Frontmatter missing required fields: {sorted(missing)}", source
        )


# ─── Card metadata ─────────────────────────────────────────


@dataclass
class CardIndex:
    """Lookup tables built from cards.json and commanders.json.

    Resolution is forgiving: case-insensitive, plus a slug fallback so
    'Jagris the Huntsman' matches the canonical 'Jagris, the Huntsman'
    (both slugify to 'jagris-the-huntsman'). This matches what authors
    naturally type without forcing them to memorize punctuation.
    """
    by_name: dict[str, dict]                # canonical name → card metadata
    name_by_lower: dict[str, str]           # lowercase name → canonical name
    name_by_slug: dict[str, str]            # slugified name → canonical name
    commanders_by_name: dict[str, dict]
    commander_by_lower: dict[str, str]
    commander_by_slug: dict[str, str]

    @classmethod
    def load(cls) -> "CardIndex":
        cards = json.loads(CARDS_JSON.read_text(encoding="utf-8"))
        commanders = json.loads(COMMANDERS_JSON.read_text(encoding="utf-8"))
        by_name = {c["name"]: c for c in cards}
        commanders_by_name = {c["name"]: c for c in commanders}
        return cls(
            by_name=by_name,
            name_by_lower={n.lower(): n for n in by_name},
            name_by_slug={slugify(n): n for n in by_name},
            commanders_by_name=commanders_by_name,
            commander_by_lower={n.lower(): n for n in commanders_by_name},
            commander_by_slug={slugify(n): n for n in commanders_by_name},
        )

    def resolve_card(self, name: str) -> str | None:
        """Return canonical card name or None. Tries case-insensitive name,
        then slug match. Does NOT fall back to commanders — use resolve_any()
        for that."""
        lower = name.lower()
        if lower in self.name_by_lower:
            return self.name_by_lower[lower]
        slug = slugify(name)
        return self.name_by_slug.get(slug)

    def resolve_commander(self, name: str) -> str | None:
        lower = name.lower()
        if lower in self.commander_by_lower:
            return self.commander_by_lower[lower]
        return self.commander_by_slug.get(slugify(name))

    def card_art_source(self, name: str) -> Path | None:
        """Repo-relative source PNG (RGBA) for a card, per its `art` field in
        cards.json — typically CardScreenshots/<Name>.png. None if missing."""
        meta = self.by_name.get(name)
        if not meta:
            return None
        art = meta.get("art")
        if not art:
            return None
        return REPO_ROOT / art

    def resolve_any(self, name: str) -> tuple[str | None, str | None]:
        """Resolve to (canonical_name, kind) where kind is 'card' or 'commander'.
        Cards take precedence on the rare chance of a name collision."""
        card = self.resolve_card(name)
        if card is not None:
            return card, "card"
        cmd = self.resolve_commander(name)
        if cmd is not None:
            return cmd, "commander"
        return None, None

    def card_faction(self, name: str) -> str:
        return self.by_name[name].get("faction", "neutral")

    def card_cost(self, name: str) -> int | None:
        c = self.by_name[name].get("cost")
        return c if isinstance(c, int) else None

    def card_type(self, name: str) -> str:
        return (self.by_name[name].get("type") or "").upper()

    def mentions_for(self, name: str, kind: str) -> list[str]:
        """Canonical names of the cards `name` creates or references.

        Comes from the MentionedCards column of the reference CSVs. Entries that
        don't resolve are dropped — a stale name in the CSV shouldn't break the
        article build.
        """
        source = self.by_name if kind == "card" else self.commanders_by_name
        raw = (source.get(name) or {}).get("mentions") or []
        resolved = []
        for entry in raw:
            canonical, _ = self.resolve_any(entry)
            if canonical and canonical != name:
                resolved.append(canonical)
        return resolved

    def card_img_src(self, name: str, kind: str) -> str:
        """Image URL for an inline card image.

        Prefers the 400×560 transparent WebP render the deck builder uses
        (site/assets/media/cards/). Otherwise cards with an RGBA source point at
        the transparent PNG produced by the pipeline's generate_thumbnails(), and
        anything else falls back to the framed JPG.
        """
        slug = slugify(name)
        if (CARD_RENDER_DIR / f"{slug}.webp").exists():
            return f"/assets/media/cards/{slug}.webp"
        if kind == "card" and self.card_art_source(name):
            return f"/assets/card-art-png/{slug}.png"
        return f"/assets/cards/{slug}.jpg"


# ─── Custom Markdown extensions ────────────────────────────


# [[card:Name]] — inline card link
class CardLinkInlineProcessor(InlineProcessor):
    PATTERN = r"\[\[card:([^\]]+)\]\]"

    def __init__(self, cards: CardIndex, source: Path):
        super().__init__(self.PATTERN)
        self._cards = cards
        self._source = source

    def handleMatch(self, m, data):
        raw = m.group(1).strip()
        canonical, kind = self._cards.resolve_any(raw)
        if canonical is None:
            raise BuildError(f"Unknown card or commander in [[card:{raw}]]", self._source)
        slug = slugify(canonical)
        # Commanders live on the Commanders page; cards on the Cards page. Both
        # have artwork at /assets/cards/<slug>.jpg so the hover preview works
        # uniformly via the data-card attribute.
        href = f"/commanders.html#{slug}" if kind == "commander" else f"/cards.html#{slug}"
        el = ET.Element("a")
        el.set("class", "card-link")
        el.set("data-card", canonical)
        el.set("href", href)
        el.text = canonical
        return el, m.start(0), m.end(0)


# [[card-img:Name]] — inline card image
class CardImgInlineProcessor(InlineProcessor):
    PATTERN = r"\[\[card-img:([^\]]+)\]\]"

    def __init__(self, cards: CardIndex, source: Path):
        super().__init__(self.PATTERN)
        self._cards = cards
        self._source = source

    def _img(self, name: str, kind: str, mention: bool = False) -> ET.Element:
        el = ET.Element("img")
        el.set("class", "card-art-inline card-art-mention" if mention else "card-art-inline")
        el.set("data-card", name)
        src = self._cards.card_img_src(name, kind)
        el.set("src", src)
        el.set("alt", name)
        if src.startswith("/assets/media/cards/"):
            el.set("width", str(CARD_RENDER_SIZE[0]))
            el.set("height", str(CARD_RENDER_SIZE[1]))
        # loading=lazy keeps multi-card paragraphs from blocking initial paint.
        el.set("loading", "lazy")
        el.set("decoding", "async")
        return el

    def handleMatch(self, m, data):
        raw = m.group(1).strip()
        canonical, kind = self._cards.resolve_any(raw)
        if canonical is None:
            raise BuildError(f"Unknown card or commander in [[card-img:{raw}]]", self._source)

        mentions = self._cards.mentions_for(canonical, kind)
        if not mentions:
            return self._img(canonical, kind), m.start(0), m.end(0)

        # A card that creates other cards renders side-by-side with them, the
        # same way the hover preview does. The wrapper keeps the group together
        # when a paragraph holds several shortcodes.
        group = ET.Element("span")
        group.set("class", "card-art-group")
        group.append(self._img(canonical, kind))
        for mentioned in mentions:
            _, mentioned_kind = self._cards.resolve_any(mentioned)
            group.append(self._img(mentioned, mentioned_kind or "card", mention=True))
        return group, m.start(0), m.end(0)


# {power_3} — inline stat icon, same token syntax as in-game card text
# (Util.ReplaceIconTokens). The family list mirrors the game's IconTokenRegex.
TEXT_ICON_TOKEN = r"\{(?:mana|power|speed|health|durability|intellect|dominion)(?:_(?:\d+|X))?\}"
TEXT_ICON_PARTS_RE = re.compile(r"\{((mana|power|speed|health|durability|intellect|dominion)(?:_(\d+|X))?)\}")


class TextIconInlineProcessor(InlineProcessor):
    # A run of adjacent tokens with an optional sign, like card text's
    # "+{power_1}{speed_1}{health_1}", is matched whole so it can't wrap apart.
    PATTERN = rf"([+\-−]?)((?:{TEXT_ICON_TOKEN})+)"

    def __init__(self, source: Path):
        super().__init__(self.PATTERN)
        self._source = source
        self._icons = json.loads(TEXT_ICONS_JSON.read_text(encoding="utf-8"))

    def _img(self, m: re.Match) -> ET.Element:
        name, family, amount = m.group(1), m.group(2), m.group(3)
        icon = self._icons.get(name)
        if icon is None:
            raise BuildError(f"No inline icon for {{{name}}} (see {TEXT_ICONS_JSON.name})", self._source)
        label = f"{amount} {family}" if amount else family
        el = ET.Element("img")
        el.set("class", "text-icon")
        el.set("src", f"/assets/icons/text/{name}.png")
        el.set("alt", label)
        el.set("title", label.capitalize())
        el.set("width", str(icon["w"]))
        el.set("height", str(icon["h"]))
        # How far the glyph hangs below the baseline, from its TMP bearing.
        el.set("style", f"--drop: {icon['drop']}")
        return el

    def handleMatch(self, m, data):
        sign = m.group(1)
        imgs = [self._img(t) for t in TEXT_ICON_PARTS_RE.finditer(m.group(2))]
        if not sign and len(imgs) == 1:
            return imgs[0], m.start(0), m.end(0)
        run = ET.Element("span")
        run.set("class", "text-icon-run")
        run.text = sign
        run.extend(imgs)
        return run, m.start(0), m.end(0)


# [[deck:CODE]] — splits on the FIRST colon only, since codes contain ":".
DECK_INLINE_PATTERN = r"\[\[deck:([^\]]+)\]\]"
DECK_PARA_RE = re.compile(rf"^\s*{DECK_INLINE_PATTERN}\s*$")


def _normalize_deck_code(raw: str) -> str:
    """Accept any of these forms and return the bare deck code:
      - https://atlas-conquest.com/decks/<slug>/?code=<CODE>   (share URL)
      - <URL-encoded code>                                    (e.g. "wpFK...%3d%3a...")
      - <bare code>                                           (already decoded)
    Mirrors what JS does when reading ?code= from the Decks page query string.
    """
    raw = raw.strip()
    if raw.startswith(("http://", "https://")):
        parsed = urllib.parse.urlparse(raw)
        params = urllib.parse.parse_qs(parsed.query)
        codes = params.get("code")
        if not codes:
            raise BuildError(f"Share URL missing ?code= parameter: {raw}")
        raw = codes[0]
    # parse_qs already URL-decoded; for the other paths, decode any %xx escapes.
    return urllib.parse.unquote(raw)


class DeckPreprocessor(Preprocessor):
    """Catch [[deck:CODE]] lines BEFORE block parsing, render to raw HTML, and
    stash via md.htmlStash so the rest of the pipeline leaves the embed alone.

    Block-level matches (a line whose entire content is the shortcode) become
    a full deck card. Inline occurrences inside other prose are handled by
    DeckInlineProcessor (pill link).
    """

    def __init__(self, md, codec: DeckCodec, cards: CardIndex, source: Path):
        super().__init__(md)
        self._codec = codec
        self._cards = cards
        self._source = source

    def run(self, lines):
        out = []
        for line in lines:
            m = DECK_PARA_RE.match(line)
            if not m:
                out.append(line)
                continue
            code = _normalize_deck_code(m.group(1))
            try:
                deck = self._codec.decode(code)
            except DeckCodecError as exc:
                raise BuildError(f"Failed to decode [[deck:...]]: {exc}", self._source) from exc
            for card in deck["cards"]:
                if self._cards.resolve_card(card["name"]) is None:
                    raise BuildError(
                        f"Deck embed contains unknown card '{card['name']}'", self._source
                    )
            raw = render_deck_embed(deck, code, self._cards)
            placeholder = self.md.htmlStash.store(raw)
            # Surround with blank lines so the block parser treats the
            # placeholder as its own paragraph (it'll end up as <p>placeholder</p>
            # which the htmlStash postprocessor swaps back to raw HTML, and the
            # paragraph wrapper is removed by markdown for stash-only paragraphs).
            out.append("")
            out.append(placeholder)
            out.append("")
        return out


class DeckInlineProcessor(InlineProcessor):
    """Inline [[deck:CODE]] — rare; renders as a compact pill link."""

    def __init__(self, codec: DeckCodec, cards: CardIndex, source: Path):
        super().__init__(DECK_INLINE_PATTERN)
        self._codec = codec
        self._cards = cards
        self._source = source

    def handleMatch(self, m, data):
        code = _normalize_deck_code(m.group(1))
        try:
            deck = self._codec.decode(code)
        except DeckCodecError as exc:
            raise BuildError(f"Failed to decode inline [[deck:...]]: {exc}", self._source) from exc
        commander = deck["commander"]
        cmd_slug = slugify(commander)
        # URL-encode the code for the href so colons/equals survive query parsing.
        href_code = urllib.parse.quote(code, safe="")
        el = ET.Element("a")
        el.set("class", "article-deck-pill")
        el.set("href", f"/decks/{cmd_slug}/?code={href_code}")
        el.text = deck.get("deck_name") or f"{commander} deck"
        return el, m.start(0), m.end(0)


class ArticleImageTreeprocessor(Treeprocessor):
    """Rewrite relative <img src> to /assets/articles/<slug>/<filename>.

    Absolute URLs (http://, https://, /) are left alone. Card images written by
    CardImgInlineProcessor already carry absolute /assets/cards/... paths so
    they pass through untouched.
    """

    def __init__(self, md, article_slug: str, copied_images: set[str]):
        super().__init__(md)
        self._slug = article_slug
        self._copied = copied_images

    def run(self, root):
        parents = {child: parent for parent in root.iter() for child in parent}
        for img in list(root.iter("img")):
            src = img.get("src") or ""
            if not src:
                continue
            if src.startswith(("http://", "https://", "/", "data:")):
                continue
            self._copied.add(src)
            img.set("src", f"/assets/articles/{self._slug}/{src}")
            # A same-named .webp next to a .jpg/.png is served first, with the
            # original as the fallback.
            webp = Path(src).with_suffix(".webp").as_posix()
            if webp != src and (ARTICLES_IMG_SRC / self._slug / webp).exists():
                self._copied.add(webp)
                self._wrap_picture(img, parents[img], f"/assets/articles/{self._slug}/{webp}")
        return None

    @staticmethod
    def _wrap_picture(img: ET.Element, parent: ET.Element, webp_url: str) -> None:
        picture = ET.Element("picture")
        picture.tail, img.tail = img.tail, None
        ET.SubElement(picture, "source", {"srcset": webp_url, "type": "image/webp"})
        parent.insert(list(parent).index(img), picture)
        parent.remove(img)
        picture.append(img)


# [[video:clip.mp4|Description]] — a silent, looping clip that plays while on
# screen (article.js; muted + playsinline let it start without a gesture). The description is the video's accessible label, so it
# should say only what the clip shows; any following lines in the paragraph
# become a Markdown caption, which can explain more (e.g. card text).
class VideoBlockProcessor(BlockProcessor):
    RE = re.compile(r"^\[\[video:([^\]|]+?)\s*(?:\|\s*([^\]]*?)\s*)?\]\][ \t]*(?:\n|$)")

    def __init__(self, parser, article_slug: str, copied_images: set[str], source: Path):
        super().__init__(parser)
        self._slug = article_slug
        self._copied = copied_images
        self._source = source

    def test(self, parent, block):
        return bool(self.RE.match(block))

    def run(self, parent, blocks):
        block = blocks.pop(0)
        m = self.RE.match(block)
        name, label = m.group(1).strip(), (m.group(2) or "").strip()
        if not name.endswith(".mp4") or "/" in name:
            raise BuildError(f"[[video:{name}]] must name an .mp4 in articles/images/{self._slug}/", self._source)
        if not label:
            raise BuildError(f"[[video:{name}]] needs a description: [[video:{name}|What the clip shows]]", self._source)
        self._copied.add(name)

        # Clips don't download until they scroll into view: no autoplay
        # attribute (it would override preload="none"); article.js plays them
        # through an IntersectionObserver and drops the controls, which stay
        # for readers without JS or who ask for reduced motion. A
        # <name>-poster.webp/.jpg next to the clip fills the frame until then.
        attrs = {
            "src": f"/assets/articles/{self._slug}/{name}",
            "data-autoplay": "", "loop": "loop", "muted": "muted",
            "playsinline": "playsinline", "preload": "none", "controls": "controls",
            "aria-label": label,
        }
        stem = name[:-4]
        for ext in ("webp", "jpg"):
            poster = f"{stem}-poster.{ext}"
            if (ARTICLES_IMG_SRC / self._slug / poster).exists():
                self._copied.add(poster)
                attrs["poster"] = f"/assets/articles/{self._slug}/{poster}"
                break
        figure = ET.SubElement(parent, "figure", {"class": "article-video"})
        ET.SubElement(figure, "video", attrs)
        caption = block[m.end():].strip()
        if caption:
            ET.SubElement(figure, "figcaption").text = caption
        return True


class IconListItemTreeprocessor(Treeprocessor):
    """Mark list items that open with a stat icon ("- {power} **Power**: ...").

    articles.css drops their bullet and centers the icon in a fixed-width slot,
    so the text after icons of different widths lines up.
    """

    def run(self, root):
        for li in root.iter("li"):
            if (li.text or "").strip() or not len(li):
                continue
            first = li[0]
            if first.tag == "img" and first.get("class") == "text-icon":
                li.set("class", "icon-item")
        return None


class ArticleExtension(Extension):
    def __init__(self, *, codec: DeckCodec, cards: CardIndex, source: Path, slug: str,
                 copied_images: set[str]):
        super().__init__()
        self._codec = codec
        self._cards = cards
        self._source = source
        self._slug = slug
        self._copied = copied_images

    def extendMarkdown(self, md):
        # Preprocessor runs before block parsing — captures [[deck:CODE]] lines
        # and stashes the rendered deck HTML so subsequent parsing leaves it alone.
        md.preprocessors.register(
            DeckPreprocessor(md, self._codec, self._cards, self._source),
            "ac_deck_pre",
            30,  # before normalize_whitespace (default 30) — any priority that
                 # runs before block parsing works.
        )
        # Inline patterns — higher priority than the default ones so brackets
        # don't get gobbled.
        md.inlinePatterns.register(
            CardLinkInlineProcessor(self._cards, self._source), "ac_card_link", 175
        )
        md.inlinePatterns.register(
            CardImgInlineProcessor(self._cards, self._source), "ac_card_img", 176
        )
        md.inlinePatterns.register(
            DeckInlineProcessor(self._codec, self._cards, self._source), "ac_deck_inline", 174
        )
        md.inlinePatterns.register(
            TextIconInlineProcessor(self._source), "ac_text_icon", 173
        )
        md.parser.blockprocessors.register(
            VideoBlockProcessor(md.parser, self._slug, self._copied, self._source),
            "ac_video",
            100,  # ahead of paragraphs so the whole block is claimed
        )
        # Treeprocessor: rewrite relative <img src> paths to /assets/articles/<slug>/.
        md.treeprocessors.register(
            ArticleImageTreeprocessor(md, self._slug, self._copied),
            "ac_article_images",
            5,
        )
        # Runs after inline patterns (priority 20), once icons are <img>s.
        md.treeprocessors.register(IconListItemTreeprocessor(md), "ac_icon_items", 4)


# ─── Deck embed HTML ───────────────────────────────────────


def render_deck_embed(deck: dict, code: str, cards: CardIndex) -> str:
    """Compact, self-contained HTML for a [[deck:...]] block."""
    commander = deck["commander"]
    cmd_slug = slugify(commander)
    cmd_meta = cards.commanders_by_name.get(commander, {})
    cmd_faction = cmd_meta.get("faction", "neutral")
    cmd_art = cmd_meta.get("art") or f"assets/commanders/{cmd_slug}.jpg"
    deck_name = deck.get("deck_name") or commander

    total = sum(c["count"] for c in deck["cards"])
    unique = len(deck["cards"])

    # Group rows by cost ascending; cards lacking cost data sort last as "?".
    def cost_key(name: str) -> tuple[int, str]:
        c = cards.card_cost(name)
        return (c if c is not None else 99, name)

    rows = sorted(deck["cards"], key=lambda x: cost_key(x["name"]))

    parts = []
    parts.append('<div class="article-deck" data-commander="')
    parts.append(html.escape(commander, quote=True))
    # The commander's faction colour rings the portrait token (articles.css).
    parts.append(f'" style="--deck-faction:{FACTION_COLORS.get(cmd_faction, "#A89078")}">')
    # URL-encode the code so `:` and `=` in base64 survive query parsing on the Decks page.
    open_url = f"/decks/{cmd_slug}/?code={urllib.parse.quote(code, safe='')}"
    parts.append(f'<a class="article-deck-header" href="{open_url}">')
    parts.append(
        f'<img class="article-deck-portrait" src="/{html.escape(cmd_art.lstrip("/"), quote=True)}" alt="" width="56" height="56" loading="lazy" decoding="async">'
    )
    parts.append('<div class="article-deck-meta">')
    parts.append(f'<div class="article-deck-title">{html.escape(deck_name)}</div>')
    # Faction hues stay off small text (Archaeon blue is 3.6:1 on navy): the
    # name reads in the text colour and the faction travels as a coloured dot.
    parts.append(
        f'<div class="article-deck-commander">'
        f'<span class="article-deck-cmdname">{html.escape(commander)}</span> · '
        f'<span class="article-deck-dot" style="--f:{FACTION_COLORS.get(cmd_faction, "#A89078")}">'
        f'{cmd_faction.title()}</span></div>'
    )
    parts.append(
        f'<div class="article-deck-stats">{total} cards · {unique} unique</div>'
    )
    parts.append("</div>")
    parts.append('<span class="article-deck-open">Open in Deck Tools →</span>')
    parts.append("</a>")
    parts.append('<ol class="article-deck-list">')
    for c in rows:
        name = c["name"]
        cost = cards.card_cost(name)
        cost_str = "?" if cost is None else str(cost)
        faction = cards.card_faction(name)
        color = FACTION_COLORS.get(faction, "#A89078")
        parts.append(
            f'<li class="article-deck-row" data-card="{html.escape(name, quote=True)}">'
            f'<span class="article-deck-cost">{cost_str}</span>'
            f'<span class="article-deck-name">{html.escape(name)}</span>'
            f'<span class="article-deck-faction article-deck-dot" style="--f:{color}">'
            f'{faction.upper()}</span>'
            f'<span class="article-deck-count">×{c["count"]}</span>'
            f'</li>'
        )
    parts.append("</ol>")
    parts.append("</div>")
    return "".join(parts)


# ─── Article loading & sorting ─────────────────────────────


HERO_ALIGN_CHOICES = ("top", "center", "bottom")


@dataclass
class Article:
    source: Path
    slug: str
    title: str
    author: str
    date: dt.date
    summary: str
    hero_image: str | None
    tags: list[str]
    draft: bool
    body_md: str
    hero_align: str = "center"  # "top" | "center" | "bottom" — object-position keyword
    referenced_images: set[str] = field(default_factory=set)
    body_html: str = ""
    # Filled by build_hero_renditions(): width → root-absolute URL of a WebP
    # rendition, the source's pixel size, and the 1200×630 unfurl crop.
    hero_renditions: dict[int, str] = field(default_factory=dict)
    hero_size: tuple[int, int] | None = None
    og_image: str | None = None

    @property
    def reading_minutes(self) -> int:
        return reading_minutes(self.body_md)

    @property
    def out_dir(self) -> Path:
        return ARTICLES_OUT / self.slug

    @property
    def asset_dir(self) -> Path:
        return ARTICLE_ASSETS_OUT / self.slug

    @property
    def hero_image_url(self) -> str | None:
        if not self.hero_image:
            return None
        if self.hero_image.startswith(("http://", "https://", "/")):
            return self.hero_image
        return f"/assets/articles/{self.slug}/{self.hero_image}"


def load_article(path: Path) -> Article:
    text = path.read_text(encoding="utf-8")
    meta, body = parse_frontmatter(text, path)
    validate_frontmatter(meta, path)

    slug = meta.get("slug") or slugify(path.stem)
    if not re.fullmatch(r"[a-z0-9-]+", slug):
        raise BuildError(f"slug '{slug}' must be lowercase a-z, digits, dashes", path)

    date_val = meta["date"]
    if isinstance(date_val, dt.datetime):
        date = date_val.date()
    elif isinstance(date_val, dt.date):
        date = date_val
    elif isinstance(date_val, str):
        try:
            date = dt.date.fromisoformat(date_val)
        except ValueError as exc:
            raise BuildError(f"Invalid date '{date_val}': {exc}", path) from exc
    else:
        raise BuildError(f"date must be an ISO date string, got {type(date_val).__name__}", path)

    tags = meta.get("tags") or []
    if isinstance(tags, str):
        tags = [tags]
    tags = [str(t) for t in tags]

    hero_align = str(meta.get("hero_align", "center")).lower()
    if hero_align not in HERO_ALIGN_CHOICES:
        raise BuildError(
            f"hero_align must be one of {HERO_ALIGN_CHOICES}, got {hero_align!r}",
            path,
        )

    return Article(
        source=path,
        slug=slug,
        title=str(meta["title"]),
        author=str(meta["author"]),
        date=date,
        summary=str(meta["summary"]),
        hero_image=meta.get("hero_image"),
        hero_align=hero_align,
        tags=tags,
        draft=bool(meta.get("draft", False)),
        body_md=body,
    )


def discover_articles(include_drafts: bool, today: dt.date | None = None) -> list[Article]:
    if not ARTICLES_SRC.exists():
        return []
    today = today or dt.date.today()
    articles: list[Article] = []
    seen_slugs: dict[str, Path] = {}
    for path in sorted(ARTICLES_SRC.glob("*.md")):
        # Skip meta files (README, leading-underscore notes) — they share the
        # directory but aren't articles.
        if path.name == "README.md" or path.name.startswith("_"):
            continue
        a = load_article(path)
        if a.draft and not include_drafts:
            continue
        if a.date > today and not include_drafts:
            continue
        if a.slug in seen_slugs:
            raise BuildError(
                f"slug '{a.slug}' collides with {seen_slugs[a.slug].name}", path
            )
        seen_slugs[a.slug] = path
        articles.append(a)
    articles.sort(key=lambda x: x.date, reverse=True)
    return articles


# ─── Rendering ─────────────────────────────────────────────


def render_article_body(article: Article, codec: DeckCodec, cards: CardIndex) -> None:
    """Render the Markdown body to HTML and capture image references in place."""
    md = markdown.Markdown(
        extensions=[
            "extra",       # tables, fenced code, attr_list, def_list, abbr, footnotes, etc.
            "sane_lists",
            "smarty",
            ArticleExtension(
                codec=codec,
                cards=cards,
                source=article.source,
                slug=article.slug,
                copied_images=article.referenced_images,
            ),
        ],
        output_format="html5",
    )
    article.body_html = md.convert(article.body_md)


def copy_article_images(article: Article) -> None:
    src_dir = ARTICLES_IMG_SRC / article.slug
    if not article.referenced_images and (article.hero_image is None or article.hero_image.startswith(("http://", "https://", "/"))):
        return
    article.asset_dir.mkdir(parents=True, exist_ok=True)
    to_copy = set(article.referenced_images)
    if article.hero_image and not article.hero_image.startswith(("http://", "https://", "/")):
        to_copy.add(article.hero_image)
    for name in to_copy:
        candidate = src_dir / name
        if not candidate.exists():
            raise BuildError(
                f"Referenced image '{name}' not found at {candidate}",
                article.source,
            )
        shutil.copy2(candidate, article.asset_dir / name)


def _format_date(d: dt.date) -> str:
    """"Oct 5, 2026" — the site-wide date style (formatSiteDate() in shared.js).
    Month names are spelled out here so the output never depends on the locale."""
    return f"{_MONTHS[d.month - 1]} {d.day}, {d.year}"


_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


# ─── Reading time ──────────────────────────────────────────

_SHORTCODE_RE = re.compile(r"\[\[(card|card-img|deck|video):([^\]|]*)(?:\|[^\]]*)?\]\]")
_MD_IMAGE_RE = re.compile(r"!\[[^\]]*\]\([^)]*\)(?:\{[^}]*\})?")


# Seconds a reader spends on things that aren't prose.
SECONDS_PER = {"figure": 12, "video": 12, "deck": 10, "card-img": 4}


def reading_minutes(body_md: str) -> int:
    """Whole minutes to read an article: prose at WORDS_PER_MINUTE plus a few
    seconds per diagram, clip, deck list and card image (SECONDS_PER). Card links
    count as their names; deck codes, icon tokens and code blocks don't count."""
    text = re.sub(r"```.*?```", " ", body_md, flags=re.DOTALL)
    seconds = len(_MD_IMAGE_RE.findall(text)) * SECONDS_PER["figure"]
    seconds += sum(SECONDS_PER.get(m.group(1), 0) for m in _SHORTCODE_RE.finditer(text))
    text = _SHORTCODE_RE.sub(lambda m: m.group(2) if m.group(1) == "card" else " ", text)
    text = _MD_IMAGE_RE.sub(" ", text)
    text = re.sub(r"\{[a-z0-9_]+\}", " ", text)
    words = len(re.findall(r"[A-Za-z0-9][A-Za-z0-9'’-]*", text))
    return max(1, round(words / WORDS_PER_MINUTE + seconds / 60))


# ─── Hero renditions ───────────────────────────────────────


def hero_source_path(article: Article) -> Path | None:
    """The local file behind an article's hero_image, or None for remote URLs."""
    img = article.hero_image
    if not img or img.startswith(("http://", "https://")):
        return None
    if img.startswith("/"):
        return SITE_DIR / img.lstrip("/")
    return ARTICLES_IMG_SRC / article.slug / img


def build_hero_renditions(article: Article) -> None:
    """Write WebP renditions + an unfurl crop of the hero, and record their URLs.

    Never upscales the WebP renditions, never re-encodes a file that already
    exists, and removes renditions left over from a previous hero image.
    Silently does nothing when there is no local hero or Pillow is missing (the
    pages then fall back to the original image)."""
    src = hero_source_path(article)
    if src is None or not src.exists():
        return
    try:
        from PIL import Image
    except ImportError:  # pragma: no cover — Pillow is in requirements.txt
        return

    digest = hashlib.sha1(src.read_bytes()).hexdigest()[:10]
    prefix = f"hero-{digest}-"
    out_dir = article.asset_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.iterdir():
        if HERO_RENDITION_RE.match(old.name) and not old.name.startswith(prefix):
            old.unlink()
    url_base = f"/assets/articles/{article.slug}/"

    try:
        with Image.open(src) as im:
            width, height = im.size
            widths = [w for w in HERO_WIDTHS if w <= width] or [width]
            if width < HERO_WIDTHS[-1] and width > widths[-1] * 1.15:
                widths.append(width)  # e.g. a 1858px hero also gets a full-size rendition
            og_path = out_dir / f"{prefix}og.jpg"
            todo = [w for w in widths if not (out_dir / f"{prefix}{w}.webp").exists()]
            if todo or not og_path.exists():
                # JPEG can decode at a reduced scale — a big speed-up on huge heroes.
                need_w = max(max(widths), OG_IMAGE_SIZE[0])
                im.draft("RGB", (need_w, max(OG_IMAGE_SIZE[1], round(height * need_w / width))))
                rgb = _flatten(im, Image)
                for w in todo:
                    h = max(1, round(height * w / width))
                    rgb.resize((w, h), Image.LANCZOS).save(
                        out_dir / f"{prefix}{w}.webp", "WEBP", quality=80, method=6)
                if not og_path.exists():
                    _og_crop(rgb, article.hero_align, Image).save(
                        og_path, "JPEG", quality=84, optimize=True, progressive=True)
    except OSError as exc:
        raise BuildError(f"Couldn't render hero image {src.name}: {exc}", article.source) from exc

    article.hero_renditions = {w: f"{url_base}{prefix}{w}.webp" for w in widths}
    article.hero_size = (width, height)
    article.og_image = f"{url_base}{prefix}og.jpg"


def _flatten(im, Image):
    """RGB copy of ``im``; transparency is laid over the site's navy."""
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        rgba = im.convert("RGBA")
        bg = Image.new("RGB", rgba.size, (11, 15, 23))
        bg.paste(rgba, mask=rgba.getchannel("A"))
        return bg
    return im.convert("RGB")


def _og_crop(rgb, align: str, Image):
    """Crop to the unfurl aspect ratio (vertical band chosen by hero_align) and resize."""
    tw, th = OG_IMAGE_SIZE
    w, h = rgb.size
    if w / h > tw / th:
        cw = round(h * tw / th)
        box = ((w - cw) // 2, 0, (w - cw) // 2 + cw, h)
    else:
        ch = round(w * th / tw)
        top = {"top": 0, "bottom": h - ch}.get(align, (h - ch) // 2)
        box = (0, top, w, top + ch)
    return rgb.crop(box).resize(OG_IMAGE_SIZE, Image.LANCZOS)


# ─── Body images ───────────────────────────────────────────

_BODY_PICTURE_RE = re.compile(
    r'<picture><source srcset="(?P<sib>[^"]*)" type="image/webp">(?P<img1><img [^>]*>)</picture>'
    r'|(?P<img2><img [^>]*>)'
)
_ATTR_RE = re.compile(r'([\w:-]+)="([^"]*)"')
BODY_SIZES = {
    "wide": "(max-width: 1234px) 94vw, 1160px",
    "pair": "(max-width: 760px) 94vw, 580px",
    "": "(max-width: 760px) 92vw, 660px",
}


def _img_tag(attrs: dict[str, str]) -> str:
    return "<img " + " ".join(f'{k}="{html.escape(v, quote=True)}"' for k, v in attrs.items()) + ">"


def _body_renditions(src: Path, out_dir: Path, url_base: str, keep: set[str]):
    """(width, height, [(url, w), …]) for one body image; renditions are written
    once and never re-encoded. Returns None when Pillow can't read the file."""
    try:
        from PIL import Image
    except ImportError:  # pragma: no cover — Pillow is in requirements.txt
        return None
    try:
        with Image.open(src) as im:
            width, height = im.size
            if width <= BODY_RENDITION_MIN or src.suffix.lower() not in (".png", ".jpg", ".jpeg"):
                return width, height, []
            digest = hashlib.sha1(src.read_bytes()).hexdigest()[:10]
            widths = [w for w in BODY_WIDTHS if w < width]
            if width < BODY_WIDTHS[-1] * 1.15:
                widths = [w for w in widths if w < width / 1.15] + [width]
            out = []
            for w in widths:
                name = f"img-{digest}-{w}.webp"
                keep.add(name)
                target = out_dir / name
                if not target.exists():
                    out_dir.mkdir(parents=True, exist_ok=True)
                    frame = im if im.mode in ("RGB", "RGBA") else im.convert("RGBA")
                    h = max(1, round(height * w / width))
                    frame.resize((w, h), Image.LANCZOS).save(target, "WEBP", quality=86, method=6)
                out.append((f"{url_base}{name}", w))
            return width, height, out
    except OSError:
        return None


def optimize_body_images(article: Article) -> None:
    """Give every body <img> lazy loading, async decoding and intrinsic size, and
    serve the article's own large images through WebP renditions (srcset)."""
    url_base = f"/assets/articles/{article.slug}/"
    src_dir = ARTICLES_IMG_SRC / article.slug
    out_dir = article.asset_dir
    keep: set[str] = set()

    def _sub(m: re.Match[str]) -> str:
        tag = m.group("img1") or m.group("img2")
        sibling = m.group("sib")
        attrs = dict(_ATTR_RE.findall(tag[5:-1]))
        attrs = {k: html.unescape(v) for k, v in attrs.items()}
        attrs.setdefault("loading", "lazy")
        attrs.setdefault("decoding", "async")
        src = attrs.get("src", "")
        renditions = []
        if src.startswith(url_base) and "width" not in attrs:
            info = _body_renditions(src_dir / src[len(url_base):], out_dir, url_base, keep)
            if info:
                w, h, renditions = info
                attrs["width"], attrs["height"] = str(w), str(h)
        if renditions:
            attrs["data-full"] = src
            classes = attrs.get("class", "").split()
            sizes = BODY_SIZES["wide" if "wide" in classes else "pair" if "pair" in classes else ""]
            srcset = ", ".join(f"{u} {w}w" for u, w in renditions)
            return (f'<picture><source type="image/webp" srcset="{html.escape(srcset, quote=True)}" '
                    f'sizes="{sizes}">{_img_tag(attrs)}</picture>')
        if sibling is not None:
            return f'<picture><source srcset="{sibling}" type="image/webp">{_img_tag(attrs)}</picture>'
        return _img_tag(attrs)

    article.body_html = _BODY_PICTURE_RE.sub(_sub, article.body_html)
    if out_dir.exists():
        for old in out_dir.iterdir():
            if BODY_RENDITION_RE.match(old.name) and old.name not in keep:
                old.unlink()


def _hero_img(article: Article, cls: str, sizes: str, *, eager: bool) -> str:
    """<img> for the hero: responsive renditions when built, else the original."""
    loading = 'fetchpriority="high"' if eager else 'loading="lazy"'
    if article.hero_renditions:
        widths = sorted(article.hero_renditions)
        srcset = ", ".join(f"{article.hero_renditions[w]} {w}w" for w in widths)
        default = article.hero_renditions[widths[0] if not eager else widths[min(1, len(widths) - 1)]]
        w0, h0 = article.hero_size or (16, 9)
        dims = f'width="{widths[0]}" height="{max(1, round(h0 * widths[0] / w0))}" '
        return (
            f'<img class="{cls}" src="{html.escape(default, quote=True)}" '
            f'srcset="{html.escape(srcset, quote=True)}" sizes="{sizes}" {dims}'
            f'alt="" {loading} decoding="async">'
        )
    if article.hero_image_url:
        return (
            f'<img class="{cls}" src="{html.escape(article.hero_image_url, quote=True)}" '
            f'alt="" {loading} decoding="async">'
        )
    return ""


# ─── Headings → anchors + contents ─────────────────────────

_H2_RE = re.compile(r"<h2>(.*?)</h2>", re.DOTALL)


def add_heading_anchors(body_html: str) -> tuple[str, list[tuple[str, str]]]:
    """Give every <h2> a stable id and return (html, [(id, text), …]) for the
    contents menu. Done on the page copy, not article.body_html."""
    seen: dict[str, int] = {}
    toc: list[tuple[str, str]] = []

    def _sub(m: re.Match[str]) -> str:
        inner = m.group(1)
        text = html.unescape(re.sub(r"<[^>]+>", "", inner)).strip()
        base = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "section"
        if base in RESERVED_IDS:
            base += "-section"
        n = seen.get(base, 0)
        seen[base] = n + 1
        hid = base if n == 0 else f"{base}-{n + 1}"
        toc.append((hid, text))
        return f'<h2 id="{hid}">{inner}</h2>'

    return _H2_RE.sub(_sub, body_html), toc


# ─── Page blocks ───────────────────────────────────────────


def _byline(article: Article) -> str:
    """Author ◆ date ◆ reading time. Each later item carries its own separator so
    a wrapped byline never ends on a dangling diamond."""
    sep = '<span class="article-meta-sep" aria-hidden="true">◆</span>'
    return (
        f'<span class="article-author">By {html.escape(article.author)}</span>'
        f'<span class="article-meta-item">{sep}'
        f'<time datetime="{article.date.isoformat()}">{_format_date(article.date)}</time></span>'
        f'<span class="article-meta-item article-readtime">{sep}{article.reading_minutes} min read</span>'
    )


def render_article_card(article: Article, *, featured: bool = False, eager: bool = False,
                        heading: str = "h2") -> str:
    """One card for the index grid or the "keep reading" row."""
    sizes = ("(max-width: 700px) calc(100vw - 2rem), (max-width: 1100px) 56vw, 680px"
             if featured else
             "(max-width: 700px) calc(100vw - 2rem), (max-width: 1100px) 46vw, 380px")
    hero = _hero_img(article, "article-card-hero", sizes, eager=eager)
    if not hero:
        hero = '<div class="article-card-hero article-card-hero-placeholder"></div>'
    tags_html = "".join(f'<span class="article-tag">{html.escape(t)}</span>' for t in article.tags)
    data_tags = html.escape(",".join(t.lower() for t in article.tags), quote=True)
    cls = "article-card article-card--featured" if featured else "article-card"
    return (
        f'<a class="{cls}" href="/articles/{article.slug}/" data-tags="{data_tags}">\n'
        f'  <div class="article-card-media">{hero}</div>\n'
        f'  <div class="article-card-body">\n'
        f'    <div class="article-card-tags">{tags_html}</div>\n'
        f'    <{heading} class="article-card-title">{html.escape(article.title)}</{heading}>\n'
        f'    <p class="article-card-summary">{html.escape(article.summary)}</p>\n'
        f'    <div class="article-card-byline">{_byline(article)}</div>\n'
        f'    <span class="article-card-cta" aria-hidden="true">Read article'
        f'<svg class="ac-icon" aria-hidden="true"><use href="#ac-i-arrow"/></svg></span>\n'
        f'  </div>\n'
        f'</a>'
    )


def build_meta_block(article: Article) -> str:
    page_url = f"{SITE_ROOT_URL}/articles/{article.slug}/"
    og_size: tuple[int, int] | None = None
    if article.og_image:
        og_image_abs, og_size = f"{SITE_ROOT_URL}{article.og_image}", OG_IMAGE_SIZE
    elif article.hero_image_url and article.hero_image_url.startswith("/"):
        og_image_abs = f"{SITE_ROOT_URL}{article.hero_image_url}"
    elif article.hero_image_url:
        og_image_abs = article.hero_image_url
    else:
        og_image_abs, og_size = f"{SITE_ROOT_URL}{DEFAULT_SOCIAL_IMAGE}", OG_IMAGE_SIZE

    t = html.escape(article.title, quote=True)
    d = html.escape(article.summary, quote=True)
    u = html.escape(page_url, quote=True)
    og = html.escape(og_image_abs, quote=True)
    alt = html.escape(f"Header art for “{article.title}”", quote=True)
    author = html.escape(article.author, quote=True)
    iso = article.date.isoformat()
    size_tags = (
        f'  <meta property="og:image:width" content="{og_size[0]}">\n'
        f'  <meta property="og:image:height" content="{og_size[1]}">\n'
        if og_size else ""
    )
    tag_tags = "".join(
        f'  <meta property="article:tag" content="{html.escape(tag, quote=True)}">\n'
        for tag in article.tags
    )

    return (
        f'{SENTINEL_META_BEGIN} — generated by scripts/build_articles.py; do not edit. -->\n'
        f'  <title>{t} — Atlas Conquest</title>\n'
        f'  <meta name="description" content="{d}">\n'
        f'  <link rel="canonical" href="{u}">\n'
        f'  <meta property="og:type" content="article">\n'
        f'  <meta property="og:site_name" content="Atlas Conquest">\n'
        f'  <meta property="og:title" content="{t}">\n'
        f'  <meta property="og:description" content="{d}">\n'
        f'  <meta property="og:image" content="{og}">\n'
        f'{size_tags}'
        f'  <meta property="og:image:alt" content="{alt}">\n'
        f'  <meta property="og:url" content="{u}">\n'
        f'  <meta property="article:published_time" content="{iso}">\n'
        f'  <meta property="article:author" content="{author}">\n'
        f'{tag_tags}'
        f'  <meta name="twitter:card" content="summary_large_image">\n'
        f'  <meta name="twitter:site" content="@Atlas_Conquest">\n'
        f'  <meta name="twitter:title" content="{t}">\n'
        f'  <meta name="twitter:description" content="{d}">\n'
        f'  <meta name="twitter:image" content="{og}">\n'
        f'  <meta name="twitter:image:alt" content="{alt}">\n'
        f'  <link rel="icon" type="image/png" href="/assets/logo/atlas-conquest-icon.png">\n'
        f'  {SENTINEL_META_END}'
    )


def build_article_body_block(article: Article, more: Iterable[Article] = ()) -> str:
    tags_html = "".join(
        f'<a class="article-tag" href="/articles/?tag={urllib.parse.quote(t.lower())}">'
        f'{html.escape(t)}</a>'
        for t in article.tags
    )
    # hero_align (validated in load_article) picks the visible band of the art.
    focus = HERO_FOCUS.get(article.hero_align, HERO_FOCUS["center"])
    hero_html = _hero_img(article, "article-hero ac-page-hero__art", "100vw", eager=True)
    body_html, toc = add_heading_anchors(article.body_html)

    toc_html = ""
    if len(toc) >= 2:
        items = "".join(
            f'<li><a href="#{hid}">{html.escape(text)}</a></li>' for hid, text in toc
        )
        toc_html = (
            f'      <details class="article-toc" data-article-toc>\n'
            f'        <summary class="article-toc-toggle">Contents'
            f'<span class="article-toc-count">{len(toc)}</span></summary>\n'
            f'        <nav class="article-toc-panel" id="article-toc" aria-label="Contents">'
            f'<ol>{items}</ol></nav>\n'
            f'      </details>\n'
        )

    more = list(more)
    more_html = ""
    if more:
        cards = "\n".join(render_article_card(a, heading="h3") for a in more)
        more_html = (
            f'<section class="article-more" aria-labelledby="article-more-title">\n'
            f'  <div class="container">\n'
            f'    <div class="article-more-head">\n'
            f'      <div>\n'
            f'        <p class="ac-eyebrow">Keep reading</p>\n'
            f'        <h2 class="ac-title ac-title--sm" id="article-more-title">More from the Atlas</h2>\n'
            f'      </div>\n'
            f'      <a class="ac-btn ac-btn--ghost ac-btn--sm" href="/articles/">All articles'
            f'<svg class="ac-icon" aria-hidden="true"><use href="#ac-i-arrow"/></svg></a>\n'
            f'    </div>\n'
            f'    <div class="article-card-grid article-card-grid--more">\n{cards}\n    </div>\n'
            f'  </div>\n'
            f'</section>\n'
        )

    return (
        f'{SENTINEL_ARTICLE_BEGIN} — generated by scripts/build_articles.py; do not edit. -->\n'
        f'<header class="article-header ac-page-hero" style="--ac-hero-pos: {focus}">\n'
        f'  {hero_html}\n'
        f'  <div class="ac-page-hero__inner article-header-inner">\n'
        f'    <p class="ac-eyebrow article-eyebrow"><a href="/articles/">Articles</a></p>\n'
        f'    <h1 class="article-title ac-title">{html.escape(article.title)}</h1>\n'
        f'    <span class="ac-ornament ac-ornament--start" aria-hidden="true"></span>\n'
        f'    <p class="article-summary ac-page-hero__lede">{html.escape(article.summary)}</p>\n'
        f'    <div class="article-byline ac-page-hero__meta">{_byline(article)}</div>\n'
        f'    <div class="article-tags">{tags_html}</div>\n'
        f'  </div>\n'
        f'</header>\n'
        f'<div class="article-readbar" data-readbar>\n'
        f'  <div class="container article-readbar-inner">\n'
        f'    <span class="article-readbar-ring" aria-hidden="true"></span>\n'
        f'    <span class="article-readbar-time">{article.reading_minutes} min read</span>\n'
        f'    <span class="article-readbar-section" data-readbar-section aria-hidden="true"></span>\n'
        f'{toc_html}'
        f'  </div>\n'
        f'</div>\n'
        f'<div class="container article-prose" data-article-body>\n'
        f'{body_html}\n'
        f'</div>\n'
        f'{more_html}'
        f'{SENTINEL_ARTICLE_END}'
    )


def render_article_page(article: Article, template: str, more: Iterable[Article] = ()) -> str:
    if not META_RE.search(template) or not ARTICLE_RE.search(template):
        raise BuildError(
            "site/article.html is missing GEN:META or GEN:ARTICLE sentinels",
            ARTICLE_TEMPLATE,
        )
    out = META_RE.sub(lambda _m: build_meta_block(article), template, count=1)
    out = ARTICLE_RE.sub(lambda _m: build_article_body_block(article, more), out, count=1)
    return out


def render_index_block(articles: list[Article]) -> str:
    if not articles:
        body = '<p class="articles-empty">No articles published yet — check back soon.</p>'
    else:
        # Tag filter (article.js wires it up; hidden without JS). Counts are real.
        counts: dict[str, tuple[str, int]] = {}
        for a in articles:
            for t in a.tags:
                label, n = counts.get(t.lower(), (t, 0))
                counts[t.lower()] = (label, n + 1)
        chips = [
            f'<button type="button" class="article-filter-chip" data-tag="" aria-pressed="true">'
            f'All<span class="article-filter-count">{len(articles)}</span></button>'
        ]
        for key, (label, n) in sorted(counts.items(), key=lambda kv: (-kv[1][1], kv[0])):
            chips.append(
                f'<button type="button" class="article-filter-chip" data-tag="{html.escape(key, quote=True)}" '
                f'aria-pressed="false">{html.escape(label)}'
                f'<span class="article-filter-count">{n}</span></button>'
            )
        filter_html = (
            '<div class="article-filter" role="group" aria-label="Filter articles by tag" data-article-filter>\n'
            '  <span class="article-filter-label" aria-hidden="true">Filter</span>\n  '
            + "\n  ".join(chips)
            + '\n</div>\n<p class="ac-sr" role="status" data-article-filter-status></p>'
        )
        cards_html = [
            render_article_card(a, featured=(i == 0), eager=(i == 0))
            for i, a in enumerate(articles)
        ]
        body = (
            filter_html
            + '\n<div class="article-card-grid" data-article-grid>\n'
            + "\n".join(cards_html)
            + "\n</div>"
        )
    return f"{SENTINEL_INDEX_BEGIN} — generated by scripts/build_articles.py; do not edit. -->\n{body}\n{SENTINEL_INDEX_END}"


def render_index_page(articles: list[Article], template: str) -> str:
    if not INDEX_RE.search(template):
        raise BuildError(
            "site/articles.html is missing GEN:ARTICLES sentinels",
            INDEX_TEMPLATE,
        )
    return INDEX_RE.sub(lambda _m: render_index_block(articles), template, count=1)


# ─── Index JSON ────────────────────────────────────────────


def write_index_json(articles: list[Article]) -> None:
    payload = {
        "articles": [
            {
                "slug": a.slug,
                "title": a.title,
                "author": a.author,
                "date": a.date.isoformat(),
                "summary": a.summary,
                "hero_image": a.hero_image_url,
                "tags": a.tags,
                "url": f"/articles/{a.slug}/",
            }
            for a in articles
        ]
    }
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    ARTICLES_INDEX_JSON.write_text(json.dumps(payload, indent=2), encoding="utf-8")


# ─── Top-level driver ──────────────────────────────────────


def build(*, include_drafts: bool = False, verbose: bool = False) -> int:
    if not ARTICLE_TEMPLATE.exists():
        print(f"ERROR: article template missing at {ARTICLE_TEMPLATE}", file=sys.stderr)
        return 1
    if not INDEX_TEMPLATE.exists():
        print(f"ERROR: index template missing at {INDEX_TEMPLATE}", file=sys.stderr)
        return 1

    try:
        articles = discover_articles(include_drafts=include_drafts)
    except BuildError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    if not articles:
        if verbose:
            print("No articles to build.")

    codec = DeckCodec.from_cardlist_json(CARDLIST_JSON)
    cards = CardIndex.load()

    article_template = ARTICLE_TEMPLATE.read_text(encoding="utf-8")
    index_template = INDEX_TEMPLATE.read_text(encoding="utf-8")

    # Pass 1: bodies, images and hero renditions for every article — each page's
    # "keep reading" row shows the other articles' cards, so they must exist first.
    for a in articles:
        try:
            render_article_body(a, codec, cards)
            copy_article_images(a)
            optimize_body_images(a)
            build_hero_renditions(a)
        except BuildError as exc:
            print(f"ERROR: {exc}", file=sys.stderr)
            return 1

    # Pass 2: pages.
    for a in articles:
        more = [other for other in articles if other is not a][:3]
        try:
            page_html = render_article_page(a, article_template, more)
        except BuildError as exc:
            print(f"ERROR: {exc}", file=sys.stderr)
            return 1
        # Re-render the AC:* chrome regions for this page's location so the output
        # always matches site/partials/, whether or not the template was re-synced.
        page_html = sync_chrome.apply_chrome(page_html, f"articles/{a.slug}/index.html")
        a.out_dir.mkdir(parents=True, exist_ok=True)
        (a.out_dir / "index.html").write_text(page_html, encoding="utf-8")
        if verbose:
            print(f"  built articles/{a.slug}/")
    # Note: the transparent /assets/card-art-png/ files are generated in bulk
    # by scripts/pipeline/io_helpers.py:generate_thumbnails() (daily pipeline
    # + on demand). Article builds just emit the URLs and trust they exist.

    try:
        index_html = render_index_page(articles, index_template)
    except BuildError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    index_html = sync_chrome.apply_chrome(index_html, "articles/index.html")
    ARTICLES_OUT.mkdir(parents=True, exist_ok=True)
    (ARTICLES_OUT / "index.html").write_text(index_html, encoding="utf-8")
    write_index_json(articles)

    try:
        rel = ARTICLES_OUT.relative_to(REPO_ROOT)
    except ValueError:
        rel = ARTICLES_OUT
    print(f"Built {len(articles)} article(s) -> {rel}/")
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Build the Articles section.")
    p.add_argument("--include-drafts", action="store_true",
                   help="Include articles with draft:true or future dates.")
    p.add_argument("--verbose", "-v", action="store_true")
    args = p.parse_args(argv)
    return build(include_drafts=args.include_drafts, verbose=args.verbose)


if __name__ == "__main__":
    sys.exit(main())
