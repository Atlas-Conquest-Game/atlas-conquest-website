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

### Winrate by Game Duration

| Stat | Source | Calculation | Min Sample | Caveats |
|------|--------|-------------|-----------|---------|
| Per-bucket winrate | `duration_winrates.json` | `wins / total` per commander per duration bucket | 5 games/cell | Buckets: 0-10, 10-20, 20-30, 30+ minutes. Shown as "--" below 5 games. |
| Games per bucket | `duration_winrates.json` | Count of games in each duration range | 1 | Shown below each winrate cell |

### Winrate by Player Actions

| Stat | Source | Calculation | Min Sample | Caveats |
|------|--------|-------------|-----------|---------|
| Per-bucket winrate | `action_winrates.json` | `wins / total` per commander per action-count bucket | 5 games/cell | Buckets: 0-30, 30-60, 60-90, 90-120, 120+ actions. Actions = total moves a player makes. |
| Games per bucket | `action_winrates.json` | Count of games in each action range | 1 | Shown below each winrate cell |

### Winrate by Player Turns

| Stat | Source | Calculation | Min Sample | Caveats |
|------|--------|-------------|-----------|---------|
| Per-bucket winrate | `turn_winrates.json` | `wins / total` per commander per turn-count bucket | 5 games/cell | Buckets: 1-5, 5-8, 8-11, 11-14, 14+ turns. Turns = number of turns that specific player took. |
| Games per bucket | `turn_winrates.json` | Count of games in each turn range | 1 | Shown below each winrate cell |

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

### Global Card Stats

| Stat | Source | Calculation | Min Sample | Caveats |
|------|--------|-------------|-----------|---------|
| Inclusion % | `card_stats.json` | `deck_count / total_player_games` | 1 | Always visible. Rate across all decks. |
| Drawn Winrate | `card_stats.json` | `wins_when_drawn / games_where_drawn` | 5 (shown as "--" below) | Correlation, not causation |
| Played Winrate | `card_stats.json` | `wins_when_played / games_where_played` | 5 (shown as "--" below) | Stronger signal than drawn WR for card impact |
| Drawn Rate | `card_stats.json` | `games_where_drawn / total_games` | 1 | De-emphasized. Rate across all games. |
| Played Rate | `card_stats.json` | `games_where_played / total_games` | 1 | De-emphasized. A card can be drawn but not played. |
| # Drawn | `card_stats.json` | Raw count of times drawn | 1 | De-emphasized. |
| # Played | `card_stats.json` | Raw count of times played | 1 | De-emphasized. |
| Avg Copies | `card_stats.json` | `total_copies / deck_count` | 1 | Average copies per deck that includes this card. Max 3. |

### Per-Commander Card Stats (Commander Dropdown)

| Stat | Source | Calculation | Min Sample | Caveats |
|------|--------|-------------|-----------|---------|
| Inclusion % | `commander_card_stats.json` | `decks_with_card / total_decks` for that commander | 10 decks | All cards shown (no limit). |
| Drawn Winrate | `commander_card_stats.json` | `drawn_wins / games_drawn` | 5 | Small samples per commander-card pair |
| Played Winrate | `commander_card_stats.json` | `played_wins / games_played` | 5 | Most commander-card combos have <30 games |
| Drawn Rate | `commander_card_stats.json` | `games_drawn / commander_games` | 10 games | De-emphasized. Scoped to this commander. |
| Played Rate | `commander_card_stats.json` | `games_played / commander_games` | 10 games | De-emphasized. |
| # Drawn | `commander_card_stats.json` | Raw count of times drawn for this commander | 1 | De-emphasized. |
| # Played | `commander_card_stats.json` | Raw count of times played for this commander | 1 | De-emphasized. |
| Avg Copies | `commander_card_stats.json` | `total_copies / deck_count` per commander | 1 | Avg copies in this commander's decks. |

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

### Commander Matchups (Heatmap)

| Stat | Source | Calculation | Min Sample | Caveats |
|------|--------|-------------|-----------|---------|
| Matchup winrate | `matchups.json` | `row_wins_vs_col / total_games_between` | 5 (shown as "--" below) | Most matchup pairs have 10-50 games |
| Game count | `matchups.json` | Total games between the two commanders | 1 | Shown in cell and tooltip |
| Mirror matches | `matchups.json` | Count of games where both players use same commander | 1 | Diagonal cells; winrate meaningless (always ~50%) |

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
