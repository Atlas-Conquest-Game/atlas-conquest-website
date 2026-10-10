/* Choose Your Commander — the commander roster.
   - Patron chips (toggle buttons): dim everyone but that patron's commanders and show the
     god's title + playstyle. Nothing hides and nothing reflows.
   - A tile opens the commander sheet (a modal <dialog>): portrait, name, patron, intellect,
     health, ability, "Build a deck". Prev/next (buttons, arrow keys, swipe on the art) step
     through the highlighted patron, or all sixteen. Without JS, tiles are plain links to
     each commander's deck builder page. */
(() => {
  'use strict';
  const root = document.querySelector('[data-roster]');
  if (!root) return;
  const $ = (s, el = root) => el.querySelector(s);
  const $$ = (s, el = root) => Array.from(el.querySelectorAll(s));

  const chips = $$('[data-chip]');
  const abouts = $$('[data-about]');
  const items = $$('.roster__item');
  const tiles = $$('[data-roster-tile]');
  const status = $('[data-roster-status]');
  let active = 'all';

  const TITLES = {};
  abouts.forEach((p) => { TITLES[p.dataset.about] = p.textContent.replace(/\s+/g, ' ').trim(); });
  const GLOW = { all: 'rgba(232, 140, 50, .07)' };
  chips.forEach((c) => {
    const rgb = getComputedStyle(c).getPropertyValue('--fc').trim();
    if (c.dataset.chip !== 'all' && rgb) GLOW[c.dataset.chip] = 'rgba(' + rgb + ', .13)';
  });

  /* ---------------- patron chips ---------------- */
  function choose(key, announce) {
    active = key;
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.chip === key)));
    abouts.forEach((p) => p.classList.toggle('is-on', p.dataset.about === key));
    items.forEach((li) => li.classList.toggle('is-dim', key !== 'all' && li.dataset.patron !== key));
    root.classList.toggle('is-filtered', key !== 'all');
    root.style.setProperty('--roster-glow', GLOW[key] || GLOW.all);
    if (announce && status) {
      const n = key === 'all' ? items.length : items.filter((li) => li.dataset.patron === key).length;
      status.textContent = (key === 'all' ? 'All commanders. ' : TITLES[key] + ' ') + n + ' commanders highlighted.';
    }
  }
  chips.forEach((c) => c.addEventListener('click', () => {
    // pressing the chosen god again goes back to All
    const key = c.dataset.chip === active && active !== 'all' ? 'all' : c.dataset.chip;
    choose(key, true);
  }));

  /* ---------------- commander sheet ---------------- */
  const dlg = $('[data-roster-sheet]');
  if (!dlg || typeof dlg.showModal !== 'function') return; // tiles stay plain links

  const el = {
    img: $('[data-rs-img]', dlg),
    name: $('[data-rs-name]', dlg),
    emblem: $('[data-rs-emblem]', dlg),
    patron: $('[data-rs-patron]', dlg),
    int: $('[data-rs-int]', dlg),
    intSr: $('[data-rs-int-sr]', dlg),
    hp: $('[data-rs-hp]', dlg),
    hpSr: $('[data-rs-hp-sr]', dlg),
    ability: $('[data-rs-ability]', dlg),
    deck: $('[data-rs-deck]', dlg),
    prev: $('[data-rs-prev]', dlg),
    next: $('[data-rs-next]', dlg),
    close: $('[data-rs-close]', dlg),
    swipe: $('[data-rs-swipe]', dlg),
  };
  const PATRON_LABEL = {};
  abouts.forEach((p) => {
    const god = p.querySelector('.roster__about-god');
    if (p.dataset.about !== 'all' && god) PATRON_LABEL[p.dataset.about] = god.textContent.trim();
  });

  let list = tiles;
  let i = 0;
  let opener = null;

  function fill(tile, measuring) {
    const li = tile.closest('.roster__item');
    const d = tile.dataset;
    const cs = getComputedStyle(li);
    dlg.style.setProperty('--fc', cs.getPropertyValue('--fc').trim());
    dlg.style.setProperty('--fx', cs.getPropertyValue('--fx').trim());
    if (!measuring) {
      const pic = tile.querySelector('img');
      el.img.src = pic.currentSrc || pic.src;
      el.img.alt = d.name;
    }
    el.name.textContent = d.name;
    el.emblem.src = 'media/emblem-' + d.patron + '-160.webp';
    el.patron.textContent = PATRON_LABEL[d.patron] || d.patron;
    el.int.textContent = d.int;
    el.intSr.textContent = d.int + ' ';
    el.hp.textContent = d.hp;
    el.hpSr.textContent = d.hp + ' ';
    el.ability.textContent = '';
    const tpl = li.querySelector('template[data-ability]');
    if (tpl) el.ability.appendChild(tpl.content.cloneNode(true));
    el.deck.href = tile.getAttribute('href');
    el.deck.setAttribute('aria-label', 'Build a deck with ' + d.name);
  }
  function show(k) {
    i = (k + list.length) % list.length;
    fill(list[i]);
  }
  /* Size the sheet for its longest commander, so stepping through them never makes the
     sheet grow or shrink (on phones its top edge would jump). Synchronous: nothing paints. */
  const inner = dlg.querySelector('.roster__sheet-in');
  function settle() {
    inner.style.minHeight = '';
    let h = 0;
    tiles.forEach((t) => { fill(t, true); h = Math.max(h, inner.offsetHeight); });
    inner.style.minHeight = h + 'px';
    fill(list[i]);
  }
  let rz = 0;
  window.addEventListener('resize', () => {
    if (!dlg.open) return;
    cancelAnimationFrame(rz);
    rz = requestAnimationFrame(settle);
  });

  function open(tile) {
    opener = tile;
    // step through the highlighted patron when one is chosen, otherwise all sixteen
    list = active === 'all' ? tiles : tiles.filter((t) => t.dataset.patron === active);
    if (!list.includes(tile)) list = tiles;
    dlg.classList.toggle('is-single', list.length < 2);
    el.prev.hidden = el.next.hidden = list.length < 2;
    i = list.indexOf(tile);
    dlg.showModal();
    settle();
    el.close.focus();
  }

  tiles.forEach((t) => {
    t.setAttribute('role', 'button');
    t.setAttribute('aria-haspopup', 'dialog');
    t.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return; // new tab etc.: follow the link
      e.preventDefault();
      open(t);
    });
    t.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); open(t); }
    });
  });

  el.prev.addEventListener('click', () => show(i - 1));
  el.next.addEventListener('click', () => show(i + 1));
  el.close.addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); }); // backdrop
  dlg.addEventListener('keydown', (e) => {
    if (list.length < 2 || e.target.closest('a')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); show(i + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); show(i - 1); }
  });
  let sx = null;
  el.swipe.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') sx = e.clientX; });
  el.swipe.addEventListener('pointercancel', () => { sx = null; });
  el.swipe.addEventListener('pointerup', (e) => {
    if (sx === null) return;
    const dx = e.clientX - sx; sx = null;
    if (list.length > 1 && Math.abs(dx) > 48) show(i + (dx < 0 ? 1 : -1));
  });
  dlg.addEventListener('close', () => {
    if (opener && document.contains(opener)) {
      // keep the opener in step with the commander the sheet ended on
      const last = list[i];
      (last && document.contains(last) ? last : opener).focus({ preventScroll: true });
    }
  });

  choose('all', false);
})();
