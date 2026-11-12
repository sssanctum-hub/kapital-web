// Работа без интернета: файлы сайта берутся из сети, а если сети нет — из кэша последней загрузки.
// Данные (база и настройки) хранятся отдельно в браузере и сервис-воркер их не касается.
const CACHE = 'kapital-site';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || Promise.reject(new Error('offline')))),
  );
});
