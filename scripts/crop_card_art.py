"""
Crops card images to the artwork panel only (removes frame, name, text box).
Art panel crop box for 600x840 card images: left=75, top=35, right=525, bottom=445.
Output saved to site/assets/art/<slug>.jpg.
"""

import os
from pathlib import Path
from PIL import Image

CARDS_DIR = Path(__file__).parent.parent / "site" / "assets" / "cards"
ART_DIR = Path(__file__).parent.parent / "site" / "assets" / "art"
CROP_BOX = (75, 35, 525, 445)  # left, top, right, bottom

ART_DIR.mkdir(parents=True, exist_ok=True)

card_files = sorted(CARDS_DIR.glob("*.jpg"))
print(f"Processing {len(card_files)} card images...")

for src in card_files:
    dst = ART_DIR / src.name
    with Image.open(src) as img:
        w, h = img.size
        if w == 600 and h == 840:
            cropped = img.crop(CROP_BOX)
        else:
            # Scale crop box proportionally if image is a different size
            sx, sy = w / 600, h / 840
            box = (
                int(CROP_BOX[0] * sx),
                int(CROP_BOX[1] * sy),
                int(CROP_BOX[2] * sx),
                int(CROP_BOX[3] * sy),
            )
            cropped = img.crop(box)
        cropped.save(dst, "JPEG", quality=90)

print(f"Done. Art images saved to {ART_DIR}")
