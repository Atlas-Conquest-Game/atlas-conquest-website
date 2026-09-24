/**
 * Atlas Conquest Analytics — Cards Page
 *
 * Full card table with search, faction filter, and sorting.
 * All 261 cards visible (no row cap).
 *
 * Columns are defined once in CARD_COLUMNS and the header/rows are rendered
 * from whichever ones the viewer has switched on (Columns menu, remembered in
 * localStorage). Two optional groups are off by default and their data is only
 * fetched once one of their columns is shown:
 *   mulligan — opening-hand keep rates and keep/return winrates
 *   feedback — post-match "did you have fun?" ratios in games the card was played
 */

// ─── Page State ─────────────────────────────────────────────

let cardSortKey = 'drawn_winrate';
let cardSortDir = 'desc';
let currentFaction = 'all';
let currentCommander = 'all';
let searchQuery = '';
// Tokens (Zombie, Lucian Soldier, …) are generated cards: they have real draw
// and play stats but no deck can contain one, so they'd skew a scan of the
// table. Hidden until asked for — see the "Show tokens" checkbox.
let showTokens = false;

// ─── Column Definitions ─────────────────────────────────────

const NA = '<span class="winrate-neutral">--</span>';
// Fewest post-match ratings before a feedback ratio is shown instead of `--`.
const FEEDBACK_MIN = 5;

// Each column:
//   key      sort key, also the id stored in the visible-columns preference
//   group    'card' or 'mulligan' — grouping in the Columns menu
//   value    row -> sort value
//   na       row -> true when the cell renders `--`. Keeps sort order in sync
//            with what the user sees: NA rows always sink to the bottom.
//   render   (row, ctx) -> cell HTML
//   locked   always shown (the name column anchors the row and the hover preview)
//   deemph   de-emphasized styling
//   string   sort alphabetically (ascending first)
//
// Mulligan fields live under row.mull (null when the card was never seen in an
// opening hand) and feedback fields under row.fb (null when no rated game had the
// card played), since each comes from a separate data file.
const CARD_COLUMNS = [
  {
    key: 'name', label: 'Card', group: 'card', locked: true, string: true,
    value: c => c.name,
    render: c => `<strong${c.token ? ' class="card-name-token" title="Token — generated in play, not deck-buildable"' : ''}>${c.name}</strong>`,
  },
  {
    key: 'faction', label: 'Faction', group: 'card', string: true,
    value: c => c.faction,
    render: c => factionBadge(c.faction),
  },
  {
    key: 'type', label: 'Type', group: 'card', string: true,
    value: c => c.type,
    render: c => c.type || '--',
  },
  {
    key: 'deck_rate', label: 'Included', group: 'card',
    tooltip: '% of decks that include this card. Sub-line shows deck count of total games.',
    value: c => c.deck_rate,
    render: (c, ctx) => `${pctCell(c.deck_rate || 0)}<div class="cell-sub">${c.deck_count || 0} of ${ctx.totalGames}</div>`,
  },
  {
    key: 'drawn_winrate', label: 'Drawn WR', group: 'card',
    tooltip: 'Win rate when this card is drawn. Sub-line shows sample size.',
    value: c => c.drawn_winrate,
    na: c => (c.drawn_count || 0) < 5,
    render: c => `${winrateCell(c.drawn_winrate, c.drawn_count || 0)}<div class="cell-sub">${c.drawn_count || 0} games</div>`,
  },
  {
    key: 'played_winrate', label: 'Played WR', group: 'card',
    tooltip: 'Win rate when this card is played. Sub-line shows sample size.',
    value: c => c.played_winrate,
    na: c => (c.played_count || 0) < 5,
    render: c => `${winrateCell(c.played_winrate, c.played_count || 0)}<div class="cell-sub">${c.played_count || 0} games</div>`,
  },
  {
    key: 'drawn_rate', label: 'Drawn Rate', group: 'card', deemph: true,
    tooltip: '% of games where this card was drawn. Sub-line shows game count of total.',
    value: c => c.drawn_rate,
    render: (c, ctx) => `${pctCell(c.drawn_rate)}<div class="cell-sub">${c.drawn_count || 0} of ${ctx.totalGames}</div>`,
  },
  {
    key: 'played_rate', label: 'Played Rate', group: 'card', deemph: true,
    tooltip: '% of games where this card was played. Sub-line shows game count of total.',
    value: c => c.played_rate,
    render: (c, ctx) => `${pctCell(c.played_rate)}<div class="cell-sub">${c.played_count || 0} of ${ctx.totalGames}</div>`,
  },
  {
    key: 'avg_copies', label: 'Avg Copies', group: 'card',
    tooltip: 'Average number of copies of this card per deck that includes it. Max 3.',
    value: c => c.avg_copies,
    render: c => (c.avg_copies || 0).toFixed(1),
  },

  // Mulligan — sample gates match the former Mulligan page.
  {
    key: 'keep_rate', label: 'Keep Rate', group: 'mulligan',
    tooltip: '% of times this card was kept (vs returned) when seen in the opening hand. Count-weighted for duplicates.',
    value: c => c.mull && c.mull.keep_rate,
    na: c => mullSeen(c) < 5,
    render: c => `${mullSeen(c) >= 5 ? pctCell(c.mull.keep_rate) : NA}<div class="cell-sub">${mullSeen(c)} seen</div>`,
  },
  {
    key: 'norm_keep_delta', label: 'Keep Pref', group: 'mulligan',
    tooltip: 'Normalized keep preference: actual keep rate minus expected keep rate. Expected rate accounts for commander intellect and turn order (first player keeps 3, second keeps 4). Positive = actively preferred over alternatives.',
    value: c => c.mull && c.mull.norm_keep_delta,
    na: c => mullSeen(c) < 30,
    render: c => mullSeen(c) >= 5 ? normKeepDeltaCell(c.mull.norm_keep_delta) : `${NA}<div class="cell-sub">low sample</div>`,
  },
  {
    key: 'keep_winrate', label: 'Keep WR', group: 'mulligan',
    tooltip: 'Win rate in games where this card was kept in the opening hand.',
    value: c => c.mull && c.mull.keep_winrate,
    na: c => mullCount(c, 'kept_count') < 5,
    render: c => `${c.mull ? winrateCell(c.mull.keep_winrate, mullCount(c, 'kept_count')) : NA}<div class="cell-sub">${mullCount(c, 'kept_count')} kept</div>`,
  },
  {
    key: 'return_winrate', label: 'Return WR', group: 'mulligan',
    tooltip: 'Win rate in games where this card was returned/mulliganed.',
    value: c => c.mull && c.mull.return_winrate,
    na: c => mullCount(c, 'returned_count') < 5,
    render: c => `${c.mull ? winrateCell(c.mull.return_winrate, mullCount(c, 'returned_count')) : NA}<div class="cell-sub">${mullCount(c, 'returned_count')} returned</div>`,
  },
  {
    key: 'winrate_delta', label: 'Keep WR Delta', group: 'mulligan',
    tooltip: "Keep WR minus Return WR. Positive = keeping this card correlates with winning. Cards with < 30 observations show '--'.",
    value: c => c.mull && c.mull.winrate_delta,
    na: c => mullSeen(c) < 30,
    render: c => {
      const seen = mullSeen(c);
      return `${seen >= 5 ? winrateDeltaCell(c.mull.winrate_delta) : NA}<div class="cell-sub">${seen < 5 ? 'low sample' : seen + ' seen'}</div>`;
    },
  },
  {
    key: 'kept_count', label: 'Kept', group: 'mulligan',
    tooltip: 'Number of times this card was kept in the opening hand (count-weighted).',
    value: c => mullCount(c, 'kept_count'),
    render: c => mullCount(c, 'kept_count'),
  },
  {
    key: 'returned_count', label: 'Returned', group: 'mulligan',
    tooltip: 'Number of times this card was returned/mulliganed (count-weighted).',
    value: c => mullCount(c, 'returned_count'),
    render: c => mullCount(c, 'returned_count'),
  },
  {
    key: 'total_seen', label: 'Times Seen', group: 'mulligan',
    tooltip: 'Total times this card appeared in an opening hand (kept + returned).',
    value: c => mullSeen(c),
    render: c => mullSeen(c),
  },

  // Feedback — one column per scope × sentiment. Scopes:
  //   any    rated games where either player played the card
  //   played the rating of the player who played it
  //   opp    the rating of the player whose opponent played it
  ...feedbackColumns('any', 'Positive', 'Negative',
    'post-match ratings in games where either player played this card'),
  ...feedbackColumns('played', 'Positive (Played)', 'Negative (Played)',
    'post-match ratings from the player who played this card'),
  ...feedbackColumns('opp', 'Positive (Opp)', 'Negative (Opp)',
    'post-match ratings from the player whose opponent played this card'),
];

function feedbackColumns(scope, posLabel, negLabel, what) {
  const count = c => (c.fb && c.fb[`${scope}_ratings`]) || 0;
  const rate = (c, sentiment) => c.fb && c.fb[`${scope}_${sentiment}_rate`];
  const column = (sentiment, label, word) => ({
    key: `fb_${scope}_${sentiment}`, label, group: 'feedback',
    tooltip: `% of ${what} that were ${word}. Sub-line shows the number of ratings; fewer than ${FEEDBACK_MIN} show '--'. Colored against the site-wide positive rate for the selected period and map.`,
    value: c => rate(c, sentiment),
    na: c => count(c) < FEEDBACK_MIN,
    render: (c, ctx) => `${feedbackCell(rate(c, sentiment), count(c), ctx.fbBaseline, sentiment)}<div class="cell-sub">${count(c)} ratings</div>`,
  });
  return [
    column('pos', posLabel, 'positive ("fun")'),
    column('neg', negLabel, 'negative ("not fun")'),
  ];
}

const COLUMN_GROUPS = [
  { key: 'card', label: 'Card stats' },
  { key: 'mulligan', label: 'Mulligan' },
  { key: 'feedback', label: 'Feedback' },
];

const DEFAULT_VISIBLE = CARD_COLUMNS.filter(col => col.group === 'card').map(col => col.key);
const COLUMNS_STORAGE_KEY = 'cards.visibleColumns';

function mullCount(c, field) {
  return (c.mull && c.mull[field]) || 0;
}

function mullSeen(c) {
  return mullCount(c, 'total_seen');
}

// A feedback ratio is only interesting relative to how much fun games are in
// general, so color by distance from the site-wide positive rate (baseline):
// > 5pp more fun than baseline is green, > 5pp less is red.
function feedbackCell(rate, count, baseline, sentiment) {
  if (rate == null || count < FEEDBACK_MIN) return NA;
  let cls = 'winrate-neutral';
  if (baseline != null) {
    const posRate = sentiment === 'pos' ? rate : 1 - rate;
    if (posRate > baseline + 0.05) cls = 'winrate-positive';
    else if (posRate < baseline - 0.05) cls = 'winrate-negative';
  }
  return `<span class="${cls}">${pctCell(rate)}</span>`;
}

// ─── Column Visibility ──────────────────────────────────────

let visibleColumns = loadVisibleColumns();

function loadVisibleColumns() {
  try {
    const saved = JSON.parse(localStorage.getItem(COLUMNS_STORAGE_KEY));
    if (Array.isArray(saved)) {
      const keys = new Set(saved.filter(k => CARD_COLUMNS.some(col => col.key === k)));
      CARD_COLUMNS.forEach(col => { if (col.locked) keys.add(col.key); });
      return keys;
    }
  } catch { /* storage unavailable or corrupt — fall through to defaults */ }
  return new Set(DEFAULT_VISIBLE);
}

function saveVisibleColumns() {
  try {
    localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify([...visibleColumns]));
  } catch { /* storage unavailable — preference lasts for this visit only */ }
}

function shownColumns() {
  return CARD_COLUMNS.filter(col => visibleColumns.has(col.key));
}

function groupShown(group) {
  return CARD_COLUMNS.some(col => col.group === group && visibleColumns.has(col.key));
}

async function setColumnsVisible(keys, visible) {
  keys.forEach(k => {
    const col = CARD_COLUMNS.find(c => c.key === k);
    if (!col || col.locked) return;
    if (visible) visibleColumns.add(k);
    else visibleColumns.delete(k);
  });
  // Sorting by a column you can't see is confusing — fall back to name.
  if (!visibleColumns.has(cardSortKey)) {
    cardSortKey = 'name';
    cardSortDir = 'asc';
  }
  saveVisibleColumns();
  syncColumnControls();
  await ensureOptionalData();
  rerenderCardTable();
}

// ─── Optional Group Data ────────────────────────────────────

// mulligan_stats.json is ~1.4 MB and commander_mulligan_stats.json ~5 MB, so
// none of the optional files is fetched until one of its columns is on screen.
async function ensureOptionalData() {
  const loads = [];
  if (groupShown('mulligan')) {
    if (!appData.mulliganStats) {
      loads.push(loadJSON(DATA_FILES.mulliganStats).then(d => { appData.mulliganStats = d; }));
    }
    if (currentCommander !== 'all' && !appData.commanderMulliganStats) {
      loads.push(loadCommanderMulliganStats());
    }
  }
  if (groupShown('feedback') && !appData.feedbackStats) {
    loads.push(loadJSON(DATA_FILES.feedbackStats).then(d => { appData.feedbackStats = d; }));
  }
  await Promise.all(loads);
}

// feedback_stats.json holds {total_ratings, fun_rate, cards, by_commander}
// per period × map. Returns the current commander's rows by card name plus the
// baseline fun rate the cells are colored against.
function feedbackLookup() {
  if (!groupShown('feedback')) return null;
  const data = getPeriodData(appData.feedbackStats, currentPeriod);
  if (!data) return { rows: {}, baseline: null };
  const list = currentCommander === 'all'
    ? data.cards
    : (data.by_commander || {})[currentCommander];
  const rows = {};
  (list || []).forEach(r => { rows[r.name] = r; });
  return { rows, baseline: data.fun_rate };
}

function mulliganLookup() {
  if (!groupShown('mulligan')) return null;
  const rows = currentCommander === 'all'
    ? getPeriodData(appData.mulliganStats, currentPeriod)
    : (getPeriodData(appData.commanderMulliganStats, currentPeriod) || {})[currentCommander];
  const lookup = {};
  (rows || []).forEach(r => { lookup[r.name] = r; });
  return lookup;
}

// ─── Card Table ─────────────────────────────────────────────

function rerenderCardTable() {
  renderCardTable(getPeriodData(appData.cardStats, currentPeriod));
}

function renderCardHeader(columns) {
  const row = document.querySelector('#card-table thead tr');
  row.innerHTML = columns.map(col => {
    const classes = ['sortable'];
    if (col.deemph) classes.push('col-deemph');
    if (col.group !== 'card') classes.push(`col-${col.group}`);
    if (col.key === cardSortKey) classes.push(cardSortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
    const tip = col.tooltip
      ? ` <span class="tooltip-icon" data-tooltip="${col.tooltip.replace(/"/g, '&quot;')}">?</span>`
      : '';
    return `<th class="${classes.join(' ')}" data-sort="${col.key}">${col.label}${tip}</th>`;
  }).join('');
}

function renderCardTable(stats) {
  const tbody = document.querySelector('#card-table tbody');
  const columns = shownColumns();
  renderCardHeader(columns);
  if (!stats || !stats.length) return;

  const isCmd = currentCommander !== 'all';

  // Compute total games denominator for sub-line counts
  let totalGames = 0;

  // When a commander is selected, merge per-commander card stats into global card data
  let merged = stats;
  if (isCmd) {
    const cmdCardData = getPeriodData(appData.commanderCardStats, currentPeriod);
    const cmdCards = cmdCardData && cmdCardData[currentCommander];
    if (cmdCards) {
      totalGames = cmdCards.length > 0 ? cmdCards[0].games : 0;
      const cmdLookup = {};
      cmdCards.forEach(c => { cmdLookup[c.name] = c; });
      merged = stats
        .map(c => {
          const cc = cmdLookup[c.name];
          if (!cc) return null;
          return {
            ...c,
            deck_rate: cc.inclusion_rate,
            deck_count: cc.deck_count,
            drawn_rate: cc.drawn_rate,
            drawn_winrate: cc.drawn_winrate,
            played_rate: cc.played_rate,
            played_winrate: cc.played_winrate,
            drawn_count: cc.drawn_count,
            played_count: cc.played_count,
            avg_copies: cc.avg_copies,
          };
        })
        .filter(Boolean);
    } else {
      merged = [];
    }
  } else {
    const metadata = getPeriodData(appData.metadata, currentPeriod);
    totalGames = metadata ? metadata.total_matches * 2 : 0;
  }

  const mull = mulliganLookup();
  if (mull) merged = merged.map(c => ({ ...c, mull: mull[c.name] || null }));
  const fb = feedbackLookup();
  if (fb) merged = merged.map(c => ({ ...c, fb: fb.rows[c.name] || null }));

  if (!showTokens) merged = merged.filter(c => !c.token);

  let filtered = currentFaction === 'all'
    ? merged
    : merged.filter(c => c.faction === currentFaction);

  // Apply search filter
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.type || '').toLowerCase().includes(q) ||
      (c.subtype || '').toLowerCase().includes(q)
    );
  }

  const sortCol = CARD_COLUMNS.find(col => col.key === cardSortKey) || CARD_COLUMNS[0];
  const sorted = [...filtered].sort((a, b) => {
    const aVal = sortCol.value(a);
    const bVal = sortCol.value(b);

    if (sortCol.string) {
      const aStr = (aVal || '').toLowerCase();
      const bStr = (bVal || '').toLowerCase();
      return cardSortDir === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    }

    const aEmpty = aVal == null || (sortCol.na ? sortCol.na(a) : false);
    const bEmpty = bVal == null || (sortCol.na ? sortCol.na(b) : false);
    return compareNALast(aEmpty, bEmpty, aVal, bVal, cardSortDir);
  });

  const totalForFaction = currentFaction === 'all'
    ? merged.length
    : merged.filter(c => c.faction === currentFaction).length;

  // Update search count
  const countEl = document.getElementById('search-count');
  if (countEl) {
    const label = isCmd ? `Showing ${sorted.length} of ${totalForFaction} cards for ${currentCommander}` : `Showing ${sorted.length} of ${totalForFaction} cards`;
    countEl.textContent = label;
  }

  const ctx = { totalGames, fbBaseline: fb ? fb.baseline : null };
  tbody.innerHTML = sorted.map(c => `
    <tr data-card-slug="${commanderSlug(c.name)}" class="card-row">
      ${columns.map(col => `<td${col.deemph ? ' class="cell-muted"' : ''}>${col.render(c, ctx)}</td>`).join('')}
    </tr>`).join('');

  if (sorted.length === 0) {
    tbody.innerHTML = `<tr class="placeholder-row"><td colspan="${columns.length}">No cards match your filters.</td></tr>`;
  }
}

function initCardTableSorting() {
  // Delegated: the header row is rebuilt on every render.
  document.querySelector('#card-table thead').addEventListener('click', e => {
    const th = e.target.closest('th.sortable');
    if (!th) return;
    const key = th.dataset.sort;
    if (cardSortKey === key) {
      cardSortDir = cardSortDir === 'desc' ? 'asc' : 'desc';
    } else {
      cardSortKey = key;
      const col = CARD_COLUMNS.find(c => c.key === key);
      cardSortDir = col && col.string ? 'asc' : 'desc';
    }
    rerenderCardTable();
  });
}

// ─── Column Controls ────────────────────────────────────────

function renderColumnMenu() {
  const menu = document.getElementById('column-picker-menu');
  if (!menu) return;
  menu.innerHTML = COLUMN_GROUPS.map(g => `
    <fieldset class="column-picker-group">
      <label class="column-picker-group-label">
        <input type="checkbox" data-group="${g.key}">
        <span>${g.label}</span>
      </label>
      ${CARD_COLUMNS.filter(col => col.group === g.key).map(col => `
        <label class="column-picker-option${col.locked ? ' is-locked' : ''}">
          <input type="checkbox" data-column="${col.key}"${col.locked ? ' disabled' : ''}>
          <span>${col.label}</span>
        </label>`).join('')}
    </fieldset>`).join('') +
    '<button type="button" class="column-picker-reset" id="column-picker-reset">Reset to default</button>';
}

// Mirror visibleColumns onto every checkbox: per-column boxes, group boxes
// (indeterminate when partially shown), and the filter-bar group shortcuts
// ("Mulligan stats", "Feedback stats").
function syncColumnControls() {
  document.querySelectorAll('#column-picker-menu input[data-column]').forEach(box => {
    box.checked = visibleColumns.has(box.dataset.column);
  });

  const groupState = group => {
    const cols = CARD_COLUMNS.filter(col => col.group === group && !col.locked);
    const on = cols.filter(col => visibleColumns.has(col.key)).length;
    return { checked: on === cols.length, indeterminate: on > 0 && on < cols.length };
  };
  const applyState = (box, state) => {
    box.checked = state.checked;
    box.indeterminate = state.indeterminate;
  };

  document.querySelectorAll('#column-picker-menu input[data-group]').forEach(box => {
    applyState(box, groupState(box.dataset.group));
  });
  document.querySelectorAll('input[data-quick-group]').forEach(box => {
    applyState(box, groupState(box.dataset.quickGroup));
  });
}

function initColumnControls() {
  renderColumnMenu();
  syncColumnControls();

  const menu = document.getElementById('column-picker-menu');
  menu.addEventListener('change', e => {
    const box = e.target;
    if (box.dataset.column) {
      setColumnsVisible([box.dataset.column], box.checked);
    } else if (box.dataset.group) {
      const keys = CARD_COLUMNS.filter(col => col.group === box.dataset.group).map(col => col.key);
      setColumnsVisible(keys, box.checked);
    }
  });

  menu.addEventListener('click', e => {
    if (e.target.id !== 'column-picker-reset') return;
    const defaults = new Set(DEFAULT_VISIBLE);
    CARD_COLUMNS.forEach(col => {
      if (defaults.has(col.key)) visibleColumns.add(col.key);
      else visibleColumns.delete(col.key);
    });
    setColumnsVisible([], true);
  });

  // Close the <details> popover on an outside click or Escape.
  const picker = document.getElementById('column-picker');
  document.addEventListener('click', e => {
    if (picker.open && !picker.contains(e.target)) picker.open = false;
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && picker.open) {
      picker.open = false;
      picker.querySelector('summary').focus();
    }
  });

  // Filter-bar shortcuts toggle a whole group. From the indeterminate state a
  // click turns them all on (the browser reports checked=true).
  document.querySelectorAll('input[data-quick-group]').forEach(box => {
    box.addEventListener('change', () => {
      const keys = CARD_COLUMNS.filter(col => col.group === box.dataset.quickGroup).map(col => col.key);
      setColumnsVisible(keys, box.checked);
    });
  });
}

// ─── Faction Filter ─────────────────────────────────────────

function initFactionFilters() {
  const buttons = document.querySelectorAll('.filter-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFaction = btn.dataset.faction;
      rerenderCardTable();
    });
  });
}

// ─── Token Toggle ───────────────────────────────────────────

function initTokenToggle() {
  const box = document.getElementById('show-tokens');
  if (!box) return;
  box.checked = showTokens;
  box.addEventListener('change', () => {
    showTokens = box.checked;
    rerenderCardTable();
  });
}

// ─── Search ─────────────────────────────────────────────────

function initSearch() {
  const input = document.getElementById('card-search');
  if (!input) return;

  let debounceTimer;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      searchQuery = input.value.trim();
      rerenderCardTable();
    }, 200);
  });
}

// ─── Card Preview on Hover ──────────────────────────────────

// Contents and placement come from site/js/cardpreview.js — hovering a card
// also previews any tokens it creates, side by side.
function initCardPreview() {
  const preview = document.getElementById('card-preview');
  if (!preview) return;

  const tbody = document.querySelector('#card-table tbody');
  const srcFor = slug => `assets/cards/${slug}.jpg`;

  tbody.addEventListener('mouseover', e => {
    const cell = e.target.closest('td');
    if (!cell) return;
    const row = cell.closest('tr[data-card-slug]');
    if (!row || cell !== row.cells[0]) return;

    renderCardPreview(preview, row.dataset.cardSlug, srcFor);
    preview.classList.add('visible');
  });

  tbody.addEventListener('mousemove', e => {
    if (!preview.classList.contains('visible')) return;
    positionCardPreview(preview, e);
  });

  tbody.addEventListener('mouseout', e => {
    const cell = e.target.closest('td');
    if (!cell) return;
    const row = cell.closest('tr[data-card-slug]');
    if (!row || cell !== row.cells[0]) return;
    const related = e.relatedTarget;
    if (related && cell.contains(related)) return;
    preview.classList.remove('visible');
  });
}

// ─── Commander Filter ───────────────────────────────────────

function populateCommanderDropdown() {
  const select = document.getElementById('commander-filter');
  if (!select) return;

  const cmdStats = getPeriodData(appData.commanderStats, currentPeriod);
  if (!cmdStats || !cmdStats.length) return;

  const sorted = [...cmdStats].sort((a, b) => a.name.localeCompare(b.name));

  // Keep the "All Commanders" option, replace the rest
  select.innerHTML = '<option value="all">All Commanders</option>' +
    sorted.map(c => `<option value="${c.name}"${c.name === currentCommander ? ' selected' : ''}>${c.name}</option>`).join('');
}

function initCommanderFilter() {
  const select = document.getElementById('commander-filter');
  if (!select) return;

  select.addEventListener('change', async () => {
    currentCommander = select.value;
    // When switching to a commander, default sort to inclusion %
    if (currentCommander !== 'all' && cardSortKey === 'drawn_winrate' && visibleColumns.has('deck_rate')) {
      cardSortKey = 'deck_rate';
      cardSortDir = 'desc';
    } else if (currentCommander === 'all' && cardSortKey === 'deck_rate' && visibleColumns.has('drawn_winrate')) {
      cardSortKey = 'drawn_winrate';
      cardSortDir = 'desc';
    }
    // Lazy-load commander card stats on first commander selection
    const loads = [ensureOptionalData()];
    if (currentCommander !== 'all' && !appData.commanderCardStats) {
      loads.push(loadCommanderCardStats());
    }
    await Promise.all(loads);
    rerenderCardTable();
  });
}

// ─── Render All ─────────────────────────────────────────────

function renderAll() {
  const metadata = getPeriodData(appData.metadata, currentPeriod);
  renderMetadata(metadata);
  populateCommanderDropdown();
  rerenderCardTable();
}

// ─── Init ───────────────────────────────────────────────────

async function init() {
  if (!visibleColumns.has(cardSortKey)) {
    cardSortKey = 'name';
    cardSortDir = 'asc';
  }
  appData = await loadData(['metadata', 'cardStats', 'commanderStats']);
  await ensureOptionalData();
  renderAll();
  initColumnControls();
  initFactionFilters();
  initCommanderFilter();
  initCardTableSorting();
  initTokenToggle();
  initSearch();
  initCardPreview();
  initStickyTableHeader(document.getElementById('card-table'));
  initTimeFilters(renderAll);
  initMapFilters(renderAll);
  initNavActiveState();
  initTooltips();
}

document.addEventListener('DOMContentLoaded', init);
