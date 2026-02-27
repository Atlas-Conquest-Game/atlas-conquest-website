# Future Vision — Atlas Conquest Analytics

> Ideas and roadmap for expanding the analytics platform. Organized by effort level and data availability.

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
