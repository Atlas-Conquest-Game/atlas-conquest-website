/* ==========================================================================
   Atlas Conquest — "Living Board" concept: page chrome, sections and data.
   All outbound links live in CONFIG — change them here.
   ========================================================================== */
const CONFIG = {
  primaryCta: 'discord',                       // 'discord' = Join the Beta leads everywhere; flip to 'steam' (with the URL below) when the store page is live
  steam: '',                                   // '' = store page not live yet → "Wishlist on Steam" shows a "Soon" state
  discord: 'https://discord.gg/7QaEY4yJH5',
  youtubeTrailerId: 'hPoGfdLZThA',                        // '' = play the local trailer.mp4; set an id to use a youtube-nocookie embed
  x: 'https://x.com/Atlas_Conquest',
  instagram: 'https://www.instagram.com/atlasconquest/',
  tiktok: 'https://www.tiktok.com/@atlas.conquest',
  press: '../../press.html',
};

(function () {
  'use strict';
  document.documentElement.classList.add('js');

  const ASSETS = '../../assets/';
  const DATA = '../../data/';
  const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const slugify = (name) => (name || '').toLowerCase().replace(/[,.']/g, '').replace(/\s+/g, '-');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => Number(n).toLocaleString('en-US');
  const FACTION = {
    skaal: { name: 'Skaal', color: '#D55E00', title: 'Goddess of War', blurb: 'Aggressive minions and destructive magic. Overwhelm them before they stabilize.' },
    grenalia: { name: 'Grenalia', color: '#009E73', title: 'Goddess of Nature', blurb: 'Mana growth, poisons and massive creatures. Ramp into overwhelming force.' },
    lucia: { name: 'Lucia', color: '#E8B630', title: 'Goddess of Light', blurb: 'Unified armies, healing and villages. Outlast the competition.' },
    shadis: { name: 'Shadis', color: '#7B7B8E', title: 'God of Shadows', blurb: 'Stealth, deception and dark magic. Control through cunning.' },
    archaeon: { name: 'Archaeon', color: '#0072B2', title: 'God of Knowledge', blurb: 'Ancient power, artifacts and strategy. Outthink your opponent.' },
    neutral: { name: 'Neutral', color: '#A89078', title: 'Unaligned', blurb: 'Mercenaries any commander can field. Two commanders lead from outside the pantheon.' },
  };
  const loadJSON = (f) => fetch(DATA + f, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(f + ' ' + r.status); return r.json(); });
  const cache = {};
  const getJSON = (f) => (cache[f] = cache[f] || loadJSON(f));

  // ─── Links from CONFIG ──────────────────────────────────
  $$('[data-link]').forEach((a) => {
    const v = CONFIG[a.dataset.link];
    if (v) a.href = v;
    else a.closest('li') ? a.closest('li').remove() : a.remove();
  });

  // ─── Steam CTA: live link or tasteful "coming soon" ─────
  const pop = $('#steam-pop');
  let popTimer = 0;
  function hidePop() { if (pop) pop.hidden = true; }
  // While the store page isn't live, the working action (Join the Beta) leads and Steam shows an
  // outlined "Soon" state. Set CONFIG.steam and the Steam buttons become real links; set primaryCta to 'steam'
  // as well and Steam becomes the gold primary everywhere.
  const steamPrimary = !!CONFIG.steam && CONFIG.primaryCta === 'steam';

  // Nav call to action follows primaryCta: when Steam leads, the nav button becomes the store link.
  function flipNavToSteam() {
    document.querySelectorAll('.nav-cta, .nav-cta-mobile').forEach((a) => {
      a.href = CONFIG.steam; a.target = '_blank'; a.rel = 'noopener';
      a.removeAttribute('data-link');
      const use = a.querySelector('use');
      if (use) use.setAttribute('href', '#i-steam');
      const walker = document.createTreeWalker(a, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (/Join the Beta/i.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(/Join the Beta/i, 'Wishlist on Steam');
      }
    });
  }
  if (steamPrimary) flipNavToSteam();
  $$('[data-steam]').forEach((el) => {
    if (CONFIG.steam) {
      const a = document.createElement('a');
      a.className = steamPrimary ? el.className.replace('btn-outline', 'btn-gold') : el.className;
      a.href = CONFIG.steam; a.target = '_blank'; a.rel = 'noopener';
      a.innerHTML = el.innerHTML;
      $$('.soon-pill', a).forEach((p) => p.remove());
      const label = $('[data-steam-label]', a);
      if (label) label.textContent = 'Wishlist on Steam';
      if (el.classList.contains('linklike')) a.textContent = 'Wishlist on Steam';
      const group = el.closest('[data-cta-group]');
      el.replaceWith(a);
      if (group && steamPrimary) {
        group.prepend(a);
        $$('[data-cta="beta"]', group).forEach((b) => { b.classList.remove('btn-gold'); b.classList.add('btn-glass'); });
      }
    } else {
      el.setAttribute('aria-describedby', 'steam-pop');
      el.addEventListener('click', () => {
        if (!pop) return;
        pop.hidden = false;
        clearTimeout(popTimer);
        popTimer = setTimeout(hidePop, 9000);
      });
    }
  });
  if (pop) $('.steam-pop-x', pop).addEventListener('click', hidePop);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hidePop(); });

  // ─── Nav ────────────────────────────────────────────────
  const nav = $('#nav');
  const burger = $('.nav-burger');
  const onScroll = () => nav.classList.toggle('is-solid', window.scrollY > 40);
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  function setMenu(open) {
    nav.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }
  burger.addEventListener('click', () => setMenu(!nav.classList.contains('is-open')));
  $$('#nav-links a').forEach((a) => a.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('is-open')) { setMenu(false); burger.focus(); } });
  window.addEventListener('resize', () => { if (window.innerWidth > 860) setMenu(false); });

  // ─── Trailer modal ──────────────────────────────────────
  const modal = $('#trailer-modal');
  const player = $('[data-player]', modal);
  let opener = null;
  function openTrailer(e) {
    opener = e && e.currentTarget;
    if (CONFIG.youtubeTrailerId) {
      const id = encodeURIComponent(CONFIG.youtubeTrailerId);
      player.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1" title="Atlas Conquest trailer" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
    } else {
      player.innerHTML = `<video controls autoplay playsinline preload="auto" poster="${ASSETS}media/stills/t62_5.webp" src="${ASSETS}media/video/trailer.mp4"><p>Your browser can’t play this video.</p></video>`;
    }
    if (modal.showModal) modal.showModal(); else modal.setAttribute('open', '');
    const v = $('video', player);
    if (v) { const p = v.play(); if (p && p.catch) p.catch(() => {}); }
    $('[data-close]', modal).focus();
  }
  function closeTrailer() { if (modal.open) { if (modal.close) modal.close(); else modal.removeAttribute('open'); } }
  modal.addEventListener('close', () => { player.innerHTML = ''; if (opener && opener.focus) opener.focus(); });
  modal.addEventListener('click', (e) => { if (e.target === modal) closeTrailer(); });
  $('[data-close]', modal).addEventListener('click', closeTrailer);
  modal.addEventListener('keydown', (e) => { // focus trap (backup for browsers without inert backdrop)
    if (e.key === 'Escape') { e.preventDefault(); closeTrailer(); return; }
    if (e.key !== 'Tab') return;
    const f = $$('button, [href], video, iframe, [tabindex]:not([tabindex="-1"])', modal);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  $$('[data-trailer]').forEach((b) => b.addEventListener('click', openTrailer));

  // ─── Lazy video helpers ─────────────────────────────────
  function primePoster(v) { if (v.dataset.poster && !v.poster) v.poster = v.dataset.poster; }
  function ensureSrc(v) { if (!v.src && v.dataset.src) { v.src = v.dataset.src; } }
  function playV(v) { if (RM) return; ensureSrc(v); const p = v.play(); if (p && p.catch) p.catch(() => {}); }
  const posterIO = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    const v = e.target.matches('video') ? e.target : $('video.is-active', e.target) || $('video[data-poster]', e.target);
    if (v) primePoster(v);
    posterIO.unobserve(e.target);
  }), { rootMargin: '400px 0px' }) : null;

  // CTA band background
  const ctaVideo = $('.cta-video');
  if (ctaVideo && posterIO) {
    posterIO.observe(ctaVideo);
    new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) playV(ctaVideo); else ctaVideo.pause(); }), { threshold: 0.15 }).observe(ctaVideo);
  }

  // ─── HOW IT PLAYS stepper ───────────────────────────────
  const STEPS = [
    { name: 'Deploy', title: 'Play cards on the battlefield',
      text: 'Minions are played onto tiles you have claimed and become characters on the board. Spells are one-time effects — cast, resolved, gone.',
      rules: ['<b>Minions</b> enter play on a tile you’ve claimed', '<b>Spells</b> resolve once, then disappear', 'Cards with the <b>Deploy</b> keyword can land outside your territory'] },
    { name: 'Expand', title: 'Expand your territory',
      text: 'Claim tiles to grow your territory. Every tile you hold produces mana, and your territory is where your army can land.',
      rules: ['<b>1 mana</b> per tile each turn, <b>2</b> per village', 'Mana from new tiles arrives <b>next turn</b>', '<b>Mountains</b> are impassable without <b>Flying</b>'] },
    { name: 'Command', title: 'Command your army',
      text: 'Move characters across the hexes, then drag one onto an enemy to battle. Both deal their Power as damage at the same time — and damage persists.',
      rules: ['<b>Speed</b> is how many tiles a character moves', '<b>One attack</b> per character per turn', 'If the defender falls, the attacker <b>takes its tile</b>'] },
    { name: 'Upgrade', title: 'Upgrade your deck',
      text: 'Build a 40–60 card deck around your commander from 280+ cards. Your commander’s patron god decides which cards make the cut.',
      rules: ['<b>40–60</b> cards, up to <b>3</b> copies of each', 'Your <b>patron’s</b> cards plus <b>neutral</b> cards', '<b>16</b> commanders, each with a unique ability'] },
    { name: 'Conquer', title: 'Conquer your opponent',
      text: 'Every match is a 1v1 duel. Break their line, outplay their commander’s ability, and bring the enemy commander’s Health to zero.',
      rules: ['Defeat the <b>enemy commander</b> to win', '<b>Trample</b>: a kill lets the attacker strike again', '<b>Haste</b>: move and attack the turn it’s played'] },
  ];
  const STEP_MS = 7500;
  const how = $('#how');
  const tabs = $$('.how-tab', how);
  const vids = $$('.how-video', how);
  const panel = $('#how-panel');
  const autoBtn = $('.how-auto', how);
  const howCopy = $('.how-copy', how);
  let step = 0, auto = !RM, howVisible = false, hovering = false, elapsed = 0, lastT = 0, howRaf = 0;


  function renderStepCopy(i) {
    const s = STEPS[i];
    $('[data-how="num"]', how).textContent = String(i + 1).padStart(2, '0');
    $('[data-how="name"]', how).textContent = s.name;
    $('[data-how="title"]', how).textContent = s.title;
    $('[data-how="text"]', how).textContent = s.text;
    $('[data-how="rules"]', how).innerHTML = s.rules.map((r) => `<li>${r}</li>`).join('');
  }
  function setStep(i, focus, user) {
    step = (i + STEPS.length) % STEPS.length;
    // announce the new copy only when the visitor changed the step, never during auto-advance
    howCopy.setAttribute('aria-live', user ? 'polite' : 'off');
    tabs.forEach((t, j) => {
      const on = j === step;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $('.how-bar i', t).style.transform = 'scaleX(0)';
    });
    if (focus) tabs[step].focus();
    panel.setAttribute('aria-labelledby', tabs[step].id);
    vids.forEach((v, j) => {
      const on = j === step;
      v.classList.toggle('is-active', on);
      if (on) { primePoster(v); if (howVisible) { try { v.currentTime = 0; } catch (e) { /* not loaded yet */ } playV(v); } }
      else v.pause();
    });
    renderStepCopy(step);
    elapsed = 0;
  }
  function setAuto(on) {
    auto = on;
    autoBtn.setAttribute('aria-pressed', String(on));
    $('span', autoBtn).textContent = on ? 'Pause steps' : 'Play steps';
    if (!on) $('.how-bar i', tabs[step]).style.transform = 'scaleX(0)';
  }
  function tick(t) {
    howRaf = 0;
    const dt = lastT ? Math.min(t - lastT, 100) : 0; lastT = t;
    if (auto && howVisible && !hovering && !document.hidden) {
      elapsed += dt;
      $('.how-bar i', tabs[step]).style.transform = `scaleX(${Math.min(elapsed / STEP_MS, 1)})`;
      if (elapsed >= STEP_MS) setStep(step + 1);
    }
    if (howVisible && auto) howRaf = requestAnimationFrame(tick); else lastT = 0;
  }
  function wake() { if (!howRaf && howVisible && auto) { lastT = 0; howRaf = requestAnimationFrame(tick); } }

  tabs.forEach((t, i) => {
    t.addEventListener('click', () => { setAuto(false); setStep(i, false, true); });
    t.addEventListener('keydown', (e) => {
      const k = e.key;
      let n = null;
      if (k === 'ArrowDown' || k === 'ArrowRight') n = step + 1;
      else if (k === 'ArrowUp' || k === 'ArrowLeft') n = step - 1;
      else if (k === 'Home') n = 0; else if (k === 'End') n = STEPS.length - 1;
      if (n === null) return;
      e.preventDefault(); setAuto(false); setStep(n, true, true);
    });
  });
  autoBtn.addEventListener('click', () => { setAuto(!auto); wake(); });
  const stage = $('.how-stage', how);
  stage.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') hovering = true; });
  stage.addEventListener('pointerleave', () => { hovering = false; });
  if (posterIO) posterIO.observe(how);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es) => {
      howVisible = es[0].isIntersecting;
      const v = vids[step];
      if (howVisible) { primePoster(v); playV(v); wake(); } else vids.forEach((x) => x.pause());
    }, { threshold: 0.35 }).observe($('.how-grid', how));
  }
  if (RM) { setAuto(false); vids.forEach((v) => { v.controls = true; }); }
  setStep(0);

  // ─── Commanders ─────────────────────────────────────────
  const FALLBACK_COMMANDERS = [
    ['Captain Greenbeard', 'skaal', 'Goblin', 28, 7, 5, 1, '[Cooldown 2]: Until end of the turn, minions you control in enemy territory have Haste.'],
    ['Elber, Jungle Emissary', 'grenalia', '', 33, 7, 7, 1, 'When you play a card that costs 8 or more, Elber, Jungle Emissary heals 4.'],
    ['Elyse of the Order', 'lucia', '', 26, 8, 6, 1, '[Warmup 6]: Summon a Lucian Soldier. When you play a minion, reduce Warmup by 1.'],
    ['Executor Ginn', 'lucia', '', 30, 7, 6, 1, '[Pay 2 mana, Cooldown 1]: Sacrifice target minion and convert the tile it occupied to a Village.'],
    ['Fael Spiritwalker', 'shadis', '', 27, 7, 5, 1, '[Warmup 13]: Summon a Daemon Familiar. When a minion dies, reduce Warmup by 1.'],
    ['It That Weaves', 'archaeon', '', 27, 7, 5, 2, '[Cooldown 2, Range 4]: Pull target minion in a straight line to It That Weaves.'],
    ['Jagris, the Huntsman', 'grenalia', 'Human', 29, 8, 5, 1, '[Cooldown 3, Range 2]: Target minion gains +1 Power, +1 Speed and +1 Health.'],
    ['Kai, Longcount Shaman', 'skaal', '', 30, 10, 6, 1, '[Warmup 25]: The enemy commander gains 5 Doom. When you play a spell, reduce Warmup by 1.'],
    ['Lazim, Thief of Gods', 'neutral', '', 25, 8, 6, 1, 'Your deck may contain cards from any Patron, but not Neutral cards.'],
    ['Lubela, Tender of the Wilds', 'grenalia', '', 31, 8, 6, 1, 'When you play a minion in your territory, it gains +2 Health until the start of your next turn.'],
    ['Macks Speed', 'skaal', '', 29, 7, 5, 2, '[Cooldown 3, Range 2]: Target character gains +2 Speed and Trample until end of the turn.'],
    ['Milo Sunstone', 'lucia', '', 32, 7, 6, 1, '[Cooldown 2, Range 3]: Target character heals 3.'],
    ['Newhaven Township', 'neutral', '', 33, 7, 5, 0, 'Realmbound. Your Village tiles produce an additional Mana. You may claim uncontested tiles at a distance.'],
    ['Rosirix the Witch', 'archaeon', '', 31, 6, 6, 1, '[Once Per Game]: Lose 1 Intellect, then draw cards until your hand is full.'],
    ['Soultaker Viessa', 'shadis', '', 30, 8, 6, 1, '[Warmup 3, Range 2]: Deal 2 damage to target character and Soultaker Viessa heals 2.'],
    ['Starwise Luna', 'archaeon', '', 26, 7, 6, 1, '[Cooldown 5]: Refresh all but one of your Mana.'],
  ].map(([name, faction, subtype, health, intellect, dominion, speed, text]) => ({ name, faction, subtype, health, intellect, dominion, speed, text }));

  const STAT_INFO = {
    health: ['Health', 'Damage taken before you lose'],
    intellect: ['Intellect', 'Max hand size & opening choices'],
    dominion: ['Dominion', 'Max tiles claimed at once'],
    speed: ['Speed', 'Tiles moved per turn'],
  };
  const SPRITE_WORD = { health: 'Health', power: 'Power', speed: 'Speed', intellect: 'Intellect', dominion: 'Dominion', mana: 'Mana', durability: 'Durability' };

  function abilityHTML(text) {
    // Split on in-game sprite tokens, escape the rest, then bold [bracketed] ability costs.
    const parts = String(text).split(/(<sprite name="[a-z]+_\d+">)/g);
    return parts.map((p) => {
      const m = p.match(/^<sprite name="([a-z]+)_(\d+)">$/);
      if (m) {
        const [, kind, n] = m;
        const label = `${n} ${SPRITE_WORD[kind] || kind}`;
        return +n <= 9 ? `<img class="ti" src="${ASSETS}icons/text/${kind}_${n}.png" alt="${label}" width="20" height="19">` : `<b>${label}</b>`;
      }
      return esc(p).replace(/\[([^\]]+)\]/g, '<b>[$1]</b>');
    }).join('');
  }

  const honey = $('#honeycomb');
  const detail = $('#cmd-detail');
  const pickerLabel = $('#cmd-picker-label');
  const blurb = $('[data-patron-blurb]');
  let commanders = [], selected = null, ranges = {}, statsAll = null, filter = 'all';

  function buildHoneycomb(list) {
    honey.innerHTML = '';
    const perRow = 4;
    for (let i = 0; i < list.length; i += perRow) {
      const row = document.createElement('div');
      row.className = 'hc-row';
      list.slice(i, i + perRow).forEach((c) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'hc'; b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', 'false'); b.tabIndex = -1;
        b.dataset.slug = c.slug; b.dataset.faction = c.faction;
        b.style.setProperty('--fc', (FACTION[c.faction] || FACTION.neutral).color);
        b.setAttribute('aria-label', `${c.name} — ${(FACTION[c.faction] || FACTION.neutral).name}`);
        b.innerHTML = `<span class="hc-shape"><img src="${ASSETS}commanders/${c.slug}.jpg" alt="" width="200" height="200" loading="lazy" decoding="async"></span>`;
        b.addEventListener('click', () => select(c.slug, false, true));
        b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') pickerLabel.innerHTML = `<b>${esc(c.name)}</b>`; });
        b.addEventListener('pointerleave', () => { showPicked(); });
        b.addEventListener('keydown', onHoneyKey);
        row.appendChild(b);
      });
      honey.appendChild(row);
    }
  }
  function onHoneyKey(e) {
    const btns = $$('.hc', honey).filter((b) => !b.classList.contains('is-dim'));
    const i = btns.indexOf(e.currentTarget);
    let n = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = i + 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = i - 1;
    else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = btns.length - 1;
    if (n === null) return;
    e.preventDefault();
    const b = btns[(n + btns.length) % btns.length];
    select(b.dataset.slug); b.focus();
  }

  function showPicked() {
    const c = commanders.find((x) => x.slug === selected);
    pickerLabel.innerHTML = c ? `Selected: <b>${esc(c.name)}</b>` : 'Select a commander';
  }
  // On touch layouts the detail panel sits under the honeycomb; bring its top into view after a tap.
  const mqCoarse = window.matchMedia('(hover: none), (pointer: coarse), (max-width: 1023px)');
  function revealDetail() {
    if (!mqCoarse.matches) return;
    const r = detail.getBoundingClientRect(), vh = window.innerHeight;
    if (r.top > vh * 0.62 || r.top < 64) window.scrollBy({ top: r.top - vh * 0.3, behavior: RM ? 'auto' : 'smooth' });
  }

  function statRow(key, v) {
    const [label, note] = STAT_INFO[key];
    const r = ranges[key] || [0, v || 1];
    const pct = r[1] > r[0] ? 18 + 82 * (v - r[0]) / (r[1] - r[0]) : 60;
    return `<div class="stat"><img src="${ASSETS}icons/text/${key}.png" alt="" width="28" height="28"><dt>${label}</dt><dd>${v}</dd><span class="meter" aria-hidden="true"><i style="--v:${pct.toFixed(0)}%"></i></span><span class="stat-note">${note}</span></div>`;
  }

  function renderRecord(c) {
    const el = $('[data-cmd="record"]', detail);
    const row = statsAll && statsAll.find((s) => slugify(s.name) === c.slug);
    el.innerHTML = row && row.matches
      ? `Beta testing: <b>${(row.winrate * 100).toFixed(1)}%</b> win rate across <b>${fmt(row.matches)}</b> games`
      : '';
  }

  function select(slug, instant, user) {
    const c = commanders.find((x) => x.slug === slug);
    if (!c) return;
    selected = slug;
    showPicked();
    if (user) revealDetail();
    $$('.hc', honey).forEach((b) => {
      const on = b.dataset.slug === slug;
      b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1;
    });
    const f = FACTION[c.faction] || FACTION.neutral;
    const apply = () => {
      detail.style.setProperty('--fc', f.color);
      $('[data-cmd="name"]', detail).textContent = c.name;
      $('[data-cmd="patron"]', detail).textContent = f.name;
      $('[data-cmd="subtype"]', detail).textContent = c.subtype || f.title;
      const em = $('[data-cmd="emblem"]', detail); em.src = `${ASSETS}factions/${c.faction}.png`; em.alt = '';
      $('[data-cmd="text"]', detail).innerHTML = abilityHTML(c.text);
      $('[data-cmd="stats"]', detail).innerHTML = ['health', 'intellect', 'dominion', 'speed'].map((k) => statRow(k, c[k])).join('');
      $('[data-cmd="art"]', detail).src = `img/cmd/${c.slug}.webp`;
      const card = $('[data-cmd="card"]', detail);
      card.src = `${ASSETS}media/cards/${c.slug}.webp`; card.alt = `${c.name} commander card`;
      renderRecord(c);
    };
    if (instant || RM) { apply(); return; }
    detail.classList.add('is-swapping');
    const pre = new Image(); pre.src = `img/cmd/${c.slug}.webp`;
    const pre2 = new Image(); pre2.src = `${ASSETS}media/cards/${c.slug}.webp`;
    const wait = Promise.all([pre.decode ? pre.decode().catch(() => {}) : 0, pre2.decode ? pre2.decode().catch(() => {}) : 0, new Promise((r) => setTimeout(r, 200))]);
    wait.then(() => { if (selected !== slug) return; apply(); requestAnimationFrame(() => detail.classList.remove('is-swapping')); });
  }

  function setFilter(p) {
    filter = p;
    $$('.patron').forEach((b) => { const on = b.dataset.patron === p; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); });
    $$('.hc', honey).forEach((b) => b.classList.toggle('is-dim', p !== 'all' && b.dataset.faction !== p));
    if (p === 'all') blurb.innerHTML = 'Six patron gods. Decks hold your commander’s patron cards plus neutral cards.';
    else { const f = FACTION[p]; blurb.innerHTML = `<b>${f.name}, ${f.title}.</b> ${f.blurb}`; }
    const cur = commanders.find((c) => c.slug === selected);
    if (p !== 'all' && cur && cur.faction !== p) { const first = commanders.find((c) => c.faction === p); if (first) select(first.slug); }
  }
  $$('.patron').forEach((b) => b.addEventListener('click', () => setFilter(b.dataset.patron)));

  function initCommanders(list) {
    commanders = list.map((c) => ({ ...c, slug: slugify(c.name) }));
    ['health', 'intellect', 'dominion', 'speed'].forEach((k) => {
      const vs = commanders.map((c) => c[k]).filter((v) => typeof v === 'number');
      ranges[k] = [Math.min(...vs), Math.max(...vs)];
    });
    buildHoneycomb(commanders);
    const start = commanders.find((c) => c.slug === 'jagris-the-huntsman') || commanders[0];
    select(start.slug, true);
    const words = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty'];
    $$('[data-stat="commanders"]').forEach((el) => { el.textContent = String(commanders.length); });
    $$('[data-stat="commanders-word"]').forEach((el) => { el.textContent = words[commanders.length] || String(commanders.length); });
  }
  getJSON('commanders.json').then((d) => initCommanders(Array.isArray(d) && d.length ? d : FALLBACK_COMMANDERS))
    .catch(() => initCommanders(FALLBACK_COMMANDERS));
  getJSON('commander_stats.json').then((d) => {
    statsAll = d && d.all && d.all.all;
    const c = commanders.find((x) => x.slug === selected);
    if (c) renderRecord(c);
  }).catch(() => {});

  // ─── The meta is live ───────────────────────────────────
  const metaEl = $('[data-meta]');
  const FALLBACK_META = { matches: 5229 };
  let metaData = null;
  const period = 'all';           // the homepage shows the whole beta; time windows live on the analytics page

  function countUp(el, to, fmtFn) {
    if (RM || !el.dataset.done) { el.textContent = fmtFn(to); el.dataset.done = '1'; if (RM) return; }
    const from = parseFloat(el.dataset.v || '0');
    el.dataset.v = String(to);
    const t0 = performance.now(), dur = 900;
    const stepFn = (t) => {
      const k = Math.min((t - t0) / dur, 1), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmtFn(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(stepFn);
    };
    requestAnimationFrame(stepFn);
  }

  function medianBucket(dist) {
    if (!dist || !dist.counts || !dist.labels) return null;
    const total = dist.counts.reduce((a, b) => a + b, 0);
    let acc = 0;
    for (let i = 0; i < dist.counts.length; i++) { acc += dist.counts[i]; if (acc >= total / 2) return dist.labels[i].replace('-', '–'); }
    return null;
  }

  function renderMeta() {
    const d = metaData || {};
    const md = d.metadata && d.metadata[period];
    const total = md && md.all ? md.all.total_matches : (period === 'all' ? FALLBACK_META.matches : null);
    const q = (k) => $(`[data-meta="${k}"]`, metaEl);
    if (total != null) countUp(q('matches'), total, (v) => fmt(Math.round(v)));
    const ft = d.first && d.first[period] && d.first[period].all;
    q('first').textContent = ft && ft.first_player_winrate != null ? `${(ft.first_player_winrate * 100).toFixed(1)}%` : '—';
    const gd = d.dist && d.dist[period] && d.dist[period].all;
    q('duration').textContent = (gd && medianBucket(gd.duration)) || '—';
    if (md && md.all && md.all.last_updated) {
      const dt = new Date(md.all.last_updated);
      q('updated').textContent = `Updated ${dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · from beta matches`;
    } else q('updated').textContent = metaData ? 'From beta matches' : 'Live data unavailable — showing a recent snapshot';

    // top 3 commanders by win rate, with a minimum-games threshold
    const rows = d.cstats && d.cstats[period] && d.cstats[period].all;
    const min = (total || 0) >= 2000 ? 200 : 50;
    q('threshold').textContent = `min. ${min} games`;
    const top = q('top3');
    if (Array.isArray(rows) && rows.length) {
      const best = rows.filter((r) => r.matches >= min).sort((a, b) => b.winrate - a.winrate).slice(0, 3);
      top.innerHTML = best.length ? best.map((r, i) => {
        const f = FACTION[r.faction] || FACTION.neutral;
        const s = slugify(r.name);
        return `<li style="--fc:${f.color}"><span class="rank" aria-hidden="true">${i + 1}</span>
          <span class="por"><img src="${ASSETS}commanders/${s}.jpg" alt="" width="52" height="60" loading="lazy" decoding="async"></span>
          <span class="who"><b>${esc(r.name)}</b><small>${f.name} · ${fmt(r.matches)} games</small><span class="bar" aria-hidden="true"><i style="--w:${(r.winrate * 100).toFixed(1)}%"></i></span></span>
          <span class="wr">${(r.winrate * 100).toFixed(1)}%</span></li>`;
      }).join('') : '<li>Not enough games in this window yet.</li>';
      // patron popularity: share of commander picks
      const by = {};
      rows.forEach((r) => { by[r.faction] = (by[r.faction] || 0) + r.matches; });
      const sum = Object.values(by).reduce((a, b) => a + b, 0) || 1;
      const order = Object.keys(by).sort((a, b) => by[b] - by[a]);
      q('patrons').innerHTML = order.map((k) => `<span style="--fc:${(FACTION[k] || FACTION.neutral).color};flex-grow:${by[k]}"></span>`).join('');
      q('patrons').setAttribute('aria-label', 'Patron popularity: ' + order.map((k) => `${(FACTION[k] || FACTION.neutral).name} ${Math.round(by[k] / sum * 100)}%`).join(', '));
      q('patron-key').innerHTML = order.map((k) => `<li style="--fc:${(FACTION[k] || FACTION.neutral).color}"><i></i>${(FACTION[k] || FACTION.neutral).name} <b>${Math.round(by[k] / sum * 100)}%</b></li>`).join('');
    } else {
      top.innerHTML = '<li>Commander stats are unavailable right now — see the Analytics page.</li>';
    }

    // matches by map
    const maps = ['Dunes', 'Snowmelt', 'Tropics'];
    const vals = maps.map((m) => (md && md[m] ? md[m].total_matches : null));
    const max = Math.max(1, ...vals.filter((v) => v != null));
    $$('li', q('maps')).forEach((li, i) => {
      const v = vals[i];
      $('b', li).textContent = v != null ? fmt(v) : '—';
      $('i', li).style.setProperty('--w', v != null ? `${(v / max * 100).toFixed(1)}%` : '0%');
    });
    if (md) {
      const n = Object.keys(md).filter((k) => k !== 'all').length;
      if (n) $$('[data-stat="maps"]').forEach((el) => { el.textContent = String(n); });
    }
  }


  let metaLoaded = false;
  function loadMeta() {
    if (metaLoaded) return; metaLoaded = true;
    $$('[data-img]', metaEl).forEach((li) => li.style.setProperty('--img', `url('${li.dataset.img}')`));
    Promise.allSettled([getJSON('metadata.json'), getJSON('commander_stats.json'), getJSON('first_turn.json'), getJSON('game_distributions.json')])
      .then(([m, c, f, g]) => {
        metaData = {
          metadata: m.status === 'fulfilled' ? m.value : null,
          cstats: c.status === 'fulfilled' ? c.value : null,
          first: f.status === 'fulfilled' ? f.value : null,
          dist: g.status === 'fulfilled' ? g.value : null,
        };
        renderMeta();
      });
  }
  if ('IntersectionObserver' in window) {
    const mio = new IntersectionObserver((es) => { if (es[0].isIntersecting) { loadMeta(); mio.disconnect(); } }, { rootMargin: '600px 0px' });
    mio.observe(metaEl);
  } else loadMeta();

  // ─── Reveal on scroll ───────────────────────────────────
  // A synchronous scroll check (not IntersectionObserver, not rAF-deferred) so fast flings,
  // anchor jumps and throttled frames can never skip an element and leave it hidden.
  // Anything at or above the reveal line is shown, including sections already scrolled past.
  let pending = $$('.sec-head, .how-grid, .cmd-grid, .meta-panel, .trailer-card, .cta-inner');
  if (!RM) {
    pending.forEach((el) => el.classList.add('reveal'));
    const check = () => {
      const line = window.innerHeight * 0.94;
      pending = pending.filter((el) => {
        if (el.getBoundingClientRect().top > line) return true;
        // swap the hidden state for a one-shot entrance animation; nothing lingers afterwards
        el.classList.remove('reveal'); el.classList.add('is-in');
        const done = (e) => { if (e.target !== el) return; el.classList.remove('is-in'); el.removeEventListener('animationend', done); };
        el.addEventListener('animationend', done);
        return false;
      });
      if (!pending.length) { window.removeEventListener('scroll', onRevealScroll); window.removeEventListener('resize', onRevealScroll); }
    };
    const onRevealScroll = () => check();
    window.addEventListener('scroll', onRevealScroll, { passive: true });
    window.addEventListener('resize', onRevealScroll);
    onRevealScroll();
  }
})();
