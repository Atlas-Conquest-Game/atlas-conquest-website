# Design System

> Dark editorial aesthetic. Minimal, spacious, data-forward. Inspired by GitHub's dark mode and modern analytics dashboards.

## Principles
1. **Content-first**: Data and insights are the hero. UI gets out of the way.
2. **Generous whitespace**: Let elements breathe. Dense data, spacious layout.
3. **Typographic hierarchy**: Size, weight, and color do the heavy lifting — not decoration.
4. **Faction identity**: Skaal orange-red, Grenalia teal, Lucia gold as accent colors. Used sparingly.
5. **Colorblind-safe**: All colors chosen from Okabe-Ito / Wong palette to be distinguishable under all forms of color blindness.
6. **Progressive disclosure**: Show summary first, let users drill into detail (e.g. click a commander bar to open detailed modal).

## Color Palette

### Base (Dark Theme)
| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#0e1117` | Page background |
| `--bg-subtle` | `#161b22` | Alt-section backgrounds |
| `--bg-inset` | `#1c2128` | Inset panels |
| `--bg-card` | `#1c2128` | Card / chart backgrounds |
| `--bg-elevated` | `#21262d` | Hover states, elevated surfaces |
| `--text` | `#e6edf3` | Primary text |
| `--text-secondary` | `#8b949e` | Captions, labels, muted text |
| `--text-muted` | `#484f58` | Disabled, placeholder text |
| `--border` | `#30363d` | Dividers, card borders |
| `--border-subtle` | `#21262d` | Inner row dividers |

### Faction Accents
| Token | Value | Faction |
|-------|-------|---------|
| `--skaal` | `#D55E00` | Skaal (Orange-Red) |
| `--grenalia` | `#009E73` | Grenalia (Teal) |
| `--lucia` | `#E8B630` | Lucia (Gold) |
| `--neutral` | `#A89078` | Neutral (Beige) |
| `--shadis` | `#7B7B8E` | Shadis (Slate) |
| `--archaeon` | `#0072B2` | Archaeon (Blue) |

### Semantic
| Token | Value | Usage |
|-------|-------|-------|
| `--positive` | `#3fb950` | Win rates >52%, positive trends |
| `--negative` | `#f85149` | Win rates <48%, negative trends |

### Chart-Specific Colors
| Color | Hex | Usage |
|-------|-----|-------|
| Blue accent | `#58a6ff` | Active UI, distribution histograms, cost charts |
| Green accent | `#3fb950` | Minion counts, winning decks, positive WR |
| Purple accent | `#d2a8ff` | Spell counts, action distributions |
| Red accent | `#f85149` | Losing decks, other-faction cards |

## Typography
- **Font stack**: `Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
- Load Inter from Google Fonts (400, 500, 600, 700).

| Element | Size | Weight | Color |
|---------|------|--------|-------|
| Page title | 2.75rem | 700 | `--text` |
| Section heading | 1.5rem | 700 | `--text` |
| Card heading | 1.125rem | 600 | `--text` |
| Body text | 1rem | 400 | `--text` |
| Caption/label | 0.8125rem | 500 | `--text-secondary` |
| Small/stat label | 0.6875rem | 600 | `--text-secondary`, uppercase, tracked |

## Layout
- Max content width: `1200px`, centered.
- Section padding: `4rem 0`.
- Card grid: CSS Grid, `repeat(auto-fill, minmax(220px, 1fr))`, gap `1rem`.
- Chart row (3-col): `repeat(3, 1fr)`, gap `1rem`. Collapses to 1-col on mobile.
- Chart row (2-col): `repeat(2, 1fr)`, gap `1rem`. Collapses to 1-col on mobile.
- Responsive: single column below `768px`.

## Components

### Stat Card
- Background: `--bg-card`. Border: `1px solid --border`. Border-radius: `12px`.
- Padding: `1.5rem`. Subtle border-color + box-shadow on hover.
- Fade-up animation on load with staggered delays.

### Data Table
- Clean, minimal borders. Header row: `--bg-card` background, `--text-secondary` text, uppercase.
- Sortable columns: click to toggle asc/desc. Arrow indicator via `::after` pseudo-element.
- Row hover: `--bg-elevated` background.

### Charts
- Chart.js 4 (loaded via CDN). Dark theme defaults set globally (`Chart.defaults.color`, `borderColor`, `font.family`).
- Faction colors for series. Grid lines: `#21262d`. Labels: `--text-secondary`.
- Tooltip: `--bg-elevated` background, `--border` border, 6px corner radius.
- Chart types used: bar, stacked bar, line (stacked area), doughnut.

### Distribution Charts (small)
- 3-column grid in Overview section. `.chart-sm` container with `--bg-card` background.
- Title: `0.75rem`, uppercase, `--text-secondary`.
- Bar charts with tight barPercentage (0.9) for histogram appearance.

### Deck Composition Charts
- Full-width avg cost chart (faction-colored bars) + 2-column grid for minion/spell and patron/neutral stacked bars.
- All bars are **clickable** — cursor changes to pointer, tooltip shows "Click for details".
- Clicking opens the Commander Detail Modal.

### Commander Detail Modal
- Overlay: fixed, full viewport, `rgba(0,0,0,0.7)` backdrop with `blur(4px)`.
- Content: `--bg-subtle` background, max-width `860px`, `12px` border-radius, `fadeUp` animation.
- Header: commander art (80x80 rounded), name, faction badge, summary stats.
- Body: mana curve bar chart (all/win/loss grouped), 2-column grid with type donut and loyalty donut.
- Close: X button (top-right), backdrop click, or Escape key.

### Navigation
- Sticky top bar: `rgba(14,17,23,0.85)` + `blur(12px)` backdrop filter. Bottom border.
- Logo left, nav links right. Text links with hover highlight.

### Time Filter Bar
- Sticky below nav (z-index 90). Same frosted glass treatment.
- Pill buttons: `1M`, `3M`, `6M`, `All`. Active state: blue border + blue text.
- Changing period re-renders all sections.

### Faction Filter
- Pill buttons for card table. Active state uses faction accent color for border and text.

### Matchup Heatmap
- Scrollable table. Sticky row headers. Vertical column headers.
- Color coding: green (>55%), neutral (45-55%), orange-red (<45%), gray (<5 games).
- Tooltip on hover: commander names, winrate, W-L record.

## Motion
- Keep it subtle. `transition: 0.15s ease` on interactive elements.
- `fadeUp` keyframe animation: `translateY(8px)` → `0`, `opacity: 0` → `1`. Duration `0.35s`.
- Staggered delays on commander cards and stat cards.
- Modal: `fadeUp 0.25s` entrance. No exit animation (instant close).
