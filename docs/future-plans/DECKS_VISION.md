# Deck Tools Vision — Atlas Conquest

> Roadmap for the deck builder, deck sharing, and community deck features.
> For analytics, see [ANALYTICS_VISION.md](ANALYTICS_VISION.md). For landing page, see [LANDING_PAGE_VISION.md](LANDING_PAGE_VISION.md).

---

## Current State (v1.8 — Jul 2026)

**Second round of real-device/desktop feedback** — polish and one architectural fix:

- **Deck list shows card art**: the "My Deck" view (and Import's decklist) now renders the same
  art-forward `.card-tile` grid used by the Add Cards browser, grouped by cost, instead of plain
  text rows. Import mode gets a read-only ×N badge in place of the +/- stepper.
- **Fixed a state-leak bug**: a deck started fresh in Build mode was staying visible if you
  switched to the Import tab, since Import and Build share one underlying deck object (by design —
  it's what lets an imported deck carry into Build for further editing). Added a `deckSource` flag
  (`'import'` | `'build'`) so Import only shows the shared list/sidebar when it actually originated
  from an import; the "carry an imported deck into Build" behavior is unaffected.
- **Desktop no longer gets the mobile detail-then-confirm sheets**: those were built to work around
  touch devices having no hover. On desktop, clicking a commander tile now selects immediately
  (hover already previews the full card — extended to cover picker tiles, which previously had no
  hover preview at all) and clicking a card's art quick-adds instead of opening a bottom sheet.
  Touch devices are unaffected. Gated by one `supportsHover` check (`matchMedia('(hover: hover) and
  (pointer: fine)')`), reused everywhere this distinction matters.
- **Empty "My Deck" tab** now shows an "Add Cards" nudge instead of blank stat cards; fixed the
  type breakdown showing a nonsensical "0% Minions / 100% Spells" for an empty deck.
- **Escape closes the topmost open overlay** (commander picker, either detail sheet, deck drawer),
  peeling off one layer at a time to match backdrop-click behavior. Opening an overlay moves focus
  to its close button; closing the picker or deck drawer returns focus to the button that opened it.
- Ran a Lighthouse audit as a final check — Lighthouse dropped its dedicated PWA-scoring category
  as of v10 (this is v12.8.2, `categories` comes back empty for `--only-categories=pwa`); Google now
  points to Chrome DevTools' Application/Manifest panel instead, which is what the manual
  Playwright-driven checks throughout this project's PWA work already replicate (manifest
  fetch/parse, icon reachability, SW registration → `activated`, precache contents, secure-context
  behavior).
- **Fixed two small bugs found in live testing**: the hover-preview popup (`z-index: 1100`, set
  before any of the picker/detail overlays existed) was rendering *behind* the commander picker
  modal (`z-index: 1300`) once hover was extended to work inside it — bumped to `1500`, the highest
  in the file, since it's a transient popup that should always float above whatever it's triggered
  from. Also fixed a stale-image flash when switching between commanders in the detail sheet: the
  picker grid only ever loads the cropped portrait (`/assets/commanders/`), never the full framed
  card the detail sheet shows (`/assets/cards/`), so unlike the card detail sheet (which reuses an
  already-cached image from its own grid) every commander selection was a fresh, uncached fetch —
  the previous commander's art stayed on screen until the new one finished loading. Now hidden
  immediately on selection and revealed only once the new image actually loads.

## Current State (v1.7 — Jul 2026)

**Real-phone testing follow-up** — two fixes to the v1.6 mobile pass, found by testing on an
actual device rather than DevTools emulation:

- **Commander detail-then-confirm**: tapping a commander tile in the visual picker (v1.6) used to
  select it instantly, with no way to see abilities/stats first. Now it opens a detail sheet
  showing the commander's actual card art — the game already bakes the ability text and all 4
  stats (dominion/intellect/speed/health) into that image, so no separate stat-block UI was
  needed — with a "Select Commander" button that performs the actual selection. Tapping your
  *already-selected* commander's tile reopens the same view, doubling as a way to check its
  abilities mid-build. Matches how Hearthstone/MTG Arena preview a hero before you commit.
- **Build mode Add Cards / My Deck tabs (mobile only)**: v1.6 removed the card browser's nested
  scroll box so it wouldn't trap your thumb, but that meant the full ~150-card pool sat inline
  above the deck list — you had to scroll past all of it to see what you'd built. Build mode's
  mobile layout is now split into two tabs pinned near the top: **Add Cards** (commander picker +
  search/chips + full-height grid, nothing else) and **My Deck** (commander header + stats + mana
  curve + type breakdown + itemized list). Replaces the floating pill+drawer *for Build mode
  only* — Import mode keeps that pattern unchanged, since it has no card pool to scroll past.
  Matches how Hearthstone/MTG Arena/Marvel Snap separate "browse the pool" from "manage your deck."

## Current State (v1.6 — Jul 2026)

**Mobile & PWA upgrade** — the deck builder is now installable and works fully offline:

- **Installable PWA**: `site/manifest.webmanifest` + `site/service-worker.js`. Installs as
  "Atlas Conquest Decks", launches straight into `decks.html` (`start_url`), standalone display,
  dark theme color. Icons generated by `scripts/generate_pwa_icons.py` from the existing app icon
  (192/512/maskable + Apple touch icon).
- **Offline deck building**: the service worker precaches the app shell (`decks.html`, its CSS/JS,
  and `cardlist.json`/`cards.json`/`commanders.json`) so import/build/encode works with zero
  connectivity. Card/commander art is cached opportunistically as it's viewed (cache-first), not
  bulk-downloaded — the art directory is 34MB. Data JSON uses stale-while-revalidate so new cards
  show up automatically on the next online visit. The service worker's fetch handler only
  intercepts deck-tools URLs and explicitly passes everything else through untouched, even though
  its registration scope is site-wide.
  **Maintenance note**: bump `CACHE_NAME` in `service-worker.js` whenever the precached shell file
  list changes, so old caches get evicted on the next visit.
- **Touch-friendly card browser**: horizontally-scrollable cost filter chips (tap instead of
  typing), larger +/- tap targets on mobile, and a new tap-to-open card detail sheet (large art +
  big stepper) — the primary large-target path for adding/removing cards on touch, alongside the
  existing inline tile controls. Desktop hover preview (`initCardPreview()`) is unchanged.
- **Mobile deck drawer**: below 900px, the stats sidebar is no longer pushed above/below the card
  list. It's now a slide-up bottom-sheet drawer opened via a fixed "Deck · N cards" pill, closed via
  its own close button, backdrop tap, or tap-outside. Desktop (≥900px) two-column layout is
  unchanged. No swipe gestures — buttons/taps only, by design (see Design Constraints).
- **Commander portrait fallback**: missing art now shows a faction-colored initial badge instead of
  just disappearing.
- **"What's a deck code?" tooltip**: info button next to the import input for players unfamiliar
  with exporting from the game client.

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
https://atlas-conquest.com/decks.html?code=wrNWQ29udHJvbHYz%3ADMHgDgzrwAAO...
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

- **Real 512px icon master**: current PWA icons are upscaled from the 256px source app icon; a
  proper 512px+ master asset would look sharper on high-DPI install prompts.
- **Swipe-to-remove**: swipe-left-to-delete on deck list rows, deferred from the v1.6 mobile pass
  to keep custom touch-gesture handling out of scope for now (large tap targets cover the same need).
- **iOS/Safari real-device testing**: the mobile/PWA work has only been verified on Android/Chrome
  (Pixel). The `apple-mobile-web-app-*` meta tags and apple-touch-icon are in place, but iOS's
  install flow (Share Sheet, not `beforeinstallprompt`) and its partial manifest support haven't
  been confirmed on an actual device.

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
