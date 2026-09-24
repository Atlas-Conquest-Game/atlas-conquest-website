"""Generate every logo asset the site serves from the high-res masters.

Reads (masters, committed but not served):
        scripts/assets/logo/atlas-conquest-icon.png   square round icon, 1024px RGBA
        scripts/assets/logo/atlas-conquest-logo.png   wide wordmark, RGBA
Writes: site/assets/logo/atlas-conquest-icon.png       256px — favicon, OG image, diagrams
        site/assets/logo/atlas-conquest-logo.png       wordmark for the nav (3x its 28px CSS height)
        site/assets/logo/icon-192.png / icon-512.png   PWA icons
        site/assets/logo/icon-maskable-512.png         PWA maskable icon (80% safe zone)
        site/assets/logo/apple-touch-icon.png          180px, flattened on the site background
        site/favicon.ico                               16/32/48, for clients that ask for it

The masters come from the Unity project (Assets/Resources/Images/Logo); to update
the logo, run with --from-unity to re-import them, then commit the results:
    python scripts/generate_pwa_icons.py
    python scripts/generate_pwa_icons.py --from-unity "C:/.../Images/Logo"
If the icon changes, also re-run generate_conquest_diagrams.py (it embeds it) and
bump CACHE_NAME in site/service-worker.js so installed PWAs pick up the icons.
"""
import argparse
from pathlib import Path

from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent
MASTER_DIR = REPO_ROOT / "scripts" / "assets" / "logo"
ICON_MASTER = MASTER_DIR / "atlas-conquest-icon.png"
WORDMARK_MASTER = MASTER_DIR / "atlas-conquest-logo.png"
LOGO_DIR = REPO_ROOT / "site" / "assets" / "logo"
FAVICON = REPO_ROOT / "site" / "favicon.ico"

# File names inside the Unity project's Assets/Resources/Images/Logo.
UNITY_ICON = "atlas-conquest-icon.png"
UNITY_WORDMARK = "AC Logo Final Color.png"

ICON_MASTER_SIZE = 1024
WORDMARK_MASTER_HEIGHT = 400
NAV_WORDMARK_HEIGHT = 84  # 3x the 28px nav height in layout.css

# Matches --bg in site/css/variables.css
BG_COLOR = (14, 17, 23)


def _trimmed_square(img):
    """Crop to the visible pixels, then pad to a centered transparent square."""
    img = img.crop(img.getbbox())
    side = max(img.size)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
    return canvas


def import_from_unity(unity_logo_dir):
    """Refresh the committed masters from the Unity project's full-size exports."""
    MASTER_DIR.mkdir(parents=True, exist_ok=True)
    icon = _trimmed_square(Image.open(unity_logo_dir / UNITY_ICON).convert("RGBA"))
    icon.resize((ICON_MASTER_SIZE, ICON_MASTER_SIZE), Image.LANCZOS).save(ICON_MASTER, optimize=True)

    wordmark = Image.open(unity_logo_dir / UNITY_WORDMARK).convert("RGBA")
    wordmark = wordmark.crop(wordmark.getbbox())
    wordmark = wordmark.resize(
        (round(wordmark.width * WORDMARK_MASTER_HEIGHT / wordmark.height), WORDMARK_MASTER_HEIGHT),
        Image.LANCZOS,
    )
    wordmark.save(WORDMARK_MASTER, optimize=True)
    print(f"Imported masters from {unity_logo_dir}")


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
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--from-unity", type=Path, metavar="LOGO_DIR",
                        help="Re-import the masters from the Unity project's Images/Logo folder first")
    args = parser.parse_args()
    if args.from_unity:
        import_from_unity(args.from_unity)

    for master in (ICON_MASTER, WORDMARK_MASTER):
        if not master.exists():
            raise SystemExit(f"Master not found: {master} (run with --from-unity)")

    icon = Image.open(ICON_MASTER).convert("RGBA")
    _resized(icon, 256).save(LOGO_DIR / "atlas-conquest-icon.png", optimize=True)
    _resized(icon, 192).save(LOGO_DIR / "icon-192.png", optimize=True)
    _resized(icon, 512).save(LOGO_DIR / "icon-512.png", optimize=True)
    _maskable(icon, 512).save(LOGO_DIR / "icon-maskable-512.png", optimize=True)
    _flattened(icon, 180).save(LOGO_DIR / "apple-touch-icon.png", optimize=True)
    icon.save(FAVICON, sizes=[(16, 16), (32, 32), (48, 48)])

    wordmark = Image.open(WORDMARK_MASTER).convert("RGBA")
    width = round(wordmark.width * NAV_WORDMARK_HEIGHT / wordmark.height)
    wordmark.resize((width, NAV_WORDMARK_HEIGHT), Image.LANCZOS).save(
        LOGO_DIR / "atlas-conquest-logo.png", optimize=True)

    print(f"Wrote icon + PWA icons + wordmark ({width}x{NAV_WORDMARK_HEIGHT}) to {LOGO_DIR}, favicon to {FAVICON}")


if __name__ == "__main__":
    main()
