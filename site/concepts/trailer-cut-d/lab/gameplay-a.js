/* Gameplay · option A — "Media viewer" (Steam-store style).
   One stage + a rail of clips and screenshots (ARIA tabs, manual activation:
   arrow keys move focus, Enter / Space / click shows the item).
   Motion only on intent: a clip plays (muted, looping, normal speed) after
   someone picks it, pauses when it leaves the screen or a dialog opens, and
   never resumes by itself. The hero loop waits while a clip plays.
   Reduced motion: picking a clip shows its still; the play button still plays it.
   The expand button hands the current item to the shared viewer (main.js),
   with the whole rail as one data-view-group. */
(() => {
  'use strict';
  const root = document.querySelector('[data-gpa]');
  if (!root) return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, el = root) => el.querySelector(s);
  const stage = $('[data-gpa-stage]');
  const hit = $('[data-gpa-hit]');
  const expand = $('[data-gpa-expand]');
  const cap = $('[data-gpa-cap]');
  const rail = $('[data-gpa-rail]');
  const thumbs = Array.from(rail.querySelectorAll('[data-gpa-item]'));
  const viewer = document.querySelector('[data-viewer]');
  const heroVideo = document.querySelector('[data-hero-video]');
  if (!stage || !thumbs.length) return;

  // Two stacked stills so a new pick cross-fades in once it has decoded.
  const stills = [$('.gpa__still', stage)];
  const back = document.createElement('img');
  back.className = 'gpa__still';
  back.alt = '';
  back.setAttribute('aria-hidden', 'true');
  back.decoding = 'async';
  back.width = 1280; back.height = 720;
  stills[0].after(back);
  stills.push(back);
  let front = 0;

  let cur = 0;
  let video = null;
  let passThrough = false;   // let one synthetic thumb click reach main.js's viewer
  let viewerFromHere = false;
  let returnTo = null;
  let lastViewerCap = '';
  let swapToken = 0;

  const isClip = (t) => 'gpaVideo' in t.dataset;
  const capOf = (t) => t.dataset.viewCaption || '';
  const safePlay = (v) => {
    try { const p = v.play(); if (p && p.catch) p.catch(() => setPlaying(false)); } catch (_) { setPlaying(false); }
  };

  /* ---------- stage stills ---------- */
  function showStill(t) {
    const d = t.dataset;
    const src = isClip(t) ? d.viewPoster : (d.gpaStill || d.viewImage);
    const srcset = isClip(t) ? '' : (d.gpaStill + ' 711w, ' + d.viewImage + ' 1920w');
    const alt = d.gpaAlt || capOf(t);
    const token = ++swapToken;
    const incoming = stills[1 - front];
    const outgoing = stills[front];
    incoming.loading = 'eager';
    if (srcset) { incoming.sizes = '(max-width: 999px) 100vw, 66vw'; incoming.srcset = srcset; } else incoming.removeAttribute('srcset');
    incoming.src = src;
    incoming.classList.toggle('is-trim', 'gpaTrim' in d);
    const done = () => {
      if (token !== swapToken) return;
      incoming.alt = alt; incoming.removeAttribute('aria-hidden');
      outgoing.alt = ''; outgoing.setAttribute('aria-hidden', 'true');
      incoming.classList.add('is-front');
      outgoing.classList.remove('is-front');
      front = 1 - front;
    };
    if (incoming.decode) incoming.decode().then(done, done); else done();
  }

  /* ---------- clip playback ---------- */
  function setPlaying(on) {
    stage.classList.toggle('is-playing', on);
    hit.setAttribute('aria-pressed', String(on));
    const t = thumbs[cur];
    if (isClip(t)) hit.setAttribute('aria-label', (on ? 'Pause clip: ' : 'Play clip: ') + capOf(t));
  }
  function wantSrc(t) {
    const conn = navigator.connection;
    const lean = conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || ''));
    const px = stage.clientWidth * (window.devicePixelRatio || 1);
    return (!lean && px > 1400 && t.dataset.viewVideo) ? t.dataset.viewVideo : t.dataset.gpaVideo;
  }
  function ensureVideo() {
    if (video) return video;
    video = document.createElement('video');
    video.className = 'gpa__video';
    video.muted = true; video.defaultMuted = true; video.playsInline = true; video.loop = true;
    video.setAttribute('muted', ''); video.setAttribute('playsinline', ''); video.setAttribute('loop', '');
    video.setAttribute('aria-hidden', 'true');
    video.disablePictureInPicture = true;
    video.preload = 'auto';
    video.addEventListener('playing', () => {
      stage.classList.add('is-live');
      setPlaying(true);
      if (heroVideo && !heroVideo.paused) heroVideo.pause(); // one video at a time
    });
    video.addEventListener('pause', () => {
      setPlaying(false);
      // really stopped (not just swapping clips): let main.js decide whether the hero loop resumes
      if (video.paused) document.dispatchEvent(new Event('visibilitychange'));
    });
    stills[1].after(video);
    return video;
  }
  // the hero coming back into view starts its loop again; this clip then gives way
  if (heroVideo) heroVideo.addEventListener('playing', () => { if (video && !video.paused) video.pause(); });
  function play() {
    const t = thumbs[cur];
    if (!isClip(t)) return;
    const v = ensureVideo();
    const src = wantSrc(t);
    v.classList.toggle('is-trim', 'gpaTrim' in t.dataset);
    if (v.dataset.src !== src) { v.dataset.src = src; v.src = src; }
    setPlaying(true);
    safePlay(v);
  }
  function pause() { if (video && !video.paused) video.pause(); }
  function unload() {
    if (!video) return;
    video.pause();
    video.removeAttribute('src');
    delete video.dataset.src;
    video.load();
    stage.classList.remove('is-live');
    setPlaying(false);
  }

  /* ---------- selection ---------- */
  function select(k, opts = {}) {
    k = (k + thumbs.length) % thumbs.length;
    const t = thumbs[k];
    if (k !== cur) {
      unload();
      thumbs[cur].setAttribute('aria-selected', 'false');
      thumbs[cur].tabIndex = -1;
      cur = k;
      t.setAttribute('aria-selected', 'true');
      t.tabIndex = 0;
      stage.setAttribute('aria-labelledby', t.id);
      stage.classList.toggle('is-clip', isClip(t));
      cap.textContent = capOf(t);
      hit.setAttribute('aria-label', (isClip(t) ? 'Play clip: ' : 'View larger: ') + capOf(t));
      showStill(t);
      if (opts.reveal) reveal(t);
    }
    if (opts.play && isClip(t) && !reduced) play();
  }
  // keep the picked thumb in view inside a scrolling rail (never scrolls the page)
  function reveal(t) {
    if (rail.scrollWidth <= rail.clientWidth + 1) return;
    const r = rail.getBoundingClientRect();
    const b = t.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(rail).scrollPaddingLeft) || 16;
    let dx = 0;
    if (b.left < r.left + pad) dx = b.left - r.left - pad;
    else if (b.right > r.right - pad) dx = b.right - r.right + pad;
    if (dx) rail.scrollBy({ left: dx, behavior: reduced ? 'auto' : 'smooth' });
  }

  /* ---------- opening the shared viewer ---------- */
  function openViewer(from) {
    pause();
    viewerFromHere = true;
    returnTo = from;
    if (viewer) viewer.classList.add('gpa-open');   // lets gameplay-a.css give long captions room on phones
    passThrough = true;
    thumbs[cur].click();          // main.js: delegated [data-view] click → viewer, group "gameplay"
    passThrough = false;
  }

  /* ---------- events ---------- */
  rail.addEventListener('click', (e) => {
    const t = e.target.closest('[data-gpa-item]');
    if (!t || passThrough) return;
    e.preventDefault();
    e.stopPropagation();          // a thumb shows on the stage instead of opening the viewer
    select(thumbs.indexOf(t), { play: true, reveal: true });
  });
  rail.addEventListener('keydown', (e) => {
    const i = thumbs.indexOf(document.activeElement);
    if (i < 0) return;
    const grid = getComputedStyle(rail).display === 'grid';
    const cols = grid ? getComputedStyle(rail).gridTemplateColumns.split(' ').length : 1;
    let k = null;
    if (e.key === 'ArrowRight') k = i + 1;
    else if (e.key === 'ArrowLeft') k = i - 1;
    else if (e.key === 'ArrowDown' && cols > 1) k = Math.min(i + cols, thumbs.length - 1);
    else if (e.key === 'ArrowUp' && cols > 1) k = Math.max(i - cols, 0);
    else if (e.key === 'Home') k = 0;
    else if (e.key === 'End') k = thumbs.length - 1;
    if (k === null) return;
    e.preventDefault();
    k = (k + thumbs.length) % thumbs.length;
    thumbs.forEach((t, j) => { t.tabIndex = j === k ? 0 : -1; });
    thumbs[k].focus();
  });
  // keep the roving tab stop on the selected thumb when focus leaves the rail
  rail.addEventListener('focusout', (e) => {
    if (rail.contains(e.relatedTarget)) return;
    thumbs.forEach((t, j) => { t.tabIndex = j === cur ? 0 : -1; });
  });

  let swiped = false;
  hit.addEventListener('click', () => {
    if (swiped) { swiped = false; return; }
    const t = thumbs[cur];
    if (!isClip(t)) { openViewer(hit); return; }
    if (video && !video.paused) pause(); else play();
  });
  expand.addEventListener('click', () => openViewer(expand));

  // swipe the stage on touch screens to step through the set
  let sx = null, sy = null;
  stage.addEventListener('pointerdown', (e) => {
    swiped = false;
    if (e.pointerType === 'mouse') return;
    sx = e.clientX; sy = e.clientY;
  });
  stage.addEventListener('pointerup', (e) => {
    if (sx === null) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    sx = sy = null;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      swiped = true;
      select(cur + (dx < 0 ? 1 : -1), { play: true, reveal: true });
    }
  });
  stage.addEventListener('pointercancel', () => { sx = sy = null; });

  // off screen → pause (and stay paused until asked again)
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([en]) => { if (!en.isIntersecting) pause(); }, { threshold: 0.2 }).observe(stage);
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

  // any dialog (shared viewer, trailer) opening → pause
  const dialogs = document.querySelectorAll('dialog');
  if ('MutationObserver' in window) {
    const mo = new MutationObserver((list) => { if (list.some((m) => m.target.open)) pause(); });
    dialogs.forEach((d) => mo.observe(d, { attributes: true, attributeFilter: ['open'] }));
  }

  // When the viewer closes, put whatever it ended on onto the stage (as a still) and
  // hand focus back to the control that opened it.
  if (viewer) {
    const vcap = viewer.querySelector('[data-viewer-cap]');
    if (vcap && 'MutationObserver' in window) {
      new MutationObserver(() => { if (viewer.open) lastViewerCap = vcap.textContent; })
        .observe(vcap, { childList: true, characterData: true, subtree: true });
    }
    viewer.addEventListener('close', () => {
      if (!viewerFromHere) return;
      viewerFromHere = false;
      viewer.classList.remove('gpa-open');
      const k = thumbs.findIndex((t) => capOf(t) === lastViewerCap);
      if (k >= 0 && k !== cur) select(k, { reveal: true });
      if (returnTo && document.contains(returnTo)) returnTo.focus({ preventScroll: true });
      returnTo = null;
    });
  }
})();
