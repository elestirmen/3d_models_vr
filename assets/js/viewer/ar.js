/* Artırılmış gerçeklik düğmesi.
   Sıra: Babylon WebXR (Android, AR içinde kademe yükseltme) → model-viewer
   (Scene Viewer / iPhone-iPad'de AR Quick Look) → nedenini açıklayan ipucu.
   Quick Look önceden üretilmiş, ARKit denetiminden geçmiş USDZ'yi açar
   (tools/build_usdz.mjs); dokunuşla eşzamanlı başlar, çünkü Safari AR
   bağlantısını yalnızca kullanıcı etkileşimi içinde açar.

   Babylon motoru yalnızca kullanıcı AR'a dokunduğunda indirilir. WebXR oturumu
   kullanıcı etkileşimi gerektirdiği için indirme uzun sürdüyse ikinci bir
   dokunuş istenir; kısa sürdüyse (etkileşim hâlâ geçerliyse) doğrudan başlar. */

import { t, fmt } from '../core/i18n.js?v=425bd5c155';

const ENGINE_BYTES = 1.9 * 1024 * 1024; // babylon.js + yükleyiciler, gzip

export function createAr({ mv, button, modelId, title, hint, track, lod, primarySrc, manifestUrl, quickLook = {} }) {
  const babylon = window.OKU_BABYLON_AR || null;
  const label = button?.querySelector('.tool__label');
  let preparing = false;
  let reported = false;
  let lastStatus = '';
  const listeners = new Set();

  const apple = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const mobile = () => apple() || /android/i.test(navigator.userAgent);

  const available = () => Boolean(babylon?.isSupported?.()) || Boolean(mv.canActivateAR);

  function unavailableMessage() {
    if (!mv.loaded) return t('viewer.arNeedsModel');
    if (!mobile()) return t('viewer.arDesktop');
    if (!window.isSecureContext) return t('viewer.arInsecure');
    if (apple() && !quickLook.src) return t('viewer.arNoQuickLook');
    return t('viewer.arNotSupported');
  }

  function refresh() {
    if (!button) return;
    const can = available();
    if (mv.loaded && !reported) {
      reported = true;
      track('ar_available', { id: modelId, a: can ? 1 : 0, k: babylon?.isSupported?.() ? 'babylon' : 'model-viewer' });
    }
    button.classList.toggle('is-available', can);
    button.setAttribute('aria-label', can ? `${t('viewer.ar')}: ${t('viewer.arTip')}` : `${t('viewer.ar')}: ${unavailableMessage()}`);
    button.title = can ? t('viewer.arTip') : unavailableMessage();
    const status = statusText();
    if (status !== lastStatus) {
      lastStatus = status;
      for (const listener of listeners) listener(status);
    }
  }

  const statusText = () => (available() ? t('viewer.arAvailable') : unavailableMessage());

  // canActivateAR mobilde model yüklendikten sonra gecikmeli belirlenebilir.
  function scheduleRefresh() {
    refresh();
    let count = 0;
    const timer = window.setInterval(() => {
      refresh();
      count += 1;
      if (count >= 24 || mv.canActivateAR) window.clearInterval(timer);
    }, 500);
  }

  async function startModelViewer() {
    if (!mv.canActivateAR) {
      hint(unavailableMessage(), 8000);
      return;
    }
    const viaQuickLook = apple() && Boolean(quickLook.src);
    hint(viaQuickLook && quickLook.bytes
      ? t('viewer.arQuickLook', { size: fmt.bytes(quickLook.bytes) })
      : t('viewer.arStartHint'), viaQuickLook ? 8000 : 5000);
    if (viaQuickLook) track('ar_entered', { id: modelId, k: 'quick-look' });
    try {
      await mv.activateAR();
    } catch {
      hint(`${t('viewer.arStartFailed')} ${unavailableMessage()}`, 8000);
    }
  }

  async function activate() {
    if (babylon?.isSupported?.()) {
      if (!babylon.isReady()) {
        if (preparing) return;
        preparing = true;
        const clickedAt = performance.now();
        button.setAttribute('aria-busy', 'true');
        hint(t('viewer.arDownloading', { size: fmt.bytes(ENGINE_BYTES) }), 0);
        const ok = await babylon.prepare().catch(() => false);
        preparing = false;
        button.removeAttribute('aria-busy');
        if (!ok) {
          await startModelViewer();
          return;
        }
        // Etkileşim hâlâ geçerliyse doğrudan başlat; değilse ikinci dokunuş iste.
        const stillActive = navigator.userActivation ? navigator.userActivation.isActive : performance.now() - clickedAt < 3000;
        if (!stillActive) {
          hint(t('viewer.arReadyTap'), 6000);
          button.classList.add('is-ready');
          return;
        }
      }
      try {
        button.classList.remove('is-ready');
        await babylon.start();
        return;
      } catch (error) {
        console.warn('Babylon WebXR başlatılamadı; model-viewer deneniyor:', error);
      }
    }
    await startModelViewer();
  }

  button?.addEventListener('click', () => void activate());
  if (babylon) {
    void babylon.configure({ title, model: primarySrc, geometryLod: manifestUrl }).then(refresh);
  }
  window.addEventListener('oku-babylon-ar:support', refresh);
  window.addEventListener('oku-babylon-ar:started', () => {
    track('ar_entered', { id: modelId, k: 'babylon' });
    lod.setPaused(true);
    hint('', 1);
  });
  window.addEventListener('oku-babylon-ar:placed', () => track('ar_placed', { id: modelId, k: 'babylon' }));
  // Cihazda nerede takıldığı ölçümde görünsün (indirme / işleme / yükseltme).
  window.addEventListener('oku-babylon-ar:error', (event) => {
    track('ar_error', { id: modelId, k: 'babylon', s: event.detail?.stage || '', p: event.detail?.placed ? 1 : 0 });
  });
  window.addEventListener('oku-babylon-ar:ended', () => lod.setPaused(false));

  mv.addEventListener('ar-status', (event) => {
    refresh();
    const status = event.detail?.status;
    if (status === 'session-started') {
      track('ar_entered', { id: modelId, k: 'model-viewer' });
      lod.setPaused(true);
    } else if (status === 'object-placed') {
      track('ar_placed', { id: modelId, k: 'model-viewer' });
      hint(t('viewer.arPlaced'), 3500);
    } else if (status === 'not-presenting') {
      lod.setPaused(false);
    } else if (status === 'failed') {
      lod.setPaused(false);
      hint(`${t('viewer.arStartFailed')} ${unavailableMessage()}`, 8000);
    }
  });

  return {
    refresh,
    scheduleRefresh,
    statusText,
    /** AR durumu metni değişince çağrılır (bilgi paneli bölümü yenilenir). */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
