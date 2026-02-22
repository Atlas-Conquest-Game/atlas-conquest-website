/**
 * Atlas Conquest Analytics — Commanders Page
 *
 * Commander grid, winrate chart/table, matchup heatmap,
 * deck composition charts, and commander detail modal.
 */

// ─── Page State ─────────────────────────────────────────────

let commanderChart = null;
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

// ─── Commander Table & Chart ────────────────────────────────

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
        backgroundColor: sorted.map(c => (FACTION_COLORS[c.faction] || '#888') + 'CC'),
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
          ...CHART_TOOLTIP,
          callbacks: {
            label: ctx => `${ctx.parsed.y}% winrate (${sorted[ctx.dataIndex].matches} games)`,
          },
        },
      },
      scales: {
        y: {
          min: 30,
          max: 70,
          ticks: { callback: v => v + '%' },
          grid: { color: '#21262d' },
        },
        x: {
          ticks: { maxRotation: 45 },
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
  const matchups = getPeriodData(appData.matchups, period);
  const deckComp = getPeriodData(appData.deckComposition, period);

  renderMetadata(metadata);

  // Commander stats
  renderCommanderCards(commanderStats, appData.commanders);
  renderCommanderTable(commanderStats);
  renderCommanderChart(commanderStats);

  // Matchups
  renderMatchups(matchups);

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
  initModal();
  initNavActiveState();
  initTooltips();
}

document.addEventListener('DOMContentLoaded', init);
