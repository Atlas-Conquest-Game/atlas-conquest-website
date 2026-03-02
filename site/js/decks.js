/**
 * Atlas Conquest — Deck Tools Page v1.4
 *
 * Import (decode) and build (encode) deck codes.
 */

let cardlistData = null;
let cardsData = null;
let cardInfoMap = {};
let commanderList = [];
let commanderMap = {};
let currentDeck = null;
let currentMode = 'import';
let buildSortMode = 'cost';

const FACTION_COLORS = {
  skaal: '#D55E00', grenalia: '#009E73', lucia: '#E8B630',
  neutral: '#A89078', shadis: '#7B7B8E', archaeon: '#0072B2',
};

const MINION_COLOR = 'var(--lucia)';
const SPELL_COLOR  = '#7C9EFF';

// Lazim has a unique rule: all non-neutral faction cards, but no neutral cards
const LAZIM_NAME = 'Lazim, Thief of Gods';

// ─── Data Loading ──────────────────────────────────────────

async function loadCardlist() {
  const resp = await fetch('data/cardlist.json');
  cardlistData = await resp.json();
  initDeckCodec(cardlistData);

  const knownCommanders = new Set();
  const resp2 = await fetch('data/commanders.json');
  const commanders = await resp2.json();
  commanders.forEach(c => {
    knownCommanders.add(c.name);
    commanderMap[c.name] = c;
  });
  commanderList = [...knownCommanders].sort();

  const resp3 = await fetch('data/cards.json');
  const cards = await resp3.json();
  cards.forEach(c => {
    cardInfoMap[c.name] = {
      cost: c.cost != null ? c.cost : '?',
      type: c.type || '',
      faction: c.faction || 'neutral',
    };
  });
  cardsData = cards;
}

// ─── Art & Faction Helpers ─────────────────────────────────

function commanderArtPath(name) {
  const slug = name.toLowerCase().replace(/[,.']/g, '').replace(/\s+/g, '-');
  return `assets/commanders/${slug}.jpg`;
}

function cardArtSlug(name) {
  return name.toLowerCase().replace(/[,.']/g, '').replace(/\s+/g, '-');
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
    return cardFaction !== 'neutral';
  }
  if (cmdFaction === 'neutral') {
    // Other neutral commanders: neutral cards only
    return cardFaction === 'neutral';
  }
  // Faction commander: own faction + neutral
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
  const total = minions + spells || 1;
  const mPct = Math.round(minions / total * 100);
  const sPct = 100 - mPct;
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
  const preview = document.getElementById('card-preview');
  const img = document.getElementById('card-preview-img');

  document.addEventListener('mouseover', e => {
    const row = e.target.closest('.deck-card-row');
    if (!row) { preview.classList.remove('visible'); return; }
    const slug = cardArtSlug(row.dataset.card || '');
    img.src = `assets/cards/${slug}.jpg`;
    img.onerror = () => { preview.classList.remove('visible'); };
    preview.classList.add('visible');
  });

  document.addEventListener('mousemove', e => {
    if (!preview.classList.contains('visible')) return;
    const x = e.clientX + 24;
    const flip = x + 220 > window.innerWidth;
    preview.style.left = flip ? `${e.clientX - 224}px` : `${x}px`;
    preview.style.top = `${Math.max(8, e.clientY - 120)}px`;
  });

  document.addEventListener('mouseout', e => {
    if (!e.target.closest('.deck-card-row')) {
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
    // Only show cards tracked in cards.json — filters tokens, placeholders, etc.
    if (!cardInfoMap[c.name]) return false;
    if (!selectedCommander) return true; // no commander: show all playable cards

    const cf = (cardInfoMap[c.name]?.faction || '').toLowerCase();
    if (selectedCommander === LAZIM_NAME) return cf !== 'neutral';
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
        <img class="card-tile-art" src="assets/cards/${slug}.jpg" alt="" onerror="this.style.visibility='hidden'">
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
    const tile     = e.target.closest('.card-tile');
    if (plusBtn && !plusBtn.disabled) {
      addCardToBuild(plusBtn.dataset.name);
    } else if (minusBtn && !minusBtn.disabled) {
      removeOneFromBuild(minusBtn.dataset.name);
    } else if (tile && !e.target.closest('.card-tile-btn')) {
      // Click on tile body: add if not at max
      const name = tile.dataset.name;
      const count = currentDeck ? (currentDeck.cards.find(x => x.name === name)?.count || 0) : 0;
      if (count < 3) addCardToBuild(name);
    }
  };
}

// ─── Render Deck ───────────────────────────────────────────

function renderDeck(deck) {
  currentDeck = deck;

  document.getElementById('deck-sidebar').classList.remove('hidden');
  document.getElementById('deck-card-list').classList.remove('hidden');
  document.getElementById('deck-empty-state').classList.add('hidden');

  // Commander portrait
  const artEl = document.getElementById('deck-commander-art');
  artEl.style.display = '';
  artEl.src = commanderArtPath(deck.commander || '');
  artEl.alt = deck.commander || '';
  artEl.onerror = () => { artEl.style.display = 'none'; };

  // Deck name + commander label + faction badge
  document.getElementById('deck-name').textContent = deck.deckName || 'Unnamed Deck';
  document.getElementById('deck-commander').textContent = deck.commander || '—';
  const cmdData = commanderMap[deck.commander];
  const faction = cmdData ? (cmdData.faction || 'Neutral') : 'Neutral';
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

  // Card list grouped by cost
  const listEl = document.getElementById('deck-card-list');
  const sorted = [...deck.cards].sort((a, b) => {
    const ca = parseInt((cardInfoMap[a.name] || {}).cost) || 0;
    const cb = parseInt((cardInfoMap[b.name] || {}).cost) || 0;
    if (ca !== cb) return ca - cb;
    return a.name.localeCompare(b.name);
  });

  const groups = {};
  sorted.forEach(c => {
    const cost = parseInt((cardInfoMap[c.name] || {}).cost) || 0;
    if (!groups[cost]) groups[cost] = [];
    groups[cost].push(c);
  });

  let html = '';
  for (const cost of Object.keys(groups).sort((a, b) => a - b)) {
    const cards = groups[cost];
    html += `<div class="deck-cost-group">`;
    html += `<div class="deck-cost-group-label">${cost} Cost (${cards.reduce((s, c) => s + c.count, 0)} cards)</div>`;
    cards.forEach(c => {
      const info = cardInfoMap[c.name] || {};
      const fc = factionColor(info.faction);
      const fLabel = (info.faction || 'neutral').toUpperCase();
      const typeLabel = (info.type || '').toUpperCase();
      const isBuild = currentMode === 'build';
      const compatible = isCardCompatible(c.name, deck.commander);
      html += `
        <div class="deck-card-row${compatible ? '' : ' incompatible'}" data-card="${c.name}">
          <div class="deck-card-cost">${info.cost != null ? info.cost : '?'}</div>
          <span class="deck-card-name">${c.name}</span>
          ${typeLabel ? `<span class="deck-card-type">${typeLabel}</span>` : ''}
          <span class="deck-card-faction" style="color:${fc};border:1px solid ${fc}40">${fLabel}</span>
          <span class="deck-card-count">${isBuild ? `<button class="deck-count-btn" data-card="${c.name}">&times;${c.count}</button>` : `&times;${c.count}`}</span>
          ${isBuild ? `<button class="deck-card-remove" data-card="${c.name}">&times;</button>` : ''}
        </div>`;
    });
    html += `</div>`;
  }
  listEl.innerHTML = html;

  const buildNote = document.getElementById('build-note');
  if (currentMode === 'build') {
    buildNote.classList.remove('hidden');
    wireCardButtons();
    // Refresh card browser counts
    const searchInput = document.getElementById('build-card-input');
    renderCardBrowser(searchInput?.value.trim().toLowerCase() || '');
  } else {
    buildNote.classList.add('hidden');
  }
}

// ─── Build Mode: Deck List Buttons ─────────────────────────

function wireCardButtons() {
  document.querySelectorAll('.deck-card-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      currentDeck.cards = currentDeck.cards.filter(c => c.name !== btn.dataset.card);
      renderDeck(currentDeck);
    });
  });

  document.querySelectorAll('.deck-count-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = currentDeck.cards.find(c => c.name === btn.dataset.card);
      if (card) {
        card.count = (card.count % 3) + 1;
        renderDeck(currentDeck);
      }
    });
  });
}

// ─── Import (Decode) ───────────────────────────────────────

function handleDecode() {
  const input = document.getElementById('deck-code-input');
  document.getElementById('deck-error').classList.add('hidden');
  const code = input.value.trim();
  if (!code) { showError('Please paste a deck code.'); return; }
  try {
    const deck = decodeDeckCode(code);
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
    text = 'Showing all non-neutral faction cards';
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

function ensureBuildDeck() {
  if (!currentDeck || currentMode !== 'build') {
    currentDeck = {
      commander: document.getElementById('build-commander').value || '',
      deckName: document.getElementById('build-name').value || 'My Deck',
      cards: [],
    };
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

function handleCopyUrl() {
  if (!currentDeck) return;
  try {
    const code = encodeDeckCode(currentDeck);
    const url = `${window.location.origin}${window.location.pathname}?code=${encodeURIComponent(code)}`;
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
          if (ni && currentDeck.deckName) ni.value = currentDeck.deckName;
        }

        ensureBuildDeck();
        if (currentDeck && (currentDeck.commander || currentDeck.cards.length > 0)) {
          renderDeck(currentDeck);
        }
        const searchInput = document.getElementById('build-card-input');
        renderCardBrowser(searchInput?.value.trim().toLowerCase() || '');
      }
    });
  });
}

// ─── Errors ────────────────────────────────────────────────

function showError(msg) {
  const el = document.getElementById('deck-error');
  el.textContent = msg;
  el.classList.remove('hidden', 'success');
}

// ─── Init ──────────────────────────────────────────────────

async function init() {
  await loadCardlist();

  const decksLink = document.querySelector('.nav-link[data-nav="decks"]');
  if (decksLink) decksLink.classList.add('active');

  initTabs();
  initBuildMode();
  initCardPreview();

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
      renderDeck(deck);
    } catch (e) {
      showError(`Failed to decode URL deck code: ${e.message}`);
    }
  }
}

document.addEventListener('DOMContentLoaded', init);
