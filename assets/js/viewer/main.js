/* 3B görüntüleyici — giriş modülü.

   Adres `viewer.html?id=<model>` biçimindedir; ayrıntılar katalogdan
   (assets/js/catalog.js ← models.json) okunur. Daha önce paylaşılmış uzun
   parametreli adresler desteklenmeye devam eder. Sunum parametreleri
   (orbit, target, exposure, quality, tour…) katalogu geçici olarak ezer. */

import { CATALOG } from '../catalog.js?v=21de442a47';
import { t, fmt, localized } from '../core/i18n.js?v=425bd5c155';
import { $, initPage, siteUrl, pageUrl, store, session, track, prefersReducedMotion, toast } from '../core/site.js?v=18aec0c522';
import { createLod } from './lod.js?v=dbc70f23c3';
import { createOffline } from './offline.js?v=92a944689b';
import { createInfoPanel } from './info.js?v=9f625a7648';
import { createMeasure } from './measure.js?v=bb448ce0b0';
import { createShare } from './share.js?v=1b5c15ecdd';
import { createAr } from './ar.js?v=a52234d651';
import { createTour } from './tour.js?v=785705427c';
import { takeSnapshot } from './snapshot.js?v=f1dfeadebf';

initPage();

const params = new URL(location.href).searchParams;
const param = (key, fallback = '') => (params.get(key) ?? fallback).trim();
const mv = $('#mv');
const stage = $('#stage');
const loader = $('#loader');
const loadPrompt = $('#loadPrompt');
const errorWrap = $('#errorWrap');
const errorText = $('#error');
const hintEl = $('#hint');

/* ---------- İpucu baloncuğu ---------- */
let hintTimer = 0;
function hint(message, timeout = 4000) {
  window.clearTimeout(hintTimer);
  if (!message) {
    hintEl.hidden = true;
    return;
  }
  hintEl.textContent = message;
  hintEl.hidden = false;
  if (timeout > 0) hintTimer = window.setTimeout(() => { hintEl.hidden = true; }, timeout);
}

/** `retry`: indirme hatasında tekrar denenebilir; katalogda olmayan ya da
 *  geçersiz bir adreste denenecek bir şey yoktur, araç çubuğu da gizlenir. */
function showError(message, { retry = false } = {}) {
  errorText.textContent = message;
  errorWrap.hidden = false;
  loader.hidden = true;
  loadPrompt.hidden = true;
  $('#retryLoad').hidden = !retry;
  if (!retry) {
    document.querySelector('.dock').hidden = true;
    $('#qualityChip').hidden = true;
  }
}

/* ---------- "Geri" bağlantısı galerinin son durumuna döner ---------- */
try {
  const previous = session.get('oku-explore-url');
  const url = previous ? new URL(previous, location.href) : null;
  const homes = [new URL('./', siteUrl('')).pathname, new URL('en/', siteUrl('')).pathname];
  if (url && url.origin === location.origin && homes.some(home => url.pathname === home || url.pathname === `${home}index.html`)) {
    for (const link of document.querySelectorAll('[data-gallery-link]')) link.href = url.href;
  }
} catch { /* Geri tuşu depolama olmadan da çalışır. */ }

/* ---------- Model kaydı ---------- */
const models = Array.isArray(CATALOG?.models) ? CATALOG.models : [];
const modelId = param('id');
const entry = modelId ? models.find(item => String(item?.id) === modelId) || null : null;
const fromEntry = (key) => (entry && entry[key] != null ? String(entry[key]) : '');
const legacy = !modelId;

const title = String(localized(entry, 'officialName') || localized(entry, 'title') || param('title') || t('viewer.title'));
const shortTitle = String(localized(entry, 'label') || title);
const modelType = String(localized(entry, 'type') || param('type') || '');
const description = String(localized(entry, 'description') || param('description') || '');
const modelPath = fromEntry('model') || (legacy ? param('model') : '');
const fallbackPath = fromEntry('fallback') || (legacy ? param('fallback') : '');
const lodPath = fromEntry('geometryLod') || (legacy ? param('geomLod') : '');
const iosPath = fromEntry('ios') || (legacy ? param('ios') : '');
const posterPath = fromEntry('poster') || (legacy ? param('poster') : '');
const sizeBytes = Number(entry?.sizeBytes) || Number.parseInt(param('size', '0'), 10) || 0;
const fallbackSizeBytes = Number(entry?.fallbackSizeBytes) || Number.parseInt(param('fallbackSize', '0'), 10) || 0;

$('#title').textContent = shortTitle;
const zone = String(localized(entry, 'campusZone') || '');
$('#subtitle').textContent = [modelType && modelType !== shortTitle ? modelType : '', zone].filter(Boolean).join(' · ') || description;
$('#modelEyebrow').textContent = entry?.category ? t(`categories.${entry.category}`) : '';
$('#modelType').textContent = modelType;
document.title = `${shortTitle} • ${t('common.siteName')}`;
mv.setAttribute('alt', description ? `${title}: ${description}` : title);
const metaDescription = document.querySelector('meta[name="description"]');
if (metaDescription && description) metaDescription.content = `${title}: ${description}`;
if (modelId) {
  const landing = $('#landingLink');
  if (landing) landing.href = pageUrl(`${encodeURIComponent(modelId)}/`);
} else {
  $('#landingLink')?.remove();
}

/* ---------- Güvenlik: yalnızca katalogdaki klasör ve uzantılar ---------- */
const prefixes = (CATALOG?.allowedModelPrefixes || []).map(prefix => String(prefix).toLowerCase());
const isSafeRel = (path) => Boolean(path) && !/^(?:[a-z]+:|\/|\\)/i.test(path) && !path.includes('..') && !path.includes(':');
const allowed = (path, extensions) => {
  const clean = String(path || '').split('?')[0];
  const lower = clean.toLowerCase();
  return isSafeRel(clean) && prefixes.some(prefix => lower.startsWith(prefix)) && extensions.some(ext => lower.endsWith(ext));
};
const posterAllowed = (path) => {
  const clean = String(path || '').split('?')[0].toLowerCase();
  return isSafeRel(clean) && clean.startsWith('assets/') && /\.(svg|png|jpe?g|webp|avif)$/.test(clean);
};

if (location.protocol === 'file:') {
  showError(t('viewer.errorFile'));
} else if (!modelPath) {
  showError(modelId ? t('viewer.errorMissing') : t('viewer.errorNoModel'));
} else if (!allowed(modelPath, ['.gltf', '.glb'])) {
  showError(t('viewer.errorUnsafe'));
} else {
  boot();
}

function boot() {
  const primarySrc = siteUrl(modelPath);
  const fallbackSrc = fallbackPath && allowed(fallbackPath, ['.gltf', '.glb']) ? siteUrl(fallbackPath) : '';
  const manifestUrl = lodPath && allowed(lodPath, ['.json']) ? siteUrl(lodPath) : '';
  const posterUrl = posterPath && posterAllowed(posterPath) ? siteUrl(posterPath) : '';

  /* ---------- Kadraj ve sahne ayarları ----------
     Yüzde değer model-viewer'ın çerçeveleme mesafesine göredir: fotogrametri
     modellerinin geniş zemin plakası 'auto' kadrajında binayı küçük bırakıyor;
     %68 kırpmasız %74–88 doluluk veriyor. Dikey ekranda daha yakın kadraj. */
  const frameScale = (innerWidth / Math.max(1, innerHeight)) < 0.85 ? 0.82 : 1;
  const framePct = (base) => `${Math.round(base * frameScale)}%`;
  const sharedOrbit = param('orbit');
  const initialOrbit = (/^-?[\d.]+(?:rad|deg) -?[\d.]+(?:rad|deg) [\d.]+(?:m|%)$/.test(sharedOrbit) ? sharedOrbit : '')
    || fromEntry('orbit') || `55deg 65deg ${framePct(68)}`;
  const sharedTarget = param('target');
  const render = (entry && typeof entry.render === 'object' && entry.render) || {};
  const clamp = (value, min, max, fallback) => (Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback);
  const exposure = clamp(param('exposure') || render.exposure || entry?.exposure, 0, 2, 1);
  const environment = /^assets\/env\/[A-Za-z0-9._-]+\.hdr$/.test(String(render.environment || ''))
    ? siteUrl(render.environment)
    : ['neutral', 'legacy'].includes(render.environment) ? render.environment : siteUrl('assets/env/campus-studio.hdr');

  mv.setAttribute('exposure', String(exposure));
  mv.setAttribute('environment-image', environment);
  mv.setAttribute('shadow-intensity', String(clamp(render.shadowIntensity, 0, 1, 1)));
  mv.setAttribute('shadow-softness', String(clamp(render.shadowSoftness, 0, 1, 0.85)));
  mv.setAttribute('min-camera-orbit', 'auto auto 5%');
  mv.setAttribute('poster', posterUrl || '');
  if (['auto', 'interaction', 'manual'].includes(param('reveal'))) mv.setAttribute('reveal', param('reveal'));
  if (['auto', 'fixed'].includes(param('arScale'))) mv.setAttribute('ar-scale', param('arScale'));
  if (['floor', 'wall'].includes(param('arPlacement'))) mv.setAttribute('ar-placement', param('arPlacement'));
  // iPhone/iPad: önceden üretilmiş USDZ (tools/build_usdz.mjs). Yoksa Quick Look
  // kapatılır: model-viewer'ın telefonda anında USDZ üretimi KTX2 dokulu
  // modellerde çalışmıyor, düğme boşa "AR" vaat ederdi.
  const iosSrc = iosPath && allowed(iosPath, ['.usdz']) ? siteUrl(iosPath) : '';
  if (iosSrc) mv.setAttribute('ios-src', iosSrc);
  else mv.setAttribute('ar-modes', 'webxr scene-viewer');
  if (!prefersReducedMotion() && !param('edit')) mv.setAttribute('auto-rotate', '');
  mv.setAttribute('auto-rotate-delay', '4000');
  if (/^-?\d+(\.\d+)?m? -?\d+(\.\d+)?m? -?\d+(\.\d+)?m?$/.test(sharedTarget)) mv.setAttribute('camera-target', sharedTarget);

  // Sinematik açılış: model biraz uzaktan ve yandan başlar, kadraja süzülür.
  const cinematic = !sharedOrbit && !prefersReducedMotion();
  mv.setAttribute('camera-orbit', cinematic ? introOrbit(initialOrbit) : initialOrbit);

  function introOrbit(orbit) {
    const match = /^(-?[\d.]+)(deg|rad) (-?[\d.]+)(deg|rad) ([\d.]+)(m|%)$/.exec(orbit);
    if (!match) return orbit;
    const toDeg = (value, unit) => (unit === 'rad' ? (Number(value) * 180) / Math.PI : Number(value));
    const theta = toDeg(match[1], match[2]) - 38;
    const phi = Math.max(20, toDeg(match[3], match[4]) - 16);
    const radius = Number(match[5]) * 1.45;
    return `${theta}deg ${phi}deg ${radius}${match[6]}`;
  }

  // Sergi ekranı: denetimler gizlenir, tur döngüde oynar (tour.js).
  const kiosk = ['1', 'true', 'on'].includes(param('kiosk'));
  if (kiosk) {
    document.body.classList.add('is-kiosk');
    mv.removeAttribute('auto-rotate');
  }

  /* ---------- Kalite çipi ---------- */
  const chip = $('#qualityChip');
  const chipText = $('#qualityChipText');
  function updateChip(state) {
    const tiers = Array.isArray(entry?.tiers) ? entry.tiers : [];
    if (!lod.manifest && tiers.length < 2) {
      chip.hidden = true;
      return;
    }
    chip.hidden = false;
    chip.dataset.tier = lod.current;
    chip.dataset.state = state || 'ready';
    const tierName = t(`tiers.${lod.current}`);
    const switching = state === 'switching' || state === 'recovering';
    const connection = navigator.connection;
    const saving = connection?.saveData || ['slow-2g', '2g', '3g'].includes(connection?.effectiveType);
    chipText.textContent = switching
      ? t('viewer.qualitySwitching')
      : `${t('viewer.qualityLabel', { tier: tierName })}${lod.pinned ? ` · ${t('viewer.qualityPinned')}` : saving ? ` · ${t('viewer.qualitySaving')}` : ''}`;
    chip.setAttribute('aria-label', t('viewer.qualityAria', { tier: tierName }));
  }

  /* ---------- Kademe geçişi: son kare poster olarak tutulur ---------- */
  const transitionPoster = $('#tierTransitionPoster');
  const lod = createLod({
    mv,
    manifestUrl,
    pinned: param('quality'),
    onState: (state) => { updateChip(state); info?.refresh(); },
    onHint: (kind, tier) => {
      if (kind === 'waiting') hint(t('viewer.tierWaiting'), 3500);
      else if (kind === 'loading') hint(t('viewer.tierLoading', { tier: t(`tiers.${tier}`) }), 3500);
      else if (kind === 'recovered') hint(t('viewer.tierRecovered'), 4500);
    },
    onTier: (tier) => {
      track('tier_reached', { id: modelId || 'legacy', t: tier });
      measure?.clear();
    },
    onSwitchStart: () => {
      try {
        transitionPoster.src = mv.toDataURL('image/webp', 0.82);
        transitionPoster.hidden = false;
      } catch {
        transitionPoster.hidden = true;
      }
    },
    onSwitchDone: () => {
      transitionPoster.hidden = true;
      transitionPoster.removeAttribute('src');
    },
  });

  const offline = createOffline({
    lod,
    primarySrc,
    manifestUrl,
    posterUrl,
    environmentUrl: environment.startsWith('http') ? environment : '',
    totalBytes: (entry?.tiers || []).reduce((sum, tier) => sum + (Number(tier.bytes) || 0), 0) || sizeBytes,
  });

  const ar = createAr({
    mv, button: $('#arEnter'), modelId: modelId || 'legacy', title, hint, track, lod, primarySrc, manifestUrl,
    quickLook: { src: iosSrc, bytes: Number(entry?.iosSizeBytes) || 0 },
  });
  const info = createInfoPanel({ dialog: $('#infoPanel'), toggle: $('#infoToggle'), entry, modelId, lod, offline, ar, track });
  const measure = createMeasure({
    mv, button: $('#measure'), overlay: $('#measureOverlay'), line: $('#measureLine'), readout: $('#measureReadout'), entry, modelId, hint,
  });
  createShare({ dialog: $('#shareDialog'), opener: $('#shareOpen'), mv, modelId, title, lod, track });

  /* ---------- Kamera açıları ---------- */
  const presetsEl = $('#cameraPresets');
  const ORBITS = {
    perspective: () => initialOrbit,
    // Tepeden bakışta plaka en geniş izdüşümü verir; Plan uzak, Cephe yakın.
    facade: () => `0deg 82deg ${framePct(70)}`,
    aerial: () => `45deg 38deg ${framePct(72)}`,
    plan: () => `0deg 6deg ${framePct(88)}`,
  };
  const ORDER = ['perspective', 'facade', 'aerial', 'plan'];
  let activePreset = 'perspective';
  let presetUntil = 0;
  const defaultTarget = mv.getAttribute('camera-target') || 'auto auto auto';

  function markPreset(name) {
    activePreset = name || '';
    for (const button of presetsEl.querySelectorAll('.preset')) {
      const on = button.dataset.preset === activePreset;
      button.classList.toggle('is-active', on);
      button.setAttribute('aria-pressed', String(on));
    }
  }
  function applyPreset(name, { jump = false } = {}) {
    if (!ORBITS[name]) return;
    presetUntil = Date.now() + 1400;
    mv.setAttribute('camera-target', defaultTarget);
    mv.setAttribute('camera-orbit', ORBITS[name]());
    lod.retarget();
    if (jump) mv.jumpCameraToGoal?.();
    markPreset(name);
    tour.hideSpotCard?.();
  }
  presetsEl.addEventListener('click', (event) => {
    const button = event.target.closest('.preset');
    if (button) applyPreset(button.dataset.preset);
  });
  mv.addEventListener('camera-change', (event) => {
    if (event.detail?.source === 'user-interaction' && Date.now() > presetUntil && activePreset) markPreset('');
  });

  const tour = createTour({
    mv, entry, catalog: models, modelId: modelId || 'legacy', track, lod,
    presets: { apply: (name) => applyPreset(name) },
    onStateChange: (on) => stage.classList.toggle('is-touring', on),
  });
  stage.dataset.tour = tour.campus ? 'campus' : 'presets';

  /* ---------- Diğer araçlar ---------- */
  const moreMenu = $('#moreMenu');
  const moreToggle = $('#moreToggle');
  const popoverSupported = typeof moreMenu.togglePopover === 'function';
  if (!popoverSupported) {
    // Popover API'siz tarayıcılar: basit aç/kapat.
    moreMenu.removeAttribute('popover');
    moreMenu.hidden = true;
    moreToggle.removeAttribute('popovertarget');
    moreToggle.addEventListener('click', () => {
      moreMenu.hidden = !moreMenu.hidden;
      moreToggle.setAttribute('aria-expanded', String(!moreMenu.hidden));
    });
    document.addEventListener('click', (event) => {
      if (!moreMenu.hidden && !moreMenu.contains(event.target) && !moreToggle.contains(event.target)) {
        moreMenu.hidden = true;
        moreToggle.setAttribute('aria-expanded', 'false');
      }
    });
  } else {
    moreMenu.addEventListener('toggle', (event) => {
      moreToggle.setAttribute('aria-expanded', String(event.newState === 'open'));
      moreToggle.classList.toggle('is-active', event.newState === 'open');
    });
  }
  const closeMore = () => {
    if (popoverSupported) { try { moreMenu.hidePopover(); } catch { /* zaten kapalı */ } }
    else { moreMenu.hidden = true; moreToggle.setAttribute('aria-expanded', 'false'); }
  };
  moreMenu.addEventListener('click', (event) => {
    if (event.target.closest('button, a') && !event.target.closest('[data-theme-toggle]')) window.setTimeout(closeMore, 0);
  });

  const rotateButton = $('#toggleRotate');
  function updateRotate() {
    const on = mv.hasAttribute('auto-rotate');
    rotateButton.setAttribute('aria-pressed', String(on));
    rotateButton.classList.toggle('is-active', on);
  }
  rotateButton.addEventListener('click', () => {
    if (mv.hasAttribute('auto-rotate')) mv.removeAttribute('auto-rotate');
    else mv.setAttribute('auto-rotate', '');
    updateRotate();
  });
  $('#resetCam').addEventListener('click', () => applyPreset('perspective', { jump: true }));

  function zoom(factor) {
    try {
      const orbit = mv.getCameraOrbit();
      mv.cameraOrbit = `${orbit.theta}rad ${orbit.phi}rad ${Math.max(0.05, orbit.radius * factor)}m`;
      lod.retarget();
    } catch { /* kamera hazır değil */ }
  }
  $('#zoomIn').addEventListener('click', () => zoom(0.8));
  $('#zoomOut').addEventListener('click', () => zoom(1.25));

  const fullButton = $('#fullscreen');
  function updateFullscreen() {
    const on = Boolean(document.fullscreenElement);
    fullButton.setAttribute('aria-pressed', String(on));
    fullButton.querySelector('span').textContent = on ? t('viewer.fullscreenExit') : t('viewer.fullscreen');
  }
  document.addEventListener('fullscreenchange', updateFullscreen);
  fullButton.addEventListener('click', () => {
    // Belgenin tamamı: bilgi paneli, pencereler ve bildirimler #stage dışında
    // (kipsiz panel üst katmanda değildir; yalnızca sahne tam ekran olsaydı görünmezdi).
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  });
  if (!document.fullscreenEnabled) fullButton.hidden = true;

  const snapshotButton = $('#snapshot');
  snapshotButton.addEventListener('click', async () => {
    const label = snapshotButton.querySelector('span');
    label.textContent = t('viewer.snapshotPreparing');
    try {
      await takeSnapshot({ mv, title, modelId });
      track('snapshot', { id: modelId || 'legacy' });
      toast(t('viewer.snapshotDone'), { iconName: 'check' });
    } catch (error) {
      toast(error?.code === 'not-ready' ? t('viewer.snapshotNotReady') : t('viewer.snapshotFailed'));
    } finally {
      label.textContent = t('viewer.snapshot');
    }
  });

  chip.addEventListener('click', () => info.open());

  const help = $('#helpPanel');
  const helpButton = $('#helpButton');
  const toggleHelp = () => {
    if (help.open) help.close();
    else help.showModal();
  };
  helpButton.addEventListener('click', toggleHelp);
  help.querySelector('[data-close]').addEventListener('click', () => help.close());
  help.addEventListener('close', () => helpButton.focus({ preventScroll: true }));
  for (const dialog of [help, $('#shareDialog'), $('#infoPanel')]) {
    // Kipli pencerede arka plana tıklamak kapatır.
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog && dialog.matches(':modal')) dialog.close();
    });
  }

  /* ---------- Harita bağlantısı yalnızca konum varsa ---------- */
  const mapLink = $('#mapLink');
  if (modelId && entry?.map && Number.isFinite(Number(entry.map.x))) {
    mapLink.href = pageUrl(`map.html?focus=${encodeURIComponent(modelId)}`);
    mapLink.hidden = false;
  }

  /* ---------- Klavye ---------- */
  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    if (document.querySelector('dialog:modal')) return;
    const presetIndex = ['1', '2', '3', '4'].indexOf(event.key);
    if (presetIndex >= 0) applyPreset(ORDER[presetIndex]);
    else if (event.key === 'f' || event.key === 'F') fullButton.click();
    else if (event.key === 'r' || event.key === 'R') applyPreset('perspective', { jump: true });
    else if (event.key === '+' || event.key === '=') zoom(0.8);
    else if (event.key === '-' || event.key === '_' || event.key === '−') zoom(1.25);
    else if (event.key === '?') toggleHelp();
    else if (['i', 'I', 'İ', 'ı'].includes(event.key)) info.toggle();
    else if (event.key === 't' || event.key === 'T') tour.toggle();
    else if (event.key === 'm' || event.key === 'M') measure.toggle();
    else if (event.key === 'Escape') {
      closeMore();
      if (tour.active) tour.stop({ reset: false });
      tour.hideSpotCard();
    }
  });

  /* ---------- Yükleme ---------- */
  const bar = $('#bar');
  const percent = $('#percent');
  const arc = $('#progressArc');
  const meta = $('#loadMeta');
  let expected = sizeBytes;
  let progress = 0;
  let startedAt = 0;
  let firstStartedAt = 0;
  let metaTimer = 0;
  let cancelled = false;
  let triedFallback = false;
  let completed = false;

  function updateMeta() {
    if (!startedAt) return;
    const time = fmt.duration(Date.now() - startedAt);
    meta.textContent = expected
      ? t('viewer.loadingProgress', { done: fmt.bytes(expected * progress) || '0 B', total: fmt.bytes(expected), time })
      : t('viewer.loadingElapsed', { time });
  }
  function setProgress(value) {
    progress = Math.max(0, Math.min(1, value));
    const p = Math.round(progress * 100);
    bar.value = p;
    percent.textContent = `${p}%`;
    arc.setAttribute('stroke-dasharray', `${p} 100`);
    updateMeta();
  }

  function begin(src, size = sizeBytes) {
    firstStartedAt ||= Date.now();
    cancelled = false;
    expected = size || 0;
    startedAt = Date.now();
    setProgress(0);
    loadPrompt.hidden = true;
    errorWrap.hidden = true;
    loader.hidden = false;
    window.clearInterval(metaTimer);
    metaTimer = window.setInterval(updateMeta, 1000);
    mv.setAttribute('src', src);
  }

  function cancel() {
    cancelled = true;
    window.clearInterval(metaTimer);
    mv.removeAttribute('src');
    setProgress(0);
    loader.hidden = true;
    errorWrap.hidden = true;
    $('#modelSize').textContent = sizeBytes ? t('viewer.promptSize', { size: fmt.bytes(sizeBytes) }) : t('viewer.promptSizeUnknown');
    loadPrompt.hidden = false;
    $('#startLoad').focus();
  }

  $('#cancelLoad').addEventListener('click', cancel);
  $('#startLoad').addEventListener('click', () => { triedFallback = false; begin(primarySrc); });
  $('#retryLoad').addEventListener('click', () => {
    triedFallback = false;
    const url = new URL(primarySrc);
    url.searchParams.set('_retry', String(Date.now()));
    begin(url.href);
  });

  mv.addEventListener('progress', (event) => setProgress(event.detail?.totalProgress ?? 0));

  mv.addEventListener('load', () => {
    window.clearInterval(metaTimer);
    loader.hidden = true;
    errorWrap.hidden = true;
    if (lod.handleLoad()) return;
    if (!completed) {
      completed = true;
      if (entry?.id) store.set('oku-last-model', entry.id);
      track('load_complete', { id: modelId || 'legacy', ms: Date.now() - firstStartedAt, kb: expected ? Math.round(expected / 1024) : '' });
      presetsEl.hidden = false;
      if (cinematic) {
        // Kadraja süzülme: yavaş sönümleme yalnızca açılışta.
        mv.interpolationDecay = 130;
        window.requestAnimationFrame(() => mv.setAttribute('camera-orbit', initialOrbit));
        window.setTimeout(() => { if (!tour.active) mv.interpolationDecay = 50; }, 2600);
      }
      tour.renderSpots();
      renderHotspots();
      if (tour.campus) hint(t('viewer.campusHint'), 6500);
      ar.scheduleRefresh();
      // Kademe eşikleri hedef kadraja göre ölçülür; sinematik açılış bitmeden
      // alınan yarıçap (geçiş sırasında %145) eşikleri kaydırırdı.
      window.setTimeout(() => {
        void lod.init();
        tour.autoStart(kiosk ? 'loop' : param('tour'));
      }, cinematic ? 2700 : 0);
      return;
    }
    ar.scheduleRefresh();
    void lod.init();
  });

  mv.addEventListener('error', (event) => {
    if (cancelled) return;
    // model-viewer bağlam kaybını da `error` olarak bildirir (type: webglcontextlost).
    // Bu bir indirme hatası değildir: 70–127 MB'lık yedek modeli indirmek ya da
    // kademeyi "bozuk" saymak yanlış olur; kullanıcıya yenilemesi önerilir.
    const type = event.detail?.type;
    if (type && type !== 'loadfailure') {
      if (type === 'webglcontextlost') hint(t('viewer.contextLost'), 0);
      return;
    }
    window.clearInterval(metaTimer);
    if (lod.handleError()) return;
    if (fallbackSrc && !triedFallback) {
      triedFallback = true;
      hint(t('viewer.fallbackTrying'), 4000);
      begin(fallbackSrc, fallbackSizeBytes);
      return;
    }
    track('error', { id: modelId || 'legacy', k: 'model_load' });
    showError(t('viewer.errorLoad'), { retry: true });
    console.error('model-viewer yükleme hatası', event.detail || event);
  });

  /* ---------- Modele yazılmış hotspot'lar (models.json → hotspots) ---------- */
  function renderHotspots() {
    for (const node of mv.querySelectorAll('[data-hotspot]')) node.remove();
    const spots = Array.isArray(entry?.hotspots) ? entry.hotspots : [];
    for (const spot of spots) {
      const id = String(spot?.id || '').trim();
      const label = String(spot?.label || '').trim();
      const position = String(spot?.position || '').trim();
      if (!id || !label || position.split(/\s+/).length !== 3) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'hotspot';
      button.slot = `hotspot-${id}`;
      button.dataset.hotspot = id;
      button.dataset.position = position;
      if (spot.normal) button.dataset.normal = String(spot.normal);
      button.setAttribute('data-visibility-attribute', 'visible');
      const dot = document.createElement('span');
      dot.className = 'hotspot__dot';
      dot.setAttribute('aria-hidden', 'true');
      const text = document.createElement('span');
      text.className = 'hotspot__label';
      text.textContent = label;
      button.append(dot, text);
      if (spot.description) {
        button.title = String(spot.description);
        button.setAttribute('aria-label', `${label}: ${spot.description}`);
      }
      mv.append(button);
    }
  }

  // Yükleme yarıda bırakılırsa hangi aşamada terk edildiği ölçülür.
  window.addEventListener('pagehide', () => {
    if (completed || !firstStartedAt) return;
    track('load_abandoned', { id: modelId || 'legacy', p: Math.round(progress * 100), ms: Date.now() - firstStartedAt });
  });

  if (param('edit') === 'hotspot' || param('edit') === '1') {
    mv.removeAttribute('auto-rotate');
    import('./editor.js?v=396da82e95').then(({ setupHotspotEditor }) => setupHotspotEditor({ mv, stage, hint }));
  }

  updateRotate();
  updateFullscreen();
  ar.refresh();
  track('model_open', { id: modelId || 'legacy' });

  // Galeriden gelindiğinde onay istemeden hafif kademe yüklenir.
  const start = () => { triedFallback = false; begin(primarySrc); };
  if (customElements.get('model-viewer')) start();
  else customElements.whenDefined('model-viewer').then(start);
}
