"""Build the Press page's asset previews from the public Google Drive press kit.

The press kit lives in a Drive folder shared "anyone with the link can view".
site/data/press_kit.json lists every asset and the Drive file id of each of its
formats; this script downloads each file through Drive's public download URL
(no credentials needed) and fills in what the page shows:

  - a small WebP preview per asset -> site/assets/press/<slug>.webp
    (from the item's first JPG/PNG, or its PSD's flattened composite)
  - each file's download size, and the asset's pixel dimensions

To add or replace an asset: put the file in the Drive folder, add/update its
id in press_kit.json (Drive "Share -> Copy link" contains it), then run:
    python scripts/build_press_kit.py
and commit press_kit.json + site/assets/press/.
"""
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


def build_item(item):
    files = [f for f in item.get("files", []) if f.get("id")]
    if not files:
        print(f"  {item['slug']}: no Drive ids yet — skipped")
        return
    # Prefer a flat image for the preview; fall back to the PSD composite.
    ordered = sorted(files, key=lambda f: f["format"] not in IMAGE_FORMATS)
    preview_img = None
    for f in ordered:
        data = download(f["id"])
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
    img.thumbnail(PREVIEW_BOX, Image.LANCZOS)
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    img.save(PREVIEW_DIR / f"{item['slug']}.webp", "WEBP", quality=82, method=6)
    item["preview"] = f"{PREVIEW_URL_PREFIX}/{item['slug']}.webp"
    print(f"  {item['slug']}: {item['dimensions']}, " + ", ".join(f"{f['format']} {f['size']}" for f in files))


def main():
    kit = json.loads(MANIFEST.read_text(encoding="utf-8"))
    failures = 0
    for group in kit["groups"]:
        for item in group["items"]:
            try:
                build_item(item)
            except Exception as exc:
                failures += 1
                print(f"  {item['slug']}: FAILED — {exc}", file=sys.stderr)
    MANIFEST.write_text(json.dumps(kit, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {MANIFEST}" + (f" ({failures} failed)" if failures else ""))
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
