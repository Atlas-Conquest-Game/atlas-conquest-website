"""Gather the localized press files into one folder, ready for a bulk upload.

Card images don't go in this repo (Git LFS and the Pages size cap): they go to the
card host (Cloudflare R2 behind config.cards_base). Press descriptions go to the Google
Drive press kit. This script lays both out exactly as they should land:

    <out>/r2/<slug>/png/<card>.png       800×1120 render, transparent (single-card download)
    <out>/r2/<slug>/webp/<card>.webp     400×560 preview (press card list, home carousel)
    <out>/r2/zips/AtlasConquest-Cards-<slug>.zip   every card, one PNG each
    <out>/drive/<Language>/AtlasConquest-Description-<slug>.txt   short + long description
    <out>/README.md                      upload steps

and records each ZIP's size in site/data/i18n/<slug>.json, which the press page shows.
Only cards in site/data/press_cards.json are staged, named by their slug as on the
English press page. Files whose bytes haven't changed since the last run are left
alone, so a re-run after a card update only touches what changed.

    python scripts/stage_localized_cards.py                 # every locale
    python scripts/stage_localized_cards.py --only ja,ko    # some
    --renders DIR   the game repo's CardScreenshots/ (default: beside this repo)
    --out DIR       default: ~/Projects/Atlas Working Folder/Web-Localization
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import zipfile
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_i18n  # noqa: E402

REPO_ROOT = build_i18n.REPO_ROOT
SITE_DIR = build_i18n.SITE_DIR
DEFAULT_RENDERS = REPO_ROOT.parent.parent / "atlas-conquest" / "CardScreenshots"
DEFAULT_OUT = Path.home() / "Projects" / "Atlas Working Folder" / "Web-Localization"
WEBP_WIDTH = 400


def human_size(n: int) -> str:
    return f"{n / 1024 / 1024:.0f} MB" if n >= 1024 * 1024 else f"{n / 1024:.0f} KB"


def same_bytes(a: Path, b: Path) -> bool:
    if not b.exists() or a.stat().st_size != b.stat().st_size:
        return False
    return hashlib.sha1(a.read_bytes()).digest() == hashlib.sha1(b.read_bytes()).digest()


def stage_cards(loc: dict, cards: list[dict], renders: Path, out: Path, base: str) -> dict:
    src_dir = renders / loc["code"]
    png_dir = out / "r2" / loc["slug"] / "png"
    webp_dir = out / "r2" / loc["slug"] / "webp"
    png_dir.mkdir(parents=True, exist_ok=True)
    webp_dir.mkdir(parents=True, exist_ok=True)
    staged, missing, changed = [], [], 0
    for card in cards:
        src = src_dir / f"{card['slug']}.png"
        if not src.exists():
            missing.append(card["name"])
            continue
        png = png_dir / src.name
        webp = webp_dir / f"{card['slug']}.webp"
        if not same_bytes(src, png) or not webp.exists():
            png.write_bytes(src.read_bytes())
            img = Image.open(src).convert("RGBA")
            img = img.resize((WEBP_WIDTH, round(img.height * WEBP_WIDTH / img.width)), Image.LANCZOS)
            img.save(webp, "WEBP", quality=85, method=6)
            changed += 1
        staged.append(png)

    zip_dir = out / "r2" / "zips"
    zip_dir.mkdir(parents=True, exist_ok=True)
    name = f"AtlasConquest-Cards-{loc['slug']}.zip"
    zpath = zip_dir / name
    if changed or not zpath.exists():
        with zipfile.ZipFile(zpath, "w", zipfile.ZIP_STORED) as zf:  # PNGs are already compressed
            for png in staged:
                zf.write(png, png.name)
    print(f"  {loc['code']}: {len(staged)} cards ({changed} new or changed), ZIP {human_size(zpath.stat().st_size)}"
          + (f"; no render for {len(missing)}: {', '.join(missing[:5])}" if missing else ""))
    return {"url": f"{base}/zips/{name}", "filename": name,
            "size": human_size(zpath.stat().st_size), "count": len(staged)}


def stage_descriptions(loc: dict, source: dict, out: Path) -> None:
    """The press page's short and long description as plain text, for the Drive press kit."""
    t = build_i18n.Translator(loc["code"], source)
    page = (SITE_DIR / "press.html").read_text(encoding="utf-8")
    import html as htmllib
    import re

    def text_of(element_id: str) -> str:
        m = re.search(rf'id="{element_id}"[^>]*>(.*?)</(?:p|div)>\s*(?:<button|</details>|<h3)', page, re.S)
        inner = m.group(1)
        blocks = re.findall(r"<(p|h2)[^>]*>(.*?)</\1>", inner, re.S) or [("p", inner)]
        lines = []
        for tag, body in blocks:
            text = htmllib.unescape(re.sub(r"<[^>]+>", "", t(body)))
            lines.append(build_i18n.norm(text))
        return "\n\n".join(lines)

    folder = out / "drive" / loc["native"]
    folder.mkdir(parents=True, exist_ok=True)
    short = text_of("short-description")
    long_ = text_of("long-description")
    (folder / f"AtlasConquest-Description-{loc['slug']}.txt").write_text(
        f"Atlas Conquest\n\n{t('Short description')}\n\n{short}\n\n{t('Description')}\n\n{long_}\n",
        encoding="utf-8")


README = """# Atlas Conquest — localized press files

Made by `scripts/stage_localized_cards.py` in the website repo. Re-run it after new card
renders; it only rewrites files that changed.

## 0. One-time Cloudflare setup (dashboard, ~10 minutes)

1. R2 > Create bucket (ours is `atlas-conquest-website-storage`, location automatic).
2. The bucket > Settings > Custom Domains > Connect domain: `cards.atlas-conquest.com`.
   atlas-conquest.com is already on Cloudflare, so the DNS record is added for you.
3. The bucket > Settings > CORS policy, so the press page can save single cards:

       [{{"AllowedOrigins": ["https://atlas-conquest.com"], "AllowedMethods": ["GET", "HEAD"], "AllowedHeaders": ["*"], "MaxAgeSeconds": 86400}}]

4. R2 > Manage API tokens > Create token: Object Read & Write, this bucket only.
   Keep the Access Key ID, Secret and the S3 endpoint for rclone below.

## 1. Cloudflare R2 (card images and ZIPs)

Upload everything inside `r2/` to the bucket root, keeping the folders:
`r2/de/png/acid-rain.png` must end up at `{base}/de/png/acid-rain.png`.

Bulk upload with rclone (one-time setup: `rclone config`, type `s3`, provider
`Cloudflare`, the R2 access key and secret, endpoint
`https://<account id>.r2.cloudflarestorage.com`, and `no_check_bucket = true` because the
token is scoped to the one bucket), then:

    rclone copy ./r2 r2:atlas-conquest-website-storage --progress --transfers 16 --exclude "zips/**" --exclude "*/png/**"
    rclone copy ./r2 r2:atlas-conquest-website-storage --progress --transfers 16 --include "*/png/*.png" --header-upload "Content-Disposition: attachment"
    rclone copy ./r2/zips r2:atlas-conquest-website-storage/zips --progress --header-upload "Content-Disposition: attachment"

The PNGs and ZIPs must carry Content-Disposition: attachment: the press page's PNG button is a
plain link (no CORS fetch, which Cloudflare's edge cache breaks), so the header is what saves
the file instead of opening it. Re-uploading a changed card with --ignore-times keeps it.

(The dashboard's drag-and-drop works too, one folder at a time, but caps how many files
go per upload.)

## 2. Google Drive (press kit folder)

Drag each language folder inside `drive/` into the public press-kit folder. Each holds
the short and long description in that language as plain text.

## 3. Tell the website

In the website repo: set `"cards_live": true` in `i18n/config.json`, run
`python scripts/build_i18n.py`, commit and push. Until then the localized pages show
the English card images.
"""


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--only", default="", help="comma list of locale codes")
    ap.add_argument("--renders", type=Path, default=DEFAULT_RENDERS)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = ap.parse_args(argv)

    config = build_i18n.load_config()
    only = {c for c in args.only.split(",") if c}
    cards = json.loads((SITE_DIR / "data" / "press_cards.json").read_text(encoding="utf-8"))["cards"]
    source = json.loads(build_i18n.SOURCE_PATH.read_text(encoding="utf-8"))
    args.out.mkdir(parents=True, exist_ok=True)
    for loc in build_i18n.locales(config):
        if only and loc["code"] not in only:
            continue
        zip_info = stage_cards(loc, cards, args.renders, args.out, config["cards_base"])
        stage_descriptions(loc, source, args.out)
        path = build_i18n.DATA_I18N_DIR / f"{loc['slug']}.json"
        data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"cards": {}}
        data["zip"] = zip_info
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, indent=1, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    (args.out / "README.md").write_text(README.format(base=config["cards_base"]), encoding="utf-8")
    print(f"Staged in {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
