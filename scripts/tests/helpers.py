"""Shared test factories for pipeline tests.

Provides factory functions for building raw DynamoDB items and clean game dicts
with sensible defaults and easy overrides.
"""

import json
import sys
from pathlib import Path

# Add scripts/ to path so we can import fetch_data
SCRIPTS_DIR = Path(__file__).resolve().parent.parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

DATA_DIR = SCRIPTS_DIR.parent / "site" / "data"


# ─── Raw DynamoDB Item Factory ────────────────────────────────────

def make_raw_item(**overrides):
    """Build a valid raw DynamoDB item. Override any field via kwargs.

    The default item represents a normal 2-player game that should pass
    all clean_game() validation. Fields:
        players_overrides: list of dicts to merge into each player
        player1_overrides / player2_overrides: per-player overrides
    """
    players_ovr = overrides.pop("players_overrides", None)
    p1_ovr = overrides.pop("player1_overrides", {})
    p2_ovr = overrides.pop("player2_overrides", {})

    p1 = {
        "name": "Alice",
        "turnsTaken": 5,
        "actionsTaken": 40,
        "winner": True,
        "decklist": {
            "_commander": "Captain Greenbeard",
            "_name": "Test Deck 1",
            "_cards": [
                {"CardName": "Fire Bolt", "Count": 2},
                {"CardName": "Shield Wall", "Count": 1},
            ],
        },
        "cardsDrawn": [
            {"CardName": "Fire Bolt", "Count": 1},
            {"CardName": "Shield Wall", "Count": 1},
        ],
        "cardsPlayed": [
            {"CardName": "Fire Bolt", "Count": 1},
        ],
    }

    p2 = {
        "name": "Bob",
        "turnsTaken": 5,
        "actionsTaken": 35,
        "winner": False,
        "decklist": {
            "_commander": "Elber, Jungle Emissary",
            "_name": "Test Deck 2",
            "_cards": [
                {"CardName": "Ice Shard", "Count": 2},
                {"CardName": "Heal", "Count": 1},
            ],
        },
        "cardsDrawn": [
            {"CardName": "Ice Shard", "Count": 1},
        ],
        "cardsPlayed": [
            {"CardName": "Ice Shard", "Count": 1},
        ],
    }

    # Apply per-player overrides
    p1.update(p1_ovr)
    p2.update(p2_ovr)

    if players_ovr:
        for i, ovr in enumerate(players_ovr):
            if i == 0:
                p1.update(ovr)
            elif i == 1:
                p2.update(ovr)

    players_json = json.dumps({"numPlayers": 2, "players": [p1, p2]})

    item = {
        "gameid": "test-game-001",
        "firstPlayer": "1",
        "datetime": "01/15/2025 14:30:00",
        "datetimeStarted": "01/15/2025 14:10:00",
        "map": "Dunes",
        "format": "Standard",
        "players": players_json,
    }

    item.update(overrides)
    return item


# ─── Clean Game Factory ──────────────────────────────────────────

def make_clean_game(**overrides):
    """Build a valid clean game dict (output of clean_game()).

    Override any top-level field. Use players_overrides for player-level changes.
    """
    players_ovr = overrides.pop("players_overrides", None)

    game = {
        "game_id": "test-game-001",
        "datetime": "2025-01-15T14:30:00",
        "datetime_started": "2025-01-15T14:10:00",
        "duration_minutes": 20.0,
        "map": "Dunes",
        "format": "Standard",
        "first_player": "1",
        "players": [
            {
                "name": "Alice",
                "winner": True,
                "commander": "Captain Greenbeard",
                "deck_name": "Test Deck 1",
                "turns": 5,
                "actions": 40,
                "cards_in_deck": [
                    {"name": "Fire Bolt", "count": 2},
                    {"name": "Shield Wall", "count": 1},
                ],
                "cards_drawn": [
                    {"name": "Fire Bolt", "count": 1},
                    {"name": "Shield Wall", "count": 1},
                ],
                "cards_played": [
                    {"name": "Fire Bolt", "count": 1},
                ],
            },
            {
                "name": "Bob",
                "winner": False,
                "commander": "Elber, Jungle Emissary",
                "deck_name": "Test Deck 2",
                "turns": 5,
                "actions": 35,
                "cards_in_deck": [
                    {"name": "Ice Shard", "count": 2},
                    {"name": "Heal", "count": 1},
                ],
                "cards_drawn": [
                    {"name": "Ice Shard", "count": 1},
                ],
                "cards_played": [
                    {"name": "Ice Shard", "count": 1},
                ],
            },
        ],
    }

    if players_ovr:
        for i, ovr in enumerate(players_ovr):
            if i < len(game["players"]):
                game["players"][i].update(ovr)

    game.update(overrides)
    return game


def make_games(n, commander1="Captain Greenbeard", commander2="Elber, Jungle Emissary",
               p1_wins=None, first_player="1", map_name="Dunes"):
    """Generate N clean games with configurable properties.

    Args:
        n: Number of games
        commander1: Commander for player 1
        commander2: Commander for player 2
        p1_wins: Number of times p1 wins (default: n//2). Rest go to p2.
        first_player: first_player value for all games
        map_name: Map for all games
    """
    if p1_wins is None:
        p1_wins = n // 2

    games = []
    for i in range(n):
        p1_won = i < p1_wins
        games.append(make_clean_game(
            game_id=f"game-{i:04d}",
            first_player=first_player,
            map=map_name,
            datetime=f"2025-01-{(i % 28) + 1:02d}T14:00:00",
            players_overrides=[
                {"winner": p1_won, "commander": commander1},
                {"winner": not p1_won, "commander": commander2},
            ],
        ))
    return games


# ─── Real JSON Loader ────────────────────────────────────────────

def load_real_json(filename):
    """Load a real JSON file from site/data/. Returns None if not found."""
    path = DATA_DIR / filename
    if not path.exists():
        return None
    with open(path, "r") as f:
        return json.load(f)
