/**
 * 404 page: show the path that missed, and if it looks like an old or
 * mistyped link to one of the site's sections, light that tile up and offer
 * it ("Were you looking for Decks?"). Everything here is an enhancement — the
 * page works as plain links without it.
 */
(function () {
  'use strict';

  let path = location.pathname;
  try { path = decodeURIComponent(path); } catch { /* keep the raw path */ }

  // Visiting /404.html directly isn't a miss worth echoing back.
  if (!/\/404(\.html)?$/.test(path)) {
    const wrap = document.querySelector('[data-nf-path]');
    const value = document.querySelector('[data-nf-path-value]');
    if (wrap && value) {
      value.textContent = path.length > 64 ? path.slice(0, 61) + '…' : path;
      wrap.hidden = false;
    }
  }

  // First match wins; checked against the lower-cased path.
  const GUESSES = [
    ['decks', /deck|builder|import/],
    ['articles', /article|guide|rule|news|blog|post|league|conquest-format/],
    ['analytics', /analytic|stat|commander|card|meta|goal|winrate|tier/],
    ['press', /press|media|kit|contact/],
    ['home', /index|home|^\/?$/],
  ];
  const lower = path.toLowerCase();
  const match = GUESSES.find(([, re]) => re.test(lower));
  if (!match) return;

  const key = match[0];
  const hex = document.querySelector(`[data-nf-hex="${key}"]`);
  const suggest = document.querySelector('[data-nf-suggest]');
  const link = document.querySelector('[data-nf-suggest-link]');
  if (!hex) return;
  hex.classList.add('is-suggested');
  if (suggest && link) {
    link.href = hex.getAttribute('href');
    link.textContent = hex.querySelector('.nf-hex-label').textContent;
    suggest.hidden = false;
  }
})();
