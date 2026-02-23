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
  renderCommanderTable(commanderStats);
  renderCommanderChart(commanderStats);

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
