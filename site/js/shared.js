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
let currentMap = 'all';

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

const DATA_FILES = {
  metadata: 'data/metadata.json',
  commanderStats: 'data/commander_stats.json',
  cardStats: 'data/card_stats.json',
  trends: 'data/trends.json',
  matchups: 'data/matchups.json',
  commanders: 'data/commanders.json',
  gameDistributions: 'data/game_distributions.json',
  deckComposition: 'data/deck_composition.json',
  firstTurn: 'data/first_turn.json',
  commanderTrends: 'data/commander_trends.json',
  durationWinrates: 'data/duration_winrates.json',
  actionWinrates: 'data/action_winrates.json',
  turnWinrates: 'data/turn_winrates.json',
  commanderWinrateTrends: 'data/commander_winrate_trends.json',
  mulliganStats: 'data/mulligan_stats.json',
};

async function loadData(keys) {
  const results = await Promise.all(keys.map(k => loadJSON(DATA_FILES[k])));
  const data = {};
  keys.forEach((k, i) => { data[k] = results[i]; });
  return data;
}

async function loadCommanderCardStats() {
  if (appData.commanderCardStats) return appData.commanderCardStats;
  appData.commanderCardStats = await loadJSON('data/commander_card_stats.json');
  return appData.commanderCardStats;
}

async function loadMatchupDetails() {
  if (appData.matchupDetails) return appData.matchupDetails;
  appData.matchupDetails = await loadJSON('data/matchup_details.json');
  return appData.matchupDetails;
}

async function loadCommanderMulliganStats() {
  if (appData.commanderMulliganStats) return appData.commanderMulliganStats;
  appData.commanderMulliganStats = await loadJSON('data/commander_mulligan_stats.json');
  return appData.commanderMulliganStats;
}

// ─── Helpers ────────────────────────────────────────────────

function el(id, text) {
  const node = document.getElementById(id);
  if (node) node.textContent = text;
}

function getPeriodData(dataObj, period) {
  if (!dataObj || typeof dataObj !== 'object' || Array.isArray(dataObj)) return dataObj;
  let result = dataObj[period] !== undefined ? dataObj[period] : dataObj;
  // Handle map dimension: data[period][map]
  if (result && typeof result === 'object' && !Array.isArray(result) && result[currentMap] !== undefined) {
    result = result[currentMap];
  }
  return result;
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

function winrateDeltaCell(delta, totalSeen) {
  if (totalSeen !== undefined && totalSeen < 30) {
    return `<span class="winrate-neutral">--</span>`;
  }
  if (delta == null) {
    return `<span class="winrate-neutral">--</span>`;
  }
  const pct = (delta * 100).toFixed(1);
  const sign = delta > 0 ? '+' : '';
  let cls = 'winrate-neutral';
  if (delta > 0.02) cls = 'winrate-positive';
  else if (delta < -0.02) cls = 'winrate-negative';
  return `<span class="${cls}">${sign}${pct}%</span>`;
}

function normKeepDeltaCell(delta, totalSeen) {
  if (totalSeen !== undefined && totalSeen < 30) {
    return `<span class="winrate-neutral">--</span><div class="cell-sub">low sample</div>`;
  }
  if (delta == null) {
    return `<span class="winrate-neutral">--</span>`;
  }
  const pct = (delta * 100).toFixed(1);
  const sign = delta > 0 ? '+' : '';
  let cls = 'winrate-neutral';
  if (delta > 0.03) cls = 'winrate-positive';
  else if (delta < -0.03) cls = 'winrate-negative';
  return `<span class="${cls}">${sign}${pct}%</span>`;
}

function shiftColor(hex, pct) {
  // Lighten a hex color by pct% (e.g. 15 = 15% lighter)
  const num = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((num >> 16) & 0xff) + Math.round(255 * pct / 100));
  const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(255 * pct / 100));
  const b = Math.min(255, (num & 0xff) + Math.round(255 * pct / 100));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
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

// ─── Map Filter ────────────────────────────────────────────

function initMapFilters(renderCallback) {
  const buttons = document.querySelectorAll('.map-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMap = btn.dataset.map;
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

function modalWinrateClass(rate) {
  if (rate === null || rate === undefined) return 'winrate-neutral';
  if (rate > 0.52) return 'winrate-positive';
  if (rate < 0.48) return 'winrate-negative';
  return 'winrate-neutral';
}

function renderModalTopCards(cmdName) {
  const tbody = document.getElementById('modal-top-cards-body');
  if (!tbody) return;

  const cardStats = getPeriodData(appData.commanderCardStats, currentPeriod);
  const cards = cardStats && cardStats[cmdName] ? [...cardStats[cmdName]] : [];
  const topCards = cards.sort((a, b) => b.inclusion_rate - a.inclusion_rate).slice(0, 15);

  if (!topCards.length) {
    tbody.innerHTML = '<tr class="placeholder-row"><td colspan="4">No card inclusion data for this commander.</td></tr>';
    return;
  }

  tbody.innerHTML = topCards.map(card => {
    const drawnClass = modalWinrateClass(card.drawn_winrate);
    const playedClass = modalWinrateClass(card.played_winrate);
    const drawnWr = card.drawn_winrate !== null ? `${(card.drawn_winrate * 100).toFixed(1)}%` : '--';
    const playedWr = card.played_winrate !== null ? `${(card.played_winrate * 100).toFixed(1)}%` : '--';
    return `
      <tr>
        <td>${card.name}</td>
        <td>${(card.inclusion_rate * 100).toFixed(1)}%</td>
        <td><span class="${drawnClass}">${drawnWr}</span></td>
        <td><span class="${playedClass}">${playedWr}</span></td>
      </tr>
    `;
  }).join('');
}

async function openCommanderModal(cmdName) {
  const deckComp = getPeriodData(appData.deckComposition, currentPeriod);
  if (!deckComp || !deckComp[cmdName]) return;

  const commanderStats = getPeriodData(appData.commanderStats, currentPeriod) || [];
  const matchupData = getPeriodData(appData.matchups, currentPeriod);
  const d = deckComp[cmdName];
  const statRow = commanderStats.find(c => c.name === cmdName);
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
    `<strong>${statRow ? statRow.matches.toLocaleString() : d.deck_count.toLocaleString()}</strong> games &middot; ` +
    `Overall WR <strong>${statRow ? (statRow.winrate * 100).toFixed(1) : '--'}%</strong> &middot; ` +
    `Avg cost <strong>${d.avg_cost.toFixed(2)}</strong> &middot; ` +
    `Avg <strong>${d.avg_minion_count.toFixed(1)}</strong> minions, <strong>${d.avg_spell_count.toFixed(1)}</strong> spells`;

  el('modal-overall-wr', statRow ? `${(statRow.winrate * 100).toFixed(1)}%` : '--');
  el('modal-games', statRow ? statRow.matches.toLocaleString() : '--');
  el('modal-decks', d.deck_count.toLocaleString());
  el('modal-avg-cost', d.avg_cost.toFixed(2));

  const cardsBody = document.getElementById('modal-top-cards-body');
  if (cardsBody) {
    cardsBody.innerHTML = '<tr class="placeholder-row"><td colspan="4">Loading card data...</td></tr>';
  }

  // Destroy existing modal charts
  Object.values(modalCharts).forEach(c => c && c.destroy());
  modalCharts = {};

  // Matchup chart
  const matchupCanvas = document.getElementById('modal-matchup-chart');
  if (matchupCanvas && matchupData && matchupData.matchups) {
    const cmdMatchups = matchupData.matchups
      .filter(m => m.commander === cmdName && m.opponent !== cmdName && m.total >= 5)
      .sort((a, b) => b.total - a.total);

    if (cmdMatchups.length) {
      const labels = cmdMatchups.map(m => m.opponent);
      const winrates = cmdMatchups.map(m => m.winrate * 100);
      const colors = cmdMatchups.map(m => (
        m.winrate > 0.52 ? '#3fb95099' : m.winrate < 0.48 ? '#f8514999' : '#8b949e99'
      ));
      const borders = cmdMatchups.map(m => (
        m.winrate > 0.52 ? '#3fb950' : m.winrate < 0.48 ? '#f85149' : '#8b949e'
      ));

      modalCharts.matchup = new Chart(matchupCanvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Winrate',
            data: winrates,
            backgroundColor: colors,
            borderColor: borders,
            borderWidth: 1,
            borderRadius: 3,
          }],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              ...CHART_TOOLTIP,
              callbacks: {
                label: (ctx) => {
                  const m = cmdMatchups[ctx.dataIndex];
                  return `${ctx.parsed.x.toFixed(1)}% (${m.wins}-${m.losses}, ${m.total} games)`;
                },
              },
            },
          },
          scales: {
            x: {
              beginAtZero: true,
              max: 100,
              grid: { color: '#21262d' },
              title: { display: true, text: 'Winrate %', color: '#8b949e', font: { size: 11 } },
            },
            y: {
              grid: { display: false },
              ticks: { font: { size: 10 } },
            },
          },
        },
      });
    }
  }

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

  await loadCommanderCardStats();
  if (document.getElementById('modal-name') && document.getElementById('modal-name').textContent === cmdName) {
    renderModalTopCards(cmdName);
  }
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
