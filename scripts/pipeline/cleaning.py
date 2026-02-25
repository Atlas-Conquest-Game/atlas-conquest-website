"""Data validation & transformation — the gatekeeper for raw DynamoDB items."""

import json
from datetime import datetime

from pipeline.constants import COMMANDER_RENAMES, CARD_RENAMES, MIN_TURNS


def parse_datetime(dt_str):
    """Parse 'MM/DD/YYYY HH:MM:SS' into datetime object."""
    if not dt_str:
        return None
    try:
        return datetime.strptime(dt_str.strip(), "%m/%d/%Y %H:%M:%S")
    except ValueError:
        return None


def parse_players_json(raw):
    """Parse the nested players JSON string from DynamoDB."""
    if not raw:
        return None
    try:
        # DynamoDB stores it as a JSON string, sometimes double-encoded
        if isinstance(raw, str):
            # Handle double-quoted wrapping: ""key"" → "key"
            cleaned = raw
            if cleaned.startswith('"') and cleaned.endswith('"'):
                cleaned = cleaned[1:-1]
            cleaned = cleaned.replace('""', '"')
            return json.loads(cleaned)
        return raw
    except (json.JSONDecodeError, TypeError):
        # Try alternate parsing
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return None


def normalize_commander(name):
    """Apply commander name fixes."""
    if not name:
        return name
    return COMMANDER_RENAMES.get(name, name)


def normalize_card(name):
    """Apply card name fixes."""
    if not name:
        return name
    return CARD_RENAMES.get(name, name)


def clean_game(raw_item, skip_log=None):
    """Parse a raw DynamoDB item into a clean game dict. Returns None if invalid.

    If skip_log is provided (a list), appends the skip reason when returning None.
    """
    game_id = raw_item.get("gameid", "")
    first_player = str(raw_item.get("firstPlayer", "0"))

    # Filter: games that never started
    if first_player == "0":
        if skip_log is not None:
            skip_log.append("first_player=0")
        return None

    # Parse datetimes
    dt_end = parse_datetime(raw_item.get("datetime", ""))
    dt_start = parse_datetime(raw_item.get("datetimeStarted", ""))

    # Parse players
    players_data = parse_players_json(raw_item.get("players", ""))
    if not players_data:
        if skip_log is not None:
            skip_log.append("no_players_data")
        return None

    num_players = players_data.get("numPlayers", 0)
    if isinstance(num_players, str):
        num_players = int(num_players) if num_players.isdigit() else 0

    # Filter: need at least 2 players
    if num_players < 2:
        if skip_log is not None:
            skip_log.append("num_players_below_2")
        return None

    players = players_data.get("players", [])
    if len(players) < 2:
        if skip_log is not None:
            skip_log.append("player_list_below_2")
        return None

    # Filter: both players must have taken at least MIN_TURNS turns
    for p in players:
        turns = p.get("turnsTaken", 0)
        if isinstance(turns, str):
            turns = int(turns) if turns.isdigit() else 0
        if turns < MIN_TURNS:
            if skip_log is not None:
                skip_log.append("low_turns")
            return None

    # Build clean player records
    clean_players = []
    for p in players:
        decklist = p.get("decklist", {})
        commander = normalize_commander(decklist.get("_commander", ""))

        turns = p.get("turnsTaken", 0)
        if isinstance(turns, str):
            turns = int(turns) if turns.isdigit() else 0

        actions = p.get("actionsTaken", 0)
        if isinstance(actions, str):
            actions = int(actions) if actions.isdigit() else 0

        winner = p.get("winner", False)
        if isinstance(winner, str):
            winner = winner.lower() == "true"

        cards_in_deck = []
        for c in decklist.get("_cards", []):
            name = normalize_card(c.get("CardName", ""))
            count = c.get("Count", 1)
            if isinstance(count, str):
                count = int(count) if count.isdigit() else 1
            if name:
                cards_in_deck.append({"name": name, "count": count})

        cards_drawn = []
        for c in p.get("cardsDrawn", []):
            name = normalize_card(c.get("CardName", ""))
            count = c.get("Count", 1)
            if isinstance(count, str):
                count = int(count) if count.isdigit() else 1
            if name:
                cards_drawn.append({"name": name, "count": count})

        cards_played = []
        for c in p.get("cardsPlayed", []):
            name = normalize_card(c.get("CardName", ""))
            count = c.get("Count", 1)
            if isinstance(count, str):
                count = int(count) if count.isdigit() else 1
            if name:
                cards_played.append({"name": name, "count": count})

        clean_players.append({
            "name": p.get("name", "Unknown"),
            "winner": winner,
            "commander": commander,
            "deck_name": decklist.get("_name", ""),
            "turns": turns,
            "actions": actions,
            "cards_in_deck": cards_in_deck,
            "cards_drawn": cards_drawn,
            "cards_played": cards_played,
        })

    # Compute duration in minutes
    duration = None
    if dt_start and dt_end:
        diff = (dt_end - dt_start).total_seconds()
        if diff > 0:
            duration = round(diff / 60, 1)

    return {
        "game_id": game_id,
        "datetime": dt_end.isoformat() if dt_end else None,
        "datetime_started": dt_start.isoformat() if dt_start else None,
        "duration_minutes": duration,
        "map": raw_item.get("map", ""),
        "format": raw_item.get("format", ""),
        "first_player": first_player,
        "players": clean_players,
    }
