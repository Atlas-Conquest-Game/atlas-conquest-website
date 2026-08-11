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
  kpis.innerHTML = [
    kpiCard('All Art Commissioned', a.commissioned_rate, a.commissioned, a.total),
    kpiCard('All Art Animated', a.animated_rate, a.animated, a.total),
    kpiCard('Cards Commissioned', c.commissioned_rate, c.commissioned, c.total),
    kpiCard('Cards Animated', c.animated_rate, c.animated, c.total),
  ].join('');
}

// ─── Art source breakdown ───────────────────────────────────

// Rows of the art-source table: which pool, and where its artwork came from.
const ART_SOURCE_ROWS = [
  { key: 'cards', label: 'Cards' },
  { key: 'tokens', label: 'Tokens' },
  { key: 'commanders', label: 'Commanders' },
];

function artTypeCell(bucket, total) {
  if (!total) return '<td class="goal-na">—</td>';
  return `<td>${fmtPct(bucket.rate)} <span class="goal-count">(${bucket.count})</span></td>`;
}

function renderArtSourceTable(overall) {
  const table = document.getElementById('art-source-table');
  const tbody = table && table.querySelector('tbody');
  if (!tbody) return;

  const rows = ART_SOURCE_ROWS
    .map(r => ({ ...r, stats: overall[r.key] }))
    .filter(r => r.stats);

  // "Other" only exists if some record has an ArtType the pipeline doesn't
  // recognise. Normally every row is zero, so drop the column entirely.
  const hasOther = [...rows, { stats: overall.all }]
    .some(r => (r.stats.art_types.other || {}).count > 0);
  table.classList.toggle('hide-other', !hasOther);

  const cells = stats => [
    `<td>${stats.total}</td>`,
    artTypeCell(stats.art_types.commissioned, stats.total),
    artTypeCell(stats.art_types.purchased, stats.total),
    artTypeCell(stats.art_types.ai, stats.total),
    `<td class="col-other">${stats.total ? `${fmtPct(stats.art_types.other.rate)} <span class="goal-count">(${stats.art_types.other.count})</span>` : '—'}</td>`,
    rateCountCell(stats.animated_rate, stats.animated, stats.total),
  ].join('');

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${r.label}</td>
      ${cells(r.stats)}
    </tr>`).join('') + `
    <tr class="goal-total-row">
      <td>All</td>
      ${cells(overall.all)}
    </tr>`;
}

function rateCountCell(rate, num, den) {
  if (!den) return '<td class="goal-na">—</td>';
  return `<td>${fmtPct(rate)} <span class="goal-count">(${num} / ${den})</span></td>`;
}

function rateCell(stats) {
  return rateCountCell(stats.commissioned_rate, stats.commissioned, stats.total);
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
