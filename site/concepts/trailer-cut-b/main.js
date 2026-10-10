/* Atlas Conquest — "Trailer Cut" homepage concept · Variant B: Full-Bleed Reel
   Plain JS, no dependencies. */

/* =========================================================================
   CONFIG — every outbound link lives here. Change a value, reload, done.
   ========================================================================= */
const CONFIG = {
  primaryCta: 'steam',       // 'steam' = Wishlist on Steam leads everywhere. 'discord' flips the roles (Join the Beta leads).
  steam: '',                 // Steam store URL. Empty = Steam buttons stay in place and point at '#' until the store page exists.
  discord: 'https://discord.gg/7QaEY4yJH5',
  youtubeTrailerId: 'hPoGfdLZThA',      // YouTube video id. Empty = play the local trailer.mp4 in the modal.
  x: 'https://x.com/Atlas_Conquest',
  instagram: 'https://www.instagram.com/atlasconquest/',
  tiktok: 'https://www.tiktok.com/@atlas.conquest',
  press: '../../press.html',
};

(() => {
  'use strict';

  const TRAILER_SRC = '../../assets/media/video/trailer.mp4';
  const TRAILER_POSTER = '../../assets/media/stills/t62_5.webp';
  const METADATA_URL = '../../data/metadata.json';
  const FALLBACK_MATCHES = 5229;

  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const safePlay = (v) => { try { const p = v.play(); if (p && p.catch) p.catch(() => {}); } catch (_) { /* ignore */ } };
  const fmt = (n) => Math.round(n).toLocaleString('en-US');

  let modalOpen = false;
  let heroCtl = null;
  let deckPinned = false; // true while the reel is pinned (the reel owns its clips)
  let chaptersCtl = null;
  let clipsCtl = null;
  let fieldCtl = null;
  let fieldsCtl = null;

  root.classList.add('js');
  if (!reduced) root.classList.add('js-reveal');

  /* Load a clip's source on demand, then play or pause it. */
  function want(v, play) {
    if (!v || reduced) return;
    if (play && !modalOpen) {
      if (!v.getAttribute('src')) { v.preload = 'auto'; v.src = v.dataset.src; }
      if (v.paused) safePlay(v);
    } else if (!v.paused) {
      v.pause();
    }
  }
  function warm(v) { if (v && !reduced && !v.getAttribute('src')) { v.preload = 'auto'; v.src = v.dataset.src; } }

  /* The spliced reels come in two encodes. The stage is full-bleed, so desktops and tablets
     get the 1920 cut; phones (and Save-Data / 2G) get the 1280 one. */
  function pickSources() {
    const conn = navigator.connection;
    const lean = conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || ''));
    const phone = Math.min(innerWidth, innerHeight) <= 600 || innerWidth <= 760;
    if (phone || lean) return;
    $$('video[data-src-hd]').forEach((v) => { v.dataset.src = v.dataset.srcHd; });
  }

  /* ---------------- Links + which call to action leads ----------------
     Steam is the primary CTA by default. With no store URL yet, Steam buttons
     simply point at '#' and do nothing when clicked. */
  function applyLinks() {
    root.classList.toggle('primary-discord', CONFIG.primaryCta === 'discord');
    $$('[data-link]').forEach((a) => {
      const key = a.dataset.link;
      const url = CONFIG[key];
      if (key === 'steam') {
        if (url) { a.href = url; return; }
        a.href = '#';
        a.removeAttribute('target');
        a.removeAttribute('rel');
        a.addEventListener('click', (e) => e.preventDefault());
        return;
      }
      if (url) a.href = url;
      else (a.closest('li') || a).hidden = true;
    });
  }

  /* ---------------- Nav ---------------- */
  function setupNav() {
    const nav = $('[data-nav]');
    const burger = $('.nav__burger');
    const menu = $('#nav-menu');
    const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 24);
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    const setOpen = (open) => {
      nav.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };
    burger.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
    menu.addEventListener('click', (e) => { if (e.target.closest('a, button')) setOpen(false); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) { setOpen(false); burger.focus(); }
    });
    document.addEventListener('click', (e) => {
      if (nav.classList.contains('is-open') && !nav.contains(e.target)) setOpen(false);
    });
    matchMedia('(min-width: 961px)').addEventListener('change', (e) => { if (e.matches) setOpen(false); });
  }

  /* ---------------- Smooth in-page anchors ---------------- */
  function scrollToY(y) { window.scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' }); }
  function setupAnchors() {
    $$('a[href^="#"]').forEach((a) => {
      a.addEventListener('click', (e) => {
        const id = a.getAttribute('href').slice(1);
        const target = id && document.getElementById(id);
        if (!target) return;
        e.preventDefault();
        scrollToY(target.getBoundingClientRect().top + window.scrollY);
        if (id === 'main') { target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }); }
      });
    });
  }

  /* ---------------- Hero video ----------------
     Phones in portrait get a purpose-cut 9:16 edit that follows the action;
     everything else gets the smallest landscape encode that still looks sharp under the scrim. */
  function setupHero() {
    const v = $('[data-hero-video]');
    const btn = $('[data-hero-pause]');
    const label = $('[data-hero-pause-label]');
    if (!v) return;
    const d = v.dataset;
    const w = innerWidth;
    const portrait = innerHeight > w && w <= 640;
    v.poster = portrait ? d.heroPosterPortrait : d.heroPoster;
    if (reduced) { root.classList.add('no-hero-video'); return; } // poster only
    const conn = navigator.connection;
    const lean = conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || ''));
    v.src = portrait ? d.srcPortrait : (w <= 1024 || lean) ? d.srcMd : w <= 1600 ? d.srcLg : d.srcXl;
    v.preload = 'metadata';
    v.muted = true;
    let userPaused = false;
    let inView = true;
    const update = () => {
      if (!userPaused && inView && !modalOpen && !document.hidden) safePlay(v);
      else v.pause();
    };
    btn.addEventListener('click', () => {
      userPaused = !userPaused;
      btn.setAttribute('aria-pressed', String(userPaused));
      label.textContent = userPaused ? 'Play background video' : 'Pause background video';
      update();
    });
    const hero = v.closest('.hero');
    new IntersectionObserver(([e]) => { inView = e.isIntersecting; update(); }, { threshold: 0.02 }).observe(hero);
    document.addEventListener('visibilitychange', update);
    heroCtl = { update };
    update();

    // gentle push-in as the hero scrolls away
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const k = clamp(window.scrollY / window.innerHeight, 0, 1);
        hero.style.setProperty('--hy', k.toFixed(3));
      });
    };
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---------------- Embers ---------------- */
  function setupEmbers() {
    if (reduced) return;
    $$('[data-embers]').forEach((box) => {
      const n = +box.dataset.embers || 16;
      const h = box.getBoundingClientRect().height || window.innerHeight;
      const frag = document.createDocumentFragment();
      for (let i = 0; i < n; i++) {
        const s = document.createElement('span');
        const size = 2 + Math.random() * 4;
        s.style.cssText =
          '--x:' + (Math.random() * 100).toFixed(2) + '%;' +
          '--s:' + size.toFixed(1) + 'px;' +
          '--d:' + (10 + Math.random() * 12).toFixed(1) + 's;' +
          '--delay:' + (-Math.random() * 22).toFixed(1) + 's;' +
          '--o:' + (0.3 + Math.random() * 0.6).toFixed(2) + ';' +
          '--dx:' + (Math.random() * 160 - 80).toFixed(0) + 'px;' +
          '--rise:' + (h * (0.55 + Math.random() * 0.5)).toFixed(0) + 'px';
        frag.appendChild(s);
      }
      box.appendChild(frag);
    });
  }

  /* ---------------- Below-the-fold clips (stacked layout) ----------------
     When the reel is pinned, setupReel decides which clip runs instead,
     because the stacked shots are all "intersecting" even when covered. */
  function setupClips() {
    if (reduced) return; // posters only
    const io = new IntersectionObserver((entries) => {
      entries.forEach(({ target: v, isIntersecting }) => {
        if (deckPinned && v.closest('[data-shot]')) return;
        want(v, isIntersecting);
      });
    }, { rootMargin: '120px 0px', threshold: 0.01 });
    $$('video[data-clip]').forEach((v) => io.observe(v));
    clipsCtl = {
      resume() { // after the trailer modal closes, restart whatever is on screen
        $$('video[data-clip]').forEach((v) => {
          if (deckPinned && v.closest('[data-shot]')) return;
          const r = v.getBoundingClientRect();
          if (r.bottom > -120 && r.top < innerHeight + 120) want(v, true);
        });
      },
    };
  }

  /* ---------------- The reel: five beats on one sticky stage ----------------
     The section is as tall as the beats need; its stage pins for the whole run.
     p = beats scrolled since the stage pinned (one beat = STRIDE stage-heights);
     u = p - i is beat i's own clock. Beat i fades in over beat i-1 as the trailer's
     dark title card, then the footage brightens and the title glides (FLIP-style,
     scale + translate only) into the lockup slot that CSS positions. */
  function setupReel() {
    const section = $('#chapters');
    const stage = section && $('[data-reel-stage]', section);
    if (!stage) return;
    const shots = $$('[data-shot]', stage);
    const n = shots.length;
    const titles = shots.map((s) => $('[data-title]', s));
    const lines = titles.map((t) => $$('.l', t));
    const slots = shots.map((s) => $('[data-slot]', s));
    const videos = shots.map((s) => $('video[data-clip]', s));
    const pans = shots.map((s) => (s.dataset.pan || '.5 .5').trim().split(/\s+/).map(Number));
    const segs = $$('[data-reel-progress] i', stage);
    const cta = $('[data-reel-cta]', stage);
    const portraitMQ = matchMedia('(max-aspect-ratio: 1/1)');
    const STRIDE = 0.92; // stage-heights of scroll per beat
    const TAIL = 0.86;   // how far into the last beat the stage stays pinned
    // beat clock keyframes: v dip in · t title lands · a title → lockup (it leaves first) · d veil lifts · pan · c closing button
    const K = { v: [0, 0.08], t: [0.05, 0.14], d: [0.25, 0.5], a: [0.2, 0.45], pan: [0.18, 1], c: [0.48, 0.6] };

    let pinned = false;
    let ticking = false;
    let W = 0; let H = 0; let S = 1; let top0 = 0;
    let geo = [];
    const last = shots.map(() => ({}));
    const live = shots.map(() => false);
    const stageLast = {};
    const lerp = (a, b, t) => a + (b - a) * t;

    function setVar(el, memo, k, v) {
      const r = Math.round(v * 10000) / 10000;
      if (memo[k] !== r) { memo[k] = r; el.style.setProperty(k, String(r)); }
    }

    function measure() {
      W = stage.clientWidth;
      H = stage.clientHeight;
      S = H * STRIDE;
      if (pinned) section.style.height = Math.round(H + (n - 1 + TAIL) * S) + 'px';
      else section.style.removeProperty('height');
      top0 = section.getBoundingClientRect().top + scrollY;
      if (!pinned) return;
      const sr = stage.getBoundingClientRect();
      geo = shots.map((s, i) => {
        const t = titles[i];
        t.style.transform = 'none';
        lines[i].forEach((l) => { l.style.transform = 'none'; });
        const w = t.offsetWidth;
        const h = t.offsetHeight;
        const slot = slots[i];
        const cs = getComputedStyle(slot);
        const r = slot.getBoundingClientRect();
        const k = parseFloat(cs.fontSize) / parseFloat(getComputedStyle(t).fontSize);
        const top = cs.getPropertyValue('--anchor').trim() === 'top';
        const c = Math.min(1, (W * 0.88) / w, (H * 0.42) / h); // the title card always fits
        last[i] = {};
        return {
          w, h, k, c,
          cx: (W - w * c) / 2, cy: H * 0.48 - (h * c) / 2,
          lx: r.left - sr.left, ly: (top ? r.top : r.top - h * k) - sr.top,
          lo: lines[i].map((l) => (w - l.offsetWidth) / 2), // centred lines (card) → flush left (lockup)
        };
      });
    }

    function apply(i, st) {
      const s = shots[i];
      const m = last[i];
      const g = geo[i];
      setVar(s, m, '--v', st.v);
      setVar(s, m, '--t', st.t);
      setVar(s, m, '--d', st.d);
      setVar(s, m, '--a', st.a);
      if (st.px === null) { if (m['--px'] !== undefined) { delete m['--px']; s.style.removeProperty('--px'); } }
      else setVar(s, m, '--px', st.px);
      const a = Math.round(st.a * 10000) / 10000;
      if (m.ta !== a) {
        m.ta = a;
        const x = lerp(g.cx, g.lx, a);
        const y = lerp(g.cy, g.ly, a);
        const k = lerp(g.c, g.k, a);
        titles[i].style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) scale(' + k.toFixed(4) + ')';
        lines[i].forEach((l, j) => { l.style.transform = g.lo[j] ? 'translate3d(' + (g.lo[j] * (1 - a)).toFixed(1) + 'px,0,0)' : ''; });
      }
      const off = st.v <= 0.001 || st.covered;
      if (m.off !== off) { m.off = off; s.classList.toggle('is-off', off); }
    }

    function update() {
      ticking = false;
      if (!pinned) return;
      const p = (scrollY - top0) / S;
      const port = portraitMQ.matches;
      const states = shots.map((_, i) => {
        const u = p - i;
        return {
          v: i === 0 ? 1 : smooth(K.v[0], K.v[1], u),
          t: i === 0 ? 1 : smooth(K.t[0], K.t[1], u),
          d: 1 - smooth(K.d[0], K.d[1], u),
          a: smooth(K.a[0], K.a[1], u),
          px: port ? lerp(pans[i][0], pans[i][1], smooth(K.pan[0], K.pan[1], u)) : null,
          covered: false,
        };
      });
      states.forEach((st, i) => { st.covered = i < n - 1 && states[i + 1].v >= 1; });
      states.forEach((st, i) => apply(i, st));

      // the front beat drives the embers; the last beat brings in the trailer button
      let front = 0;
      states.forEach((st, i) => { if (st.v > 0.5) front = i; });
      setVar(stage, stageLast, '--e', states[front].d);
      const c = smooth(K.c[0], K.c[1], p - (n - 1));
      setVar(stage, stageLast, '--c', c);
      cta.classList.toggle('is-live', c > 0.02);
      segs.forEach((el, i) => setVar(el, el._m || (el._m = {}), '--p', clamp((p - i) / (i < n - 1 ? 1 : TAIL - 0.1), 0, 1)));

      // Only the beats actually on screen play; the next one loads a beat early.
      const r = section.getBoundingClientRect();
      const inView = r.top < H && r.bottom > 0 && !document.hidden;
      root.classList.toggle('in-reel', r.top <= 1 && r.bottom >= H - 1);
      states.forEach((st, i) => {
        const v = videos[i];
        const show = inView && st.v > 0.01 && !st.covered;
        if (show && !live[i] && v.readyState > 0) { try { v.currentTime = 0; } catch (_) { /* ignore */ } }
        live[i] = show;
        if (show || p > i - (i === 0 ? 0.8 : 0.75)) {
          if (!v.poster && v.dataset.poster) v.poster = v.dataset.poster;
          if (p < i + 1.2) warm(v);
        }
        want(v, show);
      });
    }
    const request = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };

    function setMode() {
      pinned = !reduced;
      deckPinned = pinned;
      root.classList.toggle('js-reel', pinned);
      measure();
      update();
    }

    // Keyboard focus on the closing button: bring the last beat to its resolved state.
    cta.addEventListener('focusin', () => {
      if (!pinned) return;
      const p = (scrollY - top0) / S - (n - 1);
      if (p < K.c[1] || p > TAIL) window.scrollTo({ top: top0 + (n - 1 + 0.7) * S, behavior: 'auto' });
    });
    chaptersCtl = { refresh: request };

    addEventListener('scroll', request, { passive: true });
    let rt = 0;
    addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { measure(); update(); }, 80); });
    portraitMQ.addEventListener('change', request);
    document.addEventListener('visibilitychange', request);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measure(); update(); });
    addEventListener('load', () => { measure(); update(); });
    setMode();
  }

  /* ---------------- Three Battlefields ----------------
     One more full-bleed stage after the reel, playing the spliced battlefields reel
     (Dunes pull-back → Snowmelt → Tropics). Unlike the reel it runs on the clip's own
     clock: at every cut (data-cuts) the trailer's dark title card rises, the map name
     lands big and centred, then the footage brightens and the name glides into the
     lower-third lockup (same FLIP move as the reel, positioned by .shot__slot). The veil
     also rises into the loop point, so the jump back to the Dunes is hidden under a card.
     It restarts from the Dunes each time it scrolls back into view. */
  function setupFields() {
    const sec = $('[data-fields]');
    if (!sec) return;
    const stage = $('[data-fields-stage]', sec);
    const v = $('video[data-fields-video]', stage);
    const still = $('[data-fields-still]', stage);
    const titles = $$('[data-fields-title]', stage);
    const slot = $('[data-slot]', stage);
    const btns = $$('[data-fields-map]', stage);
    const bars = btns.map((b) => $('i', b));
    const pauseBtn = $('[data-fields-pause]', stage);
    const pauseLabel = $('[data-fields-pause-label]', stage);
    const cuts = v.dataset.cuts.trim().split(/\s+/).map(Number);
    const n = cuts.length;
    let dur = +v.dataset.duration || 16.4;

    const mark = (i) => btns.forEach((b, j) => {
      if (j === i) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });

    // Reduced motion: no autoplay. A still per map; the buttons swap it.
    if (reduced) {
      v.removeAttribute('data-poster');
      const stills = still.dataset.stills.trim().split(/\s+/);
      const show = (i) => {
        if (still.getAttribute('src') !== stills[i]) still.src = stills[i];
        titles.forEach((t, j) => t.style.setProperty('--t', j === i ? '1' : '0'));
        bars.forEach((el, j) => el.style.setProperty('--p', j <= i ? '1' : '0'));
        mark(i);
      };
      btns.forEach((b, i) => b.addEventListener('click', () => show(i)));
      show(0);
      return;
    }

    still.remove();
    root.classList.add('js-fields');
    pauseBtn.hidden = false;

    // clock keyframes, in seconds around each cut (the clip crossfades for 0.5s from the cut)
    const RISE = [-0.3, 0];     // veil comes up into the cut (full at the cut; the clip crossfades under it)
    const LAND = [0.05, 0.4];   // the name lands as the title card (the Dunes card is a hard cut: it opens the stage and the loop)
    const LIFT = [0.9, 1.9];    // veil lifts, footage brightens
    const GLIDE = [1.0, 2.0];   // name glides to the lockup
    const OUT = [0.15, 0.45];   // the lockup leaves just before the next cut (seconds left)
    const PEAK = (i) => (i === 0 ? 1 : 0.86);
    const lerp = (a, b, t) => a + (b - a) * t;

    let W = 0; let H = 0;
    let geo = [];
    let memo = titles.map(() => ({}));
    const stageMemo = {};
    const barMemo = bars.map(() => ({}));
    const setVar = (el, m, k, val) => {
      const r = Math.round(val * 10000) / 10000;
      if (m[k] !== r) { m[k] = r; el.style.setProperty(k, String(r)); }
    };

    function measure() {
      W = stage.clientWidth;
      H = stage.clientHeight;
      const sr = stage.getBoundingClientRect();
      const cs = getComputedStyle(slot);
      const r = slot.getBoundingClientRect();
      const top = cs.getPropertyValue('--anchor').trim() === 'top';
      geo = titles.map((t) => {
        t.style.transform = 'none';
        const w = t.offsetWidth;
        const h = t.offsetHeight;
        const k = parseFloat(cs.fontSize) / parseFloat(getComputedStyle(t).fontSize);
        const c = Math.min(1, (W * 0.88) / w, (H * 0.42) / h);
        return {
          k, c,
          cx: (W - w * c) / 2, cy: H * 0.48 - (h * c) / 2,
          lx: r.left - sr.left, ly: (top ? r.top : r.top - h * k) - sr.top,
        };
      });
      memo = titles.map(() => ({}));
    }

    let shown = -1;
    function render(time) {
      const t = clamp(time || 0, 0, dur);
      let i = 0;
      for (let j = 1; j < n; j++) if (t >= cuts[j]) i = j;
      const end = i < n - 1 ? cuts[i + 1] : dur;
      const tau = t - cuts[i];
      const left = end - t;
      const next = i < n - 1 ? i + 1 : 0;

      // the title-card veil: up at this cut (until it lifts), and rising again into the next one
      const d = Math.max(
        PEAK(i) * smooth(RISE[0], RISE[1], tau) * (1 - smooth(LIFT[0], LIFT[1], tau)),
        PEAK(next) * smooth(RISE[0], RISE[1], -left)
      );
      setVar(stage, stageMemo, '--d', d);

      const tOn = (i === 0 ? 1 : smooth(LAND[0], LAND[1], tau)) * smooth(OUT[0], OUT[1], left);
      const aOn = smooth(GLIDE[0], GLIDE[1], tau);
      titles.forEach((el, j) => {
        const m = memo[j];
        const g = geo[j];
        const on = j === i;
        setVar(el, m, '--t', on ? tOn : 0);
        if (!on) return;
        setVar(el, m, '--a', aOn);
        const a = Math.round(aOn * 10000) / 10000;
        if (m.ta !== a && g) {
          m.ta = a;
          const x = lerp(g.cx, g.lx, a);
          const y = lerp(g.cy, g.ly, a);
          const k = lerp(g.c, g.k, a);
          el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) scale(' + k.toFixed(4) + ')';
        }
      });
      bars.forEach((el, j) => setVar(el, barMemo[j], '--p', j < i ? 1 : j > i ? 0 : clamp(tau / (end - cuts[i]), 0, 1)));
      if (shown !== i) { shown = i; mark(i); }
    }

    let raf = 0;
    const loop = () => { raf = 0; render(v.currentTime); if (!v.paused) raf = requestAnimationFrame(loop); };
    const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
    v.addEventListener('play', kick);
    v.addEventListener('seeked', kick);
    v.addEventListener('loadedmetadata', () => { if (isFinite(v.duration) && v.duration > cuts[n - 1]) dur = v.duration; kick(); });

    const seek = (time) => {
      try { v.currentTime = time; } catch (_) { /* not loaded yet */ }
      render(time);
    };

    let inView = false;
    let wasOut = true;
    let userPaused = false;
    const load = () => { if (!v.getAttribute('src')) { v.preload = 'auto'; v.src = v.dataset.src; } };
    const update = () => {
      if (inView && !userPaused && !modalOpen && !document.hidden) { load(); safePlay(v); }
      else if (!v.paused) v.pause();
    };

    // start once most of the stage is on screen (it scrolls in as the dark Dunes title card);
    // keep playing until it has fully left; reset to the Dunes card while it is away
    new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) {
          inView = false;
          if (!wasOut) { wasOut = true; seek(0); }
        } else if (e.intersectionRatio >= 0.75) {
          wasOut = false;
          inView = true;
        }
      });
      update();
    }, { threshold: [0, 0.75] }).observe(stage);
    // fetch the clip while the reel's last beats are still on screen
    const warmIO = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { load(); warmIO.disconnect(); }
    }, { rootMargin: '0px 0px 150% 0px' });
    warmIO.observe(stage);

    // Jump to a map: just past its crossfade, on its title card. A server that can't serve byte
    // ranges (a bare local preview) leaves the clip unseekable, so then it plays from a blob once.
    let blob = null;
    const seekable = (time) => {
      for (let k = 0; k < v.seekable.length; k++) if (v.seekable.start(k) <= time && time <= v.seekable.end(k) + 0.01) return true;
      return false;
    };
    btns.forEach((b, i) => b.addEventListener('click', async () => {
      const time = i === 0 ? 0 : cuts[i] + 0.5;
      load();
      render(time);
      if (time > 0 && v.readyState >= 1 && !seekable(time) && !blob) {
        blob = fetch(v.currentSrc)
          .then((r) => (r.ok ? r.blob() : Promise.reject()))
          .then((data) => new Promise((res) => {
            v.addEventListener('loadedmetadata', res, { once: true });
            v.src = URL.createObjectURL(data);
          }))
          .catch(() => {});
      }
      if (blob) await blob;
      seek(time);
      update();
    }));
    pauseBtn.addEventListener('click', () => {
      userPaused = !userPaused;
      pauseBtn.setAttribute('aria-pressed', String(userPaused));
      pauseLabel.textContent = userPaused ? 'Play battlefields video' : 'Pause battlefields video';
      update();
    });

    // the nav floats over this stage too, like it does in the reel
    let navRaf = 0;
    const onScroll = () => {
      if (navRaf) return;
      navRaf = requestAnimationFrame(() => {
        navRaf = 0;
        const r = stage.getBoundingClientRect();
        root.classList.toggle('in-fields', r.top <= 1 && r.bottom >= 90);
      });
    };
    addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', update);
    let rt = 0;
    addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { measure(); render(v.currentTime); }, 80); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measure(); render(v.currentTime); });
    addEventListener('load', () => { measure(); render(v.currentTime); });
    measure();
    render(0);
    onScroll();
    fieldsCtl = { update };
  }

  /* ---------------- Numbers backdrop: the card field ----------------
     One smooth pull-back over the field of cards, then it holds on the last frame.
     The file is a half-speed re-cut of the 60fps trailer with the darkness baked in
     (no CSS filters), fetched well before it scrolls into view, and only started
     once it can play through, so it never stutters on entry. */
  function setupField() {
    const v = $('video[data-field]');
    if (!v) return;
    const sec = v.closest('section');
    const endPoster = v.dataset.end;
    if (reduced) { v.poster = endPoster; return; } // the held final frame, as a still
    const src = innerWidth <= 820 ? v.dataset.srcSm : v.dataset.src;
    let state = 0; // 0 idle · 1 loading · 2 started
    let raf = 0;
    const giveUp = () => { // autoplay refused (e.g. low-power mode): show the held frame instead
      v.removeAttribute('src');
      try { v.load(); } catch (_) { /* ignore */ }
      v.poster = endPoster;
    };
    const start = () => {
      if (modalOpen) return;
      try { const p = v.play(); if (p && p.catch) p.catch(giveUp); } catch (_) { giveUp(); }
    };
    const check = () => {
      raf = 0;
      const r = sec.getBoundingClientRect();
      const vh = innerHeight;
      if (state === 0 && r.top < vh * 2.5 && r.bottom > -vh) {
        state = 1;
        v.preload = 'auto';
        v.src = src;
        v.load();
      }
      if (state === 1 && r.top < vh * 0.62 && r.bottom > vh * 0.25) {
        state = 2;
        removeEventListener('scroll', onScroll);
        if (v.readyState >= 4) start();
        else {
          let done = false;
          const go = () => { if (!done) { done = true; start(); } };
          v.addEventListener('canplaythrough', go, { once: true });
          setTimeout(go, 1800); // don't wait forever on a slow connection
        }
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(check); };
    addEventListener('scroll', onScroll, { passive: true });
    v.addEventListener('error', giveUp, { once: true });
    check();
    fieldCtl = { resume() { if (state === 2 && v.paused && !v.ended && v.currentTime > 0) safePlay(v); } };
  }

  /* ---------------- Reveal + image priming ----------------
     A plain scroll-position check (not IntersectionObserver) so that anything
     the reader has scrolled to *or past* is always revealed. */
  function setupReveal() {
    let reveal = reduced ? [] : $$('[data-reveal], [data-reveal-stack]');
    let prime = $$('[data-prime], video[data-poster]').filter((el) => !(deckPinned && el.closest('[data-shot]'))); // the reel primes its own
    let raf = 0;
    const check = () => {
      raf = 0;
      const vh = window.innerHeight;
      reveal = reveal.filter((el) => {
        if (el.getBoundingClientRect().top < vh * 0.94) { el.classList.add('is-in'); return false; }
        return true;
      });
      prime = prime.filter((sec) => {
        if (sec.getBoundingClientRect().top > vh * 2.2) return true;
        if (sec.tagName === 'VIDEO') { sec.poster = sec.dataset.poster; return false; }
        $$(sec.dataset.prime, sec).forEach((img) => { if (img.loading === 'lazy') img.loading = 'eager'; });
        return false;
      });
      if (!reveal.length && !prime.length) { removeEventListener('scroll', onScroll); removeEventListener('resize', onScroll); }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(check); };
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    check();
  }

  /* ---------------- Live match count + count-up ---------------- */
  async function loadMatches() {
    try {
      const res = await fetch(METADATA_URL, { cache: 'no-cache' });
      if (res.ok) {
        const json = await res.json();
        const all = ((json && json.data) || json || {}).all;
        const a = all && all.all;
        if (a && a.total_matches) return a.total_matches;
      }
    } catch (_) { /* keep the fallback */ }
    return FALLBACK_MATCHES;
  }

  function setupNumbers() {
    const counters = $$('[data-count]');
    const srOf = (el) => $('[data-sr]', el.closest('.stat'));
    const suffixOf = (el) => (el.nextElementSibling && el.nextElementSibling.classList.contains('stat__plus') ? '+' : '');
    const setFinal = (el) => {
      el.textContent = fmt(+el.dataset.count);
      srOf(el).textContent = el.textContent + suffixOf(el);
    };

    const liveEl = $('[data-live-matches]');
    const ready = loadMatches().then((m) => {
      liveEl.dataset.count = String(m);
      srOf(liveEl).textContent = fmt(m);
      // Headline rounds *down* to the thousand ("5,000+") so it never over-claims.
      if (m >= 1000) $$('[data-live-round]').forEach((el) => { el.textContent = fmt(Math.floor(m / 1000) * 1000); });
      if (reduced || liveEl.dataset.done) setFinal(liveEl);
    });

    if (reduced) { ready.then(() => counters.forEach(setFinal)); return; }
    counters.forEach((el) => { el.textContent = '0'; });

    let started = false;
    const run = () => {
      counters.forEach((el, i) => {
        const delay = i * 140;
        const dur = 1600 + i * 120;
        let t0 = 0;
        const tick = (t) => {
          if (!t0) t0 = t;
          const k = clamp((t - t0 - delay) / dur, 0, 1);
          const e = 1 - Math.pow(1 - k, 4);
          el.textContent = fmt(+el.dataset.count * e);
          if (k < 1) requestAnimationFrame(tick); else { el.dataset.done = '1'; setFinal(el); }
        };
        requestAnimationFrame(tick);
      });
    };
    const box = $('.stats');
    let raf = 0;
    const check = () => {
      raf = 0;
      if (started || box.getBoundingClientRect().top > window.innerHeight * 0.8) return;
      started = true;
      removeEventListener('scroll', onScroll);
      Promise.race([ready, new Promise((r) => setTimeout(r, 900))]).then(run);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(check); };
    addEventListener('scroll', onScroll, { passive: true });
    check();
  }

  /* ---------------- Gallery ---------------- */
  function setupGallery() {
    const track = $('[data-gallery-track]');
    if (!track) return;
    const panels = $$('.panel', track);
    const cur = $('[data-gallery-current]');
    const tot = $('[data-gallery-total]');
    const prev = $('[data-gallery-prev]');
    const next = $('[data-gallery-next]');
    const pad = (n) => String(n).padStart(2, '0');
    tot.textContent = pad(panels.length);
    let active = -1;
    const centerOf = (p) => p.offsetLeft + p.offsetWidth / 2;

    function measure() {
      const mid = track.scrollLeft + track.clientWidth / 2;
      let best = 0;
      let bd = Infinity;
      panels.forEach((p, i) => { const d = Math.abs(centerOf(p) - mid); if (d < bd) { bd = d; best = i; } });
      if (best === active) return;
      active = best;
      panels.forEach((p, i) => {
        p.classList.toggle('is-active', i === best);
        p.setAttribute('aria-current', i === best ? 'true' : 'false');
      });
      cur.textContent = pad(best + 1);
      prev.disabled = best === 0;
      next.disabled = best === panels.length - 1;
    }
    const go = (i) => {
      const p = panels[clamp(i, 0, panels.length - 1)];
      track.scrollTo({ left: centerOf(p) - track.clientWidth / 2, behavior: reduced ? 'auto' : 'smooth' });
    };
    prev.addEventListener('click', () => go(active - 1));
    next.addEventListener('click', () => go(active + 1));
    let raf = 0;
    track.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); }, { passive: true });
    addEventListener('resize', () => { active = -1; measure(); });
    track.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(active + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(active - 1); }
    });

    // Mouse drag-to-scroll (touch uses native scrolling)
    let down = false; let moved = false; let sx = 0; let sl = 0;
    track.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      down = true; moved = false; sx = e.clientX; sl = track.scrollLeft;
    });
    addEventListener('pointermove', (e) => {
      if (!down) return;
      const dx = e.clientX - sx;
      if (!moved && Math.abs(dx) > 6) { moved = true; track.classList.add('is-dragging'); }
      if (moved) track.scrollLeft = sl - dx;
    });
    addEventListener('pointerup', () => {
      if (!down) return;
      down = false;
      if (!moved) return;
      measure();
      go(active);
      setTimeout(() => { track.classList.remove('is-dragging'); moved = false; }, 450);
    });
    panels.forEach((p, i) => p.addEventListener('click', () => { if (!moved && i !== active) go(i); }));
    measure();
  }

  /* ---------------- Finale coverflow (the trailer's end slide) ----------------
     Cards sit on a shallow arc: the centre card is largest and frontmost, the rest
     turn away and recede toward both screen edges. Every 2.5s the row advances one
     card. Each card carries its own perspective() so overlaps follow z-index (no
     3D intersections), and cards only ever wrap around while invisible. */
  function setupFlow() {
    const flow = $('[data-flow]');
    if (!flow) return;
    const cards = $$('.flow__card', flow);
    const toggle = $('[data-flow-toggle]', flow);
    const n = cards.length;
    const HALF = Math.floor(n / 2);
    const SHOWN = 5;                   // cards visible either side of the centre
    const STEP = (15 * Math.PI) / 180; // arc angle between neighbours
    const INTERVAL = 2500;
    let cur = 0;
    const lastD = cards.map(() => null);
    flow.classList.add('is-ready');

    const posOf = (i) => { let m = (((i - cur) % n) + n) % n; if (m > HALF) m -= n; return m; };

    function layout(instant) {
      const cw = cards[0].offsetWidth;
      const R = cw * 3.6;   // arc radius
      const P = cw * 7;     // camera distance
      cards.forEach((c, i) => {
        const d = posOf(i);
        const ad = Math.abs(d);
        const sg = Math.sign(d);
        const th = Math.min(ad, SHOWN + 1) * STEP;
        const x = sg * R * Math.sin(th);
        const z = R * (Math.cos(th) - 1) - ad * 0.06 * cw;
        const rot = sg * Math.min(th * 1.18, 1.43);
        const wrapped = lastD[i] !== null && Math.abs(d - lastD[i]) > HALF;
        c.classList.toggle('is-jump', !!instant || wrapped);
        c.style.transform = 'perspective(' + P.toFixed(0) + 'px) translate3d(' + x.toFixed(1) + 'px,0,' + z.toFixed(1) + 'px) rotateY(' + rot.toFixed(4) + 'rad)';
        c.style.zIndex = String(50 - ad);
        c.style.opacity = ad <= SHOWN - 1 ? '1' : ad === SHOWN ? '.7' : '0';
        c.style.setProperty('--lit', Math.max(0.5, 1 - ad * 0.1).toFixed(2));
        c.classList.toggle('is-center', d === 0);
        c.setAttribute('aria-hidden', ad > SHOWN - 1 ? 'true' : 'false');
        lastD[i] = d;
      });
      if (instant) { void flow.offsetWidth; cards.forEach((c) => c.classList.remove('is-jump')); }
    }

    function step(k) { cur = (((cur + k) % n) + n) % n; layout(false); }

    // Multi-card moves (clicking a far card) spin one card at a time, quickly.
    let queue = 0;
    let qTimer = 0;
    function stepBy(k) {
      if (!k) return;
      clearTimeout(qTimer);
      queue = k;
      flow.classList.add('is-fast');
      const run = () => {
        const s = Math.sign(queue);
        step(s);
        queue -= s;
        if (queue) qTimer = setTimeout(run, reduced ? 0 : 170);
        else qTimer = setTimeout(() => flow.classList.remove('is-fast'), 500);
      };
      run();
    }

    // Autoplay: pauses on hover, focus, the toggle, a hidden tab, off-screen, or the trailer modal.
    let hover = false; let focused = false; let userPaused = false; let inView = false; let timer = 0;
    const canRun = () => !reduced && !hover && !focused && !userPaused && inView && !document.hidden && !modalOpen;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { if (canRun()) step(1); schedule(); }, INTERVAL);
    };
    new IntersectionObserver(([e]) => { inView = e.isIntersecting; }, { threshold: 0.25 }).observe(flow);
    flow.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') hover = true; });
    flow.addEventListener('pointerleave', () => { hover = false; });
    flow.addEventListener('focusin', () => { focused = true; });
    flow.addEventListener('focusout', (e) => { if (!flow.contains(e.relatedTarget)) focused = false; });

    if (!reduced) {
      toggle.hidden = false;
      toggle.addEventListener('click', () => {
        userPaused = !userPaused;
        toggle.setAttribute('aria-pressed', String(userPaused));
        toggle.setAttribute('aria-label', userPaused ? 'Play cards' : 'Pause cards');
      });
    }

    // Swipe / drag (touch keeps vertical page scrolling), click a card to bring it forward, arrow keys.
    let sx = null; let moved = false;
    flow.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button')) return;
      sx = e.clientX; moved = false;
    });
    flow.addEventListener('pointermove', (e) => { if (sx !== null && Math.abs(e.clientX - sx) > 10) moved = true; });
    const end = (e) => {
      if (sx === null) return;
      const dx = e.clientX - sx;
      sx = null;
      if (Math.abs(dx) > 36) { stepBy(dx < 0 ? 1 : -1); schedule(); }
    };
    flow.addEventListener('pointerup', end);
    flow.addEventListener('pointercancel', () => { sx = null; });
    cards.forEach((c, i) => c.addEventListener('click', () => {
      if (moved) return;
      const d = posOf(i);
      if (d) { stepBy(d); schedule(); }
    }));
    flow.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); stepBy(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); stepBy(-1); }
    });

    layout(true);
    let rt = 0;
    addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => layout(true), 100); });
    schedule();
  }

  /* ---------------- Trailer modal ---------------- */
  function setupModal() {
    const dlg = $('[data-modal]');
    const frame = $('[data-modal-frame]');
    const closeBtn = $('[data-modal-close]');
    if (!dlg || typeof dlg.showModal !== 'function') {
      // Very old browsers: just open the file.
      $$('[data-trailer]').forEach((b) => b.addEventListener('click', () => {
        window.open(CONFIG.youtubeTrailerId ? 'https://www.youtube.com/watch?v=' + CONFIG.youtubeTrailerId : TRAILER_SRC, '_blank', 'noopener');
      }));
      return;
    }
    let opener = null;

    function open(e) {
      opener = e.currentTarget;
      frame.textContent = '';
      if (CONFIG.youtubeTrailerId) {
        const f = document.createElement('iframe');
        f.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(CONFIG.youtubeTrailerId) + '?autoplay=1&rel=0&modestbranding=1';
        f.title = 'Atlas Conquest trailer';
        f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
        f.allowFullscreen = true;
        f.referrerPolicy = 'strict-origin-when-cross-origin';
        frame.appendChild(f);
      } else {
        const v = document.createElement('video');
        v.controls = true;
        v.playsInline = true;
        v.preload = 'auto';
        v.poster = TRAILER_POSTER;
        v.setAttribute('aria-label', 'Atlas Conquest trailer, with sound');
        v.src = TRAILER_SRC;
        frame.appendChild(v);
      }
      modalOpen = true;
      if (heroCtl) heroCtl.update();
      if (fieldsCtl) fieldsCtl.update();
      $$('video[data-clip], video[data-field]').forEach((c) => { if (!c.paused) c.pause(); });
      dlg.showModal();
      closeBtn.focus();
      const v = $('video', frame);
      if (v) safePlay(v);
    }
    function teardown() {
      const v = $('video', frame);
      if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
      frame.textContent = '';
      modalOpen = false;
      if (heroCtl) heroCtl.update();
      if (fieldsCtl) fieldsCtl.update();
      if (chaptersCtl) chaptersCtl.refresh();
      if (clipsCtl) clipsCtl.resume();
      if (fieldCtl) fieldCtl.resume();
      if (opener && document.contains(opener)) opener.focus();
    }
    $$('[data-trailer]').forEach((b) => b.addEventListener('click', open));
    closeBtn.addEventListener('click', () => dlg.close());
    dlg.addEventListener('close', teardown);
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    // focus trap: wrap Tab at both ends of the dialog
    $('[data-sentinel="start"]', dlg).addEventListener('focus', () => { ($('video, iframe', frame) || closeBtn).focus(); });
    $('[data-sentinel="end"]', dlg).addEventListener('focus', () => closeBtn.focus());
  }

  /* ---------------- Boot ---------------- */
  applyLinks();
  setupNav();
  setupAnchors();
  setupHero();
  setupEmbers();
  pickSources();
  setupReel();
  setupFields();
  setupClips();
  setupField();
  setupReveal();
  setupNumbers();
  setupGallery();
  setupFlow();
  setupModal();
})();
