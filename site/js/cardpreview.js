/**
 * Atlas Conquest — shared card preview plumbing.
 *
 * Every page that shows card art on hover (Cards, Decks, Metagame, articles)
 * used to own its own popup code. The popup now has to show more than one card
 * — a card that creates a token renders side-by-side with that token — so the
 * rendering and positioning live here and each page just supplies the art URL
 * for a slug.
 *
 * Data: /data/mentions.json, written by the pipeline from the MentionedCards
 * column of the reference CSVs. Shape is `{ "<card slug>": [{name, slug}, …] }`
 * — only cards that mention something appear. Fetch failures degrade to "no
 * mentions" so an offline Decks session still previews single cards.
 *
 * Loaded standalone (no dependency on shared.js) because decks.html doesn't
 * include shared.js.
 */

let cardMentionsIndex = null;
let cardMentionsPromise = null;

/** Kick off the mentions fetch. Safe to call repeatedly — one request total. */
function loadCardMentions() {
  if (cardMentionsPromise) return cardMentionsPromise;
  cardMentionsPromise = fetch('/data/mentions.json')
    .then(r => (r.ok ? r.json() : {}))
    .catch(() => ({}))
    .then(index => {
      cardMentionsIndex = index;
      return index;
    });
  return cardMentionsPromise;
}

/** Same slug as cardArtSlug() in shared.js / decks.js. Idempotent on slugs. */
function cardPreviewSlug(nameOrSlug) {
  return (nameOrSlug || '').toLowerCase().replace(/[,.']/g, '').replace(/\s+/g, '-');
}

/**
 * Cards created or referenced by `nameOrSlug`, as [{name, slug}, …].
 * Empty until loadCardMentions() resolves — in practice that lands long before
 * the first hover, and a miss just means the popup shows one card.
 */
function cardMentionsFor(nameOrSlug) {
  if (!cardMentionsIndex) return [];
  return cardMentionsIndex[cardPreviewSlug(nameOrSlug)] || [];
}

/**
 * Fill `preview` with the card's art plus any mentioned cards beside it.
 *
 * `srcFor(slug)` returns the image URL — pages differ on which art directory
 * they use (framed JPG vs transparent PNG), so the caller decides.
 *
 * The primary image failing to load hides the whole popup (that's the existing
 * behavior for a card with no art); a mentioned image failing just drops that
 * one image. Re-rendering is skipped when the same card is re-hovered, so the
 * images don't flicker while the cursor moves within one row.
 */
function renderCardPreview(preview, nameOrSlug, srcFor) {
  const slug = cardPreviewSlug(nameOrSlug);
  if (!preview || !slug) return;
  if (preview.dataset.previewSlug === slug) return;
  // Only remember the card once the index is in — a hover during the initial
  // fetch would otherwise cache a mention-less render for that card forever.
  if (cardMentionsIndex) preview.dataset.previewSlug = slug;
  else delete preview.dataset.previewSlug;

  const mentions = cardMentionsFor(slug);
  preview.classList.toggle('has-mentions', mentions.length > 0);
  preview.innerHTML = '';

  const primary = document.createElement('img');
  primary.id = 'card-preview-img';
  primary.alt = '';
  primary.onerror = () => preview.classList.remove('visible');
  primary.src = srcFor(slug);
  preview.appendChild(primary);

  mentions.forEach(m => {
    const img = document.createElement('img');
    img.className = 'card-preview-mention';
    img.alt = m.name;
    img.onerror = () => img.remove();
    img.src = srcFor(m.slug);
    preview.appendChild(img);
  });
}

/**
 * Place the popup next to the cursor, flipping and clamping against the
 * viewport. Measures the element rather than assuming a width — with mentions
 * the popup is two or three cards wide.
 */
function positionCardPreview(preview, e) {
  const w = preview.offsetWidth || 250;
  const h = preview.offsetHeight || 350;
  const margin = 8;
  let x = e.clientX + 24;
  if (x + w > window.innerWidth - margin) x = e.clientX - w - 24;
  x = Math.max(margin, Math.min(x, window.innerWidth - w - margin));
  const y = Math.max(margin, Math.min(e.clientY - h / 2, window.innerHeight - h - margin));
  preview.style.left = `${x}px`;
  preview.style.top = `${y}px`;
}

/**
 * Static (non-hover) render of a card and the cards it mentions, side by side.
 * Used where a card is shown in place rather than in the cursor popup — the
 * Decks detail sheet today. Returns the number of mention images added.
 */
function renderMentionStrip(container, nameOrSlug, srcFor) {
  if (!container) return 0;
  const mentions = cardMentionsFor(nameOrSlug);
  container.innerHTML = mentions.map(m =>
    `<img class="mention-card-art" src="${srcFor(m.slug)}" alt="${m.name}" ` +
    `title="${m.name}" loading="lazy" onerror="this.remove()">`
  ).join('');
  container.hidden = mentions.length === 0;
  return mentions.length;
}

loadCardMentions();
