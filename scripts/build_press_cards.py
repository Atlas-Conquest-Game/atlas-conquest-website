"""Build the Press page's card-image list, and optionally the all-cards ZIP.

The press kit offers every card as the raw 800x1120 render in CardScreenshots/:
the card alone on transparency, no drop shadow. Single cards download straight
from this repo on GitHub (CardScreenshots/ is in Git LFS, so they come from
media.githubusercontent.com: raw.githubusercontent.com would serve the LFS
pointer file); "Download all cards" is one ZIP attached to the
`press-kit` GitHub release.

    python scripts/build_press_cards.py              # refresh site/data/press_cards.json
    python scripts/build_press_cards.py --zip PATH   # also write the ZIP and record its size

update-data.yml runs both: the list on every run, the ZIP (re-uploaded to the
release) only when CardScreenshots/ has changed.
"""
import argparse
import json
import sys
import zipfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "site" / "data"
SHOTS_DIR = REPO_ROOT / "CardScreenshots"
MANIFEST = DATA_DIR / "press_cards.json"

REPO = "Atlas-Conquest-Game/atlas-conquest-website"
RAW_BASE = f"https://media.githubusercontent.com/media/{REPO}/main/CardScreenshots/"
ZIP_NAME = "AtlasConquest-Cards.zip"
ZIP_URL = f"https://github.com/{REPO}/releases/download/press-kit/{ZIP_NAME}"


def slug_for(name):
    """Same slug the site uses for card art: 'Elber, Jungle Emissary' -> 'elber-jungle-emissary'."""
    return name.lower().replace(" ", "-").replace(",", "").replace("'", "").replace(".", "")


def human_size(n):
    return f"{n / 1024 / 1024:.0f} MB" if n >= 1024 * 1024 else f"{n / 1024:.0f} KB"


def collect():
    """Every commander, card and token that has a screenshot, in name order."""
    # GitHub's file URLs are case-sensitive and the folder carries legacy
    # capitalised names, so each entry records its file exactly as stored.
    shots = {p.stem.lower(): p.name for p in SHOTS_DIR.glob("*.png")}
    commanders = json.loads((DATA_DIR / "commanders.json").read_text(encoding="utf-8"))
    cards = json.loads((DATA_DIR / "cards.json").read_text(encoding="utf-8"))

    entries, missing = [], []
    for kind, items in (("Commander", commanders), (None, cards)):
        for item in items:
            slug = slug_for(item["name"])
            if slug not in shots:
                missing.append(item["name"])
                continue
            entries.append({
                "name": item["name"],
                "slug": slug,
                "kind": kind or ("Token" if item.get("token") else item.get("type") or "Card"),
                "faction": item.get("patron") or (item.get("faction") or "").capitalize(),
                "file": shots[slug],
            })
    entries.sort(key=lambda e: e["name"].lower())
    return entries, missing


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--zip", type=Path, help="also write the all-cards ZIP here")
    args = ap.parse_args()

    entries, missing = collect()
    if missing:
        print(f"  no screenshot for {len(missing)}: {', '.join(missing[:8])}", file=sys.stderr)

    # Without --zip the ZIP on the release is unchanged, so keep what was recorded for it.
    previous = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {}
    archive = previous.get("zip") or {"url": ZIP_URL, "filename": ZIP_NAME}
    if args.zip:
        args.zip.parent.mkdir(parents=True, exist_ok=True)
        # PNGs are already compressed; storing them keeps the build fast.
        with zipfile.ZipFile(args.zip, "w", zipfile.ZIP_STORED) as zf:
            for e in entries:
                zf.write(SHOTS_DIR / e["file"], f"{e['slug']}.png")
        archive = {"url": ZIP_URL, "filename": ZIP_NAME,
                   "size": human_size(args.zip.stat().st_size), "count": len(entries)}
        print(f"  {args.zip}: {archive['count']} cards, {archive['size']}")

    manifest = {"raw_base": RAW_BASE, "dimensions": "800 × 1120", "zip": archive, "cards": entries}
    MANIFEST.write_text(json.dumps(manifest, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {MANIFEST} ({len(entries)} cards)")


if __name__ == "__main__":
    main()
