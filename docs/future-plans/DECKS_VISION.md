# Deck Tools Vision — Atlas Conquest

> Roadmap for the deck builder, deck sharing, and community deck features.
> For analytics, see [ANALYTICS_VISION.md](ANALYTICS_VISION.md). For landing page, see [LANDING_PAGE_VISION.md](LANDING_PAGE_VISION.md).

---

## Current State (v1 — Feb 2026)

- **Import**: Decode deck code string into visual decklist
- **Build**: Select commander, search cards, assemble deck, encode to deck code
- **URL sharing**: `decks.html?code=<encoded>` auto-decodes on page load
- **Card metadata**: Cost, type, faction loaded from `cardlist.json`
- **Codec**: `deckcode.js` encodes/decodes deck codes compatible with the Unity game client

---

## Current UI/UX Assessment (Feb 2026)

Observations from visual review at desktop (1280px) and mobile (375px).

### What's Working

- **Clean tab interface**: Import Deck / Build Deck tabs are clear and functional. Underline style is consistent with the design system.
- **Form layout on desktop**: Commander dropdown + Deck Name side by side, full-width card search below — good spatial hierarchy.
- **Stats bar**: The 5 deck stats (Cards, Unique, Avg Cost, Minions, Spells) are compact and readable at a glance.
- **Mobile stacking**: Forms stack to single-column cleanly. Decode button goes full-width. Stats wrap to 3+2 layout.
- **Copy buttons**: "Copy Deck Code" and "Copy Share URL" are prominent and well-placed for the primary use case (share a deck).

### Issues to Fix

- **Broken commander portrait**: When no deck is loaded, the commander portrait area shows a broken `<img>` tag (missing image icon). Should either hide the image element or show a placeholder silhouette.
- **Empty deck state**: The empty decklist area shows just a thin red/green outlined box. A new visitor has no idea what this area is for. Needs a welcoming empty state: "Your deck will appear here — paste a deck code or build one from scratch."
- **Build tab discoverability**: The Import/Build tabs are subtle (small text, underline-only). A first-time visitor may not realize they can build a deck from scratch. Consider making the tab toggle more prominent, or showing both modes' entry points more visually.
- **No starter decks on this page**: The landing page advertises 5 starter decks but the deck tools page has no quick-start gallery. A visitor clicking through expects to find them here.

### Opportunities

- **Empty state with starter deck shortcuts**: Replace the bare empty deck area with starter deck buttons — "Try a starter deck" with 5 faction-colored buttons that auto-load a pre-encoded deck code.
- **Commander portrait placeholder**: Show the faction emblem or a generic commander silhouette when no commander is selected.
- **Card search preview**: When typing in the "Search for a card" box, show a dropdown with matching cards including their art thumbnail, cost, and type. Currently it's likely text-only.
- **Deck code format hint**: The placeholder text shows a truncated example code. Consider a small "What's a deck code?" link for new players who don't know how to export from the game client.

---

## Phase 1.1 — Starter Deck Gallery

Add a "Starter Decks" section to `decks.html` showing all 5 starter decks with pre-encoded deck codes. Clicking one loads the full decklist into the viewer.

The landing page's starter deck cards would deep-link here via `decks.html?code=X`.

**Starter decks** (from Unity `Assets/Resources/Deck/`):
| Deck | Commander | Faction | Cards |
|------|-----------|---------|-------|
| Starter Deploy | Captain Greenbeard | Skaal | 40 cards (goblins, haste, lightning) |
| Starter Beasts | Jagris the Huntsman | Grenalia | 40 cards (beasts, poisons, buffs) |
| Starter Military | Milo Sunstone | Lucia | 40 cards (paladins, healing, soldiers) |
| Starter Death | Soultaker Viessa | Shadis | 41 cards (vampires, drain, sacrifice) |
| Starter Mage | Starwise Luna | Archaeon | 40 cards (frost, spells, mana refresh) |

---

## Phase 2 — Deck Sharing & Discovery

### Community Deck Gallery
Public deck submissions via deck code + metadata (name, description, tags). Storage options:
- **GitHub Issues as backend** — free, no server, searchable via API
- **Simple JSON file** — curated list committed to repo, generated from submissions
- Browse by commander, faction, or archetype tag
- "Copy deck code" and "View in builder" buttons per entry

### Deck Ratings
Simple upvote system. Requires some form of persistence:
- GitHub Discussions API (free, community-visible)
- Lightweight serverless function (Cloudflare Workers or similar)
- Sort by popularity, recency, or winrate (if analytics integration exists)

---

## Phase 3 — Analytics Integration

### Card Stats in Deck View
Hover/click a card in the deck viewer to see its drawn rate, played rate, and winrate from the analytics data. Color-code cards by performance (green = high WR, red = low WR).

### Deck Winrate Estimation
Use historical card performance data to estimate a deck's expected winrate. Compare against meta averages for that commander. Show a "power budget" visualization.

### Similar Decks
Jaccard similarity on card lists to find "decks like this one" from the match database. Link to analytics for those archetypes.

---

## Phase 4 — Advanced Builder

### Faction-Aware Card Filtering
Auto-filter card search to show only cards legal for the selected commander (commander's faction + neutral, or all factions for Lazim). Visual indicator for off-faction cards.

### Mana Curve Visualization
Live mana curve bar chart that updates as cards are added/removed. Overlay the average mana curve for that commander from analytics data.

### Deck Comparison Tool
Side-by-side comparison of two decks. Highlight cards that differ, show stat comparisons.

---

## Design Constraints

- No backend required for Phase 1-2 (static hosting only)
- Deck codes must remain compatible with the game client's C# codec
- Card art hover previews should reuse the existing card-preview component pattern from analytics pages
- Consistent with the dark editorial design system
