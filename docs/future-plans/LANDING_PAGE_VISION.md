# Landing Page Vision — Atlas Conquest

> Design goals, current state, and roadmap for the game's front door.
> For analytics, see [ANALYTICS_VISION.md](ANALYTICS_VISION.md). For deck tools, see [DECKS_VISION.md](DECKS_VISION.md).

---

## Purpose

The landing page is the first impression for three audiences:
1. **New players** who don't know the game and need to understand what it is
2. **Existing players** looking for deck tools, community links, or analytics
3. **Search engines and social media** — link previews, SEO, and discoverability

## Current State (v1.1 — Feb 2026)

| Section | Content |
|---------|---------|
| Hero | Cinematic wide art (Euron knight), SVG hex grid overlay, animated faction-colored glows, stats row (17 commanders, 287+ cards, 3 maps, 3000+ matches) |
| Commander Showcase | Infinite horizontal scroll of 15 commanders with faction-colored bottom borders |
| Conquer the Hex Grid | Decorative 7-hex cluster + 3-step explainer (Build Deck, Claim Territory, Defeat Enemy) with thematic SVG icons |
| Six Patron Gods | 6 faction cards with real game emblem PNGs, colored top borders, descriptions |
| Pick Up & Play | 5 starter decks (Deploy, Beasts, Military, Death, Mage) covering 5 of 6 factions |
| Ready to Conquer? | 3 CTA cards (Discord, Analytics, Deck Tools) |
| Footer | Brand, tagline, links |

**Assets in use:** 4 hero JPGs (`site/assets/hero/`), 6 faction emblem PNGs (`site/assets/factions/`), 15 commander portrait JPGs (`site/assets/commanders/`), game icon (`site/assets/logo/`). Source: Unity game repo loading portraits and patron icons.

---

## UI/UX Assessment (Feb 2026)

Visual review at desktop (1280px), tablet (768px), and mobile (375px).

### Strengths

- **Hero section is strong**: The cinematic wide art with SVG hex grid overlay and faction-colored glows creates an immediate premium impression. The stats row (17 commanders, 287+ cards, etc.) communicates scale.
- **Commander carousel**: Infinite horizontal scroll with faction-colored bottom borders gives immediate faction context. Smooth on all viewports.
- **Hex cluster illustration**: The 7-hex CSS cluster in "Conquer the Hex Grid" effectively communicates the hex mechanic visually. The SVG icons (cards, hex+flag, gem) are clear at all sizes.
- **Faction section**: Real game emblem PNGs with colored top borders look premium and communicate the 6-faction system effectively.
- **Starter decks 3+2 layout**: 5 decks in flexbox wrap — 3 top, 2 centered below — looks intentional and balanced at all breakpoints.
- **Responsive behavior**: All sections scale well from 375px to 1280px. The hex cluster shrinks proportionally, cards stack cleanly.

### Minor Issues

- **Starter decks not clickable**: The 5 starter deck cards don't link anywhere yet (no deck codes encoded). Visual design suggests they should be interactive.
- **Hero art is static**: Only showing one of 4 available hero images. Rotation would add variety for returning visitors.
- **No OG/meta tags**: Sharing on Discord/Twitter shows a generic link preview rather than the hero image and tagline.

---

## Phase 2 — Near-Term Improvements

### Starter Deck Deep Links
Pre-encode each starter deck as a deck code and link directly to `decks.html?code=X` so clicking a starter deck shows the full decklist immediately.

### Hero Art Rotation
Randomly pick from 4 hero images on page load (euron, khazgar, zoghn, centurion). Simple inline JS. Requires verifying overlay gradient compatibility with each image's color palette.

### Engagement Copy Polish
- Eyebrow: "Competitive Deck Builder" → "Hex-Grid Strategy Card Game" (more specific, communicates uniqueness)
- Consider adding a brief "what makes this different" callout between hero and commander carousel
- Add a "Watch Gameplay" button if a trailer or gameplay video exists

### OG/Twitter Meta Tags
Add Open Graph and Twitter Card meta tags for better link previews when shared on Discord, Twitter, Reddit, etc. Include hero image, title, and description.

---

## Phase 3 — Future Ideas

### Hero Video Background
If a gameplay trailer or short clip exists, a muted autoplay video behind the hero overlay would be dramatic. Falls back to static image on mobile or slow connections.

### Interactive Mini Hex Board
A small playable hex board (click to claim tiles) as an in-page mini-tutorial. Pure JS, no backend. Would viscerally communicate the "hex grid" mechanic better than any illustration.

### Commander Detail Tooltips
Hovering a commander in the carousel shows their ability text, faction, and stats in a floating card. Links to their analytics page.

### Animated Stats Counter
The stats row (17 commanders, 287+ cards, etc.) counts up from 0 when scrolled into view using `IntersectionObserver`.

### Social Proof Section
"Featured in..." or player testimonials once the game has press coverage or a larger community.

### Download/Play CTA
Once the game is available for download, add platform badges (Steam, App Store, etc.) prominently in the hero section.

### Analytics Preview Widget
Show a live "meta snapshot" on the landing page: top 3 commanders by pick rate with mini winrate bars, pulled from the same static JSON the analytics pages use. Gives visitors a taste of the data depth without leaving the page.

---

## Design Constraints

- No build step — plain HTML/CSS/JS
- Must load fast — minimize image weight, lazy-load below fold
- Must look good at 320px to 2560px
- Dark aesthetic consistent with the design system (see [DESIGN.md](../DESIGN.md))
- Cinzel serif for headings, Inter for body text
- Okabe-Ito colorblind-safe faction palette
