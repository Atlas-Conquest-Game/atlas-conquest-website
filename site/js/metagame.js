/**
 * Atlas Conquest Analytics - Metagame Page
 *
 * Renders commander-filtered archetypes discovered by the data pipeline.
 */

let currentCommander = 'all';
let currentSort = 'prevalence';

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPct(rate) {
  if (rate == null || Number.isNaN(Number(rate))) return '--';
  return `${(Number(rate) * 100).toFixed(1)}%`;
}

function getCommanderFactionLookup() {
  const lookup = {};
  const commanders = appData.commanders || [];
  commanders.forEach(c => {
    lookup[c.name] = c.faction || 'neutral';
  });

  const stats = getPeriodData(appData.commanderStats, currentPeriod) || [];
  stats.forEach(c => {
    lookup[c.name] = c.faction || lookup[c.name] || 'neutral';
  });
  return lookup;
}

function getCurrentArchetypeData() {
  return getPeriodData(appData.archetypes, currentPeriod);
}

function getArchetypeRows() {
  const data = getCurrentArchetypeData();
  const commanders = data && data.commanders ? data.commanders : {};
  const factionLookup = getCommanderFactionLookup();
  const rows = [];

  Object.entries(commanders).forEach(([commander, commanderData]) => {
    if (!commanderData || commanderData.skipped) return;
    const archetypes = commanderData.archetypes || [];
    archetypes.forEach(archetype => {
      rows.push({
        ...archetype,
        commander,
        faction: factionLookup[commander] || 'neutral',
        commanderDeckCount: commanderData.deck_count || 0,
      });
    });
  });

  const filtered = currentCommander === 'all'
    ? rows
    : rows.filter(row => row.commander === currentCommander);

  filtered.sort((a, b) => {
    if (currentSort === 'winrate') {
      return (b.winrate || 0) - (a.winrate || 0) || (b.deck_count || 0) - (a.deck_count || 0);
    }
    return (b.meta_share || 0) - (a.meta_share || 0) || (b.deck_count || 0) - (a.deck_count || 0);
  });

  return filtered;
}

function populateCommanderFilter() {
  const select = document.getElementById('commander-filter');
  if (!select) return;

  const data = getCurrentArchetypeData();
  const commanders = data && data.commanders ? data.commanders : {};
  const options = Object.entries(commanders)
    .filter(([, info]) => info && !info.skipped && (info.archetypes || []).length > 0)
    .sort((a, b) => (b[1].deck_count || 0) - (a[1].deck_count || 0))
    .map(([name]) => name);

  const previous = currentCommander;
  select.innerHTML = '<option value="all">All Commanders</option>' +
    options.map(name => `<option value="${escapeHTML(name)}">${escapeHTML(name)}</option>`).join('');

  currentCommander = options.includes(previous) ? previous : 'all';
  select.value = currentCommander;
}

function updateHero() {
  const meta = getPeriodData(appData.metadata, currentPeriod);
  if (!meta) return;

  el('hero-matches', `${(meta.total_matches || 0).toLocaleString()} matches`);
  const updated = meta.last_updated ? new Date(meta.last_updated) : null;
  el('hero-updated', updated && !Number.isNaN(updated.getTime())
    ? `Last updated: ${updated.toLocaleDateString()}`
    : 'Last updated: --');
}

function renderSummary(rows) {
  const summary = document.getElementById('metagame-summary');
  if (!summary) return;

  const data = getCurrentArchetypeData();
  const totalDecks = data && data.total_decks ? data.total_decks : 0;
  const commanders = new Set(rows.map(row => row.commander));
  summary.textContent = `${rows.length.toLocaleString()} archetypes, ${commanders.size.toLocaleString()} commanders, ${totalDecks.toLocaleString()} deck entries`;
}

function renderKeyCards(cards) {
  const rows = (cards || []).map(card => `
    <tr class="metagame-card-row" data-card-slug="${commanderSlug(card.name)}">
      <td class="metagame-card-name">${escapeHTML(card.name)}</td>
      <td>${formatPct(card.inclusion_rate)}</td>
      <td>${Number(card.avg_copies || 0).toFixed(2)}</td>
    </tr>
  `).join('');

  if (!rows) {
    return '<div class="metagame-empty metagame-empty-inline">No card prevalence data for this archetype.</div>';
  }

  return `
    <div class="table-wrapper metagame-card-table-wrap">
      <table class="data-table metagame-card-table">
        <thead>
          <tr>
            <th>Card</th>
            <th>Decklists</th>
            <th>Avg Copies</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderDecklists(decklists) {
  if (!decklists || !decklists.length) {
    return '<div class="metagame-empty metagame-empty-inline">No decklist data available.</div>';
  }
  const rows = decklists.map(d => `
    <tr>
      <td class="metagame-deck-name">${escapeHTML(d.deck_name)}</td>
      <td>${escapeHTML(d.username)}</td>
      <td>${d.count}</td>
    </tr>
  `).join('');
  return `
    <div class="table-wrapper metagame-card-table-wrap">
      <table class="data-table metagame-card-table">
        <thead>
          <tr>
            <th>Deck Name</th>
            <th>Player</th>
            <th>Games</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function archetypeNameCards(name) {
  const colon = name.indexOf(': ');
  const remainder = colon >= 0 ? name.slice(colon + 2) : name;
  if (!remainder || remainder === 'Misc') return [];
  return remainder.split(/ \/ | \+ /).slice(0, 2);
}

function renderArchetypeTabBg(row) {
  const cmdSlug = commanderSlug(row.commander);
  const nameCards = archetypeNameCards(row.name);

  const cmdBg = `<span class="archetype-tab-bg archetype-tab-bg-left" aria-hidden="true"><img class="archetype-bg-img archetype-bg-commander" src="assets/commanders/${cmdSlug}.jpg" alt="" onerror="this.style.display='none'"></span>`;

  const cardImgs = nameCards.map(n =>
    `<img class="archetype-bg-img archetype-bg-card" src="assets/cards/${commanderSlug(n)}.jpg" alt="" onerror="this.style.display='none'">`
  ).join('');
  const cardsBg = nameCards.length
    ? `<span class="archetype-tab-bg archetype-tab-bg-right" aria-hidden="true">${cardImgs}</span>`
    : '';

  return cmdBg + cardsBg;
}

function renderArchetypeCard(row, index) {
  const cards = row.cards || row.key_cards || [];
  const previewCards = cards.slice(0, 5).map(card => `
    <span class="metagame-chip">${escapeHTML(card.name)}</span>
  `).join('');
  const panelId = `archetype-panel-${index}`;

  return `
    <article class="archetype-card" data-archetype-index="${index}">
      <button class="archetype-tab" type="button" aria-expanded="false" aria-controls="${panelId}">
        ${renderArchetypeTabBg(row)}
        <span class="archetype-main">
          <span class="archetype-title-row">
            <span class="archetype-name">${escapeHTML(row.name || 'Unnamed Archetype')}</span>
            ${factionBadge(row.faction)}
          </span>
          <span class="archetype-commander">${escapeHTML(row.commander)}</span>
          <span class="archetype-card-preview">${previewCards}</span>
        </span>
        <span class="archetype-metrics">
          <span class="archetype-metric">
            <span class="metric-label">Meta</span>
            <span class="metric-value">${formatPct(row.meta_share)}</span>
          </span>
          <span class="archetype-metric">
            <span class="metric-label">Commander</span>
            <span class="metric-value">${formatPct(row.commander_share)}</span>
          </span>
          <span class="archetype-metric">
            <span class="metric-label">Winrate</span>
            <span class="metric-value ${winrateClass(row.winrate)}">${formatPct(row.winrate)}</span>
          </span>
          <span class="archetype-metric">
            <span class="metric-label">Decks</span>
            <span class="metric-value">${(row.deck_count || 0).toLocaleString()}</span>
          </span>
          <span class="archetype-toggle" aria-hidden="true">+</span>
        </span>
      </button>
      <div class="archetype-panel" id="${panelId}" hidden>
        <div class="archetype-panel-inner">
          <div class="archetype-panel-copy">
            <h3>Card Prevalence</h3>
            <p>Percentage of decklists in this archetype that include each card, plus average copies among decks that include it.</p>
          </div>
          ${renderKeyCards(cards)}
          <div class="archetype-panel-divider"></div>
          <div class="archetype-panel-copy">
            <h3>Decklists</h3>
            <p>Unique deck names played in this archetype, with the submitting player and number of games.</p>
          </div>
          ${renderDecklists(row.decklists)}
        </div>
      </div>
    </article>
  `;
}

function winrateClass(rate) {
  if (rate > 0.52) return 'winrate-positive';
  if (rate < 0.48) return 'winrate-negative';
  return 'winrate-neutral';
}

function renderMetagame() {
  updateHero();
  populateCommanderFilter();

  const list = document.getElementById('archetype-list');
  if (!list) return;

  const data = getCurrentArchetypeData();
  if (!data) {
    list.innerHTML = '<div class="metagame-empty">Archetype data has not been generated yet. Run the data pipeline to create archetypes.json.</div>';
    renderSummary([]);
    return;
  }

  const rows = getArchetypeRows();
  renderSummary(rows);

  if (!rows.length) {
    list.innerHTML = '<div class="metagame-empty">No archetypes match the selected filters.</div>';
    return;
  }

  list.innerHTML = rows.map(renderArchetypeCard).join('');
  bindArchetypeToggles();
}

function bindArchetypeToggles() {
  document.querySelectorAll('.archetype-tab').forEach(button => {
    button.addEventListener('click', () => {
      const card = button.closest('.archetype-card');
      const panel = card.querySelector('.archetype-panel');
      const expanded = button.getAttribute('aria-expanded') === 'true';

      button.setAttribute('aria-expanded', String(!expanded));
      panel.hidden = expanded;
      card.classList.toggle('expanded', !expanded);
      const toggle = button.querySelector('.archetype-toggle');
      if (toggle) toggle.textContent = expanded ? '+' : '-';
    });
  });
}

function initCardPreview() {
  const preview = document.getElementById('card-preview');
  const previewImg = document.getElementById('card-preview-img');
  const list = document.getElementById('archetype-list');
  if (!preview || !previewImg || !list) return;

  list.addEventListener('mouseover', e => {
    const cell = e.target.closest('.metagame-card-name');
    if (!cell) return;
    const row = cell.closest('tr[data-card-slug]');
    if (!row) return;

    previewImg.src = `assets/cards/${row.dataset.cardSlug}.jpg`;
    preview.classList.add('visible');
  });

  list.addEventListener('mousemove', e => {
    if (!preview.classList.contains('visible')) return;
    const x = e.clientX + 20;
    const y = e.clientY - 100;
    const flipX = x + 260 > window.innerWidth;
    preview.style.left = flipX ? `${e.clientX - 270}px` : `${x}px`;
    preview.style.top = `${Math.max(8, y)}px`;
  });

  list.addEventListener('mouseout', e => {
    const cell = e.target.closest('.metagame-card-name');
    if (!cell) return;
    const related = e.relatedTarget;
    if (related && cell.contains(related)) return;
    preview.classList.remove('visible');
  });

  previewImg.addEventListener('error', () => {
    preview.classList.remove('visible');
  });
}

function initControls() {
  const commanderSelect = document.getElementById('commander-filter');
  if (commanderSelect) {
    commanderSelect.addEventListener('change', () => {
      currentCommander = commanderSelect.value;
      renderMetagame();
    });
  }

  document.querySelectorAll('.sort-btn').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.sort-btn').forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      currentSort = button.dataset.sort;
      renderMetagame();
    });
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  initNavActiveState();
  initTimeFilters(renderMetagame);
  initMapFilters(renderMetagame);
  initControls();
  initCardPreview();

  appData = await loadData(['metadata', 'archetypes', 'commanderStats', 'commanders']);
  renderMetagame();
});
