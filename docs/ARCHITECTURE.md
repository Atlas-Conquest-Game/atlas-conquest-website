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
| `pipeline/io_helpers.py` | AWS, CSV loading, cache, thumbnails, cardlist update, `write_json()` |
| `pipeline/main.py` | `build_and_write_all()`, `main()` — orchestration |
| `daily_summary.py` | Generates yesterday's game summary for Discord notifications |

### 3. Data Contract (`site/data/`)
- Static JSON files are the interface between the pipeline and the frontend.
- Each file has a defined schema documented in [DATA_MODEL.md](DATA_MODEL.md).
- Stats files are doubly nested (`data[period][map]`); reference files (`cards.json`, `commanders.json`) are flat arrays.
- Files: `metadata.json`, `commander_stats.json`, `matchups.json`, `card_stats.json`, `commander_card_stats.json`, `trends.json`, `commander_trends.json`, `commander_winrate_trends.json`, `game_distributions.json`, `deck_composition.json`, `duration_winrates.json`, `action_winrates.json`, `turn_winrates.json`, `first_turn.json`, `mulligan_stats.json`, `commander_mulligan_stats.json`, `cards.json`, `commanders.json`, `cardlist.json`.
- The site reads only from these files — no runtime API calls.

### 4. Frontend (`site/`)
- Vanilla HTML/CSS/JS. No build step, no framework.
- Dark theme. Chart.js 4 for all visualizations.
- Multi-page architecture with shared nav and time filter.
- Hosted on GitHub Pages.

#### Pages

| Page | File | JS | Content |
|------|------|----|---------|
| Home | `index.html` | (inline) | Game landing page — hero, factions, starter decks, explore links |
| Analytics Overview | `analytics.html` | `home.js` | Overview stats, distribution charts, first-turn summary, quick-link cards |
| Commanders | `commanders.html` | `commanders.js` | Commander grid, winrate-by-turns/actions/duration tables, deck composition charts, detail modal |
| Cards | `cards.html` | `cards.js` | 9-column card table with stacked sub-line counts, search, faction filter, commander dropdown, card hover preview |
| Meta | `meta.html` | `meta.js` | Faction popularity trends, commander popularity/winrate trends (mirror toggle), matchup heatmap, first-turn chart |
| Mulligan | `mulligan.html` | `mulligan.js` | Opening hand keep rates, normalized keep preference, per-commander mulligan stats |
| Decks | `decks.html` | `decks.js` + `deckcode.js` | Import (decode) and build (encode) deck codes; card grid browser with faction rules; mana curve; shareable URL |

#### JavaScript Structure

| File | Role |
|------|------|
| `js/shared.js` | Constants, helpers, data loading, time/map filters, modal, tooltip system (analytics pages only) |
| `js/home.js` | Analytics overview stats, distribution charts, first-turn summary |
| `js/commanders.js` | Commander grid, winrate bucket tables (turns/actions/duration), deck composition rendering |
| `js/cards.js` | Card table with stacked sub-line counts, search, sorting, faction filter, commander dropdown, card hover preview |
| `js/meta.js` | Faction + commander trends/winrate charts, matchup heatmap, first-turn commander chart |
| `js/mulligan.js` | Keep rate table, normalized keep delta chart, per-commander mulligan breakdown |
| `js/deckcode.js` | Deck codec: encode/decode deck codes compatible with Unity game client (14-bit card ID + 6-bit count, 20-bit packed, LSB-first) |
| `js/decks.js` | Deck tools page: card grid browser, mana curve, type breakdown, faction compatibility, hover preview, URL sharing |

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

### 5. Asset Pipeline (Thumbnails + Cardlist)
- Source artwork lives in `Artwork/` (commanders) and `CardScreenshots/` (card previews).
- The data pipeline (`scripts/pipeline/io_helpers.py`) generates optimized JPEG thumbnails:
  - **Commander art**: `Artwork/<name>.png` → `site/assets/commanders/<slug>.jpg` (400px wide). Only files matching commander names in `StandardFormatCommanders.csv` are processed.
  - **Card previews**: `CardScreenshots/<name>.png` → `site/assets/cards/<slug>.jpg` (600px wide).
- Thumbnails are only regenerated when the source image is newer than the target (or target is missing).
- GitHub Actions commits both `site/data/` and `site/assets/` so new thumbnails reach the live site automatically.
- `cardlist.json` is also auto-generated during the pipeline run from `Formats/FullCardList.asset` (exported by Matan before playtests). `scripts/extract_cardlist.py` is a standalone wrapper for running just this step.
- Game format assets live in `Formats/`: `FullCardList.asset` (card name index, used by pipeline) and `Standard.asset` (Unity GUID references — not parseable without the full game project).

### 6. Statistics Documentation (`docs/statistics/`)
- [METHODOLOGY.md](statistics/METHODOLOGY.md) — Statistical significance guide: sample size thresholds, confidence intervals, z-tests, multiple testing corrections, practical significance.
- [tracked-stats.md](statistics/tracked-stats.md) — Catalog of every stat computed and displayed, organized by page, with source files, calculations, minimum sample sizes, and caveats.

## Data Update Flow

1. GitHub Actions triggers (cron daily at 06:00 UTC, or manual `workflow_dispatch`).
2. Pipeline scans DynamoDB for new games, cleans and caches them.
3. Thumbnails regenerated from `Artwork/` and `CardScreenshots/` into `site/assets/`.
4. `cardlist.json` regenerated from `Formats/FullCardList.asset`.
5. `cards.json` and `commanders.json` regenerated from CSVs.
6. All stats files aggregated and written to `site/data/`.
7. Changes committed (`site/data/` + `site/assets/`) and pushed, triggering a GitHub Pages deploy.
8. `scripts/daily_summary.py` posts yesterday's game stats to Discord via webhook.

## Boundaries

- **Pipeline ↔ Frontend**: Communicate only through `site/data/*.json`. No shared runtime state.
- **AWS ↔ Pipeline**: Read-only. Credentials stored in GitHub Secrets, never in code.
- **Frontend ↔ User**: Static files only. No server-side rendering, no auth required.
