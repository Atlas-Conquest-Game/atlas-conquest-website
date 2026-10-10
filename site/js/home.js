/**
 * Atlas Conquest Analytics — Overview page
 *
 * Headline KPIs, commander spotlight + standings, game-shape distributions
 * and first-turn advantage. Data loading is unchanged; everything below the
 * loaders is presentation (tokens and count-ups come from js/analytics-ui.js).
 */

// ─── Page State ─────────────────────────────────────────────

let distCharts = {};

// Below this many games a winrate is too noisy to rank — the standings sink
// those commanders to the bottom and the "highest winrate" spotlight skips them.
const RANK_MIN_GAMES = 20;

const hasUI = () => typeof window.ACA !== 'undefined';

function tokenHTML(name, faction, opts) {
  return hasUI() ? ACA.token(name, faction, opts) : '';
}

function countUp(id) {
  if (hasUI()) ACA.countUp(document.getElementById(id));
}

function wrClass(rate) {
  if (rate > 0.52) return 'winrate-positive';
  if (rate < 0.48) return 'winrate-negative';
  return 'winrate-neutral';
}

// ─── Distribution Charts ────────────────────────────────────

// Single-series histograms in the brand's molten gold: the bars warm from
// ember at the base to pale gold at the top.
function moltenFill(context) {
  const { chart } = context;
  const area = chart.chartArea;
  if (!area) return 'rgba(232, 162, 69, 0.6)';
  const g = chart.ctx.createLinearGradient(0, area.bottom, 0, area.top);
  g.addColorStop(0, 'rgba(201, 111, 34, 0.55)');
  g.addColorStop(0.6, 'rgba(232, 162, 69, 0.75)');
  g.addColorStop(1, 'rgba(247, 220, 154, 0.9)');
  return g;
}

function renderDistributionChart(canvasId, data) {
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
        backgroundColor: moltenFill,
        hoverBackgroundColor: '#f7dc9a',
        borderColor: CHART_THEME.gold,
        borderWidth: { top: 1, left: 0, right: 0, bottom: 0 },
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
          grid: { color: CHART_THEME.grid },
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
  renderDistributionChart('dist-duration', distributions.duration);
  renderDistributionChart('dist-turns', distributions.turns);
  renderDistributionChart('dist-actions', distributions.actions);
}

// ─── First-Turn Summary ─────────────────────────────────────

function renderFirstTurn(ftData) {
  const section = document.getElementById('first-turn-section');
  if (!section) return;

  if (!ftData || !ftData.total_games) {
    section.style.display = 'none';
    return;
  }

  section.style.display = '';
  const first = ftData.first_player_winrate * 100;
  el('ft-winrate', first.toFixed(1) + '%');
  el('ft-second', (100 - first).toFixed(1) + '%');
  el('ft-total-games', ftData.total_games.toLocaleString());

  const bar = document.getElementById('ft-bar');
  if (bar) {
    bar.style.setProperty('--ft', `${first.toFixed(1)}%`);
    bar.setAttribute('aria-label',
      `Going first wins ${first.toFixed(1)}% of games, going second ${(100 - first).toFixed(1)}%`);
  }
  countUp('ft-winrate');
  countUp('ft-second');
}

// ─── Commander spotlight + standings ────────────────────────

function renderSpot(prefix, commander, nameId) {
  const card = document.getElementById(`spot-${prefix}`);
  if (!card) return;
  if (!commander) {
    el(nameId, '--');
    return;
  }
  el(nameId, commander.name);
  card.style.setProperty('--spot-faction', `var(--${commander.faction}, var(--gold))`);
  const tokenSlot = document.getElementById(`spot-${prefix}-token`);
  if (tokenSlot) tokenSlot.innerHTML = tokenHTML(commander.name, commander.faction, { size: 'lg', eager: true });
  const badge = document.getElementById(`spot-${prefix}-badge`);
  if (badge) badge.innerHTML = factionBadge(commander.faction);
}

function renderSpotlight(commanderStats) {
  if (!commanderStats || !commanderStats.length) {
    renderSpot('popular', null, 'stat-top-commander');
    renderSpot('best', null, 'stat-best-wr');
    return;
  }
  const top = [...commanderStats].sort((a, b) => b.matches - a.matches)[0];
  renderSpot('popular', top, 'stat-top-commander');
  el('spot-popular-games', top.matches.toLocaleString());
  countUp('spot-popular-games');

  // Only commanders with enough games compete for "highest winrate"; a thin
  // window says so rather than crowning a 3-0 record.
  const ranked = commanderStats.filter(c => c.matches >= RANK_MIN_GAMES);
  const best = [...ranked].sort((a, b) => b.winrate - a.winrate)[0];
  const rate = document.getElementById('spot-best-rate');
  const tokenSlot = document.getElementById('spot-best-token');
  if (!best) {
    renderSpot('best', null, 'stat-best-wr');
    if (tokenSlot) tokenSlot.innerHTML = '';
    el('spot-best-badge', '');
    if (rate) { rate.textContent = ''; rate.className = ''; }
    el('spot-best-games', `No commander has ${RANK_MIN_GAMES}+ games in this window yet.`);
    return;
  }
  renderSpot('best', best, 'stat-best-wr');
  if (rate) {
    rate.textContent = `${(best.winrate * 100).toFixed(1)}%`;
    rate.className = wrClass(best.winrate);
  }
  el('spot-best-games', `winrate over ${best.matches.toLocaleString()} games`);
  countUp('spot-best-rate');
}

function renderStandings(commanderStats) {
  const list = document.getElementById('overview-standings');
  if (!list) return;
  if (!commanderStats || !commanderStats.length) {
    list.innerHTML = '<li class="placeholder-text">No commander games in this window.</li>';
    return;
  }

  const rows = [...commanderStats].sort((a, b) => {
    const aThin = a.matches < RANK_MIN_GAMES;
    const bThin = b.matches < RANK_MIN_GAMES;
    if (aThin !== bThin) return aThin ? 1 : -1;
    return b.winrate - a.winrate || b.matches - a.matches;
  });

  list.innerHTML = rows.map((c, i) => {
    const thin = c.matches < RANK_MIN_GAMES;
    const hidden = c.matches < 5; // same floor as winrateCell()
    const pct = (c.winrate * 100).toFixed(1);
    const cls = hidden ? 'winrate-neutral' : wrClass(c.winrate);
    const shown = hidden ? '--' : `${pct}%`;
    const title = thin ? ` title="Only ${c.matches} game${c.matches === 1 ? '' : 's'}: not enough to rank"` : '';
    return `
      <li>
        <a class="an-row${thin ? ' is-thin' : ''}" href="commanders.html"${title}>
          <span class="an-row__rank">${thin ? '&ndash;' : i + 1}</span>
          ${tokenHTML(c.name, c.faction, { size: 'sm' })}
          <span class="an-row__name"><strong>${c.name}</strong>${factionBadge(c.faction)}</span>
          <span class="an-row__wr">
            <span class="${cls}">${shown}</span>
            <span class="an-wrbar" aria-hidden="true"><span class="an-wrbar__fill ${cls}" style="--wr: ${hidden ? 0 : pct}%"></span></span>
          </span>
          <span class="an-row__games">${c.matches.toLocaleString()} games</span>
        </a>
      </li>`;
  }).join('');
}

// ─── KPIs ───────────────────────────────────────────────────

function renderKpis(metadata, commanderStats, cardStats) {
  // stat-matches / hero-matches / hero-updated come from renderMetadata().
  const players = metadata && metadata.total_players != null ? metadata.total_players : null;
  el('stat-players', players != null ? players.toLocaleString() : '--');
  el('hero-players', players != null ? `${players.toLocaleString()} players` : '-- players');
  el('stat-commanders', commanderStats ? String(commanderStats.filter(c => c.matches > 0).length) : '--');
  el('stat-cards', cardStats ? cardStats.length.toLocaleString() : '--');

  if (hasUI()) {
    document.querySelectorAll('[data-period-caption]').forEach(n => { n.textContent = ACA.periodLabel(); });
    ['stat-matches', 'stat-players', 'stat-commanders', 'stat-cards'].forEach(countUp);
  }
}

// ─── Render All ─────────────────────────────────────────────

function renderAll() {
  const period = currentPeriod;

  const metadata = getPeriodData(appData.metadata, period);
  const commanderStats = getPeriodData(appData.commanderStats, period);
  const cardStats = getPeriodData(appData.cardStats, period);
  const distributions = getPeriodData(appData.gameDistributions, period);
  const firstTurn = getPeriodData(appData.firstTurn, period);

  renderMetadata(metadata);
  renderKpis(metadata, commanderStats, cardStats);
  renderSpotlight(commanderStats);
  renderStandings(commanderStats);
  renderDistributions(distributions);
  renderFirstTurn(firstTurn);
}

// ─── Init ───────────────────────────────────────────────────

async function init() {
  appData = await loadData(['metadata', 'commanderStats',
                            'gameDistributions', 'firstTurn']);
  renderAll();
  initTimeFilters(renderAll);
  initMapFilters(renderAll);
  initNavActiveState();
  initTooltips();
  // card_stats.json is the heaviest file on the page (~4 MB raw) and only feeds
  // the "Unique cards played" count, so it loads after everything else drew.
  const cardStats = await loadJSON(DATA_FILES.cardStats);
  if (cardStats) {
    appData.cardStats = cardStats;
    const stats = getPeriodData(cardStats, currentPeriod);
    el('stat-cards', stats ? stats.length.toLocaleString() : '--');
    if (hasUI()) countUp('stat-cards');
  }
}

document.addEventListener('DOMContentLoaded', init);
