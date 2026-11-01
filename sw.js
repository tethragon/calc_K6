// Service Worker for Calculator K6 PWA
const CACHE_NAME = 'calc-k6-v1.0.0';

// Core local assets (relative paths for GitHub Pages subpath compatibility)
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  './icons/icon-maskable-512x512.png',
  './icons/apple-touch-icon.png',
  './icons/icon.svg',
  './icons/favicon-32x32.png'
];

// External CDN libraries used by Calculator K6
const CDN_ASSETS = [
  'https://ajax.googleapis.com/ajax/libs/jquery/3.6.0/jquery.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/mathquill/0.10.1/mathquill.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/mathquill/0.10.1/mathquill.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/mathjs/11.8.0/math.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
];

// Install Event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Precache local assets
      await cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('Pre-caching some local assets failed:', err);
      });
      // Best-effort cache for CDN assets
      for (const url of CDN_ASSETS) {
        try {
          const response = await fetch(url, { mode: 'cors' });
          if (response && response.status === 200) {
            await cache.put(url, response);
          }
        } catch (e) {
          console.warn('Pre-caching CDN asset failed (will fetch on demand):', url);
        }
      }
    })
  );
  self.skipWaiting();
});

// Activate Event - clean up obsolete caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Stale-while-revalidate for assets, Network-first for navigation
self.addEventListener('fetch', (event) => {
  const request = event.request;
  
  // Ignore non-GET requests or chrome-extension URLs
  if (request.method !== 'GET' || !request.url.startsWith('http')) {
    return;
  }

  // Navigation requests: Network-first with cache fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const fallback = await caches.match('./index.html') || await caches.match('./');
          return fallback;
        })
    );
    return;
  }

  // Static assets & CDN requests: Cache-first, then network + update cache
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch in background to update cache (stale-while-revalidate)
        fetch(request)
          .then((networkResponse) => {
            if (networkResponse && (networkResponse.status === 200 || networkResponse.status === 0)) {
              caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse));
            }
          })
          .catch(() => {});
        return cachedResponse;
      }

      return fetch(request).then((networkResponse) => {
        if (!networkResponse || (networkResponse.status !== 200 && networkResponse.status !== 0)) {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));
        return networkResponse;
      }).catch((error) => {
        // If image request fails offline, fallback to icon
        if (request.destination === 'image') {
          return caches.match('./icons/icon-192x192.png');
        }
        throw error;
      });
    })
  );
});
