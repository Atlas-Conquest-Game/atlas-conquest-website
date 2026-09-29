# Articles

Source markdown for `/articles/` on the live site.

Each `articles/<slug>.md` becomes a static page at `site/articles/<slug>/index.html`. The build runs in CI (`.github/workflows/update-data.yml`) after the data pipeline; you can also build locally with:

```bash
python scripts/build_articles.py            # publish-ready build
python scripts/build_articles.py --include-drafts --verbose
```

## File layout

```
articles/
├── <slug>.md                 # one file per article
├── images/
│   └── <slug>/               # one folder per article for non-card images
│       ├── hero.jpg
│       └── ...
└── README.md                 # this file
```

The build copies referenced images to `site/assets/articles/<slug>/`.

## Frontmatter

YAML between `---` fences at the top of every article. Required fields are `title`, `author`, `date`, `summary`.

```yaml
---
title: "The Power of Acid Rain"
slug: power-of-acid-rain        # optional; defaults to filename
author: "Ross"
date: 2026-05-24                 # ISO date; a future date schedules the publish
summary: "Short teaser shown on the articles index."
hero_image: hero.jpg             # relative to articles/images/<slug>/
hero_align: top                  # top | center | bottom — crop anchor for the
                                 # hero banner when the image is taller than
                                 # the banner. Default: center.
tags: [strategy, skaal]
draft: false                     # builder skips drafts unless --include-drafts
---
```

## Shortcodes

All share the `[[type:value]]` shape. Standard Markdown (headings, lists, blockquotes, **bold**, *italic*, tables, code, links) works as expected.

| Syntax | What it does |
|---|---|
| `[[card:Acid Rain]]` | Inline card link. Hovering shows the card image. Name is matched case-insensitive; canonical name is emitted. Unknown name → build fails. |
| `[[card-img:Acid Rain]]` | Inline card image. |
| `[[deck:<DECKCODE>]]` | When the shortcode is the entire line, expands to a full deck embed (commander portrait, card list, link to Deck Tools). When inline in prose, renders as a compact pill link. Unknown card ids in the code fail the build. |
| `{power_3}` | Inline stat icon — the same tokens card text uses in game. Families: `mana`, `power`, `speed`, `health`, `durability`, `intellect`, `dominion`, each with `_0`–`_9` (and `mana_X`), or bare (`{health}`) for the numberless icon. Unknown icon → build fails. |
| `[[video:clip.mp4\|Description]]` | On its own line: a silent, looping, autoplaying clip from `articles/images/<slug>/`. The description is the clip's accessible label, so describe only what it shows. Any lines directly below it (same paragraph) become its caption, and can use Markdown, card links and icons. Readers who prefer reduced motion get a paused clip with controls. |
| `![alt](file.png)` | Standard Markdown image. Relative paths resolve to `articles/images/<slug>/file.png` and are copied to `site/assets/articles/<slug>/`. Absolute URLs and `/`-rooted paths pass through untouched. If a `.webp` with the same name sits next to a `.jpg`/`.png`, it's served first with the original as the fallback. Add `{: .wide }` after the image to break out of the text column and make it click-to-expand. Two images marked `{: .pair }` in the same paragraph sit side by side at that width (stacked on phones), also click-to-expand. |

## Tips

- The stat icons are sliced from the game's own `CardTextIcons` sprite sheet. After regenerating glyphs in Unity (IconGlyphGenerator), re-import them with `python scripts/import_text_icons.py [--from-unity <project dir>]` and rebuild articles.
- Card-name matching is case-insensitive but otherwise strict. Typos fail the build with a pointer to the article. Look at the live cards at `/cards.html` to confirm canonical names.
- Deck codes are validated at build time — if a referenced card id no longer exists in `site/data/cardlist.json`, the build fails. To get a working code, build a deck in the [Decks](/decks.html) page and copy the share URL.
- Drafts and future-dated articles are skipped by CI. Keep `draft: true` on works-in-progress.
- See `articles/test-feature-tour.md` for a working reference that exercises every shortcode.
