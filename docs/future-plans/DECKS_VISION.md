# Deck Tools Vision — Atlas Conquest

> Roadmap for the deck builder, deck sharing, and community deck features.
> For analytics, see [ANALYTICS_VISION.md](ANALYTICS_VISION.md). For landing page, see [LANDING_PAGE_VISION.md](LANDING_PAGE_VISION.md).

---

## Current State (v1.1 — Mar 2026)

- **Import**: Decode deck code string into visual decklist with commander portrait
- **Build**: Select commander, search cards (faction-filtered), assemble deck, encode to deck code
- **URL sharing**: `decks.html?code=<encoded>` auto-decodes on page load — works on GitHub Pages
- **Card metadata**: Cost, type, faction loaded from `cardlist.json`
- **Codec**: `deckcode.js` encodes/decodes deck codes compatible with the Unity game client

### URL Sharing on GitHub Pages

`decks.html?code=X` works perfectly on static hosting. The deck code is read client-side via `URLSearchParams` — no server-side routing required. GitHub Pages serves HTTPS by default, which enables the `navigator.clipboard` API used for copy actions.

A real share URL looks like:
```
https://atlasconquest.gg/decks.html?code=wrNWQ29udHJvbHYz%3ADMHgDgzrwAAO...
```
- `wrNWQ29udHJvbHYz` = base64 of `(commanderID)(deckName)`
- `%3A` = URL-encoded colon separator
- `DMHgDgzrwAAO...` = base64 of binary card data (20 bits per card)

---

## Current UI/UX Assessment (Feb–Mar 2026)

Observations from visual review at desktop (1280px) and mobile (375px).

### What's Working

- **Clean tab interface**: Import Deck / Build Deck tabs are clear and functional. Underline style is consistent with the design system.
- **Form layout on desktop**: Commander dropdown + Deck Name side by side, full-width card search below — good spatial hierarchy.
- **Stats bar**: The 5 deck stats (Cards, Unique, Avg Cost, Minions, Spells) are compact and readable at a glance.
- **Mobile stacking**: Forms stack to single-column cleanly. Decode button goes full-width. Stats wrap to 3+2 layout.
- **Copy buttons**: "Copy Deck Code" and "Copy Share URL" are prominent and well-placed for the primary use case (share a deck).

### Fixed in v1.1

- **Commander portrait**: Hidden by default, revealed on deck load. Art path now uses slug format matching actual filenames.
- **Empty deck state**: Replaced bare outlined box with a dashed-border placeholder message guiding users to import or build.
- **Faction-aware card search**: Build mode now filters card autocomplete to the selected commander's faction + Neutral. A filter hint label shows what's being shown. Neutral commanders (Lazim, Newhaven) see all cards.
- **Richer card suggestions**: Autocomplete now shows `[cost] Name · Type · FACTION` instead of just name + faction label.

### Remaining Opportunities

- **Build tab discoverability**: The Import/Build tabs are subtle (small text, underline-only). A first-time visitor may not notice the Build tab exists.
- **Deck code format hint**: Consider a small "What's a deck code?" tooltip for new players who don't know how to export from the game client.
- **Commander portrait placeholder**: When portrait fails to load (image not found), show faction emblem as fallback instead of nothing.

---

## Phase 2 — Builder Enhancements

### Mana Curve Visualization
A live bar chart (pure CSS, no Chart.js dependency) showing cards-per-cost as the deck is built. Updates on every card add/remove. Costs 0–7+. Gives immediate visual feedback on curve shape.

### Commander Portrait from Data
`commanders.json` has an `art` field with the portrait path. Use it as a fallback if the slug-based path fails. This makes imported decks and built decks feel equally polished.

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
- Card art hover previews should reuse the existing card-preview component pattern from analytics pages
- Consistent with the dark editorial design system
