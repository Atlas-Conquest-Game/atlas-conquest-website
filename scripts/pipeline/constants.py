"""Pipeline constants — paths, AWS config, reference maps, thresholds."""

import os
from pathlib import Path

# ─── Paths ──────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).resolve().parent.parent  # scripts/
PROJECT_DIR = SCRIPT_DIR.parent
DATA_DIR = PROJECT_DIR / "site" / "data"
ASSETS_DIR = PROJECT_DIR / "site" / "assets" / "commanders"
CARD_ASSETS_DIR = PROJECT_DIR / "site" / "assets" / "cards"
# RGBA card art — same images as CARD_ASSETS_DIR but PNG with transparent
# corners, used for hover popups and inline article images.
CARD_PNG_ASSETS_DIR = PROJECT_DIR / "site" / "assets" / "card-art-png"
ARTWORK_DIR = PROJECT_DIR / "Artwork"
CARD_SCREENSHOTS_DIR = PROJECT_DIR / "CardScreenshots"
RAW_CACHE = DATA_DIR / "raw_games.json"

# Reference CSVs — project root is the source of truth
CARDS_CSV = PROJECT_DIR / "StandardFormatCards.csv"
COMMANDERS_CSV = PROJECT_DIR / "StandardFormatCommanders.csv"
# Generated cards (Zombie, Lucian Soldier, …) that no deck can contain but that
# still show up in match data. Same column layout as CARDS_CSV.
TOKENS_CSV = PROJECT_DIR / "StandardFormatTokens.csv"

# Game format assets (exported by Matan before playtests)
FORMATS_DIR    = PROJECT_DIR / "Formats"
CARDLIST_ASSET = FORMATS_DIR / "FullCardList.asset"

# ─── AWS / DynamoDB ─────────────────────────────────────────────

DYNAMO_TABLE = "games"
DYNAMO_REGION = os.environ.get("AWS_DEFAULT_REGION", "us-east-2")

# ─── Normalization Maps ─────────────────────────────────────────

# Commander name normalization map (old DB names → canonical)
COMMANDER_RENAMES = {
    "Elber, Jungle Emmisary": "Elber, Jungle Emissary",
    "Layna, Soulcatcher": "Soultaker Viessa",
    "Lyre, Tactician of the Order": "Elyse of the Order",
}

# Card name normalization map (old DB names → canonical)
CARD_RENAMES = {
    # Add any card renames here as the game evolves
    # "Old Card Name": "New Card Name",
}

# ─── Thresholds & Configuration ─────────────────────────────────

# Minimum turns per player to count as a real game
MIN_TURNS = 3

# Time periods for aggregation: key → days (None = all time)
PERIODS = {"all": None, "6m": 180, "3m": 90, "1m": 30}

# Maps for aggregation: "all" includes every game
MAPS = ["all", "Dunes", "Snowmelt", "Tropics"]

# Patron (faction) color mapping. Mirrors the Patron enum in the game repo
# (Assets/Code/Scripts/Card/Patron.cs). Adora, Mechanus and Treasure are minor
# patrons with only a card or two each — they are NOT neutral, and were
# previously falling through to "neutral" via the .get() default.
PATRON_MAP = {
    "Skaal": "skaal",
    "Grenalia": "grenalia",
    "Lucia": "lucia",
    "Neutral": "neutral",
    "Shadis": "shadis",
    "Archaeon": "archaeon",
    "Adora": "adora",
    "Mechanus": "mechanus",
    "Treasure": "treasure",
}
