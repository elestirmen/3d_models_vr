/* Paylaşım penceresi: kadrajlı bağlantı, QR kodu, sistem paylaşımı ve
   önizlemeli (OG görselli) bina sayfası bağlantısı. QR, masaüstünde açılan
   modeli telefona — ve oradan AR'a — taşımanın en kısa yoludur. */

import { t } from '../core/i18n.js?v=425bd5c155';
import { pageUrl, toast } from '../core/site.js?v=18aec0c522';
import { qrSvg } from './qr.js?v=20795e2448';

export function createShare({ dialog, opener, mv, modelId, title, lod, track }) {
  const qrBox = dialog.querySelector('#shareQr');
  const input = dialog.querySelector('#shareUrl');
  const includeView = dialog.querySelector('#shareView');
  const copyButton = dialog.querySelector('#shareCopy');
  const nativeButton = dialog.querySelector('#shareNative');
  const pageButton = dialog.querySelector('#sharePage');
  let lastQr = '';

  function viewerUrl(withView) {
    const url = new URL(location.href);
    if (modelId) for (const key of [...url.searchParams.keys()]) if (key !== 'id') url.searchParams.delete(key);
    url.hash = '';
    if (withView) {
      try {
        const orbit = mv.getCameraOrbit();
        const target = mv.getCameraTarget();
        // Kısa adres: 4 anlamlı basamak yeterli, QR sürümünü küçük tutar.
        url.searchParams.set('orbit', `${orbit.theta.toFixed(4)}rad ${orbit.phi.toFixed(4)}rad ${orbit.radius.toFixed(3)}m`);
        url.searchParams.set('target', `${target.x.toFixed(3)}m ${target.y.toFixed(3)}m ${target.z.toFixed(3)}m`);
      } catch { /* Kamera hazır değilse yalnızca kimlik paylaşılır. */ }
      if (lod?.pinned) url.searchParams.set('quality', lod.pinned);
    }
    return url.toString();
  }

  const landingUrl = () => (modelId ? pageUrl(`${encodeURIComponent(modelId)}/`) : pageUrl(''));

  function refresh() {
    const url = viewerUrl(includeView.checked);
    input.value = url;
    if (url !== lastQr) {
      lastQr = url;
      qrBox.textContent = '';
      try {
        qrBox.append(qrSvg(url, { ecc: 'M' }));
      } catch {
        qrBox.hidden = true;
      }
    }
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast(t('viewer.shareCopied'), { iconName: 'check' });
      return true;
    } catch {
      input.focus();
      input.select();
      toast(t('viewer.shareCopyFailed'));
      return false;
    }
  }

  includeView.addEventListener('change', refresh);
  input.addEventListener('focus', () => input.select());
  copyButton.addEventListener('click', async () => {
    if (await copy(input.value)) {
      const label = copyButton.querySelector('span');
      label.textContent = t('common.copied');
      window.setTimeout(() => { label.textContent = t('common.copy'); }, 1800);
      track('share', { id: modelId, k: includeView.checked ? 'view' : 'link' });
    }
  });
  pageButton.addEventListener('click', async (event) => {
    event.preventDefault();
    if (await copy(landingUrl())) track('share', { id: modelId, k: 'page' });
  });
  pageButton.href = landingUrl();
  if (navigator.share) {
    nativeButton.hidden = false;
    nativeButton.addEventListener('click', async () => {
      try {
        await navigator.share({ title, url: input.value });
        track('share', { id: modelId, k: 'native' });
      } catch { /* İptal edildi */ }
    });
  }
  dialog.querySelector('[data-close]')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => opener?.focus({ preventScroll: true }));

  function open() {
    refresh();
    dialog.showModal();
    copyButton.focus({ preventScroll: true });
  }

  opener?.addEventListener('click', open);
  return { open, viewerUrl };
}
