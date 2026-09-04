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

  // ---- Model kimliği ve künye kataloğu ----
  // Galeri bağlantıları `?id=<id>` biçimindedir; ayrıntılar
  // assets/models.generated.js içindeki katalogdan okunur. Daha önce
  // paylaşılmış uzun parametreli adresler desteklenmeye devam eder.
  const modelId = qsp('id', '').trim();
  const catalog = Array.isArray(window.MODEL_GALLERY?.models)
    ? window.MODEL_GALLERY.models
    : [];
  const entry = modelId
    ? catalog.find((item) => item && String(item.id) === modelId) || null
    : null;

  // Adresler ve kimlik bilgileri katalogtan; sunum ayarları (kamera, pozlama)
  // URL ile geçici olarak ezilebilir.
  const fromEntry = (key) => (entry && entry[key] != null ? String(entry[key]) : '');
  const entryNumber = (key) => {
    const value = entry && entry[key] != null ? Number(entry[key]) : NaN;
    return Number.isFinite(value) ? value : NaN;
  };

  const title = fromEntry('title') || qsp('title', '3D Model');
  const model = fromEntry('model') || qsp('model', '');
  const fallbackModel = fromEntry('fallback') || qsp('fallback', '');
  const geometryLod = fromEntry('geometryLod') || qsp('geomLod', '');
  const iosSrc = fromEntry('ios') || qsp('ios', '');
  const poster = fromEntry('poster') || qsp('poster', '');
  // Yüzde değer, model-viewer'ın çerçeveleme mesafesine göredir: fotogrametri
  // modellerinde geniş zemin plakası yüzünden 'auto' binayı küçük bırakıyor.
  // Kadraj: yüzde değer model-viewer'ın çerçeveleme mesafesine göredir.
  // Fotogrametri modellerinde geniş zemin plakası 'auto' kadrajında binayı
  // kareye göre %47–56'ya düşürüyordu; %68 kırpma olmadan %74–88 doluluk
  // veriyor. Dikey ekranlarda çerçeveleme genişlikle sınırlı olduğu için
  // daha yakın bir değer kullanılır (plakanın kenarı hafifçe kırpılabilir).
  const frameScale = (window.innerWidth / Math.max(1, window.innerHeight)) < 0.85 ? 0.82 : 1;
  const framePct = (base) => `${Math.round(base * frameScale)}%`;
  const orbit = qsp('orbit', '') || fromEntry('orbit') || `55deg 65deg ${framePct(68)}`;

  // Render ayarları: models.json'daki `render` nesnesi > eski `exposure` alanı >
  // varsayılan. Ortam haritası tools/build_environment.py ile üretilir ve
  // posterlerde de aynısı kullanılır (poster ↔ sahne tutarlılığı).
  const renderSettings = (entry && typeof entry.render === 'object' && entry.render) || {};
  const DEFAULT_ENVIRONMENT = 'assets/env/campus-studio.hdr';
  const exposure = qsp('exposure', '')
    || (renderSettings.exposure != null ? String(renderSettings.exposure) : '')
    || fromEntry('exposure')
    || '1';
  const modelType = fromEntry('type') || qsp('type', '3B kampüs modeli');
  const description = fromEntry('description') || qsp('description', `${title} yapısını etkileşimli 3B model üzerinden inceleyin.`);
  const sizeBytes = Number.isFinite(entryNumber('sizeBytes'))
    ? entryNumber('sizeBytes')
    : Number.parseInt(qsp('size', '0'), 10);
  const fallbackSizeBytes = Number.isFinite(entryNumber('fallbackSizeBytes'))
    ? entryNumber('fallbackSizeBytes')
    : Number.parseInt(qsp('fallbackSize', '0'), 10);
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

  // ---- Kullanım ölçümü ----
  // Ayrıntılar assets/analytics.js içinde: çerezsiz, kimliksiz, aynı köken.
  const track = (event, params) => window.OKU_ANALYTICS?.send(event, params);
  let loadStartTimestamp = 0;
  let loadCompleted = false;

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
  const qualityChip = qs('#qualityChip');
  const qualityChipText = qs('#qualityChipText');
  const TIER_LABELS = { low: 'Hafif', medium: 'Orta', high: 'Yüksek' };
  renderDebug({
    debug: debugEnabled,
    url: location.href,
    userAgent: navigator.userAgent,
    title,
    modelId: modelId || '(eski parametreli adres)',
    catalogHit: Boolean(entry),
    modelParam: model,
    fallbackParam: fallbackModel || '',
    geometryLodParam: geometryLod || '',
    webgl: getWebGLInfo(),
  });

  // Model kontrolü
  if (!model) {
    qs('#error').textContent = modelId
      ? 'Bu bağlantıdaki model artık galeride yok. Galeriye dönüp güncel listeden seçebilirsiniz.'
      : 'Görüntülenecek model bilgisi eksik. Galeriye dönüp modeli yeniden seçin.';
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

  function isAllowedPosterPath(pathWithQuery) {
    // Poster adresleri içerik damgası (?v=...) taşıyabilir; doğrulama
    // yalnızca yol kısmına yapılır.
    const path = String(pathWithQuery || '').split('?')[0];
    const lower = path.toLowerCase();
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
  // Paylaşılan bağlantı kamera hedefini de taşıyabilir.
  const sharedTarget = qsp('target', '').trim();
  if (/^-?\d+(\.\d+)?m? -?\d+(\.\d+)?m? -?\d+(\.\d+)?m?$/.test(sharedTarget)) {
    mv.setAttribute('camera-target', sharedTarget);
  }
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
  function resolveEnvironment(value) {
    const requested = String(value || '').trim();
    if (requested === 'neutral' || requested === 'legacy') return requested;
    // Yalnızca depodaki ortam haritalarına izin verilir.
    if (/^assets\/env\/[A-Za-z0-9._-]+\.hdr$/.test(requested)) return toAbsoluteUrl(requested);
    return toAbsoluteUrl(DEFAULT_ENVIRONMENT);
  }

  mv.setAttribute('environment-image', resolveEnvironment(renderSettings.environment));
  mv.setAttribute('shadow-intensity', String(
    Number.isFinite(Number(renderSettings.shadowIntensity))
      ? Math.max(0, Math.min(1, Number(renderSettings.shadowIntensity)))
      : 1
  ));
  mv.setAttribute('shadow-softness', String(
    Number.isFinite(Number(renderSettings.shadowSoftness))
      ? Math.max(0, Math.min(1, Number(renderSettings.shadowSoftness)))
      : 0.85
  ));
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

  let hintTimeoutId = null;
  function showHintHTML(html, timeoutMs = 0) {
    if (hintTimeoutId) {
      window.clearTimeout(hintTimeoutId);
      hintTimeoutId = null;
    }
    hint.innerHTML = html;
    show(hint);
    if (timeoutMs > 0) {
      hintTimeoutId = window.setTimeout(() => hide(hint), timeoutMs);
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
    if (!loadStartTimestamp) loadStartTimestamp = Date.now();
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

  // Kullanıcı elle bir kademe seçtiğinde (veya paylaşılan bağlantı istediğinde)
  // otomatik zoom kararı devre dışı kalır.
  let geometryLodPinned = ['low', 'medium', 'high'].includes(qsp('quality', '').trim())
    ? qsp('quality', '').trim()
    : '';

  function updateGeometryLodDataset(state) {
    mv.dataset.geometryLod = state;
    mv.dataset.geometryLodTier = geometryLodCurrent;
    updateQualityChip(state);
  }

  function pinGeometryLod(tierId) {
    geometryLodPinned = tierId || '';
    if (geometryLodPinned) switchGeometryLod(geometryLodPinned);
    else scheduleGeometryLodScan();
    if (infoPanel?.open) renderInfoPanel();
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
      // Sorgu dizesi yok: tarayıcı betiği bayt bazında karşılaştırıp
      // kendisi günceller (nginx bu dosyayı no-cache ile servis eder).
      await navigator.serviceWorker.register('./geometry-lod-sw.js', { scope: './' });
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
    track('tier_reached', { id: modelId || 'legacy', t: completed.to });
    restoreCamera(completed.camera);
    updateGeometryLodDataset('ready');
    // Kademe değişince mesh yenilenir; ölçüm noktaları geçersizdir.
    clearMeasurement();
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
    if (geometryLodPinned) {
      switchGeometryLod(geometryLodPinned);
      return;
    }
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
    if (!loadCompleted) {
      loadCompleted = true;
      track('load_complete', {
        id: modelId || 'legacy',
        ms: loadStartTimestamp ? Date.now() - loadStartTimestamp : '',
        kb: Number.isFinite(activeSizeBytes) && activeSizeBytes > 0
          ? Math.round(activeSizeBytes / 1024)
          : '',
      });
    }
    scheduleArRefresh();
    if (cameraPresets) cameraPresets.hidden = false;
    renderHotspots();
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

    track('error', { id: modelId || 'legacy', k: 'model_load' });
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
    applyCameraPreset('perspective', { jump: true });
  });

  // ---- Kamera açısı presetleri ----
  // phi (ikinci değer) +Y ekseninden ölçülür: 0° tepeden, 90° göz hizası.
  const cameraPresets = qs('#cameraPresets');
  const PRESET_ORBITS = {
    perspective: () => initialOrbit,
    // Tepeden bakışta plaka en geniş izdüşümü verir; bu yüzden Plan daha
    // uzak, Cephe daha yakın çerçevelenir.
    facade: () => `0deg 82deg ${framePct(70)}`,
    aerial: () => `45deg 38deg ${framePct(72)}`,
    plan: () => `0deg 6deg ${framePct(88)}`,
  };
  const PRESET_ORDER = ['perspective', 'facade', 'aerial', 'plan'];
  let activePreset = 'perspective';
  let presetApplyingUntil = 0;

  function markActivePreset(name) {
    activePreset = name || '';
    if (!cameraPresets) return;
    for (const button of cameraPresets.querySelectorAll('.preset')) {
      const isActive = button.dataset.preset === activePreset;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    }
  }

  function applyCameraPreset(name, { jump = false } = {}) {
    const resolve = PRESET_ORBITS[name];
    if (!resolve) return;
    // Kendi tetiklediğimiz kamera değişimi "kullanıcı müdahalesi" sayılmasın.
    presetApplyingUntil = Date.now() + 900;
    mv.setAttribute('camera-orbit', resolve());
    if (jump && typeof mv.jumpCameraToGoal === 'function') mv.jumpCameraToGoal();
    markActivePreset(name);
  }

  cameraPresets?.addEventListener('click', (event) => {
    const button = event.target.closest('.preset');
    if (!button) return;
    applyCameraPreset(button.dataset.preset);
  });

  // Kullanıcı kamerayı elle oynattığında preset seçimi düşer.
  mv.addEventListener('camera-change', (event) => {
    if (event.detail?.source !== 'user-interaction') return;
    if (Date.now() < presetApplyingUntil) return;
    if (activePreset) markActivePreset('');
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

  // Paylaşım bağlantısı, o an bakılan kadrajı da taşır.
  function shareUrl() {
    const url = new URL(location.href);
    // Katalog tabanlı kısa adres korunur; üzerine yalnızca kadraj eklenir.
    if (modelId) {
      for (const key of [...url.searchParams.keys()]) {
        if (key !== 'id') url.searchParams.delete(key);
      }
    }
    try {
      url.searchParams.set('orbit', mv.getCameraOrbit().toString());
      url.searchParams.set('target', mv.getCameraTarget().toString());
    } catch {
      // Kamera henüz hazır değilse yalnızca kimlik paylaşılır.
    }
    if (geometryLodPinned) url.searchParams.set('quality', geometryLodPinned);
    return url.toString();
  }

  shareBtn.addEventListener('click', async () => {
    track('share', { id: modelId || 'legacy' });
    const url = shareUrl();
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
      showHintHTML('<strong>Paylaşım:</strong> Baktığınız kadraj bağlantıya eklendi.', 3000);
      setTimeout(() => setLabel(shareBtn, 'Paylaş'), 1600);
    } catch {
      // Clipboard API yoksa/izin yoksa: prompt ile fallback
      window.prompt('Bağlantıyı kopyalayın:', url);
    }
  });

  // ---- Hotspot'lar ----
  // Konumlar models.json'dan gelir; üretimi için ?edit=hotspot modu kullanılır.
  const hotspots = Array.isArray(entry?.hotspots) ? entry.hotspots : [];
  const editHotspots = ['1', 'true', 'hotspot', 'on'].includes(
    (qsp('edit', '') || '').toString().trim().toLowerCase()
  );

  function isVectorString(value, { allowUnits = false } = {}) {
    const parts = String(value || '').trim().split(/\s+/);
    if (parts.length !== 3) return false;
    return parts.every((part) => {
      const cleaned = allowUnits ? part.replace(/m$/, '') : part;
      return cleaned !== '' && Number.isFinite(Number(cleaned));
    });
  }

  function renderHotspots() {
    for (const node of mv.querySelectorAll('[data-hotspot]')) node.remove();
    for (const spot of hotspots) {
      const id = String(spot?.id || '').trim();
      const label = String(spot?.label || '').trim();
      const position = String(spot?.position || '').trim();
      if (!id || !label || !isVectorString(position, { allowUnits: true })) continue;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hotspot';
      button.dataset.hotspot = id;
      button.slot = `hotspot-${id}`;
      button.dataset.position = position;
      if (isVectorString(spot?.normal)) button.dataset.normal = String(spot.normal).trim();
      // Modelin arkasına düşen hotspot soluklaşsın (niteliği model-viewer yönetir).
      button.setAttribute('data-visibility-attribute', 'visible');

      const dot = document.createElement('span');
      dot.className = 'hotspot-dot';
      dot.setAttribute('aria-hidden', 'true');
      button.appendChild(dot);

      const text = document.createElement('span');
      text.className = 'hotspot-text';
      text.textContent = label;
      button.appendChild(text);

      const description = String(spot?.description || '').trim();
      button.setAttribute('aria-label', description ? `${label}: ${description}` : label);
      if (description) button.title = description;

      mv.appendChild(button);
    }
  }

  // ---- Hotspot yazma modu (?edit=hotspot) ----
  // Modele tıklayınca konum/normal okunur ve models.json'a yapıştırılabilecek
  // JSON üretilir: hotspot içeriği tahminle değil sahnede tıklanarak oluşur.
  function setupHotspotEditor() {
    const draft = [];
    const panel = document.createElement('div');
    panel.className = 'hotspot-editor';
    panel.innerHTML =
      '<div class="hotspot-editor-head">Hotspot yazma modu</div>' +
      '<p class="hotspot-editor-hint">Modelin üzerinde bir noktaya tıklayın ve etiketi yazın. ' +
      'Aşağıdaki JSON\'u <code>models.json</code> içindeki modelin <code>hotspots</code> alanına yapıştırın.</p>' +
      '<pre class="hotspot-editor-output" tabindex="0">[]</pre>' +
      '<div class="hotspot-editor-actions">' +
      '<button type="button" class="action action-primary" data-copy>JSON\'u kopyala</button>' +
      '<button type="button" class="action action-secondary" data-undo>Son noktayı sil</button>' +
      '</div>';
    document.querySelector('.stage')?.appendChild(panel);
    const output = panel.querySelector('.hotspot-editor-output');

    const slug = (text) => (text || '')
      .toLocaleLowerCase('tr-TR')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || `nokta-${draft.length + 1}`;

    const refresh = () => { output.textContent = JSON.stringify(draft, null, 2); };

    mv.addEventListener('click', (event) => {
      if (event.target !== mv) return;
      const hit = typeof mv.positionAndNormalFromPoint === 'function'
        ? mv.positionAndNormalFromPoint(event.clientX, event.clientY)
        : null;
      if (!hit) {
        showHintHTML('<strong>Hotspot:</strong> Model yüzeyi bulunamadı, biraz daha içeriye tıklayın.', 3000);
        return;
      }
      const label = window.prompt('Bu nokta için etiket:', '');
      if (!label) return;
      // Şema `position` için metre ekini kabul eder, `normal` için etmez;
      // ayrıca 17 haneli ondalık yerine 4 hane yeterlidir.
      const vector = (value, unit) => ['x', 'y', 'z']
        .map((axis) => `${Number(value[axis]).toFixed(4)}${unit}`)
        .join(' ');
      draft.push({
        id: slug(label),
        label,
        position: vector(hit.position, 'm'),
        normal: vector(hit.normal, ''),
      });
      refresh();
      showHintHTML(`<strong>Hotspot eklendi:</strong> ${draft.length} nokta`, 2000);
    });

    panel.querySelector('[data-undo]')?.addEventListener('click', () => {
      draft.pop();
      refresh();
    });
    panel.querySelector('[data-copy]')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(JSON.stringify(draft, null, 2));
        showHintHTML('<strong>Kopyalandı:</strong> JSON panoda.', 2000);
      } catch {
        output.focus();
        showHintHTML('<strong>Kopyalanamadı:</strong> JSON\'u elle seçip kopyalayın.', 4000);
      }
    });
    refresh();
  }

  // ---- Ekran görüntüsü ----
  // model-viewer'ın kendi karesi alınır, alt köşeye bina adı ve kurum künyesi
  // yazılır. İndirme aynı köken blob'u olduğu için CSP'ye takılmaz.
  const snapshotBtn = qs('#snapshot');

  async function downloadSnapshot() {
    if (!mv.loaded || typeof mv.toBlob !== 'function') {
      showHintHTML('<strong>Ekran görüntüsü:</strong> Model yüklendikten sonra alınabilir.', 3000);
      return;
    }
    setLabel(snapshotBtn, 'Hazırlanıyor…');
    try {
      const blob = await mv.toBlob({ mimeType: 'image/png', idealAspect: false });
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      context.drawImage(bitmap, 0, 0);

      const scale = canvas.width / 1600;
      const pad = Math.round(28 * scale);
      const titleSize = Math.max(14, Math.round(30 * scale));
      const noteSize = Math.max(11, Math.round(18 * scale));
      const noteText = 'OKÜ Dijital Yerleşke · vr.perinet.org';

      context.font = `700 ${titleSize}px "Inter", system-ui, sans-serif`;
      const titleWidth = context.measureText(title).width;
      context.font = `500 ${noteSize}px "Inter", system-ui, sans-serif`;
      const noteWidth = context.measureText(noteText).width;

      const boxWidth = Math.max(titleWidth, noteWidth) + pad * 2;
      const boxHeight = titleSize + noteSize + pad * 1.6;
      const boxX = pad;
      const boxY = canvas.height - boxHeight - pad;

      context.fillStyle = 'rgba(9, 9, 11, 0.62)';
      if (typeof context.roundRect === 'function') {
        context.beginPath();
        context.roundRect(boxX, boxY, boxWidth, boxHeight, Math.round(14 * scale));
        context.fill();
      } else {
        context.fillRect(boxX, boxY, boxWidth, boxHeight);
      }

      context.fillStyle = '#ffffff';
      context.font = `700 ${titleSize}px "Inter", system-ui, sans-serif`;
      context.fillText(title, boxX + pad, boxY + pad * 0.55 + titleSize);
      context.fillStyle = 'rgba(255, 255, 255, 0.75)';
      context.font = `500 ${noteSize}px "Inter", system-ui, sans-serif`;
      context.fillText(noteText, boxX + pad, boxY + pad * 0.55 + titleSize + noteSize * 1.35);

      const stamped = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const objectUrl = URL.createObjectURL(stamped || blob);
      const link = document.createElement('a');
      const slug = (modelId || title).toLocaleLowerCase('tr-TR').replace(/[^a-z0-9]+/g, '-');
      link.href = objectUrl;
      link.download = `oku-${slug}-${new Date().toISOString().slice(0, 10)}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
      track('snapshot', { id: modelId || 'legacy' });
      setLabel(snapshotBtn, 'İndirildi ✓');
    } catch (error) {
      console.error('Ekran görüntüsü alınamadı', error);
      showHintHTML('<strong>Ekran görüntüsü alınamadı.</strong> Sayfayı yenileyip yeniden deneyin.', 4000);
      setLabel(snapshotBtn, 'Görüntü');
      return;
    }
    window.setTimeout(() => setLabel(snapshotBtn, 'Görüntü'), 1800);
  }

  snapshotBtn?.addEventListener('click', () => void downloadSnapshot());

  // ---- Kalite çipi ----
  function updateQualityChip(state) {
    if (!qualityChip || !qualityChipText) return;
    const tiers = Array.isArray(entry?.tiers) ? entry.tiers : [];
    if (!geometryLodManifest && tiers.length < 2) {
      qualityChip.hidden = true;
      return;
    }
    qualityChip.hidden = false;
    qualityChip.dataset.tier = geometryLodCurrent;
    qualityChip.dataset.state = state || 'ready';
    const label = TIER_LABELS[geometryLodCurrent] || geometryLodCurrent;
    const switching = state === 'switching' || state === 'recovering';
    qualityChipText.textContent = switching
      ? 'Kalite değişiyor…'
      : `${label} kalite${geometryLodPinned ? ' · sabit' : ''}`;
    qualityChip.setAttribute(
      'aria-label',
      `Model kalitesi: ${label}${geometryLodPinned ? ' (sabitlendi)' : ''}. Künyeyi açmak için etkinleştirin.`
    );
  }

  // ---- Çevrimdışı kaydetme ----
  // Kademe dosyaları service worker'ın okuduğu önbelleğe yazılır; böylece
  // uçak modunda aynı adresler karşılanır.
  const OFFLINE_EXTRAS = ['viewer.html', DEFAULT_ENVIRONMENT];

  function offlineUrls() {
    const urls = [];
    const tiers = Array.isArray(geometryLodManifest?.tiers) ? geometryLodManifest.tiers : [];
    for (const tier of tiers) {
      const src = geometryLodSrc(tier);
      if (src) urls.push(src);
    }
    if (!urls.length) urls.push(primarySrcUrl);
    if (poster && isAllowedPosterPath(poster)) urls.push(toAbsoluteUrl(poster));
    for (const extra of OFFLINE_EXTRAS) urls.push(toAbsoluteUrl(extra));
    return [...new Set(urls)];
  }

  function offlineTotalBytes() {
    const tiers = Array.isArray(entry?.tiers) ? entry.tiers : [];
    const sum = tiers.reduce((total, tier) => total + (Number(tier.bytes) || 0), 0);
    return sum || (Number.isFinite(sizeBytes) ? sizeBytes : 0);
  }

  async function offlineState() {
    if (!window.caches) return 'unsupported';
    try {
      const cache = await window.caches.open(MODEL_LOD_CACHE);
      const checks = await Promise.all(
        offlineUrls().map((url) => cache.match(url, { ignoreVary: true }))
      );
      if (checks.every(Boolean)) return 'saved';
      return checks.some(Boolean) ? 'partial' : 'none';
    } catch {
      return 'unsupported';
    }
  }

  async function saveOffline(button) {
    if (!window.caches) return;
    const urls = offlineUrls();
    const cache = await window.caches.open(MODEL_LOD_CACHE);
    let done = 0;
    for (const url of urls) {
      button.textContent = `İndiriliyor… ${done}/${urls.length}`;
      try {
        const existing = await cache.match(url, { ignoreVary: true });
        if (!existing) {
          const response = await fetch(url, { credentials: 'same-origin' });
          if (response.ok) await cache.put(url, response.clone());
        }
      } catch (error) {
        console.warn('Çevrimdışı kaydedilemedi:', url, error);
      }
      done += 1;
    }
    track('offline_saved', { id: modelId || 'legacy', n: urls.length });
    // Kota aşıldıysa service worker en eski kademeleri atsın.
    navigator.serviceWorker?.controller?.postMessage({ type: 'enforce-budget' });
    if (infoPanel?.open) renderInfoPanel();
  }

  async function removeOffline() {
    if (!window.caches) return;
    const cache = await window.caches.open(MODEL_LOD_CACHE);
    await Promise.all(offlineUrls().map((url) => cache.delete(url, { ignoreVary: true })));
    if (infoPanel?.open) renderInfoPanel();
  }

  // ---- Bina bilgi paneli ----
  // İçerik yalnızca manifeste yazılmış (yani teyitli) alanlardan üretilir;
  // eksik alan uydurulmaz, ilgili bölüm hiç gösterilmez.
  const infoPanel = qs('#infoPanel');
  const infoPanelBody = qs('#infoPanelBody');
  const infoPanelTitle = qs('#infoPanelTitle');
  const infoToggle = qs('#infoToggle');

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null && text !== '') node.textContent = String(text);
    return node;
  }

  function infoSection(heading) {
    const section = el('section', 'info-section');
    section.appendChild(el('h3', null, heading));
    return section;
  }

  function definitionList(rows) {
    const dl = el('dl', 'info-dl');
    let added = 0;
    for (const [term, value] of rows) {
      if (value == null || value === '') continue;
      dl.appendChild(el('dt', null, term));
      dl.appendChild(el('dd', 'tabular', value));
      added += 1;
    }
    return added ? dl : null;
  }

  function formatInteger(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    return number.toLocaleString('tr-TR');
  }

  function formatTriangles(count) {
    const number = Number(count);
    if (!Number.isFinite(number) || number <= 0) return '';
    return formatInteger(Math.round(number));
  }

  function availabilityLabel(value) {
    if (value === true) return 'Var';
    if (value === false) return 'Yok';
    return '';
  }

  function formatIsoDate(value) {
    const text = String(value || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
    const [year, month, day] = text.split('-');
    return `${Number(day)}.${Number(month)}.${year}`;
  }

  function arStatusText() {
    if (Boolean(babylonAr?.canStart()) || Boolean(mv.canActivateAR)) {
      return 'Bu cihazda AR kullanılabilir.';
    }
    return arUnavailableMessage();
  }

  function renderInfoPanel() {
    if (!infoPanelBody) return;
    infoPanelBody.textContent = '';
    if (infoPanelTitle) infoPanelTitle.textContent = fromEntry('officialName') || title;

    // 1) Kimlik ve açıklama
    const intro = el('section', 'info-section info-intro');
    const chips = el('div', 'info-chips');
    const categoryLabel = fromEntry('categoryLabel');
    if (categoryLabel) chips.appendChild(el('span', 'info-chip', categoryLabel));
    if (modelType) chips.appendChild(el('span', 'info-chip info-chip-muted', modelType));
    const campusZone = fromEntry('campusZone');
    if (campusZone) chips.appendChild(el('span', 'info-chip info-chip-muted', campusZone));
    if (chips.childElementCount) intro.appendChild(chips);
    if (description) intro.appendChild(el('p', 'info-text', description));
    infoPanelBody.appendChild(intro);

    // 2) Bina bilgileri (yalnızca teyitli alanlar)
    const facts = (entry && entry.facts) || null;
    if (facts) {
      const section = infoSection('Bina bilgileri');
      const rows = definitionList([
        ['Kat sayısı', facts.floors != null ? formatInteger(facts.floors) : ''],
        ['Kapalı alan', facts.grossArea_m2 != null ? `${formatInteger(facts.grossArea_m2)} m²` : ''],
        ['Yapım yılı', facts.builtYear != null ? String(facts.builtYear) : ''],
        ['Kapasite', facts.capacity != null ? `${formatInteger(facts.capacity)} kişi` : ''],
      ]);
      if (rows) {
        section.appendChild(rows);
        infoPanelBody.appendChild(section);
      }
    }

    // 3) Birimler
    const units = Array.isArray(entry?.units) ? entry.units : [];
    if (units.length) {
      const section = infoSection('Birimler');
      const list = el('ul', 'info-list');
      for (const unit of units) {
        const name = String(unit?.name || '').trim();
        if (!name) continue;
        const item = el('li');
        const url = String(unit?.url || '');
        if (/^https?:\/\//.test(url)) {
          const link = el('a', 'info-link', name);
          link.href = url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          item.appendChild(link);
        } else {
          item.textContent = name;
        }
        list.appendChild(item);
      }
      if (list.childElementCount) {
        section.appendChild(list);
        infoPanelBody.appendChild(section);
      }
    }

    // 4) Erişilebilirlik
    const accessibility = (entry && entry.accessibility) || null;
    if (accessibility) {
      const section = infoSection('Erişilebilirlik');
      const rows = definitionList([
        ['Asansör', availabilityLabel(accessibility.elevator)],
        ['Rampa', availabilityLabel(accessibility.ramp)],
        ['Engelli WC', availabilityLabel(accessibility.accessibleWc)],
      ]);
      if (rows) section.appendChild(rows);
      if (accessibility.note) section.appendChild(el('p', 'info-text', accessibility.note));
      if (section.childElementCount > 1) infoPanelBody.appendChild(section);
    }

    // 5) Konum ve yol tarifi
    const geo = (entry && entry.geo) || null;
    const lat = Number(geo?.lat);
    const lng = Number(geo?.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const section = infoSection('Konum');
      section.appendChild(el('p', 'info-text tabular', `${lat.toFixed(5)}, ${lng.toFixed(5)}`));
      const link = el('a', 'info-action', 'Yol tarifi al');
      link.href = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      section.appendChild(link);
      infoPanelBody.appendChild(section);
    }

    // 6) Model künyesi — üçgen sayıları ve boyutlar üretim raporlarından gelir
    const tiers = Array.isArray(entry?.tiers) ? entry.tiers : [];
    const scan = (entry && entry.scan) || null;
    const section = infoSection('Model künyesi');
    if (tiers.length) {
      const table = el('table', 'info-table');
      const thead = el('thead');
      const headRow = el('tr');
      for (const heading of ['Kalite', 'Boyut', 'Üçgen']) headRow.appendChild(el('th', null, heading));
      thead.appendChild(headRow);
      table.appendChild(thead);
      const tbody = el('tbody');
      for (const tier of tiers) {
        const row = el('tr');
        const isActive = String(tier.id) === geometryLodCurrent;
        if (isActive) row.className = 'is-active';
        const name = el('th', null, tier.label || tier.id);
        name.scope = 'row';
        if (isActive) name.appendChild(el('span', 'info-active-mark', ' • etkin'));
        row.appendChild(name);
        row.appendChild(el('td', 'tabular', formatBytes(Number(tier.bytes)) || '—'));
        row.appendChild(el('td', 'tabular', formatTriangles(tier.triangles) || '—'));
        tbody.appendChild(row);
      }
      table.appendChild(tbody);
      section.appendChild(table);
    }
    // Kalite kademesi elle sabitlenebilir (otomatik zoom kararını devre dışı bırakır).
    if (tiers.length > 1 && geometryLodManifest) {
      const actions = el('div', 'info-actions');
      const highest = tiers[tiers.length - 1];
      if (geometryLodPinned) {
        const auto = el('button', 'info-action info-action-secondary', 'Otomatik kaliteye dön');
        auto.type = 'button';
        auto.addEventListener('click', () => pinGeometryLod(''));
        actions.appendChild(auto);
      } else if (highest && String(highest.id) !== geometryLodCurrent) {
        const label = `En yüksek kaliteyi yükle (${formatBytes(Number(highest.bytes)) || '?'})`;
        const load = el('button', 'info-action', label);
        load.type = 'button';
        load.addEventListener('click', () => pinGeometryLod(String(highest.id)));
        actions.appendChild(load);
      }
      if (actions.childElementCount) section.appendChild(actions);
    }

    const modelRows = definitionList([
      ['Biçim', 'glTF 2.0 · KTX2 doku · Meshopt geometri'],
      ['Tarama tarihi', scan?.date ? formatIsoDate(scan.date) : ''],
      ['Üretim yöntemi', scan?.method || ''],
      ['Kaynak', scan?.source || ''],
    ]);
    if (modelRows) section.appendChild(modelRows);
    infoPanelBody.appendChild(section);

    // 7) Çevrimdışı kullanım
    if (window.caches) {
      const offlineSection = infoSection('Çevrimdışı kullanım');
      const note = el('p', 'info-text', 'Durum denetleniyor…');
      const actions = el('div', 'info-actions');
      offlineSection.appendChild(note);
      offlineSection.appendChild(actions);
      infoPanelBody.appendChild(offlineSection);

      void offlineState().then((state) => {
        if (state === 'saved') {
          note.textContent = 'Bu bina cihazınıza kaydedildi; bağlantı olmadan da açılır.';
          const remove = el('button', 'info-action info-action-secondary', 'Kaydı sil');
          remove.type = 'button';
          remove.addEventListener('click', () => void removeOffline());
          actions.appendChild(remove);
          return;
        }
        note.textContent = state === 'partial'
          ? 'Bu binanın bir bölümü kayıtlı. Tümünü indirmek için sürdürün.'
          : 'Tüm kalite kademelerini cihazınıza indirip bağlantı olmadan açabilirsiniz.';
        const total = formatBytes(offlineTotalBytes());
        const save = el('button', 'info-action', total ? `Çevrimdışı kaydet (${total})` : 'Çevrimdışı kaydet');
        save.type = 'button';
        save.addEventListener('click', () => {
          save.disabled = true;
          void saveOffline(save);
        });
        actions.appendChild(save);
      });
    }

    // 8) AR durumu
    const arSection = infoSection('Artırılmış gerçeklik');
    arSection.appendChild(el('p', 'info-text', arStatusText()));
    infoPanelBody.appendChild(arSection);

    // 9) Eksik künye bilgisi dürüstçe bildirilir
    if (!facts && !units.length && !geo && !accessibility) {
      infoPanelBody.appendChild(
        el('p', 'info-note', 'Birim, kat, alan ve konum bilgileri bu bina için henüz eklenmedi.')
      );
    }
  }

  function setInfoPanelOpen(open) {
    if (!infoPanel) return;
    if (open) {
      renderInfoPanel();
      if (typeof infoPanel.showModal === 'function') infoPanel.showModal();
      else infoPanel.setAttribute('open', '');
    } else if (infoPanel.open) {
      infoPanel.close();
    }
    infoToggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  infoToggle?.addEventListener('click', () => setInfoPanelOpen(!infoPanel?.open));
  qualityChip?.addEventListener('click', () => setInfoPanelOpen(true));
  infoPanel?.addEventListener('close', () => {
    infoToggle?.setAttribute('aria-expanded', 'false');
  });

  // ---- Ölçüm aracı ----
  // İki yüzey noktası arasındaki doğrusal mesafe. Fotogrametri modelleri
  // ölçekli üretildiği için sonuç metre cinsindendir; tarama hatası nedeniyle
  // yaklaşık olduğu kullanıcıya açıkça söylenir.
  const measureBtn = qs('#measure');
  const measureOverlay = qs('#measureOverlay');
  const measureLine = qs('#measureLine');
  const measureReadout = qs('#measureReadout');
  let measureActive = false;
  let measurePoints = [];
  let measureFrame = 0;

  function clearMeasurement() {
    measurePoints = [];
    for (const node of mv.querySelectorAll('[data-measure]')) node.remove();
    measureOverlay?.classList.add('is-hidden');
    if (measureReadout) measureReadout.textContent = '';
  }

  // Fotogrametri çıktıları çoğunlukla ölçeksizdir: 1 model birimi kaç metre
  // olduğu bilinmeden metre cinsinden sonuç göstermek yanıltıcı olur. Ölçek
  // manifestten (scan.metersPerUnit) gelir; yoksa kullanıcı bir kez kalibre
  // edebilir ve değer bu tarayıcıda saklanır.
  const SCALE_KEY = `measure-scale:${modelId || 'legacy'}`;

  function storedScale() {
    try {
      const value = Number(localStorage.getItem(SCALE_KEY));
      return Number.isFinite(value) && value > 0 ? value : 0;
    } catch {
      return 0;
    }
  }

  function metersPerUnit() {
    const declared = Number(entry?.scan?.metersPerUnit);
    if (Number.isFinite(declared) && declared > 0) return declared;
    return storedScale();
  }

  function formatDistance(meters) {
    if (!Number.isFinite(meters)) return '';
    if (meters < 1) return `${(meters * 100).toFixed(0)} cm`;
    return `${meters.toFixed(meters < 10 ? 2 : 1)} m`;
  }

  function measuredUnits() {
    if (measurePoints.length < 2) return 0;
    const [p1, p2] = measurePoints;
    return Math.hypot(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z);
  }

  function calibrateScale() {
    const units = measuredUnits();
    if (!units) return;
    const answer = window.prompt(
      'Seçtiğiniz iki nokta arasındaki gerçek mesafe kaç metre?\n' +
      '(Bilinen bir uzunluk seçin: kapı genişliği, bir cephe, park yeri…)',
      ''
    );
    const meters = Number((answer || '').replace(',', '.'));
    if (!Number.isFinite(meters) || meters <= 0) return;
    const scale = meters / units;
    try {
      localStorage.setItem(SCALE_KEY, String(scale));
    } catch { /* localStorage kapalı olabilir */ }
    updateMeasurement();
    showHintHTML(
      '<strong>Ölçek kaydedildi.</strong> Kalıcı olması için ' +
      `models.json içindeki modele <code>"scan": { "metersPerUnit": ${scale.toPrecision(6)} }</code> ekleyin.`,
      12000
    );
  }

  function updateMeasurement() {
    if (!measureOverlay || !measureLine) return;
    if (measurePoints.length < 2) {
      measureOverlay.classList.add('is-hidden');
      if (measureReadout) {
        measureReadout.textContent = measurePoints.length === 1 ? 'İkinci noktayı seçin' : '';
      }
      return;
    }
    const first = mv.querySelector('[data-measure="0"]');
    const second = mv.querySelector('[data-measure="1"]');
    if (!first || !second) return;

    const stage = mv.getBoundingClientRect();
    const center = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2 - stage.left,
        y: rect.top + rect.height / 2 - stage.top,
      };
    };
    const a = center(first);
    const b = center(second);
    measureLine.setAttribute('x1', String(a.x));
    measureLine.setAttribute('y1', String(a.y));
    measureLine.setAttribute('x2', String(b.x));
    measureLine.setAttribute('y2', String(b.y));
    measureOverlay.classList.remove('is-hidden');

    const units = measuredUnits();
    const scale = metersPerUnit();
    if (measureReadout) {
      measureReadout.textContent = '';
      if (scale) {
        measureReadout.textContent =
          `≈ ${formatDistance(units * scale)} · tarama hatası ±%2`;
      } else {
        measureReadout.append(`${units.toFixed(3)} model birimi · ölçek tanımlı değil`);
        const calibrate = document.createElement('button');
        calibrate.type = 'button';
        calibrate.className = 'measure-calibrate';
        calibrate.textContent = 'Ölçeği kalibre et';
        calibrate.addEventListener('click', calibrateScale);
        measureReadout.append(calibrate);
      }
    }
  }

  function scheduleMeasureUpdate() {
    if (measureFrame) return;
    measureFrame = window.requestAnimationFrame(() => {
      measureFrame = 0;
      updateMeasurement();
    });
  }

  function addMeasurePoint(hit) {
    if (measurePoints.length >= 2) clearMeasurement();
    const index = measurePoints.length;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hotspot hotspot-measure';
    button.dataset.measure = String(index);
    button.slot = `hotspot-measure-${index}`;
    button.dataset.position = hit.position.toString();
    button.dataset.normal = hit.normal.toString();
    button.setAttribute('aria-label', `Ölçüm noktası ${index + 1}`);
    const dot = document.createElement('span');
    dot.className = 'hotspot-dot';
    dot.setAttribute('aria-hidden', 'true');
    button.appendChild(dot);
    mv.appendChild(button);

    measurePoints.push({
      x: Number(hit.position.x),
      y: Number(hit.position.y),
      z: Number(hit.position.z),
    });
    // Hotspot'un konumlanması bir kare sürebilir.
    scheduleMeasureUpdate();
    window.setTimeout(scheduleMeasureUpdate, 120);
  }

  function setMeasureActive(active) {
    measureActive = active;
    measureBtn?.classList.toggle('is-active', active);
    measureBtn?.setAttribute('aria-pressed', active ? 'true' : 'false');
    mv.classList.toggle('is-measuring', active);
    if (!active) {
      clearMeasurement();
      return;
    }
    showHintHTML(
      metersPerUnit()
        ? '<strong>Ölçüm:</strong> Model üzerinde iki noktaya tıklayın. ' +
          'Sonuç taramanın doğruluğuna bağlı olarak yaklaşıktır (±%2).'
        : '<strong>Ölçüm:</strong> İki noktaya tıklayın. Bu modelin gerçek ' +
          'ölçeği tanımlı olmadığı için sonuç model birimindedir; bilinen bir ' +
          'uzunlukla bir kez kalibre edebilirsiniz.',
      7000
    );
  }

  measureBtn?.addEventListener('click', () => setMeasureActive(!measureActive));

  mv.addEventListener('click', (event) => {
    if (!measureActive || event.target !== mv) return;
    const hit = typeof mv.positionAndNormalFromPoint === 'function'
      ? mv.positionAndNormalFromPoint(event.clientX, event.clientY)
      : null;
    if (!hit) {
      showHintHTML('<strong>Ölçüm:</strong> Model yüzeyi bulunamadı, biraz daha içeriye tıklayın.', 3000);
      return;
    }
    addMeasurePoint(hit);
  });

  mv.addEventListener('camera-change', scheduleMeasureUpdate);
  window.addEventListener('resize', scheduleMeasureUpdate);

  // ---- Yardım paneli (kalıcı dialog) ----
  const helpPanel = qs('#helpPanel');

  function setHelpOpen(open) {
    if (!helpPanel) return;
    if (open) {
      if (infoPanel?.open) infoPanel.close();
      if (typeof helpPanel.showModal === 'function') helpPanel.showModal();
      else helpPanel.setAttribute('open', '');
    } else if (helpPanel.open) {
      helpPanel.close();
    }
    helpBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    helpBtn.setAttribute('aria-label', open ? 'Yardımı kapat' : 'Yardımı aç');
    helpBtn.classList.toggle('is-active', open);
  }

  function toggleHelp(force) {
    const shouldOpen = typeof force === 'boolean' ? force : !helpPanel?.open;
    setHelpOpen(shouldOpen);
  }

  helpPanel?.addEventListener('close', () => setHelpOpen(false));
  helpBtn.setAttribute('aria-haspopup', 'dialog');
  helpBtn.addEventListener('click', () => toggleHelp());

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target && e.target.isContentEditable)) return;

    // 1–4: kamera açısı presetleri
    const presetIndex = ['1', '2', '3', '4'].indexOf(e.key);
    if (presetIndex >= 0) {
      applyCameraPreset(PRESET_ORDER[presetIndex]);
      return;
    }

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
    } else if (e.key === 'i' || e.key === 'I' || e.key === 'İ' || e.key === 'ı') {
      setInfoPanelOpen(!infoPanel?.open);
    } else if (e.key === 'Escape') {
      // Açık dialog'u tarayıcı kendisi kapatır; burada yalnızca menü kapanır.
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

  let arAvailabilityReported = false;

  function refreshArButton() {
    if (!arEnterBtn) return;
    const canUseBabylon = Boolean(babylonAr?.canStart());
    const can = canUseBabylon || Boolean(mv.canActivateAR);
    const loaded = Boolean(mv.loaded);
    if (loaded && !arAvailabilityReported) {
      arAvailabilityReported = true;
      track('ar_available', { id: modelId || 'legacy', a: can ? 1 : 0, k: canUseBabylon ? 'babylon' : 'model-viewer' });
    }
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
      track('ar_entered', { id: modelId || 'legacy', k: 'model-viewer' });
      setGeometryLodPaused(true);
    } else if (status === 'object-placed') {
      track('ar_placed', { id: modelId || 'legacy' });
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
    track('ar_entered', { id: modelId || 'legacy', k: 'babylon' });
    setGeometryLodPaused(true);
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
  track('model_open', { id: modelId || 'legacy' });
  if (editHotspots) {
    mv.removeAttribute('auto-rotate');
    setupHotspotEditor();
  }

  // Yükleme tamamlanmadan çıkıldıysa hangi aşamada terk edildiği ölçülür.
  window.addEventListener('pagehide', () => {
    if (loadCompleted || !loadStartTimestamp) return;
    const percent = Number.parseInt((qs('#percent')?.textContent || '0').replace('%', ''), 10);
    track('load_abandoned', {
      id: modelId || 'legacy',
      p: Number.isFinite(percent) ? percent : '',
      ms: Date.now() - loadStartTimestamp,
    });
  });

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
