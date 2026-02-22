/**
 * Atlas Conquest Analytics — Shared Module
 *
 * Constants, helpers, data loading, time filter, modal, and tooltip system.
 * Loaded first on every page via <script src="js/shared.js">.
 * Uses plain globals (no ES modules) — no build step needed.
 */

// ─── Constants ──────────────────────────────────────────────

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

// Shared chart tooltip style
const CHART_TOOLTIP = {
  backgroundColor: '#21262d',
  borderColor: '#30363d',
  borderWidth: 1,
  titleColor: '#e6edf3',
  bodyColor: '#8b949e',
  padding: 10,
  cornerRadius: 6,
};

// ─── Shared State ───────────────────────────────────────────

let appData = {};
let currentPeriod = 'all';

// ─── Data Loading ───────────────────────────────────────────

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
  const [metadata, commanderStats, cardStats, trends, matchups, commanders, gameDistributions, deckComposition] = await Promise.all([
    loadJSON('data/metadata.json'),
    loadJSON('data/commander_stats.json'),
    loadJSON('data/card_stats.json'),
    loadJSON('data/trends.json'),
    loadJSON('data/matchups.json'),
    loadJSON('data/commanders.json'),
    loadJSON('data/game_distributions.json'),
    loadJSON('data/deck_composition.json'),
  ]);
  return { metadata, commanderStats, cardStats, trends, matchups, commanders, gameDistributions, deckComposition };
}

// ─── Helpers ────────────────────────────────────────────────

function el(id, text) {
  const node = document.getElementById(id);
  if (node) node.textContent = text;
}

function getPeriodData(dataObj, period) {
  if (dataObj && typeof dataObj === 'object' && !Array.isArray(dataObj) && dataObj[period] !== undefined) {
    return dataObj[period];
  }
  return dataObj;
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

function sortedCommanders(deckComp) {
  return Object.entries(deckComp)
    .sort((a, b) => b[1].deck_count - a[1].deck_count);
}

// ─── Metadata (hero stats) ──────────────────────────────────

function renderMetadata(metadata) {
  if (!metadata) return;
  el('hero-matches', `${metadata.total_matches.toLocaleString()} matches`);
  el('hero-updated', `Last updated: ${new Date(metadata.last_updated).toLocaleDateString()}`);
  el('stat-matches', metadata.total_matches.toLocaleString());
}

// ─── Time Filter ────────────────────────────────────────────

function initTimeFilters(renderCallback) {
  const buttons = document.querySelectorAll('.time-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentPeriod = btn.dataset.period;
      if (renderCallback) renderCallback();
    });
  });
}

// ─── Nav Active State ───────────────────────────────────────

function initNavActiveState() {
  const pageName = window.location.pathname.split('/').pop() || 'index.html';
  const currentPage = pageName === '' ? 'index.html' : pageName;
  const links = document.querySelectorAll('.nav-link');
  links.forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPage) {
      link.classList.add('active');
    }
  });
}

// ─── Commander Detail Modal ─────────────────────────────────

let modalCharts = {};

function openCommanderModal(cmdName) {
  const deckComp = getPeriodData(appData.deckComposition, currentPeriod);
  if (!deckComp || !deckComp[cmdName]) return;

  const d = deckComp[cmdName];
  const modal = document.getElementById('commander-modal');
  if (!modal) return;

  // Header
  const artLookup = {};
  if (appData.commanders) {
    appData.commanders.forEach(c => { artLookup[c.name] = c.art; });
  }

  const artEl = document.getElementById('modal-art');
  const artPath = artLookup[cmdName];
  if (artPath) {
    artEl.src = artPath;
    artEl.style.display = '';
  } else {
    artEl.style.display = 'none';
  }

  document.getElementById('modal-name').textContent = cmdName;
  document.getElementById('modal-faction').innerHTML = factionBadge(d.faction);
  document.getElementById('modal-summary').innerHTML =
    `<strong>${d.deck_count}</strong> decks analyzed &middot; ` +
    `Avg cost <strong>${d.avg_cost.toFixed(2)}</strong> &middot; ` +
    `Avg <strong>${d.avg_minion_count.toFixed(1)}</strong> minions, <strong>${d.avg_spell_count.toFixed(1)}</strong> spells`;

  // Destroy existing modal charts
  Object.values(modalCharts).forEach(c => c && c.destroy());
  modalCharts = {};

  // Cost histogram: all / win / loss
  const costCanvas = document.getElementById('modal-cost-chart');
  if (costCanvas && d.cost_histogram) {
    modalCharts.cost = new Chart(costCanvas, {
      type: 'bar',
      data: {
        labels: d.cost_histogram.labels,
        datasets: [
          {
            label: 'All Decks',
            data: d.cost_histogram.all_decks,
            backgroundColor: '#58a6ff88',
            borderColor: '#58a6ff',
            borderWidth: 1,
            borderRadius: 3,
          },
          {
            label: 'Winning',
            data: d.cost_histogram.winning_decks,
            backgroundColor: '#3fb95088',
            borderColor: '#3fb950',
            borderWidth: 1,
            borderRadius: 3,
          },
          {
            label: 'Losing',
            data: d.cost_histogram.losing_decks,
            backgroundColor: '#f8514988',
            borderColor: '#f85149',
            borderWidth: 1,
            borderRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            labels: { usePointStyle: true, pointStyle: 'circle', padding: 14, font: { size: 11 } },
          },
          tooltip: {
            ...CHART_TOOLTIP,
            callbacks: {
              label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)} avg cards`,
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: '#21262d' },
            title: { display: true, text: 'Avg Cards at Cost', color: '#8b949e', font: { size: 11 } },
          },
          x: {
            grid: { display: false },
            title: { display: true, text: 'Mana Cost', color: '#8b949e', font: { size: 11 } },
          },
        },
      },
    });
  }

  // Type donut
  const typeCanvas = document.getElementById('modal-type-donut');
  if (typeCanvas) {
    modalCharts.type = new Chart(typeCanvas, {
      type: 'doughnut',
      data: {
        labels: ['Minions', 'Spells'],
        datasets: [{
          data: [d.avg_minion_count, d.avg_spell_count],
          backgroundColor: ['#3fb95099', '#d2a8ff99'],
          borderColor: ['#3fb950', '#d2a8ff'],
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { usePointStyle: true, pointStyle: 'circle', padding: 14, font: { size: 11 } },
          },
          tooltip: {
            ...CHART_TOOLTIP,
            callbacks: {
              label: ctx => `${ctx.label}: ${ctx.parsed.toFixed(1)} avg cards`,
            },
          },
        },
      },
    });
  }

  // Loyalty donut
  const loyaltyCanvas = document.getElementById('modal-loyalty-donut');
  if (loyaltyCanvas) {
    modalCharts.loyalty = new Chart(loyaltyCanvas, {
      type: 'doughnut',
      data: {
        labels: ['Patron', 'Neutral', 'Other Faction'],
        datasets: [{
          data: [d.avg_patron_cards, d.avg_neutral_cards, d.avg_other_cards],
          backgroundColor: ['#58a6ff99', '#A8907899', '#f8514966'],
          borderColor: ['#58a6ff', '#A89078', '#f85149'],
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { usePointStyle: true, pointStyle: 'circle', padding: 14, font: { size: 11 } },
          },
          tooltip: {
            ...CHART_TOOLTIP,
            callbacks: {
              label: ctx => `${ctx.label}: ${ctx.parsed.toFixed(1)} avg cards`,
            },
          },
        },
      },
    });
  }

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  document.body.classList.add('modal-open');
}

function closeCommanderModal() {
  const modal = document.getElementById('commander-modal');
  if (!modal) return;
  modal.classList.remove('open');
  document.body.style.overflow = '';
  document.body.classList.remove('modal-open');
  Object.values(modalCharts).forEach(c => c && c.destroy());
  modalCharts = {};
}

function initModal() {
  const modal = document.getElementById('commander-modal');
  const closeBtn = document.getElementById('modal-close');

  if (closeBtn) {
    closeBtn.addEventListener('click', closeCommanderModal);
  }

  if (modal) {
    modal.addEventListener('click', e => {
      if (e.target === modal) closeCommanderModal();
    });
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeCommanderModal();
  });
}

// ─── Tooltip System ─────────────────────────────────────────

function initTooltips() {
  const tooltipEl = document.createElement('div');
  tooltipEl.className = 'info-tooltip';
  document.body.appendChild(tooltipEl);

  document.addEventListener('mouseover', e => {
    const target = e.target.closest('[data-tooltip]');
    if (!target) return;

    tooltipEl.textContent = target.dataset.tooltip;
    tooltipEl.classList.add('visible');

    const rect = target.getBoundingClientRect();
    tooltipEl.style.left = rect.left + 'px';
    tooltipEl.style.top = (rect.bottom + 8) + 'px';

    // Keep within viewport
    requestAnimationFrame(() => {
      const tipRect = tooltipEl.getBoundingClientRect();
      if (tipRect.right > window.innerWidth - 12) {
        tooltipEl.style.left = (window.innerWidth - tipRect.width - 12) + 'px';
      }
      if (tipRect.bottom > window.innerHeight - 12) {
        tooltipEl.style.top = (rect.top - tipRect.height - 8) + 'px';
      }
    });
  });

  document.addEventListener('mouseout', e => {
    const target = e.target.closest('[data-tooltip]');
    if (!target) return;
    tooltipEl.classList.remove('visible');
  });
}
