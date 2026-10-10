/* Atlas Conquest — "Trailer Cut" homepage concept
   Plain JS, no dependencies. */

/* =========================================================================
   CONFIG — every outbound link lives here. Change a value, reload, done.
   ========================================================================= */
const CONFIG = {
  primaryCta: 'discord',     // 'discord' = Join the Beta leads everywhere. Flip to 'steam' (with the URL below) when the store page is live.
  steam: '',                 // Steam store URL. Empty = store page not live yet → "Coming soon" state.
  discord: 'https://discord.gg/7QaEY4yJH5',
  youtubeTrailerId: '',      // YouTube video id. Empty = play the local trailer.mp4 in the modal.
  x: 'https://x.com/Atlas_Conquest',
  instagram: 'https://www.instagram.com/atlasconquest/',
  tiktok: 'https://www.tiktok.com/@atlas.conquest',
  press: '../../../press.html',
};

(() => {
  'use strict';

  const TRAILER_SRC = '../../../assets/media/video/trailer.mp4';
  const TRAILER_POSTER = '../../../assets/media/stills/t62_5.webp';
  const METADATA_URL = '../../../data/metadata.json';
  const FALLBACK = { matches: 5229, players: 240 };

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

  /* ---------------- Links ---------------- */
  function applyLinks() {
    $$('[data-link]').forEach((a) => {
      const url = CONFIG[a.dataset.link];
      if (url) a.href = url;
      else (a.closest('li') || a).hidden = true;
    });
  }

  /* ---------------- Toast ---------------- */
  let toastTimer = 0;
  const toast = $('[data-toast]');
  const toastBody = $('[data-toast-body]');
  function hideToast() { toast.classList.remove('is-shown'); }
  function showToast(html) {
    toastBody.innerHTML = html;
    toast.classList.add('is-shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 12000);
  }
  $('[data-toast-close]').addEventListener('click', hideToast);
  toast.addEventListener('mouseenter', () => clearTimeout(toastTimer));
  toast.addEventListener('focusin', () => clearTimeout(toastTimer));
  toast.addEventListener('mouseleave', () => { toastTimer = setTimeout(hideToast, 5000); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && toast.classList.contains('is-shown') && !modalOpen) hideToast(); });

  /* ---------------- Steam buttons ----------------
     Store page live  → every [data-steam] becomes a real link, and the nav CTA becomes "Wishlist".
     Not live yet     → buttons stay visually primary but explain + hand off to the Discord beta. */
  function setupSteam() {
    const live = !!CONFIG.steam;
    root.classList.toggle('steam-live', live);
    // Which call to action leads. Markup marked data-primary-only="discord|steam" is shown only for that mode
    // (CSS defaults to Discord-first, so the page is right without JS too).
    root.classList.toggle('primary-steam', CONFIG.primaryCta === 'steam' && live);
    $$('[data-live-only]').forEach((el) => { el.hidden = !live; });
    $$('[data-steam]').forEach((btn) => {
      if (live) {
        const a = document.createElement('a');
        a.className = btn.className;
        if (btn.dataset.primaryOnly) a.dataset.primaryOnly = btn.dataset.primaryOnly;
        a.href = CONFIG.steam;
        a.target = '_blank';
        a.rel = 'noopener';
        a.innerHTML = btn.innerHTML;
        a.querySelectorAll('[data-soon]').forEach((c) => c.remove());
        btn.replaceWith(a);
      } else {
        btn.addEventListener('click', () => {
          showToast(
            '<strong>Steam page coming soon</strong>' +
            '<p>Our store page isn’t live yet. The public beta runs through our Discord: join to get in early and hear the moment wishlists open.</p>' +
            '<a class="btn btn--discord btn--block" href="' + CONFIG.discord + '" target="_blank" rel="noopener">' +
            '<svg class="icon" aria-hidden="true"><use href="#i-discord"/></svg><span class="btn__label">Join the Discord</span></a>'
          );
        });
      }
    });
    if (live) { const n = document.getElementById('steam-soon-note'); if (n) n.remove(); }
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
    $$('a[href^="#"]:not([data-rail-link])').forEach((a) => {
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
        const o = $('video[data-oneshot]');
        if (o && o.getAttribute('src') && !o.ended) safePlay(o);
      },
    };

    // The numbers backdrop: one slow pull-back over the field of cards, then hold.
    const one = $('video[data-oneshot]');
    if (one) {
      const io2 = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) return;
        io2.disconnect();
        one.src = one.dataset.src;
        one.preload = 'auto';
        one.addEventListener('playing', () => { one.playbackRate = 0.5; }, { once: true });
        safePlay(one);
      }, { threshold: 0.25 });
      io2.observe(one.closest('section'));
    }
  }

  /* ---------------- Chapters: the pinned "deck" ----------------
     Each chapter is a 100vh sticky stage. Chapter N+1's block overlaps N's by
     125vh, so N+1 pins exactly one screen after N and fades in over it *in place*:
     the gold title card dissolves in, then the real <h2> shrinks into its slot
     while the clip opens like a shutter and the copy settles.
     u = how many viewport-heights the reader has scrolled since the stage pinned. */
  function setupChapters() {
    const section = $('#chapters');
    if (!section) return;
    const chapters = $$('[data-chapter]', section);
    const n = chapters.length;
    const stages = chapters.map((c) => $('.chapter__stage', c));
    const heads = chapters.map((c) => $('[data-head]', c));
    const videos = chapters.map((c) => $('video[data-clip]', c));
    const rail = $('[data-rail]');
    const railLinks = $$('[data-rail-link]', rail);
    const pinMQ = matchMedia('(min-width: 1000px) and (min-height: 640px)');

    const KF = chapters.map((c, i) => {
      // v: dip the previous chapter to black · t: title card fades up · a: title → slot · b: shutter · c: copy
      if (i === 0) return { v: null, t: null, a: [0.02, 0.28], b: [0.1, 0.36], c: [0.24, 0.46], peak: 0.62 };
      if (c.classList.contains('chapter--climax')) return { v: [0, 0.08], t: [0.04, 0.14], a: [0.24, 0.42], b: [0.13, 0.33], c: [0.33, 0.46], peak: 0.49 };
      return { v: [0, 0.08], t: [0.05, 0.16], a: [0.22, 0.46], b: [0.3, 0.54], c: [0.42, 0.62], peak: 0.76 };
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
        const s = clamp(Math.min(2.2, (sr.width * 0.84) / hr.width, (sr.height * 0.42) / hr.height), 1, 2.2);
        c.style.setProperty('--dy', (sr.height * 0.47 - cy).toFixed(1));
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
        if (i === 0 ? top < vh * 0.5 : u >= 0.07) active = i;
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
          const onScreen = st.v > 0.01 && r.bottom > 1 && r.top < vh - 1 && !covered;
          want(videos[i], onScreen);
          if (!onScreen && y > 0 && r.top < vh * 1.5 && r.bottom > -vh) warm(videos[i]);
        });
      }

      railLinks.forEach((l, i) => {
        l.classList.toggle('is-active', i === active);
        l.classList.toggle('is-done', active > -1 && i < active);
        if (i === active) l.setAttribute('aria-current', 'step'); else l.removeAttribute('aria-current');
      });
      // Scrubber fill: marker k is reached as chapter k's title card settles.
      const m = tops.map((t, i) => t + (i === 0 ? 0.1 : 0.2) * vh);
      let P = 0;
      if (y >= m[n - 1]) P = 1;
      else for (let k = 0; k < n - 1; k++) if (y >= m[k] && y < m[k + 1]) P = (k + (y - m[k]) / (m[k + 1] - m[k])) / (n - 1);
      rail.style.setProperty('--rail', P.toFixed(4));
      root.classList.toggle('in-chapters', y >= tops[0] - vh * 0.35 && y < tops[n - 1] + vh * (pinned ? 0.62 : 0.6));
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

    railLinks.forEach((l) => {
      l.addEventListener('click', (e) => {
        e.preventDefault();
        const i = +l.dataset.railLink;
        measure();
        scrollToY(pinned ? tops[i] + KF[i].peak * vh : tops[i]);
        const h = $('h2', chapters[i]);
        if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
      });
    });

    // Keyboard focus landing inside a chapter (e.g. the trailer button in V): show that chapter resolved.
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

  /* ---------------- Chapter IV: beats in sync with the clip's captions ---------------- */
  function setupBeats() {
    const list = $('[data-beats]');
    const v = $('[data-beats-video]');
    if (!list || !v) return;
    const items = $$('.beat', list);
    list.classList.add('beats--static'); // until the clip actually plays (and forever with reduced motion)
    if (reduced) return;
    let raf = 0;
    const tick = () => {
      const t = v.currentTime;
      const dur = v.duration || 6.2;
      items.forEach((li) => {
        const a = +li.dataset.from;
        const b = Math.min(+li.dataset.to, dur);
        const on = t >= a && t < b;
        li.classList.toggle('is-on', on);
        li.style.setProperty('--p', (on ? (t - a) / (b - a) : t >= b ? 1 : 0).toFixed(3));
      });
      raf = v.paused ? 0 : requestAnimationFrame(tick);
    };
    v.addEventListener('playing', () => { list.classList.remove('beats--static'); if (!raf) raf = requestAnimationFrame(tick); });
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

  /* ---------------- Live stats + count-up ---------------- */
  async function loadStats() {
    const out = { matches: FALLBACK.matches, players: FALLBACK.players, updated: null };
    try {
      const res = await fetch(METADATA_URL, { cache: 'no-cache' });
      if (res.ok) {
        const json = await res.json();
        const all = ((json && json.data) || json || {}).all;
        const a = all && all.all;
        if (a) {
          if (a.total_matches) out.matches = a.total_matches;
          if (a.total_players) out.players = a.total_players;
          if (a.last_updated) out.updated = a.last_updated;
        }
      }
    } catch (_) { /* keep the fallback */ }
    return out;
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
    const ready = loadStats().then((s) => {
      liveEl.dataset.count = String(s.matches);
      srOf(liveEl).textContent = fmt(s.matches);
      $$('[data-live-players]').forEach((n) => { n.textContent = fmt(s.players); });
      // Headline rounds *down* to the thousand ("5,000+") so it never over-claims.
      if (s.matches >= 1000) $$('[data-live-round]').forEach((n) => { n.textContent = fmt(Math.floor(s.matches / 1000) * 1000); });
      if (s.updated) {
        const d = new Date(s.updated);
        if (!isNaN(d)) {
          $$('[data-live-updated]').forEach((n) => {
            n.textContent = 'updated ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          });
        }
      }
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

  /* ---------------- Finale card ring ----------------
     Sixteen two-sided cards on a slightly tilted ring: the far side shows card
     backs passing behind, faces darken as they turn away, the edges dissolve. */
  function setupRing() {
    const stage = $('[data-ring]');
    if (!stage || reduced) return; // reduced motion keeps the static fan
    const ring = $('[data-ring-inner]', stage);
    const items = $$('.ring__item', ring);
    const toggle = $('[data-ring-toggle]');
    const tLabel = $('[data-ring-toggle-label]');
    const n = items.length;
    const step = 360 / n;
    const TILT = -8;
    let R = 0;
    ring.classList.add('is-3d');
    stage.classList.add('is-3d');
    toggle.hidden = false;

    const layout = () => {
      const cw = ring.offsetWidth;
      R = Math.round(((cw / 2) / Math.tan(Math.PI / n)) * 1.16); // a little air between cards
      items.forEach((it, i) => { it.style.transform = 'rotateY(' + (i * step) + 'deg) translateZ(' + R + 'px)'; });
      // Fade the ring's own flanks (where cards turn edge-on), not the viewport's.
      const P = parseFloat(getComputedStyle(stage).perspective) || 1500;
      const th = 1.18; // ~67.5°: the widest point on screen
      const half = (R * Math.sin(th) * P) / (P + R * (1 - Math.cos(th))) + cw * 0.42;
      stage.style.setProperty('--ring-half', Math.round(half) + 'px');
    };

    const BASE = -7; // deg per second
    let angle = 0; let vel = BASE; let hover = false; let paused = false; let dragging = false;
    let last = 0; let raf = 0;
    function frame(t) {
      const dt = Math.min(0.05, last ? (t - last) / 1000 : 0);
      last = t;
      const target = paused || hover ? 0 : BASE;
      if (!dragging) {
        vel += (target - vel) * Math.min(1, dt * 2.2);
        angle += vel * dt;
      }
      ring.style.transform = 'translateZ(' + (-R) + 'px) rotateX(' + TILT + 'deg) rotateY(' + angle.toFixed(3) + 'deg)';
      for (let i = 0; i < n; i++) {
        const facing = Math.cos(((i * step + angle) * Math.PI) / 180);
        items[i].style.setProperty('--shade', (facing > 0 ? (1 - facing) * 0.82 : 0.82).toFixed(3));
      }
      raf = requestAnimationFrame(frame);
    }
    const start = () => { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };
    new IntersectionObserver(([e]) => { if (e.isIntersecting) start(); else stop(); }).observe(stage);

    stage.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') hover = true; });
    stage.addEventListener('pointerleave', () => { hover = false; });

    let sx = 0; let sa = 0; let lx = 0; let lt = 0;
    stage.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      dragging = true; sx = lx = e.clientX; sa = angle; lt = performance.now();
      stage.classList.add('is-dragging');
      try { stage.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    });
    stage.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      angle = sa + (e.clientX - sx) * 0.2;
      const now = performance.now();
      vel = clamp(((e.clientX - lx) * 0.2) / Math.max(0.016, (now - lt) / 1000), -140, 140);
      lx = e.clientX; lt = now;
    });
    const end = () => { if (!dragging) return; dragging = false; stage.classList.remove('is-dragging'); };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);

    toggle.addEventListener('click', () => {
      paused = !paused;
      toggle.setAttribute('aria-pressed', String(paused));
      tLabel.textContent = paused ? 'Play cards' : 'Pause cards';
    });

    layout();
    addEventListener('resize', layout);
  }

  /* ---------------- Trailer modal ---------------- */
  function setupModal() {
    const dlg = $('[data-modal]');
    const frame = $('[data-modal-frame]');
    const closeBtn = $('[data-modal-close]');
    if (!dlg || typeof dlg.showModal !== 'function') {
      // Very old browsers: just open the file.
      $$('[data-trailer]').forEach((b) => b.addEventListener('click', () => {
        const t = Math.floor(+b.dataset.t || 0);
        window.open(CONFIG.youtubeTrailerId ? 'https://www.youtube.com/watch?v=' + CONFIG.youtubeTrailerId + (t ? '&t=' + t + 's' : '') : TRAILER_SRC + (t ? '#t=' + t : ''), '_blank', 'noopener');
      }));
      return;
    }
    let opener = null;

    function open(e) {
      opener = e.currentTarget;
      const t = Math.max(0, Math.floor(+opener.dataset.t || 0)); // chapter buttons jump to their beat
      frame.textContent = '';
      if (CONFIG.youtubeTrailerId) {
        const f = document.createElement('iframe');
        f.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(CONFIG.youtubeTrailerId) + '?autoplay=1&rel=0&modestbranding=1' + (t ? '&start=' + t : '');
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
        v.src = TRAILER_SRC + (t ? '#t=' + t : '');
        // Belt and braces for servers/browsers that ignore the media fragment.
        if (t) v.addEventListener('loadedmetadata', () => { if (v.currentTime < t - 0.5) v.currentTime = t; }, { once: true });
        frame.appendChild(v);
      }
      modalOpen = true;
      if (heroCtl) heroCtl.update();
      $$('video[data-clip], video[data-oneshot]').forEach((c) => { if (!c.paused) c.pause(); });
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
  setupSteam();
  setupNav();
  setupAnchors();
  setupHero();
  setupEmbers();
  setupChapters();
  setupClips();
  setupBeats();
  setupReveal();
  setupNumbers();
  setupGallery();
  setupRing();
  setupModal();
})();
