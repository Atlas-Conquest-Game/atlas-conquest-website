/**
 * Atlas Conquest Analytics — Meta Trends Page
 *
 * Stacked area chart showing faction popularity over time,
 * plus commander matchup heatmap.
 */

// ─── Page State ─────────────────────────────────────────────

let metaChart = null;
let cmdTrendsChart = null;
let cmdWrTrendsChart = null;
let firstTurnChart = null;
let matchupModalOpen = false;
let matchupModalCmd1 = null;
let matchupModalCmd2 = null;
let selectedCommanders = new Set();
let selectedWrCommanders = new Set();
let currentBin = { faction: 'week', 'cmd-trend': 'week', 'cmd-wr': 'week' };

// ─── Binning Helper ─────────────────────────────────────────

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function weekToMonth(weekKey) {
  // "YYYY-WNN" → approximate month label "YYYY-Mon"
  const [yearStr, wStr] = weekKey.split('-W');
  const year = parseInt(yearStr);
  const week = parseInt(wStr);
  const d = new Date(year, 0, 1 + week * 7);
  return `${d.getFullYear()}-${MONTH_NAMES[d.getMonth()]}`;
}

function groupByMonth(dates, arrays) {
  // Group parallel arrays by month, averaging values (nulls skipped)
  const months = [];
  const buckets = arrays.map(() => []);
  let currentMonth = null;
  let pending = arrays.map(() => []);

  for (let i = 0; i < dates.length; i++) {
    const m = weekToMonth(dates[i]);
    if (m !== currentMonth) {
      if (currentMonth !== null) {
        months.push(currentMonth);
        for (let a = 0; a < arrays.length; a++) {
          const vals = pending[a].filter(v => v !== null && v !== undefined);
          buckets[a].push(vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length * 10) / 10 : null);
        }
      }
      currentMonth = m;
      pending = arrays.map(() => []);
    }
    for (let a = 0; a < arrays.length; a++) {
      pending[a].push(arrays[a][i]);
    }
  }
  if (currentMonth !== null) {
    months.push(currentMonth);
    for (let a = 0; a < arrays.length; a++) {
      const vals = pending[a].filter(v => v !== null && v !== undefined);
      buckets[a].push(vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length * 10) / 10 : null);
    }
  }
  return { dates: months, values: buckets };
}

// ─── Meta Trends Chart ──────────────────────────────────────

function renderMetaChart(trends) {
  const canvas = document.getElementById('meta-chart');
  if (!canvas) return;

  if (metaChart) {
    metaChart.destroy();
    metaChart = null;
  }

  if (!trends || !trends.dates || !trends.dates.length) {
    canvas.style.display = 'none';
    return;
  }

  canvas.style.display = '';

  const activeFactions = Object.entries(trends.factions || {})
    .filter(([, data]) => data.some(v => v > 0));

  let labels = trends.dates;
  let factionData = activeFactions.map(([, data]) => data);

  if (currentBin.faction === 'month') {
    const grouped = groupByMonth(trends.dates, factionData);
    labels = grouped.dates;
    factionData = grouped.values;
  }

  const datasets = activeFactions.map(([faction], i) => ({
    label: FACTION_LABELS[faction] || faction,
    data: factionData[i],
    borderColor: FACTION_COLORS[faction] || '#888',
    backgroundColor: (FACTION_COLORS[faction] || '#888') + '40',
    fill: true,
    tension: 0.3,
    pointRadius: 0,
    pointHoverRadius: 4,
    borderWidth: 1.5,
  }));

  metaChart = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: { usePointStyle: true, pointStyle: 'circle', padding: 16 },
        },
        tooltip: {
          ...CHART_TOOLTIP,
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y}%`,
          },
        },
      },
      scales: {
        y: {
          stacked: true,
          min: 0,
          max: 100,
          ticks: { callback: v => v + '%' },
          grid: { color: '#21262d' },
        },
        x: {
          ticks: { maxTicksLimit: 15, maxRotation: 45 },
          grid: { display: false },
        },
      },
    },
  });
}

// ─── Matchup Heatmap ────────────────────────────────────────

function renderMatchups(matchupData) {
  const table = document.getElementById('matchup-table');
  if (!matchupData || !table) return;

  const cmds = matchupData.commanders;
  const matchups = matchupData.matchups;
  if (!cmds || !cmds.length) return;

  const matchupMap = {};
  cmds.forEach(c => { matchupMap[c] = {}; });
  matchups.forEach(m => {
    matchupMap[m.commander][m.opponent] = m;
  });

  const thead = table.querySelector('thead tr');
  thead.innerHTML = '<th class="matchup-corner"></th>' +
    cmds.map(c => `<th class="matchup-col-header" title="${c}">${c}</th>`).join('');

  const tbody = table.querySelector('tbody');
  tbody.innerHTML = cmds.map(row => {
    const cells = cmds.map(col => {
      if (row === col) {
        const selfM = matchupMap[row] && matchupMap[row][col];
        const selfTotal = selfM ? selfM.total : 0;
        return `<td class="matchup-cell matchup-self" data-type="self" data-row="${row}" data-total="${selfTotal}">${selfTotal ? selfTotal : '-'}<span class="matchup-count">${selfTotal ? 'mirror' : ''}</span></td>`;
      }
      const m = matchupMap[row] && matchupMap[row][col];
      if (!m || m.total < 5) {
        return `<td class="matchup-cell matchup-nodata" data-type="nodata" data-row="${row}" data-col="${col}" data-total="${m ? m.total : 0}">--</td>`;
      }
      const wr = (m.winrate * 100).toFixed(0);
      let cls = 'matchup-even';
      if (m.winrate > 0.55) cls = 'matchup-favored';
      else if (m.winrate < 0.45) cls = 'matchup-unfavored';

      return `<td class="matchup-cell ${cls}" data-type="data" data-row="${row}" data-col="${col}" data-wr="${wr}" data-total="${m.total}" data-wins="${m.wins}" data-losses="${m.losses}">${wr}%<span class="matchup-count">${m.total}</span></td>`;
    }).join('');

    return `<tr><th class="matchup-row-header" title="${row}">${row}</th>${cells}</tr>`;
  }).join('');

  initMatchupTooltip();
}

function initMatchupTooltip() {
  const tooltip = document.getElementById('matchup-tooltip');
  const titleEl = document.getElementById('tooltip-title');
  const wrEl = document.getElementById('tooltip-wr');
  const gamesEl = document.getElementById('tooltip-games');

  const cells = document.querySelectorAll('.matchup-cell[data-type="data"], .matchup-cell[data-type="nodata"], .matchup-cell[data-type="self"]');

  cells.forEach(cell => {
    cell.addEventListener('mouseenter', () => {
      const row = cell.dataset.row;
      const col = cell.dataset.col;
      const type = cell.dataset.type;

      if (type === 'self') {
        const total = parseInt(cell.dataset.total) || 0;
        titleEl.textContent = `${row} mirror match`;
        wrEl.textContent = 'Mirror';
        wrEl.style.color = '#8b949e';
        gamesEl.textContent = `${total} game${total !== 1 ? 's' : ''} played`;
      } else if (type === 'nodata') {
        titleEl.textContent = `${row} vs ${col}`;
        const total = parseInt(cell.dataset.total) || 0;
        wrEl.textContent = 'Insufficient data';
        wrEl.style.color = '#8b949e';
        gamesEl.textContent = `${total} game${total !== 1 ? 's' : ''} played`;
      } else {
        titleEl.textContent = `${row} vs ${col}`;
        const wr = cell.dataset.wr;
        const total = cell.dataset.total;
        const wins = cell.dataset.wins;
        const losses = cell.dataset.losses;
        const wrNum = parseInt(wr);

        wrEl.textContent = `${wr}% winrate`;
        if (wrNum > 55) wrEl.style.color = '#3fb950';
        else if (wrNum < 45) wrEl.style.color = '#f0834a';
        else wrEl.style.color = '#e6edf3';

        gamesEl.textContent = `${total} games (${wins}W - ${losses}L)`;
      }

      tooltip.classList.add('visible');
    });

    cell.addEventListener('mousemove', e => {
      tooltip.style.left = (e.clientX + 12) + 'px';
      tooltip.style.top = (e.clientY - 10) + 'px';
    });

    cell.addEventListener('mouseleave', () => {
      tooltip.classList.remove('visible');
    });

    // Click to open detail modal (only for cells with enough data)
    if (cell.dataset.type === 'data') {
      cell.style.cursor = 'pointer';
      cell.addEventListener('click', () => {
        tooltip.classList.remove('visible');
        openMatchupModal(cell.dataset.row, cell.dataset.col);
      });
    }
  });
}

// ─── Commander Popularity Trends ─────────────────────────────

function buildFactionLookup() {
  const lookup = {};
  const cmdStats = getPeriodData(appData.commanderStats, currentPeriod);
  if (cmdStats) cmdStats.forEach(c => { lookup[c.name] = c.faction; });
  return lookup;
}

function buildTogglePills(container, entries, selectedSet, factionLookup, rerender) {
  if (!container) return;
  container.innerHTML = entries.map(cmd => {
    const faction = factionLookup[cmd.name] || '';
    const active = selectedSet.has(cmd.name) ? ' active' : '';
    return `<button class="filter-btn${active}" data-faction="${faction}" data-commander="${cmd.name}">${cmd.name}</button>`;
  }).join('');
  container.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.commander;
      if (selectedSet.has(name)) selectedSet.delete(name);
      else selectedSet.add(name);
      rerender();
    });
  });
}

function buildColoredDatasets(entries, selectedSet, factionLookup, opts = {}) {
  const visible = entries.filter(e => selectedSet.has(e.name));
  const factionCounter = {};
  return visible.map(cmd => {
    const faction = factionLookup[cmd.name] || 'neutral';
    const baseColor = FACTION_COLORS[faction] || '#58a6ff';
    const idx = factionCounter[faction] || 0;
    factionCounter[faction] = idx + 1;
    const color = idx === 0 ? baseColor : shiftColor(baseColor, idx * 15);
    return {
      label: cmd.name,
      data: cmd.chartData,
      borderColor: color,
      backgroundColor: opts.fill ? color + '88' : 'transparent',
      fill: !!opts.fill,
      tension: 0.3,
      pointRadius: 0,
      pointHoverRadius: 4,
      borderWidth: 1.5,
      spanGaps: true,
    };
  });
}

function renderCommanderTrends(cmdTrends) {
  const canvas = document.getElementById('commander-trends-chart');
  const toggleContainer = document.getElementById('cmd-trend-toggles');
  if (!canvas) return;

  if (cmdTrendsChart) { cmdTrendsChart.destroy(); cmdTrendsChart = null; }

  if (!cmdTrends || !cmdTrends.dates || !cmdTrends.dates.length) {
    canvas.style.display = 'none';
    if (toggleContainer) toggleContainer.innerHTML = '';
    return;
  }
  canvas.style.display = '';

  const factionLookup = buildFactionLookup();

  const cmdEntries = Object.entries(cmdTrends.commanders)
    .map(([name, data]) => ({ name, data, avg: data.reduce((s, v) => s + v, 0) / data.length }))
    .sort((a, b) => b.avg - a.avg);

  if (selectedCommanders.size === 0 && cmdEntries.length > 0) {
    selectedCommanders.add(cmdEntries[0].name);
  }

  const rerender = () => renderCommanderTrends(cmdTrends);
  buildTogglePills(toggleContainer, cmdEntries, selectedCommanders, factionLookup, rerender);

  // Apply binning
  let labels = cmdTrends.dates;
  const visible = cmdEntries.filter(e => selectedCommanders.has(e.name));
  let chartEntries = visible.map(e => ({ ...e, chartData: e.data }));

  if (currentBin['cmd-trend'] === 'month') {
    const grouped = groupByMonth(cmdTrends.dates, visible.map(e => e.data));
    labels = grouped.dates;
    chartEntries = visible.map((e, i) => ({ ...e, chartData: grouped.values[i] }));
  }

  const datasets = buildColoredDatasets(chartEntries, selectedCommanders, factionLookup, { fill: true });

  cmdTrendsChart = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: datasets.length > 1,
          labels: { usePointStyle: true, pointStyle: 'circle', padding: 14, font: { size: 10 } },
        },
        tooltip: {
          ...CHART_TOOLTIP,
          callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}%` },
        },
      },
      scales: {
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: { callback: v => v + '%' },
          grid: { color: '#21262d' },
          title: { display: true, text: 'Pick Rate', color: '#8b949e', font: { size: 11 } },
        },
        x: {
          ticks: { maxTicksLimit: 15, maxRotation: 45 },
          grid: { display: false },
        },
      },
    },
  });
}

// ─── Commander Winrate Trends ───────────────────────────────

function renderCommanderWinrateTrends(wrTrends) {
  const canvas = document.getElementById('commander-winrate-chart');
  const toggleContainer = document.getElementById('cmd-wr-toggles');
  if (!canvas) return;

  if (cmdWrTrendsChart) { cmdWrTrendsChart.destroy(); cmdWrTrendsChart = null; }

  if (!wrTrends || !wrTrends.dates || !wrTrends.dates.length) {
    canvas.style.display = 'none';
    if (toggleContainer) toggleContainer.innerHTML = '';
    return;
  }
  canvas.style.display = '';

  const factionLookup = buildFactionLookup();
  const excludeMirrors = document.getElementById('cmd-wr-no-mirror')?.checked || false;
  const wrKey = excludeMirrors ? 'winrate_no_mirror' : 'winrate';
  const gamesKey = excludeMirrors ? 'games_no_mirror' : 'games';

  // Sort by total games (descending)
  const cmdEntries = Object.entries(wrTrends.commanders)
    .map(([name, d]) => ({
      name,
      data: d[wrKey],
      games: d[gamesKey],
      totalGames: d[gamesKey].reduce((s, v) => s + v, 0),
    }))
    .sort((a, b) => b.totalGames - a.totalGames);

  if (selectedWrCommanders.size === 0 && cmdEntries.length > 0) {
    selectedWrCommanders.add(cmdEntries[0].name);
  }

  const rerender = () => {
    const fresh = getPeriodData(appData.commanderWinrateTrends, currentPeriod);
    renderCommanderWinrateTrends(fresh);
  };
  buildTogglePills(toggleContainer, cmdEntries, selectedWrCommanders, factionLookup, rerender);

  // Wire mirror checkbox
  const mirrorCb = document.getElementById('cmd-wr-no-mirror');
  if (mirrorCb && !mirrorCb._wired) {
    mirrorCb.addEventListener('change', rerender);
    mirrorCb._wired = true;
  }

  // Apply binning
  let labels = wrTrends.dates;
  const visible = cmdEntries.filter(e => selectedWrCommanders.has(e.name));
  let chartEntries = visible.map(e => ({ ...e, chartData: e.data }));

  if (currentBin['cmd-wr'] === 'month') {
    const grouped = groupByMonth(wrTrends.dates, visible.map(e => e.data));
    labels = grouped.dates;
    chartEntries = visible.map((e, i) => ({ ...e, chartData: grouped.values[i] }));
  }

  const datasets = buildColoredDatasets(chartEntries, selectedWrCommanders, factionLookup, { fill: false });

  cmdWrTrendsChart = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: datasets.length > 1,
          labels: { usePointStyle: true, pointStyle: 'circle', padding: 14, font: { size: 10 } },
        },
        tooltip: {
          ...CHART_TOOLTIP,
          callbacks: { label: ctx => {
            const v = ctx.parsed.y;
            return v !== null ? `${ctx.dataset.label}: ${v.toFixed(1)}%` : `${ctx.dataset.label}: --`;
          }},
        },
      },
      scales: {
        y: {
          min: 0, max: 100,
          ticks: { callback: v => v + '%' },
          grid: { color: '#21262d' },
          title: { display: true, text: 'Win Rate', color: '#8b949e', font: { size: 11 } },
        },
        x: {
          ticks: { maxTicksLimit: 15, maxRotation: 45 },
          grid: { display: false },
        },
      },
    },
  });
}

// ─── First-Turn Commander Chart ─────────────────────────────

function renderFirstTurnChart(ftData) {
  const canvas = document.getElementById('first-turn-chart');
  const section = document.getElementById('first-turn-section');
  if (!canvas || !section) return;

  if (firstTurnChart) {
    firstTurnChart.destroy();
    firstTurnChart = null;
  }

  if (!ftData || !ftData.total_games || !ftData.per_commander) {
    section.style.display = 'none';
    return;
  }

  const MIN_GAMES = 5;
  const cmds = Object.entries(ftData.per_commander)
    .filter(([, d]) => d.first_games >= MIN_GAMES && d.second_games >= MIN_GAMES)
    .sort((a, b) => (b[1].first_winrate - b[1].second_winrate) - (a[1].first_winrate - a[1].second_winrate));

  if (!cmds.length) {
    section.style.display = 'none';
    return;
  }

  section.style.display = '';

  el('ft-going-first', (ftData.first_player_winrate * 100).toFixed(1) + '%');
  el('ft-going-second', ((1 - ftData.first_player_winrate) * 100).toFixed(1) + '%');
  el('ft-overall-games', ftData.total_games.toLocaleString() + ' games');

  firstTurnChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: cmds.map(([name]) => name),
      datasets: [
        {
          label: 'Going First',
          data: cmds.map(([, d]) => (d.first_winrate * 100).toFixed(1)),
          backgroundColor: '#58a6ff99',
          borderColor: '#58a6ff',
          borderWidth: 1,
          borderRadius: 3,
        },
        {
          label: 'Going Second',
          data: cmds.map(([, d]) => (d.second_winrate * 100).toFixed(1)),
          backgroundColor: '#f0834a99',
          borderColor: '#f0834a',
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
            label: ctx => {
              const d = cmds[ctx.dataIndex][1];
              const isFirst = ctx.datasetIndex === 0;
              const games = isFirst ? d.first_games : d.second_games;
              const adv = ((d.first_winrate - d.second_winrate) * 100).toFixed(1);
              const advStr = adv >= 0 ? `+${adv}pp` : `${adv}pp`;
              return `${ctx.dataset.label}: ${ctx.parsed.y}% (${games} games) · ${advStr}`;
            },
          },
        },
      },
      scales: {
        y: {
          min: 20,
          max: 80,
          ticks: { callback: v => v + '%' },
          grid: { color: '#21262d' },
        },
        x: {
          ticks: { maxRotation: 45, font: { size: 10 } },
          grid: { display: false },
        },
      },
    },
  });
}

// ─── Matchup Detail Modal ────────────────────────────────────

function buildArtLookup() {
  const lookup = {};
  if (appData.commanders) {
    appData.commanders.forEach(c => { lookup[c.name] = c.art; });
  }
  return lookup;
}

function buildFactionLookup() {
  const lookup = {};
  if (appData.commanders) {
    appData.commanders.forEach(c => { lookup[c.name] = c.faction; });
  }
  return lookup;
}

function syncModalFilterBar() {
  // Sync modal filter buttons with global state
  document.querySelectorAll('.modal-time-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.period === currentPeriod);
  });
  document.querySelectorAll('.modal-map-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.map === currentMap);
  });
}

async function openMatchupModal(cmd1, cmd2) {
  const details = await loadMatchupDetails();
  if (!details) return;

  const periodData = getPeriodData(details, currentPeriod);
  if (!periodData) return;

  const matchup = periodData.find(m => m.commander === cmd1 && m.opponent === cmd2);
  if (!matchup) return;

  matchupModalOpen = true;
  matchupModalCmd1 = cmd1;
  matchupModalCmd2 = cmd2;

  syncModalFilterBar();
  renderMatchupModalContent(matchup, cmd1, cmd2);

  const modal = document.getElementById('matchup-modal');
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  document.body.classList.add('modal-open');
}

function renderMatchupModalContent(matchup, cmd1, cmd2) {
  const artLookup = buildArtLookup();
  const factionLookup = buildFactionLookup();

  // Commander 1 header
  const art1 = document.getElementById('matchup-cmd1-art');
  const artPath1 = artLookup[cmd1];
  if (artPath1) { art1.src = artPath1; art1.style.display = ''; }
  else { art1.style.display = 'none'; }
  document.getElementById('matchup-cmd1-name').textContent = cmd1;
  document.getElementById('matchup-cmd1-faction').innerHTML = factionBadge(factionLookup[cmd1] || '');

  // Commander 2 header
  const art2 = document.getElementById('matchup-cmd2-art');
  const artPath2 = artLookup[cmd2];
  if (artPath2) { art2.src = artPath2; art2.style.display = ''; }
  else { art2.style.display = 'none'; }
  document.getElementById('matchup-cmd2-name').textContent = cmd2;
  document.getElementById('matchup-cmd2-faction').innerHTML = factionBadge(factionLookup[cmd2] || '');

  // Unified stats table
  const statsEl = document.getElementById('matchup-modal-stats');
  const shortCmd1 = cmd1;
  const shortCmd2 = cmd2;

  const wrPct = (matchup.winrate * 100).toFixed(1);
  const wrNum = matchup.winrate * 100;
  const oppWrPct = ((1 - matchup.winrate) * 100).toFixed(1);
  let cmd1WrCls = 'ft-wr-even';
  let cmd2WrCls = 'ft-wr-even';
  if (wrNum > 55) { cmd1WrCls = 'ft-wr-high'; cmd2WrCls = 'ft-wr-low'; }
  else if (wrNum < 45) { cmd1WrCls = 'ft-wr-low'; cmd2WrCls = 'ft-wr-high'; }

  const ft = matchup.first_turn;
  let turnRows = '';
  if (ft && (ft.cmd_first_games > 0 || ft.opp_first_games > 0)) {
    const cmd1FirstWR = ft.cmd_first_games > 0 ? ((ft.cmd_first_wins / ft.cmd_first_games) * 100).toFixed(0) : '--';
    const cmd1SecondWR = ft.opp_first_games > 0 ? ((ft.opp_first_wins / ft.opp_first_games) * 100).toFixed(0) : '--';
    const cmd2FirstWR = ft.opp_first_games > 0 ? (((ft.opp_first_games - ft.opp_first_wins) / ft.opp_first_games) * 100).toFixed(0) : '--';
    const cmd2SecondWR = ft.cmd_first_games > 0 ? (((ft.cmd_first_games - ft.cmd_first_wins) / ft.cmd_first_games) * 100).toFixed(0) : '--';

    turnRows = `
      <tr>
        <td class="ft-label">Going First</td>
        <td><strong>${cmd1FirstWR}%</strong> <span class="ft-games">(${ft.cmd_first_games} gm)</span></td>
        <td><strong>${cmd2FirstWR}%</strong> <span class="ft-games">(${ft.opp_first_games} gm)</span></td>
      </tr>
      <tr>
        <td class="ft-label">Going Second</td>
        <td><strong>${cmd1SecondWR}%</strong> <span class="ft-games">(${ft.opp_first_games} gm)</span></td>
        <td><strong>${cmd2SecondWR}%</strong> <span class="ft-games">(${ft.cmd_first_games} gm)</span></td>
      </tr>`;
  }

  statsEl.innerHTML =
    `<table class="ft-table">
      <thead><tr>
        <th></th>
        <th>${shortCmd1}</th>
        <th>${shortCmd2}</th>
      </tr></thead>
      <tbody>
        <tr class="ft-headline-row">
          <td class="ft-label">Win Rate</td>
          <td><span class="ft-headline ${cmd1WrCls}">${wrPct}%</span><br><span class="ft-games">${matchup.wins}W - ${matchup.losses}L</span></td>
          <td><span class="ft-headline ${cmd2WrCls}">${oppWrPct}%</span><br><span class="ft-games">${matchup.losses}W - ${matchup.wins}L</span></td>
        </tr>
        ${turnRows}
      </tbody>
    </table>
    <div class="ft-total">${matchup.total} games played</div>`;

  // Card lists
  document.getElementById('matchup-cards-title-1').textContent = `Top Cards — ${cmd1}`;
  document.getElementById('matchup-cards-title-2').textContent = `Top Cards — ${cmd2}`;
  renderCardList(matchup.cmd_cards, 'matchup-cards-list-1');
  renderCardList(matchup.opp_cards, 'matchup-cards-list-2');
}

function renderCardList(cards, containerId) {
  const container = document.getElementById(containerId);
  if (!cards || !cards.length) {
    container.innerHTML = '<p class="matchup-cards-empty">No card data available</p>';
    return;
  }

  const header = `<div class="matchup-card-row matchup-card-header">
    <span class="matchup-card-name"></span>
    <span class="matchup-card-stats">
      <span class="matchup-col-label">Played WR</span>
      <span class="matchup-col-label">Drawn WR</span>
      <span class="matchup-card-games">Games</span>
    </span>
  </div>`;

  const rows = cards.map(card => {
    const playedPct = (card.played_winrate * 100).toFixed(0);
    const drawnPct = (card.drawn_winrate * 100).toFixed(0);
    const playedNum = card.played_winrate * 100;
    const drawnNum = card.drawn_winrate * 100;

    let playedCls = 'matchup-wr-even';
    if (playedNum > 55) playedCls = 'matchup-wr-high';
    else if (playedNum < 45) playedCls = 'matchup-wr-low';

    let drawnCls = 'matchup-wr-even';
    if (drawnNum > 55) drawnCls = 'matchup-wr-high';
    else if (drawnNum < 45) drawnCls = 'matchup-wr-low';

    return `<div class="matchup-card-row">
      <span class="matchup-card-name">${card.name}</span>
      <span class="matchup-card-stats">
        <span class="${playedCls}">${playedPct}%</span>
        <span class="${drawnCls}">${drawnPct}%</span>
        <span class="matchup-card-games">${card.played}</span>
      </span>
    </div>`;
  }).join('');

  container.innerHTML = header + rows;
}

function closeMatchupModal() {
  const modal = document.getElementById('matchup-modal');
  if (!modal) return;
  modal.classList.remove('open');
  document.body.style.overflow = '';
  document.body.classList.remove('modal-open');
  matchupModalOpen = false;
  matchupModalCmd1 = null;
  matchupModalCmd2 = null;
}

async function rerenderMatchupModal() {
  if (!matchupModalCmd1 || !matchupModalCmd2) return;
  const details = await loadMatchupDetails();
  if (!details) return;
  const periodData = getPeriodData(details, currentPeriod);
  if (!periodData) return;
  const matchup = periodData.find(m => m.commander === matchupModalCmd1 && m.opponent === matchupModalCmd2);
  if (!matchup) {
    closeMatchupModal();
    return;
  }
  renderMatchupModalContent(matchup, matchupModalCmd1, matchupModalCmd2);
}

function initMatchupModal() {
  const modal = document.getElementById('matchup-modal');
  const closeBtn = document.getElementById('matchup-modal-close');

  if (closeBtn) {
    closeBtn.addEventListener('click', closeMatchupModal);
  }

  if (modal) {
    modal.addEventListener('click', e => {
      if (e.target === modal) closeMatchupModal();
    });
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && matchupModalOpen) closeMatchupModal();
  });

  // Modal filter bar: period buttons
  document.querySelectorAll('.modal-time-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentPeriod = btn.dataset.period;
      // Sync global filter bar too
      document.querySelectorAll('.time-btn').forEach(b => b.classList.toggle('active', b.dataset.period === currentPeriod));
      syncModalFilterBar();
      renderAll();
    });
  });

  // Modal filter bar: map buttons
  document.querySelectorAll('.modal-map-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentMap = btn.dataset.map;
      // Sync global filter bar too
      document.querySelectorAll('.map-btn:not(.modal-map-btn)').forEach(b => b.classList.toggle('active', b.dataset.map === currentMap));
      syncModalFilterBar();
      renderAll();
    });
  });
}

// ─── Render All ─────────────────────────────────────────────

function renderAll() {
  const period = currentPeriod;
  const metadata = getPeriodData(appData.metadata, period);
  const trends = getPeriodData(appData.trends, period);
  const cmdTrends = getPeriodData(appData.commanderTrends, period);
  const wrTrends = getPeriodData(appData.commanderWinrateTrends, period);
  const matchups = getPeriodData(appData.matchups, period);
  const firstTurn = getPeriodData(appData.firstTurn, period);

  renderMetadata(metadata);
  renderMatchups(matchups);
  renderCommanderWinrateTrends(wrTrends);
  renderMetaChart(trends);
  renderCommanderTrends(cmdTrends);
  renderFirstTurnChart(firstTurn);

  if (matchupModalOpen) rerenderMatchupModal();
}

// ─── Collapsible Sections ───────────────────────────────────

function initCollapsible() {
  document.querySelectorAll('.section-title.collapsible').forEach((title) => {
    const body = title.parentElement.querySelector('.section-body');
    if (!body) return;

    // First section expanded, rest collapsed (set in HTML via .collapsed class)
    if (body.classList.contains('collapsed')) {
      title.classList.add('collapsed');
      body.style.maxHeight = '0';
      body.style.opacity = '0';
      body.style.overflow = 'hidden';
    } else {
      body.style.maxHeight = body.scrollHeight + 'px';
      body.style.opacity = '1';
      body.style.overflow = 'visible';
    }

    title.addEventListener('click', (e) => {
      // Don't collapse when clicking tooltip icon
      if (e.target.closest('.tooltip-icon')) return;

      const isCollapsed = body.classList.contains('collapsed');
      if (isCollapsed) {
        body.classList.remove('collapsed');
        title.classList.remove('collapsed');
        body.style.overflow = 'hidden';
        body.style.maxHeight = body.scrollHeight + 'px';
        body.style.opacity = '1';
        setTimeout(() => { body.style.overflow = 'visible'; }, 300);
      } else {
        body.style.maxHeight = body.scrollHeight + 'px';
        body.style.overflow = 'hidden';
        requestAnimationFrame(() => {
          body.classList.add('collapsed');
          title.classList.add('collapsed');
          body.style.maxHeight = '0';
          body.style.opacity = '0';
        });
      }
    });
  });
}

// ─── Bin Toggles ────────────────────────────────────────────

function initBinToggles() {
  document.querySelectorAll('.bin-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      const bin = btn.dataset.bin;
      currentBin[target] = bin;

      // Update active state for this toggle group
      btn.closest('.bin-toggle').querySelectorAll('.bin-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.bin === bin);
      });

      renderAll();
    });
  });
}

// ─── Init ───────────────────────────────────────────────────

async function init() {
  appData = await loadData(['metadata', 'trends', 'matchups', 'commanderStats',
                            'commanderTrends', 'firstTurn', 'commanders',
                            'commanderWinrateTrends']);
  renderAll();
  initTimeFilters(renderAll);
  initMapFilters(renderAll);
  initMatchupModal();
  initCollapsible();
  initBinToggles();
  initNavActiveState();
  initTooltips();
}

document.addEventListener('DOMContentLoaded', init);
