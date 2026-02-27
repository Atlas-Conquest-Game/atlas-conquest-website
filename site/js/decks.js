/**
 * Atlas Conquest — Deck Tools Page
 *
 * Import (decode) and build (encode) deck codes.
 */

let cardlistData = null;
let cardsData = null;  // card_stats for metadata (cost, type, faction)
let cardInfoMap = {};  // name → {cost, type, faction}
let commanderList = []; // names of commanders from cardlist
let currentDeck = null; // {commander, deckName, cards: [{name, count}]}
let currentMode = 'import';

// ─── Data Loading ──────────────────────────────────────────

async function loadCardlist() {
  const resp = await fetch('data/cardlist.json');
  cardlistData = await resp.json();
  initDeckCodec(cardlistData);

  // Identify commanders (they appear in the card list but also in legacy names)
  const knownCommanders = new Set();
  const resp2 = await fetch('data/commanders.json');
  const commanders = await resp2.json();
  commanders.forEach(c => knownCommanders.add(c.name));
  commanderList = [...knownCommanders].sort();

  // Load card metadata for display
  const resp3 = await fetch('data/cards.json');
  const cards = await resp3.json();
  cards.forEach(c => {
    cardInfoMap[c.name] = {
      cost: c.cost != null ? c.cost : '?',
      type: c.type || '',
      faction: c.faction || 'neutral',
    };
  });
  // Also map from cardlist names that might not be in cards.json
  cardsData = cards;
}

// ─── Commander Art Path ────────────────────────────────────

function commanderArtPath(name) {
  // Commander art lives in assets/commanders/<name>.jpg
  return `assets/commanders/${name}.jpg`;
}

// ─── Faction Badge ─────────────────────────────────────────

function factionColor(faction) {
  const colors = {
    skaal: '#D55E00', grenalia: '#009E73', lucia: '#E8B630',
    neutral: '#A89078', shadis: '#7B7B8E', archaeon: '#0072B2',
  };
  return colors[(faction || '').toLowerCase()] || '#A89078';
}

// ─── Render Deck ───────────────────────────────────────────

function renderDeck(deck) {
  currentDeck = deck;
  const display = document.getElementById('deck-display');
  display.classList.remove('hidden');

  // Header
  document.getElementById('deck-name').textContent = deck.deckName || 'Unnamed Deck';
  document.getElementById('deck-commander').textContent = deck.commander;
  const artEl = document.getElementById('deck-commander-art');
  artEl.src = commanderArtPath(deck.commander);
  artEl.alt = deck.commander;
  artEl.onerror = () => { artEl.style.display = 'none'; };

  // Stats
  const totalCards = deck.cards.reduce((s, c) => s + c.count, 0);
  const uniqueCards = deck.cards.length;
  let totalCost = 0, costCount = 0, minions = 0, spells = 0;
  deck.cards.forEach(c => {
    const info = cardInfoMap[c.name];
    if (info) {
      const cost = parseInt(info.cost);
      if (!isNaN(cost)) { totalCost += cost * c.count; costCount += c.count; }
      const t = (info.type || '').toLowerCase();
      if (t === 'minion') minions += c.count;
      else if (t === 'spell') spells += c.count;
    }
  });
  document.getElementById('stat-total-cards').textContent = totalCards;
  document.getElementById('stat-unique-cards').textContent = uniqueCards;
  document.getElementById('stat-avg-cost').textContent = costCount > 0 ? (totalCost / costCount).toFixed(1) : '?';
  document.getElementById('stat-minion-count').textContent = minions;
  document.getElementById('stat-spell-count').textContent = spells;

  // Card list grouped by cost
  const listEl = document.getElementById('deck-card-list');
  const sorted = [...deck.cards].sort((a, b) => {
    const ca = parseInt((cardInfoMap[a.name] || {}).cost) || 0;
    const cb = parseInt((cardInfoMap[b.name] || {}).cost) || 0;
    if (ca !== cb) return ca - cb;
    return a.name.localeCompare(b.name);
  });

  // Group by cost
  const groups = {};
  sorted.forEach(c => {
    const cost = parseInt((cardInfoMap[c.name] || {}).cost) || 0;
    const key = cost;
    if (!groups[key]) groups[key] = [];
    groups[key].push(c);
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
      const isBuild = currentMode === 'build';
      html += `
        <div class="deck-card-row" data-card="${c.name}">
          <div class="deck-card-cost">${info.cost != null ? info.cost : '?'}</div>
          <span class="deck-card-name">${c.name}</span>
          <span class="deck-card-faction" style="color:${fc};border:1px solid ${fc}40">${fLabel}</span>
          <span class="deck-card-count">${isBuild ? `<button class="deck-count-btn" data-card="${c.name}">&times;${c.count}</button>` : `&times;${c.count}`}</span>
          ${isBuild ? `<button class="deck-card-remove" data-card="${c.name}">&times;</button>` : ''}
        </div>`;
    });
    html += `</div>`;
  }
  listEl.innerHTML = html;

  // Build mode: show note and wire remove/count buttons
  const buildNote = document.getElementById('build-note');
  if (currentMode === 'build') {
    buildNote.classList.remove('hidden');
    wireCardButtons();
  } else {
    buildNote.classList.add('hidden');
  }
}

// ─── Build Mode: Card Buttons ──────────────────────────────

function wireCardButtons() {
  document.querySelectorAll('.deck-card-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.card;
      currentDeck.cards = currentDeck.cards.filter(c => c.name !== name);
      renderDeck(currentDeck);
    });
  });

  document.querySelectorAll('.deck-count-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.card;
      const card = currentDeck.cards.find(c => c.name === name);
      if (card) {
        card.count = (card.count % 3) + 1; // Cycle 1→2→3→1
        renderDeck(currentDeck);
      }
    });
  });
}

// ─── Import (Decode) ───────────────────────────────────────

function handleDecode() {
  const input = document.getElementById('deck-code-input');
  const errorEl = document.getElementById('deck-error');
  errorEl.classList.add('hidden');

  const code = input.value.trim();
  if (!code) {
    showError('Please paste a deck code.');
    return;
  }

  try {
    const deck = decodeDeckCode(code);
    renderDeck(deck);
  } catch (e) {
    showError(`Failed to decode: ${e.message}`);
  }
}

// ─── Build Mode ────────────────────────────────────────────

function initBuildMode() {
  const select = document.getElementById('build-commander');
  select.innerHTML = '<option value="">Select a commander...</option>' +
    commanderList.map(c => `<option value="${c}">${c}</option>`).join('');

  // Commander select → start/update deck
  select.addEventListener('change', () => {
    ensureBuildDeck();
    currentDeck.commander = select.value;
    if (currentDeck.commander) renderDeck(currentDeck);
  });

  // Deck name input
  document.getElementById('build-name').addEventListener('input', (e) => {
    ensureBuildDeck();
    currentDeck.deckName = e.target.value;
    const nameEl = document.getElementById('deck-name');
    if (nameEl) nameEl.textContent = currentDeck.deckName || 'Unnamed Deck';
  });

  // Card search with autocomplete
  const searchInput = document.getElementById('build-card-input');
  const suggestionsEl = document.getElementById('build-suggestions');
  let debounceTimer;

  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const q = searchInput.value.trim().toLowerCase();
      if (q.length < 1) {
        suggestionsEl.classList.add('hidden');
        return;
      }

      // Filter cards (non-commanders)
      const commanderSet = new Set(commanderList);
      const matches = cardlistData.cards
        .filter(c => !commanderSet.has(c.name) && c.name.toLowerCase().includes(q))
        .slice(0, 12);

      if (matches.length === 0) {
        suggestionsEl.classList.add('hidden');
        return;
      }

      suggestionsEl.innerHTML = matches.map(c => {
        const info = cardInfoMap[c.name] || {};
        const f = (info.faction || '').toUpperCase();
        return `<div class="build-suggestion" data-name="${c.name}">
          <span>${c.name}</span>
          <span class="build-suggestion-faction">${f}</span>
        </div>`;
      }).join('');
      suggestionsEl.classList.remove('hidden');

      // Wire click
      suggestionsEl.querySelectorAll('.build-suggestion').forEach(el => {
        el.addEventListener('click', () => {
          addCardToBuild(el.dataset.name);
          searchInput.value = '';
          suggestionsEl.classList.add('hidden');
        });
      });
    }, 150);
  });

  // Close suggestions on click outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.build-card-search')) {
      suggestionsEl.classList.add('hidden');
    }
  });
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
    if (existing.count < 3) existing.count++;
  } else {
    currentDeck.cards.push({ name, count: 1 });
  }
  if (currentDeck.commander) renderDeck(currentDeck);
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
  setTimeout(() => {
    btn.textContent = original;
    btn.classList.remove('copied');
  }, 1500);
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

      // Reset display when switching modes
      if (currentMode === 'build') {
        ensureBuildDeck();
        if (currentDeck.commander) renderDeck(currentDeck);
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

  initTabs();
  initBuildMode();

  // Wire buttons
  document.getElementById('btn-decode').addEventListener('click', handleDecode);
  document.getElementById('deck-code-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleDecode();
  });
  document.getElementById('btn-copy-code').addEventListener('click', handleCopyCode);
  document.getElementById('btn-copy-url').addEventListener('click', handleCopyUrl);

  // Check URL for deck code
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
