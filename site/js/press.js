/**
 * Atlas Conquest — Press page
 *
 * Renders the press kit from data/press_kit.json. Files live in the public
 * Google Drive press-kit folder; previews are small local WebP copies built by
 * scripts/build_press_kit.py (hotlinked Drive thumbnails are slow and get
 * rate-limited), plus a larger one each that opens in a lightbox when the
 * preview is clicked. Standalone page: does not use shared.js.
 */

// Translations: localized copies of this page (site/<lang>/) carry window.AC_I18N, written by
// scripts/build_i18n.py. t() returns the English when there is no translation; ROOT makes
// asset paths work from /<lang>/. build_i18n.py collects the string literal of every t() call.
const I18N = window.AC_I18N || {};
const ROOT = I18N.root || '';
const t = (s, ...args) => ((I18N.strings || {})[s] || s).replace(/\{(\d+)\}/g, (_, i) => args[i]);

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
  // A file is on Drive (`id`) or has a `url`: on this site (relative) or the card host (absolute).
  const files = (item.files || []).filter(f => f.id || f.url);
  // `label` names a variant when two files share a format (key art with and without the logo).
  const title = t(item.title);
  const downloads = files.map(f => {
    const what = f.label ? `${title}, ${t(f.label).toLowerCase()}` : title;
    return `
    <a class="press-dl" href="${f.url ? escapeHTML(/^https?:/.test(f.url) ? f.url : ROOT + f.url) : DRIVE_DOWNLOAD(f.id)}" download
       aria-label="${escapeHTML(t('Download {0} as {1}', what, f.format))}${f.size ? ` (${escapeHTML(f.size)})` : ''}">
      ${DOWNLOAD_ICON}${escapeHTML(f.label ? t(f.label) : f.format)}${f.size ? ` <span class="press-card-meta">${escapeHTML(f.size)}</span>` : ''}
    </a>`;
  }).join('');
  // "View" opens the first file in Drive's viewer (or the item's `view_url`, the trailer's web
  // encode) — handy for checking before downloading.
  const viewUrl = item.view_url || (files.length && files[0].id ? DRIVE_VIEW(files[0].id) : '');
  const view = viewUrl
    ? `<a class="press-dl press-dl-view" href="${escapeHTML(viewUrl)}" target="_blank" rel="noopener">${escapeHTML(t('View'))}</a>`
    : '';
  const image = `<img src="${escapeHTML(ROOT + item.preview)}" alt="${escapeHTML(t('{0} preview', title))}" loading="lazy">`;
  const caption = [title, item.dimensions && t(item.dimensions)].filter(Boolean).join(' · ');
  // With a larger copy built, the preview is a button that opens it in the lightbox.
  const preview = item.large
    ? `<button type="button" class="press-preview press-preview-zoom" data-large="${escapeHTML(ROOT + item.large)}"
         data-caption="${escapeHTML(caption)}" aria-label="${escapeHTML(t('View {0} larger', title))}">
        ${image}
        <span class="press-zoom-hint">${EXPAND_ICON}<span>${escapeHTML(t('Click to expand'))}</span></span>
      </button>`
    : `<div class="press-preview">${image}</div>`;
  return `
    <article class="press-card">
      ${preview}
      <div class="press-card-body">
        <div>
          <h4 class="press-card-title">${escapeHTML(title)}</h4>
          <div class="press-card-meta">${[item.dimensions, item.note].filter(Boolean).map(v => escapeHTML(t(v))).join(' · ')}</div>
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
    const res = await fetch(ROOT + 'data/press_kit.json');
    if (!res.ok) throw new Error(res.status);
    kit = await res.json();
  } catch {
    root.innerHTML = `<p class="press-kit-empty">${escapeHTML(t('Couldn\'t load the asset list — use "Download full press kit" above.'))}</p>`;
    return;
  }
  if (kit.folder_url) document.getElementById('press-kit-folder').href = kit.folder_url;
  // The trailer sits in Videos as a single cell with the page language's cut, one download per
  // size, then every language's downloads in a collapsed list. The files are on the card host
  // (scripts/stage_trailers.py); without them the page keeps its "Coming soon" note.
  const trailer = kit.trailer;
  if (trailer && trailer.preview && (trailer.languages || []).length) {
    const title = t(trailer.title);
    const fileFor = (lang, f) => ({
      ...f, size: lang.sizes[f.res],
      url: `${trailer.base}/${lang.code}/AtlasConquest_Announcement_Trailer_${trailer.version}_${lang.code}_${f.res}.mp4`,
    });
    const own = trailer.languages.find(l => l.code === (I18N.locale || 'en')) || trailer.languages[0];
    const cell = renderItem({
      ...trailer,
      files: trailer.files.map(f => fileFor(own, f)),
      view_url: `${trailer.base}/web/AtlasConquest_Trailer_${trailer.version}_${own.code}_1080.mp4`,
    });
    const rows = trailer.languages.map(lang => `
      <li${lang === own ? ' class="is-current"' : ''}>
        <span class="press-trailer-lang" lang="${escapeHTML(lang.code)}">${escapeHTML(lang.native)}</span>
        <span class="press-trailer-dls">${trailer.files.map(f => {
          const file = fileFor(lang, f);
          return `<a class="press-dl" href="${escapeHTML(file.url)}" download
            aria-label="${escapeHTML(t('Download {0} as {1}', `${title}, ${lang.native}, ${f.res}`, f.format))} (${escapeHTML(file.size)})">
            ${DOWNLOAD_ICON}${escapeHTML(f.res)} <span class="press-card-meta">${escapeHTML(file.size)}</span></a>`;
        }).join('')}</span>
      </li>`).join('');
    document.getElementById('press-trailer').innerHTML =
      `<div class="press-grid press-grid-trailer">${cell}</div>
      <details class="press-long-box press-trailer-langs">
        <summary>${escapeHTML(t('All languages'))} (${trailer.languages.length})</summary>
        <ul>${rows}</ul>
      </details>`;
  }
  // Only list assets that are actually downloadable and have a built preview;
  // anything else is still reachable through the full-kit folder link. A group
  // flagged `coming_soon` in the manifest shows a placeholder until it has
  // ready items of its own.
  const ready = item => item.preview && (item.files || []).some(f => f.id || f.url);
  const groups = (kit.groups || [])
    .map(g => ({ ...g, items: (g.items || []).filter(ready) }))
    .filter(g => g.items.length || g.coming_soon);
  const comingSoon = title => `
    <div class="press-coming-soon" role="note">
      <span class="press-coming-soon-label">${escapeHTML(t('Coming soon'))}</span>
      <span class="press-coming-soon-text">${escapeHTML(t('{0} will be added here shortly.', t(title)))}</span>
    </div>`;
  root.innerHTML = groups.length
    ? groups.map(g => `
      <section class="press-group" id="${groupId(g)}">
        <h3 class="press-group-title">${escapeHTML(t(g.title))}</h3>
        ${g.note ? `<p class="press-group-note">${escapeHTML(t(g.note))}</p>` : ''}
        ${g.items.length ? `<div class="press-grid">${g.items.map(renderItem).join('')}</div>` : comingSoon(g.title)}
      </section>`).join('')
    : `<p class="press-kit-empty">${escapeHTML(t('Individual files are coming soon — the full press kit is available above.'))}</p>`;
  // The side panel's "Press kit" jump link becomes one link per group.
  const tocLink = document.querySelector('[data-toc-kit]');
  if (tocLink && groups.length) {
    tocLink.outerHTML = groups.map(g => `<a href="#${groupId(g)}">${escapeHTML(t(g.title))}</a>`).join('');
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
      // innerText keeps the paragraph breaks of a multi-paragraph source.
      const text = source ? source.innerText.trim() : btn.dataset.copy;
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = t('Copied!');
      } catch {
        // No clipboard access: show a short value so it can be selected by hand.
        btn.textContent = source ? t('Copy failed') : text;
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
    load(ROOT + 'data/metadata.json'), load(ROOT + 'data/commanders.json'), load(ROOT + 'data/cards.json'),
  ]);
  const all = metadata && metadata.all && metadata.all.all;
  const numbers = I18N.locale || 'en-US';
  if (all && all.total_players) set('players', all.total_players.toLocaleString(numbers));
  if (all && all.total_matches) {
    // Round down to the nearest hundred so "+" stays truthful.
    const total = all.total_matches;
    set('matches', total >= 1000 ? (Math.floor(total / 100) * 100).toLocaleString(numbers) + '+' : String(total));
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
    const res = await fetch(ROOT + 'data/press_cards.json');
    if (!res.ok) throw new Error(res.status);
    data = await res.json();
  } catch {
    return; // the section stays hidden
  }
  // A localized page shows each card's name in its language, and its render once the renders
  // are on the card host (AC_I18N.cards.live); until then the English renders stand in.
  let local = { cards: {}, zip: null };
  if (I18N.slug) {
    try {
      const res = await fetch(`${ROOT}data/i18n/${I18N.slug}.json`);
      if (res.ok) local = await res.json();
    } catch { /* English names */ }
  }
  const live = Boolean(I18N.slug && I18N.cards && I18N.cards.live);
  const host = live ? `${I18N.cards.base}/${I18N.slug}` : '';
  const nameOf = c => (local.cards && local.cards[c.name]) || c.name;
  // The card host serves the PNGs with Content-Disposition: attachment, so a plain link saves
  // the file. No fetch, so no CORS: Cloudflare's edge cache keeps whichever copy it saw first,
  // and the lightbox's plain <img> request would cache one without CORS headers. `?download`
  // gives the button its own cache entry.
  const art = c => (live
    ? { preview: `${host}/webp/${c.slug}.webp`, large: `${host}/png/${c.slug}.png`,
        file: `${host}/png/${c.slug}.png?download`, direct: true }
    : { preview: `${ROOT}assets/media/cards/${c.slug}.webp`, large: `${ROOT}assets/card-art-png/${c.slug}.png`,
        file: data.raw_base + encodeURIComponent(c.file) });
  // A localized render that fails to load falls back to the English one.
  grid.addEventListener('error', (e) => {
    const img = e.target;
    if (img.tagName === 'IMG' && img.dataset.fallback) { img.src = img.dataset.fallback; delete img.dataset.fallback; }
  }, true);
  const cards = data.cards || [];
  if (!cards.length) return;
  section.hidden = false;

  const zip = (live && local.zip) || data.zip || {};
  const zipLink = document.getElementById('press-cards-zip');
  if (zip.url) {
    zipLink.href = zip.url;
    document.getElementById('press-cards-zip-label').textContent =
      zip.size ? t('Download all cards (ZIP, {0})', zip.size) : t('Download all cards');
  } else {
    zipLink.hidden = true;
  }
  if (data.dimensions) document.getElementById('press-cards-dimensions').textContent = data.dimensions;

  const search = document.getElementById('press-cards-search');
  const count = document.getElementById('press-cards-count');

  function render() {
    const query = search.value.trim().toLowerCase();
    // Search also finds a card by its English name, which press often already has.
    const matches = query
      ? cards.filter(c => nameOf(c).toLowerCase().includes(query) || c.name.toLowerCase().includes(query))
      : cards;
    const shown = matches.slice(0, CARDS_SHOWN);
    count.textContent = !matches.length
      ? t('No card matches "{0}".', search.value.trim())
      : matches.length > shown.length
        ? t('Showing {0} of {1}. Type more of the name to narrow it down.', shown.length, matches.length)
        : t('Cards: {0}', matches.length);
    grid.innerHTML = shown.map(c => {
      const meta = [c.kind && t(c.kind), c.faction].filter(Boolean).join(' · ');
      const name = nameOf(c);
      const a = art(c);
      const fallback = live ? ` data-fallback="${escapeHTML(`${ROOT}assets/media/cards/${c.slug}.webp`)}"` : '';
      return `
      <article class="press-card">
        <button type="button" class="press-preview press-preview-zoom" data-large="${escapeHTML(a.large)}"
           data-caption="${escapeHTML(name)}" aria-label="${escapeHTML(t('View {0} larger', name))}">
          <img src="${escapeHTML(a.preview)}"${fallback} alt="${escapeHTML(name)}" width="400" height="560" loading="lazy">
          <span class="press-zoom-hint">${EXPAND_ICON}<span>${escapeHTML(t('Click to expand'))}</span></span>
        </button>
        <div class="press-card-body">
          <div>
            <h4 class="press-card-title">${escapeHTML(name)}</h4>
            <div class="press-card-meta">${escapeHTML(meta)}</div>
          </div>
          <div class="press-card-actions">
            <a class="press-dl" href="${escapeHTML(a.file)}"${a.direct ? ' download' : ` data-save-as="${escapeHTML(c.slug)}.png"
               target="_blank" rel="noopener"`} aria-label="${escapeHTML(t('Download {0} as PNG', name))}">${DOWNLOAD_ICON}PNG</a>
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

// Language menu: a click anywhere else closes it.
document.addEventListener('click', (e) => {
  document.querySelectorAll('.lang-switch[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; });
});

document.addEventListener('DOMContentLoaded', () => {
  initCopyButtons();
  initSoonTips();
  renderStats();
  initLightbox();
  renderPressKit();
  initCards();
});
