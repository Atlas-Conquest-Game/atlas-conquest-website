/* ==========================================================================
   Atlas Conquest — "Living Board" hero
   A canvas hex board painted with real terrain tiles cut from the game's
   Dunes, Snowmelt and Tropics maps. Two territories (green = you, red = the
   enemy) grow from their commanders and contest the front line. Visitors
   claim tiles next to their border, and play a legal Jagris (Grenalia +
   Neutral) hand onto the board — with the real deploy rules.
   ========================================================================== */
(function () {
  'use strict';

  const hero = document.getElementById('hero');
  const canvas = document.getElementById('board');
  const handEl = document.getElementById('hand');
  const toastEl = hero && hero.querySelector('.board-toast');
  if (!hero || !canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');

  // An overflow:hidden box can still be scrolled by focus(); never let the hero scroll inside itself.
  hero.addEventListener('scroll', () => { if (hero.scrollTop || hero.scrollLeft) { hero.scrollTop = 0; hero.scrollLeft = 0; } });

  const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mqFine = window.matchMedia('(hover: hover) and (pointer: fine)');
  let RM = mqReduce.matches;

  const ASSETS = '../../assets/';
  const SQ3 = Math.sqrt(3);
  const NEUTRAL = 0, YOU = 1, FOE = 2;
  const SIDE = {
    1: { line: '#4ae27f', rgb: '74,226,127', deep: '4,30,14' },
    2: { line: '#f0524f', rgb: '240,82,79', deep: '40,5,7' },
  };
  // Fallback flat colours (used only until the tile atlas has loaded)
  const BIOME = {
    sand: { top: [92, 74, 46], bot: [58, 44, 28] },
    snow: { top: [70, 84, 104], bot: [40, 50, 66] },
    jungle: { top: [40, 72, 44], bot: [22, 42, 26] },
  };
  // Real terrain tiles, cut from trailer frames of the three maps (img/tiles.webp, 7 × 4 grid of 144 × 166 hexes).
  const ATLAS = { cols: 7, w: 144, h: 166 };
  const atlas = new Image();
  atlas.decoding = 'async';
  atlas.src = 'img/tiles.webp';
  const SPR = { // [atlas index, weight]
    sand:   { plain: [[0, 5], [1, 5], [2, 3], [3, 3], [4, 3], [5, 2], [6, 2], [7, 1]], village: [[8, 1]], mountain: [[9, 1], [10, 1]] },
    snow:   { plain: [[11, 4], [12, 4], [13, 4], [14, 3], [15, 3], [16, 1]], village: [[19, 1]], mountain: [[17, 1], [18, 1]] },
    jungle: { plain: [[20, 4], [21, 4], [22, 3], [23, 2], [24, 2], [25, 2], [26, 2]], village: [[8, 1]], mountain: [[27, 1]] },
  };
  // axial directions, indexed by hex edge k (edge k joins vertex k and k+1; vertex 0 is the top point)
  const DIRS = [[1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1]];
  const VX = [], VY = [];
  for (let k = 0; k < 6; k++) { const a = (60 * k - 90) * Math.PI / 180; VX.push(Math.cos(a)); VY.push(Math.sin(a)); }

  // A legal hand for Jagris, the Huntsman (Grenalia): Grenalia + Neutral cards only.
  const CARDS = {
    'explosive-potion':    { name: 'Explosive Potion', type: 'spell', dmg: 2 },
    'viridian-war-beast':  { name: 'Viridian War Beast', type: 'minion', p: 7, h: 12, note: '<b>Trample</b>: when it kills an enemy, it regains an attack.' },
    'green-dragon':        { name: 'Green Dragon', type: 'minion', p: 6, h: 8, note: '<b>Flying</b>: it can cross mountains.' },
    'dread-knight':        { name: 'Dread Knight', type: 'minion', p: 7, h: 6, cmdDeploy: true },
    'king-darian':         { name: 'King Darian', type: 'minion', p: 7, h: 6, legendary: true },
    'giant-river-snapper': { name: 'Giant River Snapper', type: 'minion', p: 8, h: 10, heal: 8 },
    'eagle-king':          { name: 'Eagle King', type: 'minion', p: 3, h: 4, note: '<b>Flying</b>: it can cross mountains.' },
    'grutali':             { name: 'Grutali', type: 'minion', p: 4, h: 13, legendary: true, note: '<b>Arrival</b>: gain 5 Dominion.' },
    'silver-dragon':       { name: 'Silver Dragon', type: 'minion', p: 5, h: 5, note: '<b>Shield</b> and <b>Flying</b>.' },
    'royal-commandant':    { name: 'Royal Commandant', type: 'minion', p: 6, h: 6, note: 'Allies within 3 tiles get +1 Power, Speed and Health.' },
    'lumbering-ogre':      { name: 'Lumbering Ogre', type: 'minion', p: 6, h: 7 },
  };
  const START_HAND = ['explosive-potion', 'viridian-war-beast', 'green-dragon', 'dread-knight', 'king-darian'];
  const DRAW_PILE = ['giant-river-snapper', 'eagle-king', 'explosive-potion', 'grutali', 'silver-dragon',
    'royal-commandant', 'lumbering-ogre', 'green-dragon', 'viridian-war-beast', 'dread-knight', 'king-darian'];
  const COMMANDERS = {
    [YOU]: { name: 'Jagris', slug: 'jagris-the-huntsman', health: 29 },
    [FOE]: { name: 'Captain Greenbeard', slug: 'captain-greenbeard', health: 28 },
  };

  // ─── helpers ────────────────────────────────────────────
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (k) => 1 - Math.pow(1 - k, 3);
  function hash(q, r, s) {
    let h = Math.imul(q | 0, 374761393) ^ Math.imul(r | 0, 668265263) ^ Math.imul((s | 0) + 1, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  const rgb = (c, j) => `rgb(${c.map((v) => clamp(Math.round(v * (1 + j)), 0, 255)).join(',')})`;
  function hexPath(c, x, y, s) {
    c.moveTo(x + s * VX[0], y + s * VY[0]);
    for (let k = 1; k < 6; k++) c.lineTo(x + s * VX[k], y + s * VY[k]);
    c.closePath();
  }
  function pickW(list, u) {
    const sum = list.reduce((a, x) => a + x[1], 0);
    let r = u * sum;
    for (const x of list) { r -= x[1]; if (r <= 0) return x[0]; }
    return list[list.length - 1][0];
  }
  const imgCache = {};
  function getImg(src) {
    if (!imgCache[src]) { const im = new Image(); im.decoding = 'async'; im.src = src; imgCache[src] = im; }
    return imgCache[src];
  }
  const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;

  // ─── state ──────────────────────────────────────────────
  let W = 0, H = 0, DPR = 1, R = 40, ox = 0, oy = 0;
  let tiles = [];
  const map = new Map();
  const staticCv = document.createElement('canvas');
  let caps = {};               // side → capital tile
  let capN = 12;               // territory size each side grows to (real matches show roughly 8–14 tiles)
  let D0 = 1;                  // distance between the two capitals
  let count = { 1: 0, 2: 0 }, villages = { 1: 0, 2: 0 };
  let tokens = [], fx = [];
  let hover = null, dragTarget = null, painting = false;
  let paths = null, dirty = true;
  let covered = [];            // hero rects covered by UI (relative to hero)
  let visible = true, rafId = 0, lastDraw = 0, lastAI = 0, aiGap = 800, aiTurn = FOE;
  let built = false, introAt = 0, lastVisitorAt = -1e9, interacted = false;

  // ─── build the board ────────────────────────────────────
  const SEEDS = [
    [0.08, 0.25, 'snow'], [0.30, 0.86, 'jungle'], [0.47, 0.30, 'sand'], [0.70, 0.84, 'sand'],
    [0.92, 0.30, 'jungle'], [0.63, 0.02, 'snow'], [0.04, 0.78, 'sand'], [0.92, 0.96, 'snow'], [0.36, 0.06, 'jungle'],
  ];

  function measureCovered() {
    const hr = hero.getBoundingClientRect();
    covered = [];
    hero.querySelectorAll('.hero-content > *, .hud, .hand .hcard').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      covered.push({ l: r.left - hr.left - 8, t: r.top - hr.top - 8, r: r.right - hr.left + 8, b: r.bottom - hr.top + 8 });
    });
    covered.push({ l: 0, t: 0, r: W, b: 80 }); // nav
  }
  const isCovered = (t) => t.x < R || t.x > W - R || t.y < R || t.y > H - R ||
    covered.some((c) => t.x > c.l && t.x < c.r && t.y > c.t && t.y < c.b);

  function nearestTile(px, py, ok) {
    let best = null, bd = Infinity;
    for (const t of tiles) {
      if (ok && !ok(t)) continue;
      const d = (t.x - px) ** 2 + (t.y - py) ** 2;
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }
  const handVis = () => {
    const cs = getComputedStyle(hero);
    const cw = parseFloat(cs.getPropertyValue('--cw')) || 150;
    return cw * 1.4 * (parseFloat(cs.getPropertyValue('--hand-show')) || 0.64);
  };

  function build() {
    W = hero.clientWidth; H = hero.clientHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    R = W >= 1100 ? clamp(W / 24, 44, 64) : clamp(W / 15, 28, 50);
    const w = SQ3 * R;
    ox = W / 2; oy = H / 2;
    tiles = []; map.clear(); tokens = []; fx = []; hover = null; dragTarget = null;
    count = { 1: 0, 2: 0 }; villages = { 1: 0, 2: 0 };

    const rMin = Math.floor(-oy / (1.5 * R)) - 1, rMax = Math.ceil((H - oy) / (1.5 * R)) + 1;
    for (let r = rMin; r <= rMax; r++) {
      const qMin = Math.floor((-w - ox) / w - r / 2), qMax = Math.ceil((W + w - ox) / w - r / 2);
      for (let q = qMin; q <= qMax; q++) {
        const x = ox + w * (q + r / 2), y = oy + 1.5 * R * r;
        if (x < -w || x > W + w || y < -2 * R || y > H + 2 * R) continue;
        const t = { q, r, key: q + ',' + r, x, y, owner: NEUTRAL, at: 0, kind: 'plain', biome: 'sand', token: null, capital: 0 };
        // biome: warped Voronoi over a few seeds → organic sand / snow / jungle regions (the three maps)
        const u = x / W, v = y / H;
        const wu = u + 0.035 * Math.sin(v * 11 + 1.7) + 0.02 * Math.sin(u * 23 + v * 7);
        const wv = v + 0.04 * Math.cos(u * 9 + 0.5) + 0.02 * Math.sin(v * 19);
        let bd = Infinity;
        for (const s of SEEDS) {
          const d = ((wu - s[0]) * W) ** 2 + ((wv - s[1]) * H) ** 2;
          if (d < bd) { bd = d; t.biome = s[2]; }
        }
        const cluster = 0.5 + 0.5 * Math.sin(x * 0.0095 + 2.1) * Math.cos(y * 0.011 - 0.7);
        if (hash(q, r, 1) < 0.03 + 0.1 * cluster * cluster) t.kind = 'mountain';
        else if (hash(q, r, 2) < 0.06) t.kind = 'village';
        tiles.push(t); map.set(t.key, t);
      }
    }
    for (const t of tiles) t.n = DIRS.map(([dq, dr]) => map.get((t.q + dq) + ',' + (t.r + dr)) || null);

    measureCovered();
    placeCapitals();
    for (const t of tiles) t.spr = pickW(SPR[t.biome][t.kind], hash(t.q, t.r, 7));

    capN = W >= 900 ? 11 : 8;
    D0 = Math.max(1, dist(caps[YOU], caps[FOE]));
    for (const side of [YOU, FOE]) {
      const c = caps[side];
      setOwner(c, side); c.n.forEach((n) => n && n.kind !== 'mountain' && setOwner(n, side));
    }
    const pre = RM ? capN : Math.round(capN * 0.62);
    for (let i = 0; i < pre; i++) { aiAct(YOU, false); aiAct(FOE, false); }
    for (const t of tiles) t.at = 0;

    // commanders on their capitals
    for (const side of [YOU, FOE]) {
      const cmd = COMMANDERS[side];
      const tk = { side, kind: 'cmd', tile: caps[side], img: getImg(`${ASSETS}commanders/${cmd.slug}.jpg`), crop: [40, 14, 320, 320], h: cmd.health, maxH: cmd.health, born: -1e9 };
      caps[side].token = tk; tokens.push(tk);
    }

    renderStatic();
    if (!built && !RM) introAt = performance.now();
    dirty = true; built = true;
    updateHUD();
    kick();
  }

  // The two commanders face off across the open band between the call-to-action row and the hand,
  // so the front line is where the visitor can see (and touch) it.
  function placeCapitals() {
    const hr = hero.getBoundingClientRect();
    const ctas = hero.querySelector('.hero-ctas');
    const ctaBottom = ctas ? ctas.getBoundingClientRect().bottom - hr.top : H * 0.6;
    const y = (ctaBottom + (H - handVis())) / 2;
    const pYou = W >= 900 ? [W * 0.2, y] : [W * 0.17, y];
    const pFoe = W >= 900 ? [W * 0.8, y - R * 0.6] : [W * 0.83, y];
    const inside = (t) => t.x > R * 1.2 && t.x < W - R * 1.2 && t.y > R && t.y < H - R;
    caps[YOU] = nearestTile(pYou[0], pYou[1], inside);
    caps[FOE] = nearestTile(pFoe[0], pFoe[1], (t) => inside(t) && t !== caps[YOU]);
    for (const side of [YOU, FOE]) {
      const c = caps[side]; c.capital = side; c.kind = 'plain';
      c.n.forEach((n) => { if (n && n.kind === 'mountain') n.kind = 'plain'; });
    }
  }

  // ─── static terrain layer ───────────────────────────────
  function renderStatic() {
    staticCv.width = canvas.width; staticCv.height = canvas.height;
    const s = staticCv.getContext('2d');
    s.setTransform(DPR, 0, 0, DPR, 0, 0);
    s.fillStyle = '#070a10'; s.fillRect(0, 0, W, H);
    const art = atlas.complete && atlas.naturalWidth > 0;
    const sw = SQ3 * R, sh = 2 * R;
    s.imageSmoothingQuality = 'high';
    for (const t of tiles) {
      s.save();
      s.beginPath(); hexPath(s, t.x, t.y, R - 0.5); s.clip();
      if (art) {
        const i = t.spr, sx = (i % ATLAS.cols) * ATLAS.w, sy = Math.floor(i / ATLAS.cols) * ATLAS.h;
        s.drawImage(atlas, sx + 1, sy + 1, ATLAS.w - 2, ATLAS.h - 2, t.x - sw / 2, t.y - R, sw, sh);
      } else {
        const b = BIOME[t.biome], j = (hash(t.q, t.r, 3) - 0.5) * 0.2;
        const g = s.createLinearGradient(t.x, t.y - R, t.x, t.y + R);
        g.addColorStop(0, rgb(b.top, j)); g.addColorStop(1, rgb(b.bot, j));
        s.fillStyle = g; s.fillRect(t.x - sw / 2, t.y - R, sw, sh);
      }
      // raised-tile bevel: light from above, shade below
      const bv = s.createLinearGradient(t.x, t.y - R, t.x, t.y + R);
      bv.addColorStop(0, 'rgba(255,240,210,.16)'); bv.addColorStop(0.45, 'rgba(255,240,210,0)');
      bv.addColorStop(0.7, 'rgba(0,0,0,0)'); bv.addColorStop(1, 'rgba(0,0,0,.42)');
      s.strokeStyle = bv; s.lineWidth = Math.max(3, R * 0.09);
      s.beginPath(); hexPath(s, t.x, t.y, R - 0.5); s.stroke();
      s.restore();
    }
    // night grade so the gold type and the territory borders read on top of the painted map
    s.fillStyle = art ? 'rgba(8, 11, 19, .54)' : 'rgba(8, 11, 19, .2)'; s.fillRect(0, 0, W, H);
    // seams + a faint gold lattice, like the trailer's hex motif
    s.beginPath();
    for (const t of tiles) hexPath(s, t.x, t.y, R);
    s.strokeStyle = 'rgba(3, 5, 9, .7)'; s.lineWidth = 2; s.stroke();
    s.strokeStyle = 'rgba(232, 162, 69, .1)'; s.lineWidth = 1; s.stroke();
  }
  atlas.addEventListener('load', () => { if (built) { renderStatic(); kick(); } });

  // ─── ownership ──────────────────────────────────────────
  function setOwner(t, side, now) {
    if (t.owner === side) return;
    if (t.owner) { count[t.owner]--; if (t.kind === 'village') villages[t.owner]--; }
    t.prev = t.owner; t.owner = side; t.at = now || 0;
    if (side) { count[side]++; if (t.kind === 'village') villages[side]++; }
    dirty = true;
  }
  const ownNeighbours = (t, side) => t.n.reduce((a, n) => a + (n && n.owner === side ? 1 : 0), 0);
  function pickWeighted(list, wf) {
    let sum = 0; const ws = list.map((t) => { const w = wf(t); sum += w; return w; });
    let r = Math.random() * sum;
    for (let i = 0; i < list.length; i++) { r -= ws[i]; if (r <= 0) return list[i]; }
    return list[list.length - 1];
  }
  const onBoard = (t) => t.x > R * 0.3 && t.x < W - R * 0.3 && t.y > R * 0.3 && t.y < H - R * 0.3;
  // territories lean towards each other, and away from tiles hidden under the hero copy
  function lean(t, side) {
    const other = caps[side === YOU ? FOE : YOU];
    const p = (D0 - dist(t, other)) / D0;
    return (0.3 + 2.4 * clamp(p + 0.2, 0, 1.2)) * (isCovered(t) ? 0.3 : 1);
  }

  function aiAct(side, animate) {
    const other = side === YOU ? FOE : YOU;
    const frontier = new Set(), border = new Set();
    for (const t of tiles) {
      if (t.owner !== side) continue;
      for (const n of t.n) {
        if (!n || n.kind === 'mountain' || !onBoard(n)) continue;
        if (n.owner === NEUTRAL) frontier.add(n);
        else if (n.owner === other && !n.capital && !n.token) border.add(n);
      }
    }
    const f = [...frontier], b = [...border];
    const now = animate ? performance.now() : 0;
    let target = null, kind = 'grow';
    const under = count[side] < capN;
    if (f.length && under && (Math.random() < 0.75 || !b.length)) {
      target = pickWeighted(f, (t) => (Math.pow(ownNeighbours(t, side), 2) + 0.4 + (t.kind === 'village' ? 3 : 0)) * lean(t, side));
    } else if (b.length && count[side] < capN + 3) {
      target = pickWeighted(b, (t) => Math.pow(ownNeighbours(t, side), 2.6) + 0.05); kind = 'contest';
    } else if (!b.length && f.length && count[side] < capN + 4) {
      // not in contact yet: push the border towards the enemy
      target = pickWeighted(f, (t) => Math.pow(lean(t, side), 3) * (ownNeighbours(t, side) + 0.2));
    }
    if (!target) return false;
    setOwner(target, side, now);
    if (animate) {
      fx.push({ type: 'ring', x: target.x, y: target.y, t0: now, dur: 800, rgb: SIDE[side].rgb, a: kind === 'contest' ? 0.75 : 0.45 });
      if (kind === 'contest') sparks(target.x, target.y, now, SIDE[side].rgb, 10);
      updateHUD();
    }
    return true;
  }

  // ─── input: claiming tiles ──────────────────────────────
  function tileAtClient(cx, cy) {
    const rect = canvas.getBoundingClientRect();
    const px = cx - rect.left, py = cy - rect.top;
    if (px < 0 || py < 0 || px > rect.width || py > rect.height) return null;
    const x = px - ox, y = py - oy;
    const qf = (SQ3 / 3 * x - y / 3) / R, rf = (2 / 3 * y) / R, sf = -qf - rf;
    let rq = Math.round(qf), rr = Math.round(rf); const rs = Math.round(sf);
    const dq = Math.abs(rq - qf), dr = Math.abs(rr - rf), ds = Math.abs(rs - sf);
    if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
    return map.get(rq + ',' + rr) || null;
  }
  // Territory grows from its edge: a tile can be claimed when it touches your territory.
  const claimable = (t) => t && t.owner !== YOU && t.kind !== 'mountain' && t.capital !== FOE && !(t.owner === FOE && t.token) &&
    t.n.some((n) => n && n.owner === YOU);

  const told = {};
  function visitorClaim(t, fromClick) {
    if (!t) return;
    const now = performance.now();
    lastVisitorAt = now; interacted = true;
    if (t.kind === 'mountain') {
      fx.push({ type: 'ring', x: t.x, y: t.y, t0: now, dur: 600, rgb: '200,205,215', a: 0.6 });
      if (fromClick) toast('<b>Mountains</b> are impassable — no one can claim them.');
      kick(); return;
    }
    if (t.capital === FOE) {
      fx.push({ type: 'ring', x: t.x, y: t.y, t0: now, dur: 600, rgb: SIDE[FOE].rgb, a: 0.8 });
      if (fromClick) toast('<span class="t-foe">Captain Greenbeard</span> stands there. Bring his Health to 0 to win.');
      kick(); return;
    }
    if (t.owner === YOU) {
      if (fromClick) {
        fx.push({ type: 'ring', x: t.x, y: t.y, t0: now, dur: 600, rgb: SIDE[YOU].rgb, a: 0.5, small: true });
        if (!told.own) { told.own = 1; toast('Already yours. Claim a tile on the <span class="t-you">edge</span> of your territory to grow it.'); }
      }
      kick(); return;
    }
    if (!claimable(t)) {
      fx.push({ type: 'ring', x: t.x, y: t.y, t0: now, dur: 600, rgb: '200,205,215', a: 0.55, small: true });
      if (fromClick) toast('Territory grows from its edge — claim a tile <span class="t-you">next to yours</span>.');
      kick(); return;
    }
    wave(t, now);
    const wasFoe = t.owner === FOE;
    setOwner(t, YOU, now);
    fx.push({ type: 'ring', x: t.x, y: t.y, t0: now, dur: 900, rgb: SIDE[YOU].rgb, a: 0.9 });
    sparks(t.x, t.y, now, '247,220,154', wasFoe ? 14 : 8);
    updateHUD();
    if (t.kind === 'village' && !told.village) { told.village = 1; toast('Village claimed — villages make <b>2 mana</b> a turn instead of 1.'); }
    else if (wasFoe && !told.steal) { told.steal = 1; toast('Tile taken from the enemy. Expect them to push back.'); }
    else if (!told.first) { told.first = 1; toast('Tile claimed. Every tile you hold makes <b>1 mana</b> a turn, from next turn.'); }
    kick();
  }

  function wave(t, now) {
    if (RM) return;
    const list = [];
    for (const o of tiles) { const d = dist(t, o); if (d > 0 && d <= 3) list.push([o, d]); }
    fx.push({ type: 'wave', t0: now, dur: 900, list });
  }
  function sparks(x, y, now, col, n) {
    if (RM) return;
    const parts = [];
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = 0.5 + Math.random(); parts.push([Math.cos(a) * v, Math.sin(a) * v, 1 + Math.random() * 1.6]); }
    fx.push({ type: 'sparks', x, y, t0: now, dur: 700, parts, col });
  }

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const t = tileAtClient(e.clientX, e.clientY);
    if (t !== hover) {
      hover = t;
      canvas.style.cursor = t && (claimable(t) || t.capital === FOE) ? 'pointer' : 'default';
      if (t && !RM && claimable(t)) fx.push({ type: 'ring', x: t.x, y: t.y, t0: performance.now(), dur: 520, rgb: '247,220,154', a: 0.35, small: true });
      if (painting && (e.buttons & 1) && t) visitorClaim(t, false);
      kick();
    }
  });
  canvas.addEventListener('pointerleave', () => { hover = null; kick(); });
  canvas.addEventListener('pointerdown', (e) => { clearPreview(); if (e.pointerType !== 'touch' && e.button === 0) painting = true; });
  window.addEventListener('pointerup', () => { painting = false; });
  canvas.addEventListener('click', (e) => visitorClaim(tileAtClient(e.clientX, e.clientY), true));

  // ─── tokens, spells, damage ─────────────────────────────
  const CARD_CROP = [104, 46, 192, 192]; // art window of a 400×560 card render
  function canPlay(slug, t) {
    const c = CARDS[slug];
    if (!t) return { ok: false, why: '' };
    if (c.type === 'spell') return { ok: true };
    if (t.kind === 'mountain') return { ok: false, why: '<b>Mountains</b> are impassable — minions can’t be played there.' };
    if (t.token) return { ok: false, why: 'That tile is already occupied.' };
    if (c.legendary && tokens.some((k) => k.slug === slug && !k.dying)) return { ok: false, why: `<b>Legendary</b>: only one ${c.name} on the board at a time.` };
    if (t.owner === YOU) return { ok: true };
    if (c.cmdDeploy && dist(t, caps[YOU]) === 1) return { ok: true, via: 'cmdDeploy' };
    return {
      ok: false,
      why: c.cmdDeploy ? '<b>Commander-Deploy</b>: play it in your territory or next to your commander.'
        : 'Minions can only be played in <span class="t-you">your territory</span>.',
    };
  }

  function play(slug, t, via) {
    const c = CARDS[slug];
    const now = performance.now();
    lastVisitorAt = now; interacted = true;
    if (c.type === 'spell') {
      boom(t, c.dmg, now);
      toast(`<b>${c.name}</b>: ${c.dmg} damage to <b>all</b> characters within 1 tile.`);
      kick(); return;
    }
    const tk = { side: YOU, kind: 'minion', slug, tile: t, img: getImg(`${ASSETS}media/cards/${slug}.webp`), crop: CARD_CROP, p: c.p, h: c.h, maxH: c.h, born: RM ? -1e9 : now };
    t.token = tk; tokens.push(tk);
    fx.push({ type: 'ring', x: t.x, y: t.y, t0: now, dur: 800, rgb: SIDE[YOU].rgb, a: 0.9 });
    sparks(t.x, t.y, now, '247,220,154', 12);
    const mins = tokens.filter((k) => k.kind === 'minion' && !k.dying);
    if (mins.length > 6) kill(mins[0], now);
    if (via === 'cmdDeploy') toast(`<b>Commander-Deploy</b>: ${c.name} can enter next to your commander, even outside your territory.`);
    else if (c.heal) {
      const cmd = caps[YOU].token;
      if (cmd) { cmd.h = Math.min(cmd.maxH, cmd.h + c.heal); floatText(cmd.tile, `+${c.heal}`, '#7dff9f', now); }
      toast(`<b>${c.name}</b> arrives — your commander heals ${c.heal}.`);
    } else if (c.note) toast(`<b>${c.name}</b> deployed. ${c.note}`);
    else toast(`<b>${c.name}</b> deployed onto <span class="t-you">your territory</span>.`);
    kick();
  }

  function boom(t, dmg, now) {
    fx.push({ type: 'boom', t, t0: now, dur: 950, list: [t, ...t.n.filter(Boolean)] });
    sparks(t.x, t.y, now, '255,190,80', 28);
    let killedCmd = null;
    for (const k of tokens.slice()) {
      if (k.dying || dist(k.tile, t) > 1) continue;
      k.h -= dmg; k.hit = now;
      floatText(k.tile, `-${dmg}`, '#ffb36b', now);
      if (k.h <= 0) { if (k.kind === 'cmd') killedCmd = k; else kill(k, now); }
    }
    if (killedCmd) {
      killedCmd.h = 0;
      const mine = killedCmd.side === YOU;
      setTimeout(() => toast(mine
        ? 'Spells hit <b>all</b> characters in range — including your own commander. Restarting…'
        : '<b>Enemy commander defeated.</b> In a real match, that’s the win.', 4200), 300);
      setTimeout(() => { killedCmd.h = killedCmd.maxH; killedCmd.born = performance.now(); kick(); }, 2200);
    }
  }

  function kill(k, now) {
    k.dying = now || performance.now();
    if (k.tile.token === k) k.tile.token = null;
  }
  function floatText(t, text, color, now) { fx.push({ type: 'float', x: t.x, y: t.y - R * 0.5, text, color, t0: now, dur: 1200 }); }

  // ─── drawing ────────────────────────────────────────────
  function rebuildPaths() {
    paths = { front: new Path2D() };
    for (const side of [YOU, FOE]) {
      const fill = new Path2D(), edge = new Path2D();
      for (const t of tiles) {
        if (t.owner !== side) continue;
        hexPath(fill, t.x, t.y, R);
        for (let k = 0; k < 6; k++) {
          const n = t.n[k];
          if (n && n.owner === side) continue;
          const k2 = (k + 1) % 6;
          edge.moveTo(t.x + R * VX[k], t.y + R * VY[k]);
          edge.lineTo(t.x + R * VX[k2], t.y + R * VY[k2]);
        }
      }
      paths[side] = { fill, edge };
    }
    for (const t of tiles) if (claimable(t)) hexPath(paths.front, t.x, t.y, R - 5);
    dirty = false;
  }

  function drawBorder(side, now) {
    const p = paths[side], S = SIDE[side];
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,.65)'; ctx.lineWidth = 4; ctx.stroke(p.edge);
    ctx.save(); ctx.clip(p.fill);
    ctx.strokeStyle = `rgba(${S.rgb},.1)`; ctx.lineWidth = R * 0.95; ctx.stroke(p.edge);
    ctx.strokeStyle = `rgba(${S.rgb},.16)`; ctx.lineWidth = R * 0.4; ctx.stroke(p.edge);
    ctx.strokeStyle = `rgba(${S.deep},.95)`; ctx.lineWidth = 10; ctx.stroke(p.edge);
    ctx.globalAlpha = RM ? 1 : 0.86 + 0.14 * Math.sin(now / 650 + side * 2);
    ctx.strokeStyle = S.line; ctx.lineWidth = 5.5; ctx.stroke(p.edge);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawToken(k, now) {
    const t = k.tile;
    let a = 1, sc = 1, dy = 0;
    const age = now - k.born;
    if (!RM && age < 420) { const e = ease(age / 420); a = e; dy = -(1 - e) * R * 0.6; sc = 1 + (1 - e) * 0.25; }
    if (k.dying) { const e = clamp((now - k.dying) / 420, 0, 1); a = 1 - e; sc = 1 - e * 0.4; }
    const s = (k.kind === 'cmd' ? R * 0.66 : R * 0.52) * sc;
    const x = t.x, y = t.y + dy;
    const S = SIDE[k.side];
    let shake = 0;
    if (k.hit && !RM && now - k.hit < 380) shake = Math.sin((now - k.hit) / 22) * 3 * (1 - (now - k.hit) / 380);
    ctx.save(); ctx.globalAlpha = a; ctx.translate(shake, 0);
    if (k.kind === 'cmd') { // pulsing aura under commanders
      const pr = s * (1.75 + (RM ? 0 : 0.12 * Math.sin(now / 520 + k.side)));
      const g0 = ctx.createRadialGradient(x, y, s * 0.6, x, y, pr);
      g0.addColorStop(0, `rgba(${S.rgb},.38)`); g0.addColorStop(1, `rgba(${S.rgb},0)`);
      ctx.fillStyle = g0; ctx.beginPath(); ctx.arc(x, y, pr, 0, Math.PI * 2); ctx.fill();
    }
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.beginPath(); ctx.ellipse(t.x, t.y + s * 0.92, s * 0.85, s * 0.26, 0, 0, Math.PI * 2); ctx.fill();
    // portrait
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#10151f'; ctx.fillRect(x - s, y - s, s * 2, s * 2);
    if (k.img.complete && k.img.naturalWidth) {
      const f = k.img.naturalWidth / 400, c = k.crop;
      ctx.drawImage(k.img, c[0] * f, c[1] * f, c[2] * f, c[3] * f, x - s, y - s, s * 2, s * 2);
    }
    const g = ctx.createRadialGradient(x, y - s * 0.3, s * 0.2, x, y, s);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.35)');
    ctx.fillStyle = g; ctx.fillRect(x - s, y - s, s * 2, s * 2);
    ctx.restore();
    // rings
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.75)';
    ctx.beginPath(); ctx.arc(x, y, s + 3, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = k.kind === 'cmd' ? 4 : 3; ctx.strokeStyle = S.line;
    ctx.beginPath(); ctx.arc(x, y, s + 0.5, 0, Math.PI * 2); ctx.stroke();
    if (k.kind === 'cmd') { // gold crown pip marks commanders
      ctx.fillStyle = '#f2c46b';
      ctx.beginPath(); ctx.moveTo(x, y - s - 9); ctx.lineTo(x + 6, y - s - 2); ctx.lineTo(x, y - s + 4); ctx.lineTo(x - 6, y - s - 2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 1.2; ctx.stroke();
    }
    // stat badges
    const br = Math.max(8, R * (k.kind === 'cmd' ? 0.22 : 0.19));
    const font = `700 ${Math.round(br * 1.1)}px "Barlow Semi Condensed", Barlow, sans-serif`;
    if (k.kind === 'minion') badge(x - s * 0.72, y + s * 0.74, br, '#2f6bd0', k.p, font);
    badge(x + s * 0.72, y + s * 0.74, br, '#c2303a', Math.max(0, k.h), font);
    ctx.restore();
  }
  function badge(x, y, r, col, val, font) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = col; ctx.fill();
    ctx.lineWidth = 1.6; ctx.strokeStyle = '#f2d593'; ctx.stroke();
    ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff'; ctx.fillText(String(val), x, y + 0.5);
  }

  function drawFx(now) {
    fx = fx.filter((f) => now - f.t0 < f.dur + 400);
    for (const f of fx) {
      const k = clamp((now - f.t0) / f.dur, 0, 1);
      if (k <= 0 || k >= 1) { if (f.type !== 'wave') continue; }
      if (f.type === 'ring') {
        const rr = f.small ? R * (0.5 + 0.55 * ease(k)) : R * (0.45 + 1.4 * ease(k));
        ctx.strokeStyle = `rgba(${f.rgb},${(1 - k) * f.a})`; ctx.lineWidth = f.small ? 1.5 : 2.5;
        ctx.beginPath(); hexPath(ctx, f.x, f.y, rr); ctx.stroke();
      } else if (f.type === 'wave') {
        for (const [t, d] of f.list) {
          const lk = (now - f.t0 - d * 90) / 480;
          if (lk <= 0 || lk >= 1) continue;
          ctx.strokeStyle = `rgba(247,220,154,${(1 - lk) * (1 - d / 4) * 0.6})`; ctx.lineWidth = 1.5;
          ctx.beginPath(); hexPath(ctx, t.x, t.y, R - 4); ctx.stroke();
        }
      } else if (f.type === 'sparks') {
        const e = ease(k);
        ctx.fillStyle = `rgba(${f.col},${1 - k})`;
        for (const p of f.parts) {
          ctx.beginPath(); ctx.arc(f.x + p[0] * e * R * 1.5, f.y + p[1] * e * R * 1.5 - e * 6, p[2] * (1 - k * 0.6), 0, 7); ctx.fill();
        }
      } else if (f.type === 'boom') {
        for (const t of f.list) {
          ctx.fillStyle = `rgba(255,${150 + 60 * (1 - k)},60,${0.55 * (1 - k) * (t === f.t ? 1 : 0.7)})`;
          ctx.beginPath(); hexPath(ctx, t.x, t.y, R - 1.5); ctx.fill();
        }
        ctx.strokeStyle = `rgba(255,214,120,${1 - k})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(f.t.x, f.t.y, R * (0.3 + 2.1 * ease(k)), 0, 7); ctx.stroke();
        const g = ctx.createRadialGradient(f.t.x, f.t.y, 0, f.t.x, f.t.y, R * 1.8);
        g.addColorStop(0, `rgba(255,240,200,${0.8 * (1 - k) * (1 - k)})`); g.addColorStop(1, 'rgba(255,140,40,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.t.x, f.t.y, R * 1.8, 0, 7); ctx.fill();
      } else if (f.type === 'float') {
        const y = f.y - 30 * ease(k);
        ctx.globalAlpha = 1 - k * k;
        ctx.font = `700 ${Math.round(R * 0.45 + 6)}px "Barlow Semi Condensed", Barlow, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(f.text, f.x, y);
        ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, y);
        ctx.globalAlpha = 1;
      }
    }
  }

  function draw(now) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.drawImage(staticCv, 0, 0, W, H);
    if (dirty || !paths) rebuildPaths();
    // territory tint
    for (const side of [YOU, FOE]) { ctx.fillStyle = `rgba(${SIDE[side].rgb},.13)`; ctx.fill(paths[side].fill); }
    // fresh claims flash
    if (!RM) {
      for (const t of tiles) {
        if (!t.at || !t.owner) continue;
        const k = (now - t.at) / 900;
        if (k >= 1) { t.at = 0; continue; }
        ctx.beginPath(); hexPath(ctx, t.x, t.y, R - 1);
        ctx.fillStyle = `rgba(${SIDE[t.owner].rgb},${0.42 * (1 - k)})`; ctx.fill();
        ctx.fillStyle = `rgba(255,240,200,${0.3 * (1 - k) * (1 - k)})`; ctx.fill();
      }
    }
    drawBorder(FOE, now); drawBorder(YOU, now);

    // while the pointer is on the board, mark the tiles you could claim next
    if (hover && !dragTarget) {
      ctx.setLineDash([5, 6]); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(247,220,154,.42)';
      ctx.stroke(paths.front); ctx.setLineDash([]);
      ctx.beginPath(); hexPath(ctx, hover.x, hover.y, R - 3);
      const ok = claimable(hover), own = hover.owner === YOU;
      ctx.fillStyle = ok ? 'rgba(247,220,154,.16)' : own ? 'rgba(74,226,127,.08)' : 'rgba(200,205,215,.05)'; ctx.fill();
      ctx.strokeStyle = ok ? 'rgba(247,220,154,.95)' : own ? 'rgba(141,255,176,.5)' : 'rgba(200,205,215,.4)';
      ctx.lineWidth = 2; if (!ok && !own) ctx.setLineDash([4, 5]);
      ctx.stroke(); ctx.setLineDash([]);
    }
    // drag target
    if (dragTarget) {
      const t = dragTarget.tile, ok = dragTarget.ok, spell = dragTarget.spell;
      const list = spell ? [t, ...t.n.filter(Boolean)] : [t];
      for (const o of list) {
        ctx.beginPath(); hexPath(ctx, o.x, o.y, R - 2.5);
        ctx.fillStyle = spell ? 'rgba(255,170,60,.2)' : ok ? 'rgba(74,226,127,.25)' : 'rgba(240,82,79,.18)'; ctx.fill();
        ctx.strokeStyle = spell ? 'rgba(255,200,110,.95)' : ok ? '#8dffb0' : '#ff7a77'; ctx.lineWidth = 2.5;
        if (!ok) ctx.setLineDash([6, 5]);
        ctx.stroke(); ctx.setLineDash([]);
      }
    }
    drawFx(now);
    tokens = tokens.filter((k) => !k.dying || now - k.dying < 450);
    for (const k of tokens) drawToken(k, now);
    // first paint: the board is uncovered from the centre outwards
    if (introAt) {
      const k = (now - introAt) / 1700;
      if (k >= 1) introAt = 0;
      else {
        const max = Math.hypot(W, H) * 0.62, r = ease(clamp(k, 0, 1)) * (max + 220);
        const g = ctx.createRadialGradient(W / 2, H * 0.45, Math.max(0, r - 220), W / 2, H * 0.45, r + 1);
        g.addColorStop(0, 'rgba(7,10,16,0)'); g.addColorStop(1, 'rgba(7,10,16,1)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
    }
  }

  // ─── loop / AI ──────────────────────────────────────────
  function frame(now) {
    rafId = 0;
    if (!built) return;
    const animate = !RM && visible && !document.hidden;
    if (animate && now - lastAI > aiGap) {
      lastAI = now; aiGap = 560 + Math.random() * 620;
      aiTurn = aiTurn === YOU ? FOE : YOU;
      // once the visitor is playing, the green side is theirs; the enemy keeps pushing
      if (aiTurn === FOE || now - lastVisitorAt > 9000) aiAct(aiTurn, true);
    }
    if (now - lastDraw > 22 || dragTarget || !animate) { draw(now); lastDraw = now; }
    if (animate) rafId = requestAnimationFrame(frame);
  }
  function kick() { if (!rafId) rafId = requestAnimationFrame(frame); }

  // ─── HUD + toast ────────────────────────────────────────
  const hudYou = hero.querySelector('[data-hud="you"]');
  const hudFoe = hero.querySelector('[data-hud="foe"]');
  const hudMana = hero.querySelector('[data-hud="mana"]');
  function updateHUD() {
    if (hudYou) hudYou.textContent = count[YOU];
    if (hudFoe) hudFoe.textContent = count[FOE];
    if (hudMana) hudMana.textContent = count[YOU] + villages[YOU];
  }
  let toastTimer = 0;
  function toast(html, ms) {
    if (!toastEl) return;
    toastEl.innerHTML = html;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms || 3600);
  }

  // ─── the hand ───────────────────────────────────────────
  let drawIdx = 0;
  let slots = [];
  function cardLabel(slug) {
    const c = CARDS[slug];
    return `${c.name} (${c.type}) — play it onto the board`;
  }
  function makeCard(slug, i) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'hcard'; b.dataset.slug = slug; b.dataset.i = i;
    b.setAttribute('aria-label', cardLabel(slug));
    b.innerHTML = `<span class="hcard-in"><img src="${ASSETS}media/cards/${slug}.webp" alt="" width="400" height="560" draggable="false" decoding="async"><span class="hcard-glare"></span></span>`;
    wireCard(b);
    return b;
  }
  function layoutHand() {
    const cw = parseFloat(getComputedStyle(hero).getPropertyValue('--cw')) || 150;
    const spread = window.innerWidth >= 1180 ? 0.74 : 0.66;
    const n = slots.length;
    slots.forEach((b, i) => {
      const off = i - (n - 1) / 2;
      b.style.setProperty('--x', `${off * cw * spread}px`);
      b.style.setProperty('--y', `${Math.pow(Math.abs(off), 1.7) * cw * 0.075}px`);
      b.style.setProperty('--rot', `${off * 6}deg`);
      b.style.setProperty('--z', String(5 - Math.abs(Math.round(off))));
    });
  }
  function buildHand() {
    if (!handEl) return;
    handEl.innerHTML = '';
    slots = START_HAND.map((s, i) => makeCard(s, i));
    slots.forEach((b) => handEl.appendChild(b));
    layoutHand();
    if (!RM) {
      slots.forEach((b, i) => {
        b.classList.add('is-drawn');
        setTimeout(() => b.classList.remove('is-drawn'), 650 + i * 110);
      });
      setTimeout(measureCovered, 1900);
    }
  }
  function nextCard() {
    const inHand = new Set(slots.map((b) => b.dataset.slug));
    for (let i = 0; i < DRAW_PILE.length; i++) {
      const s = DRAW_PILE[(drawIdx + i) % DRAW_PILE.length];
      if (!inHand.has(s)) { drawIdx = (drawIdx + i + 1) % DRAW_PILE.length; return s; }
    }
    return DRAW_PILE[drawIdx++ % DRAW_PILE.length];
  }
  function replaceCard(b) {
    const slug = nextCard();
    const im = b.querySelector('img');
    const swap = () => {
      im.src = `${ASSETS}media/cards/${slug}.webp`;
      b.dataset.slug = slug; b.setAttribute('aria-label', cardLabel(slug));
    };
    b.classList.remove('is-hover');
    if (RM) { swap(); b.classList.remove('is-ghosted'); return; }
    b.classList.add('is-drawn'); b.classList.remove('is-ghosted');
    swap();
    const show = () => requestAnimationFrame(() => requestAnimationFrame(() => b.classList.remove('is-drawn')));
    if (im.decode) im.decode().then(show, show); else setTimeout(show, 120);
  }

  // Touch: the first tap lifts a card so it can be read, the second tap plays it.
  function clearPreview(except) {
    slots.forEach((s) => { if (s !== except) s.classList.remove('is-hover'); });
    hero.classList.toggle('is-previewing', !!except);
  }
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest || !e.target.closest('.hcard')) clearPreview(); }, { passive: true });

  let drag = null, suppressClick = false, lastPtr = 'mouse';
  function wireCard(b) {
    b.addEventListener('pointermove', (e) => {
      if (drag || !mqFine.matches || RM || e.pointerType === 'touch') return;
      const r = b.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      b.style.setProperty('--ry', `${(px - 0.5) * 22}deg`);
      b.style.setProperty('--rx', `${(0.5 - py) * 16}deg`);
      b.style.setProperty('--gx', `${px * 100}%`);
      b.style.setProperty('--gy', `${py * 100}%`);
    });
    b.addEventListener('pointerleave', () => {
      b.style.setProperty('--ry', '0deg'); b.style.setProperty('--rx', '0deg');
    });
    b.addEventListener('pointerdown', (e) => {
      lastPtr = e.pointerType;
      if (e.pointerType === 'touch' || e.button !== 0) return;
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      drag = { b, slug: b.dataset.slug, sx: e.clientX, sy: e.clientY, live: false, id: e.pointerId };
    });
    b.addEventListener('pointermove', (e) => {
      if (!drag || drag.b !== b) return;
      if (!drag.live && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 7) startDrag(e);
      if (drag.live) moveDrag(e);
    });
    b.addEventListener('pointerup', (e) => {
      if (!drag || drag.b !== b) return;
      if (drag.live) { suppressClick = true; endDrag(e); }
      drag = null;
    });
    b.addEventListener('pointercancel', () => { if (drag && drag.live) cancelDrag(); drag = null; });
    b.addEventListener('click', (e) => {
      if (suppressClick) { suppressClick = false; return; }
      interacted = true;
      if (e.detail !== 0 && lastPtr !== 'mouse' && lastPtr !== 'pen' && !b.classList.contains('is-hover')) {
        b.classList.add('is-hover'); clearPreview(b);
        const c = CARDS[b.dataset.slug];
        toast(`<b>${c.name}</b>${c.type === 'spell' ? ' (spell)' : ''} — tap it again to play it.`, 2600);
        return;
      }
      autoPlay(b);
    });
  }

  function startDrag(e) {
    const b = drag.b;
    const r = b.querySelector('img').getBoundingClientRect();
    const g = document.createElement('img');
    g.src = b.querySelector('img').src; g.alt = ''; g.className = 'hcard-ghost';
    const w = Math.min(r.width, 116); g.style.width = w + 'px';
    document.body.appendChild(g);
    drag.g = g; drag.w = w; drag.h = w * 1.4; drag.live = true;
    b.classList.add('is-ghosted');
    b.style.setProperty('--ry', '0deg'); b.style.setProperty('--rx', '0deg');
  }
  function moveDrag(e) {
    const { g, w, h, slug } = drag;
    g.style.transform = `translate(${e.clientX - w / 2}px, ${e.clientY - h - 14}px) rotate(-4deg)`;
    const t = tileAtClient(e.clientX, e.clientY);
    const res = canPlay(slug, t);
    dragTarget = t ? { tile: t, ok: res.ok, spell: CARDS[slug].type === 'spell' } : null;
    g.classList.toggle('is-valid', !!t && res.ok);
    g.classList.toggle('is-invalid', !!t && !res.ok);
    kick();
  }
  function endDrag(e) {
    const { g, b, slug } = drag;
    const t = dragTarget && dragTarget.tile;
    const res = canPlay(slug, t);
    dragTarget = null;
    if (t && res.ok) {
      const cr = canvas.getBoundingClientRect();
      flyGhost(g, e.clientX - drag.w / 2, e.clientY - drag.h - 14, cr.left + t.x - drag.w / 2, cr.top + t.y - drag.h / 2, 0.22, 240, () => {
        play(slug, t, res.via); replaceCard(b);
      });
    } else {
      if (t && res.why) toast(res.why);
      const r = b.getBoundingClientRect();
      flyGhost(g, e.clientX - drag.w / 2, e.clientY - drag.h - 14, r.left, r.top, 1, 300, () => b.classList.remove('is-ghosted'));
    }
    kick();
  }
  function cancelDrag() {
    if (drag.g) drag.g.remove();
    drag.b.classList.remove('is-ghosted');
    dragTarget = null; kick();
  }
  function flyGhost(g, x0, y0, x1, y1, scale, ms, done) {
    if (RM || !g.animate) { g.remove(); done(); return; }
    const a = g.animate([
      { transform: `translate(${x0}px, ${y0}px) rotate(-4deg) scale(1)`, opacity: 1 },
      { transform: `translate(${x1}px, ${y1}px) rotate(0deg) scale(${scale})`, opacity: scale < 1 ? 0.15 : 1 },
    ], { duration: ms, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'forwards' });
    a.onfinish = () => { g.remove(); done(); };
  }

  // Click / tap / keyboard: the card picks a sensible target and flies there.
  function autoPlay(b) {
    if (!built) return;
    const slug = b.dataset.slug, c = CARDS[slug];
    let target = null;
    if (c.type === 'spell') {
      const foeCmd = caps[FOE];
      target = !isCovered(foeCmd) ? foeCmd : null;
      if (!target) {
        const opts = tiles.filter((t) => t.owner === FOE && !isCovered(t));
        target = opts[Math.floor(Math.random() * opts.length)] || foeCmd;
      }
    } else {
      const free = tiles.filter((t) => t.owner === YOU && !t.token && canPlay(slug, t).ok);
      const open = free.filter((t) => !isCovered(t));
      const pool = open.length ? open : free;
      const front = pool.filter((t) => t.n.some((n) => n && n.owner !== YOU));
      const list = front.length ? front : pool;
      target = list[Math.floor(Math.random() * list.length)];
      if (!target) {
        toast(c.legendary && tokens.some((k) => k.slug === slug && !k.dying)
          ? `<b>Legendary</b>: only one ${c.name} on the board at a time.`
          : 'Every tile in your territory is occupied — claim more tiles first.');
        return;
      }
    }
    const img = b.querySelector('img');
    const r = img.getBoundingClientRect();
    const cr = canvas.getBoundingClientRect();
    const g = document.createElement('img');
    g.src = img.src; g.alt = ''; g.className = 'hcard-ghost';
    const w = Math.min(r.width, 140); g.style.width = w + 'px';
    document.body.appendChild(g);
    b.classList.add('is-ghosted'); clearPreview();
    const res = canPlay(slug, target);
    flyGhost(g, r.left, r.top, cr.left + target.x - w / 2, cr.top + target.y - w * 0.7, 0.22, 520, () => {
      play(slug, target, res.via); replaceCard(b);
    });
  }

  // ─── lifecycle ──────────────────────────────────────────
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) kick(); }, { threshold: 0.02 }).observe(hero);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
  let lastW = 0, lastH = 0, rT = 0;
  function onResize() {
    clearTimeout(rT);
    rT = setTimeout(() => {
      const w = hero.clientWidth, h = hero.clientHeight;
      layoutHand();
      if (Math.abs(w - lastW) > 2 || Math.abs(h - lastH) > 60) { lastW = w; lastH = h; build(); }
      else measureCovered();
    }, 160);
  }
  window.addEventListener('resize', onResize);
  const onRM = () => { RM = mqReduce.matches; build(); };
  if (mqReduce.addEventListener) mqReduce.addEventListener('change', onRM);

  buildHand();
  lastW = hero.clientWidth; lastH = hero.clientHeight;
  build();
  // fonts can shift the hero copy; re-measure what the UI covers once they land
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measureCovered(); kick(); });
  // welcome nudge once the board has had a moment to come alive (skipped if the visitor already started)
  if (!RM) setTimeout(() => {
    if (interacted || !visible || window.scrollY > 200) return;
    toast(mqFine.matches ? 'Click a tile on the edge of your <span class="t-you">green territory</span> to claim it — or drag a card onto it.'
      : 'Tap a tile next to your <span class="t-you">green territory</span> to claim it.', 5200);
  }, 2600);
})();
