# Deck Tools Vision — Atlas Conquest

> Roadmap for the deck builder, deck sharing, and community deck features.
> For analytics, see [ANALYTICS_VISION.md](ANALYTICS_VISION.md). For landing page, see [LANDING_PAGE_VISION.md](LANDING_PAGE_VISION.md).

---

## Current State (v1.5 — Mar 2026)

- **Import**: Decode deck code string into visual decklist with commander portrait and full sidebar stats
- **Build**: Select commander, browse all faction-compatible cards in a scrollable grid, assemble deck, encode to deck code
- **URL sharing**: `decks.html?code=<encoded>` auto-decodes on page load — works on GitHub Pages
- **Card metadata**: Cost, type, faction, card text, stats loaded from `cards.json`; deck codec uses `cardlist.json`
- **Codec**: `deckcode.js` encodes/decodes deck codes compatible with the Unity game client (14-bit card ID + 6-bit count, 20-bit packed, LSB-first)
- **Two-column layout**: Card list left, sticky stats sidebar right. Collapses to single column on mobile.
- **Card hover preview**: Hovering any card row (Import mode) or card art tile (Build mode) shows a floating card art image following the cursor.
- **Stacked mana curve**: CSS bar chart, costs 0–7+, stacked minion (gold) + spell (periwinkle) segments with legend. Updates live on every add/remove.
- **Type breakdown**: Minion vs Spell counts with proportional two-tone bar (gold/periwinkle). Updates live.
- **Import → Build sync**: Switching to Build tab after importing a deck auto-populates commander and deck name.
- **Card grid browser**: Always-visible scrollable grid showing all faction-compatible cards with art thumbnails, cost badge, and +/− count controls. Sort by Cost or Name. Filters by text input. Shows "Showing X + Neutral cards" hint.
- **Card pool filtering**: Only shows playable cards (sourced from `cards.json`). Tokens, placeholders, and commanders are excluded automatically.
- **Faction compatibility rules**: Full faction + neutral for faction commanders; neutral-only for Newhaven Township; all non-neutral factions for Lazim (per card text).
- **Incompatible card warning**: Importing a deck then changing commander highlights incompatible cards in red with a warning banner.
- **Copy row**: "Copy URL" + "Copy Deck Code" side by side below commander portrait.
- **Test suite**: `site/deck_tests.html` — 23 automated tests covering card compatibility, mana curve, codec roundtrip, and import→build sync.

### URL Sharing on GitHub Pages

`decks.html?code=X` works perfectly on static hosting. The deck code is read client-side via `URLSearchParams` — no server-side routing required. GitHub Pages serves HTTPS by default, which enables the `navigator.clipboard` API used for copy actions.

A real share URL looks like:
```
https://rossfw.github.io/atlas-conquest/decks.html?code=wrNWQ29udHJvbHYz%3ADMHgDgzrwAAO...
```
- `wrNWQ29udHJvbHYz` = base64 of `(commanderID)(deckName)`
- `%3A` = URL-encoded colon separator
- `DMHgDgzrwAAO...` = base64 of binary card data (20 bits per card)

---

## UI/UX History

### Fixed in v1.1 (Feb 2026)

- **`.hidden` CSS class**: Was never defined — elements were always visible on load. Added `.hidden { display: none !important; }` to `base.css`.
- **Commander portrait**: Hidden by default, revealed on deck load. Art path uses slug format matching actual filenames (`elyse-of-the-order.jpg`). `onerror` hides gracefully if file is missing.
- **Empty deck state**: Dashed-border placeholder message guiding users to import or build.
- **Faction-aware card search**: Build mode filters autocomplete to commander's faction + Neutral. Neutral commanders (Lazim, Newhaven Township) see all cards.
- **Richer card suggestions**: Autocomplete shows `[cost] Name · Type · FACTION` format.

### Fixed in v1.2 (Mar 2026)

- **Two-column layout**: Desktop grid (`1fr 300px`), collapses to single column at 900px.
- **Sticky stats sidebar**: Commander portrait, faction badge, deck name, quick stats (Cards / Unique / Avg Cost), mana curve, type breakdown.
- **Card hover preview**: Fixed-position art follows cursor. Same `card-preview` pattern as `cards.html`.
- **Card row type badge**: Each row shows SPELL or MINION label.
- **Open Graph / Twitter Card tags**: Added to all pages for Discord/social embed previews.

### Fixed in v1.3 (Mar 2026)

- **Stacked mana curve**: Minion (gold `var(--lucia)`) + spell (periwinkle `#7C9EFF`) stacked segments with legend. Replaced flat orange bars.
- **Import → Build sync**: Switching tabs after import auto-fills commander + deck name in Build.
- **Copy row**: "Copy URL" + "Copy Deck Code" side by side below portrait (was two separate buttons in different locations).
- **Color scheme**: Replaced Skaal orange with site-native gold/periwinkle throughout type breakdown and curve.

### Fixed in v1.4 (Mar 2026)

- **Card grid browser**: Replaced dropdown autocomplete with always-visible scrollable grid. Shows all faction-compatible cards with art thumbnails, cost badge overlay, and +/− count controls. Sortable by Cost or Name.
- **Commander sync fix**: Importing a deck then switching to Build correctly overwrites a previously selected commander (removed stale `if (!sel.value)` guard).
- **Card pool filter**: `getCardPool()` now filters to `cards.json` entries only — excludes tokens (Durka Spawn, Dragon), placeholders (Default, Blaize), and commanders.
- **Faction rules**: Newhaven Township = neutral-only; Lazim = all non-neutral factions (per card text); faction commanders = own faction + neutral.
- **Incompatible card warning**: Red row highlighting + yellow banner when deck contains cards not legal for the selected commander.

### Fixed in v1.5 (Mar 2026)

- **Card tile hover preview**: Hovering the art portion of a card tile in Build mode triggers the same enlarged cursor-following preview as deck list rows.

### Remaining Opportunities

- **Deck code format hint**: "What's a deck code?" tooltip for players who don't know how to export from the game client.
- **Commander portrait fallback**: When portrait fails, show faction emblem instead of hiding the element.

---

## Phase 3 — Deck Sharing & Discovery

### Community Deck Gallery
Public deck submissions with no backend required:
- **GitHub Issues as backend** — users open a prefilled Issue with deck code + metadata
- A `community_decks.json` (manually curated or auto-generated from merged Issues) is committed to the repo
- Browse by commander, faction, or archetype tag
- "Copy deck code" and "View in builder" buttons per entry

### Deck Ratings
Simple upvote system. Options:
- GitHub Discussions API (free, community-visible)
- Lightweight serverless function (Cloudflare Workers or similar)

Revisit when there are enough players submitting decks organically.

---

## Phase 4 — Analytics Integration

### Card Stats in Deck View
Hover/click a card in the deck viewer to see its drawn rate, played rate, and winrate from the analytics data. Color-code cards by performance (green = high WR, red = low WR).

### Deck Winrate Estimation
Use historical card performance data to estimate a deck's expected winrate. Compare against meta averages for that commander.

### Similar Decks
Jaccard similarity on card lists to find "decks like this one" from the match database. Link to analytics for those archetypes.

---

## Design Constraints

- No backend required for Phase 1-3 (static hosting only)
- Deck codes must remain compatible with the game client's C# codec
- Card art hover previews reuse the `card-preview` component pattern from `cards.html`
- Consistent with the dark editorial design system
