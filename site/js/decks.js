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

const MINION_COLOR = 'var(--lucia)';
const SPELL_COLOR  = '#7C9EFF';

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

function factionBadge(faction) {
  const f = (faction || 'neutral').toLowerCase();
  const c = FACTION_COLORS[f] || FACTION_COLORS.neutral;
  return `<span class="faction-badge" style="color:${c};background:${c}1a;padding:2px 7px;border-radius:4px;font-size:0.65rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">${f}</span>`;
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
  document.getElementById('mana-curve').innerHTML = labels.map((l, i) => {
    const totalH = Math.round((totals[i] / max) * 72);
    const spellH  = totals[i] > 0 ? Math.round((spellBuckets[i] / totals[i]) * totalH) : 0;
    const minionH = totalH - spellH;
    return `<div class="mana-bar-col">
      <div class="mana-bar-count">${totals[i] || ''}</div>
      <div class="mana-bar-stack" style="height:${totalH}px">
        <div class="mana-bar-seg spell"  style="height:${spellH}px"></div>
        <div class="mana-bar-seg minion" style="height:${minionH}px"></div>
      </div>
      <div class="mana-bar-label">${l}</div>
    </div>`;
  }).join('');
}

// ─── Type Breakdown ────────────────────────────────────────

function renderTypeBreakdown(deck) {
  let minions = 0, spells = 0;
  deck.cards.forEach(c => {
    const t = ((cardInfoMap[c.name] || {}).type || '').toLowerCase();
    if (t === 'minion') minions += c.count;
    else if (t === 'spell') spells += c.count;
  });
  const total = minions + spells;
  const mPct = total > 0 ? Math.round(minions / total * 100) : 0;
  const sPct = total > 0 ? 100 - mPct : 0;
  document.getElementById('type-breakdown').innerHTML = `
    <div class="type-breakdown-counts">
      <span style="color:${MINION_COLOR}"><strong>${minions}</strong> Minions</span>
      <span style="color:${SPELL_COLOR}"><strong>${spells}</strong> Spells</span>
    </div>
    <div class="type-breakdown-bar">
      <div style="flex:${minions};background:${MINION_COLOR}"></div>
      <div style="flex:${spells};background:${SPELL_COLOR}"></div>
    </div>
    <div class="type-breakdown-pct">
      <span>${mPct}%</span>
      <span>${sPct}%</span>
    </div>`;
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
    const cmdTile = target.closest('.commander-picker-tile');
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
  // token previews side-by-side with it.
  const srcFor = slug => `/assets/cards/${slug}.jpg`;

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

// ─── Card Pool (Build Mode) ────────────────────────────────

function getCardPool() {
  if (!cardlistData) return [];
  const commanderSet = new Set(commanderList);
  const selectedCommander = document.getElementById('build-commander')?.value || '';
  const cmdData = commanderMap[selectedCommander];
  const cmdFaction = cmdData ? (cmdData.faction || '').toLowerCase() : null;

  return cardlistData.cards.filter(c => {
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

  grid.innerHTML = pool.map(c => {
    const info = cardInfoMap[c.name] || {};
    const cost = info.cost != null ? info.cost : '?';
    const slug = cardArtSlug(c.name);
    const count = currentDeck ? (currentDeck.cards.find(x => x.name === c.name)?.count || 0) : 0;
    const atMax = count >= 3;
    return `<div class="card-tile${count > 0 ? ' in-deck' : ''}" data-name="${c.name}">
      <div class="card-tile-art-wrap">
        <img class="card-tile-art" src="/assets/cards/${slug}.jpg" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
        <div class="card-tile-cost-badge">${cost}</div>
      </div>
      <div class="card-tile-name">${c.name}</div>
      <div class="card-tile-controls">
        <button class="card-tile-btn minus" data-name="${c.name}"${count === 0 ? ' disabled' : ''}>−</button>
        <span class="card-tile-count${count > 0 ? ' active' : ''}">${count}</span>
        <button class="card-tile-btn plus" data-name="${c.name}"${atMax ? ' disabled' : ''}>+</button>
      </div>
    </div>`;
  }).join('');

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

function openCardDetailSheet(name) {
  // Defensive: on hybrid devices (touchscreen + mouse) a tap can still leave
  // the hover popup visible; the detail sheet is about to cover it anyway,
  // but clear it so it can't get stuck once the sheet closes.
  document.getElementById('card-preview')?.classList.remove('visible');

  const info = cardInfoMap[name] || {};
  const cost = info.cost != null ? info.cost : '?';
  const fc = factionColor(info.faction);
  const fLabel = (info.faction || 'neutral').toUpperCase();
  const typeLabel = (info.type || '').toUpperCase();
  const count = currentDeck ? (currentDeck.cards.find(c => c.name === name)?.count || 0) : 0;

  // Usually already cached (same URL as the grid tile you tapped), but
  // guard against the same stale-image flash as the commander sheet in case
  // this card's art hasn't loaded yet (e.g. still lazy-loading).
  const art = document.getElementById('card-detail-art');
  art.style.visibility = 'hidden';
  art.onload = art.onerror = () => { art.style.visibility = ''; };
  art.src = `/assets/cards/${cardArtSlug(name)}.jpg`;
  art.alt = name;
  // Touch has no hover preview, so the cards this one creates are shown beside
  // its art here instead.
  renderMentionStrip(
    document.getElementById('card-detail-mentions'),
    name,
    s => `/assets/cards/${s}.jpg`,
  );
  document.getElementById('card-detail-name').textContent = name;
  document.getElementById('card-detail-badges').innerHTML = `
    ${manaGemHtml(cost, 'card-detail-badge-cost', `Cost ${cost}`)}
    ${typeLabel ? `<span class="card-detail-badge-type">${typeLabel}</span>` : ''}
    <span class="card-detail-badge-faction" style="color:${fc};border:1px solid ${fc}40">${fLabel}</span>`;
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
      style="--art:url('/assets/cards/${slug}.jpg');--fc:${fc}">
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

  // Commander portrait — falls back to a faction-colored initial badge if the
  // art file is missing, instead of just leaving a blank gap.
  const artEl = document.getElementById('deck-commander-art');
  const fallbackEl = document.getElementById('deck-commander-fallback');
  artEl.style.display = '';
  artEl.src = commanderArtPath(deck.commander || '');
  artEl.alt = deck.commander || '';
  if (fallbackEl) fallbackEl.classList.add('hidden');
  artEl.onload = () => { if (fallbackEl) fallbackEl.classList.add('hidden'); };
  artEl.onerror = () => {
    artEl.style.display = 'none';
    if (!fallbackEl) return;
    const fc = factionColor(faction);
    fallbackEl.textContent = (deck.commander || '?').charAt(0).toUpperCase();
    fallbackEl.style.background = `${fc}33`;
    fallbackEl.style.color = fc;
    fallbackEl.classList.remove('hidden');
  };

  // Tag the commander section so initCardPreview() can show the commander art
  // on hover — same machinery as card-name hover, just sourced from /assets/commanders/.
  const cmdSection = artEl.closest('.deck-commander-section');
  if (cmdSection) {
    if (deck.commander) cmdSection.dataset.commander = deck.commander;
    else delete cmdSection.dataset.commander;
  }

  // Deck name + commander label + faction badge
  document.getElementById('deck-name').textContent = deck.deckName || 'Unnamed Deck';
  document.getElementById('deck-commander').textContent = deck.commander || '—';
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
    headerCount.textContent = `· ${totalCards} card${totalCards === 1 ? '' : 's'}, ${uniqueCards} unique`;
  }

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
        <button type="button" class="btn btn-primary" id="deck-list-empty-add-btn">Add Cards</button>
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
      html += `<div class="deck-cost-group">`;
      html += `<div class="deck-cost-group-label">${cost} Cost (${cards.reduce((s, c) => s + c.count, 0)} cards)</div>`;
      html += `<div class="deck-card-grid">`;
      cards.forEach(c => {
        const info = cardInfoMap[c.name] || {};
        const tileCost = info.cost != null ? info.cost : '?';
        const slug = cardArtSlug(c.name);
        const compatible = isCardCompatible(c.name, deck.commander);
        html += `<div class="card-tile${compatible ? '' : ' incompatible'}" data-name="${c.name}">
          <div class="card-tile-art-wrap">
            <img class="card-tile-art" src="/assets/cards/${slug}.jpg" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
            <div class="card-tile-cost-badge">${tileCost}</div>
          </div>
          <div class="card-tile-name">${c.name}</div>
          <div class="card-tile-controls">
            ${isBuild
              ? `<button class="card-tile-btn minus" data-name="${c.name}">−</button>
                 <span class="card-tile-count active">${c.count}</span>
                 <button class="card-tile-btn plus" data-name="${c.name}"${c.count >= 3 ? ' disabled' : ''}>+</button>`
              : `<span class="card-tile-count active">&times;${c.count}</span>`}
          </div>
        </div>`;
      });
      html += `</div></div>`;
    }
  }
  listEl.innerHTML = html;
  // Wired in both modes: the +/- buttons only exist in build, but tapping a
  // row/tile to open the detail sheet is the only way to see a full card on
  // touch, and import mode needs that too.
  wireDeckListTiles();

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

function handleDecode() {
  const input = document.getElementById('deck-code-input');
  document.getElementById('deck-error').classList.add('hidden');
  const code = input.value.trim();
  if (!code) { showError('Please paste a deck code.'); return; }
  try {
    const deck = decodeDeckCode(code);
    deckSource = 'import';
    renderDeck(deck);
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
  const faction = cmdData.faction || 'Neutral';
  let text;
  if (commanderName === LAZIM_NAME) {
    text = 'Showing cards from every god — no Neutral';
  } else if (faction.toLowerCase() === 'neutral') {
    text = 'Showing neutral cards only';
  } else {
    text = `Showing ${faction} + Neutral cards`;
  }
  hintEl.textContent = text;
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
      document.querySelectorAll('.build-sort-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.sort === buildSortMode)
      );
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

function renderCommanderPicker() {
  const grid = document.getElementById('commander-picker-grid');
  if (!grid) return;
  const current = document.getElementById('build-commander').value;
  grid.innerHTML = commanderList.map(name => {
    const data = commanderMap[name] || {};
    const faction = data.faction || 'Neutral';
    const fc = factionColor(faction);
    return `<button type="button" class="commander-picker-tile${name === current ? ' selected' : ''}" data-name="${name}">
      <img class="commander-picker-tile-art" src="${commanderArtPath(name)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
      <span class="commander-picker-tile-name">${name}</span>
      <span class="commander-picker-tile-faction" style="color:${fc};border:1px solid ${fc}40">${faction.toUpperCase()}</span>
    </button>`;
  }).join('');
}

function updateCommanderPickerButton(name) {
  const portrait = document.getElementById('commander-picker-btn-portrait');
  const label = document.getElementById('commander-picker-btn-label');
  if (!portrait || !label) return;
  if (!name) {
    portrait.style.backgroundImage = '';
    label.textContent = 'Select a commander...';
    label.classList.add('placeholder');
    return;
  }
  portrait.style.backgroundImage = `url(${commanderArtPath(name)})`;
  label.textContent = name;
  label.classList.remove('placeholder');
}

function openCommanderPicker() {
  renderCommanderPicker(); // refresh 'selected' highlight
  document.getElementById('commander-picker-modal').classList.remove('hidden');
  document.getElementById('commander-picker-backdrop').classList.remove('hidden');
  // Land focus inside the modal (on its close button) rather than leaving it
  // on the trigger button behind an open overlay — standard modal behavior.
  document.getElementById('commander-picker-close').focus();
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
  art.style.visibility = 'hidden';
  art.onload = art.onerror = () => { art.style.visibility = ''; };
  art.src = `/assets/cards/${cardArtSlug(name)}.jpg`;
  art.alt = name;
  renderMentionStrip(
    document.getElementById('commander-detail-mentions'),
    name,
    s => `/assets/cards/${s}.jpg`,
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
  // rather than a now-possibly-stale tile reference.
  document.getElementById('commander-picker-close').focus();
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
  renderDeck(currentDeck);
}

function removeOneFromBuild(name) {
  if (!currentDeck) return;
  const card = currentDeck.cards.find(c => c.name === name);
  if (!card) return;
  if (card.count > 1) card.count--;
  else currentDeck.cards = currentDeck.cards.filter(c => c.name !== name);
  renderDeck(currentDeck);
}

// ─── Copy Actions ──────────────────────────────────────────

function handleCopyCode() {
  if (!currentDeck) return;
  try {
    const code = encodeDeckCode(currentDeck);
    navigator.clipboard.writeText(code);
    flashButton('btn-copy-code', 'Copied!');
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

function handleCopyUrl() {
  if (!currentDeck) return;
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
    navigator.clipboard.writeText(url);
    flashButton('btn-copy-url', 'Copied!');
  } catch (e) {
    showError(`Failed to encode: ${e.message}`);
  }
}

function flashButton(id, text) {
  const btn = document.getElementById(id);
  const original = btn.textContent;
  btn.textContent = text;
  btn.classList.add('copied');
  setTimeout(() => { btn.textContent = original; btn.classList.remove('copied'); }, 1500);
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
    cardList.parentNode.insertBefore(sidebar, cardList);
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
  btn.addEventListener('click', () => help.classList.toggle('hidden'));
}

async function init() {
  await loadCardlist();

  const decksLink = document.querySelector('.nav-link[data-nav="decks"]');
  if (decksLink) decksLink.classList.add('active');

  initServiceWorker();
  initTabs();
  initBuildMode();
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

  // Auto-decode from URL
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (code) {
    document.getElementById('deck-code-input').value = code;
    try {
      const deck = decodeDeckCode(code);
      deckSource = 'import';
      renderDeck(deck);
    } catch (e) {
      showError(`Failed to decode URL deck code: ${e.message}`);
    }
  }
}

document.addEventListener('DOMContentLoaded', init);
