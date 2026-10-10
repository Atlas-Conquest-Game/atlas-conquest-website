/**
 * Atlas Conquest — Deck Tools Page v1.7
 *
 * Import (decode) and build (encode) deck codes. PWA-installable, mobile
 * touch-friendly deck browsing/building. See docs/future-plans/DECKS_VISION.md.
 */

let cardlistData = null;
let cardsData = null;
let cardInfoMap = {};
let commanderList = [];
let commanderMap = {};
let currentDeck = null;
// Which mode *originated* currentDeck — 'import' | 'build' | null. Import and
// Build intentionally share one currentDeck (so an imported deck can be
// carried into Build for further editing), but a deck started fresh in
// Build shouldn't leak backward and render on the Import tab. See the
// currentMode === 'import' branch in initTabs().
let deckSource = null;
let currentMode = 'import';
let buildSortMode = 'cost';
// Decklist presentation — 'grid' (art tiles) or 'compact' (in-game style
// one-line rows). Persisted so the choice survives reloads; read lazily in
// initViewSwitch() because private-mode Safari throws on localStorage access.
let deckView = 'grid';
const DECK_VIEW_KEY = 'ac-deck-view';
const activeCostChips = new Set(); // cost bucket strings, e.g. '0'..'6', '7' (= "7+")

// True on devices with a real mouse (hover + precise pointer). Gates which
// interaction pattern is used for "see the full card before acting":
// desktop reuses the existing hover preview (see initCardPreview()) and
// clicks act immediately; touch devices have no hover, so they get a
// tap-to-open detail sheet with an explicit confirm step instead.
const supportsHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

const FACTION_COLORS = {
  skaal: '#D55E00', grenalia: '#009E73', lucia: '#E8B630',
  neutral: '#A89078', shadis: '#7B7B8E', archaeon: '#0072B2',
  adora: '#CC79A7', mechanus: '#A9714B', treasure: '#EDD9A0',
};

// Display order for faction groupings (commander picker, quick start).
const FACTION_ORDER = ['skaal', 'grenalia', 'lucia', 'shadis', 'archaeon', 'neutral', 'adora', 'mechanus', 'treasure'];

// Minions use the brand gold (not Lucia's faction colour — that one carries
// data meaning elsewhere); spells a periwinkle that stays distinct from it
// under every common colour-vision deficiency.
const MINION_COLOR = 'var(--gold)';
const SPELL_COLOR  = '#8ea2ff';

// Deck size rule from docs/GAME_RULES.md. Informational only: the meter in
// the sidebar shows where a deck sits against it; nothing is blocked.
const DECK_MIN_CARDS = 40;
const DECK_MAX_CARDS = 60;
const MAX_COPIES = 3;

// Card art. The transparent 400×560 WebP renders (rounded corners, ribbon
// overhang intact) read as real cards on navy and weigh ~40% of the framed
// JPGs, so every card image on this page uses them. The JPG stays as the
// fallback (older offline caches hold it) via cardArtFallback().
function cardArtSrc(slug) { return `/assets/media/cards/${slug}.webp`; }
function cardArtJpg(slug) { return `/assets/cards/${slug}.jpg`; }

// onerror handler for card <img>s: try the JPG once, then hide the image.
function cardArtFallback(img) {
  const fb = img.dataset.fallback;
  if (fb && !img.src.endsWith(fb)) { img.src = fb; return; }
  img.onerror = null;
  img.style.visibility = 'hidden';
}

function titleCase(s) {
  return String(s || '').replace(/\b\w/g, ch => ch.toUpperCase());
}

// Polite screen-reader announcement (#deck-live).
function announce(msg) {
  const el = document.getElementById('deck-live');
  if (!el) return;
  el.textContent = '';
  // New text node on the next frame so repeated messages are re-announced.
  requestAnimationFrame(() => { el.textContent = msg; });
}

// Lazim has a unique rule: cards from any god, but no neutral cards. Mirrors
// his Patrons list in the game (Assets/Resources/Commanders/lazim-thief-of-gods
// .asset) — every patron except Neutral and Treasure, which is a token-only
// category belonging to no commander.
const LAZIM_NAME = 'Lazim, Thief of Gods';
const LAZIM_FACTIONS = new Set([
  'skaal', 'grenalia', 'lucia', 'archaeon', 'mechanus', 'shadis', 'adora',
]);

// ─── Data Loading ──────────────────────────────────────────

async function loadCardlist() {
  // Root-absolute paths: decks.js now runs from both /decks.html and from the
  // per-commander unfurl pages at /decks/<slug>/index.html. A relative 'data/...'
  // would resolve against the current directory and 404 on the nested pages.
  const resp = await fetch('/data/cardlist.json');
  cardlistData = await resp.json();
  initDeckCodec(cardlistData);

  const knownCommanders = new Set();
  const resp2 = await fetch('/data/commanders.json');
  const commanders = await resp2.json();
  commanders.forEach(c => {
    knownCommanders.add(c.name);
    commanderMap[c.name] = c;
  });
  commanderList = [...knownCommanders].sort();

  const resp3 = await fetch('/data/cards.json');
  const cards = await resp3.json();
  cards.forEach(c => {
    cardInfoMap[c.name] = {
      cost: c.cost != null ? c.cost : '?',
      type: c.type || '',
      faction: c.faction || 'neutral',
      token: !!c.token,
    };
  });
  cardsData = cards;
}

// ─── Art & Faction Helpers ─────────────────────────────────

function commanderArtPath(name) {
  const slug = name.toLowerCase().replace(/[,.']/g, '').replace(/\s+/g, '-');
  return `/assets/commanders/${slug}.jpg`;
}

function cardArtSlug(name) {
  return name.toLowerCase().replace(/[,.']/g, '').replace(/\s+/g, '-');
}

// The game's cost gem (art in /assets/ui/) with the numeral as live text.
// Callers size it by setting --gem-size in CSS; see .mana-gem in decks.css.
// Two-digit costs — Atlas, First to Walk is a 15 — step the numeral down so
// it stays inside the gem's jade well.
// Pass ariaLabel where the gem is the only thing stating the cost; leave it
// null (the default) where the container already announces it, as the compact
// rows do, so it isn't read twice.
function manaGemHtml(cost, cls = '', ariaLabel = null) {
  const wide = String(cost).length > 1 ? ' wide' : '';
  const a11y = ariaLabel ? ` role="img" aria-label="${ariaLabel}"` : ' aria-hidden="true"';
  return `<span class="mana-gem${cls ? ' ' + cls : ''}"${a11y}><span class="mana-gem-value${wide}">${cost}</span></span>`;
}

function factionColor(faction) {
  return FACTION_COLORS[(faction || '').toLowerCase()] || FACTION_COLORS.neutral;
}

// Uses the shared .faction-badge.<faction> chip from components.css.
function factionBadge(faction) {
  const f = (faction || 'neutral').toLowerCase();
  const known = FACTION_COLORS[f] ? f : 'neutral';
  return `<span class="faction-badge ${known}">${titleCase(f)}</span>`;
}

// Round commander portrait token with a faction-coloured ring — the way
// commanders sit on the board in-game. `cls` adds a size/context modifier.
// Drawn diameter per token modifier (decks.css), for the srcset `sizes`.
const CMD_TOKEN_PX = { 'cmd-token--xs': 22, 'cmd-token--strip': 52, 'cmd-token--start': 64, 'cmd-token--summary': 76, 'cmd-token--picker': 84 };

function commanderTokenHtml(name, cls = '') {
  const data = commanderMap[name] || {};
  const fc = factionColor(data.faction);
  const px = CMD_TOKEN_PX[cls] || 56;
  // 160px WebP token portrait (scripts/generate_deck_pages.py) for small
  // tokens, the 400px JPG for big/high-DPR ones; if the WebP is missing the
  // onerror drops the srcset and the JPG loads instead.
  const small = commanderArtPath(name).replace('/assets/commanders/', '/assets/commanders/token/').replace(/\.jpg$/, '.webp');
  return `<span class="cmd-token${cls ? ' ' + cls : ''}" style="--fc:${fc}" aria-hidden="true">` +
    `<img class="cmd-token-img" src="${commanderArtPath(name)}" srcset="${small} 160w, ${commanderArtPath(name)} 400w" sizes="${px}px" alt="" loading="lazy" decoding="async" width="400" height="400" ` +
    `onerror="if(this.srcset){this.removeAttribute('srcset')}else{this.style.visibility='hidden'}">` +
    `</span>`;
}

// One-line description of the card pool a commander can build from. Mirrors
// isCardCompatible() / getCardPool() — wording only.
function poolDescription(commanderName) {
  const cmdData = commanderMap[commanderName];
  if (!cmdData || !commanderName) return '';
  const faction = titleCase(cmdData.faction || 'Neutral');
  if (commanderName === LAZIM_NAME) return 'Cards from every god — no Neutral';
  if (faction.toLowerCase() === 'neutral') return 'Neutral cards only';
  return `${faction} + Neutral cards`;
}

// ─── Card Compatibility ────────────────────────────────────

function isCardCompatible(cardName, commanderName) {
  if (!commanderName) return true;
  const cmdData = commanderMap[commanderName];
  if (!cmdData) return true;
  const cmdFaction = (cmdData.faction || '').toLowerCase();
  const cardFaction = (cardInfoMap[cardName]?.faction || '').toLowerCase();

  if (commanderName === LAZIM_NAME) {
    // Lazim: "cards from any god, but not neutral cards"
    return LAZIM_FACTIONS.has(cardFaction);
  }
  if (cmdFaction === 'neutral') {
    // Other neutral commanders: neutral cards only
    return cardFaction === 'neutral';
  }
  // Faction commander: own faction + neutral. Minor patrons (Adora, Mechanus,
  // Treasure) are on no commander's patron list, so they fall out here.
  return cardFaction === 'neutral' || cardFaction === cmdFaction;
}

// ─── Mana Curve (stacked: spell on top, minion on bottom) ──

function renderManaCurve(deck) {
  const minionBuckets = new Array(8).fill(0);
  const spellBuckets  = new Array(8).fill(0);
  deck.cards.forEach(c => {
    const cost = parseInt((cardInfoMap[c.name] || {}).cost) || 0;
    const idx = Math.min(cost, 7);
    const t = ((cardInfoMap[c.name] || {}).type || '').toLowerCase();
    if (t === 'spell') spellBuckets[idx] += c.count;
    else               minionBuckets[idx] += c.count;
  });
  const totals = minionBuckets.map((m, i) => m + spellBuckets[i]);
  const max = Math.max(...totals, 1);
  const labels = ['0', '1', '2', '3', '4', '5', '6', '7+'];
  const PLOT_H = 84; // px — matches the plot area in .mana-curve (decks.css)

  // Average cost (same rule as the quick stat: cards with a numeric cost).
  let costSum = 0, costN = 0;
  deck.cards.forEach(c => {
    const v = parseInt((cardInfoMap[c.name] || {}).cost);
    if (!isNaN(v)) { costSum += v * c.count; costN += c.count; }
  });
  const avg = costN > 0 ? costSum / costN : null;

  const cols = labels.map((l, i) => {
    const totalH = totals[i] > 0 ? Math.max(4, Math.round((totals[i] / max) * PLOT_H)) : 0;
    const spellH  = totals[i] > 0 ? Math.round((spellBuckets[i] / totals[i]) * totalH) : 0;
    const minionH = totalH - spellH;
    return `<div class="mana-bar-col${totals[i] ? '' : ' empty'}">
      <div class="mana-bar-count">${totals[i] || ''}</div>
      <div class="mana-bar-stack" style="height:${totalH}px">
        <div class="mana-bar-seg spell"  style="height:${spellH}px"></div>
        <div class="mana-bar-seg minion" style="height:${minionH}px"></div>
      </div>
      ${manaGemHtml(l, 'mana-bar-gem')}
    </div>`;
  }).join('');

  // Average marker: a dashed rule at the deck's mean cost, placed on the same
  // 0…7+ axis as the columns (each column is 1/8 of the width; a cost of n
  // sits at the centre of column n).
  let marker = '';
  if (avg !== null && deck.cards.length) {
    const pos = ((Math.min(avg, 7) + 0.5) / labels.length) * 100;
    marker = `<div class="mana-curve-avg" style="left:${pos.toFixed(2)}%" aria-hidden="true"></div>`;
  }

  const el = document.getElementById('mana-curve');
  el.innerHTML = cols + marker;
  el.setAttribute('aria-label', 'Mana curve: ' + labels.map((l, i) =>
    `cost ${l}, ${totals[i]} card${totals[i] === 1 ? '' : 's'} (${minionBuckets[i]} minion${minionBuckets[i] === 1 ? '' : 's'}, ${spellBuckets[i]} spell${spellBuckets[i] === 1 ? '' : 's'})`
  ).join('; ') + (avg !== null ? `. Average cost ${avg.toFixed(1)}.` : '.'));
  const avgLegend = document.getElementById('mana-legend-avg');
  if (avgLegend) {
    avgLegend.hidden = !marker;
    const v = document.getElementById('mana-legend-avg-value');
    if (v && avg !== null) v.textContent = avg.toFixed(1);
  }
}

// ─── Type Breakdown ────────────────────────────────────────
// Two split bars: card type (minion / spell) and faction (the commander's
// patron vs neutral, plus anything incompatible that slipped in).

function splitBarHtml(title, parts) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const shown = parts.filter(p => p.value > 0);
  const pct = v => (total > 0 ? Math.round((v / total) * 100) : 0);
  return `<div class="deck-split">
    <div class="deck-split-title">${title}</div>
    <div class="deck-split-bar" aria-hidden="true">${
      shown.map(p => `<span style="flex:${p.value};background:${p.color}"></span>`).join('')
    }</div>
    <ul class="deck-split-legend">${
      shown.map(p => `<li><span class="deck-split-swatch" style="background:${p.color}"></span>` +
        `<span class="deck-split-name">${p.label}</span>` +
        `<span class="deck-split-value">${p.value}</span>` +
        `<span class="deck-split-pct">${pct(p.value)}%</span></li>`).join('')
    }</ul>
  </div>`;
}

function renderTypeBreakdown(deck) {
  let minions = 0, spells = 0;
  const byFaction = {};
  deck.cards.forEach(c => {
    const info = cardInfoMap[c.name] || {};
    const t = (info.type || '').toLowerCase();
    if (t === 'minion') minions += c.count;
    else if (t === 'spell') spells += c.count;
    const f = (info.faction || 'neutral').toLowerCase();
    byFaction[f] = (byFaction[f] || 0) + c.count;
  });
  const factions = Object.keys(byFaction)
    .sort((a, b) => byFaction[b] - byFaction[a] || FACTION_ORDER.indexOf(a) - FACTION_ORDER.indexOf(b))
    .map(f => ({ label: titleCase(f), value: byFaction[f], color: factionColor(f) }));

  if (!deck.cards.length) {
    document.getElementById('type-breakdown').innerHTML =
      '<p class="deck-split-empty">Add cards to see the type and faction split.</p>';
    return;
  }
  document.getElementById('type-breakdown').innerHTML =
    splitBarHtml('Card type', [
      { label: 'Minions', value: minions, color: MINION_COLOR },
      { label: 'Spells', value: spells, color: SPELL_COLOR },
    ]) +
    (factions.length ? splitBarHtml('Faction', factions) : '');
}

// ─── Deck Size Meter ───────────────────────────────────────
// Where the deck sits against the 40–60 card rule. The bar spans 0–60; the
// tick marks the 40-card minimum.

function renderDeckSize(total) {
  const el = document.getElementById('deck-size');
  if (!el) return;
  let state, text;
  if (total < DECK_MIN_CARDS) {
    state = 'short';
    const need = DECK_MIN_CARDS - total;
    text = `${need} more card${need === 1 ? '' : 's'} to reach the ${DECK_MIN_CARDS}-card minimum`;
  } else if (total <= DECK_MAX_CARDS) {
    state = 'ok';
    text = `Within the ${DECK_MIN_CARDS}–${DECK_MAX_CARDS} card limit`;
  } else {
    state = 'over';
    const over = total - DECK_MAX_CARDS;
    text = `${over} card${over === 1 ? '' : 's'} over the ${DECK_MAX_CARDS}-card maximum`;
  }
  const fill = Math.min(total / DECK_MAX_CARDS, 1) * 100;
  const tick = (DECK_MIN_CARDS / DECK_MAX_CARDS) * 100;
  el.dataset.state = state;
  el.innerHTML = `
    <div class="deck-size-bar" role="progressbar" aria-label="Deck size" aria-valuemin="0" aria-valuemax="${DECK_MAX_CARDS}" aria-valuenow="${Math.min(total, DECK_MAX_CARDS)}" aria-valuetext="${total} cards. ${text}">
      <span class="deck-size-fill" style="width:${fill.toFixed(1)}%"></span>
      <span class="deck-size-tick" style="left:${tick.toFixed(2)}%"></span>
    </div>
    <div class="deck-size-text"><span class="deck-size-dot" aria-hidden="true"></span>${text}</div>`;
}

// ─── Card Art Hover Preview ────────────────────────────────

function initCardPreview() {
  // Touch devices synthesize a `mouseover` (with no matching `mouseout`) on
  // tap, which would otherwise leave this hover popup stuck on screen behind
  // the tap-to-open detail sheets. Only wire it up on devices that actually
  // support hover with a precise pointer (i.e. a real mouse) — see
  // `supportsHover`.
  if (!supportsHover) return;

  const preview = document.getElementById('card-preview');

  // Returns the card/commander name the cursor is over, or null if nothing is
  // previewable. Both cards AND commanders live under /assets/cards/<slug>.jpg
  // (the framed card with name banner + text box). /assets/commanders/ holds
  // just the cropped art and is used for thumbnails / OG hero panels — not here.
  function previewNameFor(target) {
    const cmd = target.closest('.deck-commander-section[data-commander]');
    if (cmd) return cmd.dataset.commander || null;
    const cmdTile = target.closest('.commander-picker-tile, .deck-start-token');
    if (cmdTile) return cmdTile.dataset.name || null;
    const artWrap = target.closest('.card-tile-art-wrap');
    if (artWrap) return artWrap.closest('.card-tile')?.dataset.name || null;
    // Compact rows show only a sliver of art, so the whole row is the hover
    // target — the preview is how you see the actual card from this view.
    const compactRow = target.closest('.deck-compact-row');
    if (compactRow) return compactRow.dataset.name || null;
    return null;
  }

  // Contents and placement come from /js/cardpreview.js — a card that creates a
  // token previews side-by-side with it. Transparent WebP renders, so the
  // popup's drop-shadow follows the card's own silhouette.
  const srcFor = slug => cardArtSrc(slug);

  document.addEventListener('mouseover', e => {
    const name = previewNameFor(e.target);
    if (!name) { preview.classList.remove('visible'); return; }
    renderCardPreview(preview, name, srcFor);
    preview.classList.add('visible');
  });

  document.addEventListener('mousemove', e => {
    if (!preview.classList.contains('visible')) return;
    positionCardPreview(preview, e);
  });

  document.addEventListener('mouseout', e => {
    if (!previewNameFor(e.target)) {
      preview.classList.remove('visible');
    }
  });
}

// ─── Card Tiles ─────────────────────────────────────────────
// One tile renderer for both the Add Cards browser and the decklist grid.
// The card is the full transparent render; .card-tile-card is the element
// that tilts (pointer-tracked, see cardTilt) inside .card-tile-art-wrap, the
// untransformed hit area — so hover never shifts layout or the click target.
//   mode 'browse' — pool browser: +/- stepper, gold glow when in the deck
//   mode 'edit'   — build-mode decklist: +/- stepper
//   mode 'view'   — import-mode decklist: read-only ×N

let lastAddedName = null; // tile to pulse after the next render

function cardTileHtml(name, { count = 0, mode = 'browse', compatible = true } = {}) {
  const slug = cardArtSlug(name);
  const src = cardArtSrc(slug);
  const cls = ['card-tile'];
  if (mode === 'browse' && count > 0) cls.push('in-deck');
  if (!compatible) cls.push('incompatible');
  if (count >= MAX_COPIES) cls.push('at-max');
  if (name === lastAddedName) cls.push('just-added');

  const pips = Array.from({ length: MAX_COPIES }, (_, i) => `<i${i < count ? ' class="on"' : ''}></i>`).join('');
  const controls = mode === 'view'
    ? `<span class="card-tile-count active"><span class="card-tile-pips" aria-hidden="true">${pips}</span><span class="card-tile-count-num">&times;${count}</span></span>`
    : `<button type="button" class="card-tile-btn minus" data-name="${name}" aria-label="Remove one ${name}"${count === 0 ? ' disabled' : ''}>−</button>
       <span class="card-tile-count${count > 0 ? ' active' : ''}"><span class="card-tile-pips" aria-hidden="true">${pips}</span><span class="ac-sr">${count} in deck</span></span>
       <button type="button" class="card-tile-btn plus" data-name="${name}" aria-label="Add one ${name}"${count >= MAX_COPIES ? ' disabled' : ''}>+</button>`;

  return `<div class="${cls.join(' ')}" data-name="${name}">
    <div class="card-tile-art-wrap">
      <div class="card-tile-card" style="--card-mask:url('${src}')">
        <img class="card-tile-art" src="${src}" data-fallback="${cardArtJpg(slug)}" alt="" width="400" height="560" loading="lazy" decoding="async" onerror="cardArtFallback(this)">
      </div>
    </div>
    <div class="card-tile-name">${name}</div>
    <div class="card-tile-controls">${controls}</div>
  </div>`;
}

// ─── Card Tilt + Foil ───────────────────────────────────────
// Desktop only (real mouse), off under prefers-reduced-motion. Writes
// --rx/--ry (rotation) and --mx/--my (sheen position) onto the hovered
// .card-tile-art-wrap; CSS does the rest. One rAF per frame, transforms only.

const cardTilt = (() => {
  const MAX_DEG = 8;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  let current = null, frame = 0, px = -1, py = -1, enabled = false;

  function apply() {
    frame = 0;
    if (!current || !current.isConnected) return;
    const r = current.getBoundingClientRect();
    const x = Math.min(Math.max((px - r.left) / r.width, 0), 1);
    const y = Math.min(Math.max((py - r.top) / r.height, 0), 1);
    current.style.setProperty('--rx', `${((0.5 - y) * MAX_DEG * 2).toFixed(2)}deg`);
    current.style.setProperty('--ry', `${((x - 0.5) * MAX_DEG * 2).toFixed(2)}deg`);
    current.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
    current.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
  }

  function release(el) {
    if (!el) return;
    el.classList.remove('is-tilting');
    ['--rx', '--ry', '--mx', '--my'].forEach(p => el.style.removeProperty(p));
  }

  function setCurrent(wrap) {
    if (wrap === current) return;
    release(current);
    current = wrap;
    if (current) current.classList.add('is-tilting');
  }

  function onMove(e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    if (reduce.matches) { setCurrent(null); return; }
    px = e.clientX; py = e.clientY;
    setCurrent(e.target.closest ? e.target.closest('.card-tile-art-wrap') : null);
    if (current && !frame) frame = requestAnimationFrame(apply);
  }

  return {
    init() {
      if (!supportsHover || enabled) return;
      enabled = true;
      document.addEventListener('pointermove', onMove, { passive: true });
      document.addEventListener('pointerout', e => { if (!e.relatedTarget) setCurrent(null); });
      window.addEventListener('blur', () => setCurrent(null));
    },
    // After a re-render (clicking + rebuilds the grid) the tile under the
    // cursor is a new element — pick it up at once, without easing in from
    // flat, so the card doesn't visibly snap back on every click.
    refresh() {
      if (!enabled || reduce.matches || px < 0 || (current && current.isConnected)) return;
      current = null;
      const hit = document.elementFromPoint(px, py);
      const wrap = hit && hit.closest('.card-tile-art-wrap');
      if (!wrap) return;
      wrap.classList.add('no-ease');
      setCurrent(wrap);
      apply();
      requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.remove('no-ease')));
    },
  };
})();

// ─── Card Pool (Build Mode) ────────────────────────────────

function getCardPool() {
  if (!cardlistData) return [];
  const commanderSet = new Set(commanderList);
  const selectedCommander = document.getElementById('build-commander')?.value || '';
  const cmdData = commanderMap[selectedCommander];
  const cmdFaction = cmdData ? (cmdData.faction || '').toLowerCase() : null;
  // cardlist.json can list a name twice when the game re-issued a card under a
  // new id (Feral Vampire: 202 and 206). Keep one tile per name — the last
  // entry, which is the id deckcode.js encodes with (its name → id map keeps
  // the later one).
  const latest = new Map();
  cardlistData.cards.forEach(c => latest.set(c.name, c));

  return cardlistData.cards.filter(c => {
    if (latest.get(c.name) !== c) return false;
    if (commanderSet.has(c.name)) return false;
    // Only show cards tracked in cards.json — filters placeholders, retired
    // names, etc. Tokens are tracked there too (they need type/faction for the
    // Cards page), but they're generated in play and can't be built.
    if (!cardInfoMap[c.name] || cardInfoMap[c.name].token) return false;
    if (!selectedCommander) return true; // no commander: show all playable cards

    const cf = (cardInfoMap[c.name]?.faction || '').toLowerCase();
    if (selectedCommander === LAZIM_NAME) return LAZIM_FACTIONS.has(cf);
    if (cmdFaction === 'neutral') return cf === 'neutral';
    if (cmdFaction) return cf === 'neutral' || cf === cmdFaction;
    return true;
  });
}

function renderCardBrowser(q = '') {
  const grid = document.getElementById('card-browser-grid');
  if (!grid) return;

  let pool = getCardPool();
  if (q) pool = pool.filter(c => c.name.toLowerCase().includes(q));
  if (activeCostChips.size > 0) {
    pool = pool.filter(c => {
      const cost = parseInt((cardInfoMap[c.name] || {}).cost) || 0;
      return activeCostChips.has(String(Math.min(cost, 7)));
    });
  }

  pool.sort((a, b) => {
    if (buildSortMode === 'name') return a.name.localeCompare(b.name);
    const ca = parseInt((cardInfoMap[a.name] || {}).cost) || 0;
    const cb = parseInt((cardInfoMap[b.name] || {}).cost) || 0;
    if (ca !== cb) return ca - cb;
    return a.name.localeCompare(b.name);
  });

  grid.innerHTML = pool.length
    ? pool.map(c => {
        const count = currentDeck ? (currentDeck.cards.find(x => x.name === c.name)?.count || 0) : 0;
        return cardTileHtml(c.name, { count, mode: 'browse' });
      }).join('')
    : `<p class="card-browser-empty">No cards match these filters.</p>`;

  const countEl = document.getElementById('card-browser-result-count');
  if (countEl) countEl.textContent = `${pool.length} card${pool.length === 1 ? '' : 's'}`;
  cardTilt.refresh();

  // Event delegation — one handler on the grid
  grid.onclick = e => {
    const plusBtn  = e.target.closest('.card-tile-btn.plus');
    const minusBtn = e.target.closest('.card-tile-btn.minus');
    const artWrap  = e.target.closest('.card-tile-art-wrap');
    const tile     = e.target.closest('.card-tile');
    if (plusBtn && !plusBtn.disabled) {
      addCardToBuild(plusBtn.dataset.name);
    } else if (minusBtn && !minusBtn.disabled) {
      removeOneFromBuild(minusBtn.dataset.name);
    } else if (artWrap && tile && !supportsHover) {
      // Tapping the art opens the large detail sheet — the primary path for
      // seeing the full card on touch, which has no hover to preview with.
      // On desktop this falls through to the quick-add branch below instead
      // — hovering already shows the full card via initCardPreview().
      openCardDetailSheet(tile.dataset.name);
    } else if (tile) {
      // Click elsewhere on the tile body (or anywhere on it, on desktop):
      // quick-add if not at max
      const name = tile.dataset.name;
      const count = currentDeck ? (currentDeck.cards.find(x => x.name === name)?.count || 0) : 0;
      if (count < 3) addCardToBuild(name);
    }
  };
}

// ─── Card Detail Sheet (mobile-friendly add/remove) ────────

// Large card art in the detail sheets: WebP first, the JPG if that fails.
// Hidden until loaded so the previous card never flashes in its place.
function setSheetArt(img, name) {
  const slug = cardArtSlug(name);
  img.style.visibility = 'hidden';
  img.dataset.fallback = cardArtJpg(slug);
  img.onload = () => { img.style.visibility = ''; };
  img.onerror = () => {
    if (!img.src.endsWith(img.dataset.fallback)) { img.src = img.dataset.fallback; return; }
    img.style.visibility = '';
  };
  img.src = cardArtSrc(slug);
  img.alt = name;
}

function openCardDetailSheet(name) {
  // Defensive: on hybrid devices (touchscreen + mouse) a tap can still leave
  // the hover popup visible; the detail sheet is about to cover it anyway,
  // but clear it so it can't get stuck once the sheet closes.
  document.getElementById('card-preview')?.classList.remove('visible');

  const info = cardInfoMap[name] || {};
  const cost = info.cost != null ? info.cost : '?';
  const typeLabel = (info.type || '').toUpperCase();
  const count = currentDeck ? (currentDeck.cards.find(c => c.name === name)?.count || 0) : 0;

  // Usually already cached (same URL as the grid tile you tapped), but
  // guard against the same stale-image flash as the commander sheet in case
  // this card's art hasn't loaded yet (e.g. still lazy-loading).
  const art = document.getElementById('card-detail-art');
  setSheetArt(art, name);
  // Touch has no hover preview, so the cards this one creates are shown beside
  // its art here instead.
  renderMentionStrip(
    document.getElementById('card-detail-mentions'),
    name,
    s => cardArtSrc(s),
  );
  document.getElementById('card-detail-name').textContent = name;
  document.getElementById('card-detail-badges').innerHTML = `
    ${manaGemHtml(cost, 'card-detail-badge-cost', `Cost ${cost}`)}
    ${typeLabel ? `<span class="card-detail-badge-type">${typeLabel}</span>` : ''}
    ${factionBadge(info.faction)}`;
  document.getElementById('card-detail-count').textContent = count;

  const sheet = document.getElementById('card-detail-sheet');
  const backdrop = document.getElementById('card-detail-backdrop');
  // Import mode is a viewer, not an editor: the sheet is reachable from the
  // decklist there too (it's the only way to see a full card on touch), but
  // its +/- must not run — addCardToBuild() would call ensureBuildDeck(),
  // which discards the imported deck for a fresh empty build one.
  sheet.querySelector('.card-detail-stepper')
    .classList.toggle('hidden', currentMode !== 'build');
  sheet.dataset.card = name;
  sheet.classList.remove('hidden');
  backdrop.classList.remove('hidden');
  requestAnimationFrame(() => sheet.classList.add('open'));
  document.getElementById('card-detail-close').focus();
}

function closeCardDetailSheet() {
  const sheet = document.getElementById('card-detail-sheet');
  if (sheet.classList.contains('hidden')) return;
  sheet.classList.remove('open');
  setTimeout(() => {
    sheet.classList.add('hidden');
    document.getElementById('card-detail-backdrop').classList.add('hidden');
  }, 200);
}

function initCardDetailSheet() {
  document.getElementById('card-detail-close').addEventListener('click', closeCardDetailSheet);
  document.getElementById('card-detail-backdrop').addEventListener('click', closeCardDetailSheet);

  document.getElementById('card-detail-plus').addEventListener('click', () => {
    const name = document.getElementById('card-detail-sheet').dataset.card;
    if (!name || currentMode !== 'build') return;
    const count = currentDeck ? (currentDeck.cards.find(c => c.name === name)?.count || 0) : 0;
    if (count >= 3) return;
    addCardToBuild(name);
    document.getElementById('card-detail-count').textContent = count + 1;
  });

  document.getElementById('card-detail-minus').addEventListener('click', () => {
    const name = document.getElementById('card-detail-sheet').dataset.card;
    if (!name || currentMode !== 'build') return;
    removeOneFromBuild(name);
    const count = currentDeck ? (currentDeck.cards.find(c => c.name === name)?.count || 0) : 0;
    document.getElementById('card-detail-count').textContent = count;
  });
}

// ─── Mobile Deck Drawer ─────────────────────────────────────
// Below 900px the `.deck-sidebar` (built for the desktop two-column layout)
// becomes a slide-up drawer, opened via the fixed pill button and closed via
// its own close button, the backdrop, or tapping outside — see .deck-drawer-*
// and .deck-sidebar.drawer-open rules in decks.css. No gesture tracking.

function openDeckDrawer() {
  document.getElementById('deck-sidebar').classList.add('drawer-open');
  document.getElementById('deck-drawer-backdrop').classList.add('visible');
  document.getElementById('deck-drawer-pill').setAttribute('aria-expanded', 'true');
  document.getElementById('deck-drawer-close').focus();
}

function closeDeckDrawer() {
  if (!document.getElementById('deck-sidebar').classList.contains('drawer-open')) return;
  document.getElementById('deck-sidebar').classList.remove('drawer-open');
  document.getElementById('deck-drawer-backdrop').classList.remove('visible');
  document.getElementById('deck-drawer-pill').setAttribute('aria-expanded', 'false');
  document.getElementById('deck-drawer-pill').focus();
}

function initDeckDrawer() {
  document.getElementById('deck-drawer-pill').addEventListener('click', openDeckDrawer);
  document.getElementById('deck-drawer-close').addEventListener('click', closeDeckDrawer);
  document.getElementById('deck-drawer-backdrop').addEventListener('click', closeDeckDrawer);
}

// ─── Cost Filter Chips ──────────────────────────────────────

function initCostChips() {
  document.querySelectorAll('.cost-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const cost = chip.dataset.cost;
      if (activeCostChips.has(cost)) {
        activeCostChips.delete(cost);
        chip.classList.remove('active');
      } else {
        activeCostChips.add(cost);
        chip.classList.add('active');
      }
      chip.setAttribute('aria-pressed', String(activeCostChips.has(cost)));
      const searchInput = document.getElementById('build-card-input');
      renderCardBrowser(searchInput?.value.trim().toLowerCase() || '');
    });
  });
}

// ─── Compact Decklist View ─────────────────────────────────
// One row per card, mirroring the in-game decklist: cost gem on the left,
// name, copy count on the right, over a right-to-left fade of the card's own
// artwork, applied as a `--art` custom property so the whole row is one
// background layer. The cost gem comes from manaGemHtml().

function compactRowHtml(c, deck, isBuild) {
  const info = cardInfoMap[c.name] || {};
  const cost = info.cost != null ? info.cost : '?';
  const slug = cardArtSlug(c.name);
  const compatible = isCardCompatible(c.name, deck.commander);
  const fc = factionColor(info.faction);

  // The row's own aria-label carries name/cost/count, so the gem, name and
  // count are hidden from the a11y tree to avoid reading each twice. The
  // stepper buttons stay exposed — they carry their own labels.
  const right = isBuild
    ? `<span class="deck-compact-stepper">
         <button type="button" class="deck-compact-btn minus" data-name="${c.name}" aria-label="Remove one ${c.name}">−</button>
         <span class="deck-compact-stepper-count" aria-hidden="true">${c.count}</span>
         <button type="button" class="deck-compact-btn plus" data-name="${c.name}" aria-label="Add one ${c.name}"${c.count >= 3 ? ' disabled' : ''}>+</button>
       </span>`
    : `<span class="deck-compact-count" aria-hidden="true"><span class="deck-compact-count-x">×</span>${c.count}</span>`;

  const label = `${c.name}, cost ${cost}, ${c.count} ${c.count === 1 ? 'copy' : 'copies'}` +
    (compatible ? '' : ' — incompatible with this commander');

  return `<li class="deck-compact-row${compatible ? '' : ' incompatible'}" data-name="${c.name}"
      aria-label="${label}"
      style="--art:url('${cardArtSrc(slug)}');--fc:${fc}">
      ${manaGemHtml(cost)}
      <span class="deck-compact-name" aria-hidden="true">${c.name}</span>
      ${right}
    </li>`;
}

function renderCompactList(sorted, deck, isBuild) {
  return `<ol class="deck-compact-list">${
    sorted.map(c => compactRowHtml(c, deck, isBuild)).join('')
  }</ol>`;
}

function applyDeckView(view) {
  deckView = view === 'compact' ? 'compact' : 'grid';
  document.querySelectorAll('.view-switch-btn').forEach(btn => {
    const on = btn.dataset.view === deckView;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', String(on));
  });
  try { localStorage.setItem(DECK_VIEW_KEY, deckView); } catch { /* private mode */ }
}

function initViewSwitch() {
  let saved = null;
  try { saved = localStorage.getItem(DECK_VIEW_KEY); } catch { /* private mode */ }
  applyDeckView(saved || 'grid');

  document.querySelectorAll('.view-switch-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.view === deckView) return;
      applyDeckView(btn.dataset.view);
      if (currentDeck) renderDeck(currentDeck);
    });
  });
}

// ─── Render Deck ───────────────────────────────────────────

function renderDeck(deck) {
  currentDeck = deck;

  document.getElementById('deck-sidebar').classList.remove('hidden');
  document.getElementById('deck-card-list').classList.remove('hidden');
  document.getElementById('deck-empty-state').classList.add('hidden');
  setDeckListHeaderVisible(deck.cards.length > 0);

  const cmdData = commanderMap[deck.commander];
  const faction = cmdData ? (cmdData.faction || 'Neutral') : 'Neutral';

  // Faction ring on the commander token + the blurred portrait behind the
  // summary card. No commander yet: a neutral ring and no backdrop.
  const tokenEl = document.getElementById('deck-commander-token');
  if (tokenEl) {
    tokenEl.style.setProperty('--fc', deck.commander ? factionColor(faction) : 'var(--border-strong)');
    tokenEl.classList.toggle('is-empty', !deck.commander);
  }
  const backdropEl = document.getElementById('deck-summary-backdrop');
  if (backdropEl) {
    backdropEl.style.backgroundImage = deck.commander ? `url("${commanderArtPath(deck.commander)}")` : '';
    backdropEl.style.setProperty('--fc', factionColor(faction));
  }

  // Commander portrait — falls back to a faction-colored initial badge if the
  // art file is missing, instead of just leaving a blank gap.
  const artEl = document.getElementById('deck-commander-art');
  const fallbackEl = document.getElementById('deck-commander-fallback');
  artEl.style.display = '';
  if (fallbackEl) fallbackEl.classList.add('hidden');
  artEl.onload = () => { if (fallbackEl) fallbackEl.classList.add('hidden'); };
  artEl.onerror = () => {
    artEl.style.display = 'none';
    if (!fallbackEl) return;
    const fc = deck.commander ? factionColor(faction) : 'var(--text-muted)';
    fallbackEl.textContent = (deck.commander || '?').charAt(0).toUpperCase();
    fallbackEl.style.background = deck.commander ? `${fc}33` : 'var(--bg-elevated)';
    fallbackEl.style.color = fc;
    fallbackEl.classList.remove('hidden');
  };
  artEl.alt = deck.commander || '';
  // No commander picked yet (a fresh Build deck): go straight to the "?"
  // placeholder instead of requesting a portrait URL that can't exist.
  if (deck.commander) {
    if (artEl.getAttribute('src') !== commanderArtPath(deck.commander)) artEl.src = commanderArtPath(deck.commander);
    else if (artEl.complete && artEl.naturalWidth === 0) artEl.onerror();
  } else {
    artEl.removeAttribute('src');
    artEl.onerror();
  }

  // Tag the commander section so initCardPreview() can show the commander art
  // on hover — same machinery as card-name hover, just sourced from /assets/commanders/.
  const cmdSection = artEl.closest('.deck-commander-section');
  if (cmdSection) {
    if (deck.commander) cmdSection.dataset.commander = deck.commander;
    else delete cmdSection.dataset.commander;
  }

  // Deck name + commander label + faction badge
  document.getElementById('deck-name').textContent = deck.deckName || 'Unnamed Deck';
  document.getElementById('deck-commander').textContent = deck.commander || 'No commander yet';
  document.getElementById('deck-commander-faction').innerHTML = deck.commander ? factionBadge(faction) : '';

  // Quick stats
  const totalCards = deck.cards.reduce((s, c) => s + c.count, 0);
  const uniqueCards = deck.cards.length;
  let totalCost = 0, costCount = 0;
  deck.cards.forEach(c => {
    const info = cardInfoMap[c.name];
    if (info) {
      const cost = parseInt(info.cost);
      if (!isNaN(cost)) { totalCost += cost * c.count; costCount += c.count; }
    }
  });
  document.getElementById('stat-total-cards').textContent = totalCards;
  document.getElementById('stat-unique-cards').textContent = uniqueCards;
  document.getElementById('stat-avg-cost').textContent = costCount > 0 ? (totalCost / costCount).toFixed(1) : '?';

  const headerCount = document.getElementById('deck-list-header-count');
  if (headerCount) {
    headerCount.textContent = `${totalCards} card${totalCards === 1 ? '' : 's'} · ${uniqueCards} unique`;
  }
  renderDeckSize(totalCards);
  renderShareStrip(deck, totalCards, faction);

  // Mobile deck drawer pill — Import mode only. Build mode uses the
  // Add Cards / My Deck tabs instead (see setBuildMobileView()).
  const pill = document.getElementById('deck-drawer-pill');
  if (pill) {
    if (currentMode === 'import') {
      pill.classList.remove('hidden');
      document.getElementById('deck-drawer-pill-count').textContent =
        `${totalCards} card${totalCards === 1 ? '' : 's'}`;
    } else {
      pill.classList.add('hidden');
    }
  }

  const tabCount = document.getElementById('build-mobile-tab-count');
  if (tabCount) tabCount.textContent = totalCards;

  renderManaCurve(deck);
  renderTypeBreakdown(deck);

  // Incompatible card warning
  const incompatibleCards = deck.cards.filter(c => !isCardCompatible(c.name, deck.commander));
  const warningEl = document.getElementById('deck-warning');
  if (warningEl) {
    if (incompatibleCards.length > 0 && deck.commander) {
      const n = incompatibleCards.length;
      warningEl.textContent = `⚠ ${n} card${n > 1 ? 's' : ''} in your deck ${n > 1 ? 'are' : 'is'} incompatible with this commander and will be illegal in-game. Remove or replace ${n > 1 ? 'them' : 'it'}.`;
      warningEl.classList.remove('hidden');
    } else {
      warningEl.classList.add('hidden');
    }
  }

  // Card list. Grid view groups by cost and renders the same art-forward
  // tiles as the Add Cards browser; compact view is a flat, cost-sorted list
  // of one-line rows (the gems already make the cost grouping obvious, so it
  // drops the group headers). Import mode gets a read-only ×N count in both,
  // build mode a +/- stepper.
  const listEl = document.getElementById('deck-card-list');
  const sorted = [...deck.cards].sort((a, b) => {
    const ca = parseInt((cardInfoMap[a.name] || {}).cost) || 0;
    const cb = parseInt((cardInfoMap[b.name] || {}).cost) || 0;
    if (ca !== cb) return ca - cb;
    return a.name.localeCompare(b.name);
  });

  const isBuild = currentMode === 'build';
  let html = '';
  if (sorted.length === 0) {
    // The "My Deck" tab otherwise just shows blank stat cards with nothing
    // telling you where to go — nudge back to the card browser.
    if (isBuild) {
      html = `<div class="deck-list-empty-hint">
        <p>Your deck doesn't have any cards yet.</p>
        <button type="button" class="ac-btn ac-btn--gold ac-btn--sm" id="deck-list-empty-add-btn">Add Cards</button>
      </div>`;
    }
  } else if (deckView === 'compact') {
    html = renderCompactList(sorted, deck, isBuild);
  } else {
    const groups = {};
    sorted.forEach(c => {
      const cost = parseInt((cardInfoMap[c.name] || {}).cost) || 0;
      if (!groups[cost]) groups[cost] = [];
      groups[cost].push(c);
    });
    for (const cost of Object.keys(groups).sort((a, b) => a - b)) {
      const cards = groups[cost];
      const n = cards.reduce((s, c) => s + c.count, 0);
      html += `<div class="deck-cost-group">`;
      html += `<h3 class="deck-cost-group-label">${manaGemHtml(cost, 'deck-cost-group-gem')}` +
        `<span class="deck-cost-group-text">${cost} Cost <span class="deck-cost-group-n">${n} card${n === 1 ? '' : 's'}</span></span></h3>`;
      html += `<div class="deck-card-grid">`;
      cards.forEach(c => {
        html += cardTileHtml(c.name, {
          count: c.count,
          mode: isBuild ? 'edit' : 'view',
          compatible: isCardCompatible(c.name, deck.commander),
        });
      });
      html += `</div></div>`;
    }
  }
  listEl.innerHTML = html;
  // Wired in both modes: the +/- buttons only exist in build, but tapping a
  // row/tile to open the detail sheet is the only way to see a full card on
  // touch, and import mode needs that too.
  wireDeckListTiles();
  cardTilt.refresh();

  const buildNote = document.getElementById('build-note');
  if (currentMode === 'build') {
    buildNote.textContent = deckView === 'compact'
      ? "Use +/− to adjust a card's count, or tap a row for details."
      : "Use +/− to adjust a card's count, or tap its art for details.";
    buildNote.classList.remove('hidden');
    // Refresh card browser counts
    const searchInput = document.getElementById('build-card-input');
    renderCardBrowser(searchInput?.value.trim().toLowerCase() || '');
  } else {
    buildNote.classList.add('hidden');
  }
}

// Header carries the view switch, so it hides and shows with the list itself.
function setDeckListHeaderVisible(visible) {
  document.getElementById('deck-list-header')?.classList.toggle('hidden', !visible);
}

// ─── Deck List Tile / Row Buttons ───────────────────────────
// Same interaction pattern as the browser grid's delegated click handler:
// +/- adjust the count, tapping the art (grid) or the row body (compact)
// opens the card detail sheet.

function wireDeckListTiles() {
  const listEl = document.getElementById('deck-card-list');
  listEl.onclick = e => {
    if (e.target.closest('#deck-list-empty-add-btn')) {
      setBuildMobileView('browse');
      return;
    }
    const plusBtn  = e.target.closest('.card-tile-btn.plus, .deck-compact-btn.plus');
    const minusBtn = e.target.closest('.card-tile-btn.minus, .deck-compact-btn.minus');
    if (plusBtn && !plusBtn.disabled) {
      addCardToBuild(plusBtn.dataset.name);
      return;
    }
    if (minusBtn && !minusBtn.disabled) {
      removeOneFromBuild(minusBtn.dataset.name);
      return;
    }
    // Touch-only, same reasoning as the browser grid above — desktop already
    // has hover preview for these, so a click needs no action there. The
    // compact row has no separate art element, so the whole row opens it.
    if (supportsHover) return;
    const row = e.target.closest('.deck-compact-row');
    if (row) { openCardDetailSheet(row.dataset.name); return; }
    const tile = e.target.closest('.card-tile');
    if (tile && e.target.closest('.card-tile-art-wrap')) {
      openCardDetailSheet(tile.dataset.name);
    }
  };
}

// ─── Import (Decode) ───────────────────────────────────────

// Below 900px the summary sidebar is a drawer, so an opened deck gets a
// compact strip above the list instead: commander token, deck name, commander
// and size, plus Copy link. Import mode only (Build has its own My Deck tab).
function renderShareStrip(deck, totalCards, faction) {
  const strip = document.getElementById('deck-share-strip');
  if (!strip) return;
  const show = currentMode === 'import' && deck.cards.length > 0;
  strip.classList.toggle('hidden', !show);
  if (!show) return;
  strip.style.setProperty('--fc', deck.commander ? factionColor(faction) : 'var(--border-strong)');
  document.getElementById('deck-share-strip-token').innerHTML =
    deck.commander ? commanderTokenHtml(deck.commander, 'cmd-token--strip') : '';
  document.getElementById('deck-share-strip-name').textContent = deck.deckName || 'Unnamed Deck';
  document.getElementById('deck-share-strip-sub').textContent =
    `${deck.commander || 'No commander'} · ${totalCards} card${totalCards === 1 ? '' : 's'}`;
}

// A deck opened from a shared link folds the import box into one line on
// narrow screens; "Change" brings the box back for a different code.
function setImportLinked(linked) {
  const panel = document.getElementById('panel-import');
  if (!panel) return;
  panel.classList.toggle('is-linked', linked);
  const btn = document.getElementById('deck-import-change');
  if (btn) btn.setAttribute('aria-expanded', String(!linked));
}

function initImportLinked() {
  const btn = document.getElementById('deck-import-change');
  if (!btn) return;
  btn.addEventListener('click', () => {
    setImportLinked(false);
    const input = document.getElementById('deck-code-input');
    if (input) { input.focus(); input.select(); }
  });
}

function handleDecode() {
  const input = document.getElementById('deck-code-input');
  document.getElementById('deck-error').classList.add('hidden');
  const code = input.value.trim();
  if (!code) { showError('Please paste a deck code.'); return; }
  try {
    const deck = decodeDeckCode(code);
    deckSource = 'import';
    renderDeck(deck);
    const total = deck.cards.reduce((s, c) => s + c.count, 0);
    announce(`Loaded ${deck.deckName || 'deck'}${deck.commander ? ` for ${deck.commander}` : ''}: ${total} cards.`);
  } catch (e) {
    showError(`Failed to decode: ${e.message}`);
  }
}

// ─── Build Mode Setup ──────────────────────────────────────

function updateFilterHint(commanderName) {
  const hintEl = document.getElementById('build-filter-hint');
  if (!hintEl) return;
  const cmdData = commanderMap[commanderName];
  if (!cmdData || !commanderName) { hintEl.classList.add('hidden'); return; }
  hintEl.innerHTML = `${commanderTokenHtml(commanderName, 'cmd-token--xs')}<span>Showing ${poolDescription(commanderName).replace(/^Cards/, 'cards')}</span>`;
  hintEl.style.setProperty('--fc', factionColor(cmdData.faction));
  hintEl.classList.remove('hidden');
}

function initBuildMode() {
  const select = document.getElementById('build-commander');
  select.innerHTML = '<option value="">Select a commander...</option>' +
    commanderList.map(c => `<option value="${c}">${c}</option>`).join('');

  select.addEventListener('change', () => {
    ensureBuildDeck();
    currentDeck.commander = select.value;
    updateFilterHint(select.value);
    updateCommanderPickerButton(select.value);
    // Re-render deck (shows incompatible cards in red if any exist)
    if (currentDeck.cards.length > 0 || currentDeck.commander) {
      renderDeck(currentDeck);
    }
    // Refresh card pool with new faction filter
    const searchInput = document.getElementById('build-card-input');
    renderCardBrowser(searchInput?.value.trim().toLowerCase() || '');
  });

  document.getElementById('build-name').addEventListener('input', e => {
    ensureBuildDeck();
    currentDeck.deckName = e.target.value;
    const nameEl = document.getElementById('deck-name');
    if (nameEl) nameEl.textContent = currentDeck.deckName || 'Unnamed Deck';
  });

  // Search filters the card browser
  const searchInput = document.getElementById('build-card-input');
  let debounceTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      renderCardBrowser(searchInput.value.trim().toLowerCase());
    }, 150);
  });

  // Sort buttons
  document.querySelectorAll('.build-sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      buildSortMode = btn.dataset.sort;
      document.querySelectorAll('.build-sort-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.sort === buildSortMode);
        b.setAttribute('aria-pressed', String(b.dataset.sort === buildSortMode));
      });
      renderCardBrowser(searchInput.value.trim().toLowerCase());
    });
  });

  // Initial card pool render (data is loaded by now)
  renderCardBrowser('');
}

// ─── Commander Picker (visual replacement for <select>) ────
// The hidden <select id="build-commander"> stays the actual state — this
// just renders a tap-friendly portrait grid on top of it and drives the
// select's value + dispatches 'change' so all existing selection logic
// (faction filtering, deck sync, etc.) is untouched.

// Commanders grouped by faction, in FACTION_ORDER (anything unexpected last).
function commandersByFaction() {
  const groups = {};
  commanderList.forEach(name => {
    const f = ((commanderMap[name] || {}).faction || 'neutral').toLowerCase();
    (groups[f] = groups[f] || []).push(name);
  });
  const rank = f => (FACTION_ORDER.includes(f) ? FACTION_ORDER.indexOf(f) : 99);
  return Object.keys(groups).sort((a, b) => rank(a) - rank(b)).map(f => ({ faction: f, names: groups[f] }));
}

function renderCommanderPicker() {
  const grid = document.getElementById('commander-picker-grid');
  if (!grid) return;
  const current = document.getElementById('build-commander').value;
  grid.innerHTML = commandersByFaction().map(({ faction, names }) => `
    <section class="commander-picker-group" style="--fc:${factionColor(faction)}" aria-label="${titleCase(faction)}">
      <h3 class="commander-picker-group-title">
        <img class="commander-picker-group-emblem" src="/assets/factions/${faction}.png" alt="" width="24" height="24" loading="lazy" decoding="async" onerror="this.remove()">
        <span>${titleCase(faction)}</span>
      </h3>
      <div class="commander-picker-group-grid">${names.map(name => `
        <button type="button" class="commander-picker-tile${name === current ? ' selected' : ''}" data-name="${name}" aria-pressed="${name === current}">
          ${commanderTokenHtml(name, 'cmd-token--picker')}
          <span class="commander-picker-tile-name">${name}</span>
          ${name === current ? '<span class="commander-picker-tile-current">Current</span>' : ''}
        </button>`).join('')}
      </div>
    </section>`).join('');
}

function updateCommanderPickerButton(name) {
  const btn = document.getElementById('commander-picker-btn');
  const portrait = document.getElementById('commander-picker-btn-portrait');
  const label = document.getElementById('commander-picker-btn-label');
  const sub = document.getElementById('commander-picker-btn-sub');
  if (!portrait || !label) return;
  if (!name) {
    portrait.style.backgroundImage = '';
    btn?.style.removeProperty('--fc');
    btn?.classList.remove('has-commander');
    label.textContent = 'Select a commander...';
    label.classList.add('placeholder');
    if (sub) sub.textContent = 'Sets which cards you can add';
    return;
  }
  portrait.style.backgroundImage = `url("${commanderArtPath(name)}")`;
  btn?.style.setProperty('--fc', factionColor((commanderMap[name] || {}).faction));
  btn?.classList.add('has-commander');
  label.textContent = name;
  label.classList.remove('placeholder');
  if (sub) sub.textContent = poolDescription(name);
}

function openCommanderPicker() {
  renderCommanderPicker(); // refresh 'selected' highlight
  document.getElementById('commander-picker-modal').classList.remove('hidden');
  document.getElementById('commander-picker-backdrop').classList.remove('hidden');
  // Land focus inside the modal — on the current commander if there is one,
  // otherwise its close button — rather than leaving it on the trigger
  // button behind an open overlay (standard modal behavior).
  const selected = document.querySelector('#commander-picker-grid .commander-picker-tile.selected');
  (selected || document.getElementById('commander-picker-close')).focus();
}

function closeCommanderPicker() {
  document.getElementById('commander-picker-modal').classList.add('hidden');
  document.getElementById('commander-picker-backdrop').classList.add('hidden');
  document.getElementById('commander-picker-btn').focus();
}

function initCommanderPicker() {
  renderCommanderPicker();

  const select = document.getElementById('build-commander');
  const backdrop = document.getElementById('commander-picker-backdrop');

  document.getElementById('commander-picker-btn').addEventListener('click', openCommanderPicker);
  document.getElementById('commander-picker-close').addEventListener('click', closeCommanderPicker);
  backdrop.addEventListener('click', closeCommanderPicker);

  document.getElementById('commander-picker-grid').addEventListener('click', e => {
    const tile = e.target.closest('.commander-picker-tile');
    if (!tile) return;
    if (supportsHover) {
      // Desktop: hovering already previews the full card (see
      // previewSrcFor()'s .commander-picker-tile branch), so a click can
      // select immediately — no detail-then-confirm detour needed.
      selectCommander(tile.dataset.name);
    } else {
      // Touch: no hover, so open the detail view first — the picker modal
      // stays open underneath until "Select Commander" is tapped.
      openCommanderDetail(tile.dataset.name);
    }
  });
}

// ─── Commander Detail (detail-then-confirm) ─────────────────
// Shows the real card art — the game already bakes ability text and all 4
// stats (dominion/intellect/speed/health) into it — with a confirm button
// that actually applies the selection. Reopening the currently-selected
// commander's tile (marked via .selected in renderCommanderPicker) doubles
// as a way to check your commander's abilities mid-build at no extra cost.

function openCommanderDetail(name) {
  const art = document.getElementById('commander-detail-art');
  // The picker grid only ever loads the cropped portrait
  // (/assets/commanders/), never this full framed card — so unlike the card
  // detail sheet (which reuses an already-cached image from its own grid),
  // this is always a fresh fetch. Hide the old commander's art immediately
  // instead of leaving it on screen until the new one finishes loading.
  setSheetArt(art, name);
  renderMentionStrip(
    document.getElementById('commander-detail-mentions'),
    name,
    s => cardArtSrc(s),
  );

  const sheet = document.getElementById('commander-detail-sheet');
  sheet.dataset.name = name;
  sheet.classList.remove('hidden');
  document.getElementById('commander-detail-backdrop').classList.remove('hidden');
  requestAnimationFrame(() => sheet.classList.add('open'));
  document.getElementById('commander-detail-close').focus();
}

function closeCommanderDetail() {
  const sheet = document.getElementById('commander-detail-sheet');
  if (sheet.classList.contains('hidden')) return; // already closed — nothing to do
  sheet.classList.remove('open');
  setTimeout(() => {
    sheet.classList.add('hidden');
    document.getElementById('commander-detail-backdrop').classList.add('hidden');
  }, 200);
  // Picker grid is still open underneath — land back on its close button
  // rather than a now-possibly-stale tile reference. (Opened from the quick
  // start instead, there's no picker: go to the commander field.)
  const pickerOpen = !document.getElementById('commander-picker-modal').classList.contains('hidden');
  document.getElementById(pickerOpen ? 'commander-picker-close' : 'commander-picker-btn').focus();
}

// Actually applies a commander selection: sets the hidden <select>'s value,
// dispatches 'change' (so all existing selection logic fires), and closes
// both the detail sheet and the picker grid behind it.
function selectCommander(name) {
  const select = document.getElementById('build-commander');
  select.value = name;
  select.dispatchEvent(new Event('change'));
  closeCommanderDetail();
  closeCommanderPicker();
}

function initCommanderDetail() {
  document.getElementById('commander-detail-close').addEventListener('click', closeCommanderDetail);
  document.getElementById('commander-detail-backdrop').addEventListener('click', closeCommanderDetail);

  document.getElementById('commander-detail-select-btn').addEventListener('click', () => {
    selectCommander(document.getElementById('commander-detail-sheet').dataset.name);
  });
}

function ensureBuildDeck() {
  if (!currentDeck || currentMode !== 'build') {
    currentDeck = {
      commander: document.getElementById('build-commander').value || '',
      deckName: document.getElementById('build-name').value || 'My Deck',
      cards: [],
    };
    deckSource = 'build';
  }
}

function addCardToBuild(name) {
  ensureBuildDeck();
  const existing = currentDeck.cards.find(c => c.name === name);
  if (existing) {
    if (existing.count >= 3) return;
    existing.count++;
  } else {
    currentDeck.cards.push({ name, count: 1 });
  }
  lastAddedName = name; // pulse the tile on this render only
  renderDeck(currentDeck);
  lastAddedName = null;
  announceCount(name, 'Added');
}

function removeOneFromBuild(name) {
  if (!currentDeck) return;
  const card = currentDeck.cards.find(c => c.name === name);
  if (!card) return;
  if (card.count > 1) card.count--;
  else currentDeck.cards = currentDeck.cards.filter(c => c.name !== name);
  renderDeck(currentDeck);
  announceCount(name, 'Removed');
}

function announceCount(name, verb) {
  if (!currentDeck) return;
  const n = currentDeck.cards.find(c => c.name === name)?.count || 0;
  const total = currentDeck.cards.reduce((s, c) => s + c.count, 0);
  announce(`${verb} ${name}. ${n} of ${MAX_COPIES} in deck, ${total} card${total === 1 ? '' : 's'} total.`);
}

// ─── Copy Actions ──────────────────────────────────────────

// Clipboard write with a fallback for browsers/contexts without the async
// Clipboard API (e.g. an http:// preview): a hidden textarea + execCommand.
function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  return new Promise((resolve, reject) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;left:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    if (ok) resolve(); else reject(new Error('copy failed'));
  });
}

function handleCopyCode() {
  if (!currentDeck) return;
  try {
    const code = encodeDeckCode(currentDeck);
    copyText(code).then(
      () => { flashButton('btn-copy-code', 'Code copied'); announce('Deck code copied to the clipboard.'); },
      () => showError("Couldn't reach the clipboard — your browser blocked it. Try again."),
    );
  } catch (e) {
    showError(`Failed to encode: ${e.message}`);
  }
}

// Must match commanderSlug() in site/js/shared.js AND slugify() in
// scripts/generate_deck_pages.py — those three slug functions produce the
// paths under /decks/<slug>/ that the generator creates for Discord unfurls.
function deckCommanderSlug(name) {
  return name.toLowerCase().replace(/[,']/g, '').replace(/\s+/g, '-');
}

function handleCopyUrl(e) {
  if (!currentDeck) return;
  const btnId = (e && e.currentTarget && e.currentTarget.id) || 'btn-copy-url';
  try {
    const code = encodeDeckCode(currentDeck);
    // Build the share URL against the per-commander path if a pre-generated page
    // exists (lets Discord show commander-specific unfurls). Fall back to the
    // current pathname — keeps builds with no commander working, and anything
    // hosted outside the expected origin (local dev, preview deploys) unchanged.
    let pathname = window.location.pathname;
    if (currentDeck.commander) {
      pathname = `/decks/${deckCommanderSlug(currentDeck.commander)}/`;
    }
    const url = `${window.location.origin}${pathname}?code=${encodeURIComponent(code)}`;
    copyText(url).then(
      () => { flashButton(btnId, 'Link copied'); announce('Share link copied to the clipboard.'); },
      () => showError("Couldn't reach the clipboard — your browser blocked it. Try again."),
    );
  } catch (e) {
    showError(`Failed to encode: ${e.message}`);
  }
}

// Swap a button's label (and icon) to a confirmation for a moment. Works on
// the icon + .deck-btn-label buttons without wiping their markup.
function flashButton(id, text) {
  const btn = document.getElementById(id);
  if (!btn) return;
  const label = btn.querySelector('.deck-btn-label') || btn;
  const use = btn.querySelector('use');
  if (!btn.dataset.label) btn.dataset.label = label.textContent;
  if (use && !btn.dataset.icon) btn.dataset.icon = use.getAttribute('href');
  label.textContent = text;
  if (use) use.setAttribute('href', '#dk-i-check');
  btn.classList.add('copied');
  clearTimeout(btn._flashTimer);
  btn._flashTimer = setTimeout(() => {
    label.textContent = btn.dataset.label;
    if (use) use.setAttribute('href', btn.dataset.icon);
    btn.classList.remove('copied');
  }, 1600);
}

// ─── Tabs ──────────────────────────────────────────────────

function initTabs() {
  document.querySelectorAll('.deck-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.deck-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentMode = tab.dataset.mode;

      document.getElementById('panel-import').classList.toggle('hidden', currentMode !== 'import');
      document.getElementById('panel-build').classList.toggle('hidden', currentMode !== 'build');

      if (currentMode === 'build') {
        const sel = document.getElementById('build-commander');
        const ni  = document.getElementById('build-name');

        // FIX: always sync commander + name from currentDeck when switching to Build.
        // This ensures an imported deck's commander overwrites a stale Build selection.
        if (currentDeck && currentDeck.commander) {
          sel.value = currentDeck.commander;
          updateFilterHint(currentDeck.commander);
          updateCommanderPickerButton(currentDeck.commander);
          if (ni && currentDeck.deckName) ni.value = currentDeck.deckName;
        }

        ensureBuildDeck();
        setBuildMobileView('browse');
        if (currentDeck && (currentDeck.commander || currentDeck.cards.length > 0)) {
          renderDeck(currentDeck);
        }
        const searchInput = document.getElementById('build-card-input');
        renderCardBrowser(searchInput?.value.trim().toLowerCase() || '');
      } else {
        // Leaving Build mode — drop its mobile-view classes and put the
        // sidebar back where Import's existing drawer/pill styling expects it.
        document.querySelector('.deck-layout')?.classList.remove('build-view-browse', 'build-view-deck');
        restoreSidebarPosition();

        // The shared deck list/sidebar should only show on Import if it's
        // actually displaying an imported deck — not one started fresh in
        // Build mode. (An imported deck carried into Build for editing
        // keeps deckSource === 'import', so it correctly stays visible here.)
        if (deckSource !== 'import') {
          document.getElementById('deck-card-list').classList.add('hidden');
          setDeckListHeaderVisible(false);
          document.getElementById('deck-sidebar').classList.add('hidden');
          document.getElementById('deck-warning').classList.add('hidden');
          document.getElementById('deck-empty-state').classList.remove('hidden');
        }
      }
    });
  });
}

// ─── Build Mode Mobile Tabs (Add Cards / My Deck) ───────────
// Mobile-only split so the full card pool doesn't bury the deck list on a
// single long scrolling page — see .build-view-* rules in decks.css.

function restoreSidebarPosition() {
  // #deck-sidebar's natural place is as the second child of .deck-layout
  // (a CSS Grid sibling of .deck-main). Undoes the relocation below.
  const layout = document.querySelector('.deck-layout');
  const sidebar = document.getElementById('deck-sidebar');
  if (layout && sidebar && sidebar.parentElement !== layout) {
    layout.appendChild(sidebar);
  }
}

function setBuildMobileView(view) {
  const layout = document.querySelector('.deck-layout');
  if (!layout) return;
  layout.classList.toggle('build-view-browse', view === 'browse');
  layout.classList.toggle('build-view-deck', view === 'deck');
  document.querySelectorAll('.build-mobile-tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));

  // The "My Deck" tab wants commander/stats/curve to read as an overview
  // ABOVE the itemized card list. A CSS `order` swap can't do this: the
  // Import/Build mode switcher (.deck-tabs) lives inside .deck-main ahead
  // of the card list, so reordering .deck-main vs .deck-sidebar as whole
  // grid items would drag that switcher down too. Relocate the sidebar
  // node itself instead.
  const cardList = document.getElementById('deck-card-list');
  const sidebar = document.getElementById('deck-sidebar');
  if (view === 'deck' && sidebar && cardList) {
    // Above the "Decklist" header too, so the header stays with its cards.
    const anchor = document.getElementById('deck-list-header') || cardList;
    anchor.parentNode.insertBefore(sidebar, anchor);
  } else {
    restoreSidebarPosition();
  }
}

function initBuildMobileTabs() {
  document.querySelectorAll('.build-mobile-tab').forEach(btn => {
    btn.addEventListener('click', () => setBuildMobileView(btn.dataset.view));
  });
}

// ─── Errors ────────────────────────────────────────────────

function showError(msg) {
  const el = document.getElementById('deck-error');
  el.textContent = msg;
  el.classList.remove('hidden', 'success');
}

// ─── Init ──────────────────────────────────────────────────

function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Registered directly (not deferred to window 'load') so offline support is
  // available as soon as possible — deck tools is a small enough shell that
  // there's no bandwidth-contention concern during initial page load.
  navigator.serviceWorker.register('/service-worker.js').catch(() => {});
}

// Escape closes whichever overlay is topmost. Checked most-specific first —
// the two detail sheets can each be stacked on top of the commander picker,
// so Escape should peel off one layer at a time, matching their close
// buttons/backdrop-click behavior rather than closing everything at once.
// The topmost open overlay, same precedence as Escape below (or null).
function topOverlay() {
  const open = id => !document.getElementById(id).classList.contains('hidden');
  if (open('commander-detail-sheet')) return document.getElementById('commander-detail-sheet');
  if (open('card-detail-sheet')) return document.getElementById('card-detail-sheet');
  if (open('commander-picker-modal')) return document.getElementById('commander-picker-modal');
  const sidebar = document.getElementById('deck-sidebar');
  if (sidebar.classList.contains('drawer-open')) return sidebar;
  return null;
}

// Keep Tab inside whichever overlay is on top, like a native modal dialog.
function initOverlayFocusTrap() {
  const FOCUSABLE = 'button:not([disabled]), [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';
  document.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const box = topOverlay();
    if (!box) return;
    const items = [...box.querySelectorAll(FOCUSABLE)].filter(el => el.getClientRects().length > 0 && !el.closest('.hidden'));
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (!box.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
}

function initOverlayEscapeHandling() {
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!document.getElementById('commander-detail-sheet').classList.contains('hidden')) {
      closeCommanderDetail();
    } else if (!document.getElementById('card-detail-sheet').classList.contains('hidden')) {
      closeCardDetailSheet();
    } else if (!document.getElementById('commander-picker-modal').classList.contains('hidden')) {
      closeCommanderPicker();
    } else if (document.getElementById('deck-sidebar').classList.contains('drawer-open')) {
      closeDeckDrawer();
    }
  });
}

function initDeckCodeHelp() {
  const btn = document.getElementById('deck-code-help-btn');
  const help = document.getElementById('deck-code-help');
  if (!btn || !help) return;
  btn.addEventListener('click', () => {
    help.classList.toggle('hidden');
    btn.setAttribute('aria-expanded', String(!help.classList.contains('hidden')));
  });
}

// ─── Mode tabs: ARIA state + arrow-key navigation ──────────
// initTabs() owns what switching does; this keeps aria-selected / roving
// tabindex in step (its click listener runs after initTabs' own).

function initTabA11y() {
  const tabs = [...document.querySelectorAll('.deck-tab')];
  if (!tabs.length) return;
  const sync = () => tabs.forEach(t => {
    const on = t.classList.contains('active');
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
  });
  tabs.forEach(t => t.addEventListener('click', sync));
  tabs[0].parentElement.addEventListener('keydown', e => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    let j = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = tabs.length - 1;
    if (j === null) return;
    e.preventDefault();
    tabs[j].click();
    tabs[j].focus();
  });
  sync();
}

// ─── Quick start (empty state) ──────────────────────────────
// Every commander as a round token: one click jumps into Build mode with
// that commander chosen. Touch gets the same detail-then-confirm sheet as
// the picker, since there's no hover preview to see the card first.

function renderStartTokens() {
  const wrap = document.getElementById('deck-start-tokens');
  if (!wrap) return;
  wrap.innerHTML = commandersByFaction().map(({ names }) => names.map(name => {
    const short = name.split(',')[0];
    return `<button type="button" class="deck-start-token" data-name="${name}" aria-label="Start a ${name} deck" title="${name}">
      ${commanderTokenHtml(name, 'cmd-token--start')}
      <span class="deck-start-token-name">${short}</span>
    </button>`;
  }).join('')).join('');

  wrap.addEventListener('click', e => {
    const btn = e.target.closest('.deck-start-token');
    if (!btn) return;
    const name = btn.dataset.name;
    document.getElementById('card-preview')?.classList.remove('visible');
    document.getElementById('tab-build').click();
    if (supportsHover) selectCommander(name);
    else openCommanderDetail(name);
  });
}

// ─── Import UX: paste-to-load + Paste button ────────────────

function initImportUx() {
  const input = document.getElementById('deck-code-input');
  // Pasting a code into the field loads it straight away — no extra tap.
  input.addEventListener('paste', () => {
    setTimeout(() => { if (input.value.trim()) handleDecode(); }, 0);
  });

  const pasteBtn = document.getElementById('btn-paste');
  if (!pasteBtn || !(navigator.clipboard && navigator.clipboard.readText && window.isSecureContext)) return;
  pasteBtn.hidden = false;
  pasteBtn.addEventListener('click', async () => {
    let text = '';
    try {
      text = (await navigator.clipboard.readText()).trim();
    } catch {
      input.focus();
      showError('Clipboard access was blocked — paste the code into the field instead.');
      return;
    }
    if (!text) { showError('Your clipboard is empty — copy a deck code in the game first.'); return; }
    input.value = text;
    handleDecode();
  });
}

// ─── Hero counts + install prompt ──────────────────────────

function fillHeroCounts() {
  const set = (key, n) => {
    const li = document.querySelector(`[data-deck-hero-count="${key}"]`);
    if (!li || !n) return;
    li.querySelector('strong').textContent = n;
    li.hidden = false;
  };
  set('cards', getCardPool().length);
  set('commanders', commanderList.length);
}

// Chrome/Edge/Android offer installation via beforeinstallprompt; surface it
// as a quiet "Install as an app" link in the hero instead of the browser's
// own mini-infobar. Registered at load (the event can fire before init()).
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const item = document.getElementById('deck-install-item');
  if (item) item.hidden = false;
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  const item = document.getElementById('deck-install-item');
  if (item) item.hidden = true;
});

function initInstallButton() {
  const btn = document.getElementById('deck-install-btn');
  if (!btn) return;
  if (deferredInstallPrompt) document.getElementById('deck-install-item').hidden = false;
  btn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    try { await deferredInstallPrompt.userChoice; } catch { /* dismissed */ }
    deferredInstallPrompt = null;
    document.getElementById('deck-install-item').hidden = true;
  });
}

async function init() {
  await loadCardlist();

  initServiceWorker();
  initTabs();
  initTabA11y();
  initBuildMode();
  renderStartTokens();
  fillHeroCounts();
  initImportUx();
  initInstallButton();
  initOverlayFocusTrap();
  cardTilt.init();
  initCommanderPicker();
  initCommanderDetail();
  initBuildMobileTabs();
  initCardPreview();
  initViewSwitch();
  initCostChips();
  initCardDetailSheet();
  initDeckDrawer();
  initDeckCodeHelp();
  initOverlayEscapeHandling();

  document.getElementById('btn-decode').addEventListener('click', handleDecode);
  document.getElementById('deck-code-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleDecode();
  });
  document.getElementById('btn-copy-code').addEventListener('click', handleCopyCode);
  document.getElementById('btn-copy-url').addEventListener('click', handleCopyUrl);
  const stripCopy = document.getElementById('btn-copy-url-strip');
  if (stripCopy) stripCopy.addEventListener('click', handleCopyUrl);
  initImportLinked();

  // Auto-decode from URL
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (code) {
    document.getElementById('deck-code-input').value = code;
    try {
      const deck = decodeDeckCode(code);
      deckSource = 'import';
      renderDeck(deck);
      setImportLinked(true);
    } catch (e) {
      showError(`Failed to decode URL deck code: ${e.message}`);
    }
  } else {
    openCommanderPage();
  }
}

// /decks/<slug>/ without a ?code is that commander's page (it's in the
// sitemap): start a Build deck with the commander already chosen and say so
// in the hero, instead of the generic "Choose a commander" state.
function openCommanderPage() {
  const m = window.location.pathname.match(/\/decks\/([a-z0-9-]+)\/?(?:index\.html)?$/);
  if (!m) return;
  const name = commanderList.find(n => deckCommanderSlug(n) === m[1]);
  if (!name) return;
  const lede = document.querySelector('.deck-hero .ac-page-hero__lede');
  if (lede) lede.textContent = `Build a ${name} deck (${poolDescription(name)}) and watch the curve and deck size as you go. Share it as a link, or as a code for the game.`;
  const eyebrow = document.querySelector('.deck-hero .ac-eyebrow');
  if (eyebrow) eyebrow.textContent = name;
  const buildTab = document.getElementById('tab-build');
  if (buildTab) buildTab.click();
  // Same as selectCommander() minus closing the picker, which would move
  // focus to the picker button on page load.
  const select = document.getElementById('build-commander');
  select.value = name;
  select.dispatchEvent(new Event('change'));
}

document.addEventListener('DOMContentLoaded', init);
