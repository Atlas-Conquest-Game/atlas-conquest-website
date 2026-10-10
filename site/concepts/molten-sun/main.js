/* Atlas Conquest — "Molten Sun" homepage concept
   Vanilla JS, no dependencies. */

/* ─── Links: change these in one place ─────────────────────────────── */
const CONFIG = {
  primaryCta: 'discord',                       // 'discord' = Join the Beta leads everywhere; flip to 'steam' (with the URL below) when the store page is live
  steam: '',                                   // '' = store page not live yet → "coming soon" state
  discord: 'https://discord.gg/7QaEY4yJH5',
  youtubeTrailerId: 'hPoGfdLZThA',                        // '' = play the local trailer.mp4; set an id to use a youtube-nocookie embed
  x: 'https://x.com/Atlas_Conquest',
  instagram: 'https://www.instagram.com/atlasconquest/',
  tiktok: 'https://www.tiktok.com/@atlas.conquest',
  press: '../../press.html',
};

(() => {
  'use strict';

  const ROOT = '../../';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  let REDUCED = reduceMQ.matches;
  const SAVE_DATA = !!(navigator.connection && navigator.connection.saveData);

  const NUMBER_WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty'];

  const slugify = (name) => (name || '').toLowerCase().replace(/[,.'’]/g, '').replace(/\s+/g, '-');
  const setStat = (key, text) => $$(`[data-stat="${key}"]`).forEach((n) => { n.textContent = text; });
  const setStatPlus = (key, text) => $$(`[data-stat="${key}"]`).forEach((n) => {
    n.textContent = text;
    const plus = document.createElement('span');
    plus.className = 'plus';
    plus.textContent = '+';
    n.append(plus);
  });
  const escapeHTML = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function loadJSON(path) {
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return res.json();
  }

  /* ════════════════════════════════════════════════════════════════════
     Links + Steam "coming soon" state
     ════════════════════════════════════════════════════════════════════ */
  // Nav call to action follows primaryCta: when Steam leads, the nav button becomes the store link.
  function flipNavToSteam() {
    document.querySelectorAll('.nav-cta, .nav-cta-mobile').forEach((a) => {
      a.href = CONFIG.steam; a.target = '_blank'; a.rel = 'noopener';
      a.removeAttribute('data-link');
      const use = a.querySelector('use');
      if (use) use.setAttribute('href', '#i-steam');
      const walker = document.createTreeWalker(a, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (/Join the Beta/i.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(/Join the Beta/i, 'Wishlist on Steam');
      }
    });
  }

  function applyLinks() {
    $$('[data-link]').forEach((a) => {
      const url = CONFIG[a.dataset.link];
      if (url) a.href = url;
    });

    const steamLive = !!CONFIG.steam;
    const steamPrimary = steamLive && CONFIG.primaryCta === 'steam';
    document.documentElement.classList.toggle('has-steam', steamLive);
    // Discord leads (and sits first) unless primaryCta is 'steam' with a live store URL.
    document.documentElement.classList.toggle('primary-steam', steamPrimary);

    if (steamLive) {
      // Store page is live: every Steam button becomes a real outbound link. Only when Steam is the
      // primary call to action does it take the molten finish while the beta steps back to ember.
      $$('[data-steam]').forEach((a) => {
        a.href = CONFIG.steam;
        a.target = '_blank';
        a.rel = 'noopener';
        a.classList.remove('is-soon');
        if (steamPrimary && a.classList.contains('btn-forged')) a.classList.replace('btn-forged', 'btn-molten');
        const main = a.querySelector('.btn-main');
        if (main) main.textContent = 'Wishlist on Steam';
        const sub = a.querySelector('[data-steam-sub]');
        if (sub) sub.remove();
      });
      if (steamPrimary) {
        $$('.btn-beta').forEach((b) => b.classList.replace('btn-molten', 'btn-ember'));
        flipNavToSteam();
      }
      $$('.soon-pop').forEach((p) => p.remove());
      return;
    }

    // Not live yet. Hero: an anchored popover right under the button (no page jump).
    // Join band: the explanatory note already sits beside the button, so just light it up.
    const note = $('#steam-note');
    $$('[data-steam]').forEach((a) => {
      if (a.hasAttribute('data-steam-pop')) { initSoonPopover(a); return; }
      a.setAttribute('aria-describedby', 'steam-note');
      a.addEventListener('click', (e) => {
        e.preventDefault();
        if (!note) return;
        const r = note.getBoundingClientRect();
        const visible = r.top > 0 && r.bottom < window.innerHeight;
        if (!visible) note.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'center' });
        note.classList.remove('is-flash');
        void note.offsetWidth;
        note.classList.add('is-flash');
        clearTimeout(note._t);
        note._t = setTimeout(() => note.classList.remove('is-flash'), 2800);
      });
    });
  }

  function initSoonPopover(btn) {
    const pop = $('#soon-pop');
    const status = $('#soon-status');
    if (!pop) return;
    const close = $('.soon-pop-close', pop);
    btn.setAttribute('role', 'button');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'soon-pop');

    const isOpen = () => !pop.hidden;
    const setOpen = (open, { restoreFocus = false } = {}) => {
      pop.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      if (status) status.textContent = open ? 'The Steam store page isn’t live yet. We’ll announce it in our Discord the moment you can wishlist.' : '';
      if (open) {
        document.addEventListener('pointerdown', onOutside, true);
        document.addEventListener('keydown', onKey);
      } else {
        document.removeEventListener('pointerdown', onOutside, true);
        document.removeEventListener('keydown', onKey);
        if (restoreFocus) btn.focus();
      }
    };
    const onOutside = (e) => {
      if (!pop.contains(e.target) && !btn.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false, { restoreFocus: pop.contains(document.activeElement) || document.activeElement === btn }); }
    };

    btn.addEventListener('click', (e) => { e.preventDefault(); setOpen(!isOpen()); });
    btn.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); setOpen(!isOpen()); }
    });
    close.addEventListener('click', () => setOpen(false, { restoreFocus: true }));
    // leaving the popover by keyboard closes it
    pop.addEventListener('focusout', (e) => {
      if (e.relatedTarget && !pop.contains(e.relatedTarget) && e.relatedTarget !== btn) setOpen(false);
    });
  }

  /* ════════════════════════════════════════════════════════════════════
     Navigation
     ════════════════════════════════════════════════════════════════════ */
  function initNav() {
    const nav = $('#site-nav');
    const burger = $('.nav-burger');
    const menu = $('#nav-menu');
    if (!nav || !burger) return;

    const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    const setMenu = (open) => {
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      nav.classList.toggle('is-open', open);
    };
    burger.addEventListener('click', () => setMenu(burger.getAttribute('aria-expanded') !== 'true'));
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) { setMenu(false); burger.focus(); }
    });
    window.matchMedia('(min-width: 961px)').addEventListener('change', (e) => { if (e.matches) setMenu(false); });
  }

  /* ════════════════════════════════════════════════════════════════════
     HERO — molten sun, lattice pulse, embers
     ════════════════════════════════════════════════════════════════════ */
  const hero = $('#hero');
  const sun = hero && $('.sun', hero);
  const lattice = hero && $('#hex-lattice');
  const skyCanvas = hero && $('.sky-fx', hero);
  const emberCanvas = hero && $('.ember-fx', hero);
  const churnCanvas = hero && $('.sun-churn', hero);

  const geo = { w: 0, h: 0, sx: 0, sy: 0, r: 0, hex: 100, segs: [], groundY: 0 };
  let heroVisible = true;
  let rafId = 0;
  let lastT = 0;
  let embers = [];
  let emberSprites = [];
  let churnCtx = null;
  let churnImg = null;
  let churnPre = null;
  const DPR = Math.min(window.devicePixelRatio || 1, 1.5);

  function measureHero() {
    if (!hero || !sun) return;
    geo.w = hero.clientWidth;
    geo.h = hero.clientHeight;
    const E = sun.offsetWidth;
    geo.sx = sun.offsetLeft + E * 0.4993;
    geo.sy = sun.offsetTop + E * 0.5339;
    geo.r = E * 0.4635;
    geo.hex = geo.w < 700 ? 74 : geo.w < 1100 ? 90 : 104;
    const ground = $('.ground', hero);
    geo.groundY = ground ? ground.offsetTop + Math.min(40, ground.offsetHeight * 0.35) : geo.h * 0.85;

    hero.style.setProperty('--sx', `${geo.sx.toFixed(1)}px`);
    hero.style.setProperty('--sy', `${geo.sy.toFixed(1)}px`);
    if (lattice) {
      lattice.setAttribute('patternTransform', `translate(${geo.sx.toFixed(1)} ${geo.sy.toFixed(1)}) scale(${(geo.hex / 96).toFixed(4)})`);
    }
    buildSegments();
    sizeCanvas(skyCanvas);
    sizeCanvas(emberCanvas);
  }

  function sizeCanvas(c) {
    if (!c) return;
    c.width = Math.round(geo.w * DPR);
    c.height = Math.round(geo.h * DPR);
  }

  // Hex lattice edges, anchored so a hex centre sits on the sun centre (matches the SVG pattern).
  function buildSegments() {
    const w = geo.hex;
    const s = w / Math.sqrt(3);
    const rowH = 1.5 * s;
    const segs = [];
    const j0 = Math.floor(-geo.sy / rowH) - 1;
    const j1 = Math.ceil((geo.h - geo.sy) / rowH) + 1;
    for (let j = j0; j <= j1; j++) {
      const cy = geo.sy + j * rowH;
      const off = (j & 1) ? w / 2 : 0;
      const i0 = Math.floor((-geo.sx - off) / w) - 1;
      const i1 = Math.ceil((geo.w - geo.sx - off) / w) + 1;
      for (let i = i0; i <= i1; i++) {
        const cx = geo.sx + off + i * w;
        const v = [
          [cx, cy - s], [cx + w / 2, cy - s / 2], [cx + w / 2, cy + s / 2], [cx, cy + s],
        ];
        for (let k = 0; k < 3; k++) {
          const [x1, y1] = v[k];
          const [x2, y2] = v[k + 1];
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          segs.push({ x1, y1, x2, y2, d: Math.hypot(mx - geo.sx, my - geo.sy) });
        }
      }
    }
    geo.segs = segs;
    geo.rMax = Math.max(
      Math.hypot(geo.sx, geo.sy), Math.hypot(geo.w - geo.sx, geo.sy),
      Math.hypot(geo.sx, geo.h - geo.sy), Math.hypot(geo.w - geo.sx, geo.h - geo.sy),
    );
  }

  // ── lattice pulse: rings of light travelling outward along the hex edges
  function drawPulse(t) {
    const ctx = skyCanvas.getContext('2d');
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, geo.w, geo.h);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const PERIOD = 7.5;
    const band = Math.max(90, geo.hex * 1.2);
    for (let p = 0; p < 2; p++) {
      const prog = ((t / PERIOD) + p * 0.5) % 1;
      const r = geo.r * 0.9 + prog * (geo.rMax - geo.r * 0.9 + band);
      const fade = Math.pow(1 - prog, 1.4);
      if (fade < 0.02) continue;
      // bucket by alpha to keep stroke() calls low
      const buckets = [[], [], [], [], []];
      for (const sg of geo.segs) {
        const dd = Math.abs(sg.d - r);
        if (dd > band || sg.d < geo.r * 0.95) continue;
        const a = (1 - dd / band);
        buckets[Math.min(4, Math.floor(a * a * 5))].push(sg);
      }
      buckets.forEach((list, bi) => {
        if (!list.length) return;
        const alpha = ((bi + 1) / 5) * 0.72 * fade;
        ctx.strokeStyle = `rgba(255, 196, 110, ${alpha.toFixed(3)})`;
        ctx.lineWidth = 1.2 + bi * 0.25;
        ctx.beginPath();
        for (const sg of list) { ctx.moveTo(sg.x1, sg.y1); ctx.lineTo(sg.x2, sg.y2); }
        ctx.stroke();
      });
    }
  }

  // ── embers
  function makeSprite(core, mid) {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, core);
    grd.addColorStop(0.22, mid);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 32, 32);
    return c;
  }

  function spawnEmber(initial) {
    const nearSun = Math.random() < 0.55;
    let x;
    let y;
    if (nearSun) {
      const a = Math.random() * Math.PI * 2;
      const rr = geo.r * (0.75 + Math.random() * 0.5);
      x = geo.sx + Math.cos(a) * rr;
      y = geo.sy + Math.abs(Math.sin(a)) * rr * 0.6;
    } else {
      x = Math.random() * geo.w;
      y = geo.groundY + Math.random() * 30;
    }
    const life = 4 + Math.random() * 6;
    return {
      x, y,
      vx: (Math.random() - 0.35) * 14,
      vy: -(16 + Math.random() * 44),
      life,
      age: initial ? Math.random() * life : 0,
      size: 0.7 + Math.random() * 1.9,
      sprite: emberSprites[(Math.random() * emberSprites.length) | 0],
      phase: Math.random() * Math.PI * 2,
      flick: 2 + Math.random() * 5,
    };
  }

  function initEmbers() {
    emberSprites = [
      makeSprite('rgba(255,250,220,1)', 'rgba(255,210,58,.9)'),
      makeSprite('rgba(255,236,190,1)', 'rgba(255,154,31,.85)'),
      makeSprite('rgba(255,210,160,1)', 'rgba(240,90,26,.8)'),
    ];
    const n = geo.w < 700 ? 30 : geo.w < 1100 ? 48 : 72;
    embers = Array.from({ length: n }, () => spawnEmber(true));
  }

  function drawEmbers(t, dt) {
    const ctx = emberCanvas.getContext('2d');
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, geo.w, geo.h);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < embers.length; i++) {
      const e = embers[i];
      e.age += dt;
      if (e.age > e.life || e.y < -20) { embers[i] = spawnEmber(false); continue; }
      e.x += (e.vx + Math.sin(t * 0.9 + e.phase) * 10) * dt;
      e.y += e.vy * dt;
      const k = e.age / e.life;
      const env = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
      const flicker = 0.65 + 0.35 * Math.sin(t * e.flick + e.phase);
      ctx.globalAlpha = Math.max(0, env * flicker);
      const s = e.size * 9;
      ctx.drawImage(e.sprite, e.x - s / 2, e.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }

  // ── churning sun surface: low-res animated value noise, upscaled + soft-light blended
  const CH = 104;
  const perm = new Uint8Array(512);
  (function seedPerm() {
    const p = Array.from({ length: 256 }, (_, i) => i);
    let s = 1337;
    for (let i = 255; i > 0; i--) {
      s = (s * 16807) % 2147483647;
      const j = s % (i + 1);
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  })();
  const fade = (t) => t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;
  function vnoise(x, y, z) {
    const xi = Math.floor(x); const yi = Math.floor(y); const zi = Math.floor(z);
    const xf = x - xi; const yf = y - yi; const zf = z - zi;
    const X = xi & 255; const Y = yi & 255; const Z = zi & 255;
    const u = fade(xf); const v = fade(yf); const w = fade(zf);
    const h = (a, b, c) => perm[perm[perm[a] + b] + c] / 255;
    const X1 = (X + 1) & 255; const Y1 = (Y + 1) & 255; const Z1 = (Z + 1) & 255;
    return lerp(
      lerp(lerp(h(X, Y, Z), h(X1, Y, Z), u), lerp(h(X, Y1, Z), h(X1, Y1, Z), u), v),
      lerp(lerp(h(X, Y, Z1), h(X1, Y, Z1), u), lerp(h(X, Y1, Z1), h(X1, Y1, Z1), u), v),
      w,
    );
  }

  function initChurn() {
    if (!churnCanvas) return;
    churnCanvas.width = CH;
    churnCanvas.height = CH;
    churnCtx = churnCanvas.getContext('2d');
    churnImg = churnCtx.createImageData(CH, CH);
    churnPre = [];
    for (let py = 0; py < CH; py++) {
      for (let px = 0; px < CH; px++) {
        const x = (px + 0.5) / CH * 2 - 1;
        const y = (py + 0.5) / CH * 2 - 1;
        const r = Math.hypot(x, y);
        churnPre.push({ r, a: Math.atan2(y, x) });
      }
    }
  }

  function drawChurn(t) {
    const d = churnImg.data;
    const z = t * 0.11;
    for (let i = 0; i < churnPre.length; i++) {
      const { r, a } = churnPre[i];
      const o = i * 4;
      if (r > 1.02) { d[o + 3] = 0; continue; }
      // differential rotation: the core turns faster than the limb → a slow swirl
      const ang = a + t * 0.05 * (1.25 - r);
      const x = Math.cos(ang) * r;
      const y = Math.sin(ang) * r;
      let n = vnoise(x * 2.3 + 10, y * 2.3 + 10, z) * 0.65 + vnoise(x * 5.1 - 7, y * 5.1 + 3, z * 1.7) * 0.35;
      n = Math.min(1, Math.max(0, (n - 0.5) * 1.9 + 0.5));
      // dark crust (#3a0800) → bright plasma (#fff0b0)
      d[o] = 58 + n * 197;
      d[o + 1] = 8 + n * 232;
      d[o + 2] = n * n * 176;
      d[o + 3] = 255;
    }
    churnCtx.putImageData(churnImg, 0, 0);
  }

  let frame = 0;
  function loop(now) {
    rafId = 0;
    if (!heroVisible || document.hidden || REDUCED) return;
    const t = now / 1000;
    const dt = Math.min(0.05, lastT ? t - lastT : 0.016);
    lastT = t;
    frame++;
    drawEmbers(t, dt);
    if (frame % 2 === 0) {
      drawPulse(t);
      if (churnCtx) drawChurn(t);
    }
    rafId = requestAnimationFrame(loop);
  }
  function startLoop() {
    if (!rafId && heroVisible && !document.hidden && !REDUCED) {
      lastT = 0;
      rafId = requestAnimationFrame(loop);
    }
  }
  function stopLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function initHero() {
    if (!hero || !sun) return;
    measureHero();

    let resizeT;
    window.addEventListener('resize', () => {
      clearTimeout(resizeT);
      resizeT = setTimeout(() => {
        measureHero();
        if (!REDUCED) initEmbers();
      }, 150);
    });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        heroVisible = entry.isIntersecting;
        hero.classList.toggle('is-offscreen', !heroVisible);
        if (heroVisible) { startLoop(); reel.resume(); } else { stopLoop(); reel.pause(); }
      }, { threshold: 0 }).observe(hero);
    }
    document.addEventListener('visibilitychange', () => (document.hidden ? stopLoop() : startLoop()));

    if (!REDUCED) {
      initEmbers();
      initChurn();
      startLoop();
      initParallax();
      initPointerDepth();
    }
  }

  // Pointer depth: layers inside the sun drift at different rates (fine pointers only).
  function initPointerDepth() {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const layers = [
      ['.sun-bloom', -18], ['.sun-rays', -10], ['.sun-corona--b', 9], ['.sun-corona--a', 5], ['.sky-lattice', -8],
    ].map(([sel, k]) => [$(sel, hero), k]).filter(([el]) => el);
    layers.forEach(([el]) => { el.style.transition = 'translate 1.2s cubic-bezier(.2,.7,.2,1)'; });
    let raf = 0;
    hero.addEventListener('pointermove', (e) => {
      if (REDUCED || raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const px = (e.clientX / window.innerWidth) * 2 - 1;
        const py = (e.clientY / window.innerHeight) * 2 - 1;
        layers.forEach(([el, k]) => { el.style.translate = `${(px * k).toFixed(1)}px ${(py * k).toFixed(1)}px`; });
      });
    });
    hero.addEventListener('pointerleave', () => layers.forEach(([el]) => { el.style.translate = ''; }));
  }

  // Sun sinks as you scroll, like a setting sun.
  function initParallax() {
    const copy = $('.hero-copy', hero);
    let ticking = false;
    const update = () => {
      ticking = false;
      const y = window.scrollY;
      if (y > geo.h * 1.2) return;
      sun.style.translate = `0 ${(y * 0.32).toFixed(1)}px`;
      if (copy && window.innerWidth >= 960) copy.style.translate = `0 ${(y * 0.12).toFixed(1)}px`;
    };
    window.addEventListener('scroll', () => {
      if (!ticking && !REDUCED) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
  }

  /* ════════════════════════════════════════════════════════════════════
     Reveal on scroll
     ════════════════════════════════════════════════════════════════════ */
  function initReveal() {
    const els = $$('.reveal');
    if (REDUCED) {
      els.forEach((el) => el.classList.add('is-in', 'is-settled'));
      return;
    }
    // Position-based (not IntersectionObserver-only) so a fast scroll can never skip an element:
    // anything at or above the fold is revealed; anything revealed and then out of view is
    // "settled" (transition dropped) so it can't stay frozen mid-fade.
    const pending = new Set(els);
    let ticking = false;
    const check = () => {
      ticking = false;
      const vh = window.innerHeight;
      pending.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < vh * 0.92) el.classList.add('is-in');
        if (el.classList.contains('is-in') && (r.bottom < 0 || r.top > vh)) {
          el.classList.add('is-settled');
          pending.delete(el);
        }
      });
      if (!pending.size) {
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
      }
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(check); } };
    els.forEach((el) => {
      el.addEventListener('transitionend', (e) => {
        if (e.target === el && el.classList.contains('is-in')) { el.classList.add('is-settled'); pending.delete(el); }
      });
    });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    check();
  }

  /* ════════════════════════════════════════════════════════════════════
     Below-the-fold videos: load + play only while in view
     ════════════════════════════════════════════════════════════════════ */
  const inviewVideos = [];
  function initInviewVideos() {
    const vids = $$('video[data-autoplay]');
    if (REDUCED || SAVE_DATA || !('IntersectionObserver' in window)) return;
    const holder = (v) => v.closest('.tile, .screen');

    vids.forEach((v) => {
      v.muted = true;
      v.addEventListener('playing', () => holder(v)?.classList.add('is-playing'));
      v.addEventListener('pause', () => holder(v)?.classList.remove('is-playing'));
      v.addEventListener('error', () => holder(v)?.classList.remove('is-playing'));
      inviewVideos.push(v);
    });

    const io = new IntersectionObserver((entries) => {
      entries.forEach(({ target: v, isIntersecting }) => {
        v._inView = isIntersecting;
        if (isIntersecting) {
          if (!v.getAttribute('src')) {
            const small = v.dataset.srcSmall && window.innerWidth < 1024;
            // once a clip is wanted, let it finish buffering (avoids aborted range requests on pause)
            v.preload = 'auto';
            v.src = small ? v.dataset.srcSmall : v.dataset.src;
          }
          if (!document.body.classList.contains('cinema-open')) {
            const p = v.play();
            if (p && p.catch) p.catch(() => {});
          }
        } else if (!v.paused) {
          v.pause();
        }
      });
    }, { threshold: 0.3 });
    vids.forEach((v) => io.observe(v));
  }
  const pauseInview = () => {
    inviewVideos.forEach((v) => { if (!v.paused) v.pause(); });
    reel.pause();
  };
  const resumeInview = () => {
    inviewVideos.forEach((v) => {
      if (v._inView && v.getAttribute('src')) { const p = v.play(); if (p && p.catch) p.catch(() => {}); }
    });
    reel.resume();
  };

  /* ════════════════════════════════════════════════════════════════════
     Hero trailer reel — a tiny muted gameplay loop, fetched after the page
     has loaded, played only while the hero is on screen.
     ════════════════════════════════════════════════════════════════════ */
  const reel = (() => {
    const btn = $('.hero-reel');
    const v = btn && $('.reel-video', btn);
    let wanted = false;
    const canPlay = () => v && wanted && heroVisible && !document.hidden && !REDUCED
      && !document.body.classList.contains('cinema-open');
    const resume = () => {
      if (!canPlay()) return;
      if (!v.getAttribute('src')) { v.preload = 'auto'; v.src = v.dataset.src; }
      const p = v.play();
      if (p && p.catch) p.catch(() => {});
    };
    const pause = () => { if (v && !v.paused) v.pause(); };
    const init = () => {
      if (!v || REDUCED || SAVE_DATA) return;
      v.muted = true;
      v.addEventListener('playing', () => btn.classList.add('is-playing'));
      v.addEventListener('error', () => btn.classList.remove('is-playing'));
      const go = () => setTimeout(() => { wanted = true; resume(); }, 400);
      if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
      document.addEventListener('visibilitychange', () => (document.hidden ? pause() : resume()));
    };
    return { init, resume, pause };
  })();

  /* ════════════════════════════════════════════════════════════════════
     Trailer — dialog with the local mp4, or a click-to-load YouTube embed
     ════════════════════════════════════════════════════════════════════ */
  function initTrailer() {
    const dlg = $('#cinema');
    const media = $('#cinema-media');
    const closeBtn = $('.cinema-close', dlg);
    if (!dlg || !media) return;
    let opener = null;

    const focusables = () => $$('button, video[controls], iframe, a[href]', dlg);

    function open(e) {
      opener = e.currentTarget;
      const start = Math.max(0, parseFloat(opener.dataset.t) || 0);
      media.textContent = '';
      if (CONFIG.youtubeTrailerId) {
        const f = document.createElement('iframe');
        f.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(CONFIG.youtubeTrailerId)}?autoplay=1&rel=0&playsinline=1${start ? `&start=${Math.floor(start)}` : ''}`;
        f.title = 'Atlas Conquest — official trailer';
        f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
        f.allowFullscreen = true;
        f.referrerPolicy = 'strict-origin-when-cross-origin';
        media.append(f);
      } else {
        const v = document.createElement('video');
        v.controls = true;
        v.playsInline = true;
        v.preload = 'auto';
        v.poster = `${ROOT}assets/media/stills/t62_5-960.webp`;
        v.src = `${ROOT}assets/media/video/trailer.mp4${start ? `#t=${start}` : ''}`;
        if (start) {
          // media fragment first; explicit seek as a fallback for browsers that ignore it
          v.addEventListener('loadedmetadata', () => {
            if (v.currentTime < start - 0.5) { try { v.currentTime = start; } catch (_) { /* not seekable yet */ } }
          }, { once: true });
        }
        v.setAttribute('aria-label', 'Atlas Conquest official trailer');
        media.append(v);
      }
      pauseInview();
      document.body.classList.add('cinema-open');
      document.documentElement.style.overflow = 'hidden';
      if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
      const v = media.querySelector('video');
      if (v) {
        const p = v.play();
        if (p && p.catch) p.catch(() => {});
        v.focus();
      } else {
        closeBtn.focus();
      }
    }

    function close() {
      if (dlg.open && typeof dlg.close === 'function') dlg.close();
      else dlg.removeAttribute('open');
    }

    dlg.addEventListener('close', () => {
      const v = media.querySelector('video');
      if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
      media.textContent = '';
      document.body.classList.remove('cinema-open');
      document.documentElement.style.overflow = '';
      resumeInview();
      if (opener && document.contains(opener)) opener.focus();
    });
    closeBtn.addEventListener('click', close);
    dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    $$('[data-trailer]').forEach((b) => b.addEventListener('click', open));
  }

  /* ════════════════════════════════════════════════════════════════════
     Pantheon — patrons & commanders
     ════════════════════════════════════════════════════════════════════ */
  const PATRONS = {
    skaal: {
      name: 'Skaal', title: 'Goddess of War', art: 'zurn', artName: 'Stormrider Zurn', pos: '50% 14%', posM: '56% 12%',
      blurb: 'Aggressive minions and destructive magic. Strike first, strike hard, and overwhelm the enemy before they can stabilize.',
      fallback: ['Captain Greenbeard', 'Kai, Longcount Shaman', 'Macks Speed'], cards: 36,
    },
    grenalia: {
      name: 'Grenalia', title: 'Goddess of Nature', art: 'dyana', artName: 'Dyana, Prime Huntress', pos: '74% 10%', posM: '70% 8%',
      blurb: 'Mana growth, poisons and massive creatures. Ramp your territory into an overwhelming force of nature.',
      fallback: ['Elber, Jungle Emissary', 'Jagris, the Huntsman', 'Lubela, Tender of the Wilds'], cards: 34,
    },
    lucia: {
      name: 'Lucia', title: 'Goddess of Light', art: 'euron', artName: 'Purifier Euron', pos: '0% 18%', shift: '26%', posM: '8% 16%',
      blurb: 'Unified armies, healing and village control. Hold the line and outlast everything sent against you.',
      fallback: ['Elyse of the Order', 'Executor Ginn', 'Milo Sunstone'], cards: 36,
    },
    shadis: {
      name: 'Shadis', title: 'God of Shadows', art: 'nilo', artName: 'Nilo of One Thousand Cuts', pos: '50% 22%', posM: '56% 20%',
      blurb: 'Dark magic, deception and life drained from the enemy. Control the board through cunning.',
      fallback: ['Fael Spiritwalker', 'Soultaker Viessa'], cards: 24,
    },
    archaeon: {
      name: 'Archaeon', title: 'God of Knowledge', art: 'zoghn', artName: 'Zoghn, Eye of Treason', pos: '62% 30%', posM: '62% 30%',
      blurb: 'Spellcraft, card draw and arcane tricks. Outthink your opponent, one clever turn at a time.',
      fallback: ['It That Weaves', 'Rosirix the Witch', 'Starwise Luna'], cards: 27,
    },
    neutral: {
      name: 'Neutral', title: 'The Unaligned', art: 'atlas', artName: 'Atlas, First to Walk', pos: '44% 26%', posM: '54% 24%',
      blurb: 'Mercenaries and wanderers that slot into almost any deck — plus two commanders who bend the rules of patronage.',
      fallback: ['Lazim, Thief of Gods', 'Newhaven Township'], cards: 127,
    },
  };
  const ORDER = ['skaal', 'grenalia', 'lucia', 'shadis', 'archaeon', 'neutral'];
  let commanders = null;
  let current = 'skaal';

  const STAT_LABEL = { health: 'Health', power: 'Power', speed: 'Speed', mana: 'Mana', intellect: 'Intellect', dominion: 'Dominion', durability: 'Durability' };
  function formatAbility(text) {
    let html = escapeHTML(text);
    html = html.replace(/&lt;sprite name=&quot;([a-z]+)_([0-9X])&quot;&gt;/g, (m, stat, n) => {
      const label = `${n} ${STAT_LABEL[stat] || stat}`;
      return `<img class="ti" src="${ROOT}assets/icons/text/${stat}_${n}.png" alt="${label}" title="${label}" width="24" height="26">`;
    });
    html = html.replace(/\[([^\]]+)\]/g, '<b>[$1]</b>');
    return html;
  }
  function statGem(kind, value) {
    const label = STAT_LABEL[kind];
    return `<span class="stat"><span class="stat-gem" aria-hidden="true"><img src="${ROOT}assets/icons/text/${kind}.png" alt="" width="28" height="27" loading="lazy"><span>${value}</span></span><span><span class="sr-only">${value} </span>${label}</span></span>`;
  }
  function commanderHTML(c) {
    const art = c.art ? `${ROOT}${c.art}` : `${ROOT}assets/commanders/${slugify(c.name)}.jpg`;
    const stats = c.health != null
      ? `<div class="cmd-stats">${statGem('health', c.health)}${statGem('dominion', c.dominion)}${statGem('intellect', c.intellect)}${statGem('speed', c.speed)}</div>`
      : '';
    return `<li class="cmd">
      <img class="cmd-portrait" src="${art}" alt="" width="400" height="400" loading="lazy" decoding="async">
      <div class="cmd-body">
        <div class="cmd-top"><h4 class="cmd-name">${escapeHTML(c.name)}</h4>${c.subtype ? `<span class="cmd-sub">${escapeHTML(c.subtype)}</span>` : ''}</div>
        ${c.text ? `<p class="cmd-text">${formatAbility(c.text)}</p>` : ''}
        ${stats}
      </div>
    </li>`;
  }

  function renderPatron(id) {
    const p = PATRONS[id];
    const panel = $('#patron-panel');
    const list = commanders
      ? commanders.filter((c) => c.faction === id)
      : p.fallback.map((name) => ({ name }));
    $('[data-p="title"]', panel).textContent = p.title;
    $('[data-p="name"]', panel).textContent = p.name;
    $('[data-p="blurb"]', panel).textContent = p.blurb;
    $('[data-p="cards"]', panel).textContent = String(p.cards);
    $('[data-p="ncmd"]', panel).textContent = String(list.length);
    $('[data-p="cmdword"]', panel).textContent = list.length === 1 ? 'commander' : 'commanders';
    $('[data-p="commanders"]', panel).innerHTML = list.map(commanderHTML).join('');
    $$('[data-p="art"]').forEach((n) => { n.textContent = p.artName; });
  }

  function artSrc(key, w) { return `${ROOT}assets/media/keyart/${key}-${w}.webp`; }
  function frameArt(img, p) {
    img.style.setProperty('--pos', p.pos || '60% 20%');
    img.style.setProperty('--pos-m', p.posM || p.pos || '60% 20%');
    if (p.shift) img.style.setProperty('--shift', p.shift); else img.style.removeProperty('--shift');
  }

  function selectPatron(id, { focus = false, instant = false } = {}) {
    if (!PATRONS[id]) return;
    const section = $('#gods');
    const panel = $('#patron-panel');
    const tabs = $$('.node', section);
    tabs.forEach((t) => {
      const on = t.dataset.patron === id;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on) {
        if (focus) t.focus();
        panel.setAttribute('aria-labelledby', t.id);
        const a = parseFloat(getComputedStyle(t).getPropertyValue('--a')) || -90;
        const spoke = $('.cl-active', section);
        if (spoke) spoke.style.setProperty('--rot', `${a + 90}deg`);
      }
    });
    if (id === current && !instant) return;
    current = id;
    section.dataset.patron = id;

    // centre emblem
    const core = $('.core-emblem', section);
    if (core) {
      core.classList.add('is-swapping');
      setTimeout(() => {
        core.src = `${ROOT}assets/factions/${id}.png`;
        core.classList.remove('is-swapping');
      }, instant || REDUCED ? 0 : 220);
    }

    // panel content
    if (instant || REDUCED) {
      renderPatron(id);
    } else {
      panel.classList.add('is-swapping');
      setTimeout(() => {
        renderPatron(id);
        requestAnimationFrame(() => panel.classList.remove('is-swapping'));
      }, 260);
    }

    // key art crossfade
    const imgs = $$('.pantheon-art-img', section);
    const on = imgs.find((i) => i.classList.contains('is-on')) || imgs[0];
    const off = imgs.find((i) => i !== on);
    const key = PATRONS[id].art;
    if (off) {
      off.onload = () => {
        if (current !== id) return;
        off.classList.add('is-on');
        on.classList.remove('is-on');
      };
      frameArt(off, PATRONS[id]);
      off.sizes = '(max-width: 1080px) 100vw, 72vw';
      off.srcset = `${artSrc(key, 1200)} 1200w, ${artSrc(key, 2400)} 2400w`;
      off.src = artSrc(key, 1200);
      if (off.complete && off.naturalWidth) off.onload();
    }
  }

  function initPantheon() {
    const section = $('#gods');
    if (!section) return;
    const tabs = $$('.node', section);
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => selectPatron(t.dataset.patron));
      t.addEventListener('keydown', (e) => {
        let next = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % tabs.length;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = tabs.length - 1;
        if (next !== null) { e.preventDefault(); selectPatron(tabs[next].dataset.patron, { focus: true }); }
      });
      // warm the key art on intent
      const warm = () => { const img = new Image(); img.src = artSrc(PATRONS[t.dataset.patron].art, 1200); };
      t.addEventListener('pointerenter', warm, { once: true });
      t.addEventListener('focus', warm, { once: true });
    });

    const first = $('.pantheon-art-img.is-on', section);
    if (first) frameArt(first, PATRONS[current]);

    loadJSON(`${ROOT}data/commanders.json`).then((data) => {
      if (!Array.isArray(data)) return;
      commanders = data;
      setStat('commanders', String(data.length));
      setStat('commanders-word', NUMBER_WORDS[data.length] || String(data.length));
      renderPatron(current);
    }).catch(() => {});
    // The default (Skaal) state ships in the HTML, so nothing to render until data or a click arrives.
  }

  /* ════════════════════════════════════════════════════════════════════
     Forge — fanned hand, redraw
     ════════════════════════════════════════════════════════════════════ */
  const CARD_POOL = [
    'Stormrider Zurn', 'Dyana, Prime Huntress', 'Red Dragon', 'Atlas, First to Walk', 'Purifier Euron',
    'Nilo of One Thousand Cuts', 'Zoghn, Eye of Treason', 'Khazgar, Flame Emperor', 'King Darian',
    'Black Dragon', 'Gold Dragon', 'Blue Dragon', 'Green Dragon', 'Silver Dragon', 'Fireball',
    'Explosive Potion', 'Viridian War Beast', 'Daemonprince Grizlocke', 'Lorecaller Gazan', 'Thunder Skywhale',
    'Eagle King', 'Lightning Bolt', 'Cone of Cold', 'Dreadlord Cyrion', 'Asera', 'Grutali', "Skerr'drix",
    'Prince Xerxes', 'Danrir, Omenhound', 'Giant River Snapper', 'Killing Hex', 'Chant of the Old Ones',
    'Stampede', 'Spore Thresher', 'Blinkshot', 'Royal Commandant', 'Dread Knight', 'Throne Guardian',
    'Drakemire Shaman', 'Mad Warlock', 'Gravehand', 'Big Game Hunter',
  ];

  function initForge() {
    const hand = $('.hand');
    const btn = $('[data-redraw]');
    if (!hand || !btn) return;
    const cards = $$('.hcard img', hand);
    const status = document.createElement('p');
    status.className = 'sr-only';
    status.setAttribute('aria-live', 'polite');
    hand.append(status);
    let busy = false;

    btn.addEventListener('click', async () => {
      if (busy) return;
      busy = true;
      const currentNames = new Set(cards.map((c) => c.alt));
      const pool = CARD_POOL.filter((n) => !currentNames.has(n));
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const pick = pool.slice(0, cards.length);
      const preload = pick.map((n) => {
        const img = new Image();
        img.src = `${ROOT}assets/media/cards/${slugify(n)}.webp`;
        return img.decode ? img.decode().catch(() => {}) : Promise.resolve();
      });
      hand.classList.add('is-dealing');
      const outDur = REDUCED ? 0 : 420 + cards.length * 40;
      await Promise.all([...preload, new Promise((r) => setTimeout(r, outDur))]);
      cards.forEach((img, i) => {
        img.src = `${ROOT}assets/media/cards/${slugify(pick[i])}.webp`;
        img.alt = pick[i];
      });
      void hand.offsetWidth;
      hand.classList.remove('is-dealing');
      status.textContent = `New hand: ${pick.join(', ')}.`;
      setTimeout(() => { busy = false; }, REDUCED ? 0 : 600);
    });
  }

  /* ════════════════════════════════════════════════════════════════════
     Live numbers (fallbacks are already in the HTML)
     ════════════════════════════════════════════════════════════════════ */
  function initStats() {
    loadJSON(`${ROOT}data/metadata.json`).then((m) => {
      const all = m && m.all;
      const a = all && all.all;
      if (a && a.total_matches) {
        const t = a.total_matches;
        const floored = t >= 1000 ? Math.floor(t / 100) * 100 : t; // round down so "+" stays true
        setStatPlus('matches', floored.toLocaleString('en-US'));
      }
      if (a && a.total_players) setStat('players', a.total_players.toLocaleString('en-US'));
      const maps = all ? Object.keys(all).filter((k) => k !== 'all').length : 0;
      if (maps) setStat('maps', String(maps));
    }).catch(() => {});

    // cards.json is ~150KB — fetch it once the page is idle.
    const later = window.requestIdleCallback || ((fn) => setTimeout(fn, 1200));
    const go = () => later(() => {
      loadJSON(`${ROOT}data/cards.json`).then((cards) => {
        if (!Array.isArray(cards)) return;
        const real = cards.filter((c) => !c.token);
        setStat('cards', String(real.length));
        setStat('cards-plus', `${Math.floor(real.length / 10) * 10}+`);
        ORDER.forEach((id) => { PATRONS[id].cards = real.filter((c) => c.faction === id).length || PATRONS[id].cards; });
        const p = $('[data-p="cards"]');
        if (p) p.textContent = String(PATRONS[current].cards);
      }).catch(() => {});
    });
    if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
  }

  /* ════════════════════════════════════════════════════════════════════
     Boot
     ════════════════════════════════════════════════════════════════════ */
  applyLinks();
  initNav();
  initHero();
  initReveal();
  initInviewVideos();
  reel.init();
  initTrailer();
  initPantheon();
  initForge();
  initStats();

  reduceMQ.addEventListener('change', (e) => {
    REDUCED = e.matches;
    if (REDUCED) {
      stopLoop();
      reel.pause();
      inviewVideos.forEach((v) => v.pause());
      $$('.reveal').forEach((el) => el.classList.add('is-in'));
      if (sun) sun.style.translate = '';
    } else {
      if (!embers.length) initEmbers();
      if (!churnCtx) initChurn();
      startLoop();
    }
  });
})();
