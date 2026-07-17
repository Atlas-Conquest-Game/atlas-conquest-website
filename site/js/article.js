/**
 * Article page bootstrapper.
 *
 * Article HTML is fully server-rendered by scripts/build_articles.py — there's
 * no client-side Markdown parsing or deck decoding. This script wires up the
 * shared nav-active state, the card-hover preview, and the figure lightbox.
 */

/**
 * Make wide figures (diagrams marked `{: .wide }` in the article Markdown)
 * click-to-expand.
 *
 * The wrapper and lightbox are built here rather than at build time so that
 * with JS disabled the image still renders as a plain wide figure.
 */
function initImageLightbox() {
  const figures = document.querySelectorAll('.article-prose img.wide');
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
    el.parentNode.insertBefore(wrap, el);
    wrap.appendChild(el);

    const hint = document.createElement('span');
    hint.className = 'article-zoom-hint';
    hint.innerHTML =
      '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M6 1H1v5M10 15h5v-5M15 6V1h-5M1 10v5h5"/></svg>' +
      '<span>Click to expand</span>';
    wrap.appendChild(hint);

    const fire = () => open(el.currentSrc || el.src, el.alt);
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

document.addEventListener('DOMContentLoaded', () => {
  if (typeof initNavActiveState === 'function') initNavActiveState();
  if (typeof initCardPreview === 'function') initCardPreview();
  initImageLightbox();
});
