/* Patron Gods — option B "Six gods".
   The six panels are ARIA tabs (roving tabindex; Left/Right/Home/End move and select).
   Selecting one cross-fades the single detail strip (CSS does the fade). On user intent
   only, it makes sure the choice is visible: a rail scrolls the panel fully into view,
   and the page scrolls just enough to show the strip if it is below the fold.
   Nothing moves on its own; reduced motion jumps instead of gliding. */
(() => {
  'use strict';
  const row = document.querySelector('[data-gb-tabs]');
  if (!row) return;
  const tabs = Array.from(row.querySelectorAll('[role="tab"]'));
  const panels = tabs.map((t) => document.getElementById(t.getAttribute('aria-controls')));
  const detail = document.querySelector('[data-gb-detail]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const behavior = reduced ? 'auto' : 'smooth';
  const n = tabs.length;

  function isRail() { return row.scrollWidth > row.clientWidth + 2; }

  // Rail only: bring the chosen panel fully into view, landing on a snap point
  // (the rail snaps panel starts, so an in-between target would snap back).
  function showTab(t) {
    if (!isRail()) return;
    const pad = parseFloat(getComputedStyle(row).scrollPaddingInlineStart) || 16;
    const rr = row.getBoundingClientRect();
    const x0 = row.scrollLeft;
    const max = row.scrollWidth - row.clientWidth;
    const snaps = tabs.map((el) => Math.min(max, Math.max(0, x0 + el.getBoundingClientRect().left - rr.left - pad)));
    snaps.push(max);
    const r = t.getBoundingClientRect();
    let to = null;
    if (r.right > rr.right - pad + 1) {
      const need = x0 + r.right - (rr.right - pad);
      to = Math.min(...snaps.filter((s) => s >= need - 1).concat(max));
    } else if (r.left < rr.left + pad - 1) {
      const need = x0 + r.left - (rr.left + pad);
      to = Math.max(...snaps.filter((s) => s <= need + 1).concat(0));
    }
    if (to !== null && Math.abs(to - x0) > 1) row.scrollTo({ left: to, behavior });
  }

  function showStrip() {
    const panel = panels.find((p) => p.classList.contains('is-active'));
    if (!panel) return;
    const vh = window.innerHeight;
    const s = (detail || panel).getBoundingClientRect();
    if (s.bottom <= vh - 8) return; // already in view
    const nav = document.querySelector('[data-nav]');
    const navH = nav ? nav.getBoundingClientRect().height : 0;
    const rowTop = row.getBoundingClientRect().top;
    const need = s.bottom - vh + 20;          // bring the strip's bottom into view…
    const room = rowTop - navH - 12;          // …without pushing the panels under the nav
    const dy = Math.max(0, Math.min(need, room));
    if (dy > 4) window.scrollBy({ top: dy, behavior });
  }

  function select(i, how) {
    tabs.forEach((t, k) => {
      const on = k === i;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      panels[k].classList.toggle('is-active', on);
    });
    if (!how) return;
    if (how === 'key') tabs[i].focus({ preventScroll: true });
    showTab(tabs[i]);
    showStrip();
  }

  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(i, 'click'));
    t.addEventListener('keydown', (e) => {
      let j = null;
      if (e.key === 'ArrowRight') j = (i + 1) % n;
      else if (e.key === 'ArrowLeft') j = (i - 1 + n) % n;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = n - 1;
      if (j === null) return;
      e.preventDefault();
      select(j, 'key');
    });
  });

  select(Math.max(0, tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true')));
})();
