/* Basit yardımcılar */
function qs(sel, root = document) { return root.querySelector(sel); }
function qsp(param, def = '') {
  const u = new URL(location.href);
  return u.searchParams.get(param) ?? def;
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function prefersReducedMotion() {
  try {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const show = (el) => el && el.classList.remove('is-hidden');
  const hide = (el) => el && el.classList.add('is-hidden');

  const debugFlag = (qsp('debug', '') || '').toString().trim().toLowerCase();
  const debugEnabled = debugFlag === '1' || debugFlag === 'true' || debugFlag === 'yes' || debugFlag === 'on';
  const debugEl = qs('#debug');

  function getWebGLInfo() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return { supported: false };
      const isWebGL2 = (typeof WebGL2RenderingContext !== 'undefined') && (gl instanceof WebGL2RenderingContext);
      const info = {
        supported: true,
        webgl2: isWebGL2,
        maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      };
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) {
        info.vendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL);
        info.renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
      }
      return info;
    } catch (e) {
      return { supported: false, error: String(e) };
    }
  }

  function renderDebug(obj) {
    if (!debugEnabled || !debugEl) return;
    show(debugEl);
    const lines = [];
    for (const [k, v] of Object.entries(obj || {})) {
      if (v === undefined) continue;
      if (v && typeof v === 'object') lines.push(`${k}: ${JSON.stringify(v, null, 2)}`);
      else lines.push(`${k}: ${String(v)}`);
    }
    debugEl.textContent = lines.join('\n\n');
  }

  function posterDataUri(text) {
    const safeTitle = (text || '3D Model').toString().slice(0, 80);
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">` +
      `<rect width="1200" height="675" fill="#16161a"/>` +
      `<text x="600" y="362" text-anchor="middle" font-size="44" font-weight="600" fill="#d4d4d8" ` +
      `font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial">${safeTitle}</text>` +
      `</svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  if (location.protocol === 'file:') {
    const errorWrap = qs('#errorWrap');
    qs('#error').textContent =
      "Bu sayfa 'file://' üzerinden çalıştırılamaz. Yerel sunucu ile açın: python3 -m http.server 8000 (sonra http://localhost:8000/).";
    show(errorWrap);
    hide(qs('#loadPrompt'));
    hide(qs('#loader'));
    return;
  }

  const title = qsp('title', '3D Model');
  const model = qsp('model', '');
  const fallbackModel = qsp('fallback', '');
  const geometryLod = qsp('geomLod', '');
  const iosSrc = qsp('ios', '');
  const orbit = qsp('orbit', '55deg 65deg auto');
  const exposure = qsp('exposure', '0.7');
  const poster = qsp('poster', '');
  const modelType = qsp('type', '3B kampüs modeli');
  const description = qsp('description', `${title} yapısını etkileşimli 3B model üzerinden inceleyin.`);
  const sizeBytes = Number.parseInt(qsp('size', '0'), 10);
  const fallbackSizeBytes = Number.parseInt(qsp('fallbackSize', '0'), 10);
  const reveal = qsp('reveal', 'auto'); // auto | interaction | manual
  const arPlacement = qsp('arPlacement', 'floor'); // floor | wall
  const arScale = qsp('arScale', 'auto');

  // Başlıkları doldur
  qs('#title').textContent = title;
  qs('#subtitle').textContent = description;
  qs('#modelType').textContent = modelType;
  qs('#modelDescription').textContent = description;
  document.title = `${title} • OKÜ Dijital Yerleşke`;
  const descriptionMeta = qs('meta[name="description"]');
  if (descriptionMeta) descriptionMeta.setAttribute('content', `${title}: ${description}`);

  const loadPrompt = qs('#loadPrompt');
  const loader = qs('#loader');
  const errorWrap = qs('#errorWrap');
  const hint = qs('#hint');
  const startLoadBtn = qs('#startLoad');
  const cancelLoadBtn = qs('#cancelLoad');
  const retryLoadBtn = qs('#retryLoad');
  const modelSizeEl = qs('#modelSize');
  const loadMeta = qs('#loadMeta');
  const tierTransitionPoster = qs('#tierTransitionPoster');
  renderDebug({
    debug: debugEnabled,
    url: location.href,
    userAgent: navigator.userAgent,
    title,
    modelParam: model,
    fallbackParam: fallbackModel || '',
    geometryLodParam: geometryLod || '',
    webgl: getWebGLInfo(),
  });

  // Model kontrolü
  if (!model) {
    qs('#error').textContent = 'Görüntülenecek model bilgisi eksik. Galeriye dönüp modeli yeniden seçin.';
    show(errorWrap);
    hide(loadPrompt);
    hide(loader);
    return;
  }

  // Model-Viewer ayarla
  const mv = qs('#mv');
  mv.setAttribute('alt', `${title}: ${description}`);
  mv.setAttribute('crossorigin', 'anonymous');
  // Basit güvenlik: yalnızca belirli klasör/uzantılara izin ver
  const DEFAULT_ALLOWED_PREFIXES = [
    'a_b_blok/', 'c_blok/', 'd_blok/', 'e_blok/', 'f_blok/',
    'fabrika/', 'ilahiyat/', 'kutuphane/', 'oku_genel_plan/', 'rektorluk/'
  ];
  const ALLOWED_PREFIXES = (window.MODEL_GALLERY && Array.isArray(window.MODEL_GALLERY.allowedModelPrefixes))
    ? window.MODEL_GALLERY.allowedModelPrefixes
    : DEFAULT_ALLOWED_PREFIXES;

  function isSafeRelPath(path) {
    if (!path) return false;
    if (path.startsWith('/') || path.startsWith('\\') || path.startsWith('//')) return false;
    if (path.includes('..')) return false;
    if (path.includes(':')) return false;
    return true;
  }

  function isAllowedModelPath(path) {
    const lower = (path || '').toLowerCase();
    const okPrefix = ALLOWED_PREFIXES.some(p => lower.startsWith(String(p).toLowerCase()));
    const okExt = lower.endsWith('.gltf') || lower.endsWith('.glb');
    return isSafeRelPath(path) && okPrefix && okExt;
  }

  function isAllowedPosterPath(path) {
    const lower = (path || '').toLowerCase();
    const okExt = lower.endsWith('.svg') || lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.webp');
    const okPrefix = lower.startsWith('assets/posters/') || lower.startsWith('assets/');
    return isSafeRelPath(path) && okPrefix && okExt;
  }

  function isAllowedIosPath(path) {
    const lower = (path || '').toLowerCase();
    const okExt = lower.endsWith('.usdz');
    const okPrefix = ALLOWED_PREFIXES.some(p => lower.startsWith(String(p).toLowerCase()));
    return isSafeRelPath(path) && okPrefix && okExt;
  }

  function isAllowedLodPath(path) {
    const lower = (path || '').toLowerCase();
    const okExt = lower.endsWith('.json');
    const okPrefix = ALLOWED_PREFIXES.some(p => lower.startsWith(String(p).toLowerCase()));
    return isSafeRelPath(path) && okPrefix && okExt;
  }

  if (!isAllowedModelPath(model)) {
    qs('#error').textContent = 'Bu model bağlantısı güvenli değil veya artık geçerli değil. Galeriye dönüp modeli yeniden seçin.';
    show(errorWrap);
    hide(loadPrompt);
    hide(loader);
    return;
  }

  const safeFallback = (fallbackModel && isAllowedModelPath(fallbackModel)) ? fallbackModel : '';

  function toAbsoluteUrl(path) {
    try {
      return new URL(path, location.href).toString();
    } catch {
      return path;
    }
  }

  const primarySrcUrl = toAbsoluteUrl(model);
  const fallbackSrcUrl = safeFallback ? toAbsoluteUrl(safeFallback) : '';
  const geometryLodUrl = geometryLod && isAllowedLodPath(geometryLod)
    ? toAbsoluteUrl(geometryLod)
    : '';

  const babylonAr = window.OKU_BABYLON_AR || null;
  if (babylonAr) {
    void babylonAr.configure({
      title,
      model: primarySrcUrl,
      geometryLod: geometryLodUrl,
    });
  }

  mv.setAttribute('camera-orbit', orbit);
  renderDebug({
    debug: debugEnabled,
    src: primarySrcUrl,
    fallbackSrc: fallbackSrcUrl || '',
    geometryLod: geometryLodUrl || '',
    webgl: getWebGLInfo(),
  });
  const exposureNum = Number.parseFloat(exposure);
  if (Number.isFinite(exposureNum)) mv.setAttribute('exposure', String(Math.max(0, Math.min(2, exposureNum))));

  if (poster && isAllowedPosterPath(poster)) mv.setAttribute('poster', toAbsoluteUrl(poster));
  else mv.setAttribute('poster', posterDataUri(title));

  const allowedReveal = new Set(['auto', 'interaction', 'manual']);
  if (reveal && allowedReveal.has(reveal)) mv.setAttribute('reveal', reveal);
  mv.setAttribute('ar', '');
  mv.setAttribute('ar-modes', 'webxr scene-viewer quick-look');
  const allowedArScale = new Set(['auto', 'fixed']);
  if (arScale && allowedArScale.has(arScale)) mv.setAttribute('ar-scale', arScale);
  const allowedArPlacement = new Set(['floor', 'wall']);
  if (arPlacement && allowedArPlacement.has(arPlacement)) mv.setAttribute('ar-placement', arPlacement);
  mv.setAttribute('environment-image', 'neutral');
  mv.setAttribute('shadow-intensity', '1');
  mv.setAttribute('camera-controls', '');
  mv.setAttribute('min-camera-orbit', 'auto auto 5%');
  mv.setAttribute('touch-action', 'pan-y');
  mv.setAttribute('interaction-prompt', 'none');
  mv.setAttribute('auto-rotate', '');

  // iOS: ios-src desteği
  const safeIosSrc = (iosSrc && isAllowedIosPath(iosSrc)) ? iosSrc : '';
  if (safeIosSrc) {
    mv.setAttribute('ios-src', toAbsoluteUrl(safeIosSrc));
  }

  // Kullanıcı "reduce motion" istiyorsa oto-döndürmeyi kapat
  if (prefersReducedMotion()) {
    mv.removeAttribute('auto-rotate');
  }

  let persistentHintHTML = '';
  let hintTimeoutId = null;
  function showHintHTML(html, timeoutMs = 0) {
    if (hintTimeoutId) {
      window.clearTimeout(hintTimeoutId);
      hintTimeoutId = null;
    }
    hint.innerHTML = html;
    show(hint);
    if (timeoutMs > 0) {
      hintTimeoutId = window.setTimeout(() => {
        if (persistentHintHTML) {
          hint.innerHTML = persistentHintHTML;
          show(hint);
        } else {
          hide(hint);
        }
      }, timeoutMs);
    }
  }

  // Yükleme ilerlemesi
  const bar = qs('#bar');
  const percent = qs('#percent');
  let activeSizeBytes = Number.isFinite(sizeBytes) && sizeBytes > 0 ? sizeBytes : 0;
  let loadStartedAt = 0;
  let elapsedTimer = null;
  let lastProgress = 0;
  let loadCancelled = false;
  let triedFallback = false;

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unit = units[0];
    for (const candidate of units) {
      unit = candidate;
      if (value < 1024 || candidate === units[units.length - 1]) break;
      value /= 1024;
    }
    return unit === 'B' ? `${Math.round(value)} ${unit}` : `${value.toFixed(value >= 100 ? 0 : 1)} ${unit}`;
  }

  function updateLoadMeta() {
    if (!loadMeta || !loadStartedAt) return;
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - loadStartedAt) / 1000));
    const elapsedText = elapsedSeconds < 60
      ? `${elapsedSeconds} sn`
      : `${Math.floor(elapsedSeconds / 60)} dk ${elapsedSeconds % 60} sn`;
    const transferred = activeSizeBytes ? formatBytes(activeSizeBytes * lastProgress) : '';
    const total = activeSizeBytes ? formatBytes(activeSizeBytes) : '';
    loadMeta.textContent = transferred && total
      ? `Yaklaşık ${transferred} / ${total} · ${elapsedText}`
      : `Geçen süre: ${elapsedText}`;
  }

  function stopElapsedTimer() {
    if (elapsedTimer) window.clearInterval(elapsedTimer);
    elapsedTimer = null;
  }

  function resetProgress() {
    lastProgress = 0;
    if (bar) bar.value = 0;
    if (percent) percent.textContent = '0%';
  }

  function beginLoad(srcUrl, expectedSize = sizeBytes) {
    loadCancelled = false;
    activeSizeBytes = Number.isFinite(expectedSize) && expectedSize > 0 ? expectedSize : 0;
    loadStartedAt = Date.now();
    resetProgress();
    hide(loadPrompt);
    hide(errorWrap);
    show(loader);
    stopElapsedTimer();
    updateLoadMeta();
    elapsedTimer = window.setInterval(updateLoadMeta, 1000);
    mv.setAttribute('src', srcUrl);
  }

  function retryUrl(srcUrl) {
    try {
      const url = new URL(srcUrl);
      url.searchParams.set('_retry', String(Date.now()));
      return url.toString();
    } catch {
      return srcUrl;
    }
  }

  function cancelLoad() {
    loadCancelled = true;
    stopElapsedTimer();
    mv.removeAttribute('src');
    resetProgress();
    hide(loader);
    hide(errorWrap);
    show(loadPrompt);
    startLoadBtn?.focus();
  }

  if (modelSizeEl) {
    modelSizeEl.textContent = activeSizeBytes
      ? `Tahmini indirme: ${formatBytes(activeSizeBytes)}`
      : 'İndirme boyutu bilinmiyor';
  }
  if (startLoadBtn) {
    startLoadBtn.textContent = activeSizeBytes
      ? `Yüklemeye devam et · ${formatBytes(activeSizeBytes)}`
      : 'Yüklemeye devam et';
    startLoadBtn.addEventListener('click', () => {
      triedFallback = false;
      beginLoad(primarySrcUrl, sizeBytes);
    });
  }
  cancelLoadBtn?.addEventListener('click', cancelLoad);
  retryLoadBtn?.addEventListener('click', () => {
    triedFallback = false;
    beginLoad(retryUrl(primarySrcUrl), sizeBytes);
  });

  mv.addEventListener('progress', (ev) => {
    lastProgress = Math.max(0, Math.min(1, ev.detail?.totalProgress ?? 0));
    const p = Math.round(lastProgress * 100);
    if (bar) bar.value = p;
    percent.textContent = `${p}%`;
    updateLoadMeta();
  });

  // Büyük modellerin geometri ve dokularını yakınlığa göre üç GLB kademesinde
  // değiştirir. Kademe değişirken mevcut görüntü ve kamera korunur.
  let geometryLodManifest = null;
  let geometryLodInitialRadius = 0;
  let geometryLodCurrent = 'low';
  let geometryLodSwitch = null;
  let geometryLodTimer = null;
  let geometryLodPaused = false;
  let geometryLodPrefetchStarted = false;
  let geometryLodWaitingForPrefetch = '';
  const MODEL_LOD_CACHE = 'oku-geometry-lod-20260724-v2';
  const geometryLodFailed = new Set();
  const geometryLodPrefetchPromises = new Map();
  const geometryLodPrefetched = new Set();

  function updateGeometryLodDataset(state) {
    mv.dataset.geometryLod = state;
    mv.dataset.geometryLodTier = geometryLodCurrent;
  }

  function geometryLodTier(id) {
    return geometryLodManifest?.tiers?.find(tier => tier?.id === id) || null;
  }

  function geometryLodSrc(tier) {
    if (!tier || typeof tier.src !== 'string') return '';
    try {
      const url = new URL(tier.src, geometryLodUrl);
      return url.origin === location.origin ? url.toString() : '';
    } catch {
      return '';
    }
  }

  async function consumeResponse(response) {
    if (!response.body || typeof response.body.getReader !== 'function') {
      await response.arrayBuffer();
      return;
    }
    const reader = response.body.getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }
  }

  async function ensureLodServiceWorker() {
    if (!window.isSecureContext || !('serviceWorker' in navigator)) return false;
    try {
      await navigator.serviceWorker.register('./geometry-lod-sw.js?v=20260724-v2', { scope: './' });
      await navigator.serviceWorker.ready;
      if (navigator.serviceWorker.controller) return true;
      await new Promise(resolve => {
        const timeoutId = window.setTimeout(resolve, 4000);
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          window.clearTimeout(timeoutId);
          resolve();
        }, { once: true });
      });
      return Boolean(navigator.serviceWorker.controller);
    } catch (error) {
      console.warn('Geometri LOD önbellek katmanı başlatılamadı:', error);
      return false;
    }
  }

  async function cacheGeometryLodResponse(src, response) {
    if (!window.isSecureContext || !('caches' in window)) {
      await consumeResponse(response);
      return;
    }
    const cache = await window.caches.open(MODEL_LOD_CACHE);
    // Cache.put yanıt gövdesini doğrudan akış halinde tüketir. clone/arrayBuffer
    // kullanılmadığı için büyük GLB'nin ikinci bir RAM kopyası oluşmaz.
    await cache.put(src, response);
  }

  function prefetchGeometryLodTier(tierId) {
    if (geometryLodPrefetchPromises.has(tierId)) {
      return geometryLodPrefetchPromises.get(tierId);
    }

    const tier = geometryLodTier(tierId);
    const src = geometryLodSrc(tier);
    if (!src) return Promise.resolve(false);

    const promise = (async () => {
      mv.dataset.geometryLodPrefetch = tierId;
      try {
        if (window.isSecureContext && 'caches' in window) {
          const cache = await window.caches.open(MODEL_LOD_CACHE);
          if (await cache.match(src, { ignoreVary: true })) {
            geometryLodPrefetched.add(tierId);
            mv.dataset.geometryLodPrefetched = Array.from(geometryLodPrefetched).join(',');
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
        // Akışı tüketir ama tüm GLB'yi ayrıca bir ArrayBuffer olarak RAM'de tutmaz.
        // Tamamlanan yanıt kalıcı Cache Storage alanına yazılır.
        await cacheGeometryLodResponse(src, response);
        geometryLodPrefetched.add(tierId);
        mv.dataset.geometryLodPrefetched = Array.from(geometryLodPrefetched).join(',');
        return true;
      } catch (error) {
        console.warn(`Arka plan ${tierId} model kademesi indirilemedi:`, error);
        return false;
      }
    })();
    geometryLodPrefetchPromises.set(tierId, promise);
    return promise;
  }

  async function startGeometryLodPrefetch() {
    if (geometryLodPrefetchStarted || !geometryLodManifest) return;
    geometryLodPrefetchStarted = true;
    mv.dataset.geometryLodPrefetch = 'starting';

    // Orta kademe önce tamamlanır; yüksek kademe onun ardından indirilir.
    // Böylece kullanıcının ilk olası zoom geçişi en kısa sürede hazır olur.
    await ensureLodServiceWorker();
    await prefetchGeometryLodTier('medium');
    await prefetchGeometryLodTier('high');
    mv.dataset.geometryLodPrefetch = 'ready';
  }

  function scheduleGeometryLodPrefetch() {
    if (geometryLodPrefetchStarted || !geometryLodManifest) return;
    window.setTimeout(() => void startGeometryLodPrefetch(), 350);
  }

  function captureCamera() {
    try {
      const cameraOrbit = mv.getCameraOrbit();
      const cameraTarget = mv.getCameraTarget();
      return {
        orbit: `${cameraOrbit.theta}rad ${cameraOrbit.phi}rad ${cameraOrbit.radius}m`,
        target: `${cameraTarget.x}m ${cameraTarget.y}m ${cameraTarget.z}m`,
        fieldOfView: `${mv.getFieldOfView()}deg`,
      };
    } catch {
      return null;
    }
  }

  function restoreCamera(camera) {
    if (!camera) return;
    mv.cameraOrbit = camera.orbit;
    mv.cameraTarget = camera.target;
    mv.fieldOfView = camera.fieldOfView;
    if (typeof mv.jumpCameraToGoal === 'function') mv.jumpCameraToGoal();
  }

  function showTierTransitionPoster() {
    if (!tierTransitionPoster || typeof mv.toDataURL !== 'function') return;
    try {
      tierTransitionPoster.src = mv.toDataURL('image/webp', 0.82);
      show(tierTransitionPoster);
    } catch {
      hide(tierTransitionPoster);
    }
  }

  function hideTierTransitionPoster() {
    if (!tierTransitionPoster) return;
    hide(tierTransitionPoster);
    tierTransitionPoster.removeAttribute('src');
  }

  function setGeometryLodPaused(paused) {
    geometryLodPaused = paused;
    if (paused && geometryLodTimer) {
      window.clearTimeout(geometryLodTimer);
      geometryLodTimer = null;
    }
  }

  function desiredGeometryTier(ratio) {
    const thresholds = geometryLodManifest?.thresholds || {};
    const mediumEnter = Number(thresholds.mediumEnter) || 0.68;
    const mediumExit = Number(thresholds.mediumExit) || 0.88;
    const highEnter = Number(thresholds.highEnter) || 0.38;
    const highExit = Number(thresholds.highExit) || 0.55;

    if (geometryLodCurrent === 'low') {
      return ratio <= mediumEnter ? 'medium' : 'low';
    }
    if (geometryLodCurrent === 'medium') {
      if (ratio <= highEnter) return 'high';
      if (ratio >= mediumExit) return 'low';
      return 'medium';
    }
    if (geometryLodCurrent === 'high') {
      return ratio >= highExit ? 'medium' : 'high';
    }
    return 'low';
  }

  function switchGeometryLod(targetId, { recovering = false } = {}) {
    if (!geometryLodManifest || geometryLodSwitch || geometryLodPaused) return;
    if (targetId === geometryLodCurrent || geometryLodFailed.has(targetId)) return;
    const prefetch = geometryLodPrefetchPromises.get(targetId);
    if (prefetch && !geometryLodPrefetched.has(targetId)) {
      if (geometryLodWaitingForPrefetch === targetId) return;
      geometryLodWaitingForPrefetch = targetId;
      showHintHTML('<strong>Model detayı:</strong> Arka plan indirmesi tamamlanıyor…', 3500);
      prefetch.finally(() => {
        if (geometryLodWaitingForPrefetch !== targetId) return;
        geometryLodWaitingForPrefetch = '';
        switchGeometryLod(targetId, { recovering });
      });
      return;
    }
    const targetTier = geometryLodTier(targetId);
    const targetSrc = geometryLodSrc(targetTier);
    if (!targetSrc) {
      geometryLodFailed.add(targetId);
      return;
    }

    const currentTier = geometryLodTier(geometryLodCurrent);
    geometryLodSwitch = {
      from: geometryLodCurrent,
      fromSrc: geometryLodSrc(currentTier),
      to: targetId,
      camera: captureCamera(),
      recovering,
    };
    showTierTransitionPoster();
    updateGeometryLodDataset(recovering ? 'recovering' : 'switching');
    if (!recovering) {
      const label = targetId === 'high' ? 'yüksek' : targetId === 'medium' ? 'orta' : 'hafif';
      showHintHTML(`<strong>Model detayı:</strong> ${label} kademe yükleniyor…`, 3500);
    }
    mv.setAttribute('src', targetSrc);
  }

  function finishGeometryLodSwitch() {
    if (!geometryLodSwitch) return false;
    const completed = geometryLodSwitch;
    geometryLodCurrent = completed.to;
    geometryLodSwitch = null;
    restoreCamera(completed.camera);
    updateGeometryLodDataset('ready');
    window.requestAnimationFrame(() => {
      restoreCamera(completed.camera);
      window.requestAnimationFrame(hideTierTransitionPoster);
    });
    if (completed.recovering) {
      showHintHTML('<strong>Bilgi:</strong> Ayrıntılı kademe açılamadı; önceki model korunuyor.', 4500);
    }
    scheduleGeometryLodScan();
    return true;
  }

  function scanGeometryLod() {
    geometryLodTimer = null;
    if (!geometryLodManifest || geometryLodPaused || geometryLodSwitch || !mv.loaded) return;
    try {
      const radius = mv.getCameraOrbit().radius;
      const ratio = geometryLodInitialRadius > 0 ? radius / geometryLodInitialRadius : 1;
      switchGeometryLod(desiredGeometryTier(ratio));
    } catch {
      // Kamera henüz hazır değilse bir sonraki değişikliği bekle.
    }
  }

  function scheduleGeometryLodScan() {
    if (!geometryLodManifest || geometryLodPaused) return;
    if (geometryLodTimer) window.clearTimeout(geometryLodTimer);
    geometryLodTimer = window.setTimeout(scanGeometryLod, 320);
  }

  async function initializeGeometryLod() {
    if (!geometryLodUrl) {
      updateGeometryLodDataset('disabled');
      return;
    }
    if (geometryLodManifest) {
      scheduleGeometryLodScan();
      return;
    }

    updateGeometryLodDataset('loading');
    try {
      const response = await fetch(geometryLodUrl, { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const manifest = await response.json();
      const ids = Array.isArray(manifest?.tiers) ? manifest.tiers.map(tier => tier?.id) : [];
      if (manifest?.version !== 1 || ids.join(',') !== 'low,medium,high') {
        throw new Error('Geçersiz geometri LOD manifesti');
      }
      geometryLodManifest = manifest;
      if (manifest.tiers.some(tier => !geometryLodSrc(tier))) {
        throw new Error('Geçersiz geometri LOD yolu');
      }
      geometryLodCurrent = 'low';
      geometryLodInitialRadius = mv.getCameraOrbit().radius;
      updateGeometryLodDataset('ready');
      scheduleGeometryLodScan();
      scheduleGeometryLodPrefetch();
    } catch (error) {
      geometryLodManifest = null;
      updateGeometryLodDataset('error');
      console.warn('Geometri LOD manifesti yüklenemedi:', error);
    }
  }

  mv.addEventListener('camera-change', scheduleGeometryLodScan);

  mv.addEventListener('load', () => {
    stopElapsedTimer();
    hide(loader);
    hide(errorWrap);
    scheduleArRefresh();
    finishGeometryLodSwitch();
    void initializeGeometryLod();
    if (debugEnabled) {
      try {
        const modelObj = mv.model;
        const mats = modelObj && Array.isArray(modelObj.materials) ? modelObj.materials : [];
        const sample = mats.slice(0, 8).map((m) => {
          const out = { name: m && m.name ? String(m.name) : '' };
          try {
            const pbr = m && m.pbrMetallicRoughness;
            const bc = pbr && pbr.baseColorTexture;
            out.hasBaseColorTexture = Boolean(bc);
            if (bc) {
              const keys = Object.getOwnPropertyNames(bc);
              out.baseColorTextureProps = keys.slice(0, 12);
              // Try common locations for underlying image information.
              const tex = bc.texture || bc;
              const img = tex?.source?.data || tex?.source?.element || tex?.image || null;
              out.imageType = img ? Object.prototype.toString.call(img) : null;
              const src = tex?.source?.uri || tex?.source?.element?.src || tex?.image?.src || null;
              out.imageSrc = src;
            }
          } catch (e) {
            out.error = String(e);
          }
          return out;
        });

        renderDebug({
          debug: debugEnabled,
          src: mv.getAttribute('src') || primarySrcUrl,
          loaded: mv.loaded ?? null,
          modelIsVisible: mv.modelIsVisible ?? null,
          materials: {
            count: mats.length,
            sample,
          },
          webgl: getWebGLInfo(),
        });
      } catch (e) {
        renderDebug({
          debug: debugEnabled,
          src: mv.getAttribute('src') || primarySrcUrl,
          loadError: String(e),
          webgl: getWebGLInfo(),
        });
      }
    }
  });

  mv.addEventListener('error', (e) => {
    if (loadCancelled) return;
    stopElapsedTimer();
    if (debugEnabled) {
      let detail = '';
      try {
        detail = e && e.detail ? JSON.stringify(e.detail, null, 2) : '';
      } catch {
        detail = String(e && e.detail ? e.detail : e);
      }
      renderDebug({
        debug: debugEnabled,
        src: mv.getAttribute('src') || primarySrcUrl,
        error: detail || String(e),
        webgl: getWebGLInfo(),
      });
    }

    if (geometryLodSwitch) {
      const failedSwitch = geometryLodSwitch;
      geometryLodFailed.add(failedSwitch.to);
      geometryLodSwitch = null;
      if (!failedSwitch.recovering && failedSwitch.fromSrc) {
        geometryLodCurrent = failedSwitch.to;
        geometryLodSwitch = {
          from: failedSwitch.to,
          fromSrc: '',
          to: failedSwitch.from,
          camera: failedSwitch.camera,
          recovering: true,
        };
        updateGeometryLodDataset('recovering');
        mv.setAttribute('src', failedSwitch.fromSrc);
        return;
      }
      hideTierTransitionPoster();
      geometryLodManifest = null;
      updateGeometryLodDataset('error');
    }

    if (fallbackSrcUrl && !triedFallback) {
      triedFallback = true;
      resetProgress();
      show(loader);
      hide(errorWrap);
      showHintHTML('<strong>Bilgi:</strong> Optimize sürüm yüklenemedi, standart sürüm deneniyor…', 4000);
      activeSizeBytes = Number.isFinite(fallbackSizeBytes) && fallbackSizeBytes > 0
        ? fallbackSizeBytes
        : 0;
      loadStartedAt = Date.now();
      updateLoadMeta();
      elapsedTimer = window.setInterval(updateLoadMeta, 1000);
      mv.setAttribute('src', fallbackSrcUrl);
      return;
    }

    qs('#error').textContent = 'Model indirilemedi veya cihazınız modeli işleyemedi. Bağlantınızı kontrol edip yeniden deneyebilir ya da galeriye dönebilirsiniz.';
    show(errorWrap);
    hide(loader);
    console.error('Model-Viewer error', e);
  });

  // Kontroller
  const toggleRotateBtn = qs('#toggleRotate');
  const resetCamBtn = qs('#resetCam');
  const zoomInBtn = qs('#zoomIn');
  const zoomOutBtn = qs('#zoomOut');
  const fullBtn = qs('#fullscreen');
  const shareBtn = qs('#share');
  const helpBtn = qs('#help');
  const arEnterBtn = qs('#arEnter');

  let initialOrbit = orbit;

  // İkonu silmeden yalnızca metin etiketini güncelle
  function setLabel(btn, text) {
    if (!btn) return;
    const span = btn.querySelector('.ctrl-label');
    if (span) span.textContent = text;
    else btn.textContent = text;
  }

  function updateRotateUI() {
    const on = mv.hasAttribute('auto-rotate');
    toggleRotateBtn.classList.toggle('is-active', on);
    toggleRotateBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    toggleRotateBtn.setAttribute(
      'aria-label',
      on ? 'Otomatik döndürmeyi durdur' : 'Otomatik döndürmeyi başlat'
    );
    toggleRotateBtn.setAttribute(
      'data-tip',
      on ? 'Otomatik döndürme açık — durdurmak için tıklayın'
         : 'Otomatik döndürme kapalı — başlatmak için tıklayın'
    );
  }

  toggleRotateBtn.addEventListener('click', () => {
    const on = mv.hasAttribute('auto-rotate');
    if (on) mv.removeAttribute('auto-rotate');
    else mv.setAttribute('auto-rotate', '');
    updateRotateUI();
  });

  resetCamBtn.addEventListener('click', () => {
    mv.setAttribute('camera-orbit', initialOrbit);
    if (typeof mv.jumpCameraToGoal === 'function') mv.jumpCameraToGoal();
  });

  // Yakınlaştır / uzaklaştır: kamera yörüngesinin yarıçapını değiştir
  function zoom(factor) {
    if (typeof mv.getCameraOrbit !== 'function') return;
    try {
      const o = mv.getCameraOrbit();
      const radius = Math.max(0.05, o.radius * factor);
      mv.cameraOrbit = `${o.theta}rad ${o.phi}rad ${radius}m`;
      if (typeof mv.jumpCameraToGoal === 'function') mv.jumpCameraToGoal();
    } catch { /* yok say */ }
  }
  zoomInBtn.addEventListener('click', () => zoom(0.8));
  zoomOutBtn.addEventListener('click', () => zoom(1.25));

  function updateFullscreenUI() {
    const on = Boolean(document.fullscreenElement);
    setLabel(fullBtn, on ? 'Çık' : 'Tam Ekran');
    fullBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    fullBtn.setAttribute(
      'data-tip',
      on ? 'Tam ekrandan çıkar (F)' : 'Görüntüleyiciyi tam ekran açar (F)'
    );
  }

  document.addEventListener('fullscreenchange', updateFullscreenUI);

  fullBtn.addEventListener('click', async () => {
    const el = qs('.stage');
    if (!document.fullscreenElement) await el.requestFullscreen().catch(()=>{});
    else await document.exitFullscreen().catch(()=>{});
  });

  shareBtn.addEventListener('click', async () => {
    const url = location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (err) {
        // Kullanıcı iptal ettiyse (AbortError) başka fallback yapma.
        if (err && err.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setLabel(shareBtn, 'Kopyalandı ✓');
      setTimeout(() => setLabel(shareBtn, 'Paylaş'), 1500);
    } catch {
      // Clipboard API yoksa/izin yoksa: prompt ile fallback
      window.prompt('Bağlantıyı kopyalayın:', url);
    }
  });

  function toggleHelp(force) {
    const shouldOpen = typeof force === 'boolean'
      ? force
      : helpBtn.getAttribute('aria-expanded') !== 'true';
    helpBtn.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    helpBtn.setAttribute('aria-label', shouldOpen ? 'Yardımı kapat' : 'Yardımı aç');
    helpBtn.classList.toggle('is-active', shouldOpen);
    persistentHintHTML = shouldOpen
      ? '<strong>Fare/Dokunmatik:</strong> Döndürmek için sürükleyin; yakınlaştırmak için kaydırın veya iki parmak kullanın.<br>' +
        '<strong>Kısayollar:</strong> F = Tam ekran · R = Sıfırla · + / − = Yakınlaştır/uzaklaştır · ? = Yardımı aç/kapat'
      : '';
    if (persistentHintHTML) {
      showHintHTML(persistentHintHTML);
    } else {
      hide(hint);
    }
  }

  helpBtn.addEventListener('click', () => toggleHelp());

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target && e.target.isContentEditable)) return;

    if (e.key === 'f' || e.key === 'F') {
      fullBtn.click();
    } else if (e.key === 'r' || e.key === 'R') {
      resetCamBtn.click();
    } else if (e.key === '+' || e.key === '=') {
      zoom(0.8);
    } else if (e.key === '-' || e.key === '_') {
      zoom(1.25);
    } else if (e.key === '?') {
      toggleHelp();
    } else if (e.key === 'Escape') {
      toggleHelp(false);
      const moreControls = qs('#moreControls');
      if (moreControls) moreControls.open = false;
    }
  });

  // ---- AR (Artırılmış Gerçeklik) ----
  function isMobileLike() {
    return /android|iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function arUnavailableMessage() {
    if (!mv.loaded) {
      return 'AR durumunu denetlemek için önce 3B modeli yükleyin.';
    }
    if (!isMobileLike()) {
      return 'AR yalnızca destekleyen <strong>telefon/tablette</strong> çalışır. Bu sayfayı Android (Chrome) ya da iOS (Safari) cihazda açın.';
    }
    if (!window.isSecureContext) {
      return 'Sayfa-içi AR için site <strong>HTTPS</strong> üzerinden açılmalıdır; şu an güvensiz (http) bağlantı kullanılıyor.';
    }
    return 'Cihazınızda AR bulunamadı. Android’de <strong>Google Play Hizmetleri (AR / ARCore)</strong> kurulu olmalı ve sayfa <strong>Chrome</strong> ile açılmalıdır (uygulama-içi tarayıcılarda çalışmaz).';
  }

  function refreshArButton() {
    if (!arEnterBtn) return;
    const canUseBabylon = Boolean(babylonAr?.canStart());
    const can = canUseBabylon || Boolean(mv.canActivateAR);
    const loaded = Boolean(mv.loaded);
    arEnterBtn.classList.toggle('is-disabled', !can);
    arEnterBtn.setAttribute('aria-disabled', can ? 'false' : 'true');
    setLabel(arEnterBtn, can || !loaded ? "AR'da Aç" : 'AR Bilgisi');
    arEnterBtn.setAttribute(
      'aria-label',
      can ? `${title} modelini artırılmış gerçeklikte aç`
          : loaded
            ? 'AR bu cihazda kullanılamıyor; nedenini öğren'
            : 'AR için önce 3B modeli yükleyin'
    );
    arEnterBtn.setAttribute(
      'data-tip',
      can ? 'Modeli telefon/tablet kameranızla gerçek ortamınıza yerleştirin'
          : 'Bu cihaz/tarayıcıda AR kullanılamıyor — nedenini görmek için dokunun'
    );
  }

    // canActivateAR, özellikle mobilde model yüklendikten sonra gecikmeli belirlenebilir.
  function scheduleArRefresh() {
    refreshArButton();
    let n = 0;
    const id = window.setInterval(() => {
      refreshArButton();
      if (++n >= 30 || mv.canActivateAR) window.clearInterval(id);
    }, 500);
  }

  mv.addEventListener('ar-status', (event) => {
    refreshArButton();
    const status = event.detail?.status;
    if (status === 'session-started') {
      setGeometryLodPaused(true);
      persistentHintHTML = '';
    } else if (status === 'object-placed') {
      showHintHTML('<strong>AR:</strong> Model yerleştirildi. İki parmakla boyutunu değiştirebilirsiniz.', 3500);
    } else if (status === 'not-presenting') {
      setGeometryLodPaused(false);
      scheduleGeometryLodScan();
    } else if (status === 'failed') {
      setGeometryLodPaused(false);
      showHintHTML('<strong>AR başlatılamadı:</strong> ' + arUnavailableMessage(), 8000);
    }
  });

  if (arEnterBtn) {
    arEnterBtn.addEventListener('click', async () => {
      if (babylonAr?.canStart()) {
        showHintHTML('<strong>AR:</strong> Düşük model hemen açılacak; orta ve yüksek kalite AR içinde arka planda hazırlanacak.', 5000);
        try {
          await babylonAr.start();
          return;
        } catch (error) {
          console.warn('Babylon WebXR başlatılamadı; model-viewer fallback deneniyor:', error);
          if (!mv.canActivateAR) {
            showHintHTML('<strong>AR başlatılamadı:</strong> ' + arUnavailableMessage(), 8000);
            return;
          }
        }
      }
      if (mv.canActivateAR) {
        showHintHTML('<strong>AR:</strong> Modeli yerleştirmek için kameranızı düz bir yüzeye doğrultun.', 5000);
        try {
          await mv.activateAR();
        } catch {
          showHintHTML('<strong>AR başlatılamadı:</strong> ' + arUnavailableMessage(), 8000);
        }
      } else {
        showHintHTML('<strong>AR kullanılamıyor:</strong> ' + arUnavailableMessage(), 8000);
      }
    });
  }

  window.addEventListener('oku-babylon-ar:support', refreshArButton);
  window.addEventListener('oku-babylon-ar:started', () => {
    setGeometryLodPaused(true);
    persistentHintHTML = '';
  });
  window.addEventListener('oku-babylon-ar:ended', () => {
    setGeometryLodPaused(false);
    scheduleGeometryLodScan();
  });

  const moreControls = qs('#moreControls');
  moreControls?.addEventListener('click', (event) => {
    if (event.target.closest('button') && !event.target.closest('summary')) {
      window.setTimeout(() => { moreControls.open = false; }, 0);
    }
  });

  updateRotateUI();
  updateFullscreenUI();
  scheduleArRefresh();

  // Galeriden model seçildiğinde ayrıca onay istemeden hafif başlangıç
  // kademesini (low.glb) yükle. Orta ve yüksek kademeler zooma ve cihaz
  // performansına göre arka planda devreye girer.
  const beginInitialLoad = () => {
    triedFallback = false;
    beginLoad(primarySrcUrl, sizeBytes);
  };
  if (window.customElements?.get('model-viewer')) {
    beginInitialLoad();
  } else if (window.customElements?.whenDefined) {
    window.customElements.whenDefined('model-viewer').then(beginInitialLoad);
  } else {
    beginInitialLoad();
  }
});
