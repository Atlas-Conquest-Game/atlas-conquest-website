"""Generate the PWA icon set from the existing app icon.

Reads:  site/assets/logo/atlas-conquest-icon.png (256x256 RGBA source)
Writes: site/assets/logo/icon-192.png
        site/assets/logo/icon-512.png
        site/assets/logo/icon-maskable-512.png
        site/assets/logo/apple-touch-icon.png

The source is only 256x256, so the 512 outputs are upscaled — acceptable for
now, but a real 512px master would look sharper. Re-run whenever the source
icon changes:
    python scripts/generate_pwa_icons.py
"""
from pathlib import Path

from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent
LOGO_DIR = REPO_ROOT / "site" / "assets" / "logo"
SOURCE = LOGO_DIR / "atlas-conquest-icon.png"

# Matches --bg in site/css/variables.css
BG_COLOR = (14, 17, 23)


def _resized(img, size):
    return img.resize((size, size), Image.LANCZOS)


def _flattened(img, size, bg=BG_COLOR):
    """Composite an RGBA icon onto a solid background at `size`x`size`."""
    canvas = Image.new("RGB", (size, size), bg)
    resized = _resized(img, size)
    canvas.paste(resized, (0, 0), resized)
    return canvas


def _maskable(img, size, bg=BG_COLOR, safe_zone=0.8):
    """Pad the icon so it survives maskable-icon cropping (safe zone ~80%)."""
    canvas = Image.new("RGB", (size, size), bg)
    inner = int(size * safe_zone)
    resized = _resized(img, inner)
    offset = (size - inner) // 2
    canvas.paste(resized, (offset, offset), resized)
    return canvas


def main():
    if not SOURCE.exists():
        raise SystemExit(f"Source icon not found: {SOURCE}")

    img = Image.open(SOURCE)
    if img.mode != "RGBA":
        img = img.convert("RGBA")

    _resized(img, 192).save(LOGO_DIR / "icon-192.png", "PNG")
    _resized(img, 512).save(LOGO_DIR / "icon-512.png", "PNG")
    _maskable(img, 512).save(LOGO_DIR / "icon-maskable-512.png", "PNG")
    _flattened(img, 180).save(LOGO_DIR / "apple-touch-icon.png", "PNG")

    print(f"Wrote icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png to {LOGO_DIR}")


if __name__ == "__main__":
    main()
