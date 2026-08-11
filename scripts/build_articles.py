"""Build the Articles section: turn articles/*.md into static HTML pages.

Inputs:
  articles/<slug>.md            — article sources (YAML frontmatter + Markdown body)
  articles/images/<slug>/*      — per-article images
  site/articles.html            — index template (sentinel-replaced)
  site/article.html             — per-article template (sentinel-replaced)
  site/data/cardlist.json       — card id ↔ name (used by the Python deck codec)
  site/data/cards.json          — full card metadata (cost, faction, type)
  site/data/commanders.json     — commander metadata (faction, art)

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

CLI:
  python scripts/build_articles.py                # build all non-draft, non-future articles
  python scripts/build_articles.py --include-drafts
  python scripts/build_articles.py --verbose
"""
from __future__ import annotations

import argparse
import datetime as dt
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
from markdown.extensions import Extension
from markdown.inlinepatterns import InlineProcessor
from markdown.preprocessors import Preprocessor
from markdown.treeprocessors import Treeprocessor

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pipeline.deckcode_py import DeckCodec, DeckCodecError


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

SITE_ROOT_URL = "https://atlas-conquest.com"

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

        Cards have an RGBA source — point at the transparent PNG produced by the
        pipeline's generate_thumbnails(). Commanders don't have an RGBA source
        today, so they fall back to the framed JPG.
        """
        slug = slugify(name)
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
        el.set("src", self._cards.card_img_src(name, kind))
        el.set("alt", name)
        # loading=lazy keeps multi-card paragraphs from blocking initial paint.
        el.set("loading", "lazy")
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
        for img in root.iter("img"):
            src = img.get("src") or ""
            if not src:
                continue
            if src.startswith(("http://", "https://", "/", "data:")):
                continue
            self._copied.add(src)
            img.set("src", f"/assets/articles/{self._slug}/{src}")
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
        # Treeprocessor: rewrite relative <img src> paths to /assets/articles/<slug>/.
        md.treeprocessors.register(
            ArticleImageTreeprocessor(md, self._slug, self._copied),
            "ac_article_images",
            5,
        )


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
    parts.append('">')
    # URL-encode the code so `:` and `=` in base64 survive query parsing on the Decks page.
    open_url = f"/decks/{cmd_slug}/?code={urllib.parse.quote(code, safe='')}"
    parts.append(f'<a class="article-deck-header" href="{open_url}">')
    parts.append(
        f'<img class="article-deck-portrait" src="/{html.escape(cmd_art.lstrip("/"), quote=True)}" alt="" loading="lazy">'
    )
    parts.append('<div class="article-deck-meta">')
    parts.append(f'<div class="article-deck-title">{html.escape(deck_name)}</div>')
    parts.append(
        f'<div class="article-deck-commander">'
        f'<span style="color:{FACTION_COLORS.get(cmd_faction, "#A89078")}">'
        f'{html.escape(commander)}</span> · '
        f'{cmd_faction.title()}</div>'
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
            f'<span class="article-deck-faction" style="color:{color}">'
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
    return d.strftime("%B %-d, %Y") if sys.platform != "win32" else d.strftime("%B %#d, %Y")


def build_meta_block(article: Article) -> str:
    page_url = f"{SITE_ROOT_URL}/articles/{article.slug}/"
    og_image = (
        article.hero_image_url
        if article.hero_image_url and article.hero_image_url.startswith("/")
        else article.hero_image_url
    )
    if og_image and og_image.startswith("/"):
        og_image_abs = f"{SITE_ROOT_URL}{og_image}"
    elif og_image:
        og_image_abs = og_image
    else:
        og_image_abs = f"{SITE_ROOT_URL}/assets/logo/atlas-conquest-icon.png"

    t = html.escape(article.title, quote=True)
    d = html.escape(article.summary, quote=True)
    u = html.escape(page_url, quote=True)
    og = html.escape(og_image_abs, quote=True)
    author = html.escape(article.author, quote=True)
    iso = article.date.isoformat()

    return (
        f'{SENTINEL_META_BEGIN} — generated by scripts/build_articles.py; do not edit. -->\n'
        f'  <title>{t} — Atlas Conquest</title>\n'
        f'  <meta property="og:type" content="article">\n'
        f'  <meta property="og:site_name" content="Atlas Conquest">\n'
        f'  <meta property="og:title" content="{t}">\n'
        f'  <meta property="og:description" content="{d}">\n'
        f'  <meta property="og:image" content="{og}">\n'
        f'  <meta property="og:url" content="{u}">\n'
        f'  <meta property="article:published_time" content="{iso}">\n'
        f'  <meta property="article:author" content="{author}">\n'
        f'  <meta name="twitter:card" content="summary_large_image">\n'
        f'  <meta name="twitter:title" content="{t}">\n'
        f'  <meta name="twitter:description" content="{d}">\n'
        f'  <meta name="twitter:image" content="{og}">\n'
        f'  <link rel="icon" type="image/png" href="/assets/logo/atlas-conquest-icon.png">\n'
        f'  {SENTINEL_META_END}'
    )


def build_article_body_block(article: Article) -> str:
    tags_html = "".join(
        f'<a class="article-tag" href="/articles/?tag={html.escape(t, quote=True)}">'
        f'{html.escape(t)}</a>'
        for t in article.tags
    )
    hero_html = ""
    if article.hero_image_url:
        # object-position keyword (top|center|bottom) chooses the visible band
        # when object-fit:cover crops a portrait/oblong hero. Validated in
        # load_article so this is safe to inline.
        hero_html = (
            f'<img class="article-hero" src="{html.escape(article.hero_image_url, quote=True)}" '
            f'alt="" loading="eager" '
            f'style="object-position: center {article.hero_align};">'
        )
    return (
        f'{SENTINEL_ARTICLE_BEGIN} — generated by scripts/build_articles.py; do not edit. -->\n'
        f'<header class="article-header">{hero_html}\n'
        f'  <div class="container article-header-inner">\n'
        f'    <div class="article-tags">{tags_html}</div>\n'
        f'    <h1 class="article-title">{html.escape(article.title)}</h1>\n'
        f'    <div class="article-byline">By {html.escape(article.author)} · '
        f'<time datetime="{article.date.isoformat()}">{_format_date(article.date)}</time></div>\n'
        f'    <p class="article-summary">{html.escape(article.summary)}</p>\n'
        f'  </div>\n'
        f'</header>\n'
        f'<div class="container article-prose">\n'
        f'{article.body_html}\n'
        f'</div>\n'
        f'{SENTINEL_ARTICLE_END}'
    )


def render_article_page(article: Article, template: str) -> str:
    if not META_RE.search(template) or not ARTICLE_RE.search(template):
        raise BuildError(
            "site/article.html is missing GEN:META or GEN:ARTICLE sentinels",
            ARTICLE_TEMPLATE,
        )
    out = META_RE.sub(build_meta_block(article), template, count=1)
    out = ARTICLE_RE.sub(build_article_body_block(article), out, count=1)
    return out


def render_index_block(articles: list[Article]) -> str:
    if not articles:
        body = '<p class="articles-empty">No articles published yet — check back soon.</p>'
    else:
        cards_html = []
        for a in articles:
            hero = (
                f'<img class="article-card-hero" src="{html.escape(a.hero_image_url, quote=True)}" '
                f'alt="" loading="lazy">'
                if a.hero_image_url
                else '<div class="article-card-hero article-card-hero-placeholder"></div>'
            )
            tags_html = "".join(
                f'<span class="article-tag">{html.escape(t)}</span>' for t in a.tags
            )
            cards_html.append(
                f'<a class="article-card" href="/articles/{a.slug}/">\n'
                f'  {hero}\n'
                f'  <div class="article-card-body">\n'
                f'    <div class="article-card-tags">{tags_html}</div>\n'
                f'    <h2 class="article-card-title">{html.escape(a.title)}</h2>\n'
                f'    <p class="article-card-summary">{html.escape(a.summary)}</p>\n'
                f'    <div class="article-card-byline">By {html.escape(a.author)} · '
                f'<time datetime="{a.date.isoformat()}">{_format_date(a.date)}</time></div>\n'
                f'  </div>\n'
                f'</a>'
            )
        body = '<div class="article-card-grid">\n' + "\n".join(cards_html) + "\n</div>"
    return f"{SENTINEL_INDEX_BEGIN} — generated by scripts/build_articles.py; do not edit. -->\n{body}\n{SENTINEL_INDEX_END}"


def render_index_page(articles: list[Article], template: str) -> str:
    if not INDEX_RE.search(template):
        raise BuildError(
            "site/articles.html is missing GEN:ARTICLES sentinels",
            INDEX_TEMPLATE,
        )
    return INDEX_RE.sub(render_index_block(articles), template, count=1)


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

    for a in articles:
        try:
            render_article_body(a, codec, cards)
            copy_article_images(a)
        except BuildError as exc:
            print(f"ERROR: {exc}", file=sys.stderr)
            return 1
        try:
            page_html = render_article_page(a, article_template)
        except BuildError as exc:
            print(f"ERROR: {exc}", file=sys.stderr)
            return 1
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
