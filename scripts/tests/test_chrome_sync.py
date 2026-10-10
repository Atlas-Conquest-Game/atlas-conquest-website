"""The shared site chrome (site/partials/ → AC:HEAD / AC:NAV / AC:FOOTER regions)
must be identical on every page, point at the right place for the page's depth,
and mark the right nav item as current. Fix failures with:

    python scripts/sync_chrome.py
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

import sync_chrome as sc

SITE = sc.SITE_DIR

# Every public page that must carry the shared chrome. index.html is the
# separately-designed homepage, deck_tests.html is a dev-only test harness, and
# press.html is Matan's own page (shipped as he builds it, so it may opt out).
ROOT_PAGES = [
    "analytics.html", "commanders.html", "cards.html", "meta.html", "metagame.html",
    "goals.html", "decks.html", "articles.html", "article.html",
    "privacy.html", "terms.html", "privacy-extension.html", "terms-extension.html",
    "404.html",
]
NESTED_PAGES = sorted(
    p.relative_to(SITE).as_posix()
    for pattern in ("decks/*/index.html", "articles/index.html", "articles/*/index.html")
    for p in SITE.glob(pattern)
)
CHROME_PAGES = ROOT_PAGES + NESTED_PAGES

EXPECTED_SECTION = {
    "analytics.html": "analytics", "commanders.html": "analytics", "cards.html": "analytics",
    "meta.html": "analytics", "metagame.html": "analytics", "goals.html": "analytics",
    "decks.html": "decks", "articles.html": "articles", "article.html": "articles",
    "press.html": "press", "privacy.html": None, "terms.html": None,
    "privacy-extension.html": None, "terms-extension.html": None, "404.html": None,
}

SHARED_CSS = {"variables", "base", "layout", "components", "modals", "responsive", "tooltips"}


def _read(rel: str) -> str:
    return (SITE / rel).read_text(encoding="utf-8")


def _region(html: str, name: str) -> str:
    m = sc.REGION_RES[name].search(html)
    assert m, f"missing AC:{name} region"
    return m.group(0)


def test_generated_pages_exist():
    assert any(p.startswith("decks/") for p in NESTED_PAGES)
    assert "articles/index.html" in NESTED_PAGES
    assert any(re.match(r"articles/[^/]+/index\.html", p) for p in NESTED_PAGES)


@pytest.mark.parametrize("rel", CHROME_PAGES)
def test_page_has_every_region_once(rel):
    html = _read(rel)
    for name in sc.REGIONS:
        assert len(sc.REGION_RES[name].findall(html)) == 1, f"{rel}: AC:{name} must appear exactly once"


def test_every_page_in_sync():
    stale = [p.relative_to(SITE).as_posix() for p in sc.sync(check_only=True)]
    assert not stale, f"chrome out of sync — run `python scripts/sync_chrome.py`: {stale}"


@pytest.mark.parametrize("rel", CHROME_PAGES)
def test_aria_current_marks_the_right_section(rel):
    nav = _region(_read(rel), "NAV")
    current = re.findall(r'data-nav="(\w+)" aria-current="page"', nav)
    if rel in EXPECTED_SECTION:
        expected = EXPECTED_SECTION[rel]
    else:
        expected = rel.split("/")[0]  # decks/<slug>/ → decks, articles/** → articles
    assert current == ([expected] if expected else []), f"{rel}: aria-current on {current}"
    assert nav.count('aria-current="page"') == len(current)


@pytest.mark.parametrize("rel", CHROME_PAGES)
def test_chrome_urls_match_page_depth(rel):
    html = _read(rel)
    absolute = sc.root_prefix(rel) == "/"
    for name in sc.REGIONS:
        region = _region(html, name)
        for url in re.findall(r'\s(?:href|src)="([^"]+)"', region):
            if url.startswith(("http://", "https://", "mailto:", "#")):
                continue
            if absolute:
                assert url.startswith("/"), f"{rel}: relative URL {url!r} in AC:{name} of a nested page"
            else:
                assert not url.startswith("/"), f"{rel}: root-absolute URL {url!r} in AC:{name}"
        srcsets = re.findall(r'\ssrcset="([^"]+)"', region)
        for srcset in srcsets:
            for candidate in srcset.split(","):
                url = candidate.strip().split()[0]
                assert url.startswith("/") == absolute, f"{rel}: srcset URL {url!r}"


def test_chrome_assets_exist():
    """Every local file the partials reference is on disk."""
    for name in sc.REGIONS:
        body = sc.load_partial(name).replace("{{ROOT}}", "")
        urls = re.findall(r'\s(?:href|src)="([^"#]+)"', body)
        urls += [c.strip().split()[0] for s in re.findall(r'\ssrcset="([^"]+)"', body) for c in s.split(",")]
        for url in urls:
            if url.startswith(("http://", "https://", "mailto:")):
                continue
            path = url.split("?")[0]
            target = SITE / path
            if path.endswith("/"):
                target = target / "index.html"
            assert target.exists(), f"partials/{sc.REGIONS[name]} references missing {url}"


@pytest.mark.parametrize("rel", ROOT_PAGES)
def test_brand_css_loads_after_shared_css_and_before_page_css(rel):
    """brand.css must override the legacy shared CSS but stay overridable by page CSS."""
    html = _read(rel)
    sheets = re.findall(r'<link rel="stylesheet" href="/?css/([\w-]+)\.css">', html)
    assert "brand" in sheets, f"{rel} doesn't load brand.css"
    i = sheets.index("brand")
    assert all(s in SHARED_CSS for s in sheets[:i]), f"{rel}: page CSS before brand.css: {sheets}"
    assert not any(s in SHARED_CSS for s in sheets[i + 1:]), f"{rel}: shared CSS after brand.css: {sheets}"


def test_404_page_uses_only_root_absolute_urls():
    """404.html renders at /decks/old-slug/ or /a/b/typo, so no local URL may be relative."""
    html = _read("404.html")
    urls = re.findall(r'\s(?:href|src|content)="([^"]+)"', html)
    urls += [c.strip().split()[0] for s in re.findall(r'\ssrcset="([^"]+)"', html) for c in s.split(",")]
    for url in urls:
        if url.startswith(("http://", "https://", "mailto:", "#", "/", "data:")) or ":" in url.split("/")[0]:
            continue
        if not re.search(r"\.(html|css|js|webp|png|jpg|svg|woff2?|ttf|ico|mp4|json|webmanifest)$|/$", url.split("?")[0]):
            continue  # meta content strings, not URLs
        pytest.fail(f"404.html: relative URL {url!r} breaks below the site root")


def test_apply_chrome_is_idempotent_and_ignores_unmarked_pages():
    page = "<html><head>\n  <!-- AC:HEAD --><!-- /AC:HEAD -->\n</head><body>\n  <!-- AC:NAV --><!-- /AC:NAV -->\n</body></html>"
    once = sc.apply_chrome(page, "decks/some-commander/index.html")
    assert sc.apply_chrome(once, "decks/some-commander/index.html") == once
    assert 'href="/css/brand.css"' in once
    assert 'data-nav="decks" aria-current="page"' in once
    plain = "<html><body><nav>legacy</nav></body></html>"
    assert sc.apply_chrome(plain, "index.html") == plain


def test_root_prefix_and_sections():
    assert sc.root_prefix("cards.html") == ""
    assert sc.root_prefix("decks.html") == "/"
    assert sc.root_prefix("articles/foo/index.html") == "/"
    # GitHub Pages serves 404.html at the depth of whatever URL was missed.
    assert sc.root_prefix("404.html") == "/"
    assert sc.section_for("metagame.html") == "analytics"
    assert sc.section_for("decks/milo-sunstone/index.html") == "decks"
    assert sc.section_for("articles/index.html") == "articles"
    assert sc.section_for("privacy.html") is None


def test_nav_links_keep_legacy_hooks():
    """shared.js and decks.js look up `.nav-link[data-nav]`."""
    nav = sc.load_partial("NAV")
    for section in ("home", "analytics", "decks", "articles", "press"):
        assert re.search(rf'<a class="nav-link" data-nav="{section}"', nav), section


def test_service_worker_precaches_the_chrome():
    sw = (SITE / "service-worker.js").read_text(encoding="utf-8")
    shell = re.search(r"const SHELL_URLS = \[(.*?)\];", sw, re.DOTALL).group(1)
    urls = re.findall(r"'(/[^']+)'", shell)
    for needed in ("/css/brand.css", "/js/site-config.js",
                   "/assets/media/fonts/OptimusPrincepsSemiBold.woff",
                   "/assets/media/logo/wordmark-360.webp"):
        assert needed in urls, f"service worker shell is missing {needed}"
    for url in urls:
        assert (SITE / url.lstrip("/")).exists(), f"service worker precaches missing file {url}"
    # Every local asset the decks page's chrome uses is in the shell, so the
    # offline deck builder renders its nav/footer.
    decks = _read("decks.html")
    chrome = "".join(_region(decks, n) for n in sc.REGIONS)
    local = {u for u in re.findall(r'\s(?:href|src)="(/[^"]+\.(?:css|js|webp|woff))"', chrome)}
    assert local <= set(urls), f"not precached: {sorted(local - set(urls))}"
