/**
 * Atlas Conquest — Press page
 *
 * Renders the press kit from data/press_kit.json. Files live in the public
 * Google Drive press-kit folder; previews are small local WebP copies built by
 * scripts/build_press_kit.py (hotlinked Drive thumbnails are slow and get
 * rate-limited). Standalone page: does not use shared.js.
 */

const DRIVE_DOWNLOAD = id => `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
const DRIVE_VIEW = id => `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;

const DOWNLOAD_ICON = '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>';

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function renderItem(item) {
  const files = (item.files || []).filter(f => f.id);
  const downloads = files.map(f => `
    <a class="press-dl" href="${DRIVE_DOWNLOAD(f.id)}" download
       aria-label="Download ${escapeHTML(item.title)} as ${escapeHTML(f.format)}${f.size ? ` (${escapeHTML(f.size)})` : ''}">
      ${DOWNLOAD_ICON}${escapeHTML(f.format)}${f.size ? ` <span class="press-card-meta">${escapeHTML(f.size)}</span>` : ''}
    </a>`).join('');
  // "View" opens the first file in Drive's viewer — handy for checking before downloading.
  const view = files.length
    ? `<a class="press-dl press-dl-view" href="${DRIVE_VIEW(files[0].id)}" target="_blank" rel="noopener">View</a>`
    : '';
  return `
    <article class="press-card">
      <div class="press-preview">
        <img src="${escapeHTML(item.preview)}" alt="${escapeHTML(item.title)} preview" loading="lazy">
      </div>
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
  // anything else is still reachable through the full-kit folder link.
  const ready = item => item.preview && (item.files || []).some(f => f.id);
  const groups = (kit.groups || [])
    .map(g => ({ ...g, items: (g.items || []).filter(ready) }))
    .filter(g => g.items.length);
  root.innerHTML = groups.length
    ? groups.map(g => `
      <section class="press-group">
        <h3 class="press-group-title">${escapeHTML(g.title)}</h3>
        <div class="press-grid">${g.items.map(renderItem).join('')}</div>
      </section>`).join('')
    : '<p class="press-kit-empty">Individual files are coming soon — the full press kit is available above.</p>';
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
  renderPressKit();
});
