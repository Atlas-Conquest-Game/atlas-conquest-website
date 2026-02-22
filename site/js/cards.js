/**
 * Atlas Conquest Analytics — Cards Page
 *
 * Full card table with search, faction filter, and sorting.
 * All 261 cards visible (no row cap).
 */

// ─── Page State ─────────────────────────────────────────────

let cardSortKey = 'drawn_winrate';
let cardSortDir = 'desc';
let currentFaction = 'all';
let searchQuery = '';

// ─── Card Table ─────────────────────────────────────────────

function renderCardTable(stats) {
  const tbody = document.querySelector('#card-table tbody');
  if (!stats || !stats.length) return;

  let filtered = currentFaction === 'all'
    ? stats
    : stats.filter(c => c.faction === currentFaction);

  // Apply search filter
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.type || '').toLowerCase().includes(q) ||
      (c.subtype || '').toLowerCase().includes(q)
    );
  }

  const sorted = [...filtered].sort((a, b) => {
    let aVal = a[cardSortKey];
    let bVal = b[cardSortKey];

    if (typeof aVal === 'string') {
      aVal = aVal.toLowerCase();
      bVal = (bVal || '').toLowerCase();
      return cardSortDir === 'asc'
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    }

    aVal = aVal || 0;
    bVal = bVal || 0;
    return cardSortDir === 'asc' ? aVal - bVal : bVal - aVal;
  });

  const totalForFaction = currentFaction === 'all'
    ? stats.length
    : stats.filter(c => c.faction === currentFaction).length;

  // Update search count
  const countEl = document.getElementById('search-count');
  if (countEl) {
    countEl.textContent = `Showing ${sorted.length} of ${totalForFaction} cards`;
  }

  tbody.innerHTML = sorted.map(c => `
    <tr>
      <td><strong>${c.name}</strong></td>
      <td>${factionBadge(c.faction)}</td>
      <td>${c.type || '--'}</td>
      <td>${pctCell(c.drawn_rate)}</td>
      <td>${winrateCell(c.drawn_winrate, c.drawn_count)}</td>
      <td>${pctCell(c.played_rate)}</td>
      <td>${winrateCell(c.played_winrate, c.played_count)}</td>
    </tr>
  `).join('');

  if (sorted.length === 0) {
    tbody.innerHTML = '<tr class="placeholder-row"><td colspan="7">No cards match your filters.</td></tr>';
  }

  updateSortHeaders();
}

function updateSortHeaders() {
  const headers = document.querySelectorAll('#card-table th.sortable');
  headers.forEach(th => {
    th.classList.remove('sorted-asc', 'sorted-desc');
    if (th.dataset.sort === cardSortKey) {
      th.classList.add(cardSortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
    }
  });
}

function initCardTableSorting() {
  const headers = document.querySelectorAll('#card-table th.sortable');
  headers.forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (cardSortKey === key) {
        cardSortDir = cardSortDir === 'desc' ? 'asc' : 'desc';
      } else {
        cardSortKey = key;
        cardSortDir = ['name', 'faction', 'type'].includes(key) ? 'asc' : 'desc';
      }
      const cardStats = getPeriodData(appData.cardStats, currentPeriod);
      renderCardTable(cardStats);
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
      const cardStats = getPeriodData(appData.cardStats, currentPeriod);
      renderCardTable(cardStats);
    });
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
      const cardStats = getPeriodData(appData.cardStats, currentPeriod);
      renderCardTable(cardStats);
    }, 200);
  });
}

// ─── Render All ─────────────────────────────────────────────

function renderAll() {
  const period = currentPeriod;
  const metadata = getPeriodData(appData.metadata, period);
  const cardStats = getPeriodData(appData.cardStats, period);

  renderMetadata(metadata);
  renderCardTable(cardStats);
}

// ─── Init ───────────────────────────────────────────────────

async function init() {
  appData = await loadAllData();
  renderAll();
  initFactionFilters();
  initCardTableSorting();
  initSearch();
  initTimeFilters(renderAll);
  initNavActiveState();
  initTooltips();
}

document.addEventListener('DOMContentLoaded', init);
