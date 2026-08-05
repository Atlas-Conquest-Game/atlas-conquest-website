/**
 * Atlas Conquest — Deck Tools Service Worker
 *
 * Scope is site-wide ("/", since this file is served from the root), but the
 * fetch handler only intercepts deck-tools-relevant requests. Everything else
 * (analytics pages, articles, other JSON) is left completely alone via an
 * early return — this worker must not affect pages outside deck tools.
 *
 * Bump CACHE_NAME whenever the precached shell list below changes, so the
 * `activate` handler evicts the old cache and clients pick up fresh files.
 */

const CACHE_NAME = 'ac-decks-v1';
const DATA_CACHE = 'ac-decks-data-v1';
// Bumped to v2 to flush art cached under the old cache-first strategy, which
// pinned every viewed card JPG permanently and hid updated screenshots.
const ART_CACHE = 'ac-decks-art-v2';

// App shell needed for fully offline deck building (import/build/encode).
const SHELL_URLS = [
  '/decks.html',
  '/manifest.webmanifest',
  '/css/variables.css',
  '/css/base.css',
  '/css/layout.css',
  '/css/components.css',
  '/css/responsive.css',
  '/css/tooltips.css',
  '/css/decks.css',
  '/js/deckcode.js',
  '/js/decks.js',
  '/assets/logo/icon-192.png',
  '/assets/logo/icon-512.png',
  '/assets/logo/apple-touch-icon.png',
];

const DATA_URLS = [
  '/data/cardlist.json',
  '/data/cards.json',
  '/data/commanders.json',
];

// Matches commanderArtPath()/cardArtSlug() in site/js/decks.js.
function slugify(name) {
  return name.toLowerCase().replace(/[,.']/g, '').replace(/\s+/g, '-');
}

// Every deck needs a commander, so — unlike the ~150-card pool (34MB, too
// large to force-download on install) — it's worth guaranteeing the picker
// always has real art on a completely fresh offline session, before anything
// has been browsed. The commander roster is small and fixed (~2.5MB total
// for both the cropped portraits and the full framed cards), so precache it
// unconditionally rather than waiting for it to be viewed.
async function precacheCommanderArt(artCache) {
  try {
    const res = await fetch('/data/commanders.json');
    const commanders = await res.json();
    const urls = commanders.flatMap(c => {
      const slug = slugify(c.name);
      return [`/assets/commanders/${slug}.jpg`, `/assets/cards/${slug}.jpg`];
    });
    await artCache.addAll(urls);
  } catch {
    // Best effort — if this fails (e.g. install while offline), commander
    // art just falls back to the normal opportunistic cache-first behavior.
  }
}

self.addEventListener('install', event => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_URLS)),
      caches.open(DATA_CACHE).then(cache => cache.addAll(DATA_URLS)),
      caches.open(ART_CACHE).then(precacheCommanderArt),
    ]).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  const keep = new Set([CACHE_NAME, DATA_CACHE, ART_CACHE]);
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.filter(n => !keep.has(n)).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

function isDataRequest(url) {
  return DATA_URLS.some(p => url.pathname === p);
}

function isArtRequest(url) {
  return url.pathname.startsWith('/assets/cards/') || url.pathname.startsWith('/assets/commanders/');
}

function isDeckToolsNavigation(url) {
  return url.pathname === '/decks.html' || url.pathname.startsWith('/decks/');
}

// Instant cache hit, refreshed in the background — keeps the deck browser
// snappy while still picking up newly added cards on the next online visit.
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkFetch = fetch(request)
    .then(response => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || (await networkFetch) || Response.error();
}

async function navigationWithFallback(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cache = await caches.open(CACHE_NAME);
    return (await cache.match(request)) || (await cache.match('/decks.html'));
  }
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate' && isDeckToolsNavigation(url)) {
    event.respondWith(navigationWithFallback(request));
    return;
  }
  if (isDataRequest(url)) {
    event.respondWith(staleWhileRevalidate(request, DATA_CACHE));
    return;
  }
  if (isArtRequest(url)) {
    // Stale-while-revalidate, not cache-first: card screenshots get re-rendered
    // whenever the art is updated upstream, and cache-first served the stale JPG
    // forever with no way to invalidate short of bumping ART_CACHE by hand.
    // Still only caches art actually viewed, so the ~34MB art dir is never bulk
    // downloaded — each viewed image just costs one background revalidation.
    event.respondWith(staleWhileRevalidate(request, ART_CACHE));
    return;
  }
  // Not a deck-tools asset — let the browser handle it normally.
});
