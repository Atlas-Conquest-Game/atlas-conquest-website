# Future Vision — Atlas Conquest Analytics

> Ideas and roadmap for expanding the analytics platform. Organized by effort level and data availability.

---

## Completed

### Per-Commander Card Usage Rates
Full per-commander card stats with inclusion rate, drawn/played winrates, avg copies, and raw counts. All cards shown (no limit). Lazy-loaded via `commander_card_stats.json`. Commander dropdown on Cards page.

### Commander Popularity Trends Over Time
Per-commander weekly stacked area chart on Meta page via `commander_trends.json`.

### Win Rate by Game Duration / Actions / Turns
Three sortable bucket tables on Commanders page (displayed in order: Turns → Actions → Duration) via `turn_winrates.json`, `action_winrates.json`, `duration_winrates.json`.

### Card Hover Preview
Card artwork popup on hovering card name in the card table. Shows 250px card image with flip logic near viewport edges.

### Matchup Detail Modal
Clickable heatmap cells open a detail popup showing commander portraits, overall win rate, W-L record, first-turn advantage per commander (going first/second), and top 10 cards by played and drawn winrate for each commander in the matchup. Filters update the modal in real-time. Data from `matchup_details.json`.

### Cards Page Condensed Layout
9-column table with stacked sub-line counts showing raw numbers beneath percentages for verifiability. Low-sample winrates (< 5 games) sink to bottom of sort.

---

## Quick Wins (existing data, minimal pipeline work)

### Most Common Decklists / Archetype Clustering
Group decks by similarity (e.g., Jaccard index on card lists) to identify archetypes. Show "Aggro Elber" vs "Midrange Elber" style breakdowns. Raw deck data is already captured.

### Card Synergy Pairs
Cards that appear together in winning decks more often than chance. A co-occurrence matrix filtered by winrate delta would surface natural synergy pairs (e.g., "Card A + Card B together = +8% WR").

### Mulligan Data Analysis
Leverage mulligan data to surface which cards players keep vs throw back, and how mulligan decisions correlate with winrate. Potential stats: mulligan rate per card, winrate when kept vs mulliganed, average cards mulliganed per commander, and whether aggressive mulliganing correlates with higher winrates for specific commanders or archetypes.

**Blocker**: Mulligan data does not currently exist in the raw game data. `clean_game()` only extracts `cardsDrawn`, `cardsPlayed`, and `cards_in_deck`. Would need game client changes to track cards kept/mulliganed in opening hand.

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

### API Layer
Expose the aggregated data via a simple REST API so community tools (Discord bots, third-party sites) can consume it programmatically.
