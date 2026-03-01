# Deck Tools Vision — Atlas Conquest

> Roadmap for the deck builder, deck sharing, and community deck features.
> For analytics, see [ANALYTICS_VISION.md](ANALYTICS_VISION.md). For landing page, see [LANDING_PAGE_VISION.md](LANDING_PAGE_VISION.md).

---

## Current State (v1.2 — Mar 2026)

- **Import**: Decode deck code string into visual decklist with commander portrait and full sidebar stats
- **Build**: Select commander, search cards (faction-filtered), assemble deck, encode to deck code
- **URL sharing**: `decks.html?code=<encoded>` auto-decodes on page load — works on GitHub Pages
- **Card metadata**: Cost, type, faction loaded from `cardlist.json`
- **Codec**: `deckcode.js` encodes/decodes deck codes compatible with the Unity game client
- **Two-column layout**: Card list left, sticky stats sidebar right. Collapses to single column on mobile (sidebar stacks above card list).
- **Card hover preview**: Hovering any card row shows a floating card art image (same pattern as cards.html).
- **Mana curve**: Live CSS bar chart, costs 0–7+, updates on every add/remove.
- **Type breakdown**: Minion vs Spell count + proportional two-tone bar (Minion = Skaal orange, Spell = Archaeon blue).

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

- **Two-column layout**: Desktop grid (`1fr 300px`), collapses to single column at 900px with sidebar above card list on mobile.
- **Sticky stats sidebar**: Commander portrait, faction badge, deck name, Copy Share URL (primary CTA at top), quick stats (Cards / Unique / Avg Cost), mana curve, type breakdown, Copy Deck Code.
- **Mana curve visualization**: Pure CSS bar chart, costs 0–7+. Updates live on every card add/remove.
- **Type breakdown**: Minion vs Spell counts with proportional two-tone bar. No "Other" category — all cards are Minion or Spell.
- **Card hover preview**: Fixed-position art image follows cursor over any card row. Same `card-preview` component pattern as `cards.html`. Art loaded from `assets/cards/<slug>.jpg`.
- **Card row type badge**: Each card row now shows SPELL or MINION label in addition to faction badge.
- **Copy Share URL moved up**: Primary CTA is now directly below commander name in sidebar, not buried at the bottom.
- **Open Graph / Twitter Card tags**: Added to all pages for Discord/social embed previews.

### Remaining Opportunities

- **Deck code format hint**: "What's a deck code?" tooltip for players who don't know how to export from the game client.
- **Commander portrait fallback**: When portrait fails, show faction emblem instead of hiding the element.
- **Import tab: card hover preview**: Currently works in both Import and Build mode but art files may be missing for some cards — `onerror` silently hides preview.

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
