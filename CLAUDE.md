# Atlas Conquest Data Analytics

> Agent entry point. This file is the map — see linked docs for depth.

## What This Is

A static analytics dashboard for **Atlas Conquest**, a competitive hex-grid deck builder game. Data is pulled from an AWS database and rendered as a GitHub Pages site.

## Architecture

```
AWS Database → GitHub Actions (daily/manual) → Static JSON → GitHub Pages
```

- **Data pipeline**: `scripts/pipeline/` — Python package that connects to AWS, pulls match/card/deck data, and writes static JSON to `site/data/`. Entry point: `scripts/fetch_data.py`.
- **Static site**: `site/` — Vanilla HTML/CSS/JS. Loads JSON data files. No build step.
- **CI/CD**: `.github/workflows/update-data.yml` — Runs daily via cron and on-demand via workflow_dispatch.
- **Docs**: `docs/` — System of record for architecture, game rules, design, and data model.

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full system design.

## Key Docs

| Doc | Purpose |
|-----|---------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, data flow, layer boundaries |
| [docs/GAME_RULES.md](docs/GAME_RULES.md) | Atlas Conquest game mechanics reference |
| [docs/DESIGN.md](docs/DESIGN.md) | Frontend design system (colors, typography, components) |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Database schema and JSON data contracts |

## Conventions

- **No build step** for the frontend. Plain HTML/CSS/JS. Keep it simple.
- **Data flows one direction**: AWS → JSON → Site. The site never writes to AWS.
- **Faction colors** (colorblind-safe Okabe-Ito palette): Skaal = `#D55E00`, Grenalia = `#009E73`, Lucia = `#E8B630`.
- **Static JSON files** in `site/data/` are the contract between pipeline and frontend.
- **Python 3.10+** for scripts. Use `boto3` for AWS access.

## Quick Commands

```bash
# Fetch latest data from AWS (requires credentials)
python scripts/fetch_data.py

# Serve site locally
python -m http.server 8000 --directory site
```
