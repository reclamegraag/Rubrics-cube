const CACHE_NAME = 'hypercube-v4';
const OFFLINE_URL = './index.html';

// We cachen tijdens installatie ALLEEN de absolute essentials waarvan we 100% zeker zijn dat ze bestaan.
// Het cachen van './' of './index.tsx' doen we pas in de 'fetch' fase (Runtime Caching) om 404 fouten tijdens installatie te voorkomen.
const PRECACHE_URLS = [
  './index.html',
  './manifest.json'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .catch(err => console.error('Pre-cache failed:', err))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keyList => {
      return Promise.all(keyList.map(key => {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }
      }));
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // 1. Navigation Requests (HTML pagina openen) -> Altijd index.html serveren (SPA Fallback)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match(OFFLINE_URL).then(response => {
        return response || fetch(OFFLINE_URL).catch(() => {
           // Als offline url niet in cache zit (zou niet moeten gebeuren), probeer de request zelf
           return fetch(event.request);
        });
      })
    );
    return;
  }

  // 2. Asset Requests -> Stale-While-Revalidate strategie
  // Probeer cache, haal ondertussen nieuwe versie van netwerk en update de cache.
  // Dit zorgt dat index.tsx en andere assets automatisch gecacht worden ZODRA ze succesvol laden.
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const fetchPromise = fetch(event.request).then(networkResponse => {
        // Check of we een geldig antwoord hebben voordat we cachen
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        // Netwerk faalt (offline), doe niets (we vallen terug op cachedResponse)
      });

      return cachedResponse || fetchPromise;
    })
  );
});