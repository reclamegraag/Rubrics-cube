const CACHE_NAME = 'hypercube-v3';
const OFFLINE_URL = './index.html';

const urlsToCache = [
  './',
  './index.html',
  './index.tsx',
  './manifest.json'
];

self.addEventListener('install', event => {
  self.skipWaiting(); // Force new SW to activate immediately
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  // Navigation Fallback: For SPA, always serve index.html for navigation requests
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match(OFFLINE_URL).then((response) => {
        return response || fetch(event.request).catch(() => caches.match(OFFLINE_URL));
      })
    );
    return;
  }

  // Standard Cache First strategy for assets
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Take control of all pages immediately
  );
});