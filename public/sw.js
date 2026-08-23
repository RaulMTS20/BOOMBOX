const CACHE_NAME = 'yotobox-v2';

const urlsToCache = [
  '/',
  '/index.html',
  '/src/main.js',
  '/style.css'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

// CACHÉ DINÁMICO: Guarda automáticamente Tailwind, Scanner y HTML2Canvas
self.addEventListener('fetch', event => {
  // Ignoramos peticiones directas a la base de datos de Firebase para no corromperlas
  if (event.request.url.includes('firestore.googleapis.com') || event.request.url.includes('identitytoolkit')) {
      return;
  }

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then(networkResponse => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic' && networkResponse.type !== 'cors') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        // Falla silenciosa si no hay red, evita colapsar la app
      });
    })
  );
});