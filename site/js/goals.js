/**
 * Atlas Conquest Analytics — Goals page
 *
 * Renders the alpha roadmap art/animation goals plus an overall progress
 * breakdown by patron. Data comes from data/goals.json, which is static
 * card-pool metadata (NOT period/map nested), so no time/map filters here.
 */

function fmtPct(rate, digits = 1) {
  return `${(rate * 100).toFixed(digits)}%`;
}

function targetLabel(goal) {
  if (goal.kind === 'count') return `${goal.target}`;
  if (goal.kind === 'percent') return `${Math.round(goal.target * 100)}%`;
  return `${goal.target} decks`;
}

// Current value, sub-line, and 0..1 progress fraction for a goal.
function goalDisplay(goal) {
  if (goal.kind === 'count') {
    return { value: `${goal.current}`, sub: '', frac: goal.current / goal.target };
  }
  if (goal.kind === 'percent') {
    return {
      value: fmtPct(goal.current),
      sub: `${goal.numerator} / ${goal.denominator}`,
      frac: goal.target ? goal.current / goal.target : 0,
    };
  }
  // decks
  return {
    value: `${goal.current} / ${goal.target}`,
    sub: 'decks meeting target',
    frac: goal.target ? goal.current / goal.target : 0,
  };
}

function deckDetailHTML(goal) {
  if (goal.kind !== 'decks') return '';
  const rows = goal.detail.map(d => `
    <div class="goal-deck-row ${d.met ? 'met' : ''}">
      <span class="goal-deck-name">${d.deck}</span>
      <span class="goal-deck-rate">${fmtPct(d.rate)}</span>
      <span class="goal-deck-mark">${d.met ? '✓' : '✗'}</span>
    </div>`).join('');
  return `<div class="goal-decks">${rows}</div>`;
}

function renderGoal(goal) {
  const d = goalDisplay(goal);
  const pct = Math.max(0, Math.min(1, d.frac)) * 100;
  const status = goal.met
    ? '<span class="goal-status met">✓ Met</span>'
    : '<span class="goal-status">In progress</span>';
  const sub = d.sub ? `<span class="goal-sub">${d.sub}</span>` : '';
  return `
    <div class="goal-card ${goal.met ? 'met' : ''}">
      <div class="goal-head">
        <span class="goal-label">${goal.label}</span>
        ${status}
      </div>
      <div class="goal-numbers">
        <span class="goal-value">${d.value}</span>
        <span class="goal-target">/ ${targetLabel(goal)}</span>
        ${sub}
      </div>
      <div class="progress-track">
        <div class="progress-fill ${goal.met ? 'met' : ''}" style="width: ${pct.toFixed(1)}%"></div>
      </div>
      ${deckDetailHTML(goal)}
    </div>`;
}

function renderGoalGroup(containerId, goals) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = goals.map(renderGoal).join('');
}

function kpiCard(label, rate, num, den) {
  return `
    <div class="stat-card">
      <div class="stat-label">${label}</div>
      <div class="stat-value">${fmtPct(rate)}</div>
      <div class="stat-sub">${num} / ${den}</div>
    </div>`;
}

function renderOverall(overall) {
  const kpis = document.getElementById('overall-kpis');
  if (!kpis) return;
  const c = overall.cards;
  // `all` covers cards + tokens + commanders — the final count. Tokens have no
  // goal of their own, so they only show up in these combined numbers and in
  // the art-source table below.
  const a = overall.all;
  // "Human-made" is every art type except AI_GENERATED: finished commissions,
  // purchased assets, and placeholders for commissions still in progress.
  kpis.innerHTML = [
    kpiCard('All Art Human-Made', a.human_rate, a.human, a.total),
    kpiCard('All Art Animated', a.animated_rate, a.animated, a.total),
    kpiCard('Cards Human-Made', c.human_rate, c.human, c.total),
    kpiCard('Cards Animated', c.animated_rate, c.animated, c.total),
  ].join('');
}

// ─── Art source breakdown ───────────────────────────────────

// Segments of the art-source donuts, in a fixed order. The three human-made
// sources carry the saturated hues (validated for colour-vision deficiency on
// the --bg-card surface); AI is the pool the goals are working to replace, so
// it sits in a recessive gray. "Other" only exists when some record has an
// ArtType the pipeline doesn't recognise, and is dropped when every pool is 0.
const ART_SOURCES = [
  { key: 'commissioned', label: 'Commissioned', color: '#238636' },
  { key: 'purchased',    label: 'Purchased',    color: '#1f6feb' },
  { key: 'placeholder',  label: 'Placeholder',  color: '#bf8700' },
  { key: 'ai',           label: 'AI',           color: '#6e7681' },
  { key: 'other',        label: 'Other',        color: '#da3633' },
];

// Pools that get a donut (and a row in the table view): which set of records,
// and where its artwork came from. `all` is cards + tokens + commanders.
const ART_SOURCE_POOLS = [
  { key: 'cards', label: 'Cards' },
  { key: 'tokens', label: 'Tokens' },
  { key: 'commanders', label: 'Commanders' },
  { key: 'all', label: 'All' },
];

let artSourceCharts = [];

function activeArtSources(overall) {
  const hasOther = ART_SOURCE_POOLS
    .some(p => ((overall[p.key] || {}).art_types || {}).other?.count > 0);
  return ART_SOURCES.filter(s => s.key !== 'other' || hasOther);
}

function renderArtSourceCharts(overall) {
  const grid = document.getElementById('art-source-charts');
  const legend = document.getElementById('art-source-legend');
  if (!grid || !legend) return;
  const sources = activeArtSources(overall);

  // One legend for all four donuts — they share segments, order, and colours.
  legend.innerHTML = sources.map(s => `
    <span class="art-legend-item"><span class="art-legend-swatch" style="background:${s.color}"></span>${s.label}</span>`).join('');

  artSourceCharts.forEach(c => c.destroy());
  artSourceCharts = [];

  grid.innerHTML = ART_SOURCE_POOLS.map(p => {
    const stats = overall[p.key];
    const total = stats ? stats.total : 0;
    const summary = total
      ? sources.map(s => `${s.label} ${stats.art_types[s.key].count}`).join(', ')
      : 'no records';
    return `
    <div class="chart-sm art-source-chart">
      <div class="chart-sm-title">${p.label}</div>
      <div class="art-source-donut">
        <canvas id="art-source-${p.key}" role="img"
                aria-label="${p.label}: ${total} total — ${summary}"></canvas>
        <div class="art-source-center" aria-hidden="true">
          <span class="art-source-center-value">${total ? fmtPct(stats.human_rate, 0) : '—'}</span>
          <span class="art-source-center-label">human art</span>
        </div>
      </div>
      <div class="art-source-caption">${total
        ? `${total} total · ${fmtPct(stats.animated_rate, 0)} animated`
        : 'No records'}</div>
    </div>`;
  }).join('');

  if (typeof Chart === 'undefined') return;
  for (const p of ART_SOURCE_POOLS) {
    const stats = overall[p.key];
    const canvas = document.getElementById(`art-source-${p.key}`);
    if (!stats || !stats.total || !canvas) continue;
    artSourceCharts.push(new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: sources.map(s => s.label),
        datasets: [{
          data: sources.map(s => stats.art_types[s.key].count),
          backgroundColor: sources.map(s => s.color),
          // 2px gap of surface colour between segments so adjacent hues never touch.
          borderColor: '#1c2128',
          borderWidth: 2,
          hoverOffset: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: '68%',
        plugins: {
          legend: { display: false },
          tooltip: {
            ...CHART_TOOLTIP,
            callbacks: {
              label: ctx => ` ${ctx.label}: ${ctx.parsed} (${fmtPct(ctx.parsed / stats.total)})`,
            },
          },
        },
      },
    }));
  }
}

// Table view of the same numbers, behind a <details> under the donuts. It is
// the accessible/printable form and the only place the per-pool animated
// share is listed alongside the art sources.
function artTypeCell(bucket, total) {
  if (!total) return '<td class="goal-na">—</td>';
  return `<td>${fmtPct(bucket.rate)} <span class="goal-count">(${bucket.count})</span></td>`;
}

function renderArtSourceTable(overall) {
  const table = document.getElementById('art-source-table');
  const tbody = table && table.querySelector('tbody');
  if (!tbody) return;

  const hasOther = activeArtSources(overall).some(s => s.key === 'other');
  table.classList.toggle('hide-other', !hasOther);

  const cells = stats => [
    `<td>${stats.total}</td>`,
    artTypeCell(stats.art_types.commissioned, stats.total),
    artTypeCell(stats.art_types.purchased, stats.total),
    artTypeCell(stats.art_types.placeholder, stats.total),
    artTypeCell(stats.art_types.ai, stats.total),
    `<td class="col-other">${stats.total ? `${fmtPct(stats.art_types.other.rate)} <span class="goal-count">(${stats.art_types.other.count})</span>` : '—'}</td>`,
    rateCountCell(stats.animated_rate, stats.animated, stats.total),
  ].join('');

  tbody.innerHTML = ART_SOURCE_POOLS
    .filter(p => overall[p.key])
    .map(p => `
    <tr class="${p.key === 'all' ? 'goal-total-row' : ''}">
      <td>${p.label}</td>
      ${cells(overall[p.key])}
    </tr>`).join('');
}

function rateCountCell(rate, num, den) {
  if (!den) return '<td class="goal-na">—</td>';
  return `<td>${fmtPct(rate)} <span class="goal-count">(${num} / ${den})</span></td>`;
}

function rateCell(stats) {
  return rateCountCell(stats.human_rate, stats.human, stats.total);
}

function animCell(stats) {
  return rateCountCell(stats.animated_rate, stats.animated, stats.total);
}

function renderPatronTable(byPatron) {
  const tbody = document.querySelector('#patron-table tbody');
  if (!tbody) return;
  // Sort by card count descending so the big patrons lead.
  const rows = [...byPatron].sort((a, b) => b.cards.total - a.cards.total);
  tbody.innerHTML = rows.map(p => `
    <tr>
      <td>${factionBadge(p.faction)} ${p.patron}</td>
      <td>${p.cards.total}</td>
      ${rateCell(p.cards)}
      ${animCell(p.cards)}
      <td>${p.commanders.total || '—'}</td>
      ${rateCell(p.commanders)}
      ${animCell(p.commanders)}
    </tr>`).join('');
}

function renderAll() {
  const data = appData.goals;
  if (!data) return;
  el('hero-card-count', `${data.overall.cards.total} cards`);
  el('hero-token-count', `${data.overall.tokens.total} tokens`);
  el('hero-commander-count', `${data.overall.commanders.total} commanders`);
  renderGoalGroup('art-goals', data.art_goals);
  renderGoalGroup('animation-goals', data.animation_goals);
  renderOverall(data.overall);
  renderArtSourceCharts(data.overall);
  renderArtSourceTable(data.overall);
  renderPatronTable(data.by_patron);
}

async function init() {
  appData = await loadData(['goals']);
  if (!appData.goals) {
    document.getElementById('art-goals').innerHTML =
      '<p class="placeholder-text">Goals data unavailable.</p>';
    return;
  }
  renderAll();
  initNavActiveState();
  initTooltips();
}

document.addEventListener('DOMContentLoaded', init);
