/**
 * Atlas Conquest Analytics — Mulligan Page
 *
 * Card mulligan keep rates, winrate impact, and commander-specific stats.
 */

// ─── Page State ─────────────────────────────────────────────

let sortKey = 'total_seen';
let sortDir = 'desc';
let currentFaction = 'all';
let currentCommander = 'all';
let searchQuery = '';

// ─── Mulligan Table ─────────────────────────────────────────

function renderMulliganTable() {
  const tbody = document.querySelector('#mulligan-table tbody');
  if (!tbody) return;

  const isCmd = currentCommander !== 'all';

  // Get mulligan data based on commander selection
  let stats;
  if (isCmd) {
    const cmdMullData = getPeriodData(appData.commanderMulliganStats, currentPeriod);
    stats = cmdMullData && cmdMullData[currentCommander] ? [...cmdMullData[currentCommander]] : [];
  } else {
    stats = getPeriodData(appData.mulliganStats, currentPeriod);
    stats = stats ? [...stats] : [];
  }

  // Build card info lookup for faction/type
  const cardInfoLookup = {};
  if (appData.cardStats) {
    const cardStats = getPeriodData(appData.cardStats, currentPeriod);
    if (cardStats) {
      cardStats.forEach(c => { cardInfoLookup[c.name] = c; });
    }
  }

  // Enrich with faction data
  stats = stats.map(c => ({
    ...c,
    faction: cardInfoLookup[c.name] ? cardInfoLookup[c.name].faction : 'neutral',
  }));

  // Apply faction filter
  let filtered = currentFaction === 'all'
    ? stats
    : stats.filter(c => c.faction === currentFaction);

  // Apply search filter
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(c => c.name.toLowerCase().includes(q));
  }

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    let aVal = a[sortKey];
    let bVal = b[sortKey];

    if (sortKey === 'name') {
      aVal = (aVal || '').toLowerCase();
      bVal = (bVal || '').toLowerCase();
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }

    if (sortKey === 'faction') {
      aVal = (aVal || '').toLowerCase();
      bVal = (bVal || '').toLowerCase();
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }

    // For winrate columns, push low-sample to bottom
    const isWinrate = ['keep_winrate', 'return_winrate', 'winrate_delta', 'keep_rate', 'norm_keep_delta'].includes(sortKey);
    const aEmpty = aVal == null || (isWinrate && (a.total_seen || 0) < 5);
    const bEmpty = bVal == null || (isWinrate && (b.total_seen || 0) < 5);
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;
    return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
  });

  // Update search count
  const countEl = document.getElementById('search-count');
  if (countEl) {
    const label = isCmd
      ? `Showing ${sorted.length} of ${stats.length} cards for ${currentCommander}`
      : `Showing ${sorted.length} of ${stats.length} cards`;
    countEl.textContent = label;
  }

  // Render rows
  tbody.innerHTML = sorted.map(c => {
    const totalSeen = c.total_seen || 0;
    const keptCount = c.kept_count || 0;
    const returnedCount = c.returned_count || 0;
    return `
    <tr>
      <td><strong>${c.name}</strong></td>
      <td>${factionBadge(c.faction)}</td>
      <td>${totalSeen >= 5 ? pctCell(c.keep_rate) : '<span class="winrate-neutral">--</span>'}<div class="cell-sub">${totalSeen} seen</div></td>
      <td>${totalSeen >= 5 ? normKeepDeltaCell(c.norm_keep_delta) : '<span class="winrate-neutral">--</span><div class="cell-sub">low sample</div>'}</td>
      <td>${winrateCell(c.keep_winrate, keptCount)}<div class="cell-sub">${keptCount} kept</div></td>
      <td>${winrateCell(c.return_winrate, returnedCount < 5 ? 0 : returnedCount)}<div class="cell-sub">${returnedCount} returned</div></td>
      <td>${totalSeen >= 5 ? winrateDeltaCell(c.winrate_delta) : '<span class="winrate-neutral">--</span>'}<div class="cell-sub">${totalSeen < 5 ? 'low sample' : totalSeen + ' seen'}</div></td>
      <td>${keptCount}</td>
      <td>${returnedCount}</td>
      <td>${totalSeen}</td>
    </tr>`;
  }).join('');

  if (sorted.length === 0) {
    tbody.innerHTML = '<tr class="placeholder-row"><td colspan="10">No mulligan data matches your filters.</td></tr>';
  }

  updateSortHeaders();
}

function updateSortHeaders() {
  const headers = document.querySelectorAll('#mulligan-table th.sortable');
  headers.forEach(th => {
    th.classList.remove('sorted-asc', 'sorted-desc');
    if (th.dataset.sort === sortKey) {
      th.classList.add(sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
    }
  });
}

// ─── Overview Stats ─────────────────────────────────────────

function renderOverviewStats() {
  const stats = getPeriodData(appData.mulliganStats, currentPeriod);
  if (!stats || !stats.length) {
    el('stat-mulligan-games', '0');
    el('stat-cards-tracked', '0');
    el('stat-avg-keep-rate', '--');
    el('stat-best-delta', '--');
    return;
  }

  const mulliganHands = stats[0].mulligan_games || 0;
  const mulliganGames = Math.floor(mulliganHands / 2);
  el('stat-mulligan-games', `${mulliganGames.toLocaleString()} games, ${mulliganHands.toLocaleString()} hands`);
  el('stat-cards-tracked', stats.length.toLocaleString());

  // Update hero stat
  const heroMull = document.getElementById('hero-mulligan-games');
  if (heroMull) heroMull.textContent = `${mulliganGames.toLocaleString()} games with mulligan data`;

  // Average keep rate (weighted by total_seen)
  let totalKept = 0, totalSeen = 0;
  stats.forEach(c => {
    totalKept += c.kept_count || 0;
    totalSeen += c.total_seen || 0;
  });
  const avgKeep = totalSeen > 0 ? (totalKept / totalSeen * 100).toFixed(1) + '%' : '--';
  el('stat-avg-keep-rate', avgKeep);

  // Best WR delta (among cards with >= 5 seen)
  const reliable = stats.filter(c => (c.total_seen || 0) >= 5 && c.winrate_delta != null);
  if (reliable.length) {
    const best = reliable.reduce((a, b) => (a.winrate_delta > b.winrate_delta ? a : b));
    el('stat-best-delta', `+${(best.winrate_delta * 100).toFixed(1)}% (${best.name})`);
  } else {
    el('stat-best-delta', '--');
  }
}

// ─── Sort ───────────────────────────────────────────────────

function initTableSorting() {
  const headers = document.querySelectorAll('#mulligan-table th.sortable');
  headers.forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (sortKey === key) {
        sortDir = sortDir === 'desc' ? 'asc' : 'desc';
      } else {
        sortKey = key;
        sortDir = ['name', 'faction'].includes(key) ? 'asc' : 'desc';
      }
      renderMulliganTable();
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
      renderMulliganTable();
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
      renderMulliganTable();
    }, 200);
  });
}

// ─── Commander Filter ───────────────────────────────────────

function populateCommanderDropdown() {
  const select = document.getElementById('commander-filter');
  if (!select) return;

  const cmdStats = getPeriodData(appData.commanderStats, currentPeriod);
  if (!cmdStats || !cmdStats.length) return;

  const sorted = [...cmdStats].sort((a, b) => a.name.localeCompare(b.name));
  select.innerHTML = '<option value="all">All Commanders</option>' +
    sorted.map(c => `<option value="${c.name}"${c.name === currentCommander ? ' selected' : ''}>${c.name}</option>`).join('');
}

function initCommanderFilter() {
  const select = document.getElementById('commander-filter');
  if (!select) return;

  select.addEventListener('change', async () => {
    currentCommander = select.value;
    if (currentCommander !== 'all' && !appData.commanderMulliganStats) {
      await loadCommanderMulliganStats();
    }
    renderMulliganTable();
  });
}

// ─── Render All ─────────────────────────────────────────────

function renderAll() {
  const metadata = getPeriodData(appData.metadata, currentPeriod);
  renderMetadata(metadata);
  populateCommanderDropdown();
  renderOverviewStats();
  renderMulliganTable();
}

// ─── Init ───────────────────────────────────────────────────

async function init() {
  appData = await loadData(['metadata', 'cardStats', 'commanderStats', 'mulliganStats']);
  renderAll();
  initFactionFilters();
  initCommanderFilter();
  initTableSorting();
  initSearch();
  initTimeFilters(renderAll);
  initMapFilters(renderAll);
  initNavActiveState();
  initTooltips();
}

document.addEventListener('DOMContentLoaded', init);
