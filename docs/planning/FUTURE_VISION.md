# Future Vision — Atlas Conquest Analytics

> Ideas and roadmap for expanding the analytics platform. Organized by effort level and data availability.

---

## Quick Wins (existing data, minimal pipeline work)

### Per-Commander Card Usage Rates
Which cards does each commander run most? Surface the top 10-15 cards per commander with inclusion rates and win-when-included rates. Data already exists in deck logs — just needs a new aggregation pass.

### Most Common Decklists / Archetype Clustering
Group decks by similarity (e.g., Jaccard index on card lists) to identify archetypes. Show "Aggro Elber" vs "Midrange Elber" style breakdowns. Raw deck data is already captured.

### Card Synergy Pairs
Cards that appear together in winning decks more often than chance. A co-occurrence matrix filtered by winrate delta would surface natural synergy pairs (e.g., "Card A + Card B together = +8% WR").

### Commander Popularity Trends Over Time
Currently we show faction-level trends. Extending this to per-commander popularity would show which commanders are rising/falling in the meta week over week.

### Win Rate by Game Duration
Do certain commanders or archetypes perform better in short games vs long games? Cross-reference game duration with commander winrates.

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
Full-page view per card with:
- Card artwork
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

### API Layer
Expose the aggregated data via a simple REST API so community tools (Discord bots, third-party sites) can consume it programmatically.
