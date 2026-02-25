# Tracked Statistics

Every stat computed by the pipeline and displayed on the dashboard, organized by page.

---

## Overview Page (`index.html`)

### Summary Stats

| Stat | Source | Calculation | Min Sample | Caveats |
|------|--------|-------------|-----------|---------|
| Total Matches | `metadata.json` | Count of all games | 1 | Includes all game types |
| Unique Cards | `metadata.json` | Count distinct cards across all decks | 1 | Only cards that appear in at least one deck |
| Top Commander | `commander_stats.json` | Commander with highest game count | 10 | Popularity, not strength |
| Best Winrate | `commander_stats.json` | Commander with highest winrate (min 10 games) | 10 | See methodology for CI |
| First-Turn WR | `first_turn.json` | `first_player_wins / total_fp_tracked_games` | 10 | Only games with fp=1 or fp=2 |

### Distribution Charts

| Stat | Source | Calculation | Min Sample | Caveats |
|------|--------|-------------|-----------|---------|
| Game Duration | `game_distributions.json` | Histogram of `duration_minutes` bucketed by 5-min intervals | 10 games | Some games may have missing duration |
| Turns per Game | `game_distributions.json` | Histogram of `turns` per game | 10 games | |
| Actions per Turn | `game_distributions.json` | Histogram of `actions_per_turn` average | 10 games | Averaged per game, not per individual turn |

---

## Commanders Page (`commanders.html`)

### Commander Cards (Grid)

| Stat | Source | Calculation | Min Sample | Caveats |
|------|--------|-------------|-----------|---------|
| Winrate | `commander_stats.json` | `wins / matches` per commander | 5 (shown as "--" below) | CI can be wide with <100 games |
| Matches | `commander_stats.json` | Count of games where commander was played | 1 | |
| Faction | `commander_stats.json` | Commander's faction affiliation | n/a | Static property |

### Winrate by Player Turns

| Stat | Source | Calculation | Min Sample | Caveats |
|------|--------|-------------|-----------|---------|
| Per-bucket winrate | `turn_winrates.json` | `wins / total` per commander per turn-count bucket | 5 games/cell | Buckets: 1-5, 5-8, 8-11, 11-14, 14+ turns. Turns = number of turns that specific player took. |
| Games per bucket | `turn_winrates.json` | Count of games in each turn range | 1 | Shown below each winrate cell |

### Winrate by Player Actions

| Stat | Source | Calculation | Min Sample | Caveats |
|------|--------|-------------|-----------|---------|
| Per-bucket winrate | `action_winrates.json` | `wins / total` per commander per action-count bucket | 5 games/cell | Buckets: 0-30, 30-60, 60-90, 90-120, 120+ actions. Actions = total moves a player makes. |
| Games per bucket | `action_winrates.json` | Count of games in each action range | 1 | Shown below each winrate cell |

### Winrate by Game Duration

| Stat | Source | Calculation | Min Sample | Caveats |
|------|--------|-------------|-----------|---------|
| Per-bucket winrate | `duration_winrates.json` | `wins / total` per commander per duration bucket | 5 games/cell | Buckets: 0-10, 10-20, 20-30, 30+ minutes. Shown as "--" below 5 games. |
| Games per bucket | `duration_winrates.json` | Count of games in each duration range | 1 | Shown below each winrate cell |

### Deck Composition

| Stat | Source | Calculation | Min Sample | Caveats |
|------|--------|-------------|-----------|---------|
| Avg Mana Cost | `deck_composition.json` | Mean cost across all cards in all decks for this commander | 5 decks | Weighted by card count, not deck count |
| Avg Minion Count | `deck_composition.json` | Mean number of minion cards per deck | 5 decks | |
| Avg Spell Count | `deck_composition.json` | Mean number of spell cards per deck | 5 decks | |
| Avg Patron Cards | `deck_composition.json` | Mean number of same-faction cards per deck | 5 decks | |
| Avg Neutral Cards | `deck_composition.json` | Mean number of neutral cards per deck | 5 decks | |
| Avg Other Cards | `deck_composition.json` | Mean number of off-faction (non-neutral, non-patron) cards | 5 decks | |

### Commander Detail Modal

| Stat | Source | Calculation | Min Sample | Caveats |
|------|--------|-------------|-----------|---------|
| Cost Histogram (All/Win/Loss) | `deck_composition.json` | Avg card count at each mana cost, split by game outcome | 5 decks | Reveals whether winners play different curves |
| Type Donut | `deck_composition.json` | Minion vs Spell ratio as donut chart | 5 decks | |
| Loyalty Donut | `deck_composition.json` | Patron/Neutral/Other as donut chart | 5 decks | |

---

## Cards Page (`cards.html`)

9-column table with stacked sub-line counts. Each percentage cell shows the raw count beneath it in small muted text so all numbers are verifiable by multiplication. Card rows are clickable (prep for future detail popup). Cards with insufficient data (< 5 games for winrates) show "--" and sort to the bottom regardless of sort direction.

### Table Columns

| Column | Sort Key | Source | Sub-line | Style |
|--------|----------|--------|----------|-------|
| Card | `name` | `card_stats.json` | — | Normal |
| Faction | `faction` | `card_stats.json` | — | Normal |
| Type | `type` | `card_stats.json` | — | Normal |
| Included | `deck_rate` | `card_stats.json` | "X of Y" (deck_count of total_games) | Normal |
| Drawn WR | `drawn_winrate` | `card_stats.json` | "N games" (sample size) | Colored (green >52%, red <48%) |
| Played WR | `played_winrate` | `card_stats.json` | "N games" (sample size) | Colored |
| Drawn Rate | `drawn_rate` | `card_stats.json` | "N of Y" (drawn_count of total_games) | De-emphasized |
| Played Rate | `played_rate` | `card_stats.json` | "N of Y" (played_count of total_games) | De-emphasized |
| Avg Copies | `avg_copies` | `card_stats.json` | — | Normal |

### Stat Definitions

| Stat | Calculation | Min Sample | Caveats |
|------|-------------|-----------|---------|
| Included | `deck_count / total_player_games` | 1 | Global: total_player_games = total_matches × 2. Commander: total = commander's games. |
| Drawn WR | `wins_when_drawn / games_where_drawn` | 5 (shown as "--" below) | Correlation, not causation |
| Played WR | `wins_when_played / games_where_played` | 5 (shown as "--" below) | Stronger signal than drawn WR for card impact |
| Drawn Rate | `games_where_drawn / total_games` | 1 | De-emphasized. |
| Played Rate | `games_where_played / total_games` | 1 | De-emphasized. A card can be drawn but not played. |
| Avg Copies | `total_copies / deck_count` | 1 | Average copies per deck that includes this card. Max 3. |

### Per-Commander View

When a commander is selected via the dropdown, all stats are scoped to that commander's games. Data comes from `commander_card_stats.json` (lazy-loaded on first selection). All cards for the commander are shown (no limit). The `total_games` denominator in sub-lines becomes the commander's total games instead of all player-games.

---

## Meta Page (`meta.html`)

### Faction Popularity Over Time

| Stat | Source | Calculation | Min Sample | Caveats |
|------|--------|-------------|-----------|---------|
| Weekly faction % | `trends.json` | `faction_games_this_week / total_games_this_week * 100` | 4 games/week | Weeks with <4 games dropped |

### Commander Popularity Over Time

| Stat | Source | Calculation | Min Sample | Caveats |
|------|--------|-------------|-----------|---------|
| Weekly commander % | `commander_trends.json` | `commander_games_this_week / total_games_this_week * 100` | 4 games/week | Noisy for less-played commanders |

**UI behavior**: Defaults to the single most popular commander selected. Users toggle commanders on/off via clickable pills above the chart. Each commander renders as a separate line (not stacked area).

### Commander Matchups (Heatmap)

| Stat | Source | Calculation | Min Sample | Caveats |
|------|--------|-------------|-----------|---------|
| Matchup winrate | `matchups.json` | `row_wins_vs_col / total_games_between` | 5 (shown as "--" below) | Most matchup pairs have 10-50 games |
| Game count | `matchups.json` | Total games between the two commanders | 1 | Shown in cell and tooltip |
| Mirror matches | `matchups.json` | Count of games where both players use same commander | 1 | Diagonal cells; winrate meaningless (always ~50%) |

### Matchup Detail Modal

Opened by clicking a cell in the heatmap. Shows the head-to-head breakdown for a specific commander pair. The modal includes its own time period and map filter bar so users can drill into specific slices without closing the modal.

| Stat | Source | Calculation | Min Sample | Caveats |
|------|--------|-------------|-----------|---------|
| Total games | `matchup_details.json` | Count of games between the pair | 1 | |
| Win/Loss record | `matchup_details.json` | Wins and losses for the row commander | 1 | |
| Going First WR | `matchup_details.json` | WR when row commander goes first | 5 | Only games with explicit `first_player` (see Data Anomalies below) |
| Going Second WR | `matchup_details.json` | WR when row commander goes second | 5 | |
| Top cards (win/loss) | `matchup_details.json` | Most common cards in winning vs losing decks | 3 | Raw counts, not rates |

### First-Turn Advantage

| Stat | Source | Calculation | Min Sample | Caveats |
|------|--------|-------------|-----------|---------|
| Overall FP winrate | `first_turn.json` | `first_player_wins / total_fp_tracked_games` | 10 | Only games with explicit fp=1 or fp=2 |
| Per-commander FP WR | `first_turn.json` | First/second winrate split per commander | 10 per position | Commanders with <10 first OR second games hidden |

---

## Data Dimensions

All stats (except reference files) support two filter dimensions:

| Dimension | Values | Notes |
|-----------|--------|-------|
| Time Period | `all`, `6m`, `3m`, `1m` | Months before current date |
| Map | `all`, `Dunes`, `Snowmelt`, `Tropics` | All Maps aggregates across all maps |

Data is nested as `data[period][map]`. Smaller slices (e.g., 1M + Tropics) will have very few games and unreliable stats.

---

## Reference Data (No Filters)

| File | Contents | Notes |
|------|----------|-------|
| `cards.json` | Full card catalog (name, faction, type, subtype, cost, art path) | Flat array, not period/map nested |
| `commanders.json` | Commander list (name, faction, art path) | Flat array |

---

## Pre-Aggregation Filters (Data Cleaning)

Every game from the database passes through `clean_game()` before entering any stat. Games that fail these checks are silently dropped — they never appear in any stat on any page.

| Filter | Condition to **reject** | Why |
|--------|------------------------|-----|
| Never started | `firstPlayer = "0"` or `firstPlayer = 0` | Game was created but never began |
| No players | `players` field is missing, empty, or unparseable JSON | Corrupted database entry |
| Solo game | `numPlayers < 2` | Practice/tutorial games; not competitive 1v1 |
| Too short | Either player has `turnsTaken < 3` (MIN_TURNS = 3) | Abandoned or instant-quit games that would pollute winrates. A game where each player takes only 2 turns is too short to be meaningful. |

### Data Anomalies

These are valid games that pass cleaning but behave differently in specific stats:

| Anomaly | Affected field | How it's handled |
|---------|---------------|-----------------|
| `firstPlayer = "99"` | First-turn stats | Means "random" or "unknown" — the game client didn't record who went first. The game is **included** in overall win/loss counts but **excluded** from Going First / Going Second breakdowns and first-turn advantage stats. This is why total wins + losses in a matchup may not equal going-first-games + going-second-games. |
| `firstPlayer = "abc"` or other non-numeric | First-turn stats | Same handling as "99" — game is valid but excluded from first-turn analysis. |
| Missing `datetime` or `datetimeStarted` | Duration, time filters | Game is still counted in stats but `duration_minutes` is `None`. If `datetimeStarted` is missing, the game won't appear in time-filtered views (1M, 3M, 6M) but will appear in "All". |
| `winner` field missing | Win/loss attribution | Defaults to `false` — the player is counted as a loser. |

### Commander & Card Name Normalization

Old or misspelled names from earlier versions of the game client are silently renamed during cleaning:

| Raw name in database | Normalized to | Why |
|---------------------|---------------|-----|
| `Elber, Jungle Emmisary` | `Elber, Jungle Emissary` | Typo fix in game client |
| `Layna, Soulcatcher` | `Soultaker Viessa` | Commander was renamed |

The full rename maps are in `scripts/pipeline/constants.py` (`COMMANDER_RENAMES` and `CARD_RENAMES`). Any name not in the map passes through unchanged.
