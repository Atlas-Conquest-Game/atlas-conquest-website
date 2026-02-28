# Analytics Vision — Atlas Conquest

> Roadmap for expanding the analytics platform. Organized by effort level and data availability.
> For site-wide features (deck tools, landing page, community), see [SITE_VISION.md](SITE_VISION.md).

---

## Current UI/UX Assessment (Feb 2026)

Observations from visual review across desktop (1280px) and mobile (375px).

### What's Working

- **Consistent design system**: All 5 analytics pages share the same dark editorial aesthetic, filter bar, header pattern, and footer. Navigation feels cohesive.
- **Two-tier nav**: Primary nav (Home/Analytics/Decks) + sub-nav (Overview/Commanders/Cards/Meta/Mulligan) is clear and intuitive. Sub-nav scrolls horizontally on mobile.
- **Filter bar**: Period (1M/3M/6M/All) + Map (All/Dunes/Snowmelt/Tropics) is immediately understandable. Button pill style reads well.
- **Info tooltips (?)**: Every metric has an info icon for definition. Good for a data-dense product.
- **Collapsible sections on Meta**: Disclosure triangles let users focus on what they care about. Good pattern to extend to other pages.
- **Cross-page navigation cards on Overview**: The bottom cards linking to Commanders, Cards, Meta give new visitors a clear next step.
- **Card/Mulligan filtering**: Faction pill buttons + commander dropdown + search box is a powerful filter stack that composes well.

### Issues to Fix

- **Mobile table overflow (Cards + Mulligan)**: Tables have 9-10 columns. On mobile, only the first 3-4 columns (Card, Faction, Type) are visible — the critical data columns (winrates, rates) are clipped off-screen with no horizontal scroll indicator. This is the single biggest mobile UX problem.
- **KPI cards stacking (Overview + Mulligan)**: Each KPI card takes full width on mobile, creating excessive vertical scroll. The Overview page is extremely long on mobile because 4 single-value KPIs stack vertically, followed by 3 empty chart areas. A 2x2 compact grid would halve the scroll.
- **Filter bar wrapping**: At 375px the Period + Map filter buttons wrap but the "All Maps" label gets visually cramped. The two groups (Period, Map) could benefit from stacking vertically on mobile.
- **Empty state / loading UX**: When Chart.js hasn't loaded data yet, chart areas are featureless dark boxes. No skeleton UI, spinner, or "No data" messaging. Functional but feels broken to a first-time visitor.
- **Sub-nav active state**: The currently active sub-nav link lacks strong visual differentiation. A bottom border or background highlight would help orientation.
- **Commanders page empty tables**: The "Winrate by Turns/Actions/Duration" tables collapse to just headers with no rows when data hasn't loaded — looks like broken content rather than a loading state.

### Opportunities

- **Sticky filter bar**: On long pages (especially Meta with 6 sections), the filter bar scrolls out of view. A sticky position would let users change filters without scrolling back to the top.
- **Mobile-first table redesign**: For Cards and Mulligan, consider a card-based layout on mobile (one card per row showing name + key stats) instead of the wide table. The table works great on desktop.
- **Default collapsed on mobile**: Meta page sections could default to collapsed on mobile (detected via viewport width) to reduce initial scroll depth.
- **Matchup heatmap touch UX**: The heatmap will need horizontal scroll + pinch-to-zoom on mobile once it has data. Consider a "tap to see details" pattern for individual cells.

---

## Quick Wins (existing data, minimal pipeline work)

### Meta Health Indicator
A single summary metric on the Meta page showing how balanced the current meta is. Options: matchup polarization score (std dev of winrates in the heatmap), commander diversity index (Shannon entropy of pick rates), or a composite. Post-clustering: compare archetype diversity too.

### Recent Shifts Callout
A "What changed this month" summary at the top of the Meta page. Auto-generated from trends data: which commanders gained/lost the most pick rate, which had the biggest winrate swings. Would make the trends data more immediately actionable.

### Most Common Decklists / Archetype Clustering
Group decks by similarity (e.g., Jaccard index on card lists) to identify archetypes. Show "Aggro Elber" vs "Midrange Elber" style breakdowns. Raw deck data is already captured.

### Card Synergy Pairs
Cards that appear together in winning decks more often than chance. A co-occurrence matrix filtered by winrate delta would surface natural synergy pairs (e.g., "Card A + Card B together = +8% WR").

### Mulligan Data Analysis
Mulligan data (`mulliganKept` and `mulliganReturned`) is now captured in game data and surfaced on a dedicated Mulligan page. Phase 1 tracks keep rate, keep winrate, return winrate, and winrate delta per card — globally and per-commander. Count-weighted for duplicate copies in opening hands.

**Phase 2 ideas:**
- Bayesian shrinkage (Beta-Binomial with weak prior) for small-sample keep-rate estimates
- Wilson score confidence intervals displayed as error bars
- Average cards mulliganed per commander (mulligan aggressiveness metric)
- Mulligan-specific trends over time (are players learning which cards to keep?)
- Card synergy analysis: which pairs of cards are kept together most often?
- Auto-mulligan recommender based on aggregate keep-rate data

---

## Internal Team Tools (balance & design insights)

### Patch Impact Reports
Before/after winrate comparisons around patch dates. Automatically flag commanders or cards with statistically significant winrate shifts post-patch.

**Upcoming**: The game client will soon include a **version attribute** in game logs. Once available, the pipeline can use this to split data by game version instead of relying on date-based heuristics for patch boundaries. This will enable precise before/after comparisons and version-tagged stats.

### Balance Health Metrics
- **Matchup Skew Score**: How polarized is the matchup table? A healthy meta has most matchups near 50%.
- **Card Inclusion Outliers**: Cards that appear in >80% of a faction's decks may be auto-includes worth examining.
- **First-Turn Advantage by Patch**: Track whether design changes are reducing or increasing first-mover advantage.

### Card Power Level Scoring
Combine drawn winrate, played winrate, and drawn-to-played delta into a composite "power score." Cards with high drawn WR but low played rate might indicate draw-luck correlation rather than true power.

### Map Balance Analysis
As more games are played on Snowmelt and Tropics, compare per-map commander winrates to identify map-specific balance issues.

---

## Player-Facing Features (Scryfall-style)

### Individual Card Detail Pages
Card rows are already clickable (prep work done) and hover preview shows artwork. Next step: full detail popup/page per card with:
- Card artwork (larger)
- Drawn/played rates and winrates over time
- Which commanders use it most
- Synergy pairs
- Winrate in different matchups

### Deck Builder with Winrate Estimation
Let players assemble a deck and see estimated winrate based on historical data for similar card compositions.

### Player Profiles / Leaderboard
If player IDs are stable across games, surface per-player stats: games played, winrate, favorite commanders, rating history.

### Tournament Meta Snapshots
Capture and display the meta at specific tournament dates — what was popular, what won, how the meta shifted after.

---

## Infrastructure

### Internal vs External Site Split
The current site will eventually split into:
- **Public site**: Player-facing analytics (card database, meta trends, leaderboard)
- **Internal dashboard**: Balance tools, patch reports, raw data exploration

Both can share the same data pipeline and JSON output format. The split is purely at the frontend layer — different pages/views, different access controls.

### Real-Time Data Pipeline
Currently daily batch via GitHub Actions. Future option: stream game results via webhook for near-real-time updates. Would require a lightweight backend (Lambda + API Gateway) but the static JSON contract stays the same.

### Player Pipeline Monitoring & Game Usage Tracking
Track the health and growth of the player base over time:
- **Daily/weekly active players**: Unique players per day/week, trended over time. Detect growth, churn, or seasonal patterns.
- **New vs returning players**: If player IDs are stable, track first-seen dates to distinguish new players from regulars.
- **Games per day/week**: Volume trends — is the game growing? Are there spikes around events or patches?
- **Session depth**: How many games does a typical player play per session? Are players playing one game and leaving, or binging?
- **Peak hours**: When are games being played? Useful for scheduling events or server capacity.
- **Pipeline health monitoring**: Track data freshness (time since last game), pipeline run success/failure rates, and data completeness (% of games passing `clean_game()` filters). Alert via Discord if the pipeline hasn't seen new data in X days.

This data is already available in `raw_games.json` (datetime + player names). Implementation would add a `player_activity.json` output from the pipeline and a new dashboard section or page.

### API Layer
Expose the aggregated data via a simple REST API so community tools (Discord bots, third-party sites) can consume it programmatically. The Discord daily summary bot (`scripts/daily_summary.py`) is a reference implementation — it reads from `raw_games.json` and posts stats to a Discord webhook as part of the existing GitHub Actions pipeline.

---

## Dashboard UX Improvements

### Unified Filter State
Persist the selected time period and map filter across page navigations using `sessionStorage`. Currently each analytics page resets to defaults when navigated to.

### Commander Deep Links from Landing Page
Commander cards in the landing page carousel could link to `commanders.html#<commander-name>` for direct access to that commander's analytics. Requires adding anchor-based scrolling to `commanders.js`.

### Mobile Table Redesign (Cards + Mulligan)
The 9-10 column data tables are unreadable on mobile — only the first 3-4 columns are visible with no scroll indicator. Options:
- **Card-based layout**: On viewports <768px, render each card/row as a stacked "card" showing name, faction, and 3-4 key stats. Most impactful.
- **Horizontal scroll with indicator**: Add `overflow-x: auto` with a visible scroll shadow/arrow hint.
- **Column priority**: Hide low-priority columns (Avg Copies, Played Rate) on mobile via `display: none` at breakpoint.

### Mobile KPI Layout
Overview and Mulligan pages stack single-value KPIs as full-width cards on mobile, creating excessive scroll. Switch to a 2x2 compact grid at mobile breakpoints.

### Loading States + Empty States
Chart areas and tables currently show blank dark boxes when data hasn't loaded. Add:
- Skeleton shimmer placeholders for chart areas
- "Loading..." text in chart containers (not just tables)
- "No data for this filter" messaging when a period/map combination has no matches

### Sticky Filter Bar
On long pages (Meta has 6 sections, Overview scrolls far on mobile), pin the filter bar below the nav so users can change Period/Map without scrolling back up.

---

## Related Vision Docs

- [LANDING_PAGE_VISION.md](LANDING_PAGE_VISION.md) — Landing page design goals and roadmap
- [DECKS_VISION.md](DECKS_VISION.md) — Deck tools and community deck features
- [SITE_VISION.md](SITE_VISION.md) — Unified site structure and navigation
