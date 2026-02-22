/**
 * Atlas Conquest Analytics — Home Page
 *
 * Overview stats, distribution charts, and quick links.
 */

// ─── Page State ─────────────────────────────────────────────

let distCharts = {};

// ─── Distribution Charts ────────────────────────────────────

function renderDistributionChart(canvasId, data, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !data) return null;

  if (distCharts[canvasId]) {
    distCharts[canvasId].destroy();
    distCharts[canvasId] = null;
  }

  distCharts[canvasId] = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: data.labels,
      datasets: [{
        data: data.counts,
        backgroundColor: color + '99',
        borderColor: color,
        borderWidth: 1,
        borderRadius: 3,
        barPercentage: 0.9,
        categoryPercentage: 0.95,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...CHART_TOOLTIP,
          padding: 8,
          callbacks: {
            label: ctx => `${ctx.parsed.y} games`,
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: '#21262d' },
          ticks: { font: { size: 10 } },
        },
        x: {
          grid: { display: false },
          ticks: { font: { size: 9 }, maxRotation: 45 },
        },
      },
    },
  });
}

function renderDistributions(distributions) {
  if (!distributions) return;
  renderDistributionChart('dist-duration', distributions.duration, '#58a6ff');
  renderDistributionChart('dist-turns', distributions.turns, '#3fb950');
  renderDistributionChart('dist-actions', distributions.actions, '#d2a8ff');
}

// ─── Render All ─────────────────────────────────────────────

function renderAll() {
  const period = currentPeriod;

  const metadata = getPeriodData(appData.metadata, period);
  const commanderStats = getPeriodData(appData.commanderStats, period);
  const cardStats = getPeriodData(appData.cardStats, period);
  const distributions = getPeriodData(appData.gameDistributions, period);

  // Overview stats
  renderMetadata(metadata);
  if (commanderStats && commanderStats.length) {
    const top = [...commanderStats].sort((a, b) => b.matches - a.matches)[0];
    el('stat-top-commander', top.name);
    const best = [...commanderStats].sort((a, b) => b.winrate - a.winrate)[0];
    el('stat-best-wr', `${best.name} (${(best.winrate * 100).toFixed(1)}%)`);
  }
  if (cardStats) {
    el('stat-cards', cardStats.length.toLocaleString());
  }

  // Distributions
  renderDistributions(distributions);
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
