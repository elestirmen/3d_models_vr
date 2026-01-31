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

  function posterDataUri(text) {
    const safeTitle = (text || '3D Model').toString().slice(0, 80);
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="#667eea"/><stop offset="1" stop-color="#764ba2"/>` +
      `</linearGradient></defs>` +
      `<rect width="1200" height="675" fill="url(#g)"/>` +
      `<text x="600" y="370" text-anchor="middle" font-size="44" font-weight="700" fill="#fff" ` +
      `font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial">${safeTitle}</text>` +
      `</svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  if (location.protocol === 'file:') {
    const errorWrap = qs('#errorWrap');
    qs('#error').textContent =
      "Bu sayfa 'file://' üzerinden çalıştırılamaz. Yerel sunucu ile açın: python3 -m http.server 8000 (sonra http://localhost:8000/).";
    show(errorWrap);
    hide(qs('#loader'));
    return;
  }

  const title = qsp('title', '3D Model');
  const model = qsp('model', '');
  const fallbackModel = qsp('fallback', '');
  const iosSrc = qsp('ios', '');
  const orbit = qsp('orbit', '55deg 75deg 2.5m');
  const exposure = qsp('exposure', '0.7');
  const poster = qsp('poster', '');
  const reveal = qsp('reveal', 'auto'); // auto | interaction | manual
  const arPlacement = qsp('arPlacement', 'floor'); // floor | wall | auto
  const arScale = qsp('arScale', 'auto');

  // Başlıkları doldur
  qs('#title').textContent = title;
  qs('#subtitle').textContent = 'Modeli incelemek için sürükleyin, yakınlaştırmak için kaydırın. (Kısayollar: F=Tam ekran, R=Sıfırla, ?=Yardım)';
  document.title = `${title} • 3D Model`;

  const loader = qs('#loader');
  const errorWrap = qs('#errorWrap');
  const hint = qs('#hint');

  // Model kontrolü
  if (!model) {
    qs('#error').textContent = 'Model yolu (model=...) belirtilmemiş.';
    show(errorWrap);
    hide(loader);
    return;
  }

  // Model-Viewer ayarla
  const mv = qs('#mv');
  mv.setAttribute('alt', `${title} 3D Model`);
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

  if (!isAllowedModelPath(model)) {
    qs('#error').textContent = 'Model yolu geçersiz veya izin verilen alanların dışında.';
    show(errorWrap);
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

  mv.setAttribute('src', primarySrcUrl);
  mv.setAttribute('camera-orbit', orbit);
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
  const allowedArPlacement = new Set(['floor', 'wall', 'auto']);
  if (arPlacement && allowedArPlacement.has(arPlacement)) mv.setAttribute('ar-placement', arPlacement);
  mv.setAttribute('environment-image', 'neutral');
  mv.setAttribute('shadow-intensity', '1');
  mv.setAttribute('camera-controls', '');
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

  // iOS uyarısı (ios-src yoksa)
  let stickyHintText = '';
  if (isIOS() && !safeIosSrc) {
    stickyHintText = 'iOS cihazlarda AR (Quick Look) için USDZ dosyası gerekir. Bu model için iOS-özel dosya bulunamadı.';
    hint.textContent = stickyHintText;
    show(hint);
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
      hintTimeoutId = window.setTimeout(() => {
        if (stickyHintText) {
          hint.textContent = stickyHintText;
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

  mv.addEventListener('progress', (ev) => {
    const p = Math.round((ev.detail?.totalProgress ?? 0) * 100);
    if (bar) bar.value = p;
    percent.textContent = `${p}%`;
  });

  mv.addEventListener('load', () => {
    hide(loader);
  });

  let triedFallback = false;
  mv.addEventListener('error', (e) => {
    if (fallbackSrcUrl && !triedFallback) {
      triedFallback = true;
      if (bar) bar.value = 0;
      percent.textContent = '0%';
      show(loader);
      hide(errorWrap);
      showHintHTML('<strong>Bilgi:</strong> Optimize sürüm yüklenemedi, standart sürüm deneniyor…', 4000);
      mv.setAttribute('src', fallbackSrcUrl);
      return;
    }

    qs('#error').textContent = 'Model yüklenirken hata oluştu. (İpucu: Repo Git LFS kullanıyorsa .bin/.glb dosyaları çekilmemiş olabilir. Sunucuda `git lfs pull` çalıştırın.)';
    show(errorWrap);
    hide(loader);
    console.error('Model-Viewer error', e);
  });

  // Kontroller
  const toggleRotateBtn = qs('#toggleRotate');
  const resetCamBtn = qs('#resetCam');
  const fullBtn = qs('#fullscreen');
  const shareBtn = qs('#share');
  const helpBtn = qs('#help');
  const arBtn = qs('#mv button[slot="ar-button"]');

  let initialOrbit = orbit;

  function updateRotateUI() {
    const on = mv.hasAttribute('auto-rotate');
    toggleRotateBtn.textContent = on ? 'Oto Döndür: Açık' : 'Oto Döndür: Kapalı';
    toggleRotateBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
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

  function updateFullscreenUI() {
    const on = Boolean(document.fullscreenElement);
    fullBtn.textContent = on ? 'Tam Ekrandan Çık' : 'Tam Ekran';
    fullBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
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
      shareBtn.textContent = 'Bağlantı kopyalandı';
      setTimeout(()=> shareBtn.textContent = 'Bağlantıyı Kopyala', 1500);
    } catch {
      // Clipboard API yoksa/izin yoksa: prompt ile fallback
      window.prompt('Bağlantıyı kopyalayın:', url);
    }
  });

  function showHelp() {
    showHintHTML(
      '<strong>Kontroller:</strong> Döndürmek için sürükle, yakınlaştırmak için kaydır.<br>' +
      '<strong>Kısayollar:</strong> F=Tam ekran, R=Sıfırla, ?=Yardım',
      7000
    );
  }

  helpBtn.addEventListener('click', showHelp);

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target && e.target.isContentEditable)) return;

    if (e.key === 'f' || e.key === 'F') {
      fullBtn.click();
    } else if (e.key === 'r' || e.key === 'R') {
      resetCamBtn.click();
    } else if (e.key === '?') {
      showHelp();
    }
  });

  if (arBtn) {
    arBtn.addEventListener('click', () => {
      showHintHTML('<strong>Kontroller:</strong> Döndürmek için sürükle, yakınlaştırmak için kaydır.', 5000);
    });
  }

  updateRotateUI();
  updateFullscreenUI();
});
