/* Atlas Conquest — homepage (from concepts/trailer-cut-d, Layout D)
   Plain JS, no dependencies.
   Motion budget: the hero loop is the only autoplaying video. Section clips play
   only on hover (mouse) or tap / Enter (their button), one at a time. The finale
   coverflow makes one pass through the cards and stops. Reduced motion: stills only. */

/* =========================================================================
   CONFIG — every outbound link lives here. Change a value, reload, done.
   ========================================================================= */
const CONFIG = {
  primaryCta: 'steam',       // 'steam' = Wishlist on Steam leads everywhere. 'discord' flips the roles (Join the Beta leads).
  steam: '',                 // Steam store URL. Empty = Steam buttons stay in place; a click shows a short "coming soon" note.
                             // Once set, every Steam link gets ?utm_source=atlas-website&utm_medium=<nav|hero|finale>
                             // (from its data-placement) so Steam's UTM report can attribute wishlists to the site.
  discord: 'https://discord.gg/7QaEY4yJH5',
  youtubeTrailerId: 'hPoGfdLZThA',      // YouTube video id. Empty = play the local trailer.mp4 in the modal.
  x: 'https://x.com/Atlas_Conquest',
  instagram: 'https://www.instagram.com/atlasconquest/',
  tiktok: 'https://www.tiktok.com/@atlas.conquest',
  press: 'press.html',
};

(() => {
  'use strict';

  const TRAILER_SRC = 'assets/media/video/trailer.mp4';
  const TRAILER_POSTER = 'assets/media/stills/t62_5.webp';
  const DISCORD_CACHE_KEY = 'ac:discord-counts';
  const DISCORD_CACHE_MS = 10 * 60 * 1000;

  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const safePlay = (v) => { try { const p = v.play(); if (p && p.catch) p.catch(() => {}); } catch (_) { /* ignore */ } };
  const fmt = (n) => Math.round(n).toLocaleString('en-US');

  let modalOpen = false;
  let clipPlaying = false;   // a section clip is playing: the hero loop waits (one video at a time)
  let heroCtl = null;
  let clipsCtl = null;
  let flowCtl = null;
  let storyCtl = null;

  root.classList.add('js');

  /* ---------------- Links + which call to action leads ----------------
     Steam is the primary CTA by default. With a store URL, each Steam link is tagged with
     its placement (utm_source=atlas-website, utm_medium=nav|hero|finale). Without one yet,
     the buttons stay put and a click shows a short polite note beside the button. */
  const SOON_MSG = 'Steam page coming soon. Join the beta on Discord meanwhile.';

  function tagged(url, placement) {
    try {
      const u = new URL(url, location.href);
      u.searchParams.set('utm_source', 'atlas-website');
      if (placement) u.searchParams.set('utm_medium', placement);
      return u.toString();
    } catch (_) { return url; }
  }

  // One shared live region, placed next to whichever Steam button was clicked.
  let soon = null;
  function soonNote() {
    if (soon) return soon;
    const el = document.createElement('p');
    el.className = 'soon-note';
    el.setAttribute('role', 'status'); // polite: announced without stealing focus
    document.body.appendChild(el);
    let anchor = null; let timer = 0; let raf = 0;
    const place = () => {
      raf = 0;
      if (!anchor || !el.classList.contains('is-shown')) return;
      let r = anchor.getBoundingClientRect();
      if (!r.width) r = { left: innerWidth / 2, width: 0, top: 0, bottom: $('[data-nav]').getBoundingClientRect().bottom };
      const w = el.offsetWidth; const h = el.offsetHeight;
      const x = clamp(r.left + r.width / 2 - w / 2, 12, innerWidth - w - 12);
      // Above the button by default, so it never covers the Discord link beside or below it;
      // below when there is no room (the nav button).
      const navBottom = $('[data-nav]').getBoundingClientRect().bottom;
      let y = r.top - h - 10;
      if (y < navBottom + 8) y = r.bottom + 10;
      el.style.left = Math.round(x) + 'px';
      el.style.top = Math.round(y) + 'px';
    };
    const queue = () => { if (!raf) raf = requestAnimationFrame(place); };
    addEventListener('scroll', queue, { passive: true });
    addEventListener('resize', queue);
    const hide = () => { el.classList.remove('is-shown'); el.textContent = ''; anchor = null; };
    soon = {
      show(a) {
        clearTimeout(timer);
        anchor = a;
        el.textContent = '';
        requestAnimationFrame(() => {
          el.textContent = SOON_MSG;
          el.classList.add('is-shown');
          place();
        });
        timer = setTimeout(hide, 4200);
      },
    };
    return soon;
  }

  function applyLinks() {
    root.classList.toggle('primary-discord', CONFIG.primaryCta === 'discord');
    $$('[data-link]').forEach((a) => {
      const key = a.dataset.link;
      const url = CONFIG[key];
      if (key === 'steam') {
        if (url) { a.href = tagged(url, a.dataset.placement); return; }
        a.href = '#';
        a.removeAttribute('target');
        a.removeAttribute('rel');
        soonNote(); // create the live region up front, so its first message is announced
        a.addEventListener('click', (e) => { e.preventDefault(); soonNote().show(a); });
        return;
      }
      if (url) a.href = url;
      else (a.closest('li') || a).hidden = true;
    });
  }

  /* ---------------- Nav ---------------- */
  function setupNav() {
    const nav = $('[data-nav]');
    const burger = $('.nav__burger');
    const menu = $('#nav-menu');
    const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 24);
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    const setOpen = (open) => {
      nav.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };
    burger.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
    menu.addEventListener('click', (e) => { if (e.target.closest('a, button')) setOpen(false); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) { setOpen(false); burger.focus(); }
    });
    document.addEventListener('click', (e) => {
      if (nav.classList.contains('is-open') && !nav.contains(e.target)) setOpen(false);
    });
    matchMedia('(min-width: 961px)').addEventListener('change', (e) => { if (e.matches) setOpen(false); });
  }

  /* ---------------- Smooth in-page anchors ---------------- */
  function setupAnchors() {
    $$('a[href^="#"]').forEach((a) => {
      a.addEventListener('click', (e) => {
        const id = a.getAttribute('href').slice(1);
        const target = id && document.getElementById(id);
        if (!target) return;
        e.preventDefault();
        window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY, behavior: reduced ? 'auto' : 'smooth' });
        if (id === 'main') { target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }); }
      });
    });
  }

  /* ---------------- Hero video (unchanged from Layout A) ----------------
     Phones in portrait get a purpose-cut 9:16 edit that follows the action;
     everything else gets the smallest landscape encode that still looks sharp under the scrim. */
  function setupHero() {
    const v = $('[data-hero-video]');
    const btn = $('[data-hero-pause]');
    const label = $('[data-hero-pause-label]');
    if (!v) return;
    const d = v.dataset;
    const w = innerWidth;
    const portrait = innerHeight > w && w <= 640;
    v.poster = portrait ? d.heroPosterPortrait : d.heroPoster;
    if (reduced) { root.classList.add('no-hero-video'); return; } // poster only
    const conn = navigator.connection;
    const lean = conn && (conn.saveData || /(^|-)2g$/.test(conn.effectiveType || ''));
    v.src = portrait ? d.srcPortrait : (w <= 1024 || lean) ? d.srcMd : w <= 1600 ? d.srcLg : d.srcXl;
    v.preload = 'metadata';
    v.muted = true;
    let userPaused = false;
    let inView = true;
    const hero = v.closest('.hero');
    const update = () => {
      if (!userPaused && inView && !modalOpen && !clipPlaying && !document.hidden) safePlay(v);
      else v.pause();
    };
    // The pause button stills everything decorative in the hero, not just the video
    // (embers, the scroll cue, the "rec" blink): WCAG 2.2.2 pause/stop/hide.
    btn.addEventListener('click', () => {
      userPaused = !userPaused;
      btn.setAttribute('aria-pressed', String(userPaused));
      label.textContent = userPaused ? 'Play background motion' : 'Pause background motion';
      hero.classList.toggle('is-still', userPaused);
      update();
    });
    new IntersectionObserver(([e]) => { inView = e.isIntersecting; update(); }, { threshold: 0.02 }).observe(hero);
    document.addEventListener('visibilitychange', update);
    heroCtl = { update };
    update();

    // gentle push-in as the hero scrolls away
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const k = clamp(window.scrollY / window.innerHeight, 0, 1);
        hero.style.setProperty('--hy', k.toFixed(3));
      });
    };
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---------------- Embers (hero only) ---------------- */
  function setupEmbers() {
    if (reduced) return;
    $$('[data-embers]').forEach((box) => {
      const n = +box.dataset.embers || 16;
      const h = box.getBoundingClientRect().height || window.innerHeight;
      const frag = document.createDocumentFragment();
      for (let i = 0; i < n; i++) {
        const s = document.createElement('span');
        const size = 2 + Math.random() * 4;
        s.style.cssText =
          '--x:' + (Math.random() * 100).toFixed(2) + '%;' +
          '--s:' + size.toFixed(1) + 'px;' +
          '--d:' + (10 + Math.random() * 12).toFixed(1) + 's;' +
          '--delay:' + (-Math.random() * 22).toFixed(1) + 's;' +
          '--o:' + (0.3 + Math.random() * 0.6).toFixed(2) + ';' +
          '--dx:' + (Math.random() * 160 - 80).toFixed(0) + 'px;' +
          '--rise:' + (h * (0.55 + Math.random() * 0.5)).toFixed(0) + 'px';
        frag.appendChild(s);
      }
      box.appendChild(frag);
    });
  }

  /* ---------------- Stills for the clip boxes ----------------
     They sit just below the hero, close enough that native lazy-loading would fetch
     them with the first view. Load each one only as it nears the viewport, so the
     first view on a phone stays at the hero (≈2.5 MB, most of it the hero loop). */
  function setupStills() {
    const imgs = $$('img[data-src]');
    const load = (img) => {
      if (img.dataset.srcset) img.srcset = img.dataset.srcset;
      img.src = img.dataset.src;
      img.removeAttribute('data-src');
    };
    if (!('IntersectionObserver' in window)) { imgs.forEach(load); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); load(e.target); } });
    }, { rootMargin: '0px 0px 15% 0px' });
    imgs.forEach((img) => io.observe(img));
  }

  /* ---------------- Clips on request (Gameplay cards) ----------------
     Each [data-clip] box rests on a still <img>. Its <video> is only created the first
     time someone asks for it: mouse hover (after a short intent delay) or the box's
     button (tap, click, Enter/Space). One clip plays at a time across the page; a clip
     stops when its card is left, scrolled away, the tab is hidden or the trailer opens.
     data-mode="once" skips the close-in opening of a pull-back, runs at ONCE_RATE and settles
     on the still (no section uses it now that the maps open in the viewer instead).
     While any clip plays the hero loop waits.
     Reduced motion: nothing here runs. */
  function setupClips() {
    const boxes = $$('[data-clip]');
    if (!boxes.length || reduced) return;
    let current = null;
    const HOVER_DELAY = 140;
    const ONCE_START = 0.44; // fraction of the pull-back to skip (the close-up opening)
    const ONCE_RATE = 2;

    const setClipPlaying = (on) => {
      if (clipPlaying === on) return;
      clipPlaying = on;
      if (heroCtl) heroCtl.update();
    };

    const hostOf = (box) => box.closest('[data-clip-host]') || box;
    const btnOf = (box) => $('[data-clip-btn]', box);

    function videoFor(box) {
      let v = $('video', box);
      if (v) return v;
      v = document.createElement('video');
      v.muted = true;
      v.defaultMuted = true;
      v.playsInline = true;
      v.setAttribute('muted', '');
      v.setAttribute('playsinline', '');
      v.setAttribute('aria-hidden', 'true');
      v.disablePictureInPicture = true;
      v.preload = 'auto';
      v.loop = box.dataset.mode !== 'once';
      if (box.dataset.mode === 'once') { v.defaultPlaybackRate = ONCE_RATE; v.playbackRate = ONCE_RATE; }
      v.src = box.dataset.src;
      v.addEventListener('playing', () => { if (box.classList.contains('is-on')) box.classList.add('is-live'); });
      v.addEventListener('ended', () => stop(box));
      v.addEventListener('error', () => stop(box));
      $('.clip__still', box).after(v);
      return v;
    }

    function setPressed(box, on) {
      const b = btnOf(box);
      if (!b) return;
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', b.getAttribute('aria-label').replace(/^(Play|Pause)/, on ? 'Pause' : 'Play'));
    }

    function play(box) {
      if (modalOpen) return;
      if (current && current !== box) stop(current, true);
      current = box;
      setClipPlaying(true);
      const v = videoFor(box);
      box.classList.add('is-on');
      hostOf(box).classList.add('is-playing');
      setPressed(box, true);
      if (box.dataset.mode !== 'once') { safePlay(v); return; }
      const go = () => {
        if (current !== box) return;
        try { v.currentTime = (v.duration || 0) * ONCE_START; } catch (_) { /* ignore */ }
        v.playbackRate = ONCE_RATE;
        safePlay(v);
      };
      if (v.readyState >= 1) go();
      else v.addEventListener('loadedmetadata', go, { once: true });
    }

    function stop(box, switching) {
      const v = $('video', box);
      box.classList.remove('is-on', 'is-live');
      hostOf(box).classList.remove('is-playing');
      setPressed(box, false);
      if (current === box) current = null;
      if (!switching) setClipPlaying(false);
      if (!v) return;
      if (!v.paused) v.pause();
      // rewind once the clip has faded back to the still, so the next play starts at the top
      if (box.dataset.mode === 'once') return; // the maps seek on every play instead
      setTimeout(() => {
        if (box.classList.contains('is-on')) return;
        try { if (v.currentTime > 0) v.currentTime = 0; } catch (_) { /* ignore */ }
      }, 450);
    }

    const toggle = (box) => (box.classList.contains('is-on') ? stop(box) : play(box));

    boxes.forEach((box) => {
      const host = hostOf(box);
      const btn = btnOf(box);
      if (btn) {
        btn.hidden = false;
        btn.addEventListener('click', () => toggle(box));
      }
      let t = 0;
      host.addEventListener('pointerenter', (e) => {
        if (e.pointerType !== 'mouse') return;
        clearTimeout(t);
        t = setTimeout(() => play(box), HOVER_DELAY);
      });
      host.addEventListener('pointerleave', (e) => {
        if (e.pointerType !== 'mouse') return;
        clearTimeout(t);
        if (box.classList.contains('is-on')) stop(box);
      });
    });

    // Scrolled out of view (e.g. a tapped clip on a phone): stop it.
    const io = new IntersectionObserver((entries) => {
      entries.forEach(({ target, isIntersecting }) => { if (!isIntersecting && target.classList.contains('is-on')) stop(target); });
    }, { threshold: 0 });
    boxes.forEach((b) => io.observe(b));
    document.addEventListener('visibilitychange', () => { if (document.hidden && current) stop(current); });

    clipsCtl = { stopAll() { if (current) stop(current); } };
  }

  /* ---------------- Patron gods: ARIA tabs ----------------
     Roving tabindex; Left/Right move (and select), Home/End jump. Static panels. */
  function setupGods() {
    const list = $('[data-gods-tabs]');
    if (!list) return;
    const tabs = $$('[role="tab"]', list);
    const panels = tabs.map((t) => document.getElementById(t.getAttribute('aria-controls')));
    const n = tabs.length;

    function select(i, focus) {
      tabs.forEach((t, k) => {
        const on = k === i;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        panels[k].hidden = !on;
      });
      if (focus) tabs[i].focus();
    }
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(i, false));
      t.addEventListener('keydown', (e) => {
        let j = null;
        if (e.key === 'ArrowRight') j = (i + 1) % n;
        else if (e.key === 'ArrowLeft') j = (i - 1 + n) % n;
        else if (e.key === 'Home') j = 0;
        else if (e.key === 'End') j = n - 1;
        if (j === null) return;
        e.preventDefault();
        select(j, true);
      });
    });
    const start = Math.max(0, tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true'));
    select(start, false);
  }

  /* ---------------- Finale coverflow (the trailer's end slide) ----------------
     Like the trailer: cards sit side by side and overlap a little, the centre card is
     clearly the biggest, neighbours turn gently away and shrink toward both edges, and
     each card glides to the centre, grows, rests there a moment, then makes way for the
     next. It never reads as a wheel because the cards fade out before they wrap around.
     Pauses on hover, focus,
     the pause button, a hidden tab, off-screen or the trailer. Drag/swipe scrubs it,
     clicking a card glides it to the centre, arrow keys step. Reduced motion: static. */
  function setupFlow() {
    const flow = $('[data-flow]');
    if (!flow) return;
    const cards = $$('.flow__card', flow);
    const toggle = $('[data-flow-toggle]', flow);
    const n = cards.length;
    const HALF = n / 2;
    const FADE_FROM = 3.6;        // |offset| where cards start to fade
    const FADE_TO = 4.6;          // fully gone (well before the wrap at n/2)
    let pos = 0;                  // continuous index of the card in the centre
    let hover = false; let focused = false; let userPaused = false; let inView = false;
    let dragX = null; let dragPos = 0; let moved = false;
    flow.classList.add('is-ready', 'is-live');

    const wrapD = (i) => { let d = i - pos; d -= Math.round(d / n) * n; return d; };

    function layout() {
      const cw = cards[0].offsetWidth;
      const P = cw * 8;
      let centre = -1; let best = 9;
      cards.forEach((c, i) => {
        const d = wrapD(i);
        const ad = Math.abs(d);
        const sg = Math.sign(d);
        const near = Math.min(ad, 1);
        const far = Math.max(0, ad - 1);
        const x = sg * cw * (0.98 * near + 0.78 * far - 0.035 * far * far);
        const scale = 1.22 - 0.22 * near - 0.055 * far;
        const rot = sg * (14 * near + 5 * far);          // degrees: a slight wheel, never a ring
        const z = -(0.18 * near + 0.1 * far) * cw;
        const op = ad <= FADE_FROM ? 1 : Math.max(0, 1 - (ad - FADE_FROM) / (FADE_TO - FADE_FROM));
        c.style.transform = 'perspective(' + P.toFixed(0) + 'px) translate3d(' + x.toFixed(1) + 'px,0,' + z.toFixed(1) + 'px) rotateY(' + rot.toFixed(2) + 'deg) scale(' + scale.toFixed(3) + ')';
        c.style.zIndex = String(100 - Math.round(ad * 10));
        c.style.opacity = op.toFixed(3);
        c.style.setProperty('--lit', Math.max(0.55, 1 - 0.13 * ad).toFixed(3));
        c.setAttribute('aria-hidden', ad > 2.5 ? 'true' : 'false');
        if (ad < best) { best = ad; centre = i; }
      });
      cards.forEach((c, i) => c.classList.toggle('is-center', i === centre && best < 0.35));
    }

    // Rhythm like the trailer: a card glides to the centre (and grows), holds there for a
    // moment, then shrinks as the next one slides in. Dragging scrubs; letting go snaps.
    const HOLD = 1800;            // ms a card rests in the centre
    const GLIDE = 900;            // ms to slide one card over
    const IDLE_AFTER_TOUCH = 5000;
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    let anim = null;              // { from, to, start, dur }
    let nextAt = performance.now() + HOLD;
    const canAuto = () => !reduced && !hover && !focused && !userPaused && inView && !document.hidden && !modalOpen && dragX === null;
    function animateTo(to, dur) {
      anim = { from: pos, to, start: performance.now(), dur };
    }
    function frame(now) {
      if (anim) {
        const t = Math.min(1, (now - anim.start) / anim.dur);
        pos = anim.from + (anim.to - anim.from) * ease(t);
        layout();
        if (t >= 1) { anim = null; pos = Math.round(pos); nextAt = Math.max(nextAt, now + HOLD); }
      } else if (dragX === null && canAuto() && now >= nextAt) {
        animateTo(Math.round(pos) + 1, GLIDE);
      }
      if (pos > n * 1000) pos -= n * 1000;
      requestAnimationFrame(frame);
    }

    function glideBy(k) {
      const base = anim ? anim.to : Math.round(pos);
      animateTo(base + k, Math.min(1400, 420 + 260 * Math.abs(k)));
      nextAt = performance.now() + IDLE_AFTER_TOUCH;
    }

    new IntersectionObserver(([e]) => { inView = e.isIntersecting; }, { threshold: 0.2 }).observe(flow);
    flow.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') hover = true; });
    flow.addEventListener('pointerleave', () => { hover = false; });
    flow.addEventListener('focusin', () => { focused = true; });
    flow.addEventListener('focusout', (e) => { if (!flow.contains(e.relatedTarget)) focused = false; });

    if (!reduced && toggle) {
      toggle.hidden = false;
      toggle.addEventListener('click', () => {
        userPaused = !userPaused;
        toggle.setAttribute('aria-pressed', String(userPaused));
        toggle.setAttribute('aria-label', userPaused ? 'Play cards' : 'Pause cards');
      });
    } else if (toggle) toggle.hidden = true;

    // Drag / swipe scrubs the row (touch keeps vertical page scrolling via touch-action: pan-y).
    flow.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button')) return;
      dragX = e.clientX; dragPos = pos; moved = false; anim = null;
    });
    flow.addEventListener('pointermove', (e) => {
      if (dragX === null) return;
      const dx = e.clientX - dragX;
      if (Math.abs(dx) > 6) moved = true;
      pos = dragPos - dx / (cards[0].offsetWidth * 0.9);
      layout();
    });
    const endDrag = () => {
      if (dragX === null) return;
      dragX = null;
      if (moved) { animateTo(Math.round(pos), 380); nextAt = performance.now() + IDLE_AFTER_TOUCH; }
    };
    flow.addEventListener('pointerup', endDrag);
    flow.addEventListener('pointercancel', endDrag);
    cards.forEach((c, i) => c.addEventListener('click', () => {
      if (moved) return;
      const d = Math.round(wrapD(i));
      if (d) glideBy(d);
    }));
    flow.addEventListener('keydown', (e) => {
      if (e.target.closest('button')) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); glideBy(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); glideBy(-1); }
    });

    layout();
    addEventListener('resize', layout);
    if (!reduced) requestAnimationFrame(frame);
    flowCtl = { resume: () => {} };
  }

  /* ---------------- Trailer modal ---------------- */
  function setupModal() {
    const dlg = $('[data-modal]');
    const frame = $('[data-modal-frame]');
    const closeBtn = $('[data-modal-close]');
    if (!dlg || typeof dlg.showModal !== 'function') {
      // Very old browsers: just open the file.
      $$('[data-trailer]').forEach((b) => b.addEventListener('click', () => {
        window.open(CONFIG.youtubeTrailerId ? 'https://www.youtube.com/watch?v=' + CONFIG.youtubeTrailerId : TRAILER_SRC, '_blank', 'noopener');
      }));
      return;
    }
    let opener = null;

    function open(e) {
      opener = e.currentTarget;
      frame.textContent = '';
      if (CONFIG.youtubeTrailerId) {
        const f = document.createElement('iframe');
        f.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(CONFIG.youtubeTrailerId) + '?autoplay=1&rel=0&modestbranding=1';
        f.title = 'Atlas Conquest trailer';
        f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
        f.allowFullscreen = true;
        f.referrerPolicy = 'strict-origin-when-cross-origin';
        frame.appendChild(f);
      } else {
        const v = document.createElement('video');
        v.controls = true;
        v.playsInline = true;
        v.preload = 'auto';
        v.poster = TRAILER_POSTER;
        v.setAttribute('aria-label', 'Atlas Conquest trailer, with sound');
        v.src = TRAILER_SRC;
        frame.appendChild(v);
      }
      modalOpen = true;
      if (heroCtl) heroCtl.update();
      if (clipsCtl) clipsCtl.stopAll();
      if (storyCtl) storyCtl.stopAll();
      dlg.showModal();
      closeBtn.focus();
      const v = $('video', frame);
      if (v) safePlay(v);
    }
    function teardown() {
      const v = $('video', frame);
      if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
      frame.textContent = '';
      modalOpen = false;
      if (heroCtl) heroCtl.update();
      if (flowCtl) flowCtl.resume();
      if (opener && document.contains(opener)) opener.focus();
    }
    $$('[data-trailer]').forEach((b) => b.addEventListener('click', open));
    closeBtn.addEventListener('click', () => dlg.close());
    dlg.addEventListener('close', teardown);
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    // focus trap: wrap Tab at both ends of the dialog
    $('[data-sentinel="start"]', dlg).addEventListener('focus', () => { ($('video, iframe', frame) || closeBtn).focus(); });
    $('[data-sentinel="end"]', dlg).addEventListener('focus', () => closeBtn.focus());
  }

  /* ---------------- Media viewer (click to expand) ----------------
     Any [data-view] element opens the shared <dialog data-viewer>. Items in the same
     data-view-group step with the arrows, the arrow keys or a swipe. Videos are muted,
     play at normal speed (once, or looped with data-view-loop) and pause on a click;
     a play-once clip holds its last frame with a Replay button. Delegated, so markup
     added later (e.g. by a section script) works too. Reduced motion: posters only. */
  function setupViewer() {
    const dlg = $('[data-viewer]');
    if (!dlg || typeof dlg.showModal !== 'function') return;
    const stage = $('[data-viewer-stage]', dlg);
    const cap = $('[data-viewer-cap]', dlg);
    const count = $('[data-viewer-count]', dlg);
    const replay = $('[data-viewer-replay]', dlg);
    let items = [];
    let i = 0;
    let opener = null;

    function media() { return $('video, img', stage); }
    function clear() {
      const m = media();
      if (m && m.tagName === 'VIDEO') { m.pause(); m.removeAttribute('src'); m.load(); }
      if (m) m.remove();
      const chap = $('.viewer__chapter', stage); if (chap) chap.remove();
      replay.hidden = true;
    }
    function show(k) {
      i = (k + items.length) % items.length;
      const el = items[i];
      const d = el.dataset;
      clear();
      cap.textContent = d.viewCaption || '';
      count.textContent = items.length > 1 ? (i + 1) + ' / ' + items.length : '';
      if (d.viewVideo && !reduced) {
        const v = document.createElement('video');
        v.muted = true; v.defaultMuted = true; v.playsInline = true;
        v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
        v.disablePictureInPicture = true;
        v.preload = 'auto';
        v.loop = 'viewLoop' in d;
        if (d.viewPoster) v.poster = d.viewPoster;
        v.src = d.viewVideo;
        v.setAttribute('aria-label', d.viewCaption || 'Gameplay clip');
        const start = parseFloat(d.viewStart || '0');
        const at = parseFloat(d.viewAt || '0'); // seconds into the clip (data-view-at)
        const go = () => {
          if (start > 0) { try { v.currentTime = (v.duration || 0) * start; } catch (_) { /* ignore */ } }
          else if (at > 0) { try { v.currentTime = at; } catch (_) { /* ignore */ } }
          safePlay(v);
        };
        if (v.readyState >= 1) go(); else v.addEventListener('loadedmetadata', go, { once: true });
        v.addEventListener('ended', () => { replay.hidden = false; });
        if (d.viewChapters) { // a big chapter title on the video follows the clip: "t:Word · line|..."
          const ch = d.viewChapters.split('|').map((p) => { const k = p.indexOf(':'); return [parseFloat(p.slice(0, k)), p.slice(k + 1)]; });
          const card = document.createElement('div');
          card.className = 'viewer__chapter';
          card.innerHTML = '<span class="viewer__chapter-word"></span><span class="viewer__chapter-line"></span>';
          stage.append(card);
          let shown = '';
          const paint = () => {
            let txt = ch[0][1];
            ch.forEach(([t, s]) => { if (v.currentTime >= t - 0.05) txt = s; });
            if (txt === shown) return;
            shown = txt;
            const [word, line] = txt.split(' · ');
            card.classList.remove('is-in'); void card.offsetWidth;
            $('.viewer__chapter-word', card).textContent = word;
            $('.viewer__chapter-line', card).textContent = line || '';
            card.classList.add('is-in');
            cap.textContent = txt;
          };
          v.addEventListener('timeupdate', paint);
          v.addEventListener('seeked', paint);
          paint();
        }
        v.addEventListener('click', () => { if (v.paused) { replay.hidden = true; safePlay(v); } else v.pause(); });
        stage.prepend(v);
      } else {
        const img = document.createElement('img');
        img.src = d.viewImage || d.viewPoster || '';
        img.alt = d.viewAlt || d.viewCaption || '';
        img.decoding = 'async';
        stage.prepend(img);
      }
    }
    function open(el) {
      const g = el.dataset.viewGroup;
      items = g ? $$('[data-view][data-view-group="' + g + '"]') : [el];
      opener = el;
      dlg.classList.toggle('is-single', items.length < 2);
      dlg.classList.toggle('has-chapters', 'viewChapters' in el.dataset);
      modalOpen = true;
      if (heroCtl) heroCtl.update();
      if (clipsCtl) clipsCtl.stopAll();
      if (storyCtl) storyCtl.stopAll();
      dlg.showModal();
      show(Math.max(0, items.indexOf(el)));
      $('[data-viewer-close]', dlg).focus();
    }

    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-view]');
      if (!el || dlg.contains(el)) return;
      e.preventDefault();
      open(el);
    });
    replay.addEventListener('click', () => {
      const v = media();
      if (!v || v.tagName !== 'VIDEO') return;
      replay.hidden = true;
      const start = parseFloat(items[i].dataset.viewStart || '0');
      try { v.currentTime = (v.duration || 0) * start; } catch (_) { /* ignore */ }
      safePlay(v);
    });
    $('[data-viewer-prev]', dlg).addEventListener('click', () => show(i - 1));
    $('[data-viewer-next]', dlg).addEventListener('click', () => show(i + 1));
    $('[data-viewer-close]', dlg).addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('keydown', (e) => {
      if (items.length < 2) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); show(i + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); show(i - 1); }
    });
    let sx = null;
    stage.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') sx = e.clientX; });
    stage.addEventListener('pointerup', (e) => {
      if (sx === null) return;
      const dx = e.clientX - sx; sx = null;
      if (items.length > 1 && Math.abs(dx) > 48) show(i + (dx < 0 ? 1 : -1));
    });
    dlg.addEventListener('close', () => {
      clear();
      modalOpen = false;
      if (heroCtl) heroCtl.update();
      if (flowCtl) flowCtl.resume();
      if (opener && document.contains(opener)) opener.focus();
    });
  }

  /* ---------------- The story beats (play, claim, strike) ----------------
     Three clips cut from one take. Pressing a beat plays it once at normal speed; when it
     ends, the next beat starts, so watching one rolls through the turn and then stops.
     Hover never starts anything. Only one video on the page plays at a time. */
  function setupStory() {
    const beats = $$('[data-beat]');
    if (!beats.length) return;
    let cur = -1;
    let raf = 0;
    const vid = (b) => {
      let v = $('video', b);
      if (v) return v;
      v = document.createElement('video');
      v.muted = true; v.defaultMuted = true; v.playsInline = true;
      v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
      v.preload = 'auto'; v.disablePictureInPicture = true;
      v.setAttribute('aria-hidden', 'true');
      v.src = b.dataset.src;
      v.addEventListener('playing', () => b.classList.add('is-live'));
      v.addEventListener('ended', () => { const n = beats.indexOf(b) + 1; stop(b); if (n < beats.length) start(n); });
      $('.beat__still', b).after(v);
      return v;
    };
    const bar = (b) => $('.beat__bar i', b);
    function tick() {
      const b = beats[cur];
      if (!b) return;
      const v = $('video', b);
      if (v && v.duration) bar(b).style.width = (100 * v.currentTime / v.duration) + '%';
      raf = requestAnimationFrame(tick);
    }
    function stop(b) {
      const v = $('video', b);
      b.classList.remove('is-on', 'is-live');
      $('[data-beat-play]', b).setAttribute('aria-pressed', 'false');
      if (v && !v.paused) v.pause();
      if (beats[cur] === b) { cur = -1; cancelAnimationFrame(raf); clipPlaying = false; if (heroCtl) heroCtl.update(); }
    }
    function start(i) {
      if (modalOpen) return;
      if (clipsCtl) clipsCtl.stopAll();
      if (cur >= 0 && cur !== i) stop(beats[cur]);
      beats.forEach((b, k) => { if (k >= i) bar(b).style.width = '0%'; });
      cur = i;
      const b = beats[i];
      const v = vid(b);
      b.classList.add('is-on');
      $('[data-beat-play]', b).setAttribute('aria-pressed', 'true');
      clipPlaying = true; if (heroCtl) heroCtl.update();
      try { v.currentTime = 0; } catch (_) { /* ignore */ }
      safePlay(v);
      cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
    }
    beats.forEach((b, i) => {
      $('[data-beat-play]', b).addEventListener('click', () => (cur === i ? stop(b) : start(i)));
    });
    new IntersectionObserver((es) => es.forEach((e) => { if (!e.isIntersecting && cur >= 0) stop(beats[cur]); }), { threshold: 0 })
      .observe($('[data-story]'));
    document.addEventListener('visibilitychange', () => { if (document.hidden && cur >= 0) stop(beats[cur]); });
    storyCtl = { stopAll() { if (cur >= 0) stop(beats[cur]); } };
  }

  /* Review helper: ?art=grutali | dyana | pilot swaps the facts band art (eagle-king by default). */
  function setupArtSwitch() {
    const img = $('[data-glance-art]');
    const pick = new URLSearchParams(location.search).get('art');
    if (!img || !pick) return;
    const map = { grutali: 'home/media/glance-grutali', dyana: 'home/media/glance-dyana', pilot: 'assets/media/keyart/pilot' };
    if (!map[pick]) return;
    img.src = map[pick] + '-1200.webp';
    img.srcset = map[pick] + '-1200.webp 1200w, ' + map[pick] + '-2400.webp 2400w';
    img.style.objectPosition = { grutali: '60% 45%', dyana: '50% 0%', pilot: '50% 30%' }[pick];
  }

  /* ---------------- Boot ---------------- */
  applyLinks();
  setupNav();
  setupAnchors();
  setupHero();
  setupEmbers();
  setupStills();
  setupClips();
  setupStory();
  setupGods();
  setupFlow();
  setupModal();
  setupViewer();
  setupArtSwitch();
})();
