"""Record the localized trailer renders in the press kit, and print the upload commands.

The trailers don't go in this repo (hundreds of MB each): they go to the card host
(Cloudflare R2 behind i18n/config.json cards_base), next to the localized cards:

    trailer/<code>/AtlasConquest_Announcement_Trailer_<version>_<code>_{1440p,1080p}.mp4   press downloads (masters)
    trailer/web/AtlasConquest_Trailer_<version>_<code>_{1080,720}.mp4                      the site's player

<code> is the game's locale code (en, de, es-419, pt-BR, zh-CN ...), as the renders folder names
them. This script fills `trailer` in site/data/press_kit.json (version, base URL and every
language's file sizes), which js/press.js turns into the page language's downloads plus an
"All languages" list. The web encodes are made with ffmpeg (see the printed commands); the
site's player (home/main.js trailerWeb, js/site-config.js) names the version in its URL, so
bump it there too when a new cut goes up.

    python scripts/stage_trailers.py --version v49
    --renders DIR  default: ~/Projects/Atlas Working Folder/Video-Content/renders/localized
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_i18n  # noqa: E402

KIT = build_i18n.SITE_DIR / "data" / "press_kit.json"
DEFAULT_RENDERS = Path.home() / "Projects" / "Atlas Working Folder" / "Video-Content" / "renders" / "localized"
SIZES = (("1440p", "MP4 2560 × 1440"), ("1080p", "MP4 1920 × 1080"))


def human_size(n: int) -> str:
    return f"{n / 1024 / 1024:.0f} MB"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--version", required=True, help="e.g. v49, as in the render file names")
    ap.add_argument("--renders", type=Path, default=DEFAULT_RENDERS)
    args = ap.parse_args(argv)

    config = build_i18n.load_config()
    langs = [{"code": "en", "native": "English"}] + [
        {"code": l["code"], "native": l["native"]} for l in build_i18n.locales(config)]
    missing = []
    for lang in langs:
        lang["sizes"] = {}
        for res, _ in SIZES:
            f = args.renders / lang["code"] / f"AtlasConquest_Announcement_Trailer_{args.version}_{lang['code']}_{res}.mp4"
            if f.exists():
                lang["sizes"][res] = human_size(f.stat().st_size)
            else:
                missing.append(str(f))
    if missing:
        print("Missing renders:\n  " + "\n  ".join(missing))
        return 1

    kit = json.loads(KIT.read_text(encoding="utf-8"))
    trailer = kit.setdefault("trailer", {})
    trailer.update({
        "version": args.version,
        "base": f"{config['cards_base']}/trailer",
        "files": [{"format": "MP4", "label": label, "res": res} for res, label in SIZES],
        "languages": langs,
    })
    KIT.write_text(json.dumps(kit, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    print(f"press_kit.json: trailer {args.version} in {len(langs)} languages")
    print(f"""
Web encodes, per language (into a staging folder's trailer/web/):
  ffmpeg -i <code>/AtlasConquest_Announcement_Trailer_{args.version}_<code>_1440p.mp4 -map 0:v:0 -map 0:a:0 \\
    -vf scale=1920:1080:flags=lanczos -c:v libx264 -preset slow -crf 21 -maxrate 9M -bufsize 18M \\
    -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart AtlasConquest_Trailer_{args.version}_<code>_1080.mp4
  (720: scale=1280:720, -crf 22 -maxrate 4500k -bufsize 9M, -b:a 128k)

Upload (rclone remote r2, see the Web-Localization README):
  cd "{args.renders}"
  rclone copy . r2:atlas-conquest-website-storage/trailer --include "/*/AtlasConquest_Announcement_Trailer_{args.version}_*.mp4" --header-upload "Content-Disposition: attachment"
  rclone copy <staging>/trailer/web r2:atlas-conquest-website-storage/trailer/web --include "*_{args.version}_*.mp4"
""")
    return 0


if __name__ == "__main__":
    sys.exit(main())
