/**
 * Atlas Conquest Analytics — Commanders Page
 *
 * Commander grid, winrate-by-duration/actions/turns tables,
 * deck composition charts, and commander detail modal.
 */

// ─── Page State ─────────────────────────────────────────────

let avgCostChart = null;
let minionSpellChart = null;
let patronNeutralChart = null;

// ─── Commander Cards (with artwork) ─────────────────────────

function renderCommanderCards(stats, commanders) {
  const container = document.getElementById('commander-cards');
  if (!container || !stats || !stats.length) return;

  const artLookup = {};
  if (commanders) {
    commanders.forEach(c => { artLookup[c.name] = c.art; });
  }

  const sorted = [...stats].sort((a, b) => b.winrate - a.winrate);

  container.innerHTML = sorted.map((c, i) => {
    const artPath = artLookup[c.name];
    const artHtml = artPath
      ? `<img class="commander-art" src="${artPath}" alt="${c.name}" loading="lazy">`
      : `<div class="commander-art commander-art-placeholder">${c.name.charAt(0)}</div>`;

    const wr = (c.winrate * 100).toFixed(1);
    let wrClass = 'winrate-neutral';
    if (c.winrate > 0.52) wrClass = 'winrate-positive';
    else if (c.winrate < 0.48) wrClass = 'winrate-negative';

    const delay = Math.min(i * 0.04, 0.5);

    return `
      <div class="commander-card" style="animation-delay: ${delay}s">
        ${artHtml}
        <div class="commander-card-body">
          <div class="commander-card-name">${c.name}</div>
          ${factionBadge(c.faction)}
          <div class="commander-card-stats">
            <span class="${wrClass}">${wr}%</span> WR
            <span class="commander-card-games">${c.matches} games</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ─── Winrate Bucket Tables (Duration, Actions & Turns) ──────

// Per-table sort state
const bucketTableSort = {};

function renderBucketTable(tableId, data, unitSuffix) {
  const table = document.getElementById(tableId);
  if (!table) return;

  const thead = table.querySelector('thead tr');
  const tbody = table.querySelector('tbody');

  if (!data || !data.buckets || !data.commanders) {
    thead.innerHTML = '';
    tbody.innerHTML = '<tr class="placeholder-row"><td colspan="1">No data for current filters.</td></tr>';
    return;
  }

  const buckets = data.buckets;
  const sortState = bucketTableSort[tableId] || { key: 'total', dir: 'desc' };

  // Build row data for all commanders
  const rows = Object.entries(data.commanders).map(([name, bucketData]) => {
    const totalGames = bucketData.reduce((s, b) => s + b.games, 0);
    return { name, bucketData, totalGames };
  });

  // Sort
  if (sortState.key === 'name') {
    rows.sort((a, b) => sortState.dir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name));
  } else if (sortState.key === 'total') {
    rows.sort((a, b) => sortState.dir === 'asc' ? a.totalGames - b.totalGames : b.totalGames - a.totalGames);
  } else {
    // Sort by a bucket index winrate
    const idx = parseInt(sortState.key);
    rows.sort((a, b) => {
      const aWr = a.bucketData[idx] && a.bucketData[idx].winrate !== null ? a.bucketData[idx].winrate : -1;
      const bWr = b.bucketData[idx] && b.bucketData[idx].winrate !== null ? b.bucketData[idx].winrate : -1;
      return sortState.dir === 'asc' ? aWr - bWr : bWr - aWr;
    });
  }

  // Build faction lookup
  const factionLookup = {};
  const cmdStats = getPeriodData(appData.commanderStats, currentPeriod);
  if (cmdStats) cmdStats.forEach(c => { factionLookup[c.name] = c.faction; });

  // Header
  const sortIcon = (key) => {
    if (sortState.key !== key) return '';
    return sortState.dir === 'asc' ? ' ▲' : ' ▼';
  };

  thead.innerHTML =
    `<th class="sortable" data-table="${tableId}" data-bsort="name">Commander${sortIcon('name')}</th>` +
    buckets.map((b, i) => `<th class="sortable" data-table="${tableId}" data-bsort="${i}">${b}${unitSuffix}${sortIcon(String(i))}</th>`).join('') +
    `<th class="sortable" data-table="${tableId}" data-bsort="total">Games${sortIcon('total')}</th>`;

  // Body
  tbody.innerHTML = rows.map(row => {
    const cells = row.bucketData.map(b => {
      if (b.games < 5) return `<td class="wr-cell wr-nodata">--<span class="wr-cell-count">${b.games}</span></td>`;
      const wr = b.winrate !== null ? (b.winrate * 100).toFixed(1) : null;
      let cls = 'wr-even';
      if (b.winrate > 0.55) cls = 'wr-high';
      else if (b.winrate < 0.45) cls = 'wr-low';
      return `<td class="wr-cell ${cls}">${wr}%<span class="wr-cell-count">${b.games}</span></td>`;
    }).join('');
    return `<tr><td><strong>${row.name}</strong> ${factionBadge(factionLookup[row.name] || '')}</td>${cells}<td>${row.totalGames}</td></tr>`;
  }).join('');

  // Attach sort handlers
  thead.querySelectorAll('.sortable').forEach(th => {
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      const key = th.dataset.bsort;
      const tid = th.dataset.table;
      const prev = bucketTableSort[tid] || { key: 'total', dir: 'desc' };
      if (prev.key === key) {
        prev.dir = prev.dir === 'desc' ? 'asc' : 'desc';
      } else {
        bucketTableSort[tid] = { key, dir: key === 'name' ? 'asc' : 'desc' };
      }
      // Re-render just this table
      if (tid === 'duration-table') {
        renderBucketTable('duration-table', getPeriodData(appData.durationWinrates, currentPeriod), ' min');
      } else if (tid === 'actions-table') {
        renderBucketTable('actions-table', getPeriodData(appData.actionWinrates, currentPeriod), '');
      } else if (tid === 'turns-table') {
        renderBucketTable('turns-table', getPeriodData(appData.turnWinrates, currentPeriod), '');
      }
    });
  });
}

// ─── Deck Composition Charts ────────────────────────────────

function renderAvgCostChart(deckComp) {
  const canvas = document.getElementById('avg-cost-chart');
  if (!canvas || !deckComp) return;

  if (avgCostChart) { avgCostChart.destroy(); avgCostChart = null; }

  const sorted = sortedCommanders(deckComp);
  const names = sorted.map(([n]) => n);
  const costs = sorted.map(([, d]) => d.avg_cost);
  const colors = sorted.map(([, d]) => FACTION_COLORS[d.faction] || '#888');

  avgCostChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: names,
      datasets: [{
        label: 'Avg Mana Cost',
        data: costs,
        backgroundColor: colors.map(c => c + 'CC'),
        borderColor: colors,
        borderWidth: 1,
        borderRadius: 4,
        barPercentage: 0.7,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      onClick: (evt, elements) => {
        if (elements.length) openCommanderModal(names[elements[0].index]);
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...CHART_TOOLTIP,
          callbacks: {
            label: ctx => {
              const d = sorted[ctx.dataIndex][1];
              return `Avg cost: ${ctx.parsed.y.toFixed(2)} (${d.deck_count} decks)`;
            },
            afterLabel: () => 'Click for details',
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: '#21262d' },
          title: { display: true, text: 'Avg Mana Cost', color: '#8b949e', font: { size: 11 } },
        },
        x: {
          ticks: { maxRotation: 45, font: { size: 10 } },
          grid: { display: false },
        },
      },
    },
  });
  canvas.classList.add('clickable');
}

function renderMinionSpellChart(deckComp) {
  const canvas = document.getElementById('minion-spell-chart');
  if (!canvas || !deckComp) return;

  if (minionSpellChart) { minionSpellChart.destroy(); minionSpellChart = null; }

  const sorted = sortedCommanders(deckComp);
  const names = sorted.map(([n]) => n);

  minionSpellChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: names,
      datasets: [
        {
          label: 'Minions',
          data: sorted.map(([, d]) => d.avg_minion_count),
          backgroundColor: '#3fb95099',
          borderColor: '#3fb950',
          borderWidth: 1,
          borderRadius: 3,
        },
        {
          label: 'Spells',
          data: sorted.map(([, d]) => d.avg_spell_count),
          backgroundColor: '#d2a8ff99',
          borderColor: '#d2a8ff',
          borderWidth: 1,
          borderRadius: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      onClick: (evt, elements) => {
        if (elements.length) openCommanderModal(names[elements[0].index]);
      },
      plugins: {
        legend: {
          labels: { usePointStyle: true, pointStyle: 'circle', padding: 14, font: { size: 11 } },
        },
        tooltip: {
          ...CHART_TOOLTIP,
          callbacks: {
            afterTitle: () => 'Click for details',
          },
        },
      },
      scales: {
        x: { stacked: true, ticks: { maxRotation: 45, font: { size: 10 } }, grid: { display: false } },
        y: { stacked: true, beginAtZero: true, grid: { color: '#21262d' }, title: { display: true, text: 'Avg Cards', color: '#8b949e', font: { size: 11 } } },
      },
    },
  });
  canvas.classList.add('clickable');
}

function renderPatronNeutralChart(deckComp) {
  const canvas = document.getElementById('patron-neutral-chart');
  if (!canvas || !deckComp) return;

  if (patronNeutralChart) { patronNeutralChart.destroy(); patronNeutralChart = null; }

  const sorted = sortedCommanders(deckComp);
  const names = sorted.map(([n]) => n);

  patronNeutralChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: names,
      datasets: [
        {
          label: 'Patron',
          data: sorted.map(([, d]) => d.avg_patron_cards),
          backgroundColor: '#58a6ff99',
          borderColor: '#58a6ff',
          borderWidth: 1,
          borderRadius: 3,
        },
        {
          label: 'Neutral',
          data: sorted.map(([, d]) => d.avg_neutral_cards),
          backgroundColor: '#A8907899',
          borderColor: '#A89078',
          borderWidth: 1,
          borderRadius: 3,
        },
        {
          label: 'Other',
          data: sorted.map(([, d]) => d.avg_other_cards),
          backgroundColor: '#f8514999',
          borderColor: '#f85149',
          borderWidth: 1,
          borderRadius: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      onClick: (evt, elements) => {
        if (elements.length) openCommanderModal(names[elements[0].index]);
      },
      plugins: {
        legend: {
          labels: { usePointStyle: true, pointStyle: 'circle', padding: 14, font: { size: 11 } },
        },
        tooltip: {
          ...CHART_TOOLTIP,
          callbacks: {
            afterTitle: () => 'Click for details',
          },
        },
      },
      scales: {
        x: { stacked: true, ticks: { maxRotation: 45, font: { size: 10 } }, grid: { display: false } },
        y: { stacked: true, beginAtZero: true, grid: { color: '#21262d' }, title: { display: true, text: 'Avg Cards', color: '#8b949e', font: { size: 11 } } },
      },
    },
  });
  canvas.classList.add('clickable');
}

// ─── Render All ─────────────────────────────────────────────

function renderAll() {
  const period = currentPeriod;

  const metadata = getPeriodData(appData.metadata, period);
  const commanderStats = getPeriodData(appData.commanderStats, period);
  const deckComp = getPeriodData(appData.deckComposition, period);

  renderMetadata(metadata);

  // Commander stats
  renderCommanderCards(commanderStats, appData.commanders);

  // Winrate by turns, actions & duration tables
  renderBucketTable('turns-table', getPeriodData(appData.turnWinrates, period), '');
  renderBucketTable('actions-table', getPeriodData(appData.actionWinrates, period), '');
  renderBucketTable('duration-table', getPeriodData(appData.durationWinrates, period), ' min');

  // Deck composition
  renderAvgCostChart(deckComp);
  renderMinionSpellChart(deckComp);
  renderPatronNeutralChart(deckComp);
}

// ─── Init ───────────────────────────────────────────────────

async function init() {
  appData = await loadAllData();
  renderAll();
  initTimeFilters(renderAll);
  initMapFilters(renderAll);
  initModal();
  initNavActiveState();
  initTooltips();
}

document.addEventListener('DOMContentLoaded', init);
