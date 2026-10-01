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
 * kabuğundan sayfa döndürülür (Türkçe kök ve /en/ ayrı ayrı önbelleklidir;
 * kayıtlı olmayan sayfada ziyaretçinin dilindeki ana sayfa açılır).
 *
 * NOT: MODEL_CACHE adı bilinçli olarak sabit tutulur — sayfa (assets/viewer.js)
 * arka plan indirmelerini aynı önbelleğe yazar ve sürüm yükseltmesinde
 * kullanıcıların indirdiği kademeler silinmez.
 */

// BEGIN GENERATED SHELL — tools/build_site.py
const VERSION = '10507cdd14f1';
const SHELL_URLS = [
  "./",
  "assets/css/base.css?v=802b98d7cd",
  "assets/css/home.css?v=85c2b0dea0",
  "assets/css/map.css?v=9f863a06e9",
  "assets/css/tokens.css?v=89da6370cc",
  "assets/css/viewer.css?v=8774834c12",
  "assets/favicon.svg?v=52269ff255",
  "assets/fonts/inter-latin-wght-normal.woff2?v=3100e775e8",
  "assets/fonts/inter-tr-wght-normal.woff2?v=62e90276ce",
  "assets/icons.svg?v=7b723e4b47",
  "assets/icons/icon-192.png?v=7fdb280c9e",
  "assets/js/boot.js?v=4c9da87abc",
  "assets/js/catalog.js?v=4af9199ebe",
  "assets/js/core/i18n.js?v=425bd5c155",
  "assets/js/core/site.js?v=18aec0c522",
  "assets/js/home.js?v=b419a50e3b",
  "assets/js/landing.js?v=e345a0b00d",
  "assets/js/map.js?v=9844619fb0",
  "assets/js/model-viewer-config.js?v=285a1634cb",
  "assets/js/viewer/ar-babylon.js?v=e4ecc59b8c",
  "assets/js/viewer/ar.js?v=4227edaa8a",
  "assets/js/viewer/editor.js?v=396da82e95",
  "assets/js/viewer/info.js?v=e43671eb28",
  "assets/js/viewer/lod.js?v=2a12188b5f",
  "assets/js/viewer/main.js?v=1668c63686",
  "assets/js/viewer/measure.js?v=bb448ce0b0",
  "assets/js/viewer/offline.js?v=ef81fc3e8a",
  "assets/js/viewer/qr.js?v=20795e2448",
  "assets/js/viewer/share.js?v=e222279000",
  "assets/js/viewer/snapshot.js?v=f1dfeadebf",
  "assets/js/viewer/tour.js?v=0089f34b6d",
  "assets/map/campus-plan.avif?v=8eac8fb9a7",
  "assets/map/campus-plan.webp?v=2b4e47912e",
  "assets/map/campus-plan@900.avif?v=e116389f4b",
  "assets/map/campus-plan@900.webp?v=a18aa2bbe4",
  "assets/posters.lqip.css?v=976de868d1",
  "assets/posters/a_b_blok@480.avif?v=fbbdb6c58c",
  "assets/posters/c_blok@480.avif?v=5bcc70f853",
  "assets/posters/d_blok@480.avif?v=720c1aed77",
  "assets/posters/e_blok@480.avif?v=fe05a64bb8",
  "assets/posters/f_blok@480.avif?v=52568c973c",
  "assets/posters/fabrika@480.avif?v=06652e92bc",
  "assets/posters/ilahiyat@480.avif?v=9d9790292c",
  "assets/posters/kutuphane@480.avif?v=cd081247d5",
  "assets/posters/oku_genel_plan@480.avif?v=a3db6a8bee",
  "assets/posters/rektorluk@480.avif?v=395b072524",
  "en/",
  "en/manifest.webmanifest?v=e85751ec58",
  "en/map.html",
  "en/viewer.html",
  "manifest.webmanifest?v=ff2df57e01",
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
    const cached = await cache.match(url.href) || await caches.match(url.href, { ignoreVary: true });
    if (cached) return cached;
    // Kayıtlı olmayan bir sayfa: ziyaretçinin dilindeki ana sayfa gösterilir.
    const english = url.pathname.startsWith(new URL('en/', self.registration.scope).pathname);
    const home = await cache.match(scoped(english ? 'en/' : './'));
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
    const poster = await posterFallback(url);
    if (poster) return poster;
    throw error;
  }
}

/* Çevrimdışıyken istenen poster boyutu önbellekte yoksa aynı posterin
   kayıtlı başka bir boyutu/biçimi verilir (kabuk en küçük AVIF'i tutar). */
async function posterFallback(url) {
  const match = /\/assets\/posters\/([a-z0-9_-]+)(?:@\d+)?\.(avif|webp)$/i.exec(url.pathname);
  if (!match) return null;
  const [, id, format] = match;
  const order = format === 'avif' ? ['avif', 'webp'] : ['webp', 'avif'];
  for (const ext of order) {
    for (const size of ['@480', '@800', '']) {
      const candidate = new URL(`assets/posters/${id}${size}.${ext}`, self.registration.scope);
      const hit = await caches.match(candidate.href, { ignoreSearch: true, ignoreVary: true });
      if (hit) return hit;
    }
  }
  return null;
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
