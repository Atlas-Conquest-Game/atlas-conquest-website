/**
 * Atlas Conquest Analytics — Main Application
 *
 * Loads static JSON data files and renders the dashboard.
 * No build step. No framework. Just data → DOM.
 */

// Colorblind-safe palette (Wong 2011 / Okabe-Ito inspired)
const FACTION_COLORS = {
  skaal: '#D55E00',
  grenalia: '#009E73',
  lucia: '#E8B630',
  neutral: '#A89078',
  shadis: '#4A4A5A',
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

// ─── Data Loading ──────────────────────────────────────────────

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
  const [metadata, commanderStats, cardStats, trends, matchups, players, commanders] = await Promise.all([
    loadJSON('data/metadata.json'),
    loadJSON('data/commander_stats.json'),
    loadJSON('data/card_stats.json'),
    loadJSON('data/trends.json'),
    loadJSON('data/matchups.json'),
    loadJSON('data/players.json'),
    loadJSON('data/commanders.json'),
  ]);
  return { metadata, commanderStats, cardStats, trends, matchups, players, commanders };
}

// ─── Helpers ───────────────────────────────────────────────────

function el(id, text) {
  const node = document.getElementById(id);
  if (node) node.textContent = text;
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

// ─── Metadata ──────────────────────────────────────────────────

function renderMetadata(metadata) {
  if (!metadata) return;
  el('hero-matches', `${metadata.total_matches.toLocaleString()} matches`);
  el('hero-players', `${metadata.total_players.toLocaleString()} players`);
  el('hero-updated', `Last updated: ${new Date(metadata.last_updated).toLocaleDateString()}`);
  el('stat-matches', metadata.total_matches.toLocaleString());
  el('stat-players', metadata.total_players.toLocaleString());
}

// ─── Commander Cards (with artwork) ────────────────────────────

function renderCommanderCards(stats, commanders) {
  const container = document.getElementById('commander-cards');
  if (!container || !stats || !stats.length) return;

  // Build art lookup from commanders.json
  const artLookup = {};
  if (commanders) {
    commanders.forEach(c => { artLookup[c.name] = c.art; });
  }

  const sorted = [...stats].sort((a, b) => b.winrate - a.winrate);

  container.innerHTML = sorted.map(c => {
    const artPath = artLookup[c.name];
    const artHtml = artPath
      ? `<img class="commander-art" src="${artPath}" alt="${c.name}" loading="lazy">`
      : `<div class="commander-art commander-art-placeholder">${c.name.charAt(0)}</div>`;

    const wr = (c.winrate * 100).toFixed(1);
    let wrClass = 'winrate-neutral';
    if (c.winrate > 0.52) wrClass = 'winrate-positive';
    else if (c.winrate < 0.48) wrClass = 'winrate-negative';

    return `
      <div class="commander-card">
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

// ─── Commander Table & Chart ───────────────────────────────────

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

  const sorted = [...stats].sort((a, b) => b.winrate - a.winrate);

  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: sorted.map(c => c.name),
      datasets: [{
        label: 'Winrate',
        data: sorted.map(c => (c.winrate * 100).toFixed(1)),
        backgroundColor: sorted.map(c => FACTION_COLORS[c.faction] || '#888'),
        borderRadius: 6,
        barPercentage: 0.7,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.parsed.y}% winrate (${sorted[ctx.dataIndex].matches} games)`,
          },
        },
      },
      scales: {
        y: {
          min: 30,
          max: 70,
          ticks: {
            callback: v => v + '%',
            color: '#6E6E80',
            font: { family: 'Inter', size: 12 },
          },
          grid: { color: '#E5E5E5' },
        },
        x: {
          ticks: {
            color: '#6E6E80',
            font: { family: 'Inter', size: 11 },
            maxRotation: 45,
          },
          grid: { display: false },
        },
      },
    },
  });
}

// ─── Matchup Heatmap ───────────────────────────────────────────

function renderMatchups(matchupData) {
  const table = document.getElementById('matchup-table');
  if (!matchupData || !table) return;

  const cmds = matchupData.commanders;
  const matchups = matchupData.matchups;

  // Build lookup: matchupMap[row][col] = { wins, losses, total, winrate }
  const matchupMap = {};
  cmds.forEach(c => { matchupMap[c] = {}; });
  matchups.forEach(m => {
    matchupMap[m.commander][m.opponent] = m;
  });

  // Short names for column headers
  const shortName = name => {
    const parts = name.split(',')[0].split(' ');
    return parts.length > 1 ? parts[0] : name;
  };

  // Header row
  const thead = table.querySelector('thead tr');
  thead.innerHTML = '<th class="matchup-corner"></th>' +
    cmds.map(c => `<th class="matchup-col-header" title="${c}">${shortName(c)}</th>`).join('');

  // Body rows
  const tbody = table.querySelector('tbody');
  tbody.innerHTML = cmds.map(row => {
    const cells = cmds.map(col => {
      if (row === col) {
        return '<td class="matchup-cell matchup-self">-</td>';
      }
      const m = matchupMap[row] && matchupMap[row][col];
      if (!m || m.total < 5) {
        return `<td class="matchup-cell matchup-nodata" title="${row} vs ${col}: insufficient data">--</td>`;
      }
      const wr = (m.winrate * 100).toFixed(0);
      let cls = 'matchup-even';
      if (m.winrate > 0.55) cls = 'matchup-favored';
      else if (m.winrate < 0.45) cls = 'matchup-unfavored';

      return `<td class="matchup-cell ${cls}" title="${row} vs ${col}: ${wr}% (${m.total} games)">${wr}%</td>`;
    }).join('');

    return `<tr><th class="matchup-row-header" title="${row}">${shortName(row)}</th>${cells}</tr>`;
  }).join('');
}

// ─── Card Table ────────────────────────────────────────────────

function renderCardTable(stats, faction) {
  const tbody = document.querySelector('#card-table tbody');
  if (!stats || !stats.length) return;

  const filtered = faction === 'all'
    ? stats
    : stats.filter(c => c.faction === faction);

  const sorted = [...filtered].sort((a, b) => b.deck_count - a.deck_count).slice(0, 50);

  tbody.innerHTML = sorted.map(c => `
    <tr>
      <td><strong>${c.name}</strong></td>
      <td>${factionBadge(c.faction)}</td>
      <td>${c.type || '--'}</td>
      <td>${pctCell(c.deck_rate)}</td>
      <td>${winrateCell(c.deck_winrate, c.deck_count)}</td>
      <td>${pctCell(c.played_rate)}</td>
      <td>${winrateCell(c.played_winrate, c.played_count)}</td>
    </tr>
  `).join('');
}

// ─── Player Leaderboard ────────────────────────────────────────

function renderPlayers(players) {
  const tbody = document.querySelector('#player-table tbody');
  if (!players || !players.length) return;

  // Filter: minimum 10 games
  const filtered = players.filter(p => p.games >= 10);

  tbody.innerHTML = filtered.map((p, i) => {
    const losses = p.games - p.wins;
    return `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${p.name}</strong></td>
        <td>${p.games.toLocaleString()}</td>
        <td>${p.wins.toLocaleString()}</td>
        <td>${losses.toLocaleString()}</td>
        <td>${winrateCell(p.winrate, p.games)}</td>
      </tr>
    `;
  }).join('');
}

// ─── Meta Trends Chart ─────────────────────────────────────────

function renderMetaChart(trends) {
  const canvas = document.getElementById('meta-chart');
  if (!trends || !canvas) return;

  // Only show factions that have data
  const activeFactions = Object.entries(trends.factions || {})
    .filter(([, data]) => data.some(v => v > 0));

  const datasets = activeFactions.map(([faction, data]) => ({
    label: FACTION_LABELS[faction] || faction,
    data: data,
    borderColor: FACTION_COLORS[faction] || '#888',
    backgroundColor: 'transparent',
    tension: 0.3,
    pointRadius: 2,
    pointHoverRadius: 5,
    borderWidth: 2.5,
  }));

  new Chart(canvas, {
    type: 'line',
    data: {
      labels: trends.dates || [],
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: {
            color: '#6E6E80',
            font: { family: 'Inter', size: 12, weight: '500' },
            usePointStyle: true,
            pointStyle: 'circle',
          },
        },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y}%`,
          },
        },
      },
      scales: {
        y: {
          min: 0,
          max: 100,
          stacked: true,
          ticks: {
            callback: v => v + '%',
            color: '#6E6E80',
            font: { family: 'Inter', size: 12 },
          },
          grid: { color: '#E5E5E5' },
        },
        x: {
          ticks: {
            color: '#6E6E80',
            font: { family: 'Inter', size: 11 },
            maxTicksLimit: 15,
            maxRotation: 45,
          },
          grid: { display: false },
        },
      },
    },
  });
}

// ─── Filters ───────────────────────────────────────────────────

function initFilters(cardStats) {
  const buttons = document.querySelectorAll('.filter-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderCardTable(cardStats, btn.dataset.faction);
    });
  });
}

// ─── Init ──────────────────────────────────────────────────────

async function init() {
  const data = await loadAllData();

  renderMetadata(data.metadata);
  renderCommanderCards(data.commanderStats, data.commanders);
  renderCommanderTable(data.commanderStats);
  renderCommanderChart(data.commanderStats);
  renderMatchups(data.matchups);
  renderCardTable(data.cardStats, 'all');
  renderPlayers(data.players);
  renderMetaChart(data.trends);
  initFilters(data.cardStats || []);

  // Update unique cards stat
  if (data.cardStats) {
    el('stat-cards', data.cardStats.length.toLocaleString());
  }

  // Update top commander stat
  if (data.commanderStats && data.commanderStats.length) {
    const top = [...data.commanderStats].sort((a, b) => b.matches - a.matches)[0];
    el('stat-top-commander', top.name);
  }
}

document.addEventListener('DOMContentLoaded', init);
