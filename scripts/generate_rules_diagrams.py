"""Generate the diagrams embedded in articles/detailed-rules.md.

Outputs (committed to the repo, so nothing here runs in CI):
  articles/images/detailed-rules/card-anatomy.png       — anatomy of a minion and a spell
  articles/images/detailed-rules/commander-anatomy.png  — anatomy of a commander

Shares the look of generate_conquest_diagrams.py (DESIGN.md tokens, Inter,
dark panels) and reuses its draw helpers. Drawn at 2× the logical layout;
`articles.css` renders it via the `.wide` figure class.

Samples real game assets:
  - card renders — CardScreenshots/<Name>.png
  - stat icons   — site/assets/icons/text/<stat>.png (same glyphs as {power} etc.)

Run standalone, then rebuild the articles:
    python scripts/generate_rules_diagrams.py
    python scripts/build_articles.py
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

from generate_conquest_diagrams import (
    BG_CARD, BLUE, BORDER, FONT_PATH, REPO_ROOT, SS, OUT_SCALE, TEXT, TEXT_MUTED,
    TEXT_SEC, canvas, font, header, panel, text, tracked,
)

CARD_ART = REPO_ROOT / "CardScreenshots"
ICONS = REPO_ROOT / "site" / "assets" / "icons" / "text"
OUT_DIR = REPO_ROOT / "articles" / "images" / "detailed-rules"

LINE = "#6e7681"   # leader lines — quieter than TEXT_SEC, louder than TEXT_MUTED


# ─── Helpers ────────────────────────────────────────────────

def save(im, name):
    im = im.resize((im.width * OUT_SCALE // SS, im.height * OUT_SCALE // SS), Image.LANCZOS)
    im.save(OUT_DIR / name, optimize=True)
    print(f"  {name}  {im.width}x{im.height}  ({(OUT_DIR / name).stat().st_size / 1024:.0f} KB)")


class Card:
    """A card render pasted onto the canvas, cropped to its alpha bounds.

    `at(x, y)` maps a point in the source screenshot (800×1120) to canvas
    pixels, so callouts can be written against the untouched art.
    """

    def __init__(self, im, name, x, y, height):
        src = Image.open(CARD_ART / f"{name}.png").convert("RGBA")
        self.crop = src.getbbox()
        src = src.crop(self.crop)
        self.k = height * SS / src.height
        self.x, self.y = x * SS, y * SS
        art = src.resize((round(src.width * self.k), height * SS), Image.LANCZOS)
        self.w, self.h = art.width, art.height
        im.paste(art, (self.x, self.y), art)

    def at(self, sx, sy):
        return (self.x + (sx - self.crop[0]) * self.k, self.y + (sy - self.crop[1]) * self.k)


def icon(name, height):
    im = Image.open(ICONS / f"{name}.png").convert("RGBA")
    im = im.crop(im.getbbox())
    return im.resize((round(im.width * height / im.height), height), Image.LANCZOS)


def dot(d, xy, r=5):
    x, y = xy
    d.ellipse((x - (r + 2) * SS, y - (r + 2) * SS, x + (r + 2) * SS, y + (r + 2) * SS), fill=BG_CARD)
    d.ellipse((x - r * SS, y - r * SS, x + r * SS, y + r * SS), fill=BLUE)


def leader(d, a, b):
    d.line((a, b), fill=LINE, width=int(1.5 * SS))


# ════════════════════════════════════════════════════════════
# Card anatomy
# ════════════════════════════════════════════════════════════

# Callouts shared by both cards: (title, description, y in the source art,
# minion target x, spell target x). A None x means that card has no such part.
SHARED = [
    ("Mana Cost",    "Mana spent to play the card",       100, 452, 348),
    ("Patron Color", "Matches your commander, or neutral", 340, 752, 48),
    ("Name",         None,                                 645, 752, 70),
    ("Text",         "What it does — hover for keywords", 790, 648, 152),
    ("Subtype",      "Tribe tag other cards can refer to", 908, 466, None),
]

# Minion stats: (icon, label, description, source x, source y of icon bottom)
STATS = [
    ("power",  "Power",  "Damage it deals",       215, 1066),
    ("speed",  "Speed",  "Tiles it moves a turn", 405, 1078),
    ("health", "Health", "Damage it can take",    592, 1066),
]


def diagram_cards():
    W, H = 1240, 920
    im, d = canvas(W, H)
    header(d, im, W, "Anatomy of a Card",
           "Every card has a cost, a name and a text box. Minions add the stats they fight with.")

    panel(d, (32 * SS, 128 * SS, (W - 32) * SS, (H - 32) * SS))

    CARD_H, TOP = 560, 204
    card_w = round(CARD_H * 795 / 1047)          # Prideplain crop aspect
    minion = Card(im, "Prideplain-Enforcer", 80, TOP, CARD_H)
    spell = Card(im, "Ponder", W - 80 - card_w, TOP, CARD_H)

    f_kind = font("SemiBold", 13 * SS)
    tracked(d, (minion.x + minion.w / 2, 164 * SS), "Minion", f_kind, TEXT_SEC, anchor="mm")
    tracked(d, (spell.x + spell.w / 2, 164 * SS), "Spell", f_kind, TEXT_SEC, anchor="mm")

    # ── Shared callouts in the centre column ──
    f_title, f_desc = font("SemiBold", 17 * SS), font("Regular", 13 * SS)
    cx = W / 2 * SS
    col = 132 * SS                                 # half-width of the label column
    for title, desc, sy, mx, px in SHARED:
        y = minion.at(0, sy)[1]
        ty = y if desc is None else y - 9 * SS
        text(d, (cx, ty), title, f_title, TEXT, anchor="mm")
        if desc:
            wrap(d, (cx, y + 11 * SS), desc, f_desc, 2 * col - 12 * SS)
        tw = d.textlength(title, font=f_title) / 2 + 14 * SS
        if mx is not None:
            a = minion.at(mx, sy)
            leader(d, a, (cx - tw, ty))
            dot(d, a)
        if px is not None:
            a = spell.at(px, sy)
            leader(d, (cx + tw, ty), a)
            dot(d, a)

    # ── Minion stats, fanned out beneath the card ──
    ly = (TOP + CARD_H + 40) * SS
    f_stat, f_desc = font("SemiBold", 16 * SS), font("Regular", 13 * SS)
    stat_fan(d, im, minion, STATS, ly, 136)

    # ── Spell footnote ──
    text(d, (spell.x + spell.w / 2, ly + 11 * SS), "No stats", f_stat, TEXT_SEC, anchor="mm")
    text(d, (spell.x + spell.w / 2, ly + 38 * SS), "Spells have no Power, Speed or Health",
         f_desc, TEXT_SEC, anchor="mm")

    save(im, "card-anatomy.png")


def stat_fan(d, im, card, stats, ly, spread, max_w=None):
    """Stat labels in a row beneath `card`, each with a leader to its icon."""
    mid = card.x + card.w / 2
    spread *= SS
    f_stat, f_desc = font("SemiBold", 16 * SS), font("Regular", 13 * SS)
    for i, (ic, label, desc, sx, sy) in enumerate(stats):
        lx = mid + (i - (len(stats) - 1) / 2) * spread
        a = card.at(sx, sy)
        leader(d, a, (lx, ly - 6 * SS))
        dot(d, a, r=4)
        glyph = icon(ic, 22 * SS)
        lw = glyph.width + 6 * SS + d.textlength(label, font=f_stat)
        gx = int(lx - lw / 2)
        im.paste(glyph, (gx, int(ly)), glyph)
        text(d, (gx + glyph.width + 6 * SS, ly + 11 * SS), label, f_stat, TEXT, anchor="lm")
        wrap(d, (lx, ly + 38 * SS), desc, f_desc, max_w or spread - 12 * SS)


def callout(d, card, sx, sy, lx, title, desc, align="l", max_w=250):
    """Side label at column `lx` (canvas px, logical), led to point (sx, sy) of the art.

    align "l": label sits right of the card, text flows rightward from lx.
    align "r": label sits left of the card, text right-aligned to lx.
    """
    f_title, f_desc = font("SemiBold", 17 * SS), font("Regular", 13 * SS)
    a = card.at(sx, sy)
    x, y = lx * SS, a[1]
    ty = y if desc is None else y - 9 * SS
    text(d, (x, ty), title, f_title, TEXT, anchor=align + "m")
    if desc:
        wrap(d, (x, y + 11 * SS), desc, f_desc, max_w * SS, align=align)
    gap = 14 * SS
    leader(d, a, (x - gap if align == "l" else x + gap, ty))
    dot(d, a)


def wrap(d, xy, s, f, max_w, fill=TEXT_SEC, lh=1.35, align="m"):
    """Word wrap, first line at xy. `align` is the horizontal anchor: l | m | r."""
    lines, cur = [], ""
    for word in s.split():
        trial = f"{cur} {word}".strip()
        if cur and d.textlength(trial, font=f) > max_w:
            lines.append(cur)
            cur = word
        else:
            cur = trial
    lines.append(cur)
    x, y = xy
    for i, ln in enumerate(lines):
        text(d, (x, y + i * f.size * lh), ln, f, fill, anchor=align + "m")


# ════════════════════════════════════════════════════════════
# Commander anatomy
# ════════════════════════════════════════════════════════════

# (source x, source y, title, description) — left column is right-aligned.
CMD_LEFT = [
    (400, 112, "No Mana Cost",      "Starts the game on the board"),
    (60,  360, "Patron Color",      "Your deck may only hold this patron's cards, plus neutral ones"),
    (146, 730, "Activated Ability", "Click to use. Cooldown 2: wait 2 turns before using it again"),
]
CMD_RIGHT = [
    (755, 645, "Name",    None),
    (648, 800, "Text",    "Static bonuses and activated abilities"),
    (466, 908, "Subtype", "Tribe tag, same as on minions"),
]
CMD_STATS = [
    ("dominion",  "Dominion",  "Max tiles claimed at once",                     165, 1058),
    ("intellect", "Intellect", "Max hand size and opening-hand choices",        315, 1062),
    ("speed",     "Speed",     "Tiles it moves a turn",                          478, 1066),
    ("health",    "Health",    "At 0 you lose the game",                        640, 1056),
]


def diagram_commander():
    W, H = 1240, 900
    im, d = canvas(W, H)
    header(d, im, W, "Anatomy of a Commander",
           "Your commander leads your deck, fights on the board, and loses you the game if it falls.")

    panel(d, (32 * SS, 128 * SS, (W - 32) * SS, (H - 32) * SS))

    CARD_H, TOP = 560, 172
    card_w = round(CARD_H * 797 / 1044)          # Greenbeard crop aspect
    cx = 560
    cmd = Card(im, "Captain-Greenbeard", cx - card_w // 2, TOP, CARD_H)

    left_x, right_x = cx - card_w // 2 - 36, cx + card_w // 2 + 44
    for sx, sy, title, desc in CMD_LEFT:
        callout(d, cmd, sx, sy, left_x, title, desc, align="r", max_w=210)
    for sx, sy, title, desc in CMD_RIGHT:
        callout(d, cmd, sx, sy, right_x, title, desc, align="l", max_w=250)

    ly = (TOP + CARD_H + 40) * SS
    stat_fan(d, im, cmd, CMD_STATS, ly, 180, max_w=170 * SS)

    # ── Claim: the one ability every commander shares ──
    # Not printed on any card, so it gets its own box, flagged as such.
    bx0, by0, bx1, by1 = right_x, TOP + 8, W - 64, TOP + 176
    panel(d, (bx0 * SS, by0 * SS, bx1 * SS, by1 * SS), fill="#161b22", radius=10)
    d.rounded_rectangle((bx0 * SS, by0 * SS, (bx0 + 4) * SS, by1 * SS), radius=2 * SS, fill=BLUE)
    px = (bx0 + 24) * SS
    tracked(d, (px, (by0 + 26) * SS), "Not printed on the card", font("SemiBold", 11 * SS),
            BLUE, anchor="lm")
    text(d, (px, (by0 + 56) * SS), "Every commander can Claim", font("SemiBold", 17 * SS),
         TEXT, anchor="lm")
    wrap(d, (px, (by0 + 88) * SS),
         "All commanders share this ability. Once per turn, your commander can claim "
         "the tile it is standing on, making it part of your territory. "
         "Claimed tiles give you mana each turn.",
         font("Regular", 13 * SS), (bx1 - bx0 - 48) * SS, align="l")

    save(im, "commander-anatomy.png")


# ─── Entry point ────────────────────────────────────────────

def main() -> int:
    if not FONT_PATH.exists():
        print(f"ERROR: font not found at {FONT_PATH}", file=sys.stderr)
        return 1
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    diagram_cards()
    diagram_commander()
    print("Run scripts/build_articles.py to copy them into site/.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
