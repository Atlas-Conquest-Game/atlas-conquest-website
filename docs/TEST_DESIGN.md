# Pipeline Test Design — What Questions Does Each Test Answer?

> Written before any test code. Each test exists to answer a specific question about data integrity.

---

## Category A: Data Cleaning (`clean_game()`)

The gatekeeper function. Every game passes through here. Returns `None` if invalid.

| # | Question the test answers | Risk it prevents |
|---|---------------------------|------------------|
| A1 | Does a game with `firstPlayer="0"` get rejected? | Games that never started leaking into stats |
| A2 | Does a game with no/empty players data get rejected? | Crash or phantom games from malformed DB entries |
| A3 | Does a game with `numPlayers < 2` get rejected? | Solo practice games inflating commander stats |
| A4 | Does a game where either player has `turnsTaken < 2` get rejected? | Instant-quit games polluting winrates |
| A5 | Does `firstPlayer` work as int (1), string ("1"), and unexpected values ("99", "abc")? | **The exact bug we had** — type changes silently broke first-turn data |
| A6 | Does `winner` work as bool (`True`), string (`"true"`/`"false"`), and missing? | DB type drift silently flipping win/loss attribution |
| A7 | Do `turnsTaken`, `actionsTaken`, card `Count` coerce from string to int correctly? | String numbers like `"7"` from DynamoDB causing crashes or zero-defaults |
| A8 | Does commander name normalization apply? (`"Elber, Jungle Emmisary"` → `"Elber, Jungle Emissary"`) | Duplicate commanders in stats from old misspellings |
| A9 | Does card name normalization apply? | Same card counted as two different cards |
| A10 | Does a valid game produce the correct output shape? (game_id, datetime, players[], first_player, map, duration) | Silent schema changes in the clean output breaking downstream aggregation |
| A11 | Does duration compute correctly from start/end datetimes? | Wrong duration buckets |
| A12 | Does a game with missing datetime still clean successfully? (duration=None) | Over-aggressive filtering throwing out games with partial timestamps |

---

## Category B: Aggregation Math

Each aggregation function takes clean games and produces stats. The core question: **is the math right?**

| # | Question the test answers | Risk it prevents |
|---|---------------------------|------------------|
| B1 | Do `wins + losses = total` for every commander? | Double-counting or missing games |
| B2 | Does `winrate = wins / total` and is it between 0.0 and 1.0? | Division bugs, inverted ratios |
| B3 | In matchups, is `A beats B` counted as a win for A AND a loss for B? | One-sided counting leaving holes in the heatmap |
| B4 | Is the matchup matrix symmetric? `A vs B wins + B vs A wins = total games between them` | Asymmetric double-counting |
| B5 | Do first-turn stats only include games with explicit `first_player` ("1" or "2")? | Random/unknown first-player games inflating first-turn advantage |
| B6 | In first-turn: `cmd_first_games + opp_first_games = total first-turn games for that matchup`? | Missing or double-counted first-turn games |
| B7 | Do card stats satisfy `played_count <= drawn_count <= deck_count`? | Counting a card as played but not drawn (impossible in-game) |
| B8 | Does `total_player_games = total_games * 2`? (every game has exactly 2 players) | Player count assumption broken silently |
| B9 | Do faction trend percentages sum to approximately 100% per week? | Missing faction or double-counting |
| B10 | Do bucket winrate aggregations (duration/turns/actions) put each game in exactly one bucket? | Gap or overlap in bucket boundaries |
| B11 | With zero games, does every aggregation return a safe empty result (not crash)? | Pipeline crash on empty period x map slice |
| B12 | Is `avg_copies = total_copies / deck_count`, not `total_copies / total_games`? | Wrong denominator inflating/deflating avg copies |

---

## Category C: Output Schema Validation

Tests run AFTER the pipeline writes JSON. They validate the contract between pipeline and frontend.

| # | Question the test answers | Risk it prevents |
|---|---------------------------|------------------|
| C1 | Does every JSON file have all 4 periods x 4 maps = 16 combinations? | Frontend `getPeriodData()` crashing on missing key |
| C2 | Are all winrates between 0.0 and 1.0 (inclusive)? | Display showing "234%" or negative winrates |
| C3 | Are all counts non-negative integers? | Negative game counts, fractional matches |
| C4 | Do commander names in `commander_stats.json` match those in `matchups.json`? | Heatmap showing commanders that don't exist in the stats table |
| C5 | Does `metadata.json` have a recent `last_updated` timestamp? (within 24h for CI) | Stale data being served without anyone noticing |
| C6 | Are there no duplicate commander entries in `commander_stats.json`? | Same commander appearing twice with split stats |
| C7 | Does every matchup in `matchup_details.json` have `total = wins + losses`? | Frontend showing inconsistent W-L records |
| C8 | Is every card in `card_stats.json` present in `cards.json`? (or vice versa: flag orphans) | Card hover previews failing for cards missing from reference data |
| C9 | Are JSON files within expected size ranges? (catch truncation or explosion) | Truncated write making the site show no data, or a 500MB JSON file |
| C10 | Does the `commanders.json` reference file have at least 10 commanders? (sanity floor) | Empty CSV or parsing failure silently nuking commander data |

---

## Category D: Adversarial / Regression Tests

These exist to **verify the test suite itself works**. Each one injects a known bug and checks that at least one test from A/B/C catches it.

| # | Injected bug | Which test(s) should catch it |
|---|-------------|-------------------------------|
| D1 | `firstPlayer` field is an integer instead of string | A5 (type coercion) |
| D2 | `winner` field is string `"1"` instead of bool | A6 (winner coercion) |
| D3 | A game has 3 players instead of 2 | B8 (player count assumption) |
| D4 | A card's played_count > drawn_count | B7 (played <= drawn <= deck) |
| D5 | A winrate of 1.5 sneaks into the output | C2 (winrate bounds) |
| D6 | Period "3m" is missing from the output | C1 (all period x map combos) |
| D7 | Same commander appears twice in stats (different casing) | C6 (no duplicates), A8 (normalization) |
| D8 | `clean_game()` accepts a game with `turnsTaken=0` | A4 (min turns filter) |
| D9 | Matchup wins asymmetry: A beat B counted, but B's loss not recorded | B3/B4 (symmetric matchups) |
| D10 | All faction trend percentages sum to 80% (missing a faction) | B9 (trends sum ~100%) |

---

## Category E: Filtering & Data Flow (added post-review)

Gaps identified after initial test suite shipped. These cover the untested glue between cleaning and aggregation.

| # | Question the test answers | Risk it prevents |
|---|---------------------------|------------------|
| E1 | Does `filter_games_by_period()` correctly include/exclude games at the boundary date? | 1M/3M/6M views showing wrong data if date math is off |
| E2 | Does `filter_games_by_period(games, None)` return all games unchanged? | "All time" view accidentally filtering |
| E3 | Does `filter_games_by_map()` correctly filter by map name, and return all for "all"? | Map-specific stats including games from other maps |
| E4 | Do bucket boundaries assign edge values correctly? (exactly 10 min, exactly 30 actions, etc.) | Off-by-one putting games in wrong bucket |
| E5 | Does cache survive a round-trip? `save_cache(games)` then `load_cache()` returns the same data? | Corrupted cache losing all historical game data |

### Known gaps intentionally NOT tested (would need mocking for low ROI)

- **AWS/DynamoDB**: `get_dynamo_table()`, `scan_all_games()` — requires mocking boto3
- **Thumbnail generation**: `generate_thumbnails()`, `_resize_image()` — filesystem + PIL dependent
- **`main()` orchestration**: Integration-level, covered by CI running end-to-end daily
- **`build_and_write_all()`**: Already validated indirectly by Category C tests checking real JSON output
