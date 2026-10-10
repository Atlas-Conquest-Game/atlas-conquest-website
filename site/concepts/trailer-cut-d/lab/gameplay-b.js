/* Gameplay · option B — "Four beats, one stage".
   A beat selector (ARIA tabs) drives one 16:9 stage. Nothing plays until someone asks:
   picking a beat, pressing play on the stage or swiping it (touch) loops that beat's clip,
   muted, at normal speed. The stage pauses when it leaves the screen, the tab is hidden or a
   dialog opens; it never starts again on scroll. Expand opens the four clips in the shared
   viewer (main.js) via hidden [data-view] proxies, and the stage follows whichever clip the
   viewer was on when it closes. Reduced motion: posters only. */
(() => {
  'use strict';

  const body = document.querySelector('[data-gpb]');
  if (!body) return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const narrow = matchMedia('(max-width: 1199px)');
  const conn = navigator.connection;
  const lean = !!(conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '')));

  const $ = (s, el = body) => el.querySelector(s);
  const $$ = (s, el = body) => Array.from(el.querySelectorAll(s));
  const safePlay = (v) => { try { const p = v.play(); if (p && p.catch) p.catch(() => {}); } catch (_) { /* ignore */ } };

  const list = $('[data-gpb-tabs]');
  const tabs = $$('[role="tab"]', list);
  const stage = $('[data-gpb-stage]');
  const poster = $('[data-gpb-poster]');
  const toggle = $('[data-gpb-toggle]');
  const expand = $('[data-gpb-expand]');
  const caps = $$('[data-gpb-cap]');
  const views = $$('[data-gpb-view]');
  const viewer = document.querySelector('[data-viewer]');
  const modal = document.querySelector('[data-modal]');
  const n = tabs.length;

  const beats = tabs.map((t) => ({
    clip: t.dataset.gpbClip,
    posterSm: t.dataset.gpbPosterSm,
    posterLg: t.dataset.gpbClip + '-poster.webp',
    alt: t.dataset.gpbAlt || '',
    title: ($('.gpb__title', t) || t).textContent.trim(),
  }));

  let cur = 0;
  let state = 'idle';          // idle | loading | playing | paused
  let video = null;
  let token = 0;
  let inView = false;
  let resumeAfterDialog = false;
  let resumeOnVisible = false;
  let openedViewer = false;
  let swallowClick = false;

  // the 1080p encode only where the stage is big on a dense screen
  const hiRes = (w) => !lean && w * (window.devicePixelRatio || 1) > 1500;
  const clipSrc = (i, w) => beats[i].clip + (hiRes(w) ? '-1920.mp4' : '-1280.mp4');
  const isOn = () => state === 'playing' || state === 'loading';

  function setState(s) {
    state = s;
    stage.dataset.state = s;
    toggle.setAttribute('aria-label', (isOn() ? 'Pause clip: ' : 'Play clip: ') + beats[cur].title);
  }

  function ensureVideo() {
    if (video) return video;
    const v = document.createElement('video');
    v.className = 'gpb__video';
    v.muted = true; v.defaultMuted = true; v.playsInline = true; v.loop = true;
    v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('loop', '');
    v.setAttribute('aria-hidden', 'true');
    v.disablePictureInPicture = true;
    v.preload = 'auto';
    v.addEventListener('playing', () => {
      if (!isOn()) { v.pause(); return; }
      stage.classList.add('is-live');
      setState('playing');
    });
    v.addEventListener('error', () => {
      if (!v.getAttribute('src')) return;
      stage.classList.remove('is-live');
      setState('idle');
    });
    poster.after(v);
    video = v;
    return v;
  }

  function play() {
    if (reduced) return;
    const v = ensureVideo();
    if (v.dataset.beat !== String(cur)) {
      v.dataset.beat = String(cur);
      v.src = clipSrc(cur, stage.clientWidth);
    }
    if (!v.paused && stage.classList.contains('is-live')) { setState('playing'); return; }
    setState('loading');
    safePlay(v);
  }

  function pause() {
    if (video) video.pause();
    if (isOn()) setState('paused');
  }

  function select(i, opts) {
    const wantPlay = !!(opts && opts.play) && !reduced;
    i = ((i % n) + n) % n;
    if (i === cur) { if (wantPlay) play(); return; }
    cur = i;
    const b = beats[i];
    tabs.forEach((t, k) => {
      const on = k === i;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    stage.setAttribute('aria-labelledby', tabs[i].id);
    caps.forEach((c, k) => c.classList.toggle('is-on', k === i));
    expand.setAttribute('aria-label', 'Expand clip: ' + b.title);

    // the new still goes underneath at once; the old clip fades off it
    poster.srcset = b.posterSm + ' 640w, ' + b.posterLg + ' 1280w';
    poster.src = b.posterSm;
    poster.alt = b.alt;

    const tk = ++token;
    stage.classList.remove('is-live');
    setState(wantPlay ? 'loading' : 'idle');
    if (!video) { if (wantPlay) play(); return; }
    video.pause();
    setTimeout(() => {
      if (tk !== token) return;
      // a second click / Enter in the meantime may already have loaded the new beat: keep it
      if (video.dataset.beat !== String(cur)) {
        video.removeAttribute('src');
        video.dataset.beat = '';
        try { video.load(); } catch (_) { /* ignore */ }
      }
      if (wantPlay && state === 'loading') play();
    }, 260);
  }

  /* ---- the selector: click, and arrow keys / Home / End (roving tabindex) ---- */
  tabs.forEach((t, k) => t.addEventListener('click', () => select(k, { play: true })));
  list.addEventListener('keydown', (e) => {
    const k = tabs.indexOf(document.activeElement);
    if (k < 0) return;
    let to = null;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') to = k + 1;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') to = k - 1;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = n - 1;
    if (to === null) return;
    e.preventDefault();
    to = ((to % n) + n) % n;
    tabs[to].focus();
    select(to, { play: true });
  });
  const orient = () => list.setAttribute('aria-orientation', narrow.matches ? 'horizontal' : 'vertical');
  orient();
  if (narrow.addEventListener) narrow.addEventListener('change', orient);

  /* ---- the stage: tap / click / Enter toggles; a sideways swipe (touch) steps beats ---- */
  toggle.addEventListener('click', () => {
    if (swallowClick) { swallowClick = false; return; }
    if (isOn()) pause(); else play();
  });
  let sx = null, sy = 0;
  stage.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') return; sx = e.clientX; sy = e.clientY; });
  stage.addEventListener('pointercancel', () => { sx = null; });
  stage.addEventListener('pointerup', (e) => {
    if (sx === null) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    sx = null;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    swallowClick = true;
    setTimeout(() => { swallowClick = false; }, 450);
    select(cur + (dx < 0 ? 1 : -1), { play: true });
  });

  /* ---- expand: open the shared viewer on this beat, with all four as a group ---- */
  expand.addEventListener('click', () => {
    const w = Math.min(1240, window.innerWidth - 32);
    views.forEach((v, k) => { v.dataset.viewVideo = clipSrc(k, w); });
    openedViewer = true;
    views[cur].click(); // main.js's delegated [data-view] handler opens the dialog
  });

  /* ---- one thing at a time: pause for the viewer / trailer, pick up again after ---- */
  const onDialog = () => {
    const open = (viewer && viewer.open) || (modal && modal.open);
    if (open && isOn()) { resumeAfterDialog = true; pause(); }
  };
  if ('MutationObserver' in window) {
    const mo = new MutationObserver(onDialog);
    [viewer, modal].forEach((d) => d && mo.observe(d, { attributes: true, attributeFilter: ['open'] }));
  }
  if (viewer) viewer.addEventListener('close', () => {
    let k = cur;
    if (openedViewer) {
      openedViewer = false;
      const m = /(\d+)\s*\/\s*(\d+)/.exec((viewer.querySelector('[data-viewer-count]') || {}).textContent || '');
      if (m && +m[2] === n) k = +m[1] - 1;
      expand.focus({ preventScroll: true });
    }
    const resume = resumeAfterDialog && inView;
    resumeAfterDialog = false;
    if (k !== cur) select(k, { play: resume });
    else if (resume) play();
  });
  if (modal) modal.addEventListener('close', () => {
    const resume = resumeAfterDialog && inView;
    resumeAfterDialog = false;
    if (resume) play();
  });

  /* ---- off screen or hidden tab: pause (scrolling back never restarts it) ---- */
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => {
      inView = e.isIntersecting;
      if (!inView && isOn()) pause();
    }, { threshold: 0 }).observe(stage);

    // warm the other three stills once the section is close, so a switch never shows a gap
    const warm = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      warm.disconnect();
      const w = stage.clientWidth * (window.devicePixelRatio || 1);
      beats.forEach((b, k) => { if (k) { const im = new Image(); im.decoding = 'async'; im.src = w > 700 ? b.posterLg : b.posterSm; } });
    }, { rootMargin: '0px 0px 400px 0px' });
    warm.observe(body);
  } else {
    inView = true;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (isOn()) { resumeOnVisible = true; pause(); } }
    else if (resumeOnVisible) { resumeOnVisible = false; if (inView && !(viewer && viewer.open)) play(); }
  });

  setState('idle');
})();
