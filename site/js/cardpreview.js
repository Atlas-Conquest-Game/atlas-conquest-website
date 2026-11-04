/**
 * Atlas Conquest — shared card preview plumbing.
 *
 * Every page that shows card art on hover (Cards, Decks, Top Decks, articles)
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
 * Keyword reminders and tiles: the box the game shows beside a hovered card
 * (keywords and reminder-only abilities, never the card's own text) and the
 * tiles a card names. Read from the card host the Twitch extension uses
 * (cards.atlas-conquest.com/twitch), which the game's exporter writes in all
 * eleven languages, so the game, this site and the extension cannot disagree.
 * Fetch failures degrade to no box, like mentions.
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

const CARD_HOST = 'https://cards.atlas-conquest.com/twitch';
const CARD_HOST_FOLDERS = ['en', 'de', 'es-419', 'fr', 'it', 'ja', 'ko', 'pl', 'pt-br', 'ru', 'zh-cn'];

let cardInfoIndex = null;
let cardInfoPromise = null;

/** The card host's folder for this page's language (<html lang>), English if none. */
function cardHostFolder() {
  const lang = (document.documentElement.lang || 'en').toLowerCase();
  if (CARD_HOST_FOLDERS.includes(lang)) return lang;
  const base = lang.split('-')[0];
  return { es: 'es-419', pt: 'pt-br', zh: 'zh-cn' }[base] || (CARD_HOST_FOLDERS.includes(base) ? base : 'en');
}

/**
 * Kick off the reminder/tile fetch. One set of requests total; resolves to
 * { "<card slug>": { reminder, tiles: [{name, text, art}] } }.
 */
function loadCardInfo() {
  if (cardInfoPromise) return cardInfoPromise;
  const json = url => fetch(url).then(r => (r.ok ? r.json() : null)).catch(() => null);
  const folder = cardHostFolder();
  cardInfoPromise = Promise.all([
    json(`${CARD_HOST}/cards.json`),
    json(`${CARD_HOST}/i18n/en.json`),
    folder === 'en' ? Promise.resolve(null) : json(`${CARD_HOST}/i18n/${folder}.json`),
  ]).then(([cards, english, local]) => {
    const index = {};
    if (cards && Array.isArray(cards.cards)) {
      for (const card of cards.cards) {
        const reminder = (local && local.reminders && local.reminders[card.id])
          || (english && english.reminders && english.reminders[card.id]) || card.reminder || '';
        const tiles = (card.tiles || []).map(key => {
          const t = (local && local.tiles && local.tiles[key]) || (english && english.tiles && english.tiles[key]);
          if (!t) return null;
          const art = cards.tileArt && cards.tileArt[key];
          return { name: t.name, text: t.text, art: art ? `${CARD_HOST}/${art}` : '' };
        }).filter(Boolean);
        if (reminder || tiles.length) index[cardPreviewSlug(card.name)] = { reminder, tiles };
      }
    }
    cardInfoIndex = index;
    return index;
  });
  return cardInfoPromise;
}

/** Inline emphasis kept from the game's TextMeshPro markup; everything else is dropped. */
const CARD_TEXT_TAGS = new Set(['b', 'i', 'u', 's']);
const CARD_TEXT_ICONS = new Set(['mana', 'power', 'speed', 'health', 'durability', 'intellect', 'dominion']);

function escapeCardText(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Game card text as safe HTML, the same rules as the Twitch extension's
 * cardTextToHtml: plain text escaped, only whitelisted tags re-emitted, and the
 * game's stat icons (<sprite name="mana_3">) drawn as coloured pips.
 */
function cardTextHtml(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('<', i);
    if (open === -1) { out += escapeCardText(text.slice(i)); break; }
    out += escapeCardText(text.slice(i, open));
    const close = text.indexOf('>', open);
    if (close === -1) { out += escapeCardText(text.slice(open)); break; }
    const inner = text.slice(open + 1, close);
    const closing = inner.startsWith('/');
    const name = (closing ? inner.slice(1) : inner).split(/[\s=]/)[0].toLowerCase();
    if (CARD_TEXT_TAGS.has(name)) {
      out += closing ? `</${name}>` : `<${name}>`;
    } else if (name === 'sprite' && !closing) {
      const m = /name\s*=\s*"?([a-z]+)(?:_(\d+|X))?"?/i.exec(inner);
      if (m && CARD_TEXT_ICONS.has(m[1].toLowerCase())) {
        out += `<span class="card-icon" data-icon="${m[1].toLowerCase()}">${m[2] || ''}</span>`;
      }
    }
    i = close + 1;
  }
  return out.replace(/\n/g, '<br>');
}

/** The reminder box as HTML: one paragraph per keyword, as the game lays it out. */
function cardReminderHtml(reminder) {
  return reminder.split(/\n{2,}/).filter(part => part.trim())
    .map(part => `<p>${cardTextHtml(part.trim())}</p>`).join('');
}

/** Keyword reminders and named tiles for a card, or null. */
function cardInfoFor(nameOrSlug) {
  return cardInfoIndex ? cardInfoIndex[cardPreviewSlug(nameOrSlug)] || null : null;
}

/** The reminder box and tile entries, as one column beside the card images. */
function renderCardExtras(info) {
  const box = document.createElement('div');
  box.className = 'card-preview-extras';
  let html = '';
  if (info.reminder) html += `<div class="card-preview-reminder">${cardReminderHtml(info.reminder)}</div>`;
  for (const tile of info.tiles) {
    html += '<div class="card-preview-tile">' +
      (tile.art ? `<img class="card-preview-tile-art" src="${tile.art}" alt="">` : '') +
      `<div><div class="card-preview-tile-name">${escapeCardText(tile.name)}</div>` +
      `<div>${cardTextHtml(tile.text)}</div></div></div>`;
  }
  box.innerHTML = html;
  return box;
}

/**
 * Styles for the extras, injected once so every page that previews cards gets
 * the same box whichever page stylesheet it loads.
 */
function injectCardExtrasStyle() {
  if (document.getElementById('card-preview-extras-style')) return;
  const style = document.createElement('style');
  style.id = 'card-preview-extras-style';
  style.textContent = `
    .card-preview-extras { width: 230px; display: flex; flex-direction: column; gap: 6px; flex: none; }
    .card-preview-reminder, .card-preview-tile {
      padding: 8px 10px; border-radius: 8px; background: rgba(20, 16, 12, 0.95);
      border: 1px solid rgba(214, 178, 110, 0.55); color: #f2efe9;
      font: 12px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif; text-align: left;
    }
    .card-preview-reminder p { margin: 0; }
    .card-preview-reminder p + p { margin-top: 0.55em; }
    .card-preview-reminder b, .card-preview-tile b, .card-preview-tile-name { color: #f2c86b; }
    .card-preview-tile { display: flex; gap: 8px; align-items: flex-start; }
    .card-preview .card-preview-tile-art { width: 56px !important; flex: none; }
    .card-preview-tile-name { font-weight: 700; margin-bottom: 2px; }
    .card-icon { display: inline-grid; place-items: center; min-width: 1.35em; height: 1.35em; padding: 0 0.15em;
      margin: 0 0.1em; border-radius: 999px; font-size: 0.85em; font-weight: 800; line-height: 1;
      vertical-align: -0.2em; color: #fff; box-sizing: border-box; }
    .card-icon:empty::before { content: "\\25CF"; font-size: 0.7em; }
    .card-icon[data-icon="mana"] { background: #1f7a45; }
    .card-icon[data-icon="power"] { background: #3b78c4; }
    .card-icon[data-icon="speed"] { background: #5aa63a; }
    .card-icon[data-icon="health"] { background: #c23a4e; }
    .card-icon[data-icon="durability"] { background: #5b5f66; }
    .card-icon[data-icon="intellect"] { background: #2b4f86; }
    .card-icon[data-icon="dominion"] { background: #6a3fc9; }
    .card-preview.card-preview--tap .card-preview-extras { width: min(320px, 90vw); }
  `;
  document.head.appendChild(style);
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
  // Only remember the card once both indexes are in — a hover during the initial
  // fetches would otherwise cache a mention- or reminder-less render forever.
  if (cardMentionsIndex && cardInfoIndex) preview.dataset.previewSlug = slug;
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

  const info = cardInfoFor(slug);
  preview.classList.toggle('has-extras', !!info);
  if (info) preview.appendChild(renderCardExtras(info));
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
loadCardInfo();
injectCardExtrasStyle();
