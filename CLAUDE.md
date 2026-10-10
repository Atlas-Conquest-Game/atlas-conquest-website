# Atlas Conquest Data Analytics

> Agent entry point. This file is the map — see linked docs for depth.

## What This Is

A static analytics dashboard for **Atlas Conquest**, a competitive hex-grid deck builder game. Data is pulled from an AWS DynamoDB database and rendered as a GitHub Pages site.

## Architecture

```
AWS DynamoDB → GitHub Actions (daily/manual) → Static JSON → GitHub Pages
```

- **Data pipeline**: `scripts/pipeline/` — Python package that connects to AWS, pulls match/card/deck data, cleans and aggregates it, and writes static JSON to `site/data/`. Entry point: `scripts/fetch_data.py`.
- **Static site**: `site/` — Vanilla HTML/CSS/JS. Loads JSON data files. No build step.
- **CI/CD**: `.github/workflows/update-data.yml` — Runs daily at 06:00 UTC via cron and on-demand via workflow_dispatch.
- **Discord bot**: `scripts/daily_summary.py` — Posts daily game stats to Discord via webhook, triggered by the same GitHub Actions pipeline.
- **Docs**: `docs/` — System of record for architecture, game rules, design, and data model.

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full system design.

## Site Pages

| Page | File | JS | Description |
|------|------|----|-------------|
| Home | `site/index.html` | `landing.js` | Game landing page — hero stats (live from `commanders.json`/`cards.json`/`metadata.json`), draggable commander wheel with card reveal, factions, starter decks, explore links |
| Overview | `site/analytics.html` | `home.js` | "State of the Meta" hub: KPIs, commander spotlight + standings (≥20-game ranking rule), game-shape distributions, first-turn advantage, explore tiles |
| Commanders | `site/commanders.html` | `commanders.js` | Winrates, deck composition, winrate by turns/actions/duration, detail modal |
| Cards | `site/cards.html` | `cards.js` | Card stats (deck/draw/play rates and winrates) plus optional mulligan and post-match feedback columns, viewer-selectable columns, per-commander breakdown |
| Meta | `site/meta.html` | `meta.js` | Matchup heatmap, faction/commander popularity and winrate trends, first-turn advantage |
| Decks | `site/decks.html` | `decks.js` + `deckcode.js` | Import (decode) and build (encode) deck codes, shareable via URL. `decks/<slug>/` (generated) is each commander's page: Build mode with that commander, or the shared deck when `?code=` is present. Installable PWA with full offline support — see `site/manifest.webmanifest` + `site/service-worker.js` (bump `CACHE_NAME` when its precache list changes). |
| Press | `site/press.html` | `press.js` | Press contact (press@atlas-conquest.com), fact sheet, trailer (opens the shared `[data-ac-trailer]` modal) and press kit. Assets live in a public Google Drive folder; `site/data/press_kit.json` lists each file's Drive id, and `python scripts/build_press_kit.py` downloads them to build previews (`site/assets/press/`, with a larger copy in `large/` for the click-to-enlarge lightbox) plus sizes/dimensions; `--only <slugs>` rebuilds a subset and `--local <dir>` reads re-shot files from disk before they are uploaded. Assets without an id are hidden. |

**Navigation**: Primary nav (Home, Analytics, Decks, Articles, Press) on all pages. Analytics pages also have a sub-nav (Overview, Commanders, Cards, Meta, Metagame, Goals). Analytics pages share `site/js/shared.js` (data loading, filters, modal focus handling, tooltips, helper functions) plus the suite layer `site/css/analytics.css` + `site/js/analytics-ui.js` (`window.ACA`: commander tokens, count-ups, period label) — see "Analytics suite" in DESIGN.md. The Home and Decks pages are standalone. Deep links: `/cards.html#<card-slug>` (or `?q=`) and `/commanders.html#<commander-slug>`, which article card mentions use.

**Site chrome (nav, footer, head includes)** is shared markup: `site/partials/{head,nav,footer}.html` are copied into each page's `<!-- AC:HEAD|NAV|FOOTER -->` regions by `python scripts/sync_chrome.py` (paths fixed per page depth, `aria-current` set per section). Edit the partial, never the region; the deck/article generators re-apply it automatically and `scripts/tests/test_chrome_sync.py` fails on drift. Styles live in `site/css/brand.css` (brand tokens `--ac-*`, `.ac-title`, `.ac-btn`, `.ac-page-hero`, …); calls-to-action, socials, live Discord counts and the trailer modal come from `site/js/site-config.js` — Steam is the primary CTA site-wide by default (`AC_CONFIG.primaryCta = 'steam'`: Steam-blue "Wishlist on Steam" buttons that are no-op `#` links until `links.steam` holds the store URL, Discord as the secondary pill with the live online count); `primaryCta: 'discord'` flips the roles back. See the Brand layer section of [DESIGN.md](docs/DESIGN.md).

**Articles**: `articles/<slug>.md` → `python scripts/build_articles.py` → `site/articles/**` (templates `site/articles.html` + `site/article.html`, styles `articles.css`, behaviour `article.js`). The build also writes responsive WebP renditions + a 1200×630 unfurl crop of each hero image (`site/assets/articles/<slug>/hero-<hash>-*`), WebP renditions of large body images (`img-<hash>-<width>.webp`, served via `srcset`; the original stays as fallback and lightbox view) — both never re-encoded once present — lazy/async body media with intrinsic sizes, clips with `preload="none"` + a `<clip>-poster.webp` (played on scroll by `article.js`), inline card art from the 400×560 WebP renders, heading anchors + the Contents menu, reading time, and canonical/OG meta.

**Discoverability**: every public page carries a canonical URL and OG/Twitter tags (default share image `site/assets/social/atlas-conquest-og.jpg`). `site/robots.txt` points crawlers at `site/sitemap.xml`, which `python scripts/build_sitemap.py` generates from the real pages (root pages, `decks/<slug>/`, `articles/**`; skips templates, `404.html`, `deck_tests.html` and `noindex` pages). It is deterministic — re-run it after adding/removing pages (`--check` exits 1 when stale); CI does not run it yet. `site/404.html` ("Uncharted tile") is served by GitHub Pages at any depth, so it uses root-absolute URLs only (sync_chrome.py gives it "/" chrome). `scripts/tests/test_site_links.py` fails when a public page or stylesheet references a local file that isn't on disk (in CI that means "not committed") or is gitignored.

**Card previews**: `site/js/cardpreview.js` is loaded by every page that shows card art. It owns the `#card-preview` hover popup's contents and placement, and pulls `site/data/mentions.json` so a card renders side-by-side with the cards it creates (tokens). Articles get the same treatment server-side via `scripts/build_articles.py`.

## Pipeline Modules

| Module | Purpose |
|--------|---------|
| `scripts/pipeline/cleaning.py` | Transform raw DynamoDB items into clean game dicts |
| `scripts/pipeline/filtering.py` | Filter games by time period and map |
| `scripts/pipeline/aggregation.py` | All stat computations (winrates, matchups, trends, mulligan, etc.) |
| `scripts/pipeline/main.py` | Orchestration — runs all aggregations for each period × map, writes JSON |
| `scripts/pipeline/constants.py` | Paths, AWS config, normalization maps, thresholds |
| `scripts/pipeline/io_helpers.py` | DynamoDB scanning, cache management, JSON I/O, CSV loading |
| `scripts/insights/` + `scripts/build_insights.py` | Analytics v2 derived layer: reads the *published* `site/data/*.json` (+ git history of `cards.json`) and writes only `site/data/insights/` (matchup model, meta pulse, card changelog, per-commander profiles, community decks, manifest). Runs in CI after `fetch_data.py` (non-blocking; writes nothing on failure). No tier lists — Wilson intervals + gated verdicts (sample-size and one-player/<5-player gates); commit `site/data/insights/_state/` with the changelog. Contracts in DATA_MODEL.md "Insights layer". |

**Archive (repo only, never published)**: `site/archive/index.html` links the pre-refresh site (`site/classic/`), every homepage concept (`site/concepts/`) and the old team preview (`site/preview/`). `deploy-site.yml` deletes those four folders before uploading the Pages artifact, so they exist only in git; browse them locally with `python3 -m http.server 8000 --directory site` → `/archive/`. The live homepage is `site/index.html` + `site/home/`.

## Key Docs

| Doc | Purpose |
|-----|---------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, data flow, layer boundaries |
| [docs/GAME_RULES.md](docs/GAME_RULES.md) | Atlas Conquest game mechanics reference |
| [docs/DESIGN.md](docs/DESIGN.md) | Frontend design system (colors, typography, components) |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | JSON data contracts between pipeline and frontend |
| [docs/future-plans/ANALYTICS_VISION.md](docs/future-plans/ANALYTICS_VISION.md) | Analytics roadmap and feature ideas |
| [docs/future-plans/SITE_VISION.md](docs/future-plans/SITE_VISION.md) | Unified site roadmap (deck tools, landing page, community) |
| [docs/future-plans/DOMAIN_GUIDE.md](docs/future-plans/DOMAIN_GUIDE.md) | Domain strategy, DNS setup, URL hierarchy guide |

## Conventions

- **No build step** for the frontend. Plain HTML/CSS/JS. Keep it simple.
- **Data flows one direction**: AWS → JSON → Site. The site never writes to AWS.
- **Faction colors** (colorblind-safe Okabe-Ito palette): Skaal = `#D55E00`, Grenalia = `#009E73`, Lucia = `#E8B630`, Neutral = `#A89078`, Shadis = `#7B7B8E`, Archaeon = `#0072B2`. Minor patrons: Adora = `#CC79A7`, Mechanus = `#A9714B`, Treasure = `#EDD9A0`.
- **Static JSON files** in `site/data/` are the contract between pipeline and frontend. All stats files are nested `data[period][map]` where period is `all|6m|3m|1m` and map is `all|Dunes|Snowmelt|Tropics`. Analytics pages default to the `3m` period (`currentPeriod` in `shared.js` + the `active` time button in each page's HTML).
- **Commander token portraits**: `generate_deck_pages.py` also writes 160px WebP tokens to `site/assets/commanders/token/` (re-encoded only when a portrait's bytes change; hashes in `sources.json`). Analytics and deck-builder tokens use them via `srcset`.
- **Logo**: masters live in `scripts/assets/logo/` (imported from the Unity project's `Assets/Resources/Images/Logo`). `python scripts/generate_pwa_icons.py [--from-unity <dir>]` regenerates the favicon (`site/favicon.ico` + `atlas-conquest-icon.png`), PWA icons, and the legacy wordmark (`atlas-conquest-logo.png`; the site nav/footer now use `site/assets/media/logo/wordmark-*.webp`). Then re-run `generate_conquest_diagrams.py` + `build_articles.py` and bump `CACHE_NAME` in `site/service-worker.js`.
- **Inline stat icons**: articles write `{power_3}`-style tokens exactly like in-game card text. `python scripts/import_text_icons.py` slices them from the Unity project's `CardTextIcons` sprite asset into `site/assets/icons/text/` (+ `icons.json`); re-run after the glyphs change in Unity.
- **Python 3.10+** for scripts. Use `boto3` for AWS access. Virtual env at `venv/`.
- **Dependencies**: `scripts/requirements.txt` is what CI installs — keep it to what the pipeline and tests need. Local-only tooling goes in `scripts/requirements-dev.txt`.
- **Tests**: `pytest scripts/tests/ -v` — cleaning, aggregation, and output validation tests.
- **`raw_games.json`** is a local cache (gitignored). Delete it to force a full re-fetch from DynamoDB.

## Game Mechanics (quick reference)

- **Commanders** have an **intellect** stat (6-10) that determines how many cards they see in their opening hand mulligan.
- **Mulligan**: players see `intellect` cards, keep exactly 3 (going first) or 4 (going second), return the rest to their deck.
- **Turn order**: first player (`first_player` field) — historical data has `"99"` for corrupt entries. Mulligan data can infer turn order from kept count.
- **6 factions**: Skaal, Grenalia, Lucia, Neutral, Shadis, Archaeon. Plus 3 **minor patrons** with a card or two each — Adora, Mechanus, Treasure. They are not Neutral; only Lazim can build Adora/Mechanus cards and Treasure belongs to no commander.
- **3 maps**: Dunes, Snowmelt, Tropics.
- **Tokens**: generated cards (Zombie, Lucian Soldier, …) from `StandardFormatTokens.csv`. They appear in match data but no deck can contain one — published in `cards.json`/`card_stats.json` with `token: true`, hidden by default on the Cards page, and excluded from the deck builder pool. On the Goals page they have no goal of their own but count toward the combined totals and get their own row in the art-source breakdown.
- **Post-match feedback**: players answer "did you have fun?" after a match (`fun` / `not_fun`). The game server re-saves the game row with a `feedback` blob *after* the game-end save, so the fetch re-pulls cached rows that carry feedback. Free-text comments are dropped in cleaning.
- **MentionedCards**: CSV column listing the cards a card or commander creates/references. Published as `site/data/mentions.json` and rendered beside the card everywhere it's shown as art.

## AWS Configuration

- **DynamoDB table**: `games` in `us-east-2`
- Credentials needed: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (set as env vars or in `~/.aws/credentials`)

## Quick Commands

```bash
# Fetch latest data from AWS (requires credentials)
source venv/bin/activate
python scripts/fetch_data.py

# Re-aggregate from cached data (no AWS needed)
python scripts/fetch_data.py --skip-fetch

# Rebuild the derived insights layer (site/data/insights/) from published JSON
python scripts/build_insights.py --report

# Serve site locally
python3 -m http.server 8000 --directory site

# Run tests
pytest scripts/tests/ -v

# Re-stamp the shared nav/footer/head chrome after editing site/partials/
python scripts/sync_chrome.py

# Regenerate site/sitemap.xml after adding or removing pages
python scripts/build_sitemap.py

# Verify a frontend change in a real browser (Playwright drives an already-
# installed Edge/Chrome via channel="msedge" — no browser download needed)
pip install -r scripts/requirements-dev.txt
```
