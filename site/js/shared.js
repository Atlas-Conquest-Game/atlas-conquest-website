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
  // Minor patrons — a card or two each, see --adora/--mechanus/--treasure
  adora: '#CC79A7',
  mechanus: '#A9714B',
  treasure: '#EDD9A0',
};

const FACTION_LABELS = {
  skaal: 'Skaal',
  grenalia: 'Grenalia',
  lucia: 'Lucia',
  neutral: 'Neutral',
  shadis: 'Shadis',
  archaeon: 'Archaeon',
  adora: 'Adora',
  mechanus: 'Mechanus',
  treasure: 'Treasure',
};

// Chart theme — mirrors the CSS tokens in site/css/variables.css so canvases
// sit on the navy panels like the rest of the UI. Use these instead of hex
// literals in page scripts (e.g. `grid: { color: CHART_THEME.grid }`).
const CHART_THEME = Object.freeze({
  font: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  text: '#b3ada1',        // --text-secondary: ticks, legend, axis titles
  textStrong: '#ede7da',  // --text: tooltip titles, emphasised labels
  muted: '#948d81',       // --text-muted
  grid: '#1f2838',        // gridlines on --bg-card
  axis: '#2b3549',        // axis baseline
  surface: '#131924',     // --bg-card: doughnut segment separators
  tooltipBg: 'rgba(22, 29, 42, 0.97)',
  tooltipBorder: 'rgba(232, 162, 69, 0.3)',
  gold: '#e8a245',
  goldFill: 'rgba(232, 162, 69, 0.7)',
  goldSoft: 'rgba(232, 162, 69, 0.18)',
  // Steel blue pairs with gold for two-part splits (first/second turn,
  // minions/spells); the pair stays distinct under common CVD types.
  steel: '#9db4dc',
  steelFill: 'rgba(126, 154, 201, 0.6)',
  // Recessive slate for "everything else" segments.
  slate: '#7d8aa0',
  slateFill: 'rgba(110, 122, 144, 0.55)',
  positive: '#3fb950',
  positiveFill: 'rgba(63, 185, 80, 0.55)',
  negative: '#f85149',
  negativeFill: 'rgba(248, 81, 73, 0.5)',
});

// Shared chart tooltip style (spread into per-chart tooltip options)
const CHART_TOOLTIP = {
  backgroundColor: CHART_THEME.tooltipBg,
  borderColor: CHART_THEME.tooltipBorder,
  borderWidth: 1,
  titleColor: CHART_THEME.textStrong,
  bodyColor: '#d6d0c4',
  footerColor: CHART_THEME.text,
  titleFont: { weight: '600' },
  padding: { top: 9, right: 12, bottom: 9, left: 12 },
  cornerRadius: 8,
  boxPadding: 5,
  caretSize: 5,
};

// Chart.js global defaults. Guarded because the Articles pages load
// shared.js (for the nav and card preview) without Chart.js — an unguarded
// reference throws and halts the rest of this file's top-level execution.
if (typeof Chart !== 'undefined') {
  Chart.defaults.color = CHART_THEME.text;
  Chart.defaults.borderColor = CHART_THEME.grid;
  Chart.defaults.font.family = CHART_THEME.font;
  Chart.defaults.font.size = 12;
  Chart.defaults.scale.border.color = CHART_THEME.axis;
  Object.assign(Chart.defaults.plugins.tooltip, CHART_TOOLTIP);
  Object.assign(Chart.defaults.plugins.legend.labels, {
    color: CHART_THEME.text,
    boxWidth: 10,
    boxHeight: 10,
    padding: 14,
    useBorderRadius: true,
    borderRadius: 2,
  });
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    Chart.defaults.animation = false;
  }
}

// ─── Shared State ───────────────────────────────────────────

let appData = {};
// Default window is the last 3 months — recent enough to reflect the current
// card pool and balance, long enough for usable sample sizes.
let currentPeriod = '3m';
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
  feedbackStats: 'data/feedback_stats.json',
  archetypes: 'data/archetypes.json',
  goals: 'data/goals.json',
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

// One date style across the site ("Oct 5, 2026") — unambiguous outside the
// US, and the same as the article bylines and legal pages.
const AC_DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
function formatSiteDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? '--' : AC_DATE_FORMAT.format(d);
}

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

/**
 * Comparator helper: push rows with NA values to the bottom regardless of sort direction.
 * Use inside Array.prototype.sort. `aEmpty` / `bEmpty` should be computed by the caller
 * using the same NA rule that the display (winrateCell / winrateDeltaCell / etc.) uses,
 * so sort order matches what the user sees as `--`.
 */
function compareNALast(aEmpty, bEmpty, aVal, bVal, dir) {
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  return dir === 'asc' ? aVal - bVal : bVal - aVal;
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

// Card art file slug. Slightly more permissive than commanderSlug — also strips
// periods, in case a card name ever contains one. Kept in shared.js so any page
// (decks, articles, cards modals) can build /assets/cards/<slug>.jpg paths.
function cardArtSlug(name) {
  return (name || '').toLowerCase().replace(/[,.']/g, '').replace(/\s+/g, '-');
}

function sortedCommanders(deckComp) {
  return Object.entries(deckComp)
    .sort((a, b) => b[1].deck_count - a[1].deck_count);
}

// ─── Metadata (hero stats) ──────────────────────────────────

function renderMetadata(metadata) {
  if (!metadata) return;
  el('hero-matches', `${metadata.total_matches.toLocaleString()} matches`);
  el('hero-updated', `Last updated: ${formatSiteDate(metadata.last_updated)}`);
  el('stat-matches', metadata.total_matches.toLocaleString());
}

// ─── Filter Dropdowns (mobile) ──────────────────────────────

// Build a native <select> mirroring a set of filter buttons. On mobile the
// buttons are hidden via CSS and the select is shown, so the period/map
// controls fit on narrow screens instead of overflowing off the right edge.
function buildFilterSelect(buttons, dataKey, insertAfterNode) {
  if (!buttons.length || !insertAfterNode) return null;
  const select = document.createElement('select');
  select.className = 'filter-select';
  select.setAttribute('aria-label', dataKey === 'period' ? 'Time period' : 'Map');
  buttons.forEach(btn => {
    const opt = document.createElement('option');
    opt.value = btn.dataset[dataKey];
    opt.textContent = btn.textContent.trim();
    if (btn.classList.contains('active')) opt.selected = true;
    select.appendChild(opt);
  });
  insertAfterNode.insertAdjacentElement('afterend', select);
  return select;
}

// ─── Time Filter ────────────────────────────────────────────

// The sticky bar's own buttons only — meta.html's matchup modal reuses the
// .time-btn/.map-btn classes for its private filter row.
function filterBarButtons(cls) {
  const scoped = document.querySelectorAll(`#time-filter-bar .${cls}`);
  return Array.from(scoped.length ? scoped : document.querySelectorAll(`.${cls}:not(.modal-${cls})`));
}

function initTimeFilters(renderCallback) {
  const buttons = filterBarButtons('time-btn');
  const select = buildFilterSelect(buttons, 'period', buttons[buttons.length - 1]);
  const apply = value => {
    buttons.forEach(b => b.classList.toggle('active', b.dataset.period === value));
    if (select) select.value = value;
    currentPeriod = value;
    if (renderCallback) renderCallback();
  };
  buttons.forEach(btn => btn.addEventListener('click', () => apply(btn.dataset.period)));
  if (select) select.addEventListener('change', () => apply(select.value));
}

// ─── Map Filter ────────────────────────────────────────────

function initMapFilters(renderCallback) {
  const buttons = filterBarButtons('map-btn');
  const select = buildFilterSelect(buttons, 'map', buttons[buttons.length - 1]);
  const apply = value => {
    buttons.forEach(b => b.classList.toggle('active', b.dataset.map === value));
    if (select) select.value = value;
    currentMap = value;
    if (renderCallback) renderCallback();
  };
  buttons.forEach(btn => btn.addEventListener('click', () => apply(btn.dataset.map)));
  if (select) select.addEventListener('change', () => apply(select.value));
}

// ─── Nav Active State ───────────────────────────────────────

function initNavActiveState() {
  // The primary nav's current item is written statically (aria-current, by
  // scripts/sync_chrome.py), so only the analytics sub-nav is marked here.
  const pageName = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.sub-nav-link').forEach(link => {
    if (link.getAttribute('href') === pageName) link.classList.add('active');
  });
}

// ─── Modal Focus Management ─────────────────────────────────

// The analytics modals are plain overlays (role="dialog" aria-modal="true"),
// so focus handling is ours: on open, remember the opener, make everything
// behind the dialog inert, move focus to the dialog's Close button and keep
// Tab inside it; on close, undo all of that and put focus back on the opener.
// Same contract as the trailer modal in site-config.js.
const _acModalState = new Map();
const AC_FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function acModalOpen(modal, opener) {
  if (!modal) return;
  if (_acModalState.has(modal)) return; // already open (e.g. re-render inside it)
  const from = opener || document.activeElement;
  const inerted = [];
  // Inert every sibling of the dialog and of each of its ancestors up to
  // <body>, so it works whether the overlay sits beside <main> or inside it.
  for (let node = modal; node && node !== document.body; node = node.parentElement) {
    const parent = node.parentElement;
    if (!parent) break;
    Array.from(parent.children).forEach(sib => {
      if (sib === node || sib.inert) return;
      if (sib.tagName === 'SCRIPT' || sib.id === 'card-preview' || sib.classList.contains('info-tooltip')) return;
      sib.inert = true;
      inerted.push(sib);
    });
  }
  const onKey = e => {
    if (e.key !== 'Tab') return;
    const items = Array.from(modal.querySelectorAll(AC_FOCUSABLE))
      .filter(n => n.offsetParent !== null || n === document.activeElement);
    if (!items.length) { e.preventDefault(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  };
  modal.addEventListener('keydown', onKey);
  _acModalState.set(modal, { from, inerted, onKey });
  const target = modal.querySelector('.modal-close') || modal.querySelector(AC_FOCUSABLE);
  if (target) target.focus({ preventScroll: true });
}

function acModalClose(modal) {
  const state = modal && _acModalState.get(modal);
  if (!state) return;
  _acModalState.delete(modal);
  modal.removeEventListener('keydown', state.onKey);
  state.inerted.forEach(node => { node.inert = false; });
  let back = state.from;
  // The opener may have been re-rendered while the dialog was up (period
  // change): fall back to its replacement, matched by data-commander.
  if (back && !document.contains(back) && back.dataset && back.dataset.commander) {
    back = document.querySelector(`[data-commander="${CSS.escape(back.dataset.commander)}"][tabindex]`);
  }
  if (back && typeof back.focus === 'function' && document.contains(back) && back !== document.body) {
    back.focus({ preventScroll: true });
  }
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

  // Matchup chart. Every opponent this commander has met, most-played first;
  // each label carries its game count, and the bar's weight follows the sample:
  // full colour from 20 games, faded below that, and under 5 games (the
  // heatmap's cut-off) no bar at all — just "too few games to call".
  const matchupCanvas = document.getElementById('modal-matchup-chart');
  if (matchupCanvas && matchupData && matchupData.matchups) {
    const cmdMatchups = matchupData.matchups
      .filter(m => m.commander === cmdName && m.opponent !== cmdName && m.total > 0)
      .sort((a, b) => b.total - a.total || b.winrate - a.winrate);

    if (cmdMatchups.length) {
      const MIN_SHOWN = 5;
      const FULL_WEIGHT = 20;
      const thin = m => m.total < MIN_SHOWN;
      const labels = cmdMatchups.map(m => `${m.opponent} · ${m.total}`);
      const winrates = cmdMatchups.map(m => (thin(m) ? null : m.winrate * 100));
      const tone = m => (m.winrate > 0.52 ? [63, 185, 80] : m.winrate < 0.48 ? [248, 81, 73] : [179, 173, 161]);
      const colors = cmdMatchups.map(m => `rgba(${tone(m).join(', ')}, ${m.total < FULL_WEIGHT ? 0.32 : 0.62})`);
      const borders = cmdMatchups.map(m => `rgba(${tone(m).join(', ')}, ${m.total < FULL_WEIGHT ? 0.55 : 1})`);
      // Under 5 games there is no bar, just a muted note where it would start.
      const thinNote = {
        id: 'acThinNote',
        afterDatasetsDraw(chart) {
          const { ctx, scales } = chart;
          ctx.save();
          ctx.font = `italic 11px ${CHART_THEME.font}`;
          ctx.fillStyle = CHART_THEME.muted;
          ctx.textBaseline = 'middle';
          cmdMatchups.forEach((m, i) => {
            if (!thin(m)) return;
            ctx.fillText('too few games to call', scales.x.getPixelForValue(0) + 6, scales.y.getPixelForValue(i));
          });
          ctx.restore();
        },
      };
      const evenLine = {
        id: 'acEvenLine',
        afterDatasetsDraw(chart) {
          const { ctx, chartArea, scales } = chart;
          const x = scales.x.getPixelForValue(50);
          ctx.save();
          ctx.strokeStyle = 'rgba(237, 231, 218, 0.45)';
          ctx.setLineDash([4, 4]);
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x, chartArea.top); ctx.lineTo(x, chartArea.bottom); ctx.stroke();
          ctx.restore();
        },
      };

      const wrap = matchupCanvas.parentElement;
      if (wrap) wrap.style.height = `${Math.max(180, cmdMatchups.length * 26 + 60)}px`;

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
            minBarLength: 3, // a 0% matchup still shows a sliver
          }],
        },
        plugins: [evenLine, thinNote],
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              ...CHART_TOOLTIP,
              callbacks: {
                label: (ctx) => {
                  const m = cmdMatchups[ctx.dataIndex];
                  if (thin(m)) return `-- (only ${m.total} game${m.total === 1 ? '' : 's'}: too few to call)`;
                  const note = m.total < FULL_WEIGHT ? ' · small sample' : '';
                  return `${(m.winrate * 100).toFixed(1)}% (${m.wins}-${m.losses}, ${m.total} games)${note}`;
                },
              },
            },
          },
          scales: {
            x: {
              beginAtZero: true,
              max: 100,
              grid: { color: CHART_THEME.grid },
              ticks: { callback: v => `${v}%` },
              title: { display: true, text: 'Winrate (dashed line = 50%)', color: CHART_THEME.text, font: { size: 11 } },
            },
            y: {
              grid: { display: false },
              ticks: { font: { size: 10 }, autoSkip: false },
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
            backgroundColor: CHART_THEME.goldFill,
            borderColor: CHART_THEME.gold,
            borderWidth: 1,
            borderRadius: 3,
          },
          {
            label: 'Winning',
            data: d.cost_histogram.winning_decks,
            backgroundColor: CHART_THEME.positiveFill,
            borderColor: CHART_THEME.positive,
            borderWidth: 1,
            borderRadius: 3,
          },
          {
            label: 'Losing',
            data: d.cost_histogram.losing_decks,
            backgroundColor: CHART_THEME.negativeFill,
            borderColor: CHART_THEME.negative,
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
            grid: { color: CHART_THEME.grid },
            title: { display: true, text: 'Avg Cards at Cost', color: CHART_THEME.text, font: { size: 11 } },
          },
          x: {
            grid: { display: false },
            title: { display: true, text: 'Mana Cost', color: CHART_THEME.text, font: { size: 11 } },
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
          backgroundColor: [CHART_THEME.goldFill, CHART_THEME.steelFill],
          borderColor: [CHART_THEME.gold, CHART_THEME.steel],
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
          backgroundColor: [CHART_THEME.goldFill, 'rgba(168, 144, 120, 0.6)', CHART_THEME.slateFill],
          borderColor: [CHART_THEME.gold, FACTION_COLORS.neutral, CHART_THEME.slate],
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
  acModalOpen(modal);

  await loadCommanderCardStats();
  if (document.getElementById('modal-name') && document.getElementById('modal-name').textContent === cmdName) {
    renderModalTopCards(cmdName);
  }
}

function closeCommanderModal() {
  const modal = document.getElementById('commander-modal');
  if (!modal || !modal.classList.contains('open')) return;
  modal.classList.remove('open');
  acModalClose(modal);
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

// ─── Card Art Hover Preview ─────────────────────────────────

// Page-wide card-image popup that follows the cursor. Looks at the element under
// the cursor and walks up to find a card identifier on:
//   .deck-card-row[data-card]
//   .article-deck-row[data-card]
//   .card-link[data-card]
//   .card-art-inline[data-card]
//   .deck-commander-section[data-commander]   (or any ancestor with [data-commander])
//   .card-tile-art-wrap  →  closest .card-tile[data-name]
//   tr[data-card-slug]   (cards table on the Cards page)
// The image is served from /assets/card-art-png/<slug>.png (transparent
// corners, generated by scripts/pipeline/io_helpers.py:generate_thumbnails).
// Every card in CardScreenshots/ is PNG today so the popup is guaranteed to
// resolve; if a future asset is added without a matching PNG the popup just
// hides via the onerror handler.
//
// Contents and placement come from site/js/cardpreview.js, which also pulls in
// any cards this one creates so they render side-by-side.
function initCardPreview() {
  let preview = document.getElementById('card-preview');
  if (!preview) {
    preview = document.createElement('div');
    preview.id = 'card-preview';
    preview.className = 'card-preview';
    document.body.appendChild(preview);
  }
  const srcFor = slug => `/assets/card-art-png/${slug}.png`;

  function slugFor(target) {
    if (!target || target.nodeType !== 1) return null;
    const named = target.closest(
      '.deck-card-row[data-card], .article-deck-row[data-card], ' +
      '.card-link[data-card], .card-art-inline[data-card], [data-card]'
    );
    if (named && named.dataset.card) return cardArtSlug(named.dataset.card);
    const trSlug = target.closest('tr[data-card-slug]');
    if (trSlug && trSlug.dataset.cardSlug) return trSlug.dataset.cardSlug;
    const cmd = target.closest('[data-commander]');
    if (cmd && cmd.dataset.commander) return cardArtSlug(cmd.dataset.commander);
    const artWrap = target.closest('.card-tile-art-wrap');
    if (artWrap) {
      const tile = artWrap.closest('.card-tile');
      const name = tile && tile.dataset.name;
      if (name) return cardArtSlug(name);
    }
    return null;
  }

  document.addEventListener('mouseover', e => {
    const slug = slugFor(e.target);
    if (!slug) { preview.classList.remove('visible'); return; }
    renderCardPreview(preview, slug, srcFor);
    preview.classList.add('visible');
  });

  document.addEventListener('mousemove', e => {
    if (!preview.classList.contains('visible')) return;
    positionCardPreview(preview, e);
  });

  document.addEventListener('mouseout', e => {
    if (!slugFor(e.target)) {
      preview.classList.remove('visible');
    }
  });
}

// ─── Sticky Table Header ────────────────────────────────────

/**
 * Pin a long table's column headers under the sticky nav stack.
 *
 * The Cards table runs several hundred rows — tall enough that the
 * header, which carries the sort indicator, scrolls out of reach within one
 * screen and leaves you staring at columns of near-identical percentages.
 *
 * This clones the header row into a fixed-position element rather than making
 * the real `thead` sticky, because sticky can't work here: `.table-wrapper` sets
 * `overflow-x: auto`, which per spec makes it a scroll container on both axes,
 * so a sticky `thead` inside it sticks to the wrapper's scrollport — which is as
 * tall as the table and never scrolls. See the note on .sticky-table-header in
 * components.css for why capping the wrapper's height isn't the answer either.
 *
 * The clone is inert to assistive tech (the real header is still in the tree);
 * clicks on it are forwarded to the matching real header so sorting works.
 */
function initStickyTableHeader(table) {
  const wrapper = table && table.closest('.table-wrapper');
  if (!table || !wrapper || !table.tHead) return;

  const holder = document.createElement('div');
  holder.className = 'sticky-table-header';
  holder.setAttribute('aria-hidden', 'true');
  const clone = document.createElement('table');
  clone.className = table.className;
  holder.appendChild(clone);
  document.body.appendChild(holder);

  // Content (column widths, sort arrows) only needs rebuilding when the table
  // re-renders or the viewport changes — not on every scroll frame.
  let dirty = true;
  let queued = false;

  function stickyStack() {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--sticky-stack');
    return parseFloat(raw) || 0;
  }

  function rebuild() {
    clone.innerHTML = table.tHead.outerHTML;
    // The clone is aria-hidden; keep its copies of the "?" chips untabbable.
    clone.querySelectorAll('[tabindex]').forEach(n => n.setAttribute('tabindex', '-1'));
    // Auto table layout sizes columns to content, and the clone has only the
    // header's short strings to go on — so copy the real widths across.
    const real = table.tHead.rows[0].cells;
    const copy = clone.rows[0].cells;
    for (let i = 0; i < copy.length && i < real.length; i++) {
      copy[i].style.width = `${real[i].getBoundingClientRect().width}px`;
    }
    clone.style.width = `${table.getBoundingClientRect().width}px`;
    dirty = false;
  }

  function update() {
    const head = table.tHead;
    const tableRect = table.getBoundingClientRect();
    const headHeight = head.getBoundingClientRect().height;
    const top = stickyStack();
    // Show it only once the real header has scrolled past, and hide it again
    // when the table's last rows go by — no floating header over the footer.
    const show = tableRect.top < top && tableRect.bottom > top + headHeight;
    holder.classList.toggle('visible', show);
    if (!show) return;

    if (dirty) rebuild();
    const wrapRect = wrapper.getBoundingClientRect();
    holder.style.left = `${wrapRect.left}px`;
    holder.style.width = `${wrapper.clientWidth}px`;
    // Follow the wrapper's horizontal scroll so columns stay aligned.
    clone.style.marginLeft = `${-wrapper.scrollLeft}px`;
  }

  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; update(); });
  }

  function invalidate() {
    dirty = true;
    schedule();
  }

  holder.addEventListener('click', e => {
    const th = e.target.closest('th');
    if (!th) return;
    const index = [...th.parentNode.cells].indexOf(th);
    const realTh = table.tHead.rows[0].cells[index];
    if (realTh) realTh.click();
  });

  window.addEventListener('scroll', schedule, { passive: true });
  wrapper.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', invalidate);
  // Re-sort swaps header classes; re-filter changes the longest cell in a
  // column, and with auto layout that moves the column widths.
  new MutationObserver(invalidate).observe(table, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['class'],
  });

  schedule();
}

// ─── Table scroll cue ───────────────────────────────────────

// Marks each .table-wrapper .is-scrollable while it has columns hidden past its
// edge and .is-at-end once scrolled all the way across, so CSS can fade the
// right edge as a "swipe for more" cue on phones (see analytics.css §7b).
function initTableScrollCues() {
  const wrappers = new Set();
  const check = w => {
    const scrollable = w.scrollWidth - w.clientWidth > 4;
    w.classList.toggle('is-scrollable', scrollable);
    w.classList.toggle('is-at-end', !scrollable || w.scrollLeft + w.clientWidth >= w.scrollWidth - 4);
  };
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(entries => {
    entries.forEach(e => check(e.target.closest('.table-wrapper') || e.target));
  }) : null;
  const watch = () => {
    document.querySelectorAll('.table-wrapper').forEach(w => {
      if (wrappers.has(w)) { check(w); return; }
      wrappers.add(w);
      w.addEventListener('scroll', () => check(w), { passive: true });
      if (ro) { ro.observe(w); const t = w.querySelector('table'); if (t) ro.observe(t); }
      check(w);
    });
  };
  watch();
  window.addEventListener('resize', watch);
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.querySelector('.table-wrapper')) initTableScrollCues();
});

// ─── Tooltip System ─────────────────────────────────────────

// Any [data-tooltip] element shows the shared .info-tooltip bubble. The "?"
// chips (.tooltip-icon) are upgraded to real controls so the caveats they hold
// ("at least 20 games", how turn order is inferred) reach keyboard, touch and
// screen-reader users too: focusable, named by their text, shown on hover,
// focus or tap, and dismissed with Esc, a second tap or a tap elsewhere.
function upgradeTooltipIcon(icon) {
  if (!icon || icon.dataset.ttReady || icon.closest('.sticky-table-header')) return;
  icon.dataset.ttReady = '1';
  icon.setAttribute('role', 'button');
  icon.setAttribute('tabindex', '0');
  icon.setAttribute('aria-label', `More info: ${icon.dataset.tooltip}`);
  glueToPreviousWord(icon);
}

// Keep a "?" on the same line as the word before it, so a narrow screen never
// wraps the icon onto a line of its own under a title.
function glueToPreviousWord(icon) {
  const prev = icon.previousSibling;
  if (!prev || prev.nodeType !== Node.TEXT_NODE) return;
  const m = prev.textContent.match(/(\S+)(\s*)$/);
  if (!m) return;
  const glue = document.createElement('span');
  glue.className = 'ac-nowrap';
  glue.style.whiteSpace = 'nowrap';
  prev.textContent = prev.textContent.slice(0, m.index);
  glue.textContent = m[1] + (m[2] ? ' ' : '');
  icon.parentNode.insertBefore(glue, icon);
  glue.appendChild(icon);
}

function initTooltips() {
  if (document.querySelector('.info-tooltip')) return; // once per page
  const tooltipEl = document.createElement('div');
  tooltipEl.className = 'info-tooltip';
  tooltipEl.setAttribute('role', 'tooltip');
  tooltipEl.id = 'ac-info-tooltip';
  document.body.appendChild(tooltipEl);

  let current = null;   // element whose tip is showing
  let pinned = false;   // opened by tap/click/keyboard (stays until dismissed)

  const place = target => {
    const rect = target.getBoundingClientRect();
    tooltipEl.style.left = Math.max(12, rect.left) + 'px';
    tooltipEl.style.top = (rect.bottom + 8) + 'px';

    // Keep within viewport
    requestAnimationFrame(() => {
      const tipRect = tooltipEl.getBoundingClientRect();
      if (tipRect.right > window.innerWidth - 12) {
        tooltipEl.style.left = Math.max(12, window.innerWidth - tipRect.width - 12) + 'px';
      }
      if (tipRect.bottom > window.innerHeight - 12) {
        tooltipEl.style.top = (rect.top - tipRect.height - 8) + 'px';
      }
    });
  };

  const show = (target, pin) => {
    current = target;
    pinned = !!pin;
    tooltipEl.textContent = target.dataset.tooltip;
    tooltipEl.classList.add('visible');
    target.setAttribute('aria-describedby', tooltipEl.id);
    place(target);
  };

  const hide = () => {
    if (current) current.removeAttribute('aria-describedby');
    current = null;
    pinned = false;
    tooltipEl.classList.remove('visible');
  };

  document.querySelectorAll('.tooltip-icon[data-tooltip]').forEach(upgradeTooltipIcon);

  document.addEventListener('mouseover', e => {
    const target = e.target.closest('[data-tooltip]');
    if (!target || pinned) return;
    show(target, false);
  });

  document.addEventListener('mouseout', e => {
    const target = e.target.closest('[data-tooltip]');
    if (!target || pinned) return;
    hide();
  });

  document.addEventListener('focusin', e => {
    const target = e.target.closest && e.target.closest('.tooltip-icon[data-tooltip]');
    if (target) show(target, false);
  });

  document.addEventListener('focusout', e => {
    if (current && e.target === current) hide();
  });

  // Capture phase: a tap on "?" inside a sortable header or a collapsible
  // title toggles the tip without also sorting or collapsing.
  document.addEventListener('click', e => {
    const icon = e.target.closest('.tooltip-icon[data-tooltip]');
    if (icon && !icon.closest('.sticky-table-header')) {
      e.preventDefault();
      e.stopPropagation();
      if (current === icon && pinned) hide();
      else show(icon, true);
      return;
    }
    if (pinned) hide();
  }, true);

  document.addEventListener('keydown', e => {
    const icon = e.target.closest && e.target.closest('.tooltip-icon[data-tooltip]');
    if (icon && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      e.stopPropagation();
      if (current === icon && pinned) hide();
      else show(icon, true);
    } else if (e.key === 'Escape' && current) {
      hide();
    }
  });

  // Follow the trigger while the page scrolls (focusing one scrolls it into view).
  let raf = 0;
  window.addEventListener('scroll', () => {
    if (!current || raf) return;
    raf = requestAnimationFrame(() => { raf = 0; if (current) place(current); });
  }, { passive: true });
}
