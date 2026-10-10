/* Atlas Conquest — "Trailer Cut" homepage concept, Variant C: "Sun Forge"
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
  let deckPinned = false; // true while the filmstrip is pinned (it decides which beat clip plays)
  let reelCtl = null;
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
     When the filmstrip is pinned, setupReel decides which beat clip runs instead,
     because every clip in the strip counts as "intersecting" while it is pinned. */
  function setupClips() {
    if (reduced) return; // posters only
    const io = new IntersectionObserver((entries) => {
      entries.forEach(({ target: v, isIntersecting }) => {
        if (deckPinned && v.closest('[data-beat]')) return;
        want(v, isIntersecting);
      });
    }, { rootMargin: '120px 0px', threshold: 0.01 });
    $$('video[data-clip]').forEach((v) => io.observe(v));
    clipsCtl = {
      resume() { // after the trailer modal closes, restart whatever is on screen
        $$('video[data-clip]').forEach((v) => {
          if (deckPinned && v.closest('[data-beat]')) return;
          const r = v.getBoundingClientRect();
          if (r.bottom > -120 && r.top < innerHeight + 120) want(v, true);
        });
      },
    };
  }

  /* ---------------- The five beats: a filmstrip ----------------
     Wide screens: the section is 460vh tall with a sticky 100vh stage. Scrolling
     down slides the row of clips sideways; the travel between two clips is eased so
     each one rests in the centre for a while (and plays) before the next slides in.
     The drawn position follows the scroll with a little inertia. Neighbours dim via --d. */
  function setupReel() {
    const sec = $('[data-reel]');
    if (!sec) return;
    const track = $('[data-reel-track]', sec);
    const beats = $$('[data-beat]', sec);
    const vids = beats.map((b) => $('video[data-clip]', b));
    const segs = $$('[data-reel-bar] i', sec);
    const n = beats.length;
    const pinMQ = matchMedia('(min-width: 1000px) and (min-height: 600px)');
    const HOLD = 0.22; // share of each scroll step spent resting on a clip, at either end of the step
    const LEAD = 0.3;  // extra rest on the first and last clip, in steps
    let pinned = false;
    let top = 0;
    let travel = 1;
    let pitch = 0;
    let vh = innerHeight;
    let pos = 0;
    let raf = 0;
    let active = -1;
    const lastD = beats.map(() => -1);

    function measure() {
      vh = innerHeight;
      top = sec.getBoundingClientRect().top + scrollY;
      travel = Math.max(1, sec.offsetHeight - vh);
      pitch = n > 1 ? beats[1].offsetLeft - beats[0].offsetLeft : 0;
    }
    function target() {
      const p = clamp((scrollY - top) / travel, 0, 1);
      const u = clamp(p * (n - 1 + 2 * LEAD) - LEAD, 0, n - 1);
      const i = Math.min(n - 2, Math.floor(u));
      return i + smooth(HOLD, 1 - HOLD, u - i);
    }
    function render() {
      track.style.transform = 'translate3d(' + (-pos * pitch).toFixed(1) + 'px,0,0)';
      beats.forEach((b, i) => {
        const d = Math.round(Math.min(1, Math.abs(i - pos)) * 1000) / 1000;
        if (d !== lastD[i]) { lastD[i] = d; b.style.setProperty('--d', String(d)); }
      });
      const now = Math.round(pos);
      if (now !== active) {
        active = now;
        beats.forEach((b, i) => b.classList.toggle('is-active', i === active));
      }
      segs.forEach((s, i) => {
        s.style.setProperty('--p', clamp(pos - i + 1, 0, 1).toFixed(3));
        s.classList.toggle('is-on', i === active);
      });
      // Only the centred clip plays, and only while the strip is on screen.
      const r = sec.getBoundingClientRect();
      const live = r.top < vh * 0.6 && r.bottom > vh * 0.4;
      vids.forEach((v, i) => {
        want(v, live && i === active);
        if (r.top < vh * 1.6 && r.bottom > 0 && Math.abs(i - pos) < 1.5) warm(v);
      });
    }
    function tick() {
      raf = 0;
      if (!pinned) return;
      const t = target();
      pos += (t - pos) * 0.18;
      if (Math.abs(t - pos) < 0.0008) pos = t;
      render();
      if (pos !== t) raf = requestAnimationFrame(tick);
    }
    const request = () => { if (pinned && !raf) raf = requestAnimationFrame(tick); };

    function setMode() {
      pinned = pinMQ.matches && !reduced;
      deckPinned = pinned;
      root.classList.toggle('js-pin', pinned);
      if (!pinned) {
        track.style.transform = '';
        beats.forEach((b, i) => { b.style.removeProperty('--d'); b.classList.remove('is-active'); lastD[i] = -1; });
        active = -1;
        return;
      }
      measure();
      pos = target();
      render();
    }

    // Click a dimmed neighbour to bring it to the centre.
    beats.forEach((b, i) => b.addEventListener('click', () => {
      if (!pinned || i === active) return;
      scrollToY(top + ((i + LEAD) / (n - 1 + 2 * LEAD)) * travel);
    }));

    reelCtl = { refresh() { if (pinned) render(); } };
    addEventListener('scroll', request, { passive: true });
    let rt = 0;
    addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (pinned) { measure(); pos = target(); render(); } }, 80); });
    pinMQ.addEventListener('change', setMode);
    addEventListener('load', () => { if (pinned) { measure(); request(); } });
    setMode();
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

  /* ---------------- Finale: the sun forge ----------------
     Borrowed from the Molten Sun concept: a churning soft-light surface on the sun
     disc, rings of light running out along a hex lattice centred on the sun, and
     embers lifting off it. The sun climbs into place as the section scrolls in.
     All of it stops while the section is off screen or the tab is hidden. */
  function setupForge() {
    const sec = $('[data-forge]');
    if (!sec) return;
    const forge = $('.forge', sec);
    const sun = $('[data-sun]', sec);
    const glow = $('[data-forge-glow]', sec);
    const pattern = $('#forge-hex');
    const pulseC = $('[data-forge-pulse]', sec);
    const emberC = $('[data-forge-embers]', sec);
    const churnC = $('.sun-churn', sec);
    if (!forge || !sun) return;
    const DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    const geo = { w: 0, h: 0, E: 0, sx: 0, sy: 0, r: 0, hex: 92, segs: [], rMax: 1, ew: 0, eh: 0, ex: 0, ey: 0 };
    let lift = 0; // current scroll-linked offset of the sun, px

    function buildSegments() { // hex edges, anchored so a hex centre sits on the sun centre (matches the SVG pattern)
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
          const v = [[cx, cy - s], [cx + w / 2, cy - s / 2], [cx + w / 2, cy + s / 2], [cx, cy + s]];
          for (let k = 0; k < 3; k++) {
            const [x1, y1] = v[k];
            const [x2, y2] = v[k + 1];
            segs.push({ x1, y1, x2, y2, d: Math.hypot((x1 + x2) / 2 - geo.sx, (y1 + y2) / 2 - geo.sy) });
          }
        }
      }
      geo.segs = segs;
      geo.rMax = Math.max(Math.hypot(geo.sx, geo.sy), Math.hypot(geo.w - geo.sx, geo.sy),
        Math.hypot(geo.sx, geo.h - geo.sy), Math.hypot(geo.w - geo.sx, geo.h - geo.sy));
    }

    function measure() {
      geo.w = sec.clientWidth;
      geo.h = sec.clientHeight;
      geo.E = sun.offsetWidth;
      geo.sx = forge.offsetLeft + sun.offsetLeft + geo.E * 0.4993;
      geo.sy = forge.offsetTop + sun.offsetTop + geo.E * 0.5339;
      geo.r = geo.E * 0.4635;
      geo.hex = geo.w < 700 ? 64 : geo.w < 1100 ? 80 : 92;
      sec.style.setProperty('--sx', geo.sx.toFixed(1) + 'px');
      sec.style.setProperty('--sy', geo.sy.toFixed(1) + 'px');
      if (pattern) pattern.setAttribute('patternTransform', 'translate(' + geo.sx.toFixed(1) + ' ' + geo.sy.toFixed(1) + ') scale(' + (geo.hex / 96).toFixed(4) + ')');
      if (reduced) return;
      buildSegments();
      pulseC.width = Math.round(geo.w * DPR);
      pulseC.height = Math.round(geo.h * DPR);
      geo.ew = emberC.clientWidth;
      geo.eh = emberC.clientHeight;
      geo.ex = sun.offsetLeft - emberC.offsetLeft + geo.E * 0.4993; // sun centre in ember-canvas pixels
      geo.ey = sun.offsetTop - emberC.offsetTop + geo.E * 0.5339;
      emberC.width = Math.round(geo.ew * DPR);
      emberC.height = Math.round(geo.eh * DPR);
    }

    // The sun climbs as the section scrolls in (done by the time its top nears the top of the screen).
    function rise() {
      const r = sec.getBoundingClientRect();
      const vh = innerHeight;
      const k = clamp((vh - r.top) / (vh * 0.9), 0, 1);
      const e = smooth(0, 1, k);
      lift = (1 - e) * geo.E * 0.36;
      sun.style.transform = 'translate3d(0,' + lift.toFixed(1) + 'px,0) scale(' + (0.9 + 0.1 * e).toFixed(4) + ')';
      glow.style.opacity = (0.4 + 0.6 * e).toFixed(3);
    }

    measure();
    if (reduced) {
      addEventListener('resize', measure);
      return; // a still sun, at rest
    }

    // lattice pulse: rings of light travelling outward along the hex edges
    function drawPulse(t) {
      const ctx = pulseC.getContext('2d');
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, geo.w, geo.h);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      const PERIOD = 7.5;
      const band = Math.max(80, geo.hex * 1.2);
      for (let p = 0; p < 2; p++) {
        const prog = ((t / PERIOD) + p * 0.5) % 1;
        const rr = geo.r * 0.9 + prog * (geo.rMax - geo.r * 0.9 + band);
        const fade = Math.pow(1 - prog, 1.4);
        if (fade < 0.02) continue;
        const buckets = [[], [], [], [], []];
        for (const sg of geo.segs) {
          const dd = Math.abs(sg.d - rr);
          if (dd > band || sg.d < geo.r * 0.95) continue;
          const a = 1 - dd / band;
          buckets[Math.min(4, Math.floor(a * a * 5))].push(sg);
        }
        buckets.forEach((list, bi) => {
          if (!list.length) return;
          ctx.strokeStyle = 'rgba(255, 196, 110, ' + (((bi + 1) / 5) * 0.7 * fade).toFixed(3) + ')';
          ctx.lineWidth = 1.2 + bi * 0.25;
          ctx.beginPath();
          for (const sg of list) { ctx.moveTo(sg.x1, sg.y1); ctx.lineTo(sg.x2, sg.y2); }
          ctx.stroke();
        });
      }
    }

    // embers lifting off the sun's upper rim
    function sprite(core, mid) {
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
    const sprites = [
      sprite('rgba(255,250,220,1)', 'rgba(255,210,58,.9)'),
      sprite('rgba(255,236,190,1)', 'rgba(255,154,31,.85)'),
      sprite('rgba(255,210,160,1)', 'rgba(240,90,26,.8)'),
    ];
    let embers = [];
    function spawn(initial) {
      const a = Math.PI + Math.random() * Math.PI; // the upper half of the rim
      const rr = geo.r * (0.8 + Math.random() * 0.35);
      const life = 4 + Math.random() * 6;
      return {
        x: geo.ex + Math.cos(a) * rr * 1.1,
        y: geo.ey + Math.sin(a) * rr * 0.75,
        vx: (Math.random() - 0.4) * 14,
        vy: -(14 + Math.random() * 40),
        life,
        age: initial ? Math.random() * life : 0,
        size: 0.7 + Math.random() * 1.8,
        sprite: sprites[(Math.random() * sprites.length) | 0],
        phase: Math.random() * Math.PI * 2,
        flick: 2 + Math.random() * 5,
      };
    }
    function seedEmbers() {
      const count = geo.w < 700 ? 22 : geo.w < 1100 ? 34 : 48;
      embers = Array.from({ length: count }, () => spawn(true));
    }
    function drawEmbers(t, dt) {
      const ctx = emberC.getContext('2d');
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, geo.ew, geo.eh);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < embers.length; i++) {
        const e = embers[i];
        e.age += dt;
        if (e.age > e.life || e.y < -20) { embers[i] = spawn(false); continue; }
        e.x += (e.vx + Math.sin(t * 0.9 + e.phase) * 10) * dt;
        e.y += e.vy * dt;
        const k = e.age / e.life;
        const env = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
        ctx.globalAlpha = Math.max(0, env * (0.65 + 0.35 * Math.sin(t * e.flick + e.phase)));
        const s = e.size * 9;
        ctx.drawImage(e.sprite, e.x - s / 2, e.y + lift - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
    }

    // churning sun surface: low-res animated value noise, upscaled and soft-light blended
    const CH = 104;
    const perm = new Uint8Array(512);
    (() => {
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
      const u = fade(x - xi); const v = fade(y - yi); const w = fade(z - zi);
      const X = xi & 255; const Y = yi & 255; const Z = zi & 255;
      const X1 = (X + 1) & 255; const Y1 = (Y + 1) & 255; const Z1 = (Z + 1) & 255;
      const h = (a, b, c) => perm[perm[perm[a] + b] + c] / 255;
      return lerp(
        lerp(lerp(h(X, Y, Z), h(X1, Y, Z), u), lerp(h(X, Y1, Z), h(X1, Y1, Z), u), v),
        lerp(lerp(h(X, Y, Z1), h(X1, Y, Z1), u), lerp(h(X, Y1, Z1), h(X1, Y1, Z1), u), v),
        w,
      );
    }
    churnC.width = CH;
    churnC.height = CH;
    const churnCtx = churnC.getContext('2d');
    const churnImg = churnCtx.createImageData(CH, CH);
    const churnPre = [];
    for (let py = 0; py < CH; py++) {
      for (let px = 0; px < CH; px++) {
        const x = ((px + 0.5) / CH) * 2 - 1;
        const y = ((py + 0.5) / CH) * 2 - 1;
        churnPre.push({ r: Math.hypot(x, y), a: Math.atan2(y, x) });
      }
    }
    function drawChurn(t) {
      const d = churnImg.data;
      const z = t * 0.11;
      for (let i = 0; i < churnPre.length; i++) {
        const { r, a } = churnPre[i];
        const o = i * 4;
        if (r > 1.02) { d[o + 3] = 0; continue; }
        const ang = a + t * 0.05 * (1.25 - r); // differential rotation: a slow swirl
        const x = Math.cos(ang) * r;
        const y = Math.sin(ang) * r;
        let nz = vnoise(x * 2.3 + 10, y * 2.3 + 10, z) * 0.65 + vnoise(x * 5.1 - 7, y * 5.1 + 3, z * 1.7) * 0.35;
        nz = Math.min(1, Math.max(0, (nz - 0.5) * 1.9 + 0.5));
        d[o] = 58 + nz * 197;
        d[o + 1] = 8 + nz * 232;
        d[o + 2] = nz * nz * 176;
        d[o + 3] = 255;
      }
      churnCtx.putImageData(churnImg, 0, 0);
    }

    // one loop, only while the finale is on screen
    let visible = false;
    let rafId = 0;
    let lastT = 0;
    let frame = 0;
    function loop(now) {
      rafId = 0;
      if (!visible || document.hidden) return;
      const t = now / 1000;
      const dt = Math.min(0.05, lastT ? t - lastT : 0.016);
      lastT = t;
      frame++;
      drawEmbers(t, dt);
      if (frame % 2 === 0) { drawPulse(t); drawChurn(t); }
      rafId = requestAnimationFrame(loop);
    }
    const start = () => { if (!rafId && visible && !document.hidden) { lastT = 0; rafId = requestAnimationFrame(loop); } };
    const stop = () => { if (rafId) cancelAnimationFrame(rafId); rafId = 0; };
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      sec.classList.toggle('is-offscreen', !visible);
      if (visible) start(); else stop();
    }, { rootMargin: '80px 0px' }).observe(sec);
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
    sec.classList.add('is-offscreen');

    let sraf = 0;
    addEventListener('scroll', () => {
      if (sraf) return;
      sraf = requestAnimationFrame(() => {
        sraf = 0;
        const r = sec.getBoundingClientRect();
        if (r.top < innerHeight + 40 && r.bottom > -40) rise();
      });
    }, { passive: true });
    let rt = 0;
    const refit = () => { measure(); seedEmbers(); rise(); };
    addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(refit, 150); });
    addEventListener('load', refit);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit);
    seedEmbers();
    rise();
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
      if (reelCtl) reelCtl.refresh();
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
  setupReel();
  setupClips();
  setupField();
  setupReveal();
  setupNumbers();
  setupGallery();
  setupFlow();
  setupForge();
  setupModal();
})();
