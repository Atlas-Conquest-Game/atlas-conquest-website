"""Generate the two diagrams embedded in articles/conquest-format.md.

Outputs (committed to the repo, so nothing here runs in CI):
  articles/images/conquest-format/conquest-rules.png    — the format's rules
  articles/images/conquest-format/conquest-example.png  — the worked example round

Both are drawn at 2× the logical layout so they stay sharp on retina displays;
`articles.css` renders them at ~1160 CSS px via the `.wide` figure class.

Samples real game assets so the diagrams stay in sync with the game's look:
  - commander portraits — site/assets/commanders/<slug>.jpg
  - the Atlas Conquest logo — site/assets/logo/atlas-conquest-icon.png
  - hex map tiles — the "Hex Rivers Coasts Seas" plugin in the *Unity* repo

EXTERNAL DEPENDENCY: the hex tiles live in the atlas-conquest Unity project,
which is a sibling checkout, not part of this repo. This script therefore does
NOT run in CI and is not wired into the article build — the generated PNGs are
committed instead. Point --tiles at the plugin's "Tile Samples" folder if your
Unity checkout lives elsewhere.

Palette and typography follow docs/DESIGN.md (Inter, dark editorial base,
Okabe-Ito faction accents).

Run standalone (after editing wording, lineups, or the example round):
    python scripts/generate_conquest_diagrams.py
    python scripts/generate_conquest_diagrams.py --tiles "D:/path/to/Tile Samples"
    python scripts/build_articles.py          # re-copies the PNGs into site/
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# ─── Paths ──────────────────────────────────────────────────

REPO_ROOT = Path(__file__).resolve().parent.parent
SITE_DIR = REPO_ROOT / "site"
COMMANDER_ART = SITE_DIR / "assets" / "commanders"
LOGO_PNG = SITE_DIR / "assets" / "logo" / "atlas-conquest-icon.png"
FONT_PATH = REPO_ROOT / "scripts" / "assets" / "fonts" / "Inter-Variable.ttf"
OUT_DIR = REPO_ROOT / "articles" / "images" / "conquest-format"

# Sibling Unity checkout — override with --tiles.
DEFAULT_TILES = (
    REPO_ROOT.parent / "atlas-conquest" / "atlas-conquest" / "Assets" / "Plugins"
    / "Hex Rivers Coasts Seas" / "Tile Samples"
)

# ─── DESIGN.md tokens ───────────────────────────────────────

BG          = "#0e1117"
BG_SUBTLE   = "#161b22"
BG_CARD     = "#1c2128"
BG_ELEVATED = "#21262d"
TEXT        = "#e6edf3"
TEXT_SEC    = "#8b949e"
TEXT_MUTED  = "#484f58"
BORDER      = "#30363d"
BORDER_SUB  = "#21262d"
POSITIVE    = "#3fb950"
NEGATIVE    = "#f85149"
BLUE        = "#58a6ff"
WIN_BG      = "#132b1a"   # positive chip fill
FINAL_BG    = "#12211a"   # winning row fill
FINAL_EDGE  = "#1f4429"

FACTION = {
    "skaal": "#D55E00", "grenalia": "#009E73", "lucia": "#E8B630",
    "neutral": "#A89078", "shadis": "#7B7B8E", "archaeon": "#0072B2",
}

SS = 3         # supersample factor while drawing (downsampled for clean edges)
OUT_SCALE = 2  # final asset is 2× the logical layout

# ─── Content ────────────────────────────────────────────────

# key → (portrait file, faction, archetype). Keys are the short names used in
# the article prose.
COMMANDERS = {
    "Jagris":  ("jagris-the-huntsman.jpg", "grenalia", "Beast Midrange"),
    "Elyse":   ("elyse-of-the-order.jpg",  "lucia",    "Human Tokens"),
    "Viessa":  ("soultaker-viessa.jpg",    "shadis",   "Sacrifice"),
    "Rosirix": ("rosirix-the-witch.jpg",   "archaeon", "Spellcaster Aggro"),
    "Macks":   ("macks-speed.jpg",         "skaal",    "Lightning Aggro"),
    "Lazim":   ("lazim-thief-of-gods.jpg", "neutral",  "Chant Ramp"),
}

# map name → tile PNG, relative to the Tile Samples root.
MAP_TILES = {
    "Dunes":    "Base Terrain/hexDesertDunes00.png",
    "Snowmelt": "Cold Terrain/hexSnowField00.png",
    "Tropics":  "Base Terrain/hexForestBroadleaf00.png",
}

# The example round, game by game. Mirrors the walkthrough in the article body —
# keep the two in sync.
GAMES = [
    dict(n=1, map="Dunes", ana="Jagris", ben="Macks", win="Ana", retire="Jagris", score="1 – 0",
         note="Both lock in blind. Ana, the higher seed, picks the map and goes first."),
    dict(n=2, map="Snowmelt", ana="Viessa", ben="Rosirix", win="Ben", retire="Rosirix", score="1 – 1",
         note="Ana won, so she announces Viessa first. Ben counter-picks, takes the map and goes first."),
    dict(n=3, map="Dunes", ana="Elyse", ben="Lazim", win="Ana", retire="Elyse", score="2 – 1",
         note="Ben announces Lazim first. Ana counter-picks Elyse and returns to Dunes — legal, it wasn't the last map."),
    dict(n=4, map="Snowmelt", ana="Viessa", ben="Macks", win="Ben", retire="Macks", score="2 – 2",
         note="Ana has one deck left, so her announcement is a formality. Ben counter-picks and chooses."),
    dict(n=5, map="Tropics", ana="Viessa", ben="Lazim", win="Ana", retire="Viessa", score="3 – 2",
         note="One deck each — nothing left to choose but Ana's map and turn order."),
]

TILES_DIR = DEFAULT_TILES  # rebound in main()


# ─── Asset loaders ──────────────────────────────────────────

def font(weight: str, size: int) -> ImageFont.FreeTypeFont:
    """Inter at a named variation — 'Regular' | 'Medium' | 'SemiBold' | 'Bold'."""
    f = ImageFont.truetype(str(FONT_PATH), size=size)
    f.set_variation_by_name(weight)
    return f


_portrait_cache: dict = {}

def portrait(key: str, size: int, ring: int = 3) -> Image.Image:
    """Circular commander portrait with a faction-colored ring."""
    ck = (key, size, ring)
    if ck in _portrait_cache:
        return _portrait_cache[ck]
    fname, fac, _ = COMMANDERS[key]
    im = Image.open(COMMANDER_ART / fname).convert("RGB")
    r = size * 4  # oversample the mask, then shrink — cheap anti-aliased circle
    im = im.resize((r, r), Image.LANCZOS)
    mask = Image.new("L", (r, r), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, r - 1, r - 1), fill=255)
    out = Image.new("RGBA", (r, r), (0, 0, 0, 0))
    out.paste(im, (0, 0), mask)
    ImageDraw.Draw(out).ellipse(
        (ring * 2, ring * 2, r - 1 - ring * 2, r - 1 - ring * 2),
        outline=FACTION[fac], width=ring * 4,
    )
    out = out.resize((size, size), Image.LANCZOS)
    _portrait_cache[ck] = out
    return out


_tile_cache: dict = {}

def hex_tile(name: str, height: int) -> Image.Image:
    """Hex map tile, cropped to its alpha bounds and scaled to `height`."""
    if (name, height) in _tile_cache:
        return _tile_cache[(name, height)]
    im = Image.open(TILES_DIR / MAP_TILES[name]).convert("RGBA")
    im = im.crop(im.getbbox())
    im = im.resize((round(im.width * height / im.height), height), Image.LANCZOS)
    _tile_cache[(name, height)] = im
    return im


def logo(size: int) -> Image.Image:
    return Image.open(LOGO_PNG).convert("RGBA").resize((size, size), Image.LANCZOS)


# ─── Draw helpers ───────────────────────────────────────────

def panel(d, box, fill=BG_CARD, outline=BORDER, radius=12, width=1):
    d.rounded_rectangle(box, radius=radius * SS, fill=fill, outline=outline, width=width * SS)


def text(d, xy, s, f, fill=TEXT, anchor="la"):
    d.text(xy, s, font=f, fill=fill, anchor=anchor)


def tracked(d, xy, s, f, fill=TEXT_SEC, track=1.6, anchor="la"):
    """Uppercase tracked label — DESIGN.md's small/stat label treatment."""
    s = s.upper()
    track *= SS
    total = sum(d.textlength(c, font=f) + track for c in s) - track
    x, y = xy
    if anchor[0] == "m":
        x -= total / 2
    elif anchor[0] == "r":
        x -= total
    for c in s:
        d.text((x, y), c, font=f, fill=fill, anchor="l" + anchor[1])
        x += d.textlength(c, font=f) + track
    return total


def chip(d, xy, label, f, fg, bg, pad=(10, 5), radius=6, anchor="la"):
    """Small pill badge. Returns (w, h)."""
    pw, ph = pad[0] * SS, pad[1] * SS
    w, h = d.textlength(label, font=f) + pw * 2, f.size + ph * 2
    x, y = xy
    if anchor[0] == "m":
        x -= w / 2
    elif anchor[0] == "r":
        x -= w
    d.rounded_rectangle((x, y, x + w, y + h), radius=radius * SS, fill=bg)
    d.text((x + w / 2, y + h / 2), label, font=f, fill=fg, anchor="mm")
    return w, h


def check(d, x, y, s, color=POSITIVE, w=2):
    """Hand-drawn checkmark — Inter has no U+2713 glyph."""
    d.line([(x + s * 0.12, y + s * 0.52), (x + s * 0.38, y + s * 0.80), (x + s * 0.90, y + s * 0.16)],
           fill=color, width=w * SS, joint="curve")


def arrow(d, x1, y, x2, color=TEXT_MUTED, w=2, head=6):
    d.line((x1, y, x2 - head * SS, y), fill=color, width=w * SS)
    h = head * SS
    d.polygon([(x2, y), (x2 - h, y - h * 0.62), (x2 - h, y + h * 0.62)], fill=color)


def canvas(w, h):
    im = Image.new("RGB", (w * SS, h * SS), BG)
    return im, ImageDraw.Draw(im)


def save(im, name):
    im = im.resize((im.width * OUT_SCALE // SS, im.height * OUT_SCALE // SS), Image.LANCZOS)
    im.save(OUT_DIR / name, optimize=True)
    print(f"  {name}  {im.width}x{im.height}  ({(OUT_DIR / name).stat().st_size / 1024:.0f} KB)")


def header(d, im, w, title, subtitle):
    lg = logo(52 * SS)
    im.paste(lg, (32 * SS, 26 * SS), lg)
    text(d, (98 * SS, 32 * SS), title, font("Bold", 30 * SS), TEXT)
    text(d, (99 * SS, 68 * SS), subtitle, font("Regular", 15 * SS), TEXT_SEC)
    d.line((32 * SS, 104 * SS, (w - 32) * SS, 104 * SS), fill=BORDER, width=1 * SS)


# ════════════════════════════════════════════════════════════
# Diagram 1 — the rules
# ════════════════════════════════════════════════════════════

def diagram_rules():
    W, H = 1240, 924
    # Vertical rhythm (logical px): row1 124..320 | row2 336..556 | row3 572..892
    im, d = canvas(W, H)
    header(d, im, W, "The Conquest Format", "Atlas Conquest League · Top 8 · win with all three decks")

    M = 32 * SS
    IW = (W - 64) * SS
    f_num = font("Bold", 13 * SS)
    f_head = font("Bold", 17 * SS)
    f_body = font("Regular", 14 * SS)
    f_small = font("Regular", 12 * SS)
    f_name = font("SemiBold", 13 * SS)
    f_sub = font("Regular", 11 * SS)
    f_lbl = font("Bold", 10 * SS)

    def section(box, num, title):
        panel(d, box)
        x, y = box[0] + 20 * SS, box[1] + 16 * SS
        w = chip(d, (x, y - 2 * SS), num, f_num, BG, BLUE, pad=(7, 3))[0]
        text(d, (x + w + 10 * SS, y - 1 * SS), title, f_head, TEXT)
        return x, y + 32 * SS

    # ── 1 · Three decks ──
    b = (M, 124 * SS, M + IW, 320 * SS)
    x, y = section(b, "1", "Bring three decks")
    text(d, (x, y), "Three decks, each led by a different commander. You cannot bring two decks with the same commander.",
         f_body, TEXT_SEC)
    text(d, (x, y + 22 * SS), "Your lineup is locked for the entire Top 8 — no swaps between rounds.", f_body, TEXT_SEC)

    # Name/faction sit beside each portrait (not below) so nothing collides with
    # the panel edge, and it matches the lineup strip in the example diagram.
    px = x + 4 * SS
    for key in ("Jagris", "Elyse", "Viessa"):
        p = portrait(key, 62 * SS)
        im.paste(p, (px, y + 50 * SS), p)
        fac, arch = COMMANDERS[key][1], COMMANDERS[key][2]
        text(d, (px + 74 * SS, y + 60 * SS), key, f_name, TEXT)
        text(d, (px + 74 * SS, y + 78 * SS), arch, f_sub, TEXT_SEC)
        text(d, (px + 74 * SS, y + 94 * SS), fac.upper(), f_sub, FACTION[fac])
        px += 190 * SS
    check(d, px + 4 * SS, y + 68 * SS, 15 * SS, POSITIVE)
    text(d, (px + 28 * SS, y + 66 * SS), "three different", f_body, POSITIVE)
    text(d, (px + 28 * SS, y + 84 * SS), "commanders", f_body, POSITIVE)

    lx = M + IW - 300 * SS
    panel(d, (lx, y + 44 * SS, M + IW - 20 * SS, y + 128 * SS), fill=BG_ELEVATED, outline=BORDER_SUB)
    tracked(d, (lx + 20 * SS, y + 58 * SS), "Locked", font("Bold", 11 * SS), TEXT_MUTED)
    text(d, (lx + 20 * SS, y + 78 * SS), "Quarterfinal → Semifinal → Final", f_small, TEXT)
    text(d, (lx + 20 * SS, y + 98 * SS), "Same three decks, start to finish.", f_small, TEXT_SEC)

    # ── 2 · Bracket ──
    colw = (IW - 20 * SS) // 2
    b = (M, 336 * SS, M + colw, 556 * SS)
    x, y = section(b, "2", "Seeded single elimination")
    text(d, (x, y), "The Top 8 bracket is seeded by the final", f_body, TEXT_SEC)
    text(d, (x, y + 20 * SS), "League Swiss standings.", f_body, TEXT_SEC)

    by = y + 50 * SS
    tracked(d, (x + 4 * SS, by), "quarterfinals", font("Bold", 9 * SS), TEXT_MUTED)
    for i, (a, bb) in enumerate([("1", "8"), ("2", "7"), ("3", "6"), ("4", "5")]):
        ry = by + 20 * SS + (i // 2) * 34 * SS
        cx = x + 4 * SS + (i % 2) * 168 * SS
        hl = (a, bb) == ("2", "7")  # the example round below
        for s in (a, bb):
            on = hl and s in ("2", "7")
            chip(d, (cx, ry), s, f_lbl, BG if on else TEXT_SEC, BLUE if on else BG_ELEVATED, pad=(9, 4))
            cx += 36 * SS
            if s == a:
                text(d, (cx - 2 * SS, ry + 3 * SS), "vs", f_sub, TEXT_MUTED)
                cx += 22 * SS
        if hl:
            text(d, (cx + 6 * SS, ry + 3 * SS), "← the example below", f_sub, BLUE)
    text(d, (x + 4 * SS, by + 76 * SS), "Higher seed picks the map and turn order in game one.", f_small, TEXT_SEC)

    # ── 3 · Win with all three ──
    b = (M + colw + 20 * SS, 336 * SS, M + IW, 556 * SS)
    x, y = section(b, "3", "Win with all three")
    text(d, (x, y), "After each game the winner retires the deck", f_body, TEXT_SEC)
    text(d, (x, y + 20 * SS), "they just won with — it is gone for the round.", f_body, TEXT_SEC)

    ry = y + 54 * SS
    for i, (key, state) in enumerate((("Jagris", "won"), ("Elyse", "won"), ("Viessa", "live"))):
        cy = ry + i * 34 * SS
        p = portrait(key, 26 * SS, ring=2)
        im.paste(p, (x + 4 * SS, cy), p)
        text(d, (x + 40 * SS, cy + 5 * SS), key, f_name, TEXT if state == "won" else TEXT_SEC)
        if state == "won":
            chip(d, (x + 116 * SS, cy + 2 * SS), "WON · RETIRED", f_lbl, POSITIVE, WIN_BG, pad=(8, 4))
        else:
            chip(d, (x + 116 * SS, cy + 2 * SS), "STILL TO WIN", f_lbl, TEXT_MUTED, BG_ELEVATED, pad=(8, 4))
    arrow(d, x + 254 * SS, ry + 40 * SS, x + 292 * SS)
    text(d, (x + 302 * SS, ry + 18 * SS), "Bank a win with", f_body, TEXT)
    text(d, (x + 302 * SS, ry + 38 * SS), "all three decks", f_body, TEXT)
    text(d, (x + 302 * SS, ry + 58 * SS), "to take the round.", f_body, TEXT)
    text(d, (x + 4 * SS, ry + 100 * SS), "A round runs 3 games minimum, 5 maximum.", f_small, TEXT_SEC)

    # ── 4 · Game one ──
    b = (M, 572 * SS, M + colw, 892 * SS)
    x, y = section(b, "4", "Game one — simultaneous")
    text(d, (x, y), "Both players lock a deck blind — neither knows", f_body, TEXT_SEC)
    text(d, (x, y + 20 * SS), "what the other is bringing.", f_body, TEXT_SEC)

    qy = y + 54 * SS
    for i, side in enumerate(("Higher seed", "Lower seed")):
        cx = x + 4 * SS + i * 150 * SS
        d.rounded_rectangle((cx, qy, cx + 118 * SS, qy + 62 * SS), radius=8 * SS,
                            fill=BG_ELEVATED, outline=BORDER_SUB, width=1 * SS)
        text(d, (cx + 59 * SS, qy + 18 * SS), "?", font("Bold", 24 * SS), TEXT_MUTED, anchor="mm")
        text(d, (cx + 59 * SS, qy + 44 * SS), side, f_sub, TEXT_SEC, anchor="mm")
    text(d, (x + 132 * SS, qy + 24 * SS), "vs", f_small, TEXT_MUTED)

    text(d, (x + 4 * SS, qy + 82 * SS), "The higher seed then chooses:", f_body, TEXT)
    mx = x + 4 * SS
    for name in ("Dunes", "Snowmelt", "Tropics"):
        t = hex_tile(name, 56 * SS)
        im.paste(t, (mx, qy + 104 * SS), t)
        text(d, (mx + t.width // 2, qy + 164 * SS), name, f_sub, TEXT_SEC, anchor="ma")
        mx += t.width + 14 * SS
    text(d, (mx + 8 * SS, qy + 116 * SS), "the map", f_body, BLUE)
    text(d, (mx + 8 * SS, qy + 136 * SS), "+ who goes first", f_body, BLUE)

    # ── 5 · Games 2+ ──
    b = (M + colw + 20 * SS, 572 * SS, M + IW, 892 * SS)
    x, y = section(b, "5", "Games two onward — counter-pick")
    text(d, (x, y), "Losing a game buys you information and choice.", f_body, TEXT_SEC)

    sy = y + 34 * SS
    steps = [
        ("Winner", "announces their commander first", POSITIVE),
        ("Loser", "then picks a commander to face it", NEGATIVE),
        ("Loser", "also picks the map and who goes first", NEGATIVE),
    ]
    for i, (who, what, col) in enumerate(steps):
        cy = sy + i * 40 * SS
        d.ellipse((x + 4 * SS, cy + 4 * SS, x + 20 * SS, cy + 20 * SS), fill=col)
        text(d, (x + 12 * SS, cy + 11 * SS), str(i + 1), font("Bold", 10 * SS), BG, anchor="mm")
        text(d, (x + 32 * SS, cy + 3 * SS), who, f_name, col)
        text(d, (x + 32 + (86 if who == "Winner" else 62) * SS, cy + 4 * SS), what, f_body, TEXT_SEC)

    ny = sy + 120 * SS
    panel(d, (x + 4 * SS, ny, b[2] - 20 * SS, ny + 108 * SS), fill=BG_ELEVATED, outline=BORDER_SUB)
    text(d, (x + 20 * SS, ny + 14 * SS), "The map must differ from the one just played —", f_small, TEXT)
    text(d, (x + 20 * SS, ny + 32 * SS), "but it may come back later in the round.", f_small, TEXT_SEC)
    tx = x + 20 * SS
    for j, name in enumerate(("Dunes", "Snowmelt", "Dunes")):
        t = hex_tile(name, 34 * SS)
        im.paste(t, (tx, ny + 52 * SS), t)
        text(d, (tx + t.width // 2, ny + 88 * SS), name, font("Regular", 9 * SS), TEXT_SEC, anchor="ma")
        tx += t.width + 6 * SS
        if j < 2:
            arrow(d, tx, ny + 68 * SS, tx + 18 * SS, w=1, head=4)
            tx += 26 * SS
    check(d, tx + 10 * SS, ny + 60 * SS, 14 * SS, POSITIVE)
    text(d, (tx + 32 * SS, ny + 59 * SS), "legal", f_small, POSITIVE)

    save(im, "conquest-rules.png")


# ════════════════════════════════════════════════════════════
# Diagram 2 — the example round
# ════════════════════════════════════════════════════════════

def diagram_example():
    W, H = 1240, 1000
    im, d = canvas(W, H)
    header(d, im, W, "An Example Round", "Ana (2nd seed) vs Ben (7th seed) · quarterfinal")

    M = 32 * SS
    IW = (W - 64) * SS
    f_head = font("Bold", 15 * SS)
    f_body = font("Regular", 13 * SS)
    f_small = font("Regular", 11 * SS)
    f_name = font("SemiBold", 13 * SS)
    f_sub = font("Regular", 10 * SS)
    f_lbl = font("Bold", 9 * SS)
    f_game = font("Bold", 12 * SS)

    # ── Lineups ──
    colw = (IW - 20 * SS) // 2
    for i, (who, seed, keys) in enumerate((
        ("Ana", "2nd seed", ("Jagris", "Elyse", "Viessa")),
        ("Ben", "7th seed", ("Rosirix", "Macks", "Lazim")),
    )):
        bx = M + i * (colw + 20 * SS)
        panel(d, (bx, 124 * SS, bx + colw, 268 * SS))
        text(d, (bx + 20 * SS, 140 * SS), who, f_head, TEXT)
        chip(d, (bx + 20 * SS + d.textlength(who, font=f_head) + 10 * SS, 141 * SS), seed.upper(),
             f_lbl, TEXT_SEC, BG_ELEVATED, pad=(7, 3))
        tracked(d, (bx + colw - 20 * SS, 144 * SS), "lineup", font("Bold", 9 * SS), TEXT_MUTED, anchor="ra")
        px = bx + 20 * SS
        for key in keys:
            p = portrait(key, 58 * SS)
            im.paste(p, (px, 168 * SS), p)
            fac, arch = COMMANDERS[key][1], COMMANDERS[key][2]
            text(d, (px + 70 * SS, 178 * SS), key, f_name, TEXT)
            text(d, (px + 70 * SS, 196 * SS), arch, f_sub, TEXT_SEC)
            text(d, (px + 70 * SS, 212 * SS), fac.upper(), f_sub, FACTION[fac])
            px += 175 * SS

    # ── Games ──
    y0 = 288 * SS
    RH = 132 * SS
    for g in GAMES:
        final = g["n"] == len(GAMES)
        panel(d, (M, y0, M + IW, y0 + RH - 12 * SS),
              fill=FINAL_BG if final else BG_SUBTLE,
              outline=FINAL_EDGE if final else BORDER)

        # game number + map
        text(d, (M + 22 * SS, y0 + 18 * SS), f"GAME {g['n']}", f_game, TEXT_SEC)
        t = hex_tile(g["map"], 60 * SS)
        im.paste(t, (M + 20 * SS, y0 + 40 * SS), t)
        text(d, (M + 20 * SS + t.width + 10 * SS, y0 + 58 * SS), g["map"], f_body, TEXT)
        text(d, (M + 20 * SS + t.width + 10 * SS, y0 + 76 * SS), "map", f_sub, TEXT_MUTED)

        # matchup
        mx = M + 200 * SS
        for side, key in (("ana", g["ana"]), ("ben", g["ben"])):
            won = (g["win"] == "Ana") == (side == "ana")
            p = portrait(key, 62 * SS)
            im.paste(p, (mx, y0 + 34 * SS), p)
            text(d, (mx + 74 * SS, y0 + 40 * SS), "Ana" if side == "ana" else "Ben", f_sub, TEXT_MUTED)
            text(d, (mx + 74 * SS, y0 + 56 * SS), key, f_name, TEXT if won else TEXT_SEC)
            if won:
                chip(d, (mx + 74 * SS, y0 + 78 * SS), "WINNER", f_lbl, POSITIVE, WIN_BG, pad=(7, 3))
            else:
                chip(d, (mx + 74 * SS, y0 + 78 * SS), "LOSS", f_lbl, TEXT_MUTED, BG_ELEVATED, pad=(7, 3))
            if side == "ana":
                text(d, (mx + 178 * SS, y0 + 58 * SS), "vs", f_small, TEXT_MUTED)
                mx += 214 * SS

        # retired deck — grayscaled portrait reads as "out of the round"
        rx = M + 700 * SS
        arrow(d, rx - 26 * SS, y0 + 60 * SS, rx - 4 * SS)
        p = portrait(g["retire"], 30 * SS, ring=2)
        gray = p.convert("LA").convert("RGBA")
        gray.putalpha(p.getchannel("A"))
        im.paste(gray, (rx + 8 * SS, y0 + 44 * SS), gray)
        text(d, (rx + 46 * SS, y0 + 40 * SS), f"{g['win']} retires", f_sub, TEXT_MUTED)
        text(d, (rx + 46 * SS, y0 + 56 * SS), g["retire"], f_name, TEXT_SEC)
        chip(d, (rx + 46 * SS, y0 + 78 * SS), "OUT FOR THE ROUND", f_lbl, TEXT_MUTED, BG_ELEVATED, pad=(7, 3))

        # score
        sx = M + IW - 24 * SS
        tracked(d, (sx, y0 + 22 * SS), "Ana – Ben", font("Bold", 9 * SS), TEXT_MUTED, anchor="ra")
        text(d, (sx, y0 + 40 * SS), g["score"], font("Bold", 26 * SS),
             POSITIVE if final else TEXT, anchor="ra")

        d.line((M + 20 * SS, y0 + 96 * SS, M + IW - 20 * SS, y0 + 96 * SS), fill=BORDER_SUB, width=1 * SS)
        text(d, (M + 20 * SS, y0 + 102 * SS), g["note"], f_small, TEXT_SEC)
        y0 += RH

    ry = y0 + 2 * SS
    text(d, (M + 20 * SS, ry),
         "Ana has won a game with all three of her decks — she takes the round 3–2 and advances", f_body, TEXT)
    text(d, (M + 20 * SS, ry + 20 * SS),
         "to the semifinal with the same three decks. Nothing is ever swapped.", f_body, TEXT_SEC)

    save(im, "conquest-example.png")


# ─── Entry point ────────────────────────────────────────────

def main(argv: list[str] | None = None) -> int:
    global TILES_DIR
    p = argparse.ArgumentParser(description="Generate the Conquest format article diagrams.")
    p.add_argument("--tiles", type=Path, default=DEFAULT_TILES,
                   help='Path to the Unity plugin\'s "Tile Samples" folder '
                        f"(default: {DEFAULT_TILES})")
    args = p.parse_args(argv)
    TILES_DIR = args.tiles

    if not FONT_PATH.exists():
        print(f"ERROR: font not found at {FONT_PATH}", file=sys.stderr)
        return 1
    missing = [n for n, rel in MAP_TILES.items() if not (TILES_DIR / rel).exists()]
    if missing:
        print(f"ERROR: hex tiles not found under {TILES_DIR}", file=sys.stderr)
        print(f"       missing maps: {', '.join(missing)}", file=sys.stderr)
        print("       These live in the atlas-conquest Unity repo, not this one.", file=sys.stderr)
        print("       Pass --tiles <path> if your checkout is elsewhere.", file=sys.stderr)
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    diagram_rules()
    diagram_example()
    print(f"Generated 2 diagrams -> {OUT_DIR.relative_to(REPO_ROOT)}/")
    print("Run scripts/build_articles.py to copy them into site/.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
