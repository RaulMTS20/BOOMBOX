const CACHE_NAME = 'yotobox-v3'; // Cambiamos la versión para forzar la actualización

const urlsToCache = [
  '/',
  '/index.html',
  '/src/main.js',
  '/style.css'
];

// FASE DE INSTALACIÓN
self.addEventListener('install', event => {
  self.skipWaiting(); // Obliga al celular a instalar esta nueva versión de inmediato
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

// FASE DE ACTIVACIÓN (El camión de basura)
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Si el caché viejo no se llama 'yotobox-v3', lo destruye
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim(); // Toma el control de la página sin tener que recargar
});

// FASE DE INTERCEPCIÓN (Modo Offline)
self.addEventListener('fetch', event => {
  if (event.request.url.includes('firestore.googleapis.com') || event.request.url.includes('identitytoolkit')) {
      return;
  }

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) return cachedResponse;
      
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
        // Falla silenciosa si no hay red
      });
    })
  );
});