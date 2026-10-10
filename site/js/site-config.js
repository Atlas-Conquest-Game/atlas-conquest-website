/**
 * Atlas Conquest — site config + shared chrome behaviour.
 *
 * AC_CONFIG is the one place to change calls-to-action and outbound links for
 * the whole site. Steam leads by default: every primary [data-ac-cta] slot is a
 * Steam-blue "Wishlist on Steam" button and Discord takes the secondary spot.
 * Until links.steam is set those Steam buttons point at '#' and do nothing when
 * clicked; set links.steam to the store URL and they go live everywhere.
 * primaryCta: 'discord' flips the roles back (gold Discord primary, Steam as the
 * ghost secondary). Set links.youtubeTrailerId to switch the trailer from the
 * local placeholder video to a YouTube (nocookie) embed.
 *
 * Loaded with `defer` from every page's AC:HEAD region. Markup hooks:
 *   [data-ac-cta="primary|secondary|discord|steam"]  CTA slot (keep a static
 *       fallback inside it that matches the default render, so nothing shifts
 *       when this script runs). Options: data-ac-cta-size="sm|lg",
 *       data-ac-cta-short (short label; ="narrow" renders both labels and lets
 *       CSS pick the short one on small screens), data-ac-cta-count (live online
 *       chip on the Discord button), data-ac-cta-style="gold|ghost|discord|steam|pill|text",
 *       data-ac-cta-label="…" (custom label).
 *   [data-ac-discord-members] / [data-ac-discord-online]  filled with live counts.
 *   [data-ac-discord-live]  container shown (hidden attr removed) once counts load.
 *   [data-ac-trailer]  any button/link; opens the trailer modal.
 *   [data-ac-text="tagline|release"], [data-ac-href="discord|steam|x|instagram|tiktok|press|email"]
 *   .ac-page-hero[data-ac-hero-art="assets/media/keyart/….webp"]  page-relative hero art.
 * API: window.AC.{config, renderCtas(root), applyConfig(root), applyHeroArt(root), openTrailer(opener),
 *      closeTrailer(), discordCounts()} and a document 'ac:discord' event.
 */
window.AC_CONFIG = {
  primaryCta: 'steam', // 'steam' (default: Wishlist on Steam leads) | 'discord' (Join the Beta leads)
  links: {
    discord: 'https://discord.gg/7QaEY4yJH5',
    steam: '', // Steam store URL; empty keeps "Wishlist on Steam" in place as a no-op '#' link
    youtubeTrailerId: 'hPoGfdLZThA', // e.g. 'dQw4w9WgXcQ'; empty plays assets/media/video/trailer.mp4
    x: 'https://x.com/Atlas_Conquest',
    instagram: 'https://www.instagram.com/atlasconquest/',
    tiktok: 'https://www.tiktok.com/@atlas.conquest',
    press: 'press@atlas-conquest.com',
    email: 'support@atlas-conquest.com',
  },
  release: 'Releasing 2027',
  tagline: 'Online Competitive Hex-Grid Card Battles',
};

(function () {
  'use strict';

  const config = window.AC_CONFIG;
  const links = config.links;
  const html = document.documentElement;

  // Site root, resolved from this script's own URL so nested pages
  // (/decks/<slug>/, /articles/<slug>/) and root pages agree.
  const script = document.currentScript;
  const ROOT = script && script.src ? new URL('../', script.src).href : new URL('/', location.href).href;

  const LABELS = {
    discord: { full: 'Play Free Now on Discord', short: 'Play Free' },
    steam: { full: 'Wishlist on Steam', short: 'Wishlist' },
  };

  const numberFormat = new Intl.NumberFormat('en-US');

  // ─── Small DOM helpers ────────────────────────────────────────────────

  function icon(name) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'ac-icon');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(NS, 'use');
    use.setAttribute('href', '#ac-i-' + name);
    svg.appendChild(use);
    return svg;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  // ─── Calls to action ─────────────────────────────────────────────────

  function steamLive() {
    return typeof links.steam === 'string' && /^https?:\/\//.test(links.steam);
  }

  function primaryPlatform() {
    // Steam leads unless the config explicitly hands the lead to Discord. It
    // does so even before the store page exists (the button is a no-op then).
    return config.primaryCta === 'discord' ? 'discord' : 'steam';
  }

  function platformFor(role) {
    const primary = primaryPlatform();
    if (role === 'primary') return primary;
    if (role === 'secondary') return primary === 'discord' ? 'steam' : 'discord';
    if (role === 'discord' || role === 'steam') return role;
    return null;
  }

  function liveChip() {
    const chip = el('span', 'ac-btn__live');
    chip.setAttribute('data-ac-discord-live', '');
    chip.hidden = true;
    const dot = el('span', 'ac-dot');
    dot.setAttribute('aria-hidden', 'true');
    const count = el('span');
    count.setAttribute('data-ac-discord-online', '');
    chip.append(dot, count, el('span', 'ac-btn__live-label', ' online'));
    return chip;
  }

  function labelNodes(platform, slot) {
    const custom = slot.getAttribute('data-ac-cta-label');
    if (custom) return [document.createTextNode(custom)];
    const short = slot.getAttribute('data-ac-cta-short');
    if (short === 'narrow') {
      // Both labels; brand.css shows the short one on small screens.
      return [
        el('span', 'ac-btn__label-full', LABELS[platform].full),
        el('span', 'ac-btn__label-short', LABELS[platform].short),
      ];
    }
    return [document.createTextNode(LABELS[platform][short != null ? 'short' : 'full'])];
  }

  function renderCta(slot) {
    const role = slot.getAttribute('data-ac-cta');
    const platform = platformFor(role);
    if (!platform) return;

    const size = slot.getAttribute('data-ac-cta-size');
    const isPrimary = platform === primaryPlatform();
    // The lead button wears its platform's colours: Steam blue or molten gold.
    const lead = role === 'primary' || (role !== 'secondary' && isPrimary);
    const style = slot.getAttribute('data-ac-cta-style') ||
      (lead ? (platform === 'steam' ? 'steam' : 'gold') : 'ghost');
    const pending = platform === 'steam' && !steamLive();

    const label = el('span', style === 'text' ? null : 'ac-btn__label');
    label.append(...labelNodes(platform, slot));

    const node = el('a', style === 'text' ? 'ac-textcta' : 'ac-btn ac-btn--' + style);
    if (style !== 'text' && (size === 'sm' || size === 'lg')) node.classList.add('ac-btn--' + size);
    node.append(icon(platform), label);
    if (style !== 'text' && platform === 'discord' && slot.hasAttribute('data-ac-cta-count')) node.appendChild(liveChip());
    node.setAttribute('data-platform', platform);
    if (pending) {
      // No store page yet: keep the button, go nowhere (see initPendingLinks).
      node.href = '#';
      node.setAttribute('data-ac-pending', '');
    } else {
      node.href = platform === 'discord' ? links.discord : links.steam;
      node.target = '_blank';
      node.rel = 'noopener';
    }
    slot.replaceChildren(node);
  }

  function renderCtas(root) {
    (root || document).querySelectorAll('[data-ac-cta]').forEach(renderCta);
    if (lastCounts) applyDiscordCounts(lastCounts, root);
  }

  // ─── Config-driven text + links ──────────────────────────────────────

  function applyConfig(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-ac-text]').forEach(node => {
      const value = config[node.getAttribute('data-ac-text')];
      if (typeof value === 'string' && value) node.textContent = value;
    });
    scope.querySelectorAll('[data-ac-href]').forEach(node => {
      const key = node.getAttribute('data-ac-href');
      let value = links[key];
      if (!value) return;
      if (key === 'press' || key === 'email') {
        const address = value.replace(/^mailto:/, '');
        value = 'mailto:' + address;
        if (node.textContent.includes('@')) node.textContent = address;
      }
      node.setAttribute('href', value);
    });
    if (links.youtubeTrailerId) {
      scope.querySelectorAll('a[data-ac-trailer]').forEach(node => {
        node.setAttribute('href', 'https://www.youtube.com/watch?v=' + encodeURIComponent(links.youtubeTrailerId));
      });
    }
  }

  // A relative url() inside a custom property resolves against brand.css, not
  // the page, so page-relative hero art is resolved here instead.
  function applyHeroArt(root) {
    (root || document).querySelectorAll('[data-ac-hero-art]').forEach(node => {
      const url = new URL(node.getAttribute('data-ac-hero-art'), document.baseURI).href;
      node.style.setProperty('--ac-hero-art', 'url("' + url.replace(/"/g, '%22') + '")');
    });
  }

  // ─── Live Discord counts ─────────────────────────────────────────────

  const DISCORD_CACHE_KEY = 'ac:discord-counts';
  const DISCORD_TTL = 10 * 60 * 1000;
  let lastCounts = null;

  function inviteCode() {
    const match = /discord(?:\.gg|(?:app)?\.com\/invite)\/([\w-]+)/i.exec(links.discord || '');
    return match ? match[1] : null;
  }

  function readCache(code) {
    try {
      const cached = JSON.parse(sessionStorage.getItem(DISCORD_CACHE_KEY) || 'null');
      if (cached && cached.code === code && Date.now() - cached.at < DISCORD_TTL) return cached;
    } catch { /* storage blocked or corrupt — fetch fresh */ }
    return null;
  }

  function writeCache(counts) {
    try { sessionStorage.setItem(DISCORD_CACHE_KEY, JSON.stringify(counts)); } catch { /* ignore */ }
  }

  function applyDiscordCounts(counts, root) {
    const scope = root || document;
    scope.querySelectorAll('[data-ac-discord-members]').forEach(node => {
      node.textContent = numberFormat.format(counts.members);
    });
    scope.querySelectorAll('[data-ac-discord-online]').forEach(node => {
      node.textContent = numberFormat.format(counts.online);
    });
    scope.querySelectorAll('[data-ac-discord-live]').forEach(node => { node.hidden = false; });
  }

  async function loadDiscordCounts() {
    const code = inviteCode();
    if (!code) return;
    let counts = readCache(code);
    if (!counts) {
      try {
        const res = await fetch('https://discord.com/api/v10/invites/' + code + '?with_counts=true', {
          credentials: 'omit',
          cache: 'no-store',
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        counts = {
          code,
          members: Number(data.approximate_member_count),
          online: Number(data.approximate_presence_count),
          at: Date.now(),
        };
        if (!Number.isFinite(counts.members) || !Number.isFinite(counts.online)) throw new Error('no counts');
        writeCache(counts);
      } catch {
        // Offline, rate-limited or blocked: live stats simply stay hidden.
        html.setAttribute('data-ac-discord', 'error');
        return;
      }
    }
    lastCounts = counts;
    html.setAttribute('data-ac-discord', 'live');
    applyDiscordCounts(counts);
    document.dispatchEvent(new CustomEvent('ac:discord', { detail: { members: counts.members, online: counts.online } }));
  }

  // ─── Nav: mobile menu, scrolled state, skip link ─────────────────────

  function initNav() {
    const nav = document.querySelector('[data-ac-nav]');
    if (!nav) return;
    const toggle = nav.querySelector('.ac-nav__toggle');
    const menu = toggle && document.getElementById(toggle.getAttribute('aria-controls'));
    const scrim = nav.querySelector('[data-ac-nav-scrim]');

    if (toggle && menu) {
      const mobile = window.matchMedia('(max-width: 900px)');
      const isOpen = () => nav.classList.contains('is-open');
      const setOpen = (open, returnFocus) => {
        nav.classList.toggle('is-open', open);
        toggle.setAttribute('aria-expanded', String(open));
        toggle.querySelector('.ac-sr').textContent = open ? 'Close menu' : 'Menu';
        if (!open && returnFocus) toggle.focus();
      };

      toggle.addEventListener('click', () => setOpen(!isOpen()));
      if (scrim) scrim.addEventListener('click', () => setOpen(false));
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && isOpen()) {
          e.preventDefault();
          setOpen(false, true);
        }
      });
      document.addEventListener('click', e => {
        if (isOpen() && !nav.contains(e.target)) setOpen(false);
      });
      // Tabbing out of the open panel closes it, so it never hides content.
      nav.addEventListener('focusout', e => {
        if (isOpen() && e.relatedTarget && !nav.contains(e.relatedTarget)) setOpen(false);
      });
      menu.addEventListener('click', e => {
        if (e.target.closest('a')) setOpen(false);
      });
      const onBreakpoint = () => { if (!mobile.matches && isOpen()) setOpen(false); };
      if (mobile.addEventListener) mobile.addEventListener('change', onBreakpoint);
      else if (mobile.addListener) mobile.addListener(onBreakpoint);
    }

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        nav.classList.toggle('is-scrolled', window.scrollY > 8);
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  function initSkipLink() {
    const link = document.querySelector('.ac-skip');
    if (!link) return;
    let target = document.getElementById('main') || document.querySelector('main');
    if (!target) {
      // No <main> yet: land on the first content block after the nav stack.
      let node = document.querySelector('.ac-nav');
      node = node && node.nextElementSibling;
      while (node && node.matches('nav, script, style, svg, .sub-nav, .ac-skip')) node = node.nextElementSibling;
      target = node;
    }
    if (!target) return;
    if (!target.id) target.id = 'main';
    link.setAttribute('href', '#' + target.id);
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  }

  // The analytics pages stack nav + .sub-nav + .time-filter-bar. shared.js
  // reads --sticky-stack to pin table headers under that stack, so measure it
  // from the real bars instead of hard-coding a sum that drifts with styling.
  function syncStickyStack() {
    if (!document.querySelector('.sub-nav, .time-filter-bar')) return;
    let bottom = 0;
    document.querySelectorAll('.ac-nav, .sub-nav, .time-filter-bar').forEach(node => {
      const cs = getComputedStyle(node);
      if (cs.display === 'none' || (cs.position !== 'sticky' && cs.position !== 'fixed')) return;
      bottom = Math.max(bottom, (parseFloat(cs.top) || 0) + node.getBoundingClientRect().height);
    });
    if (bottom > 0) html.style.setProperty('--sticky-stack', Math.round(bottom) + 'px');
  }

  // ─── Trailer modal ───────────────────────────────────────────────────

  let dialog = null;
  let lastFocus = null;

  function ensureDialog() {
    if (dialog) return dialog;
    dialog = el('dialog', 'ac-trailer');
    dialog.setAttribute('aria-labelledby', 'ac-trailer-title');

    const bar = el('div', 'ac-trailer__bar');
    const title = el('h2', 'ac-trailer__title', 'Atlas Conquest — Trailer');
    title.id = 'ac-trailer-title';
    const close = el('button', 'ac-trailer__close');
    close.type = 'button';
    close.append(icon('close'), el('span', null, 'Close'));
    close.addEventListener('click', () => dialog.close());
    bar.append(title, close);

    dialog.append(bar, el('div', 'ac-trailer__frame'));
    // A click that lands on the dialog element itself is a click on the backdrop.
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
    dialog.addEventListener('close', teardownTrailer);
    // Keep Tab cycling inside the modal (showModal already makes the page inert;
    // this stops focus escaping to the browser chrome between controls).
    dialog.addEventListener('keydown', e => {
      if (e.key !== 'Tab') return;
      const focusables = [...dialog.querySelectorAll('button, [href], video[controls], iframe, [tabindex]:not([tabindex="-1"])')];
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    document.body.appendChild(dialog);
    return dialog;
  }

  function openTrailer(opener) {
    const modal = ensureDialog();
    if (modal.open) return;
    lastFocus = opener || document.activeElement;
    const frame = modal.querySelector('.ac-trailer__frame');
    const id = links.youtubeTrailerId;

    if (id) {
      // Click-to-load facade: nothing from YouTube loads until this click.
      const iframe = document.createElement('iframe');
      iframe.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) +
        '?autoplay=1&rel=0&modestbranding=1&playsinline=1';
      iframe.title = 'Atlas Conquest trailer';
      iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      iframe.allowFullscreen = true;
      frame.replaceChildren(iframe);
    } else {
      const video = document.createElement('video');
      // 720p (~12 MB) unless the screen can really show 1080p (~42 MB, also
      // the Press-kit download): phones no longer stream the master.
      const sharp = window.screen && (window.screen.width * (window.devicePixelRatio || 1)) >= 2200 &&
        window.matchMedia('(min-width: 1200px)').matches;
      video.src = ROOT + 'assets/media/video/' + (sharp ? 'trailer.mp4' : 'trailer-720.mp4');
      video.poster = ROOT + 'assets/media/video/hero-poster.webp';
      video.controls = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.setAttribute('aria-label', 'Atlas Conquest trailer');
      frame.replaceChildren(video);
      const play = video.play();
      if (play && play.catch) play.catch(() => { /* autoplay refused: controls are there */ });
    }

    html.classList.add('ac-modal-open');
    modal.showModal();
    modal.querySelector('.ac-trailer__close').focus();
  }

  function teardownTrailer() {
    // Drop the player entirely so audio stops and nothing keeps buffering.
    const frame = dialog && dialog.querySelector('.ac-trailer__frame');
    if (frame) {
      const video = frame.querySelector('video');
      if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
      frame.replaceChildren();
    }
    html.classList.remove('ac-modal-open');
    if (lastFocus && typeof lastFocus.focus === 'function' && document.contains(lastFocus)) lastFocus.focus();
    lastFocus = null;
  }

  function closeTrailer() {
    if (dialog && dialog.open) dialog.close();
  }

  function initTrailerTriggers() {
    document.addEventListener('click', e => {
      const trigger = e.target.closest('[data-ac-trailer]');
      if (!trigger || e.defaultPrevented) return;
      // Let modified clicks on a link open it in a new tab as usual.
      if (trigger.tagName === 'A' && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)) return;
      e.preventDefault();
      openTrailer(trigger);
    });
  }

  // Steam buttons before the store URL exists are '#' links: swallow the click
  // so they don't jump to the top of the page. Delegated, so the static
  // fallback markup in the partials behaves the same.
  function initPendingLinks() {
    document.addEventListener('click', e => {
      const link = e.target.closest('a[data-ac-pending]');
      if (link && link.getAttribute('href') === '#') e.preventDefault();
    });
  }

  // ─── Boot ────────────────────────────────────────────────────────────

  function init() {
    renderCtas();
    applyConfig();
    applyHeroArt();
    initNav();
    initSkipLink();
    initTrailerTriggers();
    initPendingLinks();
    syncStickyStack();
    let resizeTimer = 0;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(syncStickyStack, 120);
    });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(syncStickyStack);
    loadDiscordCounts();
  }

  window.AC = {
    config,
    root: ROOT,
    renderCtas,
    applyConfig,
    applyHeroArt,
    openTrailer,
    closeTrailer,
    discordCounts: () => (lastCounts ? { members: lastCounts.members, online: lastCounts.online } : null),
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
