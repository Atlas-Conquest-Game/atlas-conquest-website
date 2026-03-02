"""Extract card list from FullCardList.asset (Unity YAML) into cardlist.json.

Run this when the game adds new cards:
    python scripts/extract_cardlist.py

Reads:  Formats/FullCardList.asset
Writes: site/data/cardlist.json
"""

import json
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent.parent
ASSET_PATH = PROJECT_DIR / "Formats" / "FullCardList.asset"
OUTPUT_PATH = PROJECT_DIR / "site" / "data" / "cardlist.json"

LEGACY_NAMES = {
    "Lyre, Tactician of the Order": "Elyse of the Order",
    "Layna, Soulcatcher": "Soultaker Viessa",
    "Elber, Jungle Emmisary": "Elber, Jungle Emissary",
}


def extract_card_names(asset_path):
    """Parse the YAML asset and extract the ordered card name list."""
    names = []
    in_list = False
    with open(asset_path, "r") as f:
        for line in f:
            stripped = line.strip()
            if stripped == "_cardNameOrderedList:":
                in_list = True
                continue
            if in_list:
                if stripped.startswith("- "):
                    names.append(stripped[2:])
                else:
                    break
    return names


def main():
    print(f"Reading {ASSET_PATH}")
    names = extract_card_names(ASSET_PATH)
    print(f"  Found {len(names)} cards")

    cards = [{"id": i, "name": name} for i, name in enumerate(names)]

    output = {
        "version": "2026-03-01",
        "total": len(cards),
        "cards": cards,
        "legacy_names": LEGACY_NAMES,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, indent=2)

    size_kb = OUTPUT_PATH.stat().st_size / 1024
    print(f"  Wrote {OUTPUT_PATH} ({size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
