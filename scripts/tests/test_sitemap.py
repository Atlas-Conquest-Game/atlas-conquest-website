"""scripts/build_sitemap.py: the sitemap lists the real public pages (and only
those), uses clean directory URLs for generated pages, and is deterministic."""
from __future__ import annotations

import json
import xml.etree.ElementTree as ET
from pathlib import Path

import build_sitemap as bs

NS = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
SITE = "https://atlas-conquest.com"


def _page(path: Path, body: str = "<html><head></head><body></body></html>") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body, encoding="utf-8")


def _fake_site(root: Path) -> Path:
    site = root / "site"
    for name in ("index.html", "press.html", "terms.html", "decks.html",
                 "articles.html", "article.html", "404.html", "deck_tests.html"):
        _page(site / name)
    _page(site / "secret.html", '<head><meta name="robots" content="noindex"></head>')
    _page(site / "concepts" / "a" / "index.html")
    _page(site / "partials" / "nav.html")
    _page(site / "decks" / "milo-sunstone" / "index.html")
    _page(site / "articles" / "index.html")
    _page(site / "articles" / "old-news" / "index.html")
    _page(site / "articles" / "new-news" / "index.html")
    _page(site / "articles" / "a-draft" / "index.html")
    (site / "data").mkdir(parents=True, exist_ok=True)
    (site / "data" / "articles.json").write_text(json.dumps({"articles": [
        {"slug": "old-news", "date": "2026-01-02"},
        {"slug": "new-news", "date": "2026-03-04"},
    ]}), encoding="utf-8")
    return site


def _locs(xml: str) -> list[str]:
    return [el.text for el in ET.fromstring(xml).findall("s:url/s:loc", NS)]


def test_lists_public_pages_with_clean_urls(tmp_path):
    site = _fake_site(tmp_path)
    locs = _locs(bs.render_sitemap(bs.collect_urls(site)))
    assert locs[0] == f"{SITE}/"
    for url in ("/press.html", "/terms.html", "/decks.html", "/decks/milo-sunstone/",
                "/articles/", "/articles/new-news/", "/articles/old-news/"):
        assert f"{SITE}{url}" in locs, url
    assert len(locs) == len(set(locs))


def test_leaves_out_templates_dev_pages_noindex_and_drafts(tmp_path):
    site = _fake_site(tmp_path)
    joined = "\n".join(_locs(bs.render_sitemap(bs.collect_urls(site))))
    for bad in ("index.html", "articles.html", "article.html", "404", "deck_tests",
                "secret", "concepts", "partials", "a-draft"):
        assert bad not in joined, bad


def test_articles_carry_their_dates_newest_first(tmp_path):
    site = _fake_site(tmp_path)
    entries = dict(bs.collect_urls(site))
    assert entries[f"{SITE}/articles/new-news/"] == "2026-03-04"
    assert entries[f"{SITE}/articles/"] == "2026-03-04"
    assert entries[f"{SITE}/press.html"] is None
    order = [u for u, _ in bs.collect_urls(site)]
    assert order.index(f"{SITE}/articles/new-news/") < order.index(f"{SITE}/articles/old-news/")


def test_build_is_idempotent_and_check_mode(tmp_path):
    site = _fake_site(tmp_path)
    assert bs.build(site, check_only=True) == 1      # nothing written yet
    assert bs.build(site) == 0
    first = (site / "sitemap.xml").read_text(encoding="utf-8")
    assert bs.build(site) == 0
    assert (site / "sitemap.xml").read_text(encoding="utf-8") == first
    assert bs.build(site, check_only=True) == 0
    ET.fromstring(first)  # well-formed


def test_robots_points_at_the_sitemap():
    robots = (bs.SITE_DIR / "robots.txt").read_text(encoding="utf-8")
    assert "Sitemap: https://atlas-conquest.com/sitemap.xml" in robots
