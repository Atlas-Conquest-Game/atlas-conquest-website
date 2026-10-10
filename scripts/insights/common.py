"""Shared constants and small helpers for the insights builders."""

from __future__ import annotations

import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = SCRIPTS_DIR.parent
DEFAULT_DATA_DIR = PROJECT_DIR / "site" / "data"
DEFAULT_OUT_DIR = DEFAULT_DATA_DIR / "insights"
DEFAULT_REVIEW_DIR = SCRIPTS_DIR / "review"

SCHEMA_VERSION = 1

ALL_PERIODS = ["all", "6m", "3m", "1m"]
# Windows used by the matchup model and commander profiles (1m is too thin
# for per-commander work).
MODEL_PERIODS = ["all", "6m", "3m"]
PROFILE_WINDOWS = ["all", "6m", "3m"]
MAPS = ["all", "Dunes", "Snowmelt", "Tropics"]
DEFAULT_PERIOD = "3m"

PERIOD_LABELS = {
    "all": "all time",
    "6m": "last 6 months",
    "3m": "last 3 months",
    "1m": "last 30 days",
}

FACTIONS = ["skaal", "grenalia", "lucia", "neutral", "shadis", "archaeon"]


def commander_slug(name: str) -> str:
    """Same as commanderSlug() in site/js/shared.js and slugify() in
    scripts/generate_deck_pages.py — the site/assets/commanders/<slug>.jpg and
    site/decks/<slug>/ names."""
    cleaned = re.sub(r"[,']", "", (name or "").lower())
    return re.sub(r"\s+", "-", cleaned.strip())


def card_slug(name: str) -> str:
    """Same as cardArtSlug() in site/js/shared.js and mention_slug() in
    scripts/pipeline/io_helpers.py — the site/assets/cards/<slug>.jpg name."""
    return re.sub(r"\s+", "-", re.sub(r"[,.']", "", (name or "").lower())).strip("-")


def r4(x):
    """Round to 4 decimals, passing None through. Raises on NaN/inf so a bad
    value can never be published."""
    if x is None:
        return None
    if isinstance(x, float) and not math.isfinite(x):
        raise ValueError(f"non-finite value {x!r}")
    return round(float(x), 4)


def r2(x):
    if x is None:
        return None
    if isinstance(x, float) and not math.isfinite(x):
        raise ValueError(f"non-finite value {x!r}")
    return round(float(x), 2)


def pct_text(p, digits=1) -> str:
    """0.5432 -> '54.3%'."""
    return f"{p * 100:.{digits}f}%"


def int_text(n: int) -> str:
    return f"{n:,}"


_SPRITE_RE = re.compile(r'<sprite name="?([a-z]+)_(\d+)"?\s*/?>', re.I)


def plain_text(text: str) -> str:
    """Turn in-game sprite tags into words: <sprite name="health_4"> -> '4 Health'."""
    def repl(m):
        return f"{m.group(2)} {m.group(1).capitalize()}"
    out = _SPRITE_RE.sub(repl, text or "")
    out = re.sub(r"<[^>]+>", "", out)
    return re.sub(r"\s+", " ", out).strip()


def parse_timestamp(value: str) -> datetime:
    """Parse an ISO timestamp (with or without offset / trailing Z) to aware UTC."""
    s = value.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def iso_z(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_json(path: Path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def dumps(obj, pretty=False) -> str:
    """Deterministic JSON. allow_nan=False makes NaN/inf a hard error."""
    if pretty:
        return json.dumps(obj, indent=2, ensure_ascii=False, allow_nan=False) + "\n"
    return json.dumps(obj, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def write_json(path: Path, obj, pretty=False) -> int:
    """Write JSON only when the bytes differ (keeps reruns no-ops). Returns size."""
    text = dumps(obj, pretty=pretty)
    data = text.encode("utf-8")
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists() or path.read_bytes() != data:
        path.write_bytes(data)
    return len(data)


class SiteData:
    """Lazy loader for the published site/data/*.json files."""

    def __init__(self, data_dir: Path):
        self.data_dir = Path(data_dir)
        self._cache = {}

    def has(self, name: str) -> bool:
        return (self.data_dir / f"{name}.json").exists()

    def get(self, name: str, default=None):
        if name not in self._cache:
            path = self.data_dir / f"{name}.json"
            if not path.exists():
                if default is not None:
                    return default
                raise FileNotFoundError(path)
            self._cache[name] = load_json(path)
        return self._cache[name]

    def __getitem__(self, name):
        return self.get(name)

    def block(self, name: str, period: str, map_name: str = "all", default=None):
        data = self.get(name, default={})
        try:
            return data[period][map_name]
        except (KeyError, TypeError):
            return default


def mirror_free_counts(site, period, map_name, name):
    """(wins, games, mirror_games) for one commander from matchups.json
    (non-mirror rows; mirror rows count both seats, so games = total / 2)."""
    blk = site.block("matchups", period, map_name) or {}
    w = g = mirror_rows = 0
    for r in blk.get("matchups", []):
        if r.get("commander") != name:
            continue
        if r.get("opponent") == name:
            mirror_rows += r.get("total", 0)
            continue
        w += r.get("wins", 0)
        g += r.get("total", 0)
    return w, g, mirror_rows // 2
