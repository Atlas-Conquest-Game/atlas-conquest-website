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

// Anchor for a press kit group, e.g. "Steam capsules" -> "kit-steam-capsules".
const groupId = g => 'kit-' + g.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

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
      <section class="press-group" id="${groupId(g)}">
        <h3 class="press-group-title">${escapeHTML(g.title)}</h3>
        ${g.items.length ? `<div class="press-grid">${g.items.map(renderItem).join('')}</div>` : comingSoon(g.title)}
      </section>`).join('')
    : '<p class="press-kit-empty">Individual files are coming soon — the full press kit is available above.</p>';
  // The side panel's "Press kit" jump link becomes one link per group.
  const tocLink = document.querySelector('[data-toc-kit]');
  if (tocLink && groups.length) {
    tocLink.outerHTML = groups.map(g => `<a href="#${groupId(g)}">${escapeHTML(g.title)}</a>`).join('');
  }
}

/**
 * Click-to-enlarge for the asset previews, the same behaviour as the figure
 * lightbox on article pages (js/article.js): click the image for 1:1, click
 * the backdrop, the close button or press Escape to leave.
 */
function initLightbox() {
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

  // Previews are rendered after their manifests load, so listen on the page.
  document.addEventListener('click', (e) => {
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

/**
 * Copy buttons: `data-copy` holds the text itself, `data-copy-from` the id of
 * the element whose text to copy.
 */
function initCopyButtons() {
  document.querySelectorAll('[data-copy], [data-copy-from]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const original = btn.textContent;
      const source = btn.dataset.copyFrom && document.getElementById(btn.dataset.copyFrom);
      const text = source ? source.textContent.trim() : btn.dataset.copy;
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = 'Copied!';
      } catch {
        // No clipboard access: show a short value so it can be selected by hand.
        btn.textContent = source ? 'Copy failed' : text;
      }
      setTimeout(() => { btn.textContent = original; }, 2000);
    });
  });
}

/**
 * Live numbers in the fact sheet and feature list, from the same pipeline
 * output the home page reads. The HTML carries fallbacks if a file is missing.
 */
async function renderStats() {
  const load = url => fetch(url).then(res => (res.ok ? res.json() : null)).catch(() => null);
  const set = (stat, value) => document.querySelectorAll(`[data-stat="${stat}"]`).forEach(el => { el.textContent = value; });
  const [metadata, commanders, cards] = await Promise.all([
    load('data/metadata.json'), load('data/commanders.json'), load('data/cards.json'),
  ]);
  const all = metadata && metadata.all && metadata.all.all;
  if (all && all.total_players) set('players', all.total_players.toLocaleString('en-US'));
  if (all && all.total_matches) {
    // Round down to the nearest hundred so "+" stays truthful.
    const total = all.total_matches;
    set('matches', total >= 1000 ? (Math.floor(total / 100) * 100).toLocaleString('en-US') + '+' : String(total));
  }
  if (commanders) set('commanders', String(commanders.length));
  if (cards) set('cards', String(cards.filter(c => !c.token).length));
}

/**
 * Card images: every card's raw render, searchable by name. The list comes
 * from data/press_cards.json (scripts/build_press_cards.py). Single cards are
 * fetched from the repo on GitHub and saved under the card's own name; the
 * all-cards ZIP is a file on the press-kit release.
 */
const CARDS_SHOWN = 12;

async function initCards() {
  const section = document.getElementById('cards');
  const grid = document.getElementById('press-cards-grid');
  if (!section || !grid) return;
  let data;
  try {
    const res = await fetch('data/press_cards.json');
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
  } catch {
    return; // the section stays hidden
  }
  const cards = data.cards || [];
  if (!cards.length) return;
  section.hidden = false;

  const zip = data.zip || {};
  const zipLink = document.getElementById('press-cards-zip');
  if (zip.url) {
    zipLink.href = zip.url;
    document.getElementById('press-cards-zip-label').textContent =
      `Download all cards${zip.size ? ` (ZIP, ${zip.size})` : ''}`;
  } else {
    zipLink.hidden = true;
  }
  if (data.dimensions) document.getElementById('press-cards-dimensions').textContent = data.dimensions;

  const search = document.getElementById('press-cards-search');
  const count = document.getElementById('press-cards-count');

  function render() {
    const query = search.value.trim().toLowerCase();
    const matches = query ? cards.filter(c => c.name.toLowerCase().includes(query)) : cards;
    const shown = matches.slice(0, CARDS_SHOWN);
    count.textContent = !matches.length
      ? `No card matches "${search.value.trim()}".`
      : matches.length > shown.length
        ? `Showing ${shown.length} of ${matches.length}${query ? ' matches' : ' cards'}. Type more of the name to narrow it down.`
        : `${matches.length} ${matches.length === 1 ? 'card' : 'cards'}`;
    grid.innerHTML = shown.map(c => {
      const meta = [c.kind, c.faction].filter(Boolean).join(' · ');
      return `
      <article class="press-card">
        <button type="button" class="press-preview press-preview-zoom" data-large="assets/card-art-png/${escapeHTML(c.slug)}.png"
           data-caption="${escapeHTML(c.name)}" aria-label="View ${escapeHTML(c.name)} larger">
          <img src="assets/media/cards/${escapeHTML(c.slug)}.webp" alt="${escapeHTML(c.name)}" width="400" height="560" loading="lazy">
          <span class="press-zoom-hint">${EXPAND_ICON}<span>Click to expand</span></span>
        </button>
        <div class="press-card-body">
          <div>
            <h4 class="press-card-title">${escapeHTML(c.name)}</h4>
            <div class="press-card-meta">${escapeHTML(meta)}</div>
          </div>
          <div class="press-card-actions">
            <a class="press-dl" href="${escapeHTML(data.raw_base + encodeURIComponent(c.file))}" data-save-as="${escapeHTML(c.slug)}.png"
               target="_blank" rel="noopener" aria-label="Download ${escapeHTML(c.name)} as PNG">${DOWNLOAD_ICON}PNG</a>
          </div>
        </div>
      </article>`;
    }).join('');
  }

  // The PNGs are on another origin, where a plain link opens the image instead
  // of saving it. Fetch it and save the copy; if that fails the link still opens it.
  grid.addEventListener('click', async (e) => {
    const link = e.target.closest('a[data-save-as]');
    if (!link || link.dataset.busy) return;
    e.preventDefault();
    link.dataset.busy = '1';
    try {
      const res = await fetch(link.href);
      if (!res.ok) throw new Error(res.status);
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = link.dataset.saveAs;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      window.open(link.href, '_blank', 'noopener');
    } finally {
      delete link.dataset.busy;
    }
  });

  search.addEventListener('input', render);
  render();
}

// The "Coming soon" tip shows on hover or focus, but iOS Safari doesn't focus
// a tapped button, so a tap shows it for a moment instead.
function initSoonTips() {
  document.querySelectorAll('.press-soon').forEach(btn => {
    let timer;
    btn.addEventListener('click', () => {
      btn.classList.add('show-tip');
      clearTimeout(timer);
      timer = setTimeout(() => btn.classList.remove('show-tip'), 1800);
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initCopyButtons();
  initSoonTips();
  renderStats();
  initLightbox();
  renderPressKit();
  initCards();
});
