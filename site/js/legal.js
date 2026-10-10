/**
 * Legal pages: mark the "On this page" entry for the section being read.
 * The index works without this (plain anchor links); it only adds the
 * aria-current highlight. Standalone — no shared.js.
 */
(function () {
  'use strict';
  const links = [...document.querySelectorAll('.legal-toc a[href^="#"]')];
  const sections = links
    .map(a => document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1))))
    .filter(Boolean);
  if (!sections.length) return;

  let current = null;
  function update() {
    const line = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-height')) || 64) + 120;
    let active = sections[0];
    for (const s of sections) {
      if (s.getBoundingClientRect().top <= line) active = s;
      else break;
    }
    // At the very bottom the last short section can never reach the line.
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
      const footer = document.querySelector('.ac-footer');
      const last = sections[sections.length - 1];
      if (!footer || last.getBoundingClientRect().top < window.innerHeight) active = last;
    }
    if (active === current) return;
    current = active;
    links.forEach(a => {
      if (a.getAttribute('href') === '#' + active.id) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  }

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; update(); });
  }, { passive: true });
  update();
})();
