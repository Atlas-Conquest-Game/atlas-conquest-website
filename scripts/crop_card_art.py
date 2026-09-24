"""
Re-crop every card image to its artwork panel (removes frame, name, text box).

The daily pipeline already does this incrementally — new or updated cards get a
panel in generate_thumbnails() — so this is only for a full rebuild, e.g. after
changing ART_PANEL_CROP_BOX.
Input:  site/assets/cards/<slug>.jpg
Output: site/assets/art/<slug>.jpg
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pipeline.constants import CARD_ASSETS_DIR, CARD_ART_PANEL_DIR
from pipeline.io_helpers import crop_art_panel

CARD_ART_PANEL_DIR.mkdir(parents=True, exist_ok=True)

card_files = sorted(CARD_ASSETS_DIR.glob("*.jpg"))
print(f"Processing {len(card_files)} card images...")

for src in card_files:
    crop_art_panel(src, CARD_ART_PANEL_DIR / src.name)

print(f"Done. Art images saved to {CARD_ART_PANEL_DIR}")
