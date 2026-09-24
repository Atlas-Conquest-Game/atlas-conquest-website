// Home page: live hero stats + the "Choose Your Commander" wheel.
// Standalone (doesn't load shared.js) — everything it needs is in here.

(function () {
  const NUMBER_WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty'];

  function slug(name) {
    return (name || '').toLowerCase().replace(/[,.']/g, '').replace(/\s+/g, '-');
  }

  function setText(selector, text) {
    document.querySelectorAll(selector).forEach(node => { node.textContent = text; });
  }

  async function loadJSON(path) {
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return res.json();
  }

  // ─── Hero stats ─────────────────────────────────────────

  function renderStats(commanders, cards, metadata) {
    if (commanders) {
      const n = commanders.length;
      setText('[data-stat="commanders"]', String(n));
      setText('[data-stat="commanders-word"]', NUMBER_WORDS[n] || String(n));
    }
    if (cards) {
      setText('[data-stat="cards"]', String(cards.filter(c => !c.token).length));
    }
    const all = metadata && metadata.all;
    if (all) {
      const total = all.all && all.all.total_matches;
      if (total) {
        // Round down to the nearest hundred so "+" stays truthful.
        const floored = total >= 1000 ? Math.floor(total / 100) * 100 : total;
        setText('[data-stat="matches"]', `${floored.toLocaleString()}+`);
      }
      const maps = Object.keys(all).filter(k => k !== 'all').length;
      if (maps) setText('[data-stat="maps"]', String(maps));
    }
  }

  // ─── Commander wheel ────────────────────────────────────

  const track = document.querySelector('.commander-scroll-track');
  const strip = document.querySelector('.commander-scroll');
  const detail = document.getElementById('commander-detail');
  const detailImg = document.getElementById('commander-detail-img');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const BASE_SPEED = reduceMotion ? 0 : -60;   // px/s; negative = drifting left
  const COPIES = 3;                            // enough to cover very wide screens

  let setWidth = 0;         // width of one full set of commanders (the wrap period)
  let offset = 0;           // current translateX
  let velocity = BASE_SPEED;
  let hovering = false;
  let dragging = false;
  let selected = null;
  const bySlug = {};        // slug → commander record (for mentions)

  function cardHTML(c, copy) {
    const s = slug(c.name);
    const hidden = copy > 0;
    return `<div class="commander-showcase-card" data-faction="${c.faction}" data-slug="${s}" data-name="${c.name.replace(/"/g, '&quot;')}"
        role="button" tabindex="${hidden ? -1 : 0}"${hidden ? ' aria-hidden="true"' : ''} aria-label="Show ${c.name.replace(/"/g, '&quot;')} card">
        <img src="assets/commanders/${s}.jpg" alt="" loading="lazy" draggable="false">
        <div class="commander-showcase-name">${c.name}</div>
      </div>`;
  }

  function renderWheel(commanders) {
    if (!strip || !commanders || !commanders.length) return;
    commanders.forEach(c => { bySlug[slug(c.name)] = c; });
    let html = '';
    for (let i = 0; i < COPIES; i++) html += commanders.map(c => cardHTML(c, i)).join('');
    strip.innerHTML = html;
    measure();
  }

  function measure() {
    const cards = strip.children;
    const perSet = cards.length / COPIES;
    if (perSet < 1) return;
    // Distance from the first card of set 0 to the first card of set 1, gap included.
    setWidth = cards[perSet].offsetLeft - cards[0].offsetLeft;
  }

  function wrap(x) {
    if (!setWidth) return x;
    // Keep offset in (-setWidth, 0]
    x = x % setWidth;
    return x > 0 ? x - setWidth : x;
  }

  function apply() {
    strip.style.transform = `translate3d(${offset}px,0,0)`;
  }

  let lastTs = 0;
  function tick(ts) {
    const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.05) : 0;
    lastTs = ts;
    if (!dragging) {
      const target = hovering ? 0 : BASE_SPEED;
      // Ease the fling velocity back toward the resting drift speed.
      velocity = target + (velocity - target) * Math.exp(-dt * 2.2);
      offset = wrap(offset + velocity * dt);
      apply();
    }
    requestAnimationFrame(tick);
  }

  // Dragging — pointer events cover mouse, touch and pen.
  let startX = 0, startOffset = 0, moved = false, pointerId = null;
  let samples = [];   // recent [time, x] pairs for fling velocity

  function onDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    pointerId = e.pointerId;
    dragging = true;
    moved = false;
    startX = e.clientX;
    startOffset = offset;
    samples = [[e.timeStamp, e.clientX]];
    track.classList.add('is-dragging');
  }

  function onMove(e) {
    if (!dragging || e.pointerId !== pointerId) return;
    const dx = e.clientX - startX;
    if (!moved && Math.abs(dx) > 6) {
      moved = true;
      try { track.setPointerCapture(pointerId); } catch (_) {}
    }
    if (!moved) return;
    offset = wrap(startOffset + dx);
    apply();
    samples.push([e.timeStamp, e.clientX]);
    const cutoff = e.timeStamp - 100;
    while (samples.length > 2 && samples[0][0] < cutoff) samples.shift();
  }

  function onUp(e) {
    if (!dragging || e.pointerId !== pointerId) return;
    dragging = false;
    track.classList.remove('is-dragging');
    if (moved && samples.length > 1) {
      const [t0, x0] = samples[0];
      const [t1, x1] = samples[samples.length - 1];
      const dt = (t1 - t0) / 1000;
      if (dt > 0 && e.timeStamp - t1 < 80) {
        velocity = Math.max(-4000, Math.min(4000, (x1 - x0) / dt));
      } else {
        velocity = 0;   // finger held still before release — no fling
      }
    }
    pointerId = null;
  }

  // Selecting a commander → show its card below the wheel.
  function select(card) {
    const s = card.dataset.slug;
    if (selected === s) { deselect(); return; }
    selected = s;
    strip.querySelectorAll('.commander-showcase-card').forEach(n => {
      n.classList.toggle('is-selected', n.dataset.slug === s);
    });
    // Transparent-corner PNG (same art the hover previews use); framed JPG as fallback.
    detailImg.dataset.fallback = `assets/cards/${s}.jpg`;
    detailImg.src = `assets/card-art-png/${s}.png`;
    detailImg.alt = `${card.dataset.name} card`;
    // Cards this commander creates (e.g. Elyse → Lucian Soldier) sit beside it.
    detail.querySelectorAll('.commander-detail-mention').forEach(n => n.remove());
    const mentions = (bySlug[s] && bySlug[s].mentions) || [];
    mentions.forEach(name => {
      const img = document.createElement('img');
      img.className = 'commander-detail-mention';
      img.src = `assets/card-art-png/${slug(name)}.png`;
      img.alt = name;
      img.title = name;
      img.draggable = false;
      img.onerror = () => img.remove();
      detailImg.parentNode.appendChild(img);
    });
    detail.classList.toggle('has-mentions', mentions.length > 0);
    detail.hidden = false;
    // Restart the reveal animation on each new pick.
    detail.classList.remove('is-open');
    void detail.offsetWidth;
    detail.classList.add('is-open');
    const rect = detail.getBoundingClientRect();
    if (rect.bottom > window.innerHeight) {
      detail.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
    }
  }

  function deselect() {
    selected = null;
    strip.querySelectorAll('.is-selected').forEach(n => n.classList.remove('is-selected'));
    detail.hidden = true;
    detail.classList.remove('is-open');
  }

  function initWheel() {
    if (!track || !strip) return;
    track.addEventListener('pointerdown', onDown);
    track.addEventListener('pointermove', onMove);
    track.addEventListener('pointerup', onUp);
    track.addEventListener('pointercancel', onUp);
    // Hover-pause is for mice only — touch emulates enter without a matching leave.
    track.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') hovering = true; });
    track.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hovering = false; });

    // Click fires after pointerup; swallow it if the pointer was dragged.
    strip.addEventListener('click', e => {
      if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; return; }
      const card = e.target.closest('.commander-showcase-card');
      if (card) select(card);
    });
    strip.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('.commander-showcase-card');
      if (card) { e.preventDefault(); select(card); }
    });
    // Keyboard focus should bring the card into view rather than leave it off-screen.
    strip.addEventListener('focusin', e => {
      const card = e.target.closest('.commander-showcase-card');
      if (!card) return;
      track.scrollLeft = 0;
      const trackRect = track.getBoundingClientRect();
      const r = card.getBoundingClientRect();
      if (r.left < trackRect.left || r.right > trackRect.right) {
        offset = wrap(offset + (trackRect.left + trackRect.width / 2) - (r.left + r.width / 2));
        velocity = 0;
        apply();
      }
    });

    document.getElementById('commander-detail-close')?.addEventListener('click', deselect);
    detailImg.addEventListener('error', () => {
      const fb = detailImg.dataset.fallback;
      if (fb) { delete detailImg.dataset.fallback; detailImg.src = fb; }
      else detailImg.alt = 'Card image unavailable';
    });

    window.addEventListener('resize', () => { measure(); offset = wrap(offset); apply(); });
    // Images are lazy — card widths are fixed in CSS, but re-measure once fonts settle.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);

    measure();
    requestAnimationFrame(tick);
  }

  // ─── Boot ───────────────────────────────────────────────

  initWheel();

  Promise.allSettled([
    loadJSON('data/commanders.json'),
    loadJSON('data/cards.json'),
    loadJSON('data/metadata.json'),
  ]).then(([cmd, cards, meta]) => {
    const commanders = cmd.status === 'fulfilled' ? cmd.value : null;
    renderStats(
      commanders,
      cards.status === 'fulfilled' ? cards.value : null,
      meta.status === 'fulfilled' ? meta.value : null,
    );
    if (commanders) renderWheel(commanders);
  });
})();
