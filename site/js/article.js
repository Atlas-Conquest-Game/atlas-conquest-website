/**
 * Articles bootstrapper — runs on the index (/articles/) and on every article.
 *
 * Article HTML is fully server-rendered by scripts/build_articles.py — there's
 * no client-side Markdown parsing or deck decoding. This script adds the
 * progressive enhancements:
 *   - index: the tag filter (?tag=… deep links included);
 *   - article: the reading bar (current section, contents menu, and a JS
 *     progress fallback where CSS scroll timelines aren't supported);
 *   - the figure lightbox, reduced-motion clips, and the card-hover preview.
 */

/**
 * Make wide and paired figures (`{: .wide }` / `{: .pair }` in the article Markdown)
 * click-to-expand.
 *
 * The wrapper and lightbox are built here rather than at build time so that
 * with JS disabled the image still renders as a plain wide figure.
 */
function initImageLightbox() {
  const figures = document.querySelectorAll('.article-prose img.wide, .article-prose img.pair');
  if (!figures.length) return;

  const box = document.createElement('div');
  box.className = 'lightbox';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  // Visibility is driven by the .open class alone — the `hidden` attribute
  // would be overridden by `.lightbox.open { display: flex }` anyway.
  box.innerHTML =
    '<button class="lightbox-close" type="button" aria-label="Close">&#10005;</button>' +
    '<img class="lightbox-img" alt="">' +
    // The caption repeats the image's alt text, so hide it from screen readers.
    '<p class="lightbox-caption" aria-hidden="true"></p>';
  document.body.appendChild(box);

  const img = box.querySelector('.lightbox-img');
  const caption = box.querySelector('.lightbox-caption');
  const closeBtn = box.querySelector('.lightbox-close');
  let lastFocus = null;

  function open(src, alt) {
    lastFocus = document.activeElement;
    img.src = src;
    img.alt = alt || '';
    caption.textContent = alt || '';
    box.classList.remove('zoomed');
    box.classList.add('open');
    document.body.style.overflow = 'hidden';
    closeBtn.focus();
  }

  function close() {
    if (!box.classList.contains('open')) return;
    box.classList.remove('open', 'zoomed');
    document.body.style.overflow = '';
    // Drop the src so a large diagram isn't held decoded in memory.
    img.removeAttribute('src');
    if (lastFocus) lastFocus.focus();
  }

  function toggleZoom() {
    const zoomed = box.classList.toggle('zoomed');
    if (zoomed) {
      // Center the natural-size image on the point that was in the middle.
      box.scrollLeft = (box.scrollWidth - box.clientWidth) / 2;
      box.scrollTop = (box.scrollHeight - box.clientHeight) / 2;
    }
  }

  figures.forEach((el) => {
    const wrap = document.createElement('span');
    wrap.className = 'article-zoom';
    wrap.setAttribute('role', 'button');
    wrap.setAttribute('tabindex', '0');
    wrap.setAttribute('aria-label', `Expand figure: ${el.alt || 'diagram'}`);
    // Wrap the whole <picture> when there is one: its <source> must stay a
    // sibling of the <img> or the browser stops choosing between them.
    const target = el.closest('picture') || el;
    target.parentNode.insertBefore(wrap, target);
    wrap.appendChild(target);

    const hint = document.createElement('span');
    hint.className = 'article-zoom-hint';
    hint.innerHTML =
      '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M6 1H1v5M10 15h5v-5M15 6V1h-5M1 10v5h5"/></svg>' +
      '<span>Click to expand</span>';
    wrap.appendChild(hint);

    const fire = () => open(el.dataset.full || el.currentSrc || el.src, el.alt);
    wrap.addEventListener('click', fire);
    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fire();
      }
    });
  });

  img.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleZoom();
  });
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    close();
  });
  // Clicking the backdrop (anywhere but the image) closes.
  box.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && box.classList.contains('open')) close();
  });
}

/**
 * Article clips ([[video:...]]) ship with preload="none" and native controls,
 * so nothing downloads up front and readers without JS can still play them.
 * Here they become silent loops that play only while on screen. Readers who ask
 * for reduced motion keep the controls and press play themselves.
 */
function initArticleVideos() {
  const videos = document.querySelectorAll('.article-video video');
  if (!videos.length) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach(({ target, isIntersecting }) => {
      if (isIntersecting) {
        const p = target.play();
        if (p && p.catch) p.catch(() => { target.controls = true; });
      } else if (!target.paused) {
        target.pause();
      }
    });
  }, { rootMargin: '120px 0px', threshold: 0.2 });
  videos.forEach((video) => {
    video.muted = true;
    video.controls = false;
    io.observe(video);
  });
}

/**
 * Index: filter the article cards by tag. The chips are server-rendered
 * buttons (hidden without JS); ?tag=<name> deep links — the tag chips on each
 * article point here — pre-select a filter.
 */
function initArticleFilter() {
  const bar = document.querySelector('[data-article-filter]');
  const grid = document.querySelector('[data-article-grid]');
  if (!bar || !grid) return;
  const chips = [...bar.querySelectorAll('.article-filter-chip')];
  const cards = [...grid.querySelectorAll('.article-card')];
  const status = document.querySelector('[data-article-filter-status]');

  function apply(tag, { push } = {}) {
    const known = chips.some(c => c.dataset.tag === tag);
    if (!known) tag = '';
    let shown = 0;
    cards.forEach(card => {
      const tags = (card.dataset.tags || '').split(',');
      const match = !tag || tags.includes(tag);
      card.hidden = !match;
      if (match) shown += 1;
    });
    grid.classList.toggle('is-filtered', Boolean(tag));
    chips.forEach(c => c.setAttribute('aria-pressed', String(c.dataset.tag === tag)));
    if (status) {
      const label = chips.find(c => c.dataset.tag === tag);
      const name = label ? label.firstChild.textContent.trim() : '';
      status.textContent = tag
        ? `Showing ${shown} ${shown === 1 ? 'article' : 'articles'} tagged ${name}`
        : `Showing all ${shown} articles`;
    }
    if (push) {
      const url = new URL(location.href);
      if (tag) url.searchParams.set('tag', tag);
      else url.searchParams.delete('tag');
      history.replaceState(null, '', url);
    }
  }

  bar.addEventListener('click', e => {
    const chip = e.target.closest('.article-filter-chip');
    if (!chip) return;
    apply(chip.dataset.tag, { push: true });
  });

  const initial = (new URLSearchParams(location.search).get('tag') || '').toLowerCase();
  if (initial) apply(initial);
}

/**
 * Article: the sticky reading bar under the header.
 *  - names the section being read (the last <h2> above the reading line);
 *  - highlights it in the Contents menu, and closes the menu on Esc, an
 *    outside click or picking a section;
 *  - drives the progress ring by hand when the browser can't run the CSS
 *    scroll timeline in articles.css.
 */
function initReadingBar() {
  const bar = document.querySelector('[data-readbar]');
  const body = document.querySelector('[data-article-body]');
  if (!bar || !body) return;

  const sectionLabel = bar.querySelector('[data-readbar-section]');
  const toc = bar.querySelector('[data-article-toc]');
  const headings = [...body.querySelectorAll('h2[id]')];
  const links = toc ? [...toc.querySelectorAll('a[href^="#"]')] : [];
  const cssProgress = window.CSS && CSS.supports &&
    CSS.supports('animation-timeline: view()') && CSS.supports('timeline-scope: --a');

  // The reading line sits just under the nav + reading bar.
  const readingLine = () => bar.getBoundingClientRect().bottom + 56;

  let current = null;
  function update() {
    const line = readingLine();
    let active = null;
    for (const h of headings) {
      if (h.getBoundingClientRect().top <= line) active = h;
      else break;
    }
    if (active !== current) {
      current = active;
      if (sectionLabel) {
        sectionLabel.textContent = active ? active.textContent.trim() : '';
        sectionLabel.classList.toggle('is-visible', Boolean(active));
      }
      links.forEach(a => {
        if (active && a.getAttribute('href') === '#' + active.id) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
    }
    if (!cssProgress) {
      const rect = body.getBoundingClientRect();
      const span = rect.height - (window.innerHeight - line);
      const p = span > 0 ? (line - rect.top) / span : 1;
      bar.style.setProperty('--ac-read', String(Math.min(1, Math.max(0, p))));
    }
  }

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; update(); });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  update();

  if (!toc) return;
  const summary = toc.querySelector('summary');
  const close = (returnFocus) => {
    if (!toc.open) return;
    toc.open = false;
    if (returnFocus && summary) summary.focus();
  };
  document.addEventListener('click', e => {
    if (toc.open && !toc.contains(e.target)) close(false);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && toc.open) {
      e.preventDefault();
      close(true);
    }
  });
  toc.addEventListener('focusout', e => {
    if (toc.open && e.relatedTarget && !toc.contains(e.relatedTarget)) close(false);
  });
  links.forEach(a => a.addEventListener('click', () => {
    close(false);
    // Land keyboard focus on the section too, so Tab continues from there.
    const target = document.getElementById(a.getAttribute('href').slice(1));
    if (target) {
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      requestAnimationFrame(() => target.focus({ preventScroll: true }));
    }
  }));
  // Opening the menu scrolls the current section into view inside it.
  toc.addEventListener('toggle', () => {
    if (!toc.open) return;
    const here = toc.querySelector('a[aria-current="true"]');
    if (here) here.scrollIntoView({ block: 'nearest' });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  if (typeof initNavActiveState === 'function') initNavActiveState();
  if (typeof initCardPreview === 'function') initCardPreview();
  initArticleFilter();
  initReadingBar();
  initImageLightbox();
  initArticleVideos();
});
