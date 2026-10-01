/* OKÜ Dijital Yerleşke — service worker
 *
 * İki ayrı strateji:
 *   1) Uygulama kabuğu kurulumda hazırlanır; damgalı varlıklar cache-first,
 *      değişebilir varlıklar stale-while-revalidate ile karşılanır.
 *   2) Geometri LOD kademeleri (*.geometry-lod/*.glb) → cache-first + LRU.
 *      Modeller onlarca MB olduğu için kota izlenir ve budget aşılırsa en
 *      eski kullanılan kademeler atılır.
 *
 * Gezinme istekleri ağ-öncelikli çalışır; çevrimdışıyken güncel uygulama
 * kabuğundan sayfa döndürülür.
 *
 * NOT: MODEL_CACHE adı bilinçli olarak sabit tutulur — sayfa (assets/viewer.js)
 * arka plan indirmelerini aynı önbelleğe yazar ve sürüm yükseltmesinde
 * kullanıcıların indirdiği kademeler silinmez.
 */

// BEGIN GENERATED SHELL — tools/build_site.py
const VERSION = 'df87d5aed31c';
const SHELL_URLS = [
  "./",
  "assets/analytics.js?v=5b61da82a0",
  "assets/ar-viewer.js?v=dcf000ed18",
  "assets/favicon.svg?v=52269ff255",
  "assets/fonts/inter-latin-ext-wght-normal.woff2?v=34b9c504ca",
  "assets/fonts/inter-latin-wght-normal.woff2?v=3100e775e8",
  "assets/icons/icon-192.png?v=7fdb280c9e",
  "assets/index.css?v=7a00f654e1",
  "assets/index.js?v=571e836cae",
  "assets/map.css?v=e81407e0b9",
  "assets/map.js?v=c99383692d",
  "assets/map/campus-plan.avif?v=8eac8fb9a7",
  "assets/map/campus-plan.webp?v=2b4e47912e",
  "assets/model-viewer-config.js?v=42756abc1f",
  "assets/models.generated.js?v=e067485775",
  "assets/posters.lqip.css?v=b41c970472",
  "assets/theme.js?v=a72f30480e",
  "assets/tokens.css?v=1ee872bf51",
  "assets/viewer.css?v=2b26b1dab1",
  "assets/viewer.js?v=1f8638c744",
  "manifest.webmanifest",
  "manifest.webmanifest?v=d6865ca55d",
  "map.html",
  "viewer.html"
];
// END GENERATED SHELL
const SHELL_CACHE = `oku-shell-${VERSION}`;
const MODEL_CACHE = 'oku-geometry-lod-20260724-v2';
const META_CACHE = 'oku-meta-v1';
const scoped = path => new URL(path, self.registration.scope).href;

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
  if (!url.pathname.startsWith(new URL('assets/', self.registration.scope).pathname)) return false;
  return /\.(?:css|js|mjs|wasm|woff2|webp|avif|png|svg|hdr)$/i.test(url.pathname);
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

let maintenance = Promise.resolve();
function maintain(work) {
  maintenance = maintenance.then(work, work).catch(() => {});
  return maintenance;
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
    // A partial shell must not replace the last working offline release.
    await cache.addAll(SHELL_URLS.map(url => new Request(scoped(url), { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => name.startsWith('oku-') && ![SHELL_CACHE, MODEL_CACHE, META_CACHE, 'oku-offline-assets-v1'].includes(name))
        .map((name) => caches.delete(name)),
    );
    await self.clients.claim();
  })());
});

/* ---------- İstek yönlendirme ---------- */

function persist(event, promise) {
  // Cache writes and LRU updates must survive termination of an idle worker.
  event.waitUntil(promise.catch(() => {}));
}

async function handleNavigation(request, event) {
  const url = new URL(request.url);
  url.search = '';
  url.hash = '';
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      persist(event, cache.put(url.href, response.clone()));
    }
    return response;
  } catch (error) {
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match(url.href);
    if (cached) return cached;
    const home = await cache.match(scoped('./'));
    if (home) return home;
    throw error;
  }
}

async function handleAsset(request, event) {
  const cache = await caches.open(SHELL_CACHE);
  const shared = await caches.open('oku-offline-assets-v1');
  const cached = await cache.match(request, { ignoreVary: true }) || await shared.match(request, { ignoreVary: true });
  const url = new URL(request.url);
  // Content hashes and pinned vendor versions are immutable. Re-fetching them
  // wastes bandwidth, especially for WASM and the rendering engine.
  const immutable = url.searchParams.has('v') || url.pathname.includes('/vendor/');
  if (cached && immutable) return cached;
  const refresh = fetch(request).then(response => {
    if (response.status === 200) persist(event, cache.put(request, response.clone()));
    return response;
  });
  if (cached) {
    persist(event, refresh);
    return cached;
  }
  try { return await refresh; }
  catch (error) {
    const saved = await caches.match(request, { ignoreVary: true });
    if (saved) return saved;
    throw error;
  }
}

async function handleGeometryTier(request, event) {
  const cache = await caches.open(MODEL_CACHE);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) {
    persist(event, maintain(() => touchTier(request.url)));
    return cached;
  }
  if (request.headers.get('X-Geometry-LOD-Prefetch') === '1') return fetch(request);
  const response = await fetch(request);
  if (response.status === 200) {
    const copy = response.clone();
    persist(event, (async () => {
      await cache.put(request, copy);
      await maintain(async () => { await touchTier(request.url); await enforceModelBudget(); });
    })());
  }
  return response;
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  let response;
  if (request.mode === 'navigate') response = handleNavigation(request, event);
  else if (isGeometryTier(url)) response = handleGeometryTier(request, event);
  else if (isStampedAsset(url) || url.pathname.endsWith('.geometry-lod.json') || url.pathname.endsWith('.webmanifest')) response = handleAsset(request, event);
  if (response) {
    event.respondWith(response);
    // Register a lifetime promise during dispatch, before async cache reads.
    persist(event, response);
  }
});

/* ---------- Sayfa ile mesajlaşma ---------- */

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'enforce-budget') {
    event.waitUntil(maintain(enforceModelBudget));
  }
  if (data.type === 'touch-tier' && typeof data.url === 'string') {
    try {
      const url = new URL(data.url);
      if (url.origin === self.location.origin && isGeometryTier(url)) {
        event.waitUntil(maintain(() => touchTier(url.href)));
      }
    } catch { /* Ignore invalid client messages. */ }
  }
});
