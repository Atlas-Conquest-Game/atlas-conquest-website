"""Import the game's inline card-text icons (mana, power, speed, health, …) for articles.

In game, card text writes icons as tokens like {power_3} or {health}, which
Util.ReplaceIconTokens turns into TMP <sprite> tags drawn from the CardTextIcons
sprite asset (baked by IconGlyphGenerator). This script reads that same sprite
asset + sheet from the Unity project, crops every glyph, and writes:

    site/assets/icons/text/<name>.png     one PNG per glyph, ICON_HEIGHT px tall
    site/assets/icons/text/icons.json     {name: {"w", "h", "drop"}} — "drop" is how
                                          far the glyph sits below the text baseline,
                                          as a fraction of its height (from the TMP
                                          glyph bearing, so it matches the game)

build_articles.py renders {power_3}-style tokens in article Markdown from these.
Re-run after regenerating the glyphs in Unity, then rebuild articles:
    python scripts/import_text_icons.py
    python scripts/import_text_icons.py --from-unity "C:/.../atlas-conquest"
"""
import argparse
import json
import re
from pathlib import Path

import yaml
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = REPO_ROOT / "site" / "assets" / "icons" / "text"
MANIFEST = OUT_DIR / "icons.json"

DEFAULT_UNITY_PROJECT = REPO_ROOT.parent.parent / "atlas-conquest" / "atlas-conquest"
SPRITE_ASSET = "Assets/Resources/Fonts/CardTextIcons.asset"
SPRITE_SHEET = "Assets/Resources/Images/Card/Elements/CardTextIcons.png"

# ~3x the rendered size in article prose (1.5em of ~17px), so it stays crisp on HiDPI.
ICON_HEIGHT = 72


def load_sprite_asset(path: Path) -> dict:
    """Return the TMP_SpriteAsset MonoBehaviour from a Unity YAML asset file."""
    text = path.read_text(encoding="utf-8")
    # Unity's YAML uses custom tags/directives PyYAML can't parse; strip them.
    text = re.sub(r"^%.*\n", "", text, flags=re.M)
    text = re.sub(r"^--- !u!.*\n", "---\n", text, flags=re.M)
    for doc in yaml.safe_load_all(text):
        mb = (doc or {}).get("MonoBehaviour") or {}
        if "m_SpriteCharacterTable" in mb:
            return mb
    raise SystemExit(f"No TMP sprite asset found in {path}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--from-unity", type=Path, default=DEFAULT_UNITY_PROJECT,
                        help="Unity project root (contains Assets/)")
    args = parser.parse_args()

    asset = load_sprite_asset(args.from_unity / SPRITE_ASSET)
    sheet = Image.open(args.from_unity / SPRITE_SHEET).convert("RGBA")
    glyphs = {g["m_Index"]: g for g in asset["m_GlyphTable"]}

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for stale in OUT_DIR.glob("*.png"):
        stale.unlink()

    manifest = {}
    for char in asset["m_SpriteCharacterTable"]:
        name = char["m_Name"]
        glyph = glyphs[char["m_GlyphIndex"]]
        rect, metrics = glyph["m_GlyphRect"], glyph["m_Metrics"]
        # Glyph rects are bottom-left origin; PIL is top-left.
        top = sheet.height - (rect["m_Y"] + rect["m_Height"])
        crop = sheet.crop((rect["m_X"], top, rect["m_X"] + rect["m_Width"], top + rect["m_Height"]))
        width = round(crop.width * ICON_HEIGHT / crop.height)
        crop.resize((width, ICON_HEIGHT), Image.LANCZOS).save(OUT_DIR / f"{name}.png", optimize=True)

        drop = (metrics["m_Height"] - metrics["m_HorizontalBearingY"]) / metrics["m_Height"]
        manifest[name] = {"w": width, "h": ICON_HEIGHT, "drop": round(drop, 3)}

    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(manifest)} icons to {OUT_DIR.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
