/* OKÜ Dijital Yerleşke — service worker
 *
 * İki ayrı strateji:
 *   1) Uygulama kabuğu ve damgalı varlıklar → stale-while-revalidate.
 *      Varlık adresleri içerik hash'i taşıdığı için önbellekten anında
 *      servis etmek güvenlidir; arka planda yenilenir.
 *   2) Geometri LOD kademeleri (*.geometry-lod/*.glb) → cache-first + LRU.
 *      Modeller onlarca MB olduğu için kota izlenir ve budget aşılırsa en
 *      eski kullanılan kademeler atılır.
 *
 * Gezinme istekleri ağ-öncelikli çalışır; çevrimdışıyken tüm önbellekler
 * taranarak (caches.match) sayfa döndürülür.
 *
 * NOT: MODEL_CACHE adı bilinçli olarak sabit tutulur — sayfa (assets/viewer.js)
 * arka plan indirmelerini aynı önbelleğe yazar ve sürüm yükseltmesinde
 * kullanıcıların indirdiği kademeler silinmez.
 */

const VERSION = 'v4-20260905';
const SHELL_CACHE = `oku-shell-${VERSION}`;
const MODEL_CACHE = 'oku-geometry-lod-20260724-v2';
const META_CACHE = 'oku-meta-v1';

/** İlk ziyaretten sonra çevrimdışı açılabilmesi için gerekli en küçük küme. */
const SHELL_URLS = ['/', '/viewer.html', '/map.html', '/manifest.webmanifest'];

/** Model önbelleği için hedef: cihaz kotasının bu oranını geçmemeye çalışır. */
const MODEL_QUOTA_RATIO = 0.6;
/** Kota okunamazsa kullanılan sabit üst sınır. */
const MODEL_FALLBACK_BUDGET = 700 * 1024 * 1024;

const LRU_KEY = new Request('https://oku.local/__tier-order');

function isGeometryTier(url) {
  const path = url.pathname.toLowerCase();
  return path.includes('.geometry-lod/') && path.endsWith('.glb');
}

function isStampedAsset(url) {
  if (!url.pathname.startsWith('/assets/')) return false;
  return /\.(?:css|js|mjs|wasm|woff2|webp|avif|png|svg|hdr|webm)$/i.test(url.pathname);
}

/* ---------- LRU sırası (Cache API'de zaman damgası yok) ---------- */

async function readTierOrder() {
  try {
    const cache = await caches.open(META_CACHE);
    const response = await cache.match(LRU_KEY);
    if (!response) return [];
    const list = await response.json();
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function writeTierOrder(order) {
  try {
    const cache = await caches.open(META_CACHE);
    await cache.put(LRU_KEY, new Response(JSON.stringify(order.slice(-200)), {
      headers: { 'Content-Type': 'application/json' },
    }));
  } catch {
    // Meta yazılamazsa LRU devre dışı kalır; işlevsellik bozulmaz.
  }
}

async function touchTier(url) {
  const order = await readTierOrder();
  const next = order.filter((item) => item !== url);
  next.push(url);
  await writeTierOrder(next);
}

async function modelBudget() {
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (estimate?.quota) return estimate.quota * MODEL_QUOTA_RATIO;
  } catch {
    // Kota API'si yok; sabit sınır kullanılır.
  }
  return MODEL_FALLBACK_BUDGET;
}

async function cachedModelBytes(cache) {
  const requests = await cache.keys();
  let total = 0;
  for (const request of requests) {
    const response = await cache.match(request);
    const length = Number(response?.headers.get('Content-Length'));
    if (Number.isFinite(length) && length > 0) total += length;
  }
  return total;
}

/** Budget aşıldıysa en eski kullanılan kademeleri atar. */
async function enforceModelBudget() {
  const cache = await caches.open(MODEL_CACHE);
  const budget = await modelBudget();
  let used = await cachedModelBytes(cache);
  if (used <= budget) return;

  const order = await readTierOrder();
  const remaining = [...order];
  while (used > budget && remaining.length > 1) {
    const oldest = remaining.shift();
    if (!oldest) break;
    const response = await cache.match(oldest);
    const length = Number(response?.headers.get('Content-Length'));
    if (await cache.delete(oldest)) {
      used -= Number.isFinite(length) && length > 0 ? length : 0;
    }
  }
  await writeTierOrder(remaining);
}

/* ---------- Kurulum / etkinleşme ---------- */

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // Tek bir adres başarısız olsa bile kurulum tamamlanır.
    await Promise.allSettled(SHELL_URLS.map((url) => cache.add(new Request(url, { cache: 'reload' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => name.startsWith('oku-') && ![SHELL_CACHE, MODEL_CACHE, META_CACHE].includes(name))
        .map((name) => caches.delete(name)),
    );
    await self.clients.claim();
  })());
});

/* ---------- İstek yönlendirme ---------- */

async function handleNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    // Çevrimdışı: sorgu dizesi yok sayılarak tüm önbellekler taranır.
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    const shell = await caches.match('/viewer.html');
    if (shell && request.url.includes('viewer.html')) return shell;
    const home = await caches.match('/');
    if (home) return home;
    throw error;
  }
}

async function handleStampedAsset(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) {
    // Arka planda tazele (stale-while-revalidate).
    fetch(request)
      .then((response) => {
        if (response.ok) cache.put(request, response.clone()).catch(() => {});
      })
      .catch(() => {});
    return cached;
  }
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone()).catch(() => {});
  return response;
}

async function handleGeometryTier(request) {
  const cache = await caches.open(MODEL_CACHE);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) {
    void touchTier(request.url);
    return cached;
  }

  // Sayfanın arka plan indirmesi tamamlanmasını bekleyerek kendisi yazar;
  // burada ikinci kez kopyalamaya gerek yoktur.
  if (request.headers.get('X-Geometry-LOD-Prefetch') === '1') {
    return fetch(request);
  }

  const response = await fetch(request);
  if (response.ok) {
    const copy = response.clone();
    void (async () => {
      await cache.put(request, copy).catch(() => {});
      await touchTier(request.url);
      await enforceModelBudget();
    })();
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }
  if (isGeometryTier(url)) {
    event.respondWith(handleGeometryTier(request));
    return;
  }
  if (isStampedAsset(url)) {
    event.respondWith(handleStampedAsset(request));
  }
});

/* ---------- Sayfa ile mesajlaşma ---------- */

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'enforce-budget') {
    event.waitUntil(enforceModelBudget());
  }
  if (data.type === 'touch-tier' && typeof data.url === 'string') {
    event.waitUntil(touchTier(data.url));
  }
});
