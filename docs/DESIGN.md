# Design System

> The trailer's look on a data site: deep navy surfaces with warm amber depth,
> gold for titles and active UI, Okabe-Ito faction colours for data. Brand with
> restraint on data pages: the display face is for titles only, and readability
> beats decoration.

## Principles
1. **Content-first**: Data and insights are the hero. UI gets out of the way.
2. **Generous whitespace**: Let elements breathe. Dense data, spacious layout.
3. **Typographic hierarchy**: Size, weight, and color do the heavy lifting — not decoration.
4. **Faction identity**: faction colours carry data meaning (rings, pills, bars), never decoration.
5. **Colorblind-safe**: All colors chosen from Okabe-Ito / Wong palette to be distinguishable under all forms of color blindness.
6. **Progressive disclosure**: Show summary first, let users drill into detail (e.g. click a commander bar to open detailed modal).
7. **Honest numbers**: label beta/playtest data as such, gate rankings on sample size (20 games), show `--` under 5 games, and never invent figures.

## Color Palette

`site/css/variables.css` holds the data-site tokens (legacy names kept so every
page stylesheet inherits the brand); `site/css/brand.css` holds the `--ac-*`
brand tokens (see **Brand layer**). Both resolve to the same navy/gold values.

### Base (navy)
| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#0b0f17` | Page background |
| `--bg-subtle` | `#0f141e` | Alt sections, sticky bars |
| `--bg-inset` | `#0d121b` | Recessed wells: inputs, tracks, segmented controls |
| `--bg-card` | `#131924` | Cards, panels, chart backgrounds, table header |
| `--bg-elevated` | `#1c2433` | Hover, raised controls, tooltips |
| `--bg-raised` | `#232c3d` | Top-most chips on elevated surfaces |
| `--text` | `#ede7da` | Primary text (14.3:1 on card) |
| `--text-secondary` | `#b3ada1` | Captions, labels (7.9:1) |
| `--text-muted` | `#948d81` | De-emphasised text (5.4:1 on card, 4.7:1 on elevated) |
| `--border` / `--border-subtle` / `--border-strong` | `#253043` / `#1a2130` / `#34405a` | Card borders, row dividers, control outlines |

### Accent (UI state)
| Token | Value | Usage |
|-------|-------|-------|
| `--gold` | `#e8a245` | Active pills, sort arrows, progress, focus glow |
| `--gold-text` | `#f2c271` | Gold for small text / active labels (10.7:1 on card) |
| `--accent-soft` / `--accent-border` / `--accent-line` | amber at 12% / 60% / 28% | Active fill, active border, gold hairline |
| `--focus` | `#f7dc9a` | Focus ring |

Gold is the only active-state colour. No GitHub blue (`#58a6ff`, `#388bfd`) in UI
state; the one lightened blue left (`#58a6ff`) is Archaeon's AA text tint on its
faction pill.

### Faction Accents
| Token | Value | Faction |
|-------|-------|---------|
| `--skaal` | `#D55E00` | Skaal (Orange-Red) |
| `--grenalia` | `#009E73` | Grenalia (Teal) |
| `--lucia` | `#E8B630` | Lucia (Gold) |
| `--neutral` | `#A89078` | Neutral (Beige) |
| `--shadis` | `#7B7B8E` | Shadis (Slate) |
| `--archaeon` | `#0072B2` | Archaeon (Blue) |

### Minor Patron Accents
Adora, Mechanus and Treasure each have only a card or two, but they are distinct
patrons — not Neutral. Treasure sits deliberately lighter than Lucia's saturated
amber so the two read apart when charted side by side.

| Token | Value | Patron |
|-------|-------|--------|
| `--adora` | `#CC79A7` | Adora (Reddish Purple) |
| `--mechanus` | `#A9714B` | Mechanus (Copper) |
| `--treasure` | `#EDD9A0` | Treasure (Pale Gold) |

### Semantic
| Token | Value | Usage |
|-------|-------|-------|
| `--positive` | `#3fb950` | Win rates >52%, positive trends |
| `--negative` | `#f85149` | Win rates <48%, negative trends |

### Chart colours (`CHART_THEME` in `site/js/shared.js`)
Use the tokens, never hex literals, in page scripts.

| Token | Value | Usage |
|-------|-------|-------|
| `text` / `textStrong` / `muted` | `#b3ada1` / `#ede7da` / `#948d81` | Ticks, legend, axis titles / tooltip titles / notes |
| `grid` / `axis` / `surface` | `#1f2838` / `#2b3549` / `#131924` | Gridlines, axis baseline, doughnut separators |
| `gold` / `goldFill` | `#e8a245` / 70% | Primary series: all decks, minions, patron cards, "going first" |
| `steel` / `steelFill` | `#9db4dc` / 60% | The partner of gold in two-part splits: spells, "going second" |
| `slate` / `slateFill` | `#7d8aa0` / 55% | "Everything else" segments (off-faction cards) |
| `positive` / `negative` (+ `Fill`) | `#3fb950` / `#f85149` | Win and loss series only |

Gold + steel blue stay distinct under common colour-vision deficiencies. Green
and red are reserved for winning/losing; never use them as plain category colours.

## Typography
- **Body / UI / numbers**: `Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` (Google Fonts 400–700).
- **Display**: OptimusPrinceps (the game's title font, `site/assets/media/fonts/`), gold gradient — page and section titles only. Never numbers, tables, labels, buttons or UI text.

| Element | Size | Notes |
|---------|------|-------|
| Hero title (`.ac-page-hero .ac-title`) | up to 68px; 48px in `--compact` heroes | Marketing pages use the full hero, data/tool/legal pages the compact one |
| Section title, content pages (`.ac-title--md`, article h2) | `--ac-h2-content` ≈ 32px | Press, articles |
| Section title, data/tool/legal (`.section-title`, `.ac-title--sm`, legal h2) | `--ac-h2-data` ≈ 28px | Analytics, deck builder, legal |
| Body text | 1rem | `--text` |
| Caption/label | 0.8125rem | `--text-secondary` |
| Small/stat label | 0.6875rem 600 uppercase, tracked | `--text-secondary` |

Dates use one format everywhere: `Oct 5, 2026` (`formatSiteDate()` in shared.js,
`_format_date()` in build_articles.py, written by hand on legal pages).

## Layout
- Max content width: `1200px`, centered.
- Section padding: `4rem 0`.
- Card grid: CSS Grid, `repeat(auto-fill, minmax(220px, 1fr))`, gap `1rem`.
- Chart row (3-col): `repeat(3, 1fr)`, gap `1rem`. Collapses to 1-col on mobile.
- Chart row (2-col): `repeat(2, 1fr)`, gap `1rem`. Collapses to 1-col on mobile.
- Responsive: single column below `768px`; check 1440, 1024, 768 and 390 with no horizontal page scroll.

## Components

### Stat Card
- Background: `--bg-card`. Border: `1px solid --border`. Border-radius: `12px`.
- Padding: `1.5rem`. Subtle border-color + box-shadow on hover.
- Fade-up animation on load with staggered delays.

### Data Table
- Clean, minimal borders. Header row: `--bg-card` background, `--text-secondary` text, uppercase.
- Sortable columns: click to toggle asc/desc. Arrow indicator via `::after` pseudo-element.
- Row hover: `--bg-elevated` background.
- **Stacked sub-line pattern** (cards table): Each percentage cell shows a small muted sub-line beneath it with raw counts (e.g., "134 of 342", "61 games"). Class `cell-sub`: `font-size: 0.625rem`, `color: --text-muted`, `margin-top: 2px`.
- **De-emphasized columns**: `cell-muted` class for secondary data cells (muted color + `0.75rem`). `col-deemph` class for column headers (muted + `0.6875rem`).
- **Null sort behavior**: Cards with insufficient data ("--") always sort to the bottom regardless of direction.

### Card Preview (Hover Popup)
- Fixed position popup showing card artwork when hovering over card name column.
- Width: `250px`. Border-radius: `8px`. Drop shadow: `drop-shadow(0 8px 24px rgba(0,0,0,0.6))`.
- Positioned 20px right of cursor, flips left when near viewport edge.
- Opacity transition: `0.12s ease`. Hidden with `pointer-events: none` when inactive.
- Z-index: `1100` (above modals). Gracefully hides on image load error.

### Charts
- Chart.js 4 (loaded via CDN). Theme defaults set globally from `CHART_THEME` (`Chart.defaults.color`, `borderColor`, `font.family`); reduced motion turns animation off.
- Faction colors for faction series; `CHART_THEME` tokens for everything else (see **Chart colours**).
- Tooltip: `CHART_TOOLTIP` — navy glass, gold hairline border, 8px radius.
- Chart types used: bar, stacked bar, line (stacked area), doughnut.
- Goals art-source donuts use a fixed segment palette validated for colour-vision deficiency on `--bg-card`: Commissioned `#238636`, Purchased `#1f6feb`, Placeholder `#bf8700`, AI `#6e7681` (recessive gray — the pool being replaced), Other `#da3633`. Segments are separated by a 2px `--bg-card` border. See `ART_SOURCES` in `site/js/goals.js`.

### Distribution Charts (small)
- 3-column grid in Overview section. `.chart-sm` container with `--bg-card` background.
- Title: `0.75rem`, uppercase, `--text-secondary`.
- Bar charts with tight barPercentage (0.9) for histogram appearance.

### Deck Composition Charts
- Full-width avg cost chart (faction-colored bars) + 2-column grid for minion/spell and patron/neutral stacked bars.
- All bars are **clickable** — cursor changes to pointer, tooltip shows "Click for details".
- Clicking opens the Commander Detail Modal.

### Commander Detail Modal
- Overlay: fixed, full viewport, dark backdrop with blur. `role="dialog" aria-modal="true"`.
- Header: round faction-ringed portrait, OptimusPrinceps name, faction pill, summary stats.
- **Winrate vs other commanders**: every opponent, most-played first; each label carries its game count (`Elyse of the Order · 5`); bars are full colour from 20 games, faded below, and under 5 games there is no bar, just "too few games to call"; dashed 50% line.
- Body: mana curve (all = gold, wins = green, losses = red), type donut (minions gold / spells steel), loyalty donut (patron gold / neutral beige / other slate), top cards table.
- Focus: `acModalOpen()` / `acModalClose()` in shared.js (also used by the meta.html matchup modal) — remembers the opener, makes everything behind the dialog `inert`, focuses Close, traps Tab, and on close (X, backdrop, Esc) restores focus to the opener. `/commanders.html#<slug>` opens a commander directly (article links use it).

### Navigation
- The site nav and footer are the shared brand chrome — see **Brand layer** below.
- Analytics pages add their own sub-nav (`.sub-nav`, page content) that sticks at `top: var(--nav-height)`, directly under the brand nav.

### Time Filter Bar
- Sticky under the brand nav + analytics tab bar. Frosted navy.
- `.an-seg` segmented controls for period (`1M`, `3M`, `6M`, `All`) and map; active = gold fill + gold border. Below 768px each becomes a native `<select>` (built by shared.js from the bar's own buttons only — `#time-filter-bar .time-btn`, never a modal's).
- Changing period re-renders all sections.

### Faction Filter
- Pill buttons for card table. Active state uses faction accent color for border and text.

### Info tooltips
- `[data-tooltip]` shows the shared `.info-tooltip` bubble. `.tooltip-icon` "?" chips are upgraded by `initTooltips()` to `role="button" tabindex="0"` with an `aria-label` of the tip: they open on hover, keyboard focus or tap (tap again, tap elsewhere or Esc closes) and never wrap onto a line of their own (glued to the previous word). Key honesty caveats live in these tips, so they must stay reachable without a mouse.

### Mirror Match Toggle
- Label: "Exclude mirror matches" with `?` info tooltip icon.
- Positioned left side of chart controls, next to Week/Month binning toggle (`margin-left: 0.75rem`).
- Checkbox uses `accent-color: var(--text-secondary)`. Text: `0.75rem`, `--text-muted`.
- Info tooltip explains: removes games where both players picked the same commander.

### Matchup Heatmap
- Scrollable table. Sticky row headers. Vertical column headers with commander tokens.
- Color coding: green (>55%), neutral (45-55%), orange-red (<45%), gray (<5 games).
- Tooltip on hover: commander names, winrate, W-L record, game count. Click opens the matchup modal.

### Collapsible sections (meta.html)
- The round gold chevron `<button>` in each `.section-title.collapsible` is the control: `aria-expanded` and `aria-controls` stay in sync, and a folded body is `inert` so Tab skips it. Sections with real content start open; no "coming soon" placeholders in public sections.

### Narrow tables (≤600px)
- `.table-wrapper` gets `.is-scrollable` / `.is-at-end` from shared.js; while columns are hidden to the right, the right edge fades as a swipe cue.
- Commander bucket tables (Commanders page): the commander column is sticky-left at 9.5rem with ellipsis, and the faction pill hides (the token ring carries the faction).
- Cards table: Faction and Type columns hide; the faction becomes a 3px bar on the card-name cell. `/cards.html#<slug>` (or `?q=`) fills the search and briefly highlights the row.

## Motion
- Keep it subtle. `transition: 0.15s ease` on interactive elements.
- `fadeUp` keyframe animation: `translateY(8px)` → `0`, `opacity: 0` → `1`. Duration `0.35s`.
- Staggered delays on commander cards and stat cards.
- Modal: `fadeUp 0.25s` entrance. No exit animation (instant close).

## Brand layer

The trailer's identity, shared by every page except the homepage concepts. Lives in
`site/css/brand.css` (tokens + components), `site/js/site-config.js` (config + behaviour)
and `site/partials/{head,nav,footer}.html` (markup), stitched into pages by
`scripts/sync_chrome.py`.

### How pages get the chrome
- Each page carries three marked regions: `<!-- AC:HEAD -->…<!-- /AC:HEAD -->` (after the
  shared stylesheets, before page CSS), `<!-- AC:NAV -->…` (first thing in `<body>`) and
  `<!-- AC:FOOTER -->…` (last block before the page scripts). Never edit inside them —
  edit the partial and run `python scripts/sync_chrome.py` (`--check` to verify).
- `{{ROOT}}` in a partial becomes `""` at the site root and `"/"` for nested pages
  (`decks/<slug>/`, `articles/**`), their templates (`decks.html`, `articles.html`,
  `article.html`) and `404.html` (GitHub Pages serves it at any depth). The nav item for the page's section gets `aria-current="page"`.
- `generate_deck_pages.py` and `build_articles.py` re-apply the chrome to every page they
  write, so CI output always matches the partials. `scripts/tests/test_chrome_sync.py`
  fails if any page drifts.
- Cascade: shared CSS → **brand.css** → page CSS. Brand wins over legacy chrome; page CSS
  can still refine brand components.

### Tokens (`--ac-*`, self-contained)
| Token | Value | Usage |
|-------|-------|-------|
| `--ac-navy-0…5` | `#06080d` `#0b0f17` `#10151f` `#131924` `#1c2433` `#283246` | Surfaces, darkest → lightest |
| `--ac-gold-1/2/3` | `#f7dc9a` / `#e8a245` / `#c96f22` | Title metal; `--ac-grad-gold` is the 180° blend |
| `--ac-ember`, `--ac-fire-1…3` | `#f05a1a` `#ff9a1f` `#ffd23a` | Logo fire; `--ac-grad-fire`, `--ac-grad-button` |
| `--ac-text/-2/-3` | `#ede7da` / `#bdb6a8` / `#9a9285` | Warm text on navy (all AA) |
| `--ac-line/-soft/-strong` | amber at 22% / 12% / 50% | Hairlines; `--ac-hairline` is the centre-bright rule |
| `--ac-discord`, `--ac-steam`, `--ac-online` | `#5865f2`, `#1b2838`, `#3fb950` | Platform colours (sparingly) |
| `--ac-steam-1/2`, `--ac-grad-steam` | `#47bfff` → `#1a44c2` (90°, 5%/60%) | Classic Steam button blue (`.ac-btn--steam`) |
| `--ac-font-display` / `--ac-font-body` | OptimusPrinceps / Inter | Display face is titles only |
| `--ac-nav-h` | 64px (56px ≤768px) | Nav height; `--nav-height` aliases it (set only in brand.css) |
| `--ac-hex` | SVG | Faint hex lattice behind heroes |

### Type and ornament
- `.ac-title` — OptimusPrinceps in the gold gradient (repeats per line), soft ember glow.
  Sizes: default (hero), `--lg`, `--md`, `--sm`. **Titles only**: never numbers, tables,
  labels, buttons or UI text — data readability beats decoration.
- `.ac-eyebrow` — Inter 600, 0.75rem, 0.24em tracking, uppercase amber with a leading ◆.
- `.ac-ornament` — line ◆ line rule (`--center`, `--start` variants). Always `aria-hidden`.

### Buttons
`.ac-btn` + one of `--steam` (the lead CTA by default: classic Steam blue gradient, white
label + glyph, soft blue glow that brightens on hover), `--gold` (molten fill, dark ink:
the lead when Discord leads, and page-level primary actions), `--ghost` (secondary: gold
hairline on glass; a Steam ghost hovers blue), `--pill` (compact rounded secondary for the
nav bar: blurple-tinted Discord + live count, or blue-tinted Steam), `--discord` (blurple —
a Discord-specific block only); sizes `--sm` (38px) / default (46px) / `--lg` (54px);
`--block` for full width. Inter 600 uppercase. No "coming soon" state: before the store
page exists Steam buttons are ordinary-looking `#` links that do nothing when clicked.

### Calls to action (`site-config.js`)
- `window.AC_CONFIG.primaryCta` (`'steam'` default | `'discord'`) is the single switch;
  `links.steam` only decides where Steam buttons go (`#` + `data-ac-pending`, a click
  no-op, while it is empty). Slots `<span data-ac-cta="primary|secondary|discord|steam">`
  are rendered from config: the lead wears its platform (Steam → `--steam` blue,
  Discord → `--gold`), the other is `--ghost`. Keep a static fallback inside each slot
  that matches the default render (no shift when the script runs). Options:
  `data-ac-cta-size`, `data-ac-cta-short` (`="narrow"` renders both labels so CSS can pick
  the short one on small screens), `data-ac-cta-count` (live online chip on a Discord
  button), `data-ac-cta-style` (`gold|ghost|steam|discord|pill|text`), `data-ac-cta-label`.
- Live Discord counts (invite API, cached 10 min in sessionStorage):
  `[data-ac-discord-members]`, `[data-ac-discord-online]`; wrap them in
  `[data-ac-discord-live] hidden` so nothing shows if the request fails.
- `[data-ac-trailer]` on any button/link opens the trailer modal (native `<dialog>`,
  focus trapped, Esc/backdrop close, focus returns): a youtube-nocookie embed once
  `links.youtubeTrailerId` is set, the local `assets/media/video/trailer.mp4` until then.

### Nav (`.ac-nav`)
Sticky frosted bar (navy at 74% + blur, molten hairline underneath, darker once scrolled):
hammer wordmark · Home / Analytics / Decks / Articles / Press (Inter 600 uppercase, gold +
glowing ◆ for `aria-current`) · Discord "Join the Beta" pill with live online count +
Steam-blue "Wishlist on Steam" (≤1060px the pill shows icon + count; 901–1000px and
≤520px the Steam button reads "Wishlist"; ≤359px icon only). With `primaryCta: 'discord'`
the pair swaps: Steam "Wishlist" pill + gold "Join the Beta" with the count. ≤900px:
hamburger (`aria-expanded`) opens a slide-down panel with the links, both CTAs (full
width, lead first), the live count and social icons; Esc, outside click, tabbing out, or picking a link closes it.
Without JS the links stay reachable as a strip under the bar. Links keep
`.nav-link[data-nav]` for shared.js/decks.js; only `aria-current` is styled.

### Footer (`.ac-footer`)
Beta call-to-action band ("Take Up the Hammer", live members/online, both CTAs — Steam
blue lead + Discord ghost by default — key art feathered in on the right; the Game column
also lists "Wishlist on Steam") → wordmark, tagline, "Releasing 2027", press email · Game /
Community (social icons) / Tools columns → © 2026 Atlas Conquest · "Human-made art" ·
Privacy / Terms. (The Goals page still lists a few AI placeholders being replaced, so the
footer doesn't claim 100% until that's true.)

### Subpage hero (`.ac-page-hero`)
Eyebrow, gold title, ornament, lede on navy with optional key art: an
`<img class="ac-page-hero__art">` child (preferred), `data-ac-hero-art="assets/…"`, or a
root-absolute `--ac-hero-art: url('/assets/…')`. A left-to-right navy gradient, floor fade,
ember glow and hex lattice keep text legible. Variants `--compact` (data pages) and
`--center`; slots `__actions`, `__meta`; focal point via `--ac-hero-pos`. Put it inside
`<main id="main">` so it isn't a second banner landmark.

### Motion
Cross-document View Transitions (`@view-transition { navigation: auto }`): the page
cross-fades in 0.22s while the nav bar (`view-transition-name: ac-nav`) holds still.
All of it, the live-dot ping and button lifts switch off under `prefers-reduced-motion`.


### Key art per page
Each page has its own painting (`site/assets/media/keyart/<name>-{1200,2400}.webp`), and
an Overview explore tile reuses its page's art: Overview chronomage · Commanders
centurion · Cards mechanic · Meta nilo · Metagame zoghn · Goals ranger · Decks
pyrotechnic · Press atlas golem · Articles necromancer · 404 vampire · footer khazgar.
Don't reuse a hero painting on another page.

## Analytics suite

`site/css/analytics.css` + `site/js/analytics-ui.js`, loaded by the six analytics pages
after brand.css.

- **Tab bar** (`.sub-nav`, `--an-subnav-h` 48px / 46px ≤768px): "Beta Analytics" label +
  Overview · Commanders · Cards · Meta · Metagame · Goals, gold ink under the current tab
  (`view-transition-name: an-subnav` / `an-tab-ink` hold it still across page loads).
- **Heroes**: compact on every analytics page (Overview included, so its KPIs sit in the
  first screen). Eyebrows name the page's content — Overview "Beta Analytics", Commanders
  "Winrates · Deck building", Cards "Draw · Play · Win", Meta "Matchups · Trends",
  Metagame "Archetypes · Decklists", Goals "Art · Animation". Chips: match count, last
  updated, "Beta & playtest matches".
- **Sticky stack**: brand nav → tab bar → filter bar; `site-config.js` measures it into
  `--sticky-stack` (px fallbacks 167px / 152px) for the floating table header.
- **Commander tokens** — `ACA.token(name, faction, {size})`: round portrait with a
  faction ring (`data-faction`), sizes xs 22 · sm 32 · md 48 · lg 72 · xl 104px. They load
  the 160px WebP from `assets/commanders/token/` (written by `generate_deck_pages.py`)
  through `srcset`, falling back to the 400px JPG.
- **Helpers**: `ACA.countUp` (number roll-up, off under reduced motion), `ACA.periodLabel()`
  ("Last 3 months · All maps"), `formatSiteDate()`.
- **Ranking rule**: winrates are ranked only with ≥20 games (spotlight, standings —
  smaller samples sink and dim); cells under 5 games show `--`.
- **First-turn pairing**: going first = gold, going second = steel blue, everywhere.
- **Metagame**: the first 25 archetypes render, then "Show all N archetypes"; archetype
  art is lazy-loaded.

## Deck builder

`site/decks.html` (+ `decks/<slug>/` copies), `decks.css`, `decks.js`.

- Commander tokens (`commanderTokenHtml()`): the same round faction ring as analytics.
- Card tiles use the transparent 400×560 renders in `assets/media/cards/<slug>.webp`
  (pointer tilt, masked foil on hover); mana gems are the axis/filter labels; the deck-size
  meter reads against the 40–60 card rule in GAME_RULES.md.
- Below 900px the summary sidebar is a drawer; an imported deck gets a summary strip
  (token, deck name, commander, size, Copy link) above the decklist, and a deck opened from
  a shared link folds the import box into one "Opened from a shared link · Change" line.
- `/decks/<slug>/` without `?code` is that commander's page: Build mode with the commander
  chosen and the hero naming them.
- The pool shows one tile per card name (cardlist.json can list a re-issued card twice;
  the later id is the one deck codes use).
