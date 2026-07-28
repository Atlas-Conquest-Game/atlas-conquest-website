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
const ART_CACHE = 'ac-decks-art-v1';

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

self.addEventListener('install', event => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_URLS)),
      caches.open(DATA_CACHE).then(cache => cache.addAll(DATA_URLS)),
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

// Only cache art actually viewed — avoids bulk-downloading the ~34MB art dir.
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return cached || Response.error();
  }
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
    event.respondWith(cacheFirst(request, ART_CACHE));
    return;
  }
  // Not a deck-tools asset — let the browser handle it normally.
});
