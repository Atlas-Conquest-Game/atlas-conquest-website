"""Every local file a public page or stylesheet points at must ship with the site.

CI checks out only what is committed, so an asset that exists in a working tree
but was never `git add`-ed (fonts, key art, a new stylesheet…) makes this test
fail there instead of breaking the live site. Locally it also catches typos and
files hidden by .gitignore.

Covers site/*.html (except dev-only harnesses), the generated decks/<slug>/ and
articles/** pages, and url(...) references in site/css/*.css.
"""
from __future__ import annotations

import re
import shutil
import subprocess
from functools import lru_cache
from pathlib import Path, PurePosixPath
from urllib.parse import unquote

import pytest

REPO = Path(__file__).resolve().parents[2]
SITE = REPO / "site"

# Pages that are not part of the public site (dev harness, frozen snapshot,
# design concepts, the separately-built homepage) are skipped.
SKIP_PAGES = {"deck_tests.html", "index.html"}
SKIP_DIRS = {"concepts", "classic", "partials", "data", "assets", "preview"}

ATTR_RE = re.compile(r'\s(?:href|src|poster|data-ac-hero-art)="([^"]+)"')
SRCSET_RE = re.compile(r'\s(?:srcset|imagesrcset)="([^"]+)"')
CSS_URL_RE = re.compile(r"url\(\s*['\"]?([^'\")]+)['\"]?\s*\)")
EXTERNAL = ("http://", "https://", "mailto:", "tel:", "data:", "javascript:", "#", "//")


def _pages() -> list[str]:
    out = []
    for path in sorted(SITE.rglob("*.html")):
        rel = path.relative_to(SITE)
        if rel.parts[0] in SKIP_DIRS or rel.as_posix() in SKIP_PAGES:
            continue
        out.append(rel.as_posix())
    return out


def _resolve(base: PurePosixPath, url: str) -> Path | None:
    url = unquote(url.split("#")[0].split("?")[0]).strip()
    if not url or url.startswith(EXTERNAL) or "{{" in url or "${" in url:
        return None
    if url.startswith("/"):
        target = SITE / url.lstrip("/")
    else:
        target = (SITE / base.parent / url)
    target = Path(str(target.resolve()))
    if url.endswith("/") or target.is_dir():
        target = target / "index.html"
    return target


def _local_refs(rel: str) -> list[str]:
    html = (SITE / rel).read_text(encoding="utf-8")
    # Ignore anything inside <script> / <template> bodies and HTML comments —
    # those are JS strings and docs, not live references.
    html = re.sub(r"<!--.*?-->", "", html, flags=re.DOTALL)
    html = re.sub(r"<script\b[^>]*>.*?</script>", lambda m: m.group(0).split(">", 1)[0] + ">", html, flags=re.DOTALL)
    refs = ATTR_RE.findall(html)
    for srcset in SRCSET_RE.findall(html):
        refs += [c.strip().split()[0] for c in srcset.split(",") if c.strip()]
    return refs


@lru_cache(maxsize=1)
def _ignored(paths: tuple[str, ...]) -> frozenset[str]:
    """Paths (relative to the repo) that .gitignore would keep out of a commit."""
    if not shutil.which("git") or not (REPO / ".git").exists():
        return frozenset()
    proc = subprocess.run(
        ["git", "check-ignore", "--no-index", "--stdin"],
        cwd=REPO, input="\n".join(paths), capture_output=True, text=True,
    )
    return frozenset(line.strip() for line in proc.stdout.splitlines() if line.strip())


@pytest.mark.parametrize("rel", _pages())
def test_page_references_resolve(rel):
    base = PurePosixPath(rel)
    missing, targets = [], {}
    for url in _local_refs(rel):
        target = _resolve(base, url)
        if target is None:
            continue
        if not target.exists():
            missing.append(url)
        else:
            try:
                targets[url] = target.relative_to(REPO).as_posix()
            except ValueError:
                missing.append(url)  # escapes the repo
    assert not missing, f"{rel} references files that don't exist: {sorted(set(missing))}"
    ignored = _ignored(tuple(sorted(set(targets.values()))))
    bad = sorted({u for u, t in targets.items() if t in ignored})
    assert not bad, f"{rel} references files .gitignore keeps out of the repo: {bad}"


@pytest.mark.parametrize("css", sorted(p.name for p in (SITE / "css").glob("*.css")))
def test_stylesheet_urls_resolve(css):
    text = (SITE / "css" / css).read_text(encoding="utf-8")
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.DOTALL)
    missing = []
    for url in CSS_URL_RE.findall(text):
        if url.startswith(EXTERNAL) or url.startswith("%23") or url.startswith("var("):
            continue
        target = _resolve(PurePosixPath("css") / css, url)
        if target is not None and not target.exists():
            missing.append(url)
    assert not missing, f"css/{css} url() targets missing: {missing}"
