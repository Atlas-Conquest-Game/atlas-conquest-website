# Architecture

## System Overview

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  AWS Database │────▶│  GitHub Actions   │────▶│  GitHub Pages   │
│  (source of   │     │  (data pipeline)  │     │  (static site)  │
│   truth)      │     │                   │     │                 │
└──────────────┘     └──────────────────┘     └─────────────────┘
                            │
                            ▼
                     site/data/*.json
                     (data contract)
```

## Layers

### 1. Data Source (AWS)
- Read-only access to the Atlas Conquest game database.
- Contains match results, deck lists, card definitions, player data.
- We never write to this database.

### 2. Data Pipeline (`scripts/pipeline/`)
- Python package (`scripts/pipeline/`) that queries AWS and transforms raw data into aggregated JSON.
- Entry point: `python scripts/fetch_data.py` (thin wrapper that calls `pipeline.main.main()`).
- Runs in GitHub Actions on a schedule (daily) or manual trigger.
- Incremental fetching: caches raw games in `raw_games.json`, only pulls new games from DynamoDB.
- Computes per-period aggregations (all / 6m / 3m / 1m) crossed with per-map breakdowns (All Maps / Dunes / Snowmelt / Tropics): commander stats, matchups, card stats, meta trends, game distribution histograms, per-commander deck composition breakdowns, and first-turn advantage stats.
- Output nesting: `data[period][map]` for all stat files; flat arrays for reference files (`cards.json`, `commanders.json`).
- Output: static JSON files committed to `site/data/`.

#### Pipeline Modules

| Module | Role |
|--------|------|
| `pipeline/constants.py` | Paths, AWS config, renames, thresholds, PERIODS, MAPS |
| `pipeline/cleaning.py` | `parse_*`, `normalize_*`, `clean_game()` — data validation & transformation |
| `pipeline/filtering.py` | `filter_games_by_period()`, `filter_games_by_map()` |
| `pipeline/aggregation.py` | All 13 `aggregate_*` functions — stats computation |
| `pipeline/io_helpers.py` | AWS, CSV loading, cache, thumbnails, `write_json()` |
| `pipeline/main.py` | `build_and_write_all()`, `main()` — orchestration |

### 3. Data Contract (`site/data/`)
- Static JSON files are the interface between the pipeline and the frontend.
- Each file has a defined schema documented in [DATA_MODEL.md](DATA_MODEL.md).
- Stats files are doubly nested (`data[period][map]`); reference files (`cards.json`, `commanders.json`) are flat arrays.
- Files: `metadata.json`, `commander_stats.json`, `matchups.json`, `card_stats.json`, `commander_card_stats.json`, `trends.json`, `commander_trends.json`, `game_distributions.json`, `deck_composition.json`, `duration_winrates.json`, `action_winrates.json`, `turn_winrates.json`, `first_turn.json`, `cards.json`, `commanders.json`.
- The site reads only from these files — no runtime API calls.

### 4. Frontend (`site/`)
- Vanilla HTML/CSS/JS. No build step, no framework.
- Dark theme. Chart.js 4 for all visualizations.
- Multi-page architecture with shared nav and time filter.
- Hosted on GitHub Pages.

#### Pages

| Page | File | Content |
|------|------|---------|
| Home | `index.html` | Overview stats, distribution charts, first-turn summary, quick-link cards |
| Commanders | `commanders.html` | Commander grid, winrate-by-turns/actions/duration tables (Turns → Actions → Duration), deck composition charts, detail modal |
| Cards | `cards.html` | 9-column card table with stacked sub-line counts, search, faction filter, commander dropdown, card hover preview, clickable rows |
| Meta | `meta.html` | Faction popularity trends, commander popularity trends, commander matchup heatmap (with game counts), first-turn advantage by commander, patron trends placeholder |

#### JavaScript Structure

| File | Role |
|------|------|
| `js/shared.js` | Constants, helpers, data loading, time/map filters, modal, tooltip system |
| `js/home.js` | Overview stats, distribution charts, first-turn summary |
| `js/commanders.js` | Commander grid, winrate bucket tables (turns/actions/duration), deck composition rendering |
| `js/cards.js` | Card table with stacked sub-line counts, search, sorting, faction filter, commander dropdown, card hover preview |
| `js/meta.js` | Faction + commander trends charts, matchup heatmap, first-turn commander chart |

Each page loads `shared.js` first (globals, not ES modules), then its page-specific script. All pages share: nav with active state, sticky time/map filter bar, footer. Each page loads only the JSON files it needs via `loadData(keys)` rather than fetching all 13 files.

#### Interactive Features
- Sortable card table with stacked sub-line counts (raw counts beneath each %), debounced search, commander dropdown, and card hover preview (artwork popup)
- Null/low-sample winrates sort to bottom regardless of direction
- Matchup heatmap with hover tooltips (including mirror matches on diagonal)
- Clickable deck composition charts opening commander detail modal
- Info tooltips (`?` icons) explaining stats, columns, and chart meanings
- Global time period filter (1M / 3M / 6M / All) re-renders all sections
- Global map filter (All Maps / Dunes / Snowmelt / Tropics) re-renders all sections
- First-turn advantage summary (Overview) and per-commander chart (Meta)
- Graceful empty-state handling when map/period combos have insufficient data

### 5. Asset Pipeline (Thumbnails)
- Source artwork lives in `Artwork/` (commanders + cards) and `CardScreenshots/` (card previews).
- The data pipeline (`scripts/pipeline/io_helpers.py`) generates optimized JPEG thumbnails:
  - **Commander art**: `Artwork/<name>.png` → `site/assets/commanders/<slug>.jpg` (400px wide). Only files matching commander names in `StandardFormatCommanders.csv` are processed.
  - **Card previews**: `CardScreenshots/<name>.png` → `site/assets/cards/<slug>.jpg` (600px wide).
- Thumbnails are only regenerated when the source image is newer than the target (or target is missing).
- New art added to `Artwork/` or `CardScreenshots/` is automatically picked up on the next pipeline run.

### 6. Statistics Documentation (`docs/statistics/`)
- [METHODOLOGY.md](statistics/METHODOLOGY.md) — Statistical significance guide: sample size thresholds, confidence intervals, z-tests, multiple testing corrections, practical significance.
- [tracked-stats.md](statistics/tracked-stats.md) — Catalog of every stat computed and displayed, organized by page, with source files, calculations, minimum sample sizes, and caveats.

## Data Update Flow

1. GitHub Actions triggers (cron daily at 06:00 UTC, or manual `workflow_dispatch`).
2. Pipeline script connects to AWS using secrets stored in GitHub.
3. Queries are run, data is aggregated and transformed.
4. JSON files are written to `site/data/`.
5. Changes are committed and pushed, triggering a GitHub Pages deploy.

## Boundaries

- **Pipeline ↔ Frontend**: Communicate only through `site/data/*.json`. No shared runtime state.
- **AWS ↔ Pipeline**: Read-only. Credentials stored in GitHub Secrets, never in code.
- **Frontend ↔ User**: Static files only. No server-side rendering, no auth required.
