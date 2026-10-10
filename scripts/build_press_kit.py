"""Build the Press page's asset previews from the public Google Drive press kit.

The press kit lives in a Drive folder shared "anyone with the link can view".
site/data/press_kit.json lists every asset and the Drive file id of each of its
formats; this script downloads each file through Drive's public download URL
(no credentials needed) and fills in what the page shows:

  - a small WebP preview per asset -> site/assets/press/<slug>.webp
    (from the item's first JPG/PNG, or its PSD's flattened composite)
  - a larger one for the click-to-enlarge view -> site/assets/press/large/<slug>.webp
  - each file's download size, and the asset's pixel dimensions

To add or replace an asset: put the file in the Drive folder, add/update its
id in press_kit.json (Drive "Share -> Copy link" contains it), then run:
    python scripts/build_press_kit.py
and commit press_kit.json + site/assets/press/.

  --only slug,slug   rebuild just these assets
  --local DIR        read a file from DIR (by its filename in the manifest) instead of
                     downloading it, to build the previews of a re-shot asset before it
                     is uploaded over the old one in Drive, or of a new one that has
                     no id yet (it stays hidden on the page until its id is filled in)
"""
import argparse
import io
import json
import sys
import urllib.request
from pathlib import Path

from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent
MANIFEST = REPO_ROOT / "site" / "data" / "press_kit.json"
PREVIEW_DIR = REPO_ROOT / "site" / "assets" / "press"
PREVIEW_URL_PREFIX = "assets/press"
PREVIEW_BOX = (720, 400)  # 2x the card's preview stage
LARGE_BOX = (1920, 1920)  # what the page's lightbox shows
DOWNLOAD_URL = "https://drive.google.com/uc?export=download&id={id}"
IMAGE_FORMATS = ("JPG", "PNG")


def download(file_id):
    """Fetch a public Drive file's bytes. Raises if Drive returns an HTML page
    instead (file not shared publicly, or a >100 MB virus-scan interstitial)."""
    req = urllib.request.Request(DOWNLOAD_URL.format(id=file_id), headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=120) as res:
        data = res.read()
        if "text/html" in res.headers.get("Content-Type", ""):
            raise RuntimeError(f"Drive returned an HTML page for {file_id} — is it shared publicly?")
    return data


def human_size(n):
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.0f} {unit}" if unit in ("B", "KB") else f"{n:.1f} {unit}"
        n /= 1024


def save_webp(img, box, path, quality):
    img = img.copy()
    img.thumbnail(box, Image.LANCZOS)
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "WEBP", quality=quality, method=6)


def build_item(item, local_dir=None):
    def local_file(f):
        path = local_dir / f["filename"] if local_dir and f.get("filename") else None
        return path if path and path.is_file() else None

    # A file with no Drive id yet still counts when --local has it, so a new
    # asset's previews can be built before it is uploaded.
    files = [f for f in item.get("files", []) if f.get("id") or local_file(f)]
    if not files:
        print(f"  {item['slug']}: no Drive ids yet — skipped")
        return
    # Prefer a flat image for the preview; fall back to the PSD composite.
    ordered = sorted(files, key=lambda f: f["format"] not in IMAGE_FORMATS)
    preview_img = None
    for f in ordered:
        local = local_file(f)
        data = local.read_bytes() if local else download(f["id"])
        f["size"] = human_size(len(data))
        if preview_img is None:
            try:
                preview_img = Image.open(io.BytesIO(data))
                preview_img.load()
            except Exception as exc:  # e.g. a PSD Pillow can't flatten
                print(f"  {item['slug']}: can't preview {f['format']} ({exc})")
                preview_img = None

    if preview_img is None:
        print(f"  {item['slug']}: no previewable file")
        return
    item["dimensions"] = f"{preview_img.width} × {preview_img.height}"
    has_alpha = preview_img.mode in ("RGBA", "LA", "P")
    img = preview_img.convert("RGBA" if has_alpha else "RGB")
    save_webp(img, PREVIEW_BOX, PREVIEW_DIR / f"{item['slug']}.webp", 82)
    save_webp(img, LARGE_BOX, PREVIEW_DIR / "large" / f"{item['slug']}.webp", 84)
    item["preview"] = f"{PREVIEW_URL_PREFIX}/{item['slug']}.webp"
    item["large"] = f"{PREVIEW_URL_PREFIX}/large/{item['slug']}.webp"
    print(f"  {item['slug']}: {item['dimensions']}, " + ", ".join(f"{f['format']} {f['size']}" for f in files))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", default="", help="comma list of slugs to rebuild")
    ap.add_argument("--local", type=Path, help="folder of files to use in place of their Drive copies")
    args = ap.parse_args()
    only = {slug for slug in args.only.split(",") if slug}

    kit = json.loads(MANIFEST.read_text(encoding="utf-8"))
    failures = 0
    for group in kit["groups"]:
        for item in group["items"]:
            if only and item["slug"] not in only:
                continue
            try:
                build_item(item, args.local)
            except Exception as exc:
                failures += 1
                print(f"  {item['slug']}: FAILED — {exc}", file=sys.stderr)
    MANIFEST.write_text(json.dumps(kit, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {MANIFEST}" + (f" ({failures} failed)" if failures else ""))
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
