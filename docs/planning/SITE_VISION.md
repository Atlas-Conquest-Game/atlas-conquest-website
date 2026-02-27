# Site Vision — Atlas Conquest

> Roadmap for the unified Atlas Conquest website. Covers deck tools, site structure, community features, and domain migration.
> For analytics-specific features, see [ANALYTICS_VISION.md](ANALYTICS_VISION.md).

---

## Current State

The Atlas Conquest web presence is split across two properties:

1. **atlas-conquest.com** — The game's main site, currently hosted on Wix (placeholder quality, costs money)
2. **GitHub Pages analytics dashboard** — This repo, 6 pages of game stats and deck tools

The goal is to **unify everything under one GitHub Pages site** at `atlas-conquest.com`, cancel Wix, and build out community features like deck sharing.

---

## Phase 1: Deck Tools (DONE)

A deck viewer/builder page added to the existing analytics site.

**Delivered:**
- `site/decks.html` — Import (decode) and Build (encode) deck codes
- `site/js/deckcode.js` — Deck codec ported from C# (14-bit card ID + 6-bit count, 20-bit packed, LSB-first)
- `site/js/decks.js` — Page logic with autocomplete card search, URL param sharing
- `site/data/cardlist.json` — 293 cards extracted from FullCardList.asset
- `scripts/extract_cardlist.py` — One-time extraction script
- URL sharing: `decks.html?code=<encoded>` auto-decodes on load

**To maintain:**
- Run `python scripts/extract_cardlist.py` when new cards are added to the game
- Card metadata (cost, type, faction) comes from `cards.json` pipeline output

---

## Phase 2: Repo Rename + Custom Domain

Migrate from Wix to GitHub Pages under the custom domain.

**Steps:**
1. Rename GitHub repo from `atlas-conquest-analytics` → `atlas-conquest`
2. Add `site/CNAME` file with `atlas-conquest.com`
3. Matan (domain owner) updates DNS:
   - A records → GitHub Pages IPs: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - CNAME `www` → `<username>.github.io`
4. Verify site loads at `atlas-conquest.com`
5. Cancel Wix hosting
6. Update `.claude/` project settings for new repo path

**Risks:**
- Brief downtime during DNS propagation (usually < 1 hour)
- Old analytics URLs will break if repo is renamed (GitHub doesn't redirect Pages)

---

## Phase 3: Landing Page + Navigation Restructure

Replace `index.html` (currently analytics overview) with a proper game landing page.

**Steps:**
1. Rename `site/index.html` → `site/analytics.html`
2. Create new `site/index.html` — game landing page with hero, about, factions, download links
3. Restructure navigation:
   - **Primary nav**: Home, Analytics, Decks
   - **Sub-nav** (analytics pages only): Overview, Commanders, Cards, Meta, Mulligan

**Content needed:**
- Game description and selling points
- Faction lore summaries
- Download/play links
- Commander showcase

---

## Phase 4: Community Features

### Deck Sharing & Discovery
- Public deck gallery: community-submitted decks browsable by commander/faction
- Deck ratings and comments (requires a backend — consider GitHub Discussions or a lightweight API)
- "Featured Decks" section curated from tournament results

### Deck Analytics Integration
- Link deck viewer to card stats: click a card in a deck → see its analytics
- Deck winrate estimation based on historical card performance data
- "Similar decks" recommendations using Jaccard similarity on card lists

### Tournament Support
- Tournament meta snapshots (already in ANALYTICS_VISION.md)
- Deck submission via deck codes for tournament registration
- Tournament results page with decklists

---

## URL Structure (End State)

```
atlas-conquest.com/                  → Landing page
atlas-conquest.com/analytics.html    → Analytics overview
atlas-conquest.com/commanders.html   → Commander stats
atlas-conquest.com/cards.html        → Card stats
atlas-conquest.com/meta.html         → Meta trends
atlas-conquest.com/mulligan.html     → Mulligan analysis
atlas-conquest.com/decks.html        → Deck tools
atlas-conquest.com/decks.html?code=X → Shareable deck link
```

Query params for deck URLs because GitHub Pages has no server-side routing — `decks.html?code=X` works natively.

---

## Design Principles

- **No build step**: Keep the site as plain HTML/CSS/JS
- **Extend existing design system**: Use `variables.css` colors, `components.css` patterns
- **Progressive enhancement**: Deck tools work standalone, analytics pages share `shared.js`
- **Mobile-first**: All new pages must be responsive (existing breakpoints at 768px, 480px)
