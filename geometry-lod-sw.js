const CACHE_NAME = 'oku-geometry-lod-20260724-v2';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter(name => name.startsWith('oku-geometry-lod-') && name !== CACHE_NAME)
        .map(name => caches.delete(name)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname.toLowerCase();
  const isGeometryTier = path.includes('.geometry-lod/') && path.endsWith('.glb');
  if (!isGeometryTier) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request, { ignoreVary: true });
    if (cached) return cached;

    // Arka plan fetch'ini sayfa Cache Storage'a kendisi, tamamlanmasını
    // bekleyerek yazar. Burada ikinci kez kopyalamaya gerek yoktur.
    if (event.request.headers.get('X-Geometry-LOD-Prefetch') === '1') {
      return fetch(event.request);
    }

    const response = await fetch(event.request);
    if (response.ok) {
      event.waitUntil(cache.put(event.request, response.clone()));
    }
    return response;
  })());
});
