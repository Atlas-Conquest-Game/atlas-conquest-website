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
let currentCommander = 'all';
let searchQuery = '';

// ─── Card Table ─────────────────────────────────────────────

function renderCardTable(stats) {
  const tbody = document.querySelector('#card-table tbody');
  if (!stats || !stats.length) return;

  const isCmd = currentCommander !== 'all';

  // When a commander is selected, merge per-commander card stats into global card data
  let merged = stats;
  if (isCmd) {
    const cmdCardData = getPeriodData(appData.commanderCardStats, currentPeriod);
    const cmdCards = cmdCardData && cmdCardData[currentCommander];
    if (cmdCards) {
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
            drawn_instances: cc.drawn_instances,
            played_instances: cc.played_instances,
            avg_copies: cc.avg_copies,
          };
        })
        .filter(Boolean);
    } else {
      merged = [];
    }
  }

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
    ? merged.length
    : merged.filter(c => c.faction === currentFaction).length;

  // Update search count
  const countEl = document.getElementById('search-count');
  if (countEl) {
    const label = isCmd ? `Showing ${sorted.length} of ${totalForFaction} cards for ${currentCommander}` : `Showing ${sorted.length} of ${totalForFaction} cards`;
    countEl.textContent = label;
  }

  tbody.innerHTML = sorted.map(c => {
    const slug = commanderSlug(c.name);
    return `
    <tr data-card-slug="${slug}" class="card-row">
      <td><strong>${c.name}</strong></td>
      <td>${factionBadge(c.faction)}</td>
      <td>${c.type || '--'}</td>
      <td>${pctCell(c.deck_rate || 0)}</td>
      <td>${winrateCell(c.drawn_winrate, c.drawn_count)}</td>
      <td>${winrateCell(c.played_winrate, c.played_count)}</td>
      <td class="cell-muted">${pctCell(c.drawn_rate)}</td>
      <td class="cell-muted">${pctCell(c.played_rate)}</td>
      <td class="cell-muted">${(c.deck_count || 0).toLocaleString()}</td>
      <td class="cell-muted">${(c.drawn_instances || 0).toLocaleString()}</td>
      <td class="cell-muted">${(c.played_instances || 0).toLocaleString()}</td>
      <td>${(c.avg_copies || 0).toFixed(1)}</td>
    </tr>`;
  }).join('');

  if (sorted.length === 0) {
    tbody.innerHTML = '<tr class="placeholder-row"><td colspan="12">No cards match your filters.</td></tr>';
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

// ─── Card Preview on Hover ──────────────────────────────────

function initCardPreview() {
  const preview = document.getElementById('card-preview');
  const previewImg = document.getElementById('card-preview-img');
  if (!preview || !previewImg) return;

  const tbody = document.querySelector('#card-table tbody');

  tbody.addEventListener('mouseover', e => {
    const cell = e.target.closest('td');
    if (!cell) return;
    const row = cell.closest('tr[data-card-slug]');
    if (!row || cell !== row.cells[0]) return;

    const slug = row.dataset.cardSlug;
    previewImg.src = `assets/cards/${slug}.jpg`;
    preview.classList.add('visible');
  });

  tbody.addEventListener('mousemove', e => {
    const x = e.clientX + 20;
    const y = e.clientY - 100;
    const flipX = x + 260 > window.innerWidth;
    preview.style.left = flipX ? (e.clientX - 270) + 'px' : x + 'px';
    preview.style.top = Math.max(8, y) + 'px';
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

  // Handle image load errors (card art missing)
  previewImg.addEventListener('error', () => {
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
    if (currentCommander !== 'all' && cardSortKey === 'drawn_winrate') {
      cardSortKey = 'deck_rate';
      cardSortDir = 'desc';
    } else if (currentCommander === 'all' && cardSortKey === 'deck_rate') {
      cardSortKey = 'drawn_winrate';
      cardSortDir = 'desc';
    }
    // Lazy-load commander card stats on first commander selection
    if (currentCommander !== 'all' && !appData.commanderCardStats) {
      await loadCommanderCardStats();
    }
    const cardStats = getPeriodData(appData.cardStats, currentPeriod);
    renderCardTable(cardStats);
  });
}

// ─── Render All ─────────────────────────────────────────────

function renderAll() {
  const period = currentPeriod;
  const metadata = getPeriodData(appData.metadata, period);
  const cardStats = getPeriodData(appData.cardStats, period);

  renderMetadata(metadata);
  populateCommanderDropdown();
  renderCardTable(cardStats);
}

// ─── Init ───────────────────────────────────────────────────

async function init() {
  appData = await loadAllData();
  renderAll();
  initFactionFilters();
  initCommanderFilter();
  initCardTableSorting();
  initSearch();
  initCardPreview();
  initTimeFilters(renderAll);
  initMapFilters(renderAll);
  initNavActiveState();
  initTooltips();
}

document.addEventListener('DOMContentLoaded', init);
