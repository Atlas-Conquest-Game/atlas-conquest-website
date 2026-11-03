"""Localized copies of the home page and the press page: site/<locale>/index.html and press.html.

The English pages stay the source. This script reads them, pulls out every piece of
visible text and every translatable attribute, and writes one copy per language with the
text swapped in. Nothing is translated in the browser, so the pages carry real text for
search engines and never flash English first.

    i18n/config.json        locales, the card host, and whether localized cards are live
    i18n/source.en.json     every string on the two pages and in their scripts (generated)
    i18n/<code>.json        translations: {id: {"src": English, "text": translation}}
    site/<slug>/*.html      the generated pages (do not edit; re-run this script)
    site/data/i18n/<slug>.json   per-locale card names and the card ZIP, for press.js

How text is found
    An element with real text of its own is one unit, inline markup included
    (`Releasing <strong>2027</strong>`). Icons and other text-free markup at either end
    stay out of the unit. Attributes: alt, title, aria-label, placeholder, and the few
    data-* captions the pages' scripts show. Mark anything that must stay English with
    translate="no". The scripts' strings are the literals passed to t('...') in
    home/main.js and js/press.js, plus the titles and notes in data/press_kit.json.

    A unit's id is a hash of its English text, so editing the English makes a new
    unit. Until it is translated the localized pages show the English, and --check
    lists it.

Run:
    python scripts/build_i18n.py            # extract, then write every localized page
    python scripts/build_i18n.py --check    # exit 1 if a generated page is stale
    python scripts/build_i18n.py --report   # untranslated / unused counts per locale
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import posixpath
import re
import sys
from html.parser import HTMLParser
from pathlib import Path, PurePosixPath

REPO_ROOT = Path(__file__).resolve().parent.parent
SITE_DIR = REPO_ROOT / "site"
I18N_DIR = REPO_ROOT / "i18n"
CONFIG_PATH = I18N_DIR / "config.json"
SOURCE_PATH = I18N_DIR / "source.en.json"
DATA_I18N_DIR = SITE_DIR / "data" / "i18n"
GAME_TABLES = REPO_ROOT.parent.parent / "atlas-conquest" / "atlas-conquest" / "Assets" / "Resources" / "Localization"
SITE_URL = "https://atlas-conquest.com"

PAGES = ["index.html", "press.html"]
SCRIPTS = ["home/main.js", "js/press.js"]

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
        "source", "track", "wbr", "use", "path", "circle", "rect", "polygon", "line", "g"}
RAW_TEXT = {"script", "style"}
TEXT_ATTRS = {"alt", "title", "aria-label", "placeholder", "aria-roledescription",
              "data-view-caption", "data-view-chapters", "data-caption", "data-ac-cta-label"}
META_NAMES = {"description", "twitter:title", "twitter:description", "twitter:image:alt"}
META_PROPS = {"og:title", "og:description", "og:image:alt"}
URL_ATTRS = {"src", "href", "poster", "data-src", "data-src-xl", "data-src-lg", "data-src-md",
             "data-src-portrait", "data-hero-poster", "data-hero-poster-portrait",
             "data-view-video", "data-view-poster", "data-view-image", "data-large"}
EXTERNAL = ("http:", "https:", "//", "mailto:", "tel:", "data:", "javascript:", "#")
# Proper nouns and handles that read the same in every language.
KEEP = {"Atlas Conquest", "Discord", "Steam", "X", "Instagram", "TikTok", "Unity", "LinkedIn", "Matan Diamond",
        "press@atlas-conquest.com", "PC, Mac, Linux", "2027", "Atlas Conquest LLC"}

HAS_LETTER = re.compile(r"[^\W\d_]")
TAG_RE = re.compile(r"<(/?)([a-zA-Z][\w:-]*)([^>]*?)(/?)>")
T_CALL = re.compile(r"""\bt\(\s*'((?:[^'\\]|\\.)*)'""")
WS = re.compile(r"\s+")


def sid(src: str) -> str:
    return hashlib.sha1(src.encode("utf-8")).hexdigest()[:12]


def norm(text: str) -> str:
    return WS.sub(" ", text).strip()


def translatable(text: str) -> bool:
    text = norm(html.unescape(TAG_RE.sub("", text)))
    return bool(HAS_LETTER.search(text)) and text not in KEEP


# ─── Config ───────────────────────────────────────────────

def load_config() -> dict:
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def locales(config: dict) -> list[dict]:
    return config["locales"]


# ─── Parsing ──────────────────────────────────────────────

class _Element:
    __slots__ = ("tag", "attrs", "start", "inner_start", "has_text", "no_translate")

    def __init__(self, tag, attrs, start, inner_start, no_translate):
        self.tag, self.attrs, self.start, self.inner_start = tag, attrs, start, inner_start
        self.has_text = False
        self.no_translate = no_translate


class PageScanner(HTMLParser):
    """Find text units (as source offsets) and translatable attributes in one page."""

    def __init__(self, source: str):
        super().__init__(convert_charrefs=False)
        self.source = source
        self.line_starts = [0]
        for m in re.finditer("\n", source):
            self.line_starts.append(m.end())
        self.stack: list[_Element] = []
        self.units: list[tuple[int, int]] = []        # inner [start, end) of elements with own text
        self.attr_hits: list[tuple[int, int, str]] = []  # (start-tag start, end, raw tag text)

    def _abs_pos(self) -> int:
        line, col = self.getpos()
        return self.line_starts[line - 1] + col

    def _no_translate(self, attrs) -> bool:
        if self.stack and self.stack[-1].no_translate:
            return True
        return dict(attrs).get("translate") == "no"

    def handle_starttag(self, tag, attrs):
        start = self._abs_pos()
        raw = self.get_starttag_text()
        end = start + len(raw)
        no = self._no_translate(attrs)
        if not no:
            self.attr_hits.append((start, end, raw))
        if tag in VOID:
            return
        self.stack.append(_Element(tag, attrs, start, end, no))

    def handle_startendtag(self, tag, attrs):
        start = self._abs_pos()
        raw = self.get_starttag_text()
        if not self._no_translate(attrs):
            self.attr_hits.append((start, start + len(raw), raw))

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        end = self._abs_pos()
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i].tag == tag:
                el = self.stack[i]
                del self.stack[i:]
                if el.has_text and not el.no_translate and el.tag not in RAW_TEXT:
                    self.units.append((el.inner_start, end))
                return

    def handle_data(self, data):
        if self.stack and data.strip() and self.stack[-1].tag not in RAW_TEXT:
            self.stack[-1].has_text = True

    def handle_entityref(self, name):
        self.handle_data("&" + name + ";")

    def handle_charref(self, name):
        self.handle_data("&#" + name + ";")


def _balanced(tokens: list[str]) -> bool:
    depth: dict[str, int] = {}
    for tok in tokens:
        m = TAG_RE.fullmatch(tok)
        if not m:
            continue
        closing, name, _, selfclose = m.groups()
        name = name.lower()
        if selfclose or name in VOID:
            continue
        depth[name] = depth.get(name, 0) + (-1 if closing else 1)
        if depth[name] < 0:
            return False
    return all(v == 0 for v in depth.values())


def split_unit(inner: str) -> tuple[str, str, str]:
    """(prefix, core, suffix): text-free balanced markup at either end stays out of the core."""
    tokens = [t for t in re.split(r"(<[^>]+>)", inner) if t != ""]
    def inert(tok):
        return tok.startswith("<") or not tok.strip()
    lead = 0
    while lead < len(tokens) and inert(tokens[lead]):
        lead += 1
    while lead and not _balanced(tokens[:lead]):
        lead -= 1
    trail = len(tokens)
    while trail > lead and inert(tokens[trail - 1]):
        trail -= 1
    while trail < len(tokens) and not _balanced(tokens[trail:]):
        trail += 1
    return "".join(tokens[:lead]), "".join(tokens[lead:trail]), "".join(tokens[trail:])


def outermost(spans: list[tuple[int, int]]) -> list[tuple[int, int]]:
    spans = sorted(spans, key=lambda s: (s[0], -s[1]))
    keep: list[tuple[int, int]] = []
    for s in spans:
        if keep and s[0] >= keep[-1][0] and s[1] <= keep[-1][1]:
            continue
        keep.append(s)
    return keep


ATTR_RE = re.compile(r'(\s)([\w:-]+)(\s*=\s*)"([^"]*)"')


def attr_strings(raw_tag: str, tag_attrs: dict) -> list[tuple[str, str]]:
    """[(attribute name, unescaped value)] of the translatable attributes in one start tag."""
    out = []
    is_meta = raw_tag.lower().startswith("<meta")
    for m in ATTR_RE.finditer(raw_tag):
        name, value = m.group(2).lower(), html.unescape(m.group(4))
        if name in TEXT_ATTRS:
            out.append((name, value))
        elif is_meta and name == "content" and (
                tag_attrs.get("name") in META_NAMES or tag_attrs.get("property") in META_PROPS):
            out.append((name, value))
    return [(n, v) for n, v in out if translatable(v)]


def scan(page: str) -> tuple[str, PageScanner]:
    source = (SITE_DIR / page).read_text(encoding="utf-8")
    scanner = PageScanner(source)
    scanner.feed(source)
    scanner.close()
    scanner.units = outermost(scanner.units)
    return source, scanner


def _tag_attrs(raw: str) -> dict:
    return {m.group(2).lower(): html.unescape(m.group(4)) for m in ATTR_RE.finditer(raw)}


# ─── Extraction ───────────────────────────────────────────

def card_names() -> set[str]:
    names = set()
    for f in ("cards.json", "commanders.json"):
        p = SITE_DIR / "data" / f
        if p.exists():
            names |= {c["name"] for c in json.loads(p.read_text(encoding="utf-8"))}
    return names


def extract() -> dict:
    """Every string on the localized pages: {id: {src, kind, where}}."""
    cards = card_names()
    found: dict[str, dict] = {}

    def add(src: str, kind: str, where: str):
        if kind != "card" and not translatable(src):
            return
        entry = found.setdefault(sid(src), {"src": src, "kind": kind, "where": []})
        if where not in entry["where"]:
            entry["where"].append(where)

    for page in PAGES:
        source, sc = scan(page)
        for start, end in sc.units:
            _, core, _ = split_unit(source[start:end])
            core = norm(core)
            if core:
                add(core, "html", page)
        for _, _, raw in sc.attr_hits:
            for name, value in attr_strings(raw, _tag_attrs(raw)):
                value = norm(value)
                add(value, "card" if name == "alt" and value in cards else "attr", page)

    for script in SCRIPTS:
        text = (SITE_DIR / script).read_text(encoding="utf-8")
        for m in T_CALL.finditer(text):
            add(re.sub(r"\\(.)", r"\1", m.group(1)), "js", script)

    kit = json.loads((SITE_DIR / "data" / "press_kit.json").read_text(encoding="utf-8"))
    def kit_strings(item):
        for key in ("title", "note"):
            if item.get(key):
                yield item[key]
        if item.get("dimensions") and translatable(item["dimensions"]):
            yield item["dimensions"]
        for f in item.get("files", []):
            if f.get("label"):
                yield f["label"]
    for s in kit_strings(kit.get("trailer", {})):
        add(s, "data", "data/press_kit.json")
    for group in kit.get("groups", []):
        for s in kit_strings(group):
            add(s, "data", "data/press_kit.json")
        for item in group.get("items", []):
            for s in kit_strings(item):
                add(s, "data", "data/press_kit.json")
    press_cards = SITE_DIR / "data" / "press_cards.json"
    if press_cards.exists():
        for kind in sorted({c["kind"] for c in json.loads(press_cards.read_text(encoding="utf-8"))["cards"]}):
            add(kind, "data", "data/press_cards.json")
    return dict(sorted(found.items(), key=lambda kv: (kv[1]["kind"], kv[1]["src"])))


# ─── Translations ─────────────────────────────────────────

def load_table(code: str) -> dict:
    p = I18N_DIR / f"{code}.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def game_card_names(code: str) -> dict[str, str]:
    """English card name -> localized name, from the game's shipped table (when the game repo is beside this one)."""
    p = GAME_TABLES / f"{code}.json"
    if not p.exists():
        return {}
    table = json.loads(p.read_text(encoding="utf-8"))
    return {v["src"]: v["text"] for v in table.values()
            if isinstance(v, dict) and v.get("kind") == "card-name" and v.get("text")}


def tags_of(text: str) -> list[str]:
    return sorted(norm(m.group(0)) for m in TAG_RE.finditer(text))


def placeholders_of(text: str) -> list[str]:
    return sorted(re.findall(r"\{\d+\}", text))


def problems(src: str, text: str, kind: str) -> list[str]:
    """Why a translation can't be used as is (empty = fine)."""
    out = []
    if tags_of(src) != tags_of(text):
        out.append("markup differs from the English")
    if placeholders_of(src) != placeholders_of(text):
        out.append("{n} placeholders differ")
    if src.count(" · ") != text.count(" · ") and "·" in src:
        out.append("' · ' separators differ")
    if kind == "attr" and re.match(r"^\d", src) and "|" in src:
        if [p.split(":")[0] for p in src.split("|")] != [p.split(":")[0] for p in text.split("|")]:
            out.append("chapter times differ")
    return out


class Translator:
    def __init__(self, code: str, source: dict):
        self.code = code
        self.table = load_table(code)
        self.cards = game_card_names(code)
        self.source = source
        self.missing: set[str] = set()
        self.rejected: dict[str, list[str]] = {}

    def __call__(self, src: str) -> str:
        src_n = norm(src)
        if src_n in self.cards:
            return self.cards[src_n]
        key = sid(src_n)
        entry = self.table.get(key)
        if entry and entry.get("text") and entry.get("src") == src_n:
            issues = problems(src_n, entry["text"], self.source.get(key, {}).get("kind", ""))
            if not issues:
                return entry["text"]
            self.rejected[key] = issues
        if key in self.source and self.source[key]["kind"] != "card":
            self.missing.add(key)
        return src_n

    def strings(self) -> dict[str, str]:
        """English -> translation for the scripts' strings, inlined into each page."""
        out = {}
        for entry in self.source.values():
            if entry["kind"] in ("js", "data"):
                text = self(entry["src"])
                if text != entry["src"]:
                    out[entry["src"]] = text
        return out


# ─── URL rewriting ────────────────────────────────────────

def absolute(url: str, slug: str | None) -> str:
    """A URL written for a root page, made to work from /<slug>/: page-relative URLs become
    root-absolute, and links to the home or press page go to that language's copy."""
    if not url or url.startswith(EXTERNAL) or "${" in url:
        return url
    m = re.match(r"([^?#]*)(.*)", url, re.S)
    path, rest = m.group(1), m.group(2)
    if not path.startswith("/"):
        trailing = path.endswith("/") or path in ("", ".")
        path = posixpath.normpath("/" + path)
        if trailing and not path.endswith("/"):
            path += "/"
    if slug and path in ("/", "/index.html"):
        path = f"/{slug}/"
    elif slug and path == "/press.html":
        path = f"/{slug}/press.html"
    return path + rest


def rewrite_srcset(value: str, slug: str) -> str:
    parts = []
    for item in value.split(","):
        bits = item.strip().split()
        if bits:
            bits[0] = absolute(bits[0], slug)
            parts.append(" ".join(bits))
    return ", ".join(parts)


# ─── Page regions shared by English and localized pages ───

def page_url(page: str, slug: str | None) -> str:
    leaf = "" if page == "index.html" else page
    return f"{SITE_URL}/{slug}/{leaf}" if slug else f"{SITE_URL}/{leaf}"


def hreflang_block(page: str, config: dict, indent: str) -> str:
    lines = [f'{indent}<!-- AC:HREFLANG — generated by scripts/build_i18n.py -->',
             f'{indent}<link rel="alternate" hreflang="en" href="{page_url(page, None)}">']
    for loc in locales(config):
        lines.append(f'{indent}<link rel="alternate" hreflang="{loc["hreflang"]}" href="{page_url(page, loc["slug"])}">')
    lines.append(f'{indent}<link rel="alternate" hreflang="x-default" href="{page_url(page, None)}">')
    lines.append(f"{indent}<!-- /AC:HREFLANG -->")
    return "\n".join(lines)


def switcher_block(page: str, config: dict, current: str | None, indent: str) -> str:
    """The language menu. Links go to the same page in each language."""
    entries = [("en", "English", None)] + [(l["lang"], l["native"], l["slug"]) for l in locales(config)]
    cur_name = next(n for c, n, s in entries if s == current)
    items = []
    for lang, name, slug in entries:
        href = absolute(page, slug) if slug else ("/" if page == "index.html" else f"/{page}")
        here = ' aria-current="true"' if slug == current else ""
        items.append(f'{indent}    <li><a href="{href}" hreflang="{lang}" lang="{lang}"{here}>{name}</a></li>')
    return "\n".join([
        f'{indent}<!-- AC:LANG — generated by scripts/build_i18n.py -->',
        f'{indent}<details class="lang-switch" translate="no">',
        f'{indent}  <summary><svg class="lang-switch__icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" fill="none" stroke="currentColor" stroke-width="1.7"/></svg><span>{cur_name}</span></summary>',
        f'{indent}  <ul class="lang-switch__menu">',
        *items,
        f'{indent}  </ul>',
        f'{indent}</details>',
        f'{indent}<!-- /AC:LANG -->',
    ])


REGION = lambda name: re.compile(rf"(?P<indent>[ \t]*)<!-- AC:{name}\b.*?<!-- /AC:{name} -->", re.S)


def apply_regions(text: str, page: str, config: dict, slug: str | None) -> str:
    text = REGION("HREFLANG").sub(lambda m: hreflang_block(page, config, m.group("indent")), text)
    text = REGION("LANG").sub(lambda m: switcher_block(page, config, slug, m.group("indent")), text)
    return text


# ─── Generation ───────────────────────────────────────────

def card_image(slug_card: str, loc: dict, config: dict) -> str | None:
    if not config.get("cards_live"):
        return None
    return f'{config["cards_base"]}/{loc["slug"]}/webp/{slug_card}.webp'


def localize(page: str, loc: dict, config: dict, source_strings: dict) -> tuple[str, set[str]]:
    source, sc = scan(page)
    t = Translator(loc["code"], source_strings)
    edits: list[tuple[int, int, str]] = []

    for start, end in sc.units:
        prefix, core, suffix = split_unit(source[start:end])
        if norm(core) and translatable(core):
            edits.append((start, end, prefix + t(core) + suffix))

    unit_spans = sc.units
    for start, end, raw in sc.attr_hits:
        if any(s <= start < e for s, e in unit_spans):
            # Inside a text unit: the unit's replacement carries this tag. Its attributes are
            # translated inside the unit's text instead, which keeps edits from overlapping.
            continue
        attrs = _tag_attrs(raw)
        def repl(m, attrs=attrs):
            name, value = m.group(2).lower(), html.unescape(m.group(4))
            new = value
            is_meta = raw.lower().startswith("<meta")
            if (name in TEXT_ATTRS or (is_meta and name == "content" and (
                    attrs.get("name") in META_NAMES or attrs.get("property") in META_PROPS))) and translatable(value):
                new = t(value)
            elif name in URL_ATTRS and not (is_meta or (name == "href" and raw.lower().startswith("<link") and attrs.get("rel") in ("canonical", "alternate"))):
                new = absolute(value, loc["slug"])
                if name == "src" and value.startswith("assets/media/cards/"):
                    new = card_image(PurePosixPath(value).stem, loc, config) or new
            elif name in ("srcset", "imagesrcset"):
                new = rewrite_srcset(value, loc["slug"])
            if new == value:
                return m.group(0)
            return f'{m.group(1)}{m.group(2)}{m.group(3)}"{html.escape(new, quote=True)}"'
        new_raw = ATTR_RE.sub(repl, raw)
        if new_raw != raw:
            edits.append((start, end, new_raw))

    # A unit's inline tags (links, stat spans) keep their URLs page-relative; fix them too.
    out = []
    pos = 0
    for start, end, new in sorted(edits):
        if start < pos:
            continue
        out.append(source[pos:start])
        if any(start == s and end == e for s, e in unit_spans):
            new = re.sub(r'(\s(?:href|src))="([^"]*)"', lambda m: f'{m.group(1)}="{absolute(m.group(2), loc["slug"])}"', new)
        out.append(new)
        pos = end
    out.append(source[pos:])
    text = "".join(out)

    # Head: language, canonical, social URLs, script config, fonts.
    url = page_url(page, loc["slug"])
    text = re.sub(r'<html lang="en"', f'<html lang="{loc["lang"]}"', text, count=1)
    text = re.sub(r'(<link rel="canonical" href=")[^"]*(")', rf'\g<1>{url}\g<2>', text)
    text = re.sub(r'(<meta property="og:url" content=")[^"]*(")', rf'\g<1>{url}\g<2>', text)
    text = text.replace('<meta property="og:type"', f'<meta property="og:locale" content="{loc["og_locale"]}">\n  <meta property="og:type"', 1)
    data = {"locale": loc["lang"], "slug": loc["slug"], "root": "/", "strings": t.strings(),
            "cards": {"base": config["cards_base"], "live": bool(config.get("cards_live"))}}
    # Before </head>: page scripts are deferred or wait for DOMContentLoaded, so this runs first.
    boot = "  <script>window.AC_I18N = " + json.dumps(data, ensure_ascii=False, sort_keys=True) + ";</script>\n"
    if loc.get("font_css"):
        boot += f'  <link rel="stylesheet" href="/css/i18n/{loc["font_css"]}">\n'
    text = text.replace("</head>", boot + "</head>", 1)
    text = apply_regions(text, page, config, loc["slug"])
    banner = (f"<!-- Generated by scripts/build_i18n.py from site/{page} ({loc['code']}). "
              f"Edit the English page or i18n/{loc['code']}.json and re-run the script; edits here are overwritten. -->\n")
    first_line_end = text.index("\n") + 1
    return text[:first_line_end] + banner + text[first_line_end:], t.missing


def card_data(loc: dict) -> dict:
    """site/data/i18n/<slug>.json: card names for the press page's card list, plus the ZIP (set by stage_localized_cards.py)."""
    path = DATA_I18N_DIR / f"{loc['slug']}.json"
    previous = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    names = game_card_names(loc["code"]) or previous.get("cards", {})
    return {"cards": dict(sorted(names.items())), "zip": previous.get("zip")}


def build(check_only: bool = False) -> tuple[list[Path], dict[str, set[str]]]:
    config = load_config()
    source_strings = extract()
    planned: dict[Path, str] = {SOURCE_PATH: json.dumps(source_strings, indent=1, ensure_ascii=False) + "\n"}
    for page in PAGES:
        path = SITE_DIR / page
        planned[path] = apply_regions(path.read_text(encoding="utf-8"), page, config, None)
    missing: dict[str, set[str]] = {}
    for loc in locales(config):
        for page in PAGES:
            # Regions in the English page first, so a localized copy never lags its source.
            text, miss = localize(page, loc, config, source_strings)
            planned[SITE_DIR / loc["slug"] / page] = text
            missing.setdefault(loc["code"], set()).update(miss)
        planned[DATA_I18N_DIR / f"{loc['slug']}.json"] = json.dumps(card_data(loc), indent=1, ensure_ascii=False, sort_keys=True) + "\n"

    changed = []
    for path, text in planned.items():
        current = path.read_text(encoding="utf-8") if path.exists() else None
        if current != text:
            changed.append(path)
            if not check_only:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(text, encoding="utf-8", newline="\n")
    return changed, missing


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--check", action="store_true", help="don't write; exit 1 if anything is stale")
    ap.add_argument("--report", action="store_true", help="list untranslated strings per locale")
    args = ap.parse_args(argv)
    # English pages carry the hreflang/switcher regions that localized pages copy, so a
    # first pass that rewrites them must land before the localized pages are built.
    if not args.check:
        build()
    changed, missing = build(check_only=args.check)
    for path in changed:
        print(f"  {'stale' if args.check else 'wrote'}: {path.relative_to(REPO_ROOT)}")
    total = len(json.loads(SOURCE_PATH.read_text(encoding="utf-8"))) if SOURCE_PATH.exists() else 0
    for code, keys in missing.items():
        if keys or args.report:
            print(f"  {code}: {total - len(keys)}/{total} translated" + (f", {len(keys)} showing English" if keys else ""))
        if args.report:
            source = json.loads(SOURCE_PATH.read_text(encoding="utf-8"))
            table = load_table(code)
            for key in sorted(keys):
                why = problems(source[key]["src"], table[key]["text"], source[key]["kind"]) if table.get(key, {}).get("text") else ["not translated"]
                print(f"      {key}  {'; '.join(why)}  <- {source[key]['src'][:70]}")
    if args.check and changed:
        print("Localized pages are stale: run `python scripts/build_i18n.py`.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
