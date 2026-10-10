/**
 * Atlas Conquest — Press page
 *
 * Renders the press kit from data/press_kit.json. Files live in the public
 * Google Drive press-kit folder; previews are small local WebP copies built by
 * scripts/build_press_kit.py (hotlinked Drive thumbnails are slow and get
 * rate-limited), plus a larger one each that opens in a lightbox when the
 * preview is clicked. Standalone page: does not use shared.js.
 */

const DRIVE_DOWNLOAD = id => `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
const DRIVE_VIEW = id => `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;

const EXPAND_ICON = '<svg aria-hidden="true" width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 1H1v5M10 15h5v-5M15 6V1h-5M1 10v5h5"/></svg>';
const DOWNLOAD_ICON = '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>';

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function renderItem(item) {
  const files = (item.files || []).filter(f => f.id);
  // `label` names a variant when two files share a format (key art with and without the logo).
  const downloads = files.map(f => `
    <a class="press-dl" href="${DRIVE_DOWNLOAD(f.id)}" download
       aria-label="Download ${escapeHTML(item.title)}${f.label ? `, ${escapeHTML(f.label.toLowerCase())},` : ''} as ${escapeHTML(f.format)}${f.size ? ` (${escapeHTML(f.size)})` : ''}">
      ${DOWNLOAD_ICON}${escapeHTML(f.label || f.format)}${f.size ? ` <span class="press-card-meta">${escapeHTML(f.size)}</span>` : ''}
    </a>`).join('');
  // "View" opens the first file in Drive's viewer — handy for checking before downloading.
  const view = files.length
    ? `<a class="press-dl press-dl-view" href="${DRIVE_VIEW(files[0].id)}" target="_blank" rel="noopener">View</a>`
    : '';
  const image = `<img src="${escapeHTML(item.preview)}" alt="${escapeHTML(item.title)} preview" loading="lazy">`;
  const caption = [item.title, item.dimensions].filter(Boolean).join(' · ');
  // With a larger copy built, the preview is a button that opens it in the lightbox.
  const preview = item.large
    ? `<button type="button" class="press-preview press-preview-zoom" data-large="${escapeHTML(item.large)}"
         data-caption="${escapeHTML(caption)}" aria-label="View ${escapeHTML(item.title)} larger">
        ${image}
        <span class="press-zoom-hint">${EXPAND_ICON}<span>Click to expand</span></span>
      </button>`
    : `<div class="press-preview">${image}</div>`;
  return `
    <article class="press-card">
      ${preview}
      <div class="press-card-body">
        <div>
          <h4 class="press-card-title">${escapeHTML(item.title)}</h4>
          <div class="press-card-meta">${escapeHTML(item.dimensions || '')}${item.note ? ` · ${escapeHTML(item.note)}` : ''}</div>
        </div>
        <div class="press-card-actions">${downloads}${view}</div>
      </div>
    </article>`;
}

async function renderPressKit() {
  const root = document.getElementById('press-kit-groups');
  let kit;
  try {
    const res = await fetch('data/press_kit.json');
    if (!res.ok) throw new Error(res.status);
    kit = await res.json();
  } catch {
    root.innerHTML = '<p class="press-kit-empty">Couldn\'t load the asset list — use "Download full press kit" above.</p>';
    return;
  }
  if (kit.folder_url) document.getElementById('press-kit-folder').href = kit.folder_url;
  // Only list assets that are actually downloadable and have a built preview;
  // anything else is still reachable through the full-kit folder link. A group
  // flagged `coming_soon` in the manifest shows a placeholder until it has
  // ready items of its own.
  const ready = item => item.preview && (item.files || []).some(f => f.id);
  const groups = (kit.groups || [])
    .map(g => ({ ...g, items: (g.items || []).filter(ready) }))
    .filter(g => g.items.length || g.coming_soon);
  const comingSoon = title => `
    <div class="press-coming-soon" role="note">
      <span class="press-coming-soon-label">Coming soon</span>
      <span class="press-coming-soon-text">${escapeHTML(title)} will be added here shortly.</span>
    </div>`;
  root.innerHTML = groups.length
    ? groups.map(g => `
      <section class="press-group">
        <h3 class="press-group-title">${escapeHTML(g.title)}</h3>
        ${g.items.length ? `<div class="press-grid">${g.items.map(renderItem).join('')}</div>` : comingSoon(g.title)}
      </section>`).join('')
    : '<p class="press-kit-empty">Individual files are coming soon — the full press kit is available above.</p>';
}

/**
 * Click-to-enlarge for the asset previews, the same behaviour as the figure
 * lightbox on article pages (js/article.js): click the image for 1:1, click
 * the backdrop, the close button or press Escape to leave.
 */
function initLightbox() {
  const root = document.getElementById('press-kit-groups');
  const box = document.createElement('div');
  box.className = 'press-lightbox';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.innerHTML =
    '<button class="press-lightbox-close" type="button" aria-label="Close">&#10005;</button>' +
    '<img class="press-lightbox-img" alt="">' +
    '<p class="press-lightbox-caption" aria-hidden="true"></p>';
  document.body.appendChild(box);

  const img = box.querySelector('.press-lightbox-img');
  const caption = box.querySelector('.press-lightbox-caption');
  const closeBtn = box.querySelector('.press-lightbox-close');
  let lastFocus = null;

  function open(trigger) {
    lastFocus = trigger;
    img.src = trigger.dataset.large;
    img.alt = trigger.dataset.caption || '';
    caption.textContent = trigger.dataset.caption || '';
    box.classList.remove('zoomed');
    box.classList.add('open');
    document.body.style.overflow = 'hidden';
    closeBtn.focus();
  }

  function close() {
    if (!box.classList.contains('open')) return;
    box.classList.remove('open', 'zoomed');
    document.body.style.overflow = '';
    img.removeAttribute('src');
    if (lastFocus) lastFocus.focus();
  }

  // The cards are rendered after the manifest loads, so listen on their container.
  root.addEventListener('click', (e) => {
    const trigger = e.target.closest('.press-preview-zoom');
    if (trigger) open(trigger);
  });
  img.addEventListener('click', (e) => {
    e.stopPropagation();
    if (box.classList.toggle('zoomed')) {
      box.scrollLeft = (box.scrollWidth - box.clientWidth) / 2;
      box.scrollTop = (box.scrollHeight - box.clientHeight) / 2;
    }
  });
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    close();
  });
  box.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
}

function initCopyEmail() {
  const btn = document.getElementById('copy-email');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const original = btn.textContent;
    try {
      await navigator.clipboard.writeText(btn.dataset.email);
      btn.textContent = 'Copied!';
    } catch {
      btn.textContent = btn.dataset.email;
    }
    setTimeout(() => { btn.textContent = original; }, 2000);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initCopyEmail();
  initLightbox();
  renderPressKit();
});
