/**
 * Atlas Conquest — Deck Tools Page
 *
 * Import (decode) and build (encode) deck codes.
 */

let cardlistData = null;
let cardsData = null;  // card_stats for metadata (cost, type, faction)
let cardInfoMap = {};  // name → {cost, type, faction}
let commanderList = []; // names of commanders from cardlist
let commanderMap = {};  // name → commander data (faction, art, etc.)
let currentDeck = null; // {commander, deckName, cards: [{name, count}]}
let currentMode = 'import';
let buildSortMode = 'cost'; // 'cost' | 'name'

const FACTION_COLORS = {
  skaal: '#D55E00', grenalia: '#009E73', lucia: '#E8B630',
  neutral: '#A89078', shadis: '#7B7B8E', archaeon: '#0072B2',
};

const MINION_COLOR = 'var(--lucia)';  // gold — replaces Skaal orange
const SPELL_COLOR  = '#7C9EFF';       // periwinkle — replaces Archaeon dark blue

// ─── Data Loading ──────────────────────────────────────────

async function loadCardlist() {
  const resp = await fetch('data/cardlist.json');
  cardlistData = await resp.json();
  initDeckCodec(cardlistData);

  // Identify commanders (they appear in the card list but also in legacy names)
  const knownCommanders = new Set();
  const resp2 = await fetch('data/commanders.json');
  const commanders = await resp2.json();
  commanders.forEach(c => {
    knownCommanders.add(c.name);
    commanderMap[c.name] = c;
  });
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
  cardsData = cards;
}

// ─── Commander Art Path ────────────────────────────────────

function commanderArtPath(name) {
  const slug = name.toLowerCase().replace(/[,.']/g, '').replace(/\s+/g, '-');
  return `assets/commanders/${slug}.jpg`;
}

// ─── Card Art Slug ─────────────────────────────────────────

function cardArtSlug(name) {
  return name.toLowerCase().replace(/[,.']/g, '').replace(/\s+/g, '-');
}

// ─── Faction Helpers ───────────────────────────────────────

function factionColor(faction) {
  return FACTION_COLORS[(faction || '').toLowerCase()] || FACTION_COLORS.neutral;
}

function factionBadge(faction) {
  const f = (faction || 'neutral').toLowerCase();
  const c = FACTION_COLORS[f] || FACTION_COLORS.neutral;
  return `<span class="faction-badge" style="color:${c};background:${c}1a;padding:2px 7px;border-radius:4px;font-size:0.65rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">${f}</span>`;
}

// ─── Mana Curve (stacked: spell on top, minion on bottom) ──

function renderManaCurve(deck) {
  const minionBuckets = new Array(8).fill(0); // 0–6, then 7+
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
    const count = totals[i] || '';
    return `<div class="mana-bar-col">
      <div class="mana-bar-count">${count}</div>
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

// ─── Render Deck ───────────────────────────────────────────

function renderDeck(deck) {
  currentDeck = deck;

  // Reveal sidebar + card list, hide empty state
  document.getElementById('deck-sidebar').classList.remove('hidden');
  document.getElementById('deck-card-list').classList.remove('hidden');
  document.getElementById('deck-empty-state').classList.add('hidden');

  // Commander portrait
  const artEl = document.getElementById('deck-commander-art');
  artEl.style.display = '';
  artEl.src = commanderArtPath(deck.commander);
  artEl.alt = deck.commander;
  artEl.onerror = () => { artEl.style.display = 'none'; };

  // Deck name + commander label + faction badge
  document.getElementById('deck-name').textContent = deck.deckName || 'Unnamed Deck';
  document.getElementById('deck-commander').textContent = deck.commander;
  const cmdData = commanderMap[deck.commander];
  const faction = cmdData ? (cmdData.faction || 'Neutral') : 'Neutral';
  document.getElementById('deck-commander-faction').innerHTML = factionBadge(faction);

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

  // Mana curve + type breakdown
  renderManaCurve(deck);
  renderTypeBreakdown(deck);

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
      html += `
        <div class="deck-card-row" data-card="${c.name}">
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

// ─── Build Mode: Card Suggestions ─────────────────────────

function getFactionFilteredCards() {
  const selectedCommander = document.getElementById('build-commander').value;
  const cmdData = commanderMap[selectedCommander];
  const cmdFaction = cmdData ? (cmdData.faction || '').toLowerCase() : null;
  const isNeutralCmd = cmdFaction === 'neutral' || !cmdFaction;
  const commanderSet = new Set(commanderList);

  return cardlistData.cards.filter(c => {
    if (commanderSet.has(c.name)) return false;
    if (!isNeutralCmd) {
      const cardFaction = (cardInfoMap[c.name]?.faction || '').toLowerCase();
      if (cardFaction !== 'neutral' && cardFaction !== cmdFaction) return false;
    }
    return true;
  });
}

function showCardSuggestions(q) {
  const suggestionsEl = document.getElementById('build-suggestions');
  const selectedCommander = document.getElementById('build-commander').value;

  if (!selectedCommander) {
    suggestionsEl.classList.add('hidden');
    return;
  }

  const allFiltered = getFactionFilteredCards();

  let matches;
  if (!q) {
    // Browse mode: show all faction-filtered cards up to 30
    matches = [...allFiltered];
  } else {
    matches = allFiltered.filter(c => c.name.toLowerCase().includes(q));
  }

  // Sort
  matches.sort((a, b) => {
    if (buildSortMode === 'name') return a.name.localeCompare(b.name);
    // cost sort (ascending), then name
    const ca = parseInt((cardInfoMap[a.name] || {}).cost) || 0;
    const cb = parseInt((cardInfoMap[b.name] || {}).cost) || 0;
    if (ca !== cb) return ca - cb;
    return a.name.localeCompare(b.name);
  });

  const limit = q ? 12 : 30;
  matches = matches.slice(0, limit);

  if (matches.length === 0) {
    suggestionsEl.classList.add('hidden');
    return;
  }

  // Sort controls header
  const sortHTML = `<div class="build-sort-controls">
    <span class="build-sort-label">Sort:</span>
    <button class="build-sort-btn ${buildSortMode === 'cost' ? 'active' : ''}" data-sort="cost">Cost</button>
    <button class="build-sort-btn ${buildSortMode === 'name' ? 'active' : ''}" data-sort="name">Name</button>
  </div>`;

  const cardHTML = matches.map(c => {
    const info = cardInfoMap[c.name] || {};
    const cost = info.cost != null ? info.cost : '?';
    const type = info.type || '';
    const faction = (info.faction || '').toUpperCase();
    const meta = [type, faction].filter(Boolean).join(' · ');
    const slug = cardArtSlug(c.name);
    return `<div class="build-suggestion" data-name="${c.name}">
      <img class="build-suggestion-img" src="assets/cards/${slug}.jpg" alt="" onerror="this.style.visibility='hidden'">
      <div class="build-suggestion-info">
        <div class="build-suggestion-name">[${cost}] ${c.name}</div>
        <div class="build-suggestion-faction">${meta}</div>
      </div>
    </div>`;
  }).join('');

  suggestionsEl.innerHTML = sortHTML + cardHTML;
  suggestionsEl.classList.remove('hidden');

  // Wire sort buttons
  suggestionsEl.querySelectorAll('.build-sort-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      buildSortMode = btn.dataset.sort;
      const searchInput = document.getElementById('build-card-input');
      showCardSuggestions(searchInput.value.trim().toLowerCase());
    });
  });

  // Wire card clicks
  suggestionsEl.querySelectorAll('.build-suggestion').forEach(el => {
    el.addEventListener('click', () => {
      addCardToBuild(el.dataset.name);
      const searchInput = document.getElementById('build-card-input');
      searchInput.value = '';
      suggestionsEl.classList.add('hidden');
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

function updateFilterHint(commanderName) {
  const hintEl = document.getElementById('build-filter-hint');
  if (!hintEl) return;
  const cmdData = commanderMap[commanderName];
  if (!cmdData || !commanderName) {
    hintEl.classList.add('hidden');
    return;
  }
  const faction = cmdData.faction || 'Neutral';
  const isNeutral = faction.toLowerCase() === 'neutral';
  hintEl.textContent = isNeutral
    ? 'Showing all factions (neutral commander)'
    : `Showing ${faction} + Neutral cards`;
  hintEl.classList.remove('hidden');
}

function initBuildMode() {
  const select = document.getElementById('build-commander');
  select.innerHTML = '<option value="">Select a commander...</option>' +
    commanderList.map(c => `<option value="${c}">${c}</option>`).join('');

  // Commander select → start/update deck
  select.addEventListener('change', () => {
    ensureBuildDeck();
    currentDeck.commander = select.value;
    updateFilterHint(select.value);
    if (currentDeck.commander) renderDeck(currentDeck);
    // Refresh suggestions if dropdown is open
    const searchInput = document.getElementById('build-card-input');
    const suggestionsEl = document.getElementById('build-suggestions');
    if (!suggestionsEl.classList.contains('hidden')) {
      showCardSuggestions(searchInput.value.trim().toLowerCase());
    }
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

  searchInput.addEventListener('focus', () => {
    showCardSuggestions(searchInput.value.trim().toLowerCase());
  });

  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      showCardSuggestions(searchInput.value.trim().toLowerCase());
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

      if (currentMode === 'build') {
        // Auto-populate commander + deck name from any imported deck
        if (currentDeck && currentDeck.commander) {
          const sel = document.getElementById('build-commander');
          if (!sel.value) {
            sel.value = currentDeck.commander;
            updateFilterHint(currentDeck.commander);
            const ni = document.getElementById('build-name');
            if (ni && currentDeck.deckName) ni.value = currentDeck.deckName;
          }
        }
        ensureBuildDeck();
        if (currentDeck && currentDeck.commander) renderDeck(currentDeck);
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

  // Highlight active nav link
  const decksLink = document.querySelector('.nav-link[data-nav="decks"]');
  if (decksLink) decksLink.classList.add('active');

  initTabs();
  initBuildMode();
  initCardPreview();

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
