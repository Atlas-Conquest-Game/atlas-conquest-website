/* Atlas Conquest — "Trailer Cut" homepage concept
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
  let deckPinned = false; // true while the chapter deck is pinned (chapters own their clips)
  let chaptersCtl = null;
  let clipsCtl = null;
  let fieldCtl = null;

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

  /* Full-bleed reels ship a 1920 and a 1280 encode; phones and small tablets get the 1280. */
  function pickSources() {
    if (innerWidth > 820) return;
    $$('video[data-clip][data-src-sm]').forEach((v) => { v.dataset.src = v.dataset.srcSm; });
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
     When the chapter deck is pinned, setupChapters decides which clip runs instead,
     because stacked stages are all "intersecting" even when covered. */
  function setupClips() {
    if (reduced) return; // posters only
    const io = new IntersectionObserver((entries) => {
      entries.forEach(({ target: v, isIntersecting }) => {
        if (deckPinned && v.closest('[data-chapter]')) return;
        if (v.hasAttribute('data-fields-video')) return; // setupFields starts it later
        want(v, isIntersecting);
      });
    }, { rootMargin: '120px 0px', threshold: 0.01 });
    $$('video[data-clip]').forEach((v) => io.observe(v));
    clipsCtl = {
      resume() { // after the trailer modal closes, restart whatever is on screen
        $$('video[data-clip]').forEach((v) => {
          if (deckPinned && v.closest('[data-chapter]')) return;
          const r = v.getBoundingClientRect();
          if (r.bottom > -120 && r.top < innerHeight + 120) want(v, true);
        });
      },
    };
  }

  /* ---------------- Chapters: the pinned "deck" ----------------
     Each chapter is a 100vh sticky stage; the next one pins STRIDE viewport-heights
     later and fades in over it *in place*: the gold title card dissolves in on dark,
     then shrinks into its slot while the footage opens beneath it like a shutter.
     u = how many viewport-heights the reader has scrolled since the stage pinned. */
  function setupChapters() {
    const section = $('#chapters');
    if (!section) return;
    const chapters = $$('[data-chapter]', section);
    const n = chapters.length;
    const stages = chapters.map((c) => $('.chapter__stage', c));
    const heads = chapters.map((c) => $('[data-head]', c));
    const videos = chapters.map((c) => $('video[data-clip]', c));
    const segs = $$('[data-beatbar] i');
    const pinMQ = matchMedia('(min-width: 1000px) and (min-height: 640px)');

    const KF = chapters.map((c, i) => {
      // v: fade the stage in over the last one · t: title card fades up · a: title → slot · b: shutter · c: line
      if (i === 0) return { v: null, t: null, a: [0.04, 0.24], b: [0.08, 0.3], c: [0.24, 0.38], peak: 0.4 };
      if (c.classList.contains('chapter--climax')) return { v: [0, 0.06], t: [0.03, 0.12], a: [0.2, 0.38], b: [0.12, 0.32], c: [0.32, 0.44], peak: 0.48 };
      return { v: [0, 0.06], t: [0.03, 0.12], a: [0.17, 0.37], b: [0.21, 0.41], c: [0.33, 0.46], peak: 0.48 };
    });
    const FULL = { v: 1, t: 1, a: 1, b: 1, c: 1 };
    const HIDDEN = { v: 0, t: 0, a: 0, b: 0, c: 0 };
    const last = chapters.map(() => ({}));
    let pinned = false;
    let ticking = false;
    let vh = innerHeight;
    let tops = [];

    function measure() {
      vh = innerHeight;
      tops = chapters.map((c) => c.getBoundingClientRect().top + scrollY);
      if (!pinned) return;
      // Where does each heading have to travel to become a centred title card?
      root.classList.add('is-measuring');
      chapters.forEach((c, i) => {
        const sr = stages[i].getBoundingClientRect();
        const hr = heads[i].getBoundingClientRect();
        const cy = hr.top - sr.top + hr.height / 2;
        const s = clamp(Math.min(2.1, (sr.width * 0.84) / hr.width, (sr.height * 0.34) / hr.height), 1, 2.1);
        c.style.setProperty('--dy', (sr.height * 0.48 - cy).toFixed(1));
        c.style.setProperty('--s', s.toFixed(3));
      });
      root.classList.remove('is-measuring');
    }

    function apply(i, st) {
      const c = chapters[i];
      const prev = last[i];
      const f = st.b > 0 && st.b < 1 ? Math.sin(st.b * Math.PI) : 0;
      const vals = { '--v': st.v, '--t': st.t, '--a': st.a, '--b': st.b, '--c': st.c, '--f': f };
      for (const k in vals) {
        const v = Math.round(vals[k] * 10000) / 10000;
        if (prev[k] !== v) { prev[k] = v; c.style.setProperty(k, String(v)); }
      }
      stages[i].classList.toggle('is-asleep', st.v < 0.5);
    }

    function update() {
      ticking = false;
      const y = scrollY;
      let active = -1;
      const states = [];
      for (let i = 0; i < n; i++) {
        const top = tops[i] - y;
        const u = (y - tops[i]) / vh;
        if (i === 0 ? top < vh * 0.5 : u >= 0.06) active = i;
        if (!pinned) continue;
        let st;
        if (top >= vh - 0.5) st = FULL;          // not reached yet: rest in its resolved state (off-screen)
        else if (i > 0 && top > 0) st = HIDDEN;  // gliding up beneath the pinned stage: invisible
        else {
          const k = KF[i];
          st = {
            v: k.v ? smooth(k.v[0], k.v[1], u) : 1,
            t: k.t ? smooth(k.t[0], k.t[1], u) : 1,
            a: smooth(k.a[0], k.a[1], u),
            b: smooth(k.b[0], k.b[1], u),
            c: smooth(k.c[0], k.c[1], u),
          };
        }
        states.push(st);
      }

      if (pinned) {
        // Which clips are actually on screen? (A stage fully covered by the next one doesn't count.)
        const rects = stages.map((s) => s.getBoundingClientRect());
        states.forEach((st, i) => {
          apply(i, st);
          const r = rects[i];
          const covered = i < n - 1 && states[i + 1].v >= 1 && rects[i + 1].top <= 0.5;
          const onScreen = st.v > 0.01 && st.b > 0.01 && r.bottom > 1 && r.top < vh - 1 && !covered;
          want(videos[i], onScreen);
          if (!onScreen && y > 0 && r.top < vh * 1.5 && r.bottom > -vh) warm(videos[i]);
        });
      }

      // Thin, unnumbered progress: each segment fills while its beat is on screen.
      segs.forEach((s, i) => {
        const span = i < n - 1 ? tops[i + 1] - tops[i] : KF[i].peak * vh;
        const from = tops[i] - (i === 0 ? vh * 0.3 : 0);
        s.style.setProperty('--p', clamp((y - from) / (span + (i === 0 ? vh * 0.3 : 0)), 0, 1).toFixed(3));
        s.classList.toggle('is-on', i === active);
      });
      root.classList.toggle('in-chapters', y >= tops[0] - vh * 0.3 && y < tops[n - 1] + vh * (pinned ? 0.62 : 0.6));
    }
    const request = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };

    function setMode() {
      pinned = pinMQ.matches && !reduced;
      deckPinned = pinned;
      root.classList.toggle('js-pin', pinned);
      chapters.forEach((c, i) => {
        if (!pinned) {
          ['--v', '--t', '--a', '--b', '--c', '--f'].forEach((p) => c.style.removeProperty(p));
          stages[i].classList.remove('is-asleep');
          last[i] = {};
        }
      });
      measure();
      update();
    }

    // Keyboard focus landing inside a chapter (e.g. the trailer button in the climax): show that chapter resolved.
    chapters.forEach((c, i) => c.addEventListener('focusin', () => {
      if (!pinned) return;
      const lo = tops[i] + KF[i].c[1] * vh;
      const hi = i < n - 1 ? tops[i + 1] - 1 : tops[i] + (KF[i].peak + 0.04) * vh;
      if (scrollY < lo || scrollY > hi) window.scrollTo({ top: tops[i] + KF[i].peak * vh, behavior: 'auto' });
    }));
    chaptersCtl = { refresh: request };

    addEventListener('scroll', request, { passive: true });
    let rt = 0;
    addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { measure(); update(); }, 80); });
    pinMQ.addEventListener('change', setMode);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measure(); update(); });
    addEventListener('load', () => { measure(); update(); });
    setMode();
  }

  /* ---------------- Three Battlefields ----------------
     One spliced reel (Dunes pull-back → Snowmelt → Tropics). It is fetched a screen
     early and only starts once the band is 40% in view, so the pull-back is seen from
     its first frame. The gold map name and the tabs follow video.currentTime; a tab
     seeks to its map. (As a data-clip it still pauses for the trailer modal.)
     Reduced motion: nothing plays, so the tabs swap between three stills. */
  function setupFields() {
    const sec = $('[data-fields]');
    if (!sec) return;
    const v = $('video[data-fields-video]', sec);
    const names = $$('[data-map-name]', sec);
    const tabs = $$('[data-map-tab]', sec);
    const starts = tabs.map((b) => +b.dataset.t);
    const XFADE = 0.5; // the reel's crossfades; a tab lands just after its map has faded in
    let cur = -1;
    let raf = 0;

    const segAt = (t) => { let i = 0; starts.forEach((s, k) => { if (t >= s) i = k; }); return i; };
    function show(i) {
      if (i === cur) return;
      if (cur >= 0) tabs[cur].style.removeProperty('--p');
      cur = i;
      names.forEach((n, k) => n.classList.toggle('is-on', k === i));
      tabs.forEach((b, k) => {
        b.classList.toggle('is-on', k === i);
        b.setAttribute('aria-pressed', String(k === i));
      });
    }

    if (reduced) {
      sec.classList.add('is-still');
      const still = (i) => { v.dataset.poster = tabs[i].dataset.still; if (v.getAttribute('poster')) v.poster = v.dataset.poster; };
      still(0); // the whole Dunes map, not the opening close-up
      tabs.forEach((b, i) => b.addEventListener('click', () => { show(i); still(i); }));
      show(0);
      return;
    }

    const sync = () => {
      const t = v.currentTime;
      const dur = v.duration || 16.4;
      const i = segAt(t);
      show(i);
      const end = i < starts.length - 1 ? starts[i + 1] : dur;
      tabs[i].style.setProperty('--p', clamp((t - starts[i]) / (end - starts[i]), 0, 1).toFixed(3));
    };
    new IntersectionObserver(([e]) => { if (e.isIntersecting) warm(v); }, { rootMargin: '0px 0px 100% 0px' }).observe(v);
    new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) want(v, false);
      else if (e.intersectionRatio >= 0.4) want(v, true);
    }, { threshold: [0, 0.4] }).observe(v);

    const loop = () => { sync(); raf = v.paused ? 0 : requestAnimationFrame(loop); };
    v.addEventListener('play', () => { if (!raf) raf = requestAnimationFrame(loop); });
    v.addEventListener('pause', () => { cancelAnimationFrame(raf); raf = 0; sync(); });
    v.addEventListener('seeked', sync);

    // A server without byte-range support (e.g. a bare local static server) makes the file
    // unseekable; then the reel is loaded once as a blob, which always seeks.
    let blob = null;
    const canSeek = (t) => { const s = v.seekable; for (let k = 0; k < s.length; k++) if (t >= s.start(k) && t <= s.end(k) + 0.05) return true; return false; };
    function seekTo(t) {
      if (v.readyState < 1) { v.addEventListener('loadedmetadata', () => seekTo(t), { once: true }); want(v, true); return; }
      if (canSeek(t) || t === 0) { try { v.currentTime = t; } catch (_) { /* ignore */ } sync(); return; }
      if (!blob) {
        blob = fetch(v.currentSrc || v.dataset.src).then((r) => (r.ok ? r.blob() : Promise.reject())).then((b) => new Promise((res) => {
          v.addEventListener('loadedmetadata', res, { once: true });
          v.src = URL.createObjectURL(b);
        })).catch(() => {});
      }
      blob.then(() => {
        if (canSeek(t)) v.currentTime = t;
        const r = v.getBoundingClientRect();
        if (r.bottom > 0 && r.top < innerHeight) want(v, true); // the src swap paused it
        sync();
      });
    }

    tabs.forEach((b, i) => b.addEventListener('click', () => {
      show(i);
      seekTo(i === 0 ? 0 : starts[i] + XFADE);
    }));
    show(0);
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
    let prime = $$('[data-prime], video[data-poster]');
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
  setupChapters();
  setupClips();
  setupFields();
  setupField();
  setupReveal();
  setupNumbers();
  setupGallery();
  setupFlow();
  setupModal();
})();
