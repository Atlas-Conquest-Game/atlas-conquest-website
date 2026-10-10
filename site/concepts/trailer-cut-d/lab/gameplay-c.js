/* Gameplay · option C — "Read the board".
   Five hex markers on a real screenshot, one note per marker. Picking a marker or a note
   lights that spot (cross-fade) and opens its note. Wide screens: the notes are an accordion
   beside the image. Narrower: a swipe rail; swiping selects the card that settles in the
   middle, and picking a marker scrolls its card into place. Nothing moves on its own.
   "See it" buttons are plain [data-view] triggers handled by main.js's shared viewer. */
(() => {
  'use strict';

  const board = document.querySelector('[data-board]');
  if (!board) return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const railMQ = matchMedia('(max-width: 1179px)');
  const pins = Array.from(board.querySelectorAll('[data-pin]'));
  const notes = Array.from(board.querySelectorAll('[data-note]'));
  const heads = notes.map((n) => n.querySelector('[data-note-head]'));
  const spots = Array.from(board.querySelectorAll('[data-spot]'));
  const rail = board.querySelector('[data-rail]');
  if (!pins.length || pins.length !== notes.length || !rail) return;

  let cur = -1;
  let lit = 0;
  let settleTimer = 0;

  const isRail = () => railMQ.matches;

  /* Accordion (panel) vs. selectable cards (rail): set the matching ARIA state. */
  function syncAria() {
    const rail = isRail();
    heads.forEach((h, k) => {
      if (rail) {
        h.removeAttribute('aria-expanded');
        h.setAttribute('aria-pressed', String(k === cur));
      } else {
        h.removeAttribute('aria-pressed');
        h.setAttribute('aria-expanded', String(k === cur));
      }
    });
  }

  /* Spotlight: write the new spot onto the hidden layer, then swap which layer shows. */
  function light(i) {
    const v = (pins[i].dataset.spotAt || '').trim().split(/\s+/).map(Number);
    if (v.length < 4 || v.some(isNaN) || spots.length < 2) return;
    const next = spots[lit ^ 1];
    next.style.setProperty('--x', v[0] + '%');
    next.style.setProperty('--y', v[1] + '%');
    next.style.setProperty('--rx', v[2] + '%');
    next.style.setProperty('--ry', v[3] + '%');
    next.classList.add('is-on');
    spots[lit].classList.remove('is-on');
    lit ^= 1;
  }

  /* The scrollLeft that centres note k in the rail (clamped to what can scroll). */
  function target(k) {
    const n = notes[k];
    const max = rail.scrollWidth - rail.clientWidth;
    return Math.max(0, Math.min(max, Math.round(n.offsetLeft + n.offsetWidth / 2 - rail.clientWidth / 2)));
  }

  function select(i, scroll) {
    if (i < 0 || i >= notes.length) return;
    const changed = i !== cur;
    cur = i;
    notes.forEach((n, k) => n.classList.toggle('is-active', k === i));
    pins.forEach((p, k) => p.setAttribute('aria-pressed', String(k === i)));
    syncAria();
    if (changed) light(i);
    if (scroll && isRail()) {
      const t = target(i);
      if (Math.abs(rail.scrollLeft - t) > 1) rail.scrollTo({ left: t, behavior: reduced ? 'auto' : 'smooth' });
    }
  }

  /* After a swipe settles, select the card that snapped into place. Cards that share a clamped
     position (the first or last few on a wide rail) keep the current pick if it is one of them. */
  function settle() {
    if (!isRail()) return;
    const s = rail.scrollLeft;
    const d = notes.map((_, k) => Math.abs(target(k) - s));
    const best = Math.min.apply(null, d);
    const near = [];
    d.forEach((v, k) => { if (v - best < 2) near.push(k); });
    const k = near.indexOf(cur) >= 0 ? cur : near[0];
    if (k !== cur) select(k, false);
  }

  pins.forEach((p, k) => p.addEventListener('click', () => select(k, true)));
  heads.forEach((h, k) => h.addEventListener('click', () => select(k, true)));
  notes.forEach((n, k) => {
    const see = n.querySelector('[data-view]');
    if (see) see.addEventListener('click', () => select(k, true));
  });

  rail.addEventListener('scroll', () => {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(settle, 140);
  }, { passive: true });

  /* Tabbing into a card that is off to the side: bring it into place and select it. */
  rail.addEventListener('focusin', (e) => {
    if (!isRail()) return;
    const n = e.target.closest('[data-note]');
    if (n) select(notes.indexOf(n), true);
  });

  const onMode = () => {
    syncAria();
    if (isRail()) rail.scrollLeft = target(cur);
  };
  if (railMQ.addEventListener) railMQ.addEventListener('change', onMode);
  else if (railMQ.addListener) railMQ.addListener(onMode);

  select(0, false);
})();
