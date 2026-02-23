# Statistical Methodology

How to interpret the numbers on the dashboard and when they're actually meaningful.

## Sample Size Thresholds

Not all stats are created equal. A 70% winrate over 10 games means almost nothing; over 500 games it's a strong signal.

| Stat Type | Minimum for Display | Minimum for Confidence | Notes |
|-----------|-------------------|----------------------|-------|
| Commander winrate | 5 games | 100+ games | Below 30 games, swings of 10%+ are expected from randomness alone |
| Matchup winrate | 5 games | 50+ games | Shown as "--" below 5; treat <20 as anecdotal |
| Card drawn/played WR | 5 occurrences | 50+ occurrences | Per-card rates are noisier since each card appears in a fraction of games |
| Card inclusion rate | 10 decks | 30+ decks | Commander-specific inclusion needs the commander to have enough games |
| Trends (weekly) | 4 player-games/week | 20+ games/week | Weeks with <4 games are dropped from trend lines |

**Rule of thumb**: If you wouldn't bet money on the result, it's probably not statistically significant.

## Winrate Confidence Intervals

A winrate is a proportion — the number of wins divided by total games. The uncertainty around it follows a binomial distribution.

### Wald Interval (95% Confidence)

```
CI = p +/- z * sqrt(p * (1 - p) / n)
```

Where:
- `p` = observed winrate (e.g., 0.55)
- `n` = number of games
- `z` = 1.96 for 95% confidence

### Examples

| Winrate | Games | 95% CI | Interpretation |
|---------|-------|--------|----------------|
| 55% | 20 | 33% - 77% | Could easily be 50/50. Noise. |
| 55% | 100 | 45% - 65% | Plausibly above 50%, but not certain |
| 55% | 500 | 51% - 59% | Likely genuinely above 50% |
| 55% | 1000 | 52% - 58% | Strong evidence of above-average performance |
| 50% | 100 | 40% - 60% | Perfectly consistent with balanced |

**Key insight**: With our dataset (~3,100 games, ~1,800 with first-player data), commander-level winrates (100-400 games each) have confidence intervals of roughly +/-5-10%. Matchup-level winrates (often 10-50 games) have intervals of +/-15-30%.

## Comparing Two Winrates

"Is Commander A actually better than Commander B?" requires a two-proportion z-test.

### Two-Proportion Z-Test

```
z = (p1 - p2) / sqrt(p_pool * (1 - p_pool) * (1/n1 + 1/n2))
```

Where:
- `p1`, `p2` = the two winrates
- `n1`, `n2` = game counts
- `p_pool` = (wins1 + wins2) / (n1 + n2)

If |z| > 1.96, the difference is statistically significant at the 95% level.

### Example

Commander A: 57% winrate over 200 games (114 wins)
Commander B: 48% winrate over 150 games (72 wins)

```
p_pool = (114 + 72) / (200 + 150) = 0.531
z = (0.57 - 0.48) / sqrt(0.531 * 0.469 * (1/200 + 1/150))
z = 0.09 / sqrt(0.531 * 0.469 * 0.01167)
z = 0.09 / 0.0536
z = 1.68
```

|z| = 1.68 < 1.96, so this difference is **not** statistically significant at 95%, despite a 9 percentage point gap. You'd need more games.

## Card Usage Significance

### Is a card's drawn winrate meaningful?

Compare the card's drawn winrate to the baseline winrate using a two-proportion z-test (card drawn WR vs. overall WR for that commander/population).

### Inclusion rate differences between commanders

Use a chi-squared test or Fisher's exact test:
- Null hypothesis: Card inclusion rate is the same across commanders
- If p < 0.05, the difference is significant
- Fisher's exact test is preferred when expected cell counts are small (<5)

## Multiple Testing Problem

When you compare 15 commanders simultaneously, or look at 261 cards, you're running many tests at once. By chance alone, 5% of comparisons will appear "significant" at the 95% level.

### Bonferroni Correction

Divide your significance threshold by the number of tests:

```
Adjusted alpha = 0.05 / number_of_tests
```

| Scenario | Tests | Adjusted p-value |
|----------|-------|-----------------|
| Comparing all commander winrates to 50% | 15 | 0.0033 |
| All matchup pairs | 105 (15 choose 2) | 0.00048 |
| All card drawn WRs to baseline | 261 | 0.00019 |

This is conservative. In practice, look for:
- Large effect sizes (>5% winrate difference)
- Consistent patterns (card is strong across multiple commanders)
- Reasonable sample sizes (50+ games)

## Practical vs. Statistical Significance

A difference can be statistically significant but practically meaningless:

- **1% winrate difference with 10,000 games**: Statistically significant, but a 51% vs 50% matchup is essentially even in practice.
- **15% winrate difference with 20 games**: Not statistically significant, but worth watching — if it persists with more data, it matters.

For Atlas Conquest decision-making:
- **Deck building**: A card needs to show 3%+ winrate improvement with 50+ games to be worth considering as a flex slot choice
- **Commander selection**: A 5%+ winrate gap with 100+ games suggests a real tier difference
- **Matchup awareness**: A 10%+ matchup spread with 30+ games is worth playing around, even if not statistically bulletproof
- **Meta trends**: Week-to-week fluctuations of 5% in faction popularity are noise; sustained 3-week trends of 10%+ are signals

## Caveats for This Dataset

1. **Selection bias**: Players choose commanders and build decks. A commander with low winrate might be played more by newer players, or be popular despite being weak.
2. **Confounding variables**: A card with high drawn winrate might just appear in already-strong decks rather than being the cause of wins.
3. **Meta evolution**: Aggregating across all time periods mixes different meta states. The 1M/3M filters help isolate recent performance.
4. **Small maps**: Snowmelt (~60 games) and Tropics (~50 games) have far too few games for most per-commander or per-card analysis. Use "All Maps" for robust conclusions.
5. **First-player data gap**: First-player tracking stopped in August 2025. All first-turn advantage data comes from pre-August games only.
