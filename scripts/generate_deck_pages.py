"""Generate per-commander deck pages for Discord (and other) link unfurls.

Discord, Slack, iMessage, Twitter, etc. fetch the HTML of a shared URL and read its
<meta> tags *without executing JavaScript* — so client-side updates to og:image can't
influence what shows up in a link preview. To get commander-specific unfurls we need
each deck URL to resolve to an HTML document whose meta tags already name the commander.

This script produces one static shell per commander at
    site/decks/<slug>/index.html
Each shell is a copy of site/decks.html with the meta/title/favicon block between the
`<!-- GEN:META:BEGIN -->` and `<!-- GEN:META:END -->` sentinels replaced by tags that
reference the commander's name and artwork. All runtime behavior (deck decoding,
rendering, the Build tab, etc.) is unchanged — the JS on these pages is identical to
decks.html and still reads `?code=` from the URL.

Inputs:   site/decks.html            (template, must contain GEN:META:BEGIN/END markers)
          site/data/commanders.json  (canonical commander list with art paths)
          site/partials/*.html       (shared nav/footer/head chrome, via sync_chrome)
Outputs:  site/decks/<slug>/index.html  (one per commander)

Each output also gets its AC:HEAD/AC:NAV/AC:FOOTER chrome re-rendered by
scripts/sync_chrome.py's apply_chrome(), so generated pages always match the
partials even if the template wasn't re-synced after a partial changed.

Run standalone:
    python scripts/generate_deck_pages.py
Also invoked automatically by .github/workflows/update-data.yml after each data refresh
so newly added commanders get unfurl pages without manual intervention.
"""
from __future__ import annotations

import hashlib
import html
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sync_chrome  # noqa: E402  (scripts/ on sys.path for the shared chrome renderer)

SITE_ROOT = "https://atlas-conquest.com"

REPO_ROOT = Path(__file__).resolve().parent.parent
SITE_DIR = REPO_ROOT / "site"
TEMPLATE_PATH = SITE_DIR / "decks.html"
COMMANDERS_JSON = SITE_DIR / "data" / "commanders.json"
OUTPUT_DIR = SITE_DIR / "decks"
# Small WebP portraits for the round commander tokens (22–72px on screen) so
# pages stop pulling every 400px JPG to draw a thumbnail. Re-encoded only when
# the source portrait's bytes change (sources.json records their hashes), so
# repeat runs — and the daily CI run — leave the files untouched.
TOKEN_DIR = SITE_DIR / "assets" / "commanders" / "token"
TOKEN_SIZE = 160

# Sentinels that mark the replaceable region in decks.html. The script refuses to
# run if it can't find both — catches accidental edits that would silently break
# meta-tag injection on future runs.
SENTINEL_BEGIN = "<!-- GEN:META:BEGIN"
SENTINEL_END = "<!-- GEN:META:END -->"
META_BLOCK_RE = re.compile(
    rf"{re.escape(SENTINEL_BEGIN)}.*?{re.escape(SENTINEL_END)}",
    flags=re.DOTALL,
)


def slugify(name: str) -> str:
    """Match the JS `commanderSlug()` in site/js/shared.js: lowercase, strip commas
    and apostrophes, collapse whitespace runs to single hyphens.
    Examples: "Lazim, Thief of Gods" -> "lazim-thief-of-gods"
              "Captain Greenbeard"   -> "captain-greenbeard"
    """
    cleaned = re.sub(r"[,']", "", name.lower())
    return re.sub(r"\s+", "-", cleaned.strip())


def meta_block(commander: dict) -> str:
    """Build the replacement meta/title/favicon block for a given commander."""
    name = commander["name"]
    slug = slugify(name)
    # og:image points at the 1200×630 hero produced by scripts/generate_og_images.py;
    # favicon uses the raw 400×400 commander portrait which fits better at 16×16.
    og_rel = f"assets/og/{slug}.jpg"
    portrait_rel = commander.get("art") or f"assets/commanders/{slug}.jpg"
    og_abs = f"{SITE_ROOT}/{og_rel}"
    portrait_abs = f"{SITE_ROOT}/{portrait_rel.lstrip('/')}"
    page_url = f"{SITE_ROOT}/decks/{slug}/"
    title = f"{name} Deck — Atlas Conquest"
    description = (
        f"Build or open a {name} deck for Atlas Conquest: every card {name} "
        "can run, the mana curve and deck stats, shareable as a link or code."
    )
    # html.escape everything user-visible that lands inside attribute values —
    # commander names contain commas and may someday contain other punctuation.
    t = html.escape(title, quote=True)
    d = html.escape(description, quote=True)
    u = html.escape(page_url, quote=True)
    og = html.escape(og_abs, quote=True)
    pt = html.escape(portrait_abs, quote=True)
    return (
        f"{SENTINEL_BEGIN} — generated for {name}; "
        f"edit scripts/generate_deck_pages.py, not this file. -->\n"
        f"  <title>{t}</title>\n"
        f"  <meta name=\"description\" content=\"{d}\">\n"
        f"  <link rel=\"canonical\" href=\"{u}\">\n"
        f"  <meta property=\"og:type\" content=\"website\">\n"
        f"  <meta property=\"og:site_name\" content=\"Atlas Conquest\">\n"
        f"  <meta property=\"og:title\" content=\"{t}\">\n"
        f"  <meta property=\"og:description\" content=\"{d}\">\n"
        f"  <meta property=\"og:image\" content=\"{og}\">\n"
        f"  <meta property=\"og:image:type\" content=\"image/jpeg\">\n"
        f"  <meta property=\"og:image:width\" content=\"1200\">\n"
        f"  <meta property=\"og:image:height\" content=\"630\">\n"
        f"  <meta property=\"og:image:alt\" content=\"{t}\">\n"
        f"  <meta property=\"og:url\" content=\"{u}\">\n"
        f"  <meta name=\"twitter:card\" content=\"summary_large_image\">\n"
        f"  <meta name=\"twitter:site\" content=\"@Atlas_Conquest\">\n"
        f"  <meta name=\"twitter:title\" content=\"{t}\">\n"
        f"  <meta name=\"twitter:description\" content=\"{d}\">\n"
        f"  <meta name=\"twitter:image\" content=\"{og}\">\n"
        f"  <link rel=\"icon\" type=\"image/jpeg\" href=\"{pt}\">\n"
        f"  {SENTINEL_END}"
    )


def build_token_portraits(commanders: list[dict]) -> int:
    """Write site/assets/commanders/token/<slug>.webp (TOKEN_SIZE², centre-top
    crop) for every commander whose portrait is new or changed. Returns the
    number written. Skips quietly without Pillow (pages fall back to the JPG)."""
    try:
        from PIL import Image
    except ImportError:  # pragma: no cover — Pillow is in requirements.txt
        return 0
    manifest_path = TOKEN_DIR / "sources.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        manifest = {}
    written = 0
    seen = {}
    for cmd in commanders:
        slug = slugify(cmd["name"])
        src = SITE_DIR / (cmd.get("art") or f"assets/commanders/{slug}.jpg").lstrip("/")
        if not src.exists():
            continue
        digest = hashlib.sha1(src.read_bytes()).hexdigest()
        seen[slug] = digest
        out = TOKEN_DIR / f"{slug}.webp"
        if out.exists() and manifest.get(slug) == digest:
            continue
        TOKEN_DIR.mkdir(parents=True, exist_ok=True)
        with Image.open(src) as im:
            im = im.convert("RGB")
            w, h = im.size
            side = min(w, h)
            # Portraits put the face high in the frame: crop from the top third.
            top = max(0, min(h - side, round((h - side) * 0.28)))
            left = (w - side) // 2
            im = im.crop((left, top, left + side, top + side))
            im.resize((TOKEN_SIZE, TOKEN_SIZE), Image.LANCZOS).save(out, "WEBP", quality=80, method=6)
        written += 1
    if seen != manifest:
        TOKEN_DIR.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(json.dumps(seen, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return written


def generate() -> int:
    if not TEMPLATE_PATH.exists():
        print(f"ERROR: template not found at {TEMPLATE_PATH}", file=sys.stderr)
        return 1
    if not COMMANDERS_JSON.exists():
        print(f"ERROR: commanders.json not found at {COMMANDERS_JSON}", file=sys.stderr)
        return 1

    template = TEMPLATE_PATH.read_text(encoding="utf-8")
    if not META_BLOCK_RE.search(template):
        print(
            f"ERROR: template {TEMPLATE_PATH} is missing GEN:META sentinels. "
            "Restore `<!-- GEN:META:BEGIN -->` and `<!-- GEN:META:END -->` around the "
            "meta/title/favicon block so the generator knows what to replace.",
            file=sys.stderr,
        )
        return 1

    commanders = json.loads(COMMANDERS_JSON.read_text(encoding="utf-8"))
    seen_slugs: dict[str, str] = {}
    generated: list[str] = []

    for cmd in commanders:
        name = cmd["name"]
        slug = slugify(name)
        if slug in seen_slugs:
            print(
                f"ERROR: slug collision — '{name}' and '{seen_slugs[slug]}' both "
                f"slugify to '{slug}'. Resolve by picking distinct commander names.",
                file=sys.stderr,
            )
            return 1
        seen_slugs[slug] = name

        out_path = OUTPUT_DIR / slug / "index.html"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        rendered = META_BLOCK_RE.sub(meta_block(cmd), template, count=1)
        rendered = sync_chrome.apply_chrome(rendered, f"decks/{slug}/index.html")
        out_path.write_text(rendered, encoding="utf-8")
        generated.append(slug)

    tokens = build_token_portraits(commanders)
    if tokens:
        print(f"Wrote {tokens} commander token portrait(s) to {TOKEN_DIR.relative_to(REPO_ROOT)}/")
    print(f"Generated {len(generated)} deck pages under {OUTPUT_DIR.relative_to(REPO_ROOT)}/")
    for slug in generated:
        print(f"  decks/{slug}/")
    return 0


if __name__ == "__main__":
    sys.exit(generate())
