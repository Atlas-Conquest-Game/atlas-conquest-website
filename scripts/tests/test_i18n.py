"""Localized home and press pages (scripts/build_i18n.py): generated copies in sync,
translations that keep the English markup, reciprocal hreflang, and no page-relative
URLs left on a page that lives one folder down. Fix sync failures with:

    python scripts/build_i18n.py
"""
from __future__ import annotations

import json
import os
import re

import pytest

import build_i18n as b

CONFIG = b.load_config()
LOCALES = b.locales(CONFIG)
SOURCE = json.loads(b.SOURCE_PATH.read_text(encoding="utf-8"))
GENERATED = [(loc, page) for loc in LOCALES for page in b.PAGES]


@pytest.mark.skipif(bool(os.environ.get("GITHUB_ACTIONS")),
                    reason="CI rebuilds the localized pages after the data refresh")
def test_generated_pages_in_sync():
    changed, _ = b.build(check_only=True)
    assert not changed, "stale: " + ", ".join(str(p.relative_to(b.REPO_ROOT)) for p in changed)


@pytest.mark.parametrize("loc", LOCALES, ids=lambda l: l["code"])
def test_translations_keep_markup_and_placeholders(loc):
    table = b.load_table(loc["code"])
    bad = []
    for key, entry in table.items():
        if key not in SOURCE or not entry.get("text"):
            continue
        issues = b.problems(SOURCE[key]["src"], entry["text"], SOURCE[key]["kind"])
        if issues:
            bad.append(f"{key} ({'; '.join(issues)}): {SOURCE[key]['src'][:60]}")
    assert not bad, "\n".join(bad)


@pytest.mark.parametrize("loc,page", GENERATED, ids=lambda v: v["slug"] if isinstance(v, dict) else v)
def test_page_head(loc, page):
    html = (b.SITE_DIR / loc["slug"] / page).read_text(encoding="utf-8")
    assert f'<html lang="{loc["lang"]}"' in html
    leaf = "" if page == "index.html" else page
    assert f'<link rel="canonical" href="{b.SITE_URL}/{loc["slug"]}/{leaf}">' in html
    alternates = set(re.findall(r'<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">', html))
    english = (b.SITE_DIR / page).read_text(encoding="utf-8")
    assert alternates == set(re.findall(r'<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">', english))
    assert ("x-default", f"{b.SITE_URL}/{leaf}") in alternates
    assert (loc["hreflang"], f"{b.SITE_URL}/{loc['slug']}/{leaf}") in alternates
    assert "window.AC_I18N" in html


@pytest.mark.parametrize("loc,page", GENERATED, ids=lambda v: v["slug"] if isinstance(v, dict) else v)
def test_no_page_relative_urls(loc, page):
    """The page sits in /<slug>/, so a URL written for the root page would miss."""
    html = (b.SITE_DIR / loc["slug"] / page).read_text(encoding="utf-8")
    html = re.sub(r"<script>.*?</script>", "", html, flags=re.S)
    relative = []
    for name, value in re.findall(r'\s(src|href|poster|data-src[\w-]*|data-view-video|data-view-poster|data-large)="([^"]*)"', html):
        if value and not value.startswith(("/", "#", "http:", "https:", "mailto:", "data:", "${")):
            relative.append(f"{name}={value}")
    for srcset in re.findall(r'\ssrcset="([^"]*)"', html):
        relative += [u for u in (part.split()[0] for part in srcset.split(",") if part.strip())
                     if not u.startswith(("/", "http"))]
    assert not relative, relative[:10]


def test_switcher_links_every_language():
    for page in b.PAGES:
        html = (b.SITE_DIR / page).read_text(encoding="utf-8")
        langs = set(re.findall(r'<a href="[^"]*" hreflang="([^"]+)" lang=', html))
        assert langs == {"en"} | {l["lang"] for l in LOCALES}, page
