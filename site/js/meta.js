/**
 * Atlas Conquest Analytics — Meta Trends Page
 *
 * Stacked area chart showing faction popularity over time,
 * plus commander matchup heatmap.
 */

// ─── Page State ─────────────────────────────────────────────

let metaChart = null;

// ─── Meta Trends Chart ──────────────────────────────────────

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
    backgroundColor: (FACTION_COLORS[faction] || '#888') + '40',
    fill: true,
    tension: 0.3,
    pointRadius: 0,
    pointHoverRadius: 4,
    borderWidth: 1.5,
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
          ...CHART_TOOLTIP,
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y}%`,
          },
        },
      },
      scales: {
        y: {
          stacked: true,
          min: 0,
          max: 100,
          ticks: { callback: v => v + '%' },
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

// ─── Matchup Heatmap ────────────────────────────────────────

function renderMatchups(matchupData) {
  const table = document.getElementById('matchup-table');
  if (!matchupData || !table) return;

  const cmds = matchupData.commanders;
  const matchups = matchupData.matchups;
  if (!cmds || !cmds.length) return;

  const matchupMap = {};
  cmds.forEach(c => { matchupMap[c] = {}; });
  matchups.forEach(m => {
    matchupMap[m.commander][m.opponent] = m;
  });

  const shortName = name => {
    const parts = name.split(',')[0].split(' ');
    return parts.length > 1 ? parts[0] : name;
  };

  const thead = table.querySelector('thead tr');
  thead.innerHTML = '<th class="matchup-corner"></th>' +
    cmds.map(c => `<th class="matchup-col-header" title="${c}">${shortName(c)}</th>`).join('');

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

  initMatchupTooltip();
}

function initMatchupTooltip() {
  const tooltip = document.getElementById('matchup-tooltip');
  const titleEl = document.getElementById('tooltip-title');
  const wrEl = document.getElementById('tooltip-wr');
  const gamesEl = document.getElementById('tooltip-games');

  const cells = document.querySelectorAll('.matchup-cell[data-type="data"], .matchup-cell[data-type="nodata"]');

  cells.forEach(cell => {
    cell.addEventListener('mouseenter', () => {
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

// ─── Render All ─────────────────────────────────────────────

function renderAll() {
  const period = currentPeriod;
  const metadata = getPeriodData(appData.metadata, period);
  const trends = getPeriodData(appData.trends, period);
  const matchups = getPeriodData(appData.matchups, period);

  renderMetadata(metadata);
  renderMetaChart(trends);
  renderMatchups(matchups);
}

// ─── Init ───────────────────────────────────────────────────

async function init() {
  appData = await loadAllData();
  renderAll();
  initTimeFilters(renderAll);
  initNavActiveState();
  initTooltips();
}

document.addEventListener('DOMContentLoaded', init);
