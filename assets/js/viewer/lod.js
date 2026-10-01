/* Geometri LOD denetleyicisi.

   Her modelin üç GLB kademesi (low / medium / high) vardır. Galeriden açılışta
   hafif kademe yüklenir; kullanıcı yakınlaştıkça daha ayrıntılı kademeye,
   uzaklaştıkça hafif olana geçilir. Kademe değişirken kamera ve görüntü
   korunur (geçiş anında son kare poster olarak gösterilir).

   Üst kademeler bağlantı, bellek ve sekme görünürlüğü uygunsa ilk görünümden
   sonra sırayla arka planda Cache Storage'a indirilir; veri tasarrufu veya
   yavaş bağlantıda kendiliğinden indirme yapılmaz, elle seçim çalışır. */

import { limitedConnection, registerServiceWorker } from '../core/site.js?v=18aec0c522';

export const MODEL_CACHE = 'oku-geometry-lod-20260724-v2';
const TIER_ORDER = ['low', 'medium', 'high'];

export function createLod({ mv, manifestUrl, pinned = '', onState, onHint, onTier, onSwitchDone, onSwitchStart }) {
  let manifest = null;
  let initialRadius = 0;
  let current = 'low';
  let switching = null;
  let restoring = false;
  let scanTimer = 0;
  let paused = false;
  let pinnedTier = TIER_ORDER.includes(pinned) ? pinned : '';
  let prefetchRunning = false;
  let prefetchTimer = 0;
  let waitingFor = '';
  const failed = new Set();
  const prefetchPromises = new Map();
  const prefetched = new Set();

  const canPrefetch = () => !document.hidden && navigator.onLine && !limitedConnection()
    && !(navigator.deviceMemory && navigator.deviceMemory <= 2);

  function setState(state) {
    mv.dataset.geometryLod = state;
    mv.dataset.geometryLodTier = current;
    onState?.(state);
  }

  const tierById = (id) => manifest?.tiers?.find(tier => tier?.id === id) || null;

  function tierSrc(tier) {
    if (!tier || typeof tier.src !== 'string') return '';
    try {
      const url = new URL(tier.src, manifestUrl);
      return url.origin === location.origin ? url.href : '';
    } catch {
      return '';
    }
  }

  async function ensureServiceWorker() {
    if (!window.isSecureContext || !('serviceWorker' in navigator)) return false;
    try {
      // Kayıt aynı adresle tekrarlandığında mevcut kaydı döndürür (zararsız).
      if (!await registerServiceWorker()) return false;
      await Promise.race([navigator.serviceWorker.ready, new Promise(resolve => window.setTimeout(resolve, 6000))]);
      if (navigator.serviceWorker.controller) return true;
      await new Promise(resolve => {
        const timer = window.setTimeout(resolve, 4000);
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          window.clearTimeout(timer);
          resolve();
        }, { once: true });
      });
      return Boolean(navigator.serviceWorker.controller);
    } catch {
      return false;
    }
  }

  async function consume(response) {
    if (!response.body?.getReader) {
      await response.arrayBuffer();
      return;
    }
    const reader = response.body.getReader();
    for (;;) {
      const { done } = await reader.read();
      if (done) return;
    }
  }

  async function store(src, response) {
    if (!window.isSecureContext || !('caches' in window)) {
      await consume(response);
      return;
    }
    // Cache.put yanıt gövdesini akış hâlinde tüketir; büyük GLB'nin ikinci bir
    // RAM kopyası oluşmaz.
    const cache = await caches.open(MODEL_CACHE);
    await cache.put(src, response);
  }

  function markPrefetched(id) {
    prefetched.add(id);
    mv.dataset.geometryLodPrefetched = [...prefetched].join(',');
  }

  function prefetchTier(id) {
    if (prefetchPromises.has(id)) return prefetchPromises.get(id);
    const src = tierSrc(tierById(id));
    if (!src) return Promise.resolve(false);
    const promise = (async () => {
      mv.dataset.geometryLodPrefetch = id;
      try {
        if (window.isSecureContext && 'caches' in window) {
          const cache = await caches.open(MODEL_CACHE);
          if (await cache.match(src, { ignoreVary: true })) {
            markPrefetched(id);
            return true;
          }
        }
        const response = await fetch(src, {
          credentials: 'same-origin',
          cache: 'force-cache',
          priority: 'low',
          headers: { 'X-Geometry-LOD-Prefetch': '1' },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        await store(src, response);
        navigator.serviceWorker?.controller?.postMessage({ type: 'touch-tier', url: src });
        markPrefetched(id);
        return true;
      } catch (error) {
        console.warn(`Arka plan ${id} kademesi indirilemedi:`, error);
        return false;
      }
    })().finally(() => {
      // Başarısız ön indirme çözülmüş bir söz bırakmamalı; elle kalite
      // seçimi yoksa onu sonsuza dek beklerdi.
      if (!prefetched.has(id)) prefetchPromises.delete(id);
    });
    prefetchPromises.set(id, promise);
    return promise;
  }

  async function runPrefetch() {
    if (prefetchRunning || !manifest) return;
    if (!canPrefetch()) {
      mv.dataset.geometryLodPrefetch = 'paused';
      return;
    }
    prefetchRunning = true;
    mv.dataset.geometryLodPrefetch = 'starting';
    try {
      await ensureServiceWorker();
      for (const id of ['medium', 'high']) {
        if (!canPrefetch()) {
          mv.dataset.geometryLodPrefetch = 'paused';
          return;
        }
        if (!await prefetchTier(id)) {
          mv.dataset.geometryLodPrefetch = 'retryable';
          return;
        }
      }
      mv.dataset.geometryLodPrefetch = 'ready';
      navigator.serviceWorker?.controller?.postMessage({ type: 'enforce-budget' });
    } finally {
      prefetchRunning = false;
    }
  }

  function schedulePrefetch() {
    if (prefetchRunning || !manifest || mv.dataset.geometryLodPrefetch === 'ready') return;
    window.clearTimeout(prefetchTimer);
    prefetchTimer = window.setTimeout(() => void runPrefetch(), 350);
  }

  function captureCamera() {
    try {
      const orbit = mv.getCameraOrbit();
      const target = mv.getCameraTarget();
      return {
        orbit: `${orbit.theta}rad ${orbit.phi}rad ${orbit.radius}m`,
        target: `${target.x}m ${target.y}m ${target.z}m`,
        fov: `${mv.getFieldOfView()}deg`,
      };
    } catch {
      return null;
    }
  }

  function restoreCamera(camera) {
    if (!camera) return;
    mv.cameraOrbit = camera.orbit;
    mv.cameraTarget = camera.target;
    mv.fieldOfView = camera.fov;
    mv.jumpCameraToGoal?.();
  }

  function desiredTier(ratio) {
    const thresholds = manifest?.thresholds || {};
    const mediumEnter = Number(thresholds.mediumEnter) || 0.68;
    const mediumExit = Number(thresholds.mediumExit) || 0.88;
    const highEnter = Number(thresholds.highEnter) || 0.38;
    const highExit = Number(thresholds.highExit) || 0.55;
    if (current === 'low') return ratio <= mediumEnter ? 'medium' : 'low';
    if (current === 'medium') {
      if (ratio <= highEnter) return 'high';
      if (ratio >= mediumExit) return 'low';
      return 'medium';
    }
    return ratio >= highExit ? 'medium' : 'high';
  }

  function switchTo(targetId, { recovering = false } = {}) {
    if (!manifest || switching || paused) return;
    if (targetId === current || failed.has(targetId)) return;
    const pending = prefetchPromises.get(targetId);
    if (pending && !prefetched.has(targetId)) {
      if (waitingFor === targetId) return;
      waitingFor = targetId;
      onHint?.('waiting', targetId);
      pending.finally(() => {
        if (waitingFor !== targetId) return;
        waitingFor = '';
        switchTo(targetId, { recovering });
      });
      return;
    }
    const src = tierSrc(tierById(targetId));
    if (!src) {
      failed.add(targetId);
      return;
    }
    switching = { from: current, fromSrc: tierSrc(tierById(current)), to: targetId, camera: captureCamera(), recovering };
    onSwitchStart?.();
    setState(recovering ? 'recovering' : 'switching');
    if (!recovering) onHint?.('loading', targetId);
    mv.setAttribute('src', src);
  }

  function scan() {
    scanTimer = 0;
    if (!manifest || paused || switching || !mv.loaded || document.hidden) return;
    if (pinnedTier) {
      switchTo(pinnedTier);
      return;
    }
    // Elle seçim her zaman çalışır; kendiliğinden yükseltme veri tasarrufuna uyar.
    if (limitedConnection() || !navigator.onLine) return;
    try {
      const radius = mv.getCameraOrbit().radius;
      switchTo(desiredTier(initialRadius > 0 ? radius / initialRadius : 1));
    } catch { /* Kamera henüz hazır değil; bir sonraki değişikliği bekle. */ }
  }

  function scheduleScan() {
    if (!manifest || paused) return;
    window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(scan, 320);
  }

  async function init() {
    if (!manifestUrl) {
      setState('disabled');
      return;
    }
    if (manifest) {
      scheduleScan();
      return;
    }
    setState('loading');
    try {
      const response = await fetch(manifestUrl, { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const document_ = await response.json();
      const ids = Array.isArray(document_?.tiers) ? document_.tiers.map(tier => tier?.id).join(',') : '';
      if (document_?.version !== 1 || ids !== TIER_ORDER.join(',')) throw new Error('Geçersiz geometri LOD manifesti');
      manifest = document_;
      if (manifest.tiers.some(tier => !tierSrc(tier))) throw new Error('Geçersiz geometri LOD yolu');
      current = 'low';
      initialRadius = mv.getCameraOrbit().radius;
      setState('ready');
      scheduleScan();
      schedulePrefetch();
    } catch (error) {
      manifest = null;
      setState('error');
      console.warn('Geometri LOD manifesti yüklenemedi:', error);
    }
  }

  /** model-viewer `load` olayı: kademe geçişiyse tamamlar ve true döner. */
  function handleLoad() {
    if (!switching) return false;
    const completed = switching;
    current = completed.to;
    switching = null;
    onTier?.(completed.to);
    restoreCamera(completed.camera);
    setState('ready');
    // Kamera bir sonraki karede bir kez daha geri yüklenir (model-viewer yeni
    // modelde kadrajı yeniden hesaplar). Bu süre boyunca "boşta" sayılmaz.
    restoring = true;
    window.requestAnimationFrame(() => {
      restoreCamera(completed.camera);
      window.requestAnimationFrame(() => {
        restoring = false;
        onSwitchDone?.();
      });
    });
    if (completed.recovering) onHint?.('recovered', completed.to);
    scheduleScan();
    return true;
  }

  /** model-viewer `error` olayı: kademe geçişinde kurtarma yapar; ele alındıysa true döner. */
  function handleError() {
    if (!switching) return false;
    const failedSwitch = switching;
    failed.add(failedSwitch.to);
    switching = null;
    if (!failedSwitch.recovering && failedSwitch.fromSrc) {
      current = failedSwitch.to;
      switching = { from: failedSwitch.to, fromSrc: '', to: failedSwitch.from, camera: failedSwitch.camera, recovering: true };
      setState('recovering');
      mv.setAttribute('src', failedSwitch.fromSrc);
      return true;
    }
    onSwitchDone?.();
    manifest = null;
    setState('error');
    return false;
  }

  function pin(id) {
    pinnedTier = TIER_ORDER.includes(id) ? id : '';
    if (pinnedTier) switchTo(pinnedTier);
    else scheduleScan();
    onState?.(mv.dataset.geometryLod || 'ready');
  }

  function setPaused(value) {
    paused = value;
    if (paused) window.clearTimeout(scanTimer);
    else scheduleScan();
  }

  const resume = () => {
    schedulePrefetch();
    scheduleScan();
  };
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('online', resume);
  navigator.connection?.addEventListener?.('change', resume);
  mv.addEventListener('camera-change', scheduleScan);

  /** Süren kademe geçişi bitince çözülür (tur uçuşları geçişle çakışmasın). */
  function whenIdle(timeout = 12000) {
    const busy = () => Boolean(switching) || restoring;
    if (!busy()) return Promise.resolve();
    const started = Date.now();
    return new Promise(resolve => {
      const check = () => (!busy() || Date.now() - started > timeout ? resolve() : window.setTimeout(check, 100));
      check();
    });
  }

  return {
    init,
    whenIdle,
    handleLoad,
    handleError,
    pin,
    setPaused,
    scheduleScan,
    tierSrc,
    get manifest() { return manifest; },
    get current() { return current; },
    get pinned() { return pinnedTier; },
    get switching() { return Boolean(switching); },
    get state() { return mv.dataset.geometryLod || ''; },
    ensureServiceWorker,
  };
}
