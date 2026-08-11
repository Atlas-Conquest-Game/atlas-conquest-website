# UI element art

Game-derived interface chrome — gems, frames, banners, and similar bits lifted
from the Atlas Conquest client so the site's own UI can match it. This is for
*interface* art only; card and commander art live in `../cards/`, `../art/`,
`../card-art-png/`, and `../commanders/`.

## Conventions

- **`.webp` is what the site loads. `.png` is the archival master** at the same
  resolution — keep both, and regenerate the WebP from the PNG rather than
  re-exporting from the original source each time. Everything that can render
  the CSS on these pages (`mask-image`, `backdrop-filter`, `conic-gradient`)
  can render WebP, so there is no fallback to maintain.
- **256×256, square canvas, art inscribed exactly in the square.** That lets
  CSS size an element and use `background-size: contain` with no per-use
  nudging, at any size, on any DPR.
- **No baked drop shadows or outer glows.** They fight the shadows the page
  already draws, and they smear the sprite's corners when it sits over card
  art. Add shadow in CSS (`filter: drop-shadow(...)`) where it can also
  respond to hover.

## Assets

### `cost-gem` — the mana cost gem

Used by `.mana-gem` in `../../css/decks.css`: the compact decklist rows and
the cost badge in the card detail sheet. Set `--gem-size` on the element to
scale it; the numeral scales with it.

Deliberately *not* used on the card tiles in the grid view or the Add Cards
browser. Those show the whole card, whose own gem is already visible about
40px away, and a second one at the same size reads as a duplicated element —
they keep a plain dark UI chip instead.

The numeral is **not** part of the sprite — it is live text drawn on top, so
one file covers every cost (including the 15-drops like Atlas, First to Walk)
and stays selectable and reachable by screen readers.

Derived from `CostGem.psb`. The export was a 721×600 PNG with the gem body at
(138, 68)–(578, 506) and a warm outer glow baked in; processing was:

1. Crop a 440×440 square centred on the gem body, so its circle is inscribed.
2. Multiply alpha by a 4×-supersampled circle to clip the baked glow, which
   would otherwise smudge the corners over card art.
3. Resize to 256×256 (Lanczos), save PNG; encode WebP at `quality=90,
   alpha_quality=100, method=6`.

The gem's jade well is 77% of its outer diameter — that ratio is what the
`.mana-gem-value` font sizes in `decks.css` are tuned against. If a future
gem variant changes the bezel thickness, re-check those.
