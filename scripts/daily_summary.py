"""Generate a daily summary of yesterday's games for Discord notifications."""

import json
import sys
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "site" / "data"


def get_yesterday_games():
    """Load all games and filter to yesterday (UTC)."""
    raw_path = DATA_DIR / "raw_games.json"
    if not raw_path.exists():
        return []

    with open(raw_path) as f:
        games = json.load(f)

    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).date()

    result = []
    for game in games:
        dt_str = game.get("datetime")
        if not dt_str:
            continue
        try:
            dt = datetime.fromisoformat(dt_str)
            if dt.date() == yesterday:
                result.append(game)
        except ValueError:
            continue
    return result


def build_summary(games):
    """Build a summary dict from yesterday's games."""
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).date()

    if not games:
        return {
            "date": yesterday.isoformat(),
            "total_games": 0,
        }

    players = set()
    commander_picks = Counter()
    commander_wins = Counter()
    durations = []

    for game in games:
        dur = game.get("duration_minutes")
        if dur:
            durations.append(dur)
        for p in game.get("players", []):
            players.add(p["name"])
            cmd = p.get("commander", "")
            if cmd:
                commander_picks[cmd] += 1
                if p.get("winner"):
                    commander_wins[cmd] += 1

    most_popular = commander_picks.most_common(1)[0] if commander_picks else None
    avg_duration = round(sum(durations) / len(durations), 1) if durations else None

    # Top 3 commanders by pick count
    top_commanders = []
    for cmd, picks in commander_picks.most_common(3):
        wins = commander_wins.get(cmd, 0)
        wr = round((wins / picks) * 100) if picks > 0 else 0
        top_commanders.append({"name": cmd, "picks": picks, "winrate": wr})

    return {
        "date": yesterday.isoformat(),
        "total_games": len(games),
        "unique_players": len(players),
        "avg_duration_min": avg_duration,
        "top_commanders": top_commanders,
        "most_popular": most_popular[0] if most_popular else None,
        "most_popular_picks": most_popular[1] if most_popular else 0,
    }


def format_discord_message(summary):
    """Format the summary as a Discord embed-style message."""
    if summary["total_games"] == 0:
        return f"**Daily Update** ({summary['date']})\nNo games recorded yesterday. Data refreshed."

    lines = [
        f"**Daily Update** — {summary['date']}",
        "",
        f"**{summary['total_games']}** games played by **{summary['unique_players']}** unique players",
    ]

    if summary.get("avg_duration_min"):
        lines.append(f"Avg game length: **{summary['avg_duration_min']} min**")

    if summary.get("top_commanders"):
        lines.append("")
        lines.append("**Top Commanders**")
        for i, cmd in enumerate(summary["top_commanders"], 1):
            lines.append(f"{i}. {cmd['name']} — {cmd['picks']} picks ({cmd['winrate']}% WR)")

    return "\n".join(lines)


def main():
    games = get_yesterday_games()
    summary = build_summary(games)
    message = format_discord_message(summary)

    # Write to file for the workflow to read
    output_path = Path(__file__).resolve().parent / "daily_summary.txt"
    output_path.write_text(message)
    print(message)


if __name__ == "__main__":
    main()
