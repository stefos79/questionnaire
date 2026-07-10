/**
 * NN Hellas — Service Worker
 *
 * Cache strategy:
 *  • App shell (HTML/CSS/JS/icons): cache-first με network fallback
 *  • CDN libs (fonts, chart.js, emailjs): stale-while-revalidate
 *  • Apps Script + EmailJS API calls: ΠΟΤΕ από cache (network-only)
 *
 * Όταν αλλάζεις κώδικα, ΑΛΛΑΞΕ το CACHE_VERSION για να φορτώσουν τα νέα αρχεία.
 */

const CACHE_VERSION = 'nn-questionnaire-v23';
const RUNTIME_CACHE = 'nn-runtime-v23';

// Αρχεία που φορτώνουν αμέσως όταν εγκατασταθεί η εφαρμογή
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './pwa-mode.css',
  './data.js',
  './engine.js',
  './ui.js',
  './integrations.js',
  './pwa-mode.js',
  './manifest.json',
  './logo.png',
  './icons/icon-32.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// URLs που ΠΟΤΕ δεν cache-άρονται (πάντα live request)
const NEVER_CACHE = [
  'script.google.com',     // Google Apps Script (Sheets)
  'api.emailjs.com',       // EmailJS
];

// ─── INSTALL ─────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL).catch((err) => {
        console.warn('[SW] APP_SHELL caching partial fail:', err);
      }))
      .then(() => self.skipWaiting())
  );
});

// ─── ACTIVATE ────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// ─── FETCH ───────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Μόνο GET requests
  if (event.request.method !== 'GET') return;

  // Network-only για API calls (Sheets / EmailJS)
  if (NEVER_CACHE.some((host) => url.hostname.includes(host))) {
    return; // αφήνουμε τον browser να κάνει κανονικό fetch
  }

  // Same-origin (app shell): cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          // cache-αρε νέα same-origin αρχεία
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => caches.match('./index.html'));
      })
    );
    return;
  }

  // Cross-origin (fonts, CDN): stale-while-revalidate
  event.respondWith(
    caches.open(RUNTIME_CACHE).then((cache) =>
      cache.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request).then((response) => {
          if (response && response.status === 200) cache.put(event.request, response.clone());
          return response;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    )
  );
});

// ─── MESSAGE: Manual cache update from app ──────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
