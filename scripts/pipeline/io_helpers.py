"""I/O operations — AWS, CSV loading, cache management, thumbnails, JSON writing."""

import csv
import json
import subprocess
import sys
import time

from pipeline.constants import (
    DATA_DIR, ASSETS_DIR, CARD_ASSETS_DIR, ARTWORK_DIR, CARD_SCREENSHOTS_DIR,
    RAW_CACHE, CARDS_CSV, COMMANDERS_CSV,
    DYNAMO_TABLE, DYNAMO_REGION, PATRON_MAP,
)
from pipeline.cleaning import normalize_commander


# ─── Thumbnail Generation ──────────────────────────────────────

def _resize_image(source, target, max_width, quality=85):
    """Resize a source image to max_width, save as JPEG. Returns True on success."""
    try:
        from PIL import Image
        img = Image.open(source)
        if img.width > max_width:
            ratio = max_width / img.width
            new_size = (max_width, int(img.height * ratio))
            img = img.resize(new_size, Image.LANCZOS)
        img = img.convert("RGB")
        img.save(target, "JPEG", quality=quality)
        return True
    except ImportError:
        try:
            subprocess.run([
                "sips", "-s", "format", "jpeg",
                "-Z", str(max_width), str(source),
                "--out", str(target),
            ], check=True, capture_output=True)
            return True
        except (FileNotFoundError, subprocess.CalledProcessError):
            return False


def _art_slug(name):
    """Convert a name like 'Elber, Jungle Emissary' to 'elber-jungle-emissary'."""
    return name.lower().replace(" ", "-").replace(",", "").replace("'", "")


def generate_thumbnails():
    """Generate optimized thumbnails for commanders (from Artwork/) and cards (from CardScreenshots/).

    Commander art:  Artwork/<slug>.png → site/assets/commanders/<slug>.jpg  (400px wide)
                    Only processes files whose slug matches a commander in the CSV.
    Card previews:  CardScreenshots/*.png → site/assets/cards/*.jpg  (600px wide)

    Only regenerates if source is newer than target or target is missing.
    """
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    CARD_ASSETS_DIR.mkdir(parents=True, exist_ok=True)

    cmd_count = 0
    card_count = 0

    # Build set of valid commander slugs from CSV
    commander_slugs = set()
    if COMMANDERS_CSV.exists():
        with open(COMMANDERS_CSV, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                name = normalize_commander(row.get("Name", "").strip())
                if name:
                    commander_slugs.add(_art_slug(name))

    # Commander thumbnails from Artwork/ (only files matching commander names)
    if ARTWORK_DIR.exists() and commander_slugs:
        for source in ARTWORK_DIR.iterdir():
            if source.suffix.lower() not in (".png", ".jpg", ".jpeg"):
                continue
            slug = source.stem.lower()
            if slug not in commander_slugs:
                continue
            target = ASSETS_DIR / f"{slug}.jpg"
            if target.exists() and target.stat().st_mtime >= source.stat().st_mtime:
                continue
            if _resize_image(source, target, 400):
                cmd_count += 1

    # Card thumbnails from CardScreenshots/
    if CARD_SCREENSHOTS_DIR.exists():
        for source in CARD_SCREENSHOTS_DIR.iterdir():
            if source.suffix.lower() not in (".png", ".jpg", ".jpeg"):
                continue
            slug = source.stem.lower()
            target = CARD_ASSETS_DIR / f"{slug}.jpg"
            if target.exists() and target.stat().st_mtime >= source.stat().st_mtime:
                continue
            if _resize_image(source, target, 600):
                card_count += 1

    print(f"  Thumbnails: {cmd_count} commander + {card_count} card images generated")
    if cmd_count == 0 and card_count == 0:
        print("  (all thumbnails up to date)")


# ─── AWS / DynamoDB ─────────────────────────────────────────────

def get_dynamo_table():
    """Create DynamoDB table resource with retry-friendly config."""
    try:
        import boto3
        from botocore.config import Config
    except ImportError:
        print("Error: boto3 is required. Install with: pip install boto3")
        sys.exit(1)

    config = Config(
        retries={"max_attempts": 10, "mode": "adaptive"},
        read_timeout=120,
        connect_timeout=10,
    )
    dynamodb = boto3.resource("dynamodb", region_name=DYNAMO_REGION, config=config)
    return dynamodb.Table(DYNAMO_TABLE)


def scan_all_games(table, cached_game_ids=None):
    """Scan DynamoDB table for all games. Returns list of raw items.

    If cached_game_ids is provided, we still do a full scan (DynamoDB has no
    GSI on datetime), but skip items we've already processed.
    """
    cached_game_ids = cached_game_ids or set()
    items = []
    new_count = 0
    scan_kwargs = {}
    page = 0

    while True:
        page += 1
        try:
            response = table.scan(**scan_kwargs)
        except Exception as e:
            if "ProvisionedThroughputExceededException" in str(type(e).__name__) or "Throughput" in str(e):
                wait = min(2 ** page, 30)
                print(f"    Throttled, waiting {wait}s...")
                time.sleep(wait)
                continue
            raise

        for item in response.get("Items", []):
            gid = item.get("gameid", "")
            if gid not in cached_game_ids:
                items.append(item)
                new_count += 1

        scanned = response.get("ScannedCount", 0)
        print(f"    Page {page}: scanned {scanned} items, {new_count} new so far")

        if "LastEvaluatedKey" not in response:
            break
        scan_kwargs["ExclusiveStartKey"] = response["LastEvaluatedKey"]

    return items


# ─── Reference Data (CSVs) ──────────────────────────────────────

def load_cards_csv():
    """Load card definitions from intern's CSV."""
    cards = []
    if not CARDS_CSV.exists():
        print(f"  Warning: {CARDS_CSV} not found, skipping card definitions")
        return cards

    with open(CARDS_CSV, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = row.get("Name", "").strip()
            if not name:
                continue

            patron = row.get("Patron", "Neutral").strip()
            cost = row.get("Cost", "")
            attack = row.get("Attack", "")
            speed = row.get("Speed", "")
            health = row.get("Health", "")

            # Build card art filename: "Card Name" → "Card-Name.png"
            art_slug = name.replace(" ", "-").replace(",", "").replace("'", "")
            art_file = f"{art_slug}.png"
            has_art = (CARD_SCREENSHOTS_DIR / art_file).exists() if CARD_SCREENSHOTS_DIR.exists() else False

            cards.append({
                "name": name,
                "type": row.get("Type", "").strip(),
                "text": row.get("TextBox", "").strip(),
                "subtype": row.get("Subtype", "").strip() if row.get("Subtype", "").strip() != "None" else "",
                "cost": int(cost) if cost.isdigit() else None,
                "attack": int(attack) if attack.isdigit() else None,
                "speed": int(speed) if speed.isdigit() else None,
                "health": int(health) if health.isdigit() else None,
                "legendary": row.get("Legendary", "").strip().lower() == "true",
                "faction": PATRON_MAP.get(patron, "neutral"),
                "art": f"CardScreenshots/{art_file}" if has_art else None,
            })

    print(f"  Loaded {len(cards)} cards from CSV")
    return cards


def load_commanders_csv():
    """Load commander definitions from intern's CSV."""
    commanders = []
    if not COMMANDERS_CSV.exists():
        print(f"  Warning: {COMMANDERS_CSV} not found, skipping commander definitions")
        return commanders

    with open(COMMANDERS_CSV, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = normalize_commander(row.get("Name", "").strip())
            if not name:
                continue

            patron = row.get("Patron", "Neutral").strip()

            # Commander artwork slug
            art_slug = name.lower().replace(" ", "-").replace(",", "").replace("'", "")
            art_file = f"{art_slug}.jpg"
            has_art = (ASSETS_DIR / art_file).exists() if ASSETS_DIR.exists() else False

            commanders.append({
                "name": name,
                "text": row.get("TextBox", "").strip(),
                "subtype": row.get("Subtype", "").strip() if row.get("Subtype", "").strip() != "None" else "",
                "dominion": int(row.get("Dominion", 0) or 0),
                "intellect": int(row.get("Intellect", 0) or 0),
                "speed": int(row.get("Speed", 0) or 0),
                "health": int(row.get("Health", 0) or 0),
                "faction": PATRON_MAP.get(patron, "neutral"),
                "art": f"assets/commanders/{art_file}" if has_art else None,
            })

    print(f"  Loaded {len(commanders)} commanders from CSV")
    return commanders


# ─── JSON Writers ────────────────────────────────────────────────

def write_json(filename, data, compact=False):
    """Write data to a JSON file in the data directory."""
    path = DATA_DIR / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        if compact:
            json.dump(data, f, separators=(",", ":"), default=str)
        else:
            json.dump(data, f, indent=2, default=str)
    size_kb = path.stat().st_size / 1024
    print(f"  Wrote {path.name} ({size_kb:.0f} KB)")


# ─── Cache Management ────────────────────────────────────────────

def load_cache():
    """Load previously processed games from cache."""
    if not RAW_CACHE.exists():
        return [], set()

    try:
        with open(RAW_CACHE, "r") as f:
            cached = json.load(f)
        game_ids = {g["game_id"] for g in cached}
        print(f"  Loaded {len(cached)} cached games")
        return cached, game_ids
    except (json.JSONDecodeError, KeyError):
        return [], set()


def save_cache(games):
    """Save processed games to cache for incremental fetching."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(RAW_CACHE, "w") as f:
        json.dump(games, f, separators=(",", ":"))
    print(f"  Cached {len(games)} games to {RAW_CACHE.name}")
