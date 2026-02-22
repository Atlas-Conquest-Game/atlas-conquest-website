/**
 * Atlas Conquest Analytics — Main Application
 *
 * Loads static JSON data files and renders the dashboard.
 * No build step. No framework. Just data → DOM.
 */

// Colorblind-safe palette (Wong 2011 / Okabe-Ito inspired)
const FACTION_COLORS = {
  skaal: '#D55E00',
  grenalia: '#009E73',
  lucia: '#E8B630',
  neutral: '#A89078',
  shadis: '#7B7B8E',
  archaeon: '#0072B2',
};

const FACTION_LABELS = {
  skaal: 'Skaal',
  grenalia: 'Grenalia',
  lucia: 'Lucia',
  neutral: 'Neutral',
  shadis: 'Shadis',
  archaeon: 'Archaeon',
};

// Chart.js dark theme defaults
Chart.defaults.color = '#8b949e';
Chart.defaults.borderColor = '#30363d';
Chart.defaults.font.family = "'Inter', sans-serif";

// ─── State ────────────────────────────────────────────────────

let appData = {};
let cardSortKey = 'deck_count';
let cardSortDir = 'desc';
let currentFaction = 'all';
let commanderChart = null;
let metaChart = null;

// ─── Data Loading ──────────────────────────────────────────────

async function loadJSON(path) {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function loadAllData() {
  const [metadata, commanderStats, cardStats, trends, matchups, commanders] = await Promise.all([
    loadJSON('data/metadata.json'),
    loadJSON('data/commander_stats.json'),
    loadJSON('data/card_stats.json'),
    loadJSON('data/trends.json'),
    loadJSON('data/matchups.json'),
    loadJSON('data/commanders.json'),
  ]);
  return { metadata, commanderStats, cardStats, trends, matchups, commanders };
}

// ─── Helpers ───────────────────────────────────────────────────

function el(id, text) {
  const node = document.getElementById(id);
  if (node) node.textContent = text;
}

function factionBadge(faction) {
  const label = FACTION_LABELS[faction] || faction;
  return `<span class="faction-badge ${faction}">${label}</span>`;
}

function winrateCell(rate, count) {
  if (count !== undefined && count < 5) {
    return `<span class="winrate-neutral">--</span>`;
  }
  const pct = (rate * 100).toFixed(1);
  let cls = 'winrate-neutral';
  if (rate > 0.52) cls = 'winrate-positive';
  else if (rate < 0.48) cls = 'winrate-negative';
  return `<span class="${cls}">${pct}%</span>`;
}

function pctCell(rate) {
  return `${(rate * 100).toFixed(1)}%`;
}

function commanderSlug(name) {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[,']/g, '');
}

// ─── Metadata ──────────────────────────────────────────────────

function renderMetadata(metadata) {
  if (!metadata) return;
  el('hero-matches', `${metadata.total_matches.toLocaleString()} matches`);
  el('hero-updated', `Last updated: ${new Date(metadata.last_updated).toLocaleDateString()}`);
  el('stat-matches', metadata.total_matches.toLocaleString());
}

// ─── Commander Cards (with artwork) ────────────────────────────

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

// ─── Commander Table & Chart ───────────────────────────────────

function renderCommanderTable(stats) {
  const tbody = document.querySelector('#commander-table tbody');
  if (!stats || !stats.length) return;

  tbody.innerHTML = [...stats]
    .sort((a, b) => b.winrate - a.winrate)
    .map(c => `
      <tr>
        <td><strong>${c.name}</strong></td>
        <td>${factionBadge(c.faction)}</td>
        <td>${c.matches.toLocaleString()}</td>
        <td>${c.wins.toLocaleString()}</td>
        <td>${winrateCell(c.winrate)}</td>
      </tr>
    `).join('');
}

function renderCommanderChart(stats) {
  const canvas = document.getElementById('commander-chart');
  if (!stats || !stats.length || !canvas) return;

  if (commanderChart) {
    commanderChart.destroy();
    commanderChart = null;
  }

  const sorted = [...stats].sort((a, b) => b.winrate - a.winrate);

  commanderChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: sorted.map(c => c.name),
      datasets: [{
        label: 'Winrate',
        data: sorted.map(c => (c.winrate * 100).toFixed(1)),
        backgroundColor: sorted.map(c => {
          const base = FACTION_COLORS[c.faction] || '#888';
          return base + 'CC';
        }),
        borderColor: sorted.map(c => FACTION_COLORS[c.faction] || '#888'),
        borderWidth: 1,
        borderRadius: 4,
        barPercentage: 0.7,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#21262d',
          borderColor: '#30363d',
          borderWidth: 1,
          titleColor: '#e6edf3',
          bodyColor: '#8b949e',
          padding: 10,
          cornerRadius: 6,
          callbacks: {
            label: ctx => `${ctx.parsed.y}% winrate (${sorted[ctx.dataIndex].matches} games)`,
          },
        },
      },
      scales: {
        y: {
          min: 30,
          max: 70,
          ticks: {
            callback: v => v + '%',
          },
          grid: { color: '#21262d' },
        },
        x: {
          ticks: {
            maxRotation: 45,
          },
          grid: { display: false },
        },
      },
    },
  });
}

// ─── Matchup Heatmap ───────────────────────────────────────────

function renderMatchups(matchupData) {
  const table = document.getElementById('matchup-table');
  if (!matchupData || !table) return;

  const cmds = matchupData.commanders;
  const matchups = matchupData.matchups;

  const matchupMap = {};
  cmds.forEach(c => { matchupMap[c] = {}; });
  matchups.forEach(m => {
    matchupMap[m.commander][m.opponent] = m;
  });

  const shortName = name => {
    const parts = name.split(',')[0].split(' ');
    return parts.length > 1 ? parts[0] : name;
  };

  // Header row
  const thead = table.querySelector('thead tr');
  thead.innerHTML = '<th class="matchup-corner"></th>' +
    cmds.map(c => `<th class="matchup-col-header" title="${c}">${shortName(c)}</th>`).join('');

  // Body rows
  const tbody = table.querySelector('tbody');
  tbody.innerHTML = cmds.map(row => {
    const cells = cmds.map(col => {
      if (row === col) {
        return '<td class="matchup-cell matchup-self" data-type="self">-</td>';
      }
      const m = matchupMap[row] && matchupMap[row][col];
      if (!m || m.total < 5) {
        return `<td class="matchup-cell matchup-nodata" data-type="nodata" data-row="${row}" data-col="${col}" data-total="${m ? m.total : 0}">--</td>`;
      }
      const wr = (m.winrate * 100).toFixed(0);
      let cls = 'matchup-even';
      if (m.winrate > 0.55) cls = 'matchup-favored';
      else if (m.winrate < 0.45) cls = 'matchup-unfavored';

      return `<td class="matchup-cell ${cls}" data-type="data" data-row="${row}" data-col="${col}" data-wr="${wr}" data-total="${m.total}" data-wins="${m.wins}" data-losses="${m.losses}">${wr}%</td>`;
    }).join('');

    return `<tr><th class="matchup-row-header" title="${row}">${shortName(row)}</th>${cells}</tr>`;
  }).join('');

  // Setup tooltip
  initMatchupTooltip();
}

function initMatchupTooltip() {
  const tooltip = document.getElementById('matchup-tooltip');
  const titleEl = document.getElementById('tooltip-title');
  const wrEl = document.getElementById('tooltip-wr');
  const gamesEl = document.getElementById('tooltip-games');

  const cells = document.querySelectorAll('.matchup-cell[data-type="data"], .matchup-cell[data-type="nodata"]');

  cells.forEach(cell => {
    cell.addEventListener('mouseenter', e => {
      const row = cell.dataset.row;
      const col = cell.dataset.col;
      const type = cell.dataset.type;

      titleEl.textContent = `${row} vs ${col}`;

      if (type === 'nodata') {
        const total = parseInt(cell.dataset.total) || 0;
        wrEl.textContent = 'Insufficient data';
        wrEl.style.color = '#8b949e';
        gamesEl.textContent = `${total} game${total !== 1 ? 's' : ''} played`;
      } else {
        const wr = cell.dataset.wr;
        const total = cell.dataset.total;
        const wins = cell.dataset.wins;
        const losses = cell.dataset.losses;
        const wrNum = parseInt(wr);

        wrEl.textContent = `${wr}% winrate`;
        if (wrNum > 55) wrEl.style.color = '#3fb950';
        else if (wrNum < 45) wrEl.style.color = '#f0834a';
        else wrEl.style.color = '#e6edf3';

        gamesEl.textContent = `${total} games (${wins}W - ${losses}L)`;
      }

      tooltip.classList.add('visible');
    });

    cell.addEventListener('mousemove', e => {
      tooltip.style.left = (e.clientX + 12) + 'px';
      tooltip.style.top = (e.clientY - 10) + 'px';
    });

    cell.addEventListener('mouseleave', () => {
      tooltip.classList.remove('visible');
    });
  });
}

// ─── Card Table (sortable) ────────────────────────────────────

function renderCardTable(stats, faction, sortKey, sortDir) {
  const tbody = document.querySelector('#card-table tbody');
  if (!stats || !stats.length) return;

  sortKey = sortKey || cardSortKey;
  sortDir = sortDir || cardSortDir;

  const filtered = faction === 'all'
    ? stats
    : stats.filter(c => c.faction === faction);

  const sorted = [...filtered].sort((a, b) => {
    let aVal = a[sortKey];
    let bVal = b[sortKey];

    // String sort for name, faction, type
    if (typeof aVal === 'string') {
      aVal = aVal.toLowerCase();
      bVal = (bVal || '').toLowerCase();
      return sortDir === 'asc'
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    }

    // Numeric sort
    aVal = aVal || 0;
    bVal = bVal || 0;
    return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
  }).slice(0, 60);

  tbody.innerHTML = sorted.map(c => `
    <tr>
      <td><strong>${c.name}</strong></td>
      <td>${factionBadge(c.faction)}</td>
      <td>${c.type || '--'}</td>
      <td>${pctCell(c.deck_rate)}</td>
      <td>${winrateCell(c.deck_winrate, c.deck_count)}</td>
      <td>${pctCell(c.played_rate)}</td>
      <td>${winrateCell(c.played_winrate, c.played_count)}</td>
    </tr>
  `).join('');

  // Update sort indicators on headers
  updateSortHeaders(sortKey, sortDir);
}

function updateSortHeaders(sortKey, sortDir) {
  const headers = document.querySelectorAll('#card-table th.sortable');
  headers.forEach(th => {
    th.classList.remove('sorted-asc', 'sorted-desc');
    if (th.dataset.sort === sortKey) {
      th.classList.add(sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
    }
  });
}

function initCardTableSorting(cardStats) {
  const headers = document.querySelectorAll('#card-table th.sortable');
  headers.forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (cardSortKey === key) {
        cardSortDir = cardSortDir === 'desc' ? 'asc' : 'desc';
      } else {
        cardSortKey = key;
        // Default direction: desc for numbers, asc for strings
        cardSortDir = ['name', 'faction', 'type'].includes(key) ? 'asc' : 'desc';
      }
      renderCardTable(cardStats, currentFaction, cardSortKey, cardSortDir);
    });
  });
}

// ─── Meta Trends Chart ─────────────────────────────────────────

function renderMetaChart(trends) {
  const canvas = document.getElementById('meta-chart');
  if (!trends || !canvas) return;

  if (metaChart) {
    metaChart.destroy();
    metaChart = null;
  }

  const activeFactions = Object.entries(trends.factions || {})
    .filter(([, data]) => data.some(v => v > 0));

  const datasets = activeFactions.map(([faction, data]) => ({
    label: FACTION_LABELS[faction] || faction,
    data: data,
    borderColor: FACTION_COLORS[faction] || '#888',
    backgroundColor: 'transparent',
    tension: 0.3,
    pointRadius: 2,
    pointHoverRadius: 5,
    borderWidth: 2,
  }));

  metaChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: trends.dates || [],
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: {
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 16,
          },
        },
        tooltip: {
          backgroundColor: '#21262d',
          borderColor: '#30363d',
          borderWidth: 1,
          titleColor: '#e6edf3',
          bodyColor: '#8b949e',
          padding: 10,
          cornerRadius: 6,
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y}%`,
          },
        },
      },
      scales: {
        y: {
          min: 0,
          max: 100,
          stacked: true,
          ticks: {
            callback: v => v + '%',
          },
          grid: { color: '#21262d' },
        },
        x: {
          ticks: {
            maxTicksLimit: 15,
            maxRotation: 45,
          },
          grid: { display: false },
        },
      },
    },
  });
}

// ─── Filters ───────────────────────────────────────────────────

function initFactionFilters(cardStats) {
  const buttons = document.querySelectorAll('.filter-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFaction = btn.dataset.faction;
      renderCardTable(cardStats, currentFaction, cardSortKey, cardSortDir);
    });
  });
}

function initTimeFilters() {
  const buttons = document.querySelectorAll('.time-btn');
  const dateFrom = document.getElementById('date-from');
  const dateTo = document.getElementById('date-to');

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Clear custom date inputs when a preset is selected
      dateFrom.value = '';
      dateTo.value = '';

      // Time filtering will be wired to pipeline-generated data in a follow-up
      // For now the UI is functional but all buttons show "All" data
    });
  });

  // Custom date range — clear preset buttons when dates are manually entered
  const onDateChange = () => {
    if (dateFrom.value || dateTo.value) {
      buttons.forEach(b => b.classList.remove('active'));
    }
  };
  dateFrom.addEventListener('change', onDateChange);
  dateTo.addEventListener('change', onDateChange);
}

// ─── Init ──────────────────────────────────────────────────────

async function init() {
  appData = await loadAllData();
  const data = appData;

  renderMetadata(data.metadata);
  renderCommanderCards(data.commanderStats, data.commanders);
  renderCommanderTable(data.commanderStats);
  renderCommanderChart(data.commanderStats);
  renderMatchups(data.matchups);
  renderCardTable(data.cardStats, 'all', cardSortKey, cardSortDir);
  renderMetaChart(data.trends);

  initFactionFilters(data.cardStats || []);
  initCardTableSorting(data.cardStats || []);
  initTimeFilters();

  // Update unique cards stat
  if (data.cardStats) {
    el('stat-cards', data.cardStats.length.toLocaleString());
  }

  // Update top commander stat
  if (data.commanderStats && data.commanderStats.length) {
    const top = [...data.commanderStats].sort((a, b) => b.matches - a.matches)[0];
    el('stat-top-commander', top.name);

    const best = [...data.commanderStats].sort((a, b) => b.winrate - a.winrate)[0];
    el('stat-best-wr', `${best.name} (${(best.winrate * 100).toFixed(1)}%)`);
  }
}

document.addEventListener('DOMContentLoaded', init);
