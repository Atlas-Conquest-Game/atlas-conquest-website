/**
 * Atlas Conquest — Beta Analytics UI (presentation only).
 *
 * Loaded on every analytics page AFTER shared.js and BEFORE the page script.
 * Nothing in here loads, filters or aggregates data; it only dresses up what
 * the page scripts already render:
 *
 *   ACA.token(name, faction, opts)  → commander portrait token HTML (circular
 *                                     art + faction-coloured ring, as in game)
 *   ACA.countUp(el)                 → animate the number already written into
 *                                     el (keeps its prefix/suffix/format)
 *   ACA.periodLabel()               → "Last 3 months · All maps"
 *   ACA.sizeArt(url)                → art URL for a commander (from
 *                                     commanders.json, else the slug path)
 *
 * It also wires the suite chrome: the analytics tab bar (scroll fades, active
 * tab kept in view), aria-pressed on every toggle pill, a live "N matches"
 * summary in the sticky filter bar, and keyboard support for the Meta page's
 * collapsible sections.
 */
(function () {
  'use strict';

  const motionOK = () =>
    !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const FACTIONS = ['skaal', 'grenalia', 'lucia', 'neutral', 'shadis', 'archaeon', 'adora', 'mechanus', 'treasure'];

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function slugOf(name) {
    if (typeof commanderSlug === 'function') return commanderSlug(name);
    return String(name || '').toLowerCase().replace(/\s+/g, '-').replace(/[,']/g, '');
  }

  // ─── Commander tokens ──────────────────────────────────────────────

  function artFor(name) {
    try {
      // `appData` is a top-level `let` in shared.js — a global binding, not a
      // window property — so read it by name.
      const list = (typeof appData !== 'undefined' && appData && appData.commanders) || [];
      const hit = list.find && list.find(c => c.name === name);
      if (hit && hit.art) return hit.art;
    } catch (e) { /* fall through */ }
    return `assets/commanders/${slugOf(name)}.jpg`;
  }

  /**
   * Circular commander portrait with a faction-coloured ring.
   * opts: size ('xs'|'sm'|'md'|'lg'|'xl'), badge (text in the corner bubble),
   *       alt (default '' — tokens sit next to the name), art (override URL),
   *       eager (skip lazy-loading), className.
   */
  // On-screen token diameters (analytics.css .cmd-token--*), for `sizes`.
  const TOKEN_PX = { xs: 22, sm: 32, md: 48, lg: 72, xl: 104 };

  function token(name, faction, opts = {}) {
    const size = opts.size || 'md';
    const fac = FACTIONS.includes(faction) ? faction : 'none';
    const art = opts.art || artFor(name);
    // 160px WebP token (scripts/generate_deck_pages.py) when it covers the
    // drawn size, the full portrait otherwise; a missing WebP falls back to it.
    const tokenSrc = art.replace(/(^|\/)assets\/commanders\/([^/]+)\.jpg$/, '$1assets/commanders/token/$2.webp');
    const small = tokenSrc !== art ? tokenSrc : '';
    const srcset = small
      ? ` srcset="${esc(small)} 160w, ${esc(art)} 400w" sizes="${TOKEN_PX[size] || 48}px"` : '';
    const initial = esc(String(name || '?').trim().charAt(0).toUpperCase());
    const badge = opts.badge != null && opts.badge !== ''
      ? `<span class="cmd-token__badge">${esc(opts.badge)}</span>` : '';
    const loading = opts.eager ? '' : ' loading="lazy"';
    const cls = opts.className ? ` ${opts.className}` : '';
    return `<span class="cmd-token cmd-token--${size}${cls}" data-faction="${fac}" data-initial="${initial}">` +
      `<img src="${esc(art)}"${srcset} alt="${esc(opts.alt || '')}"${loading} decoding="async" ` +
      `onerror="if(this.srcset){this.removeAttribute('srcset')}else{this.remove()}">` +
      `${badge}</span>`;
  }

  // ─── Count-up ──────────────────────────────────────────────────────

  const NUM_RE = /-?\d[\d,]*(?:\.\d+)?/;

  function parseShown(text) {
    const m = String(text).match(NUM_RE);
    if (!m) return null;
    const raw = m[0];
    const dot = raw.indexOf('.');
    return {
      prefix: text.slice(0, m.index),
      suffix: text.slice(m.index + raw.length),
      value: parseFloat(raw.replace(/,/g, '')),
      decimals: dot >= 0 ? raw.length - dot - 1 : 0,
      grouped: raw.includes(','),
    };
  }

  function fmt(v, p) {
    if (p.grouped) {
      return v.toLocaleString(undefined, { minimumFractionDigits: p.decimals, maximumFractionDigits: p.decimals });
    }
    return v.toFixed(p.decimals);
  }

  function animate(el, p, from) {
    const target = p.value;
    const finalText = p.prefix + fmt(target, p) + p.suffix;
    const dur = Math.min(1100, 520 + Math.log10(Math.abs(target - from) + 1) * 160);
    const start = performance.now();
    if (el._acaRaf) cancelAnimationFrame(el._acaRaf);
    el.classList.add('is-counting');
    // _acaLast marks text we wrote ourselves, so observers can tell our
    // frames apart from a page re-render that lands mid-animation.
    const write = text => { el._acaLast = text; el.textContent = text; };
    const step = now => {
      const t = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      if (t < 1) {
        write(p.prefix + fmt(from + (target - from) * e, p) + p.suffix);
        el._acaRaf = requestAnimationFrame(step);
      } else {
        write(finalText);
        el._acaRaf = 0;
        el.classList.remove('is-counting');
      }
    };
    el._acaRaf = requestAnimationFrame(step);
  }

  let countObserver = null;
  const pending = new WeakMap();

  /**
   * Animate the number currently shown in `el` up from its last value.
   * Numbers below the fold keep their final text and start counting just
   * before they scroll into view, so nothing ever shows a placeholder value
   * if the observer never fires. Pass { defer: false } to skip the animation
   * for off-screen numbers instead of waiting.
   */
  function countUp(el, opts = {}) {
    if (!el) return;
    const p = parseShown(el.textContent);
    if (!p || !isFinite(p.value)) return;
    const from = el.dataset.acaFrom !== undefined ? parseFloat(el.dataset.acaFrom) : 0;
    el.dataset.acaFrom = String(p.value);
    if (!motionOK() || from === p.value) return;

    const r = el.getBoundingClientRect();
    const vh = window.innerHeight || 800;
    const visible = r.bottom > 0 && r.top < vh;
    if (visible || !('IntersectionObserver' in window)) {
      animate(el, p, from);
      return;
    }
    if (opts.defer === false) return;
    pending.set(el, { p, from, text: el.textContent });
    if (!countObserver) {
      countObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          const job = pending.get(entry.target);
          countObserver.unobserve(entry.target);
          pending.delete(entry.target);
          // Skip if the page re-rendered this number in the meantime.
          if (!job || entry.target.textContent !== job.text) return;
          animate(entry.target, job.p, job.from);
        });
      }, { rootMargin: '0px 0px 12% 0px' });
    }
    countObserver.observe(el);
  }

  function countUpAll(root) {
    (root || document).querySelectorAll('[data-countup]').forEach(countUp);
  }

  // ─── Period label ──────────────────────────────────────────────────

  const PERIOD_LABELS = { '1m': 'Last month', '3m': 'Last 3 months', '6m': 'Last 6 months', all: 'All time' };

  function periodLabel(opts = {}) {
    const p = typeof currentPeriod !== 'undefined' ? currentPeriod : '3m';
    const m = typeof currentMap !== 'undefined' ? currentMap : 'all';
    const period = PERIOD_LABELS[p] || p;
    const map = m === 'all' ? 'all maps' : m;
    return opts.short ? period : `${period} · ${map}`;
  }

  // ─── Analytics tab bar ─────────────────────────────────────────────

  function initSubNav() {
    const nav = document.querySelector('.sub-nav');
    const scroller = nav && nav.querySelector('.sub-nav-scroller');
    if (!scroller) return;

    const update = () => {
      const max = scroller.scrollWidth - scroller.clientWidth;
      nav.classList.toggle('is-fade-start', scroller.scrollLeft > 4);
      nav.classList.toggle('is-fade-end', max - scroller.scrollLeft > 4);
    };
    const active = scroller.querySelector('[aria-current="page"]');
    if (active && scroller.scrollWidth > scroller.clientWidth) {
      const left = active.offsetLeft - (scroller.clientWidth - active.offsetWidth) / 2;
      scroller.scrollLeft = Math.max(0, left);
    }
    scroller.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  // ─── Toggle pills: expose state to assistive tech ──────────────────

  const PRESSABLE = '.time-btn, .map-btn, .bin-btn, .sort-btn, .filter-btn';
  let pressQueued = false;

  function syncPressed() {
    pressQueued = false;
    document.querySelectorAll(PRESSABLE).forEach(btn => {
      if (btn.tagName !== 'BUTTON') return;
      const on = btn.classList.contains('active') ? 'true' : 'false';
      if (btn.getAttribute('aria-pressed') !== on) btn.setAttribute('aria-pressed', on);
    });
  }

  function initPressed() {
    syncPressed();
    new MutationObserver(() => {
      if (pressQueued) return;
      pressQueued = true;
      requestAnimationFrame(syncPressed);
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  }

  // ─── Filter bar summary ("729 matches · Last 3 months · all maps") ─

  function initFilterSummary() {
    const inner = document.querySelector('.time-filter-bar .time-filter-inner');
    const source = document.getElementById('hero-matches');
    if (!inner || !source) return;
    const out = document.createElement('p');
    out.className = 'an-filter-summary';
    out.setAttribute('role', 'status');
    out.innerHTML = '<span class="an-filter-summary__count"></span><span class="an-filter-summary__scope"></span>';
    inner.appendChild(out);
    const count = out.firstChild;
    const scope = out.lastChild;
    let last = '';
    const render = () => {
      // Mid count-up frames would spam the live region; the final text lands
      // after .is-counting is removed. A page re-render mid-animation (text we
      // didn't write) still goes through.
      if (source.classList.contains('is-counting') && source.textContent === source._acaLast) return;
      const text = source.textContent.trim();
      if (!/\d/.test(text)) return;
      const next = text + '|' + periodLabel();
      if (next === last) return;
      last = next;
      count.textContent = text;
      scope.textContent = periodLabel();
    };
    new MutationObserver(render).observe(source, { childList: true, characterData: true, subtree: true });
    render();
  }

  // ─── Hero stats: count the match total up once it lands ────────────

  function initHeroCount() {
    const node = document.getElementById('hero-matches');
    if (!node) return;
    // Our own animation frames mutate the node too; .is-counting marks them.
    // { defer: false }: never write a placeholder value into an off-screen
    // hero (that write would re-trigger this observer).
    new MutationObserver(() => {
      if (node.textContent === node._acaLast) return; // one of our own frames
      countUp(node, { defer: false });
    }).observe(node, { childList: true });
  }

  // ─── Collapsible sections (Meta page): keyboard + state ────────────

  function initCollapsibles() {
    document.querySelectorAll('.section-title.collapsible').forEach(title => {
      const btn = title.querySelector('.chevron');
      const body = title.parentElement && title.parentElement.querySelector('.section-body');
      if (!btn || !body || btn.tagName !== 'BUTTON') return;
      const section = title.closest('section');
      if (!body.id && section && section.id) body.id = `${section.id}-body`;
      if (body.id) btn.setAttribute('aria-controls', body.id);
      const sync = () => {
        const open = !body.classList.contains('collapsed');
        btn.setAttribute('aria-expanded', String(open));
        if (section) section.classList.toggle('is-collapsed', !open);
      };
      new MutationObserver(sync).observe(body, { attributes: true, attributeFilter: ['class'] });
      sync();
    });
  }

  function init() {
    initSubNav();
    initPressed();
    initFilterSummary();
    initHeroCount();
    initCollapsibles();
  }

  window.ACA = { token, artFor, countUp, countUpAll, periodLabel, esc };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
