# Atlas Conquest Data Analytics

> Agent entry point. This file is the map — see linked docs for depth.

## What This Is

A static analytics dashboard for **Atlas Conquest**, a competitive hex-grid deck builder game. Data is pulled from an AWS DynamoDB database and rendered as a GitHub Pages site.

## Architecture

```
AWS DynamoDB → GitHub Actions (daily/manual) → Static JSON → GitHub Pages
```

- **Data pipeline**: `scripts/pipeline/` — Python package that connects to AWS, pulls match/card/deck data, cleans and aggregates it, and writes static JSON to `site/data/`. Entry point: `scripts/fetch_data.py`.
- **Static site**: `site/` — Vanilla HTML/CSS/JS. Loads JSON data files. No build step.
- **CI/CD**: `.github/workflows/update-data.yml` — Runs daily at 06:00 UTC via cron and on-demand via workflow_dispatch.
- **Discord bot**: `scripts/daily_summary.py` — Posts daily game stats to Discord via webhook, triggered by the same GitHub Actions pipeline.
- **Docs**: `docs/` — System of record for architecture, game rules, design, and data model.

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full system design.

## Site Pages

| Page | File | JS | Description |
|------|------|----|-------------|
| Overview | `site/index.html` | `home.js` | Dashboard with KPIs, game distributions, commander overview |
| Commanders | `site/commanders.html` | `commanders.js` | Winrates, deck composition, winrate by turns/actions/duration, detail modal |
| Cards | `site/cards.html` | `cards.js` | Card stats (deck/draw/play rates and winrates), per-commander breakdown |
| Meta | `site/meta.html` | `meta.js` | Matchup heatmap, faction/commander popularity and winrate trends, first-turn advantage |
| Mulligan | `site/mulligan.html` | `mulligan.js` | Opening hand keep rates, normalized keep preference, per-commander mulligan stats |

All pages share `site/js/shared.js` (data loading, filters, helper functions).

## Pipeline Modules

| Module | Purpose |
|--------|---------|
| `scripts/pipeline/cleaning.py` | Transform raw DynamoDB items into clean game dicts |
| `scripts/pipeline/filtering.py` | Filter games by time period and map |
| `scripts/pipeline/aggregation.py` | All stat computations (winrates, matchups, trends, mulligan, etc.) |
| `scripts/pipeline/main.py` | Orchestration — runs all aggregations for each period × map, writes JSON |
| `scripts/pipeline/constants.py` | Paths, AWS config, normalization maps, thresholds |
| `scripts/pipeline/io_helpers.py` | DynamoDB scanning, cache management, JSON I/O, CSV loading |

## Key Docs

| Doc | Purpose |
|-----|---------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, data flow, layer boundaries |
| [docs/GAME_RULES.md](docs/GAME_RULES.md) | Atlas Conquest game mechanics reference |
| [docs/DESIGN.md](docs/DESIGN.md) | Frontend design system (colors, typography, components) |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | JSON data contracts between pipeline and frontend |
| [docs/planning/FUTURE_VISION.md](docs/planning/FUTURE_VISION.md) | Roadmap and feature ideas |

## Conventions

- **No build step** for the frontend. Plain HTML/CSS/JS. Keep it simple.
- **Data flows one direction**: AWS → JSON → Site. The site never writes to AWS.
- **Faction colors** (colorblind-safe Okabe-Ito palette): Skaal = `#D55E00`, Grenalia = `#009E73`, Lucia = `#E8B630`, Neutral = `#A89078`, Shadis = `#7B7B8E`, Archaeon = `#0072B2`.
- **Static JSON files** in `site/data/` are the contract between pipeline and frontend. All stats files are nested `data[period][map]` where period is `all|6m|3m|1m` and map is `all|Dunes|Snowmelt|Tropics`.
- **Python 3.10+** for scripts. Use `boto3` for AWS access. Virtual env at `venv/`.
- **Tests**: `pytest scripts/tests/ -v` — cleaning, aggregation, and output validation tests.
- **`raw_games.json`** is a local cache (gitignored). Delete it to force a full re-fetch from DynamoDB.

## Game Mechanics (quick reference)

- **Commanders** have an **intellect** stat (6-10) that determines how many cards they see in their opening hand mulligan.
- **Mulligan**: players see `intellect` cards, keep exactly 3 (going first) or 4 (going second), return the rest to their deck.
- **Turn order**: first player (`first_player` field) — historical data has `"99"` for corrupt entries. Mulligan data can infer turn order from kept count.
- **6 factions**: Skaal, Grenalia, Lucia, Neutral, Shadis, Archaeon.
- **3 maps**: Dunes, Snowmelt, Tropics.

## AWS Configuration

- **DynamoDB table**: `games` in `us-east-2`
- Credentials needed: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (set as env vars or in `~/.aws/credentials`)

## Quick Commands

```bash
# Fetch latest data from AWS (requires credentials)
source venv/bin/activate
python scripts/fetch_data.py

# Re-aggregate from cached data (no AWS needed)
python scripts/fetch_data.py --skip-fetch

# Serve site locally
python3 -m http.server 8000 --directory site

# Run tests
pytest scripts/tests/ -v
```
