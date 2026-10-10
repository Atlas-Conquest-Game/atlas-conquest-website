"""Keep the shared site chrome (head includes, nav, footer) identical on every page.

The chrome lives in three partials:

    site/partials/head.html    → <!-- AC:HEAD … --> … <!-- /AC:HEAD -->
    site/partials/nav.html     → <!-- AC:NAV … -->  … <!-- /AC:NAV -->
    site/partials/footer.html  → <!-- AC:FOOTER … --> … <!-- /AC:FOOTER -->

Every page under site/ that carries those marker comments gets the region between
them replaced with the rendered partial. Rendering does two per-page things:

* ``{{ROOT}}`` becomes ``""`` for pages at the site root (they use relative URLs,
  e.g. ``css/brand.css``) and ``"/"`` for nested pages (``decks/<slug>/``,
  ``articles/<slug>/``) and for the templates those are generated from
  (``decks.html``, ``articles.html``, ``article.html``), which already use
  root-absolute URLs because the generators copy them verbatim into subfolders,
  and for ``404.html``, which GitHub Pages serves at any depth.
* The nav link whose ``data-nav`` matches the page's section gets
  ``aria-current="page"`` (analytics sub-pages → Analytics, decks/<slug>/ → Decks,
  articles/** → Articles).

Pages without markers are left alone (site/index.html opts in when the homepage
adopts the shared chrome). The generators (generate_deck_pages.py,
build_articles.py) call :func:`apply_chrome` on everything they write, so the
daily CI run produces correct chrome even if nobody re-ran this script.

Run:
    python scripts/sync_chrome.py          # rewrite pages in place
    python scripts/sync_chrome.py --check  # exit 1 and list pages that are out of sync
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path, PurePosixPath

REPO_ROOT = Path(__file__).resolve().parent.parent
SITE_DIR = REPO_ROOT / "site"
PARTIALS_DIR = SITE_DIR / "partials"

REGIONS = {
    "HEAD": "head.html",
    "NAV": "nav.html",
    "FOOTER": "footer.html",
}

# Directories under site/ that never hold chrome-bearing pages.
SKIP_DIRS = {"concepts", "partials", "data", "assets", "classic"}  # classic/ = frozen pre-refresh snapshot

# Root-level pages that are served from other depths, so they already use
# root-absolute URLs ("/css/…") and must get "/" chrome too: the templates a
# generator copies into subfolders, and 404.html, which GitHub Pages serves at
# whatever URL was missed (/decks/old-slug/, /a/b/c/typo).
ABSOLUTE_TEMPLATES = {"decks.html", "articles.html", "article.html", "404.html"}

ANALYTICS_PAGES = {
    "analytics.html",
    "commanders.html",
    "cards.html",
    "meta.html",
    "metagame.html",
    "goals.html",
}

# A partial's leading <!-- PARTIAL … --> comment documents the partial itself and
# is not copied into pages.
_PARTIAL_DOC_RE = re.compile(r"\A\s*<!--\s*PARTIAL\b.*?-->\s*\n?", re.DOTALL)


def region_re(name: str) -> re.Pattern[str]:
    """Match a whole region, capturing the indentation before its opening marker."""
    return re.compile(
        rf"(?P<indent>[ \t]*)<!-- AC:{name}\b.*?-->.*?<!-- /AC:{name} -->",
        flags=re.DOTALL,
    )


REGION_RES = {name: region_re(name) for name in REGIONS}


def _rel(page: Path | PurePosixPath | str) -> PurePosixPath:
    """Normalise a page path to a POSIX path relative to site/."""
    if isinstance(page, Path) and page.is_absolute():
        page = page.resolve().relative_to(SITE_DIR.resolve())
    return PurePosixPath(str(page).replace("\\", "/"))


def root_prefix(page: Path | PurePosixPath | str) -> str:
    rel = _rel(page)
    if len(rel.parts) > 1 or rel.name in ABSOLUTE_TEMPLATES:
        return "/"
    return ""


def section_for(page: Path | PurePosixPath | str) -> str | None:
    """The primary-nav section a page belongs to (matches data-nav), or None."""
    rel = _rel(page)
    top = rel.parts[0]
    if len(rel.parts) > 1:
        if top == "decks":
            return "decks"
        if top == "articles":
            return "articles"
        return None
    if rel.name == "index.html":
        return "home"
    if rel.name in ANALYTICS_PAGES:
        return "analytics"
    if rel.name == "decks.html":
        return "decks"
    if rel.name in ("articles.html", "article.html"):
        return "articles"
    if rel.name == "press.html":
        return "press"
    return None


def load_partial(name: str) -> str:
    text = (PARTIALS_DIR / REGIONS[name]).read_text(encoding="utf-8")
    return _PARTIAL_DOC_RE.sub("", text, count=1).rstrip("\n")


def render_region(name: str, page: Path | PurePosixPath | str, indent: str = "  ",
                  partial: str | None = None) -> str:
    """Render one region (markers included) for ``page``."""
    body = load_partial(name) if partial is None else partial
    body = body.replace("{{ROOT}}", root_prefix(page))
    if name == "NAV":
        section = section_for(page)
        if section:
            body = body.replace(
                f'data-nav="{section}"', f'data-nav="{section}" aria-current="page"'
            )
    source = f"site/partials/{REGIONS[name]}"
    lines = [
        f"{indent}<!-- AC:{name} — generated from {source} by scripts/sync_chrome.py; "
        f"edit the partial, not this block. -->"
    ]
    lines += [(indent + line) if line.strip() else "" for line in body.split("\n")]
    lines.append(f"{indent}<!-- /AC:{name} -->")
    return "\n".join(lines)


def apply_chrome(html: str, page: Path | PurePosixPath | str,
                 partials: dict[str, str] | None = None) -> str:
    """Return ``html`` with every AC region present in it re-rendered for ``page``.

    ``page`` is the page's path relative to site/ (or an absolute path inside
    site/); it decides the {{ROOT}} prefix and the aria-current section. Regions
    the page doesn't have are left alone, so this is a no-op on pages without
    markers. Idempotent.
    """
    partials = partials or {}
    for name, pattern in REGION_RES.items():
        if not pattern.search(html):
            continue
        cache: dict[str, str] = {}

        def _sub(m: re.Match[str], _name: str = name) -> str:
            indent = m.group("indent")
            if indent not in cache:
                cache[indent] = render_region(_name, page, indent, partials.get(_name))
            return cache[indent]

        html = pattern.sub(_sub, html)
    return html


def iter_pages(site_dir: Path = SITE_DIR):
    for path in sorted(site_dir.rglob("*.html")):
        rel = path.relative_to(site_dir)
        if rel.parts[0] in SKIP_DIRS:
            continue
        yield path


def has_regions(html: str) -> bool:
    return any(p.search(html) for p in REGION_RES.values())


def sync(check_only: bool = False, site_dir: Path = SITE_DIR) -> list[Path]:
    """Re-render chrome on every page that has markers. Returns pages that changed
    (or, with ``check_only``, pages that would change)."""
    partials = {name: load_partial(name) for name in REGIONS}
    changed: list[Path] = []
    for path in iter_pages(site_dir):
        html = path.read_text(encoding="utf-8")
        if not has_regions(html):
            continue
        rel = path.relative_to(site_dir).as_posix()
        out = apply_chrome(html, rel, partials)
        if out != html:
            changed.append(path)
            if not check_only:
                path.write_text(out, encoding="utf-8")
    return changed


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--check", action="store_true",
                        help="Don't write; exit 1 if any page is out of sync.")
    args = parser.parse_args(argv)
    changed = sync(check_only=args.check)
    verb = "out of sync" if args.check else "updated"
    for path in changed:
        print(f"  {verb}: {path.relative_to(REPO_ROOT)}")
    if args.check:
        if changed:
            print(f"{len(changed)} page(s) out of sync — run `python scripts/sync_chrome.py`.")
            return 1
        print("All pages in sync.")
        return 0
    print(f"Chrome synced ({len(changed)} page(s) updated).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
