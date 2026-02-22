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

### 2. Data Pipeline (`scripts/`)
- Python scripts that query AWS and transform raw data into aggregated JSON.
- Runs in GitHub Actions on a schedule (daily) or manual trigger.
- Incremental fetching: caches raw games in `raw_games.json`, only pulls new games from DynamoDB.
- Computes per-period aggregations (all / 6m / 3m / 1m): commander stats, matchups, card stats, meta trends, game distribution histograms, and per-commander deck composition breakdowns.
- Output: static JSON files committed to `site/data/`.

### 3. Data Contract (`site/data/`)
- Static JSON files are the interface between the pipeline and the frontend.
- Each file has a defined schema documented in [DATA_MODEL.md](DATA_MODEL.md).
- Stats files are period-nested (`{all, 6m, 3m, 1m}`); reference files are flat arrays.
- Files: `metadata.json`, `commander_stats.json`, `matchups.json`, `card_stats.json`, `trends.json`, `game_distributions.json`, `deck_composition.json`, `cards.json`, `commanders.json`.
- The site reads only from these files — no runtime API calls.

### 4. Frontend (`site/`)
- Vanilla HTML/CSS/JS. No build step, no framework.
- Dark theme. Chart.js 4 for all visualizations.
- Multi-page architecture with shared nav and time filter.
- Hosted on GitHub Pages.

#### Pages

| Page | File | Content |
|------|------|---------|
| Home | `index.html` | Overview stats, distribution charts, quick-link cards |
| Commanders | `commanders.html` | Commander grid, winrate chart/table, matchup heatmap, deck composition, detail modal |
| Cards | `cards.html` | Full card table (261 cards), search, faction filter, sortable columns |
| Meta | `meta.html` | Stacked area chart of faction popularity over time |

#### JavaScript Structure

| File | Role |
|------|------|
| `js/shared.js` | Constants, helpers, data loading, time filter, modal, tooltip system |
| `js/home.js` | Overview stats and distribution chart rendering |
| `js/commanders.js` | Commander, matchup, and deck composition rendering |
| `js/cards.js` | Card table with search, sorting, and faction filter |
| `js/meta.js` | Meta trends chart rendering |

Each page loads `shared.js` first (globals, not ES modules), then its page-specific script. All pages share: nav with active state, sticky time filter bar, footer.

#### Interactive Features
- Sortable card table with debounced search (filters by name, type, subtype)
- Matchup heatmap with hover tooltips
- Clickable deck composition charts opening commander detail modal
- Info tooltips (`?` icons) explaining stats, columns, and chart meanings
- Global time period filter (1M / 3M / 6M / All) re-renders all sections

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
