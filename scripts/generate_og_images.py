"""Generate 1200×630 Open Graph unfurl images per commander.

Discord, Slack, iMessage, Twitter etc. render the URL in `og:image` as the
preview banner. Raw commander art is 400×400 JPG — fine but square and small
in most unfurlers. This script produces a per-commander 1200×630 PNG with:
  - full-bleed commander art on the left (feathered fade to dark on the right)
  - Atlas Conquest brand line, commander name, faction label stacked right
  - small accent bar in the faction color

Outputs land at site/assets/og/<slug>.png and are referenced by the meta tags
produced by scripts/generate_deck_pages.py — run that script AFTER this one so
the HTML points at the freshly-generated image.

Why not per-deck: deck names are encoded inside the opaque deck-code query
string. GitHub Pages is static, so the HTML for /decks/<slug>/?code=X and
.../?code=Y is identical — we can't bake the deck name into the preview.
Commander-level identity is the lowest granularity we can achieve statically.

Fonts: Inter variable TTF bundled under scripts/assets/fonts/.
Deps: Pillow (already in scripts/requirements.txt).

Run standalone:
    python scripts/generate_og_images.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# ─── Paths ──────────────────────────────────────────────────

REPO_ROOT = Path(__file__).resolve().parent.parent
SITE_DIR = REPO_ROOT / "site"
COMMANDERS_JSON = SITE_DIR / "data" / "commanders.json"
OUT_DIR = SITE_DIR / "assets" / "og"
FONT_PATH = REPO_ROOT / "scripts" / "assets" / "fonts" / "Inter-Variable.ttf"
FACTION_EMBLEM_DIR = SITE_DIR / "assets" / "factions"

# ─── Canvas constants ───────────────────────────────────────

W, H = 1200, 630
BG = (13, 17, 23)            # #0d1117 — matches site background
FG = (230, 237, 243)         # #e6edf3 — primary text
MUTED = (139, 148, 158)      # #8b949e — secondary text

# Layout — left panel holds the art, right panel holds name + faction crest.
# No top/bottom brand text: the commander art and the faction emblem do all the
# identity lifting. "COMMANDER DECK" was MTG-coded filler anyway.
ART_W = 630                  # art fills a 630×630 square on the left
FADE_START = 380             # where the dark gradient overlay begins
FADE_END = 720               # where it becomes fully opaque (covers art edge)
TEXT_X = 740                 # text column x-start (past the fade)
TEXT_RIGHT_MARGIN = 60
TEXT_AVAIL = W - TEXT_X - TEXT_RIGHT_MARGIN
EMBLEM_SIZE = 96             # faction emblem rendered at this px — 200×200 source

# ─── Faction palette (matches site/js/shared.js FACTION_COLORS / LABELS) ──

FACTION_COLORS = {
    "skaal":    (213,  94,   0),   # #D55E00
    "grenalia": (  0, 158, 115),   # #009E73
    "lucia":    (232, 182,  48),   # #E8B630
    "neutral":  (168, 144, 120),   # #A89078
    "shadis":   (123, 123, 142),   # #7B7B8E
    "archaeon": (  0, 114, 178),   # #0072B2
}
FACTION_LABELS = {k: k.upper() for k in FACTION_COLORS}

# ─── Helpers ────────────────────────────────────────────────


def slugify(name: str) -> str:
    """Must match site/js/shared.js commanderSlug() and scripts/generate_deck_pages.py slugify()."""
    return re.sub(r"\s+", "-", re.sub(r"[,']", "", name.lower()).strip())


def _font(size: int, weight: str) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(str(FONT_PATH), size=size)
    f.set_variation_by_name(weight)
    return f


def _fit_name(
    name: str,
    weight: str,
    max_width: int,
    start_size: int = 64,
    min_size: int = 40,
    step: int = 4,
) -> tuple[list[str], ImageFont.FreeTypeFont]:
    """Choose a font size and line break that fits `name` into `max_width`.

    Strategy: shrink the font by `step` until either the single-line render fits,
    or a two-line wrap fits. Commander names with a comma wrap at the comma
    (reads naturally); otherwise wrap at the space nearest the midpoint. Falls
    back to `min_size` on a single line if nothing else fits — better to clip a
    character than produce ugly three-line stacks.
    """
    words = name.split()

    def try_fit(font: ImageFont.FreeTypeFont) -> list[str] | None:
        if font.getlength(name) <= max_width:
            return [name]
        if "," in name:
            head, tail = name.split(",", 1)
            lines = [head + ",", tail.strip()]
            if all(font.getlength(ln) <= max_width for ln in lines):
                return lines
        if len(words) >= 2:
            # pick the split point that balances line widths best
            best: tuple[float, list[str]] | None = None
            for i in range(1, len(words)):
                a, b = " ".join(words[:i]), " ".join(words[i:])
                wa, wb = font.getlength(a), font.getlength(b)
                if wa <= max_width and wb <= max_width:
                    score = abs(wa - wb)
                    if best is None or score < best[0]:
                        best = (score, [a, b])
            if best:
                return best[1]
        return None

    for size in range(start_size, min_size - 1, -step):
        font = _font(size, weight)
        lines = try_fit(font)
        if lines:
            return lines, font
    return [name], _font(min_size, weight)


def _letterspace(draw: ImageDraw.ImageDraw, xy, text, font, fill, spacing: int) -> None:
    """Render text with extra pixel spacing between characters — PIL has no
    native letter-spacing. Used for the small uppercase brand/tag lines."""
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += font.getlength(ch) + spacing


# ─── Compositing ────────────────────────────────────────────


def _build_fade_overlay() -> Image.Image:
    """RGBA strip that fades transparent→BG across FADE_START..FADE_END.

    Applied once over the art so the art bleeds into the text panel instead of
    ending at a hard edge. Ease curve (x**1.35) keeps the art visible longer
    before the gradient ramps up.
    """
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    px = overlay.load()
    span = FADE_END - FADE_START
    for x in range(FADE_START, W):
        if x >= FADE_END:
            alpha = 255
        else:
            t = (x - FADE_START) / span
            alpha = int(255 * (t ** 1.35))
        for y in range(H):
            px[x, y] = (*BG, alpha)
    return overlay


def _paste_art(canvas: Image.Image, art_path: Path) -> None:
    art = Image.open(art_path).convert("RGB")
    # Resize to ART_W × ART_W (square, covers full height on the left).
    # Input is 400×400 — upscale with LANCZOS.
    art = art.resize((ART_W, H), Image.LANCZOS)
    canvas.paste(art, (0, 0))


def _load_emblem(faction: str) -> Image.Image | None:
    """Load the faction emblem as a 96×96 RGBA — already color/stylised in the
    source art so we do not tint or recolor it. Returns None and the render
    falls back to a text-only badge if the emblem is missing for this faction."""
    path = FACTION_EMBLEM_DIR / f"{faction}.png"
    if not path.exists():
        return None
    img = Image.open(path).convert("RGBA")
    return img.resize((EMBLEM_SIZE, EMBLEM_SIZE), Image.LANCZOS)


def render_og(commander: dict, fade_overlay: Image.Image, out_path: Path) -> None:
    name = commander["name"]
    faction = commander.get("faction", "neutral")
    faction_color = FACTION_COLORS.get(faction, FG)
    faction_label = FACTION_LABELS.get(faction, faction.upper())
    slug = slugify(name)
    art_path = SITE_DIR / (commander.get("art") or f"assets/commanders/{slug}.jpg")

    canvas = Image.new("RGB", (W, H), BG)
    _paste_art(canvas, art_path)
    canvas.paste(fade_overlay, (0, 0), fade_overlay)

    draw = ImageDraw.Draw(canvas)

    # Commander name — auto-sized/wrapped, takes the visual weight of the right
    # panel. Anchored toward the top-middle so the emblem+label row sits below
    # with breathing room. Without top/bottom brand text there's plenty of space.
    name_lines, name_font = _fit_name(name, "Bold", TEXT_AVAIL)
    line_h = name_font.size + 10
    name_block_h = line_h * len(name_lines)
    name_top = 170  # anchored high; tuned for 1-line and 2-line cases to both look balanced
    if len(name_lines) == 1:
        name_top = 215  # single-line names read better slightly lower
    for i, line in enumerate(name_lines):
        draw.text((TEXT_X, name_top + i * line_h), line, fill=FG, font=name_font)

    # Faction crest row: emblem on the left, accent bar + label stacked to its
    # right. Reads like a heraldic badge — the emblem is already the strongest
    # identity marker the game uses, so we let it headline.
    crest_y = name_top + name_block_h + 48
    emblem = _load_emblem(faction)
    label_font = _font(30, "SemiBold")
    bar_x = TEXT_X
    if emblem is not None:
        canvas.paste(emblem, (TEXT_X, crest_y), emblem)
        bar_x = TEXT_X + EMBLEM_SIZE + 24
    # Accent bar positioned to align with the upper third of the emblem
    bar_y = crest_y + 18
    draw.rectangle([(bar_x, bar_y), (bar_x + 40, bar_y + 4)], fill=faction_color)
    # Faction label sits under the accent bar, vertically centered against the emblem
    draw.text((bar_x, bar_y + 20), faction_label, fill=faction_color, font=label_font)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    # JPEG at q=92 keeps text crisp enough while cutting filesize ~4-6× vs PNG
    # on photographic content. Discord/Slack/iMessage all render JPG OG images.
    canvas.save(out_path, "JPEG", quality=92, optimize=True, progressive=True)


# ─── Entry point ────────────────────────────────────────────


def generate() -> int:
    if not FONT_PATH.exists():
        print(f"ERROR: font not found at {FONT_PATH}", file=sys.stderr)
        return 1
    if not COMMANDERS_JSON.exists():
        print(f"ERROR: commanders.json not found at {COMMANDERS_JSON}", file=sys.stderr)
        return 1

    commanders = json.loads(COMMANDERS_JSON.read_text(encoding="utf-8"))
    fade_overlay = _build_fade_overlay()

    for cmd in commanders:
        slug = slugify(cmd["name"])
        out_path = OUT_DIR / f"{slug}.jpg"
        render_og(cmd, fade_overlay, out_path)

    print(f"Generated {len(commanders)} OG images under {OUT_DIR.relative_to(REPO_ROOT)}/")
    return 0


if __name__ == "__main__":
    sys.exit(generate())
