"""Game list filtering by time period and map."""

from datetime import datetime, timedelta, timezone


def filter_games_by_period(games, days):
    """Filter games to those within the last N days. None = all games."""
    if days is None:
        return games
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    result = []
    for g in games:
        dt_str = g.get("datetime")
        if not dt_str:
            continue
        try:
            dt = datetime.fromisoformat(dt_str)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            if dt >= cutoff:
                result.append(g)
        except ValueError:
            continue
    return result


def filter_games_by_map(games, map_name):
    """Filter games to those on a specific map. 'all' returns all games."""
    if map_name == "all":
        return games
    return [g for g in games if g.get("map", "") == map_name]
