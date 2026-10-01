/* Çevrimdışı kayıt: bir yapının bütün kademeleri ve görüntüleyicinin
   ihtiyaç duyduğu dosyalar (motor, çözücüler, ortam haritası) önbelleğe
   yazılır; service worker uçak modunda aynı adresleri karşılar.
   Kısmi kayıt asla "başarılı" gösterilmez: her dosya doğrulanır. */

import { siteUrl } from '../core/site.js?v=18aec0c522';
import { MODEL_CACHE } from './lod.js?v=2a12188b5f';

export const OFFLINE_ASSET_CACHE = 'oku-offline-assets-v1';
const DECODERS = ['basis_transcoder.js', 'basis_transcoder.wasm', 'draco_wasm_wrapper.js', 'draco_decoder.wasm'];

export function createOffline({ lod, primarySrc, manifestUrl, posterUrl, environmentUrl, totalBytes }) {
  function dependencies() {
    const urls = [...document.querySelectorAll('script[src], link[rel="stylesheet"], link[rel="modulepreload"], link[as="font"]')]
      .map(node => node.src || node.href);
    urls.push(location.href.split('?')[0].split('#')[0]);
    urls.push(siteUrl('assets/vendor/meshoptimizer-0.18.1/meshopt_decoder.js'));
    for (const file of DECODERS) urls.push(siteUrl(`assets/vendor/model-viewer-4.3.1/decoders/${file}`));
    if (environmentUrl) urls.push(environmentUrl);
    return [...new Set(urls)].filter(url => {
      try { return new URL(url).origin === location.origin; } catch { return false; }
    });
  }

  function modelUrls() {
    const urls = [];
    for (const tier of lod.manifest?.tiers || []) {
      const src = lod.tierSrc(tier);
      if (src) urls.push(src);
    }
    if (!urls.length) urls.push(primarySrc);
    if (manifestUrl) urls.push(manifestUrl);
    if (posterUrl) urls.push(posterUrl);
    return [...new Set(urls)];
  }

  async function state() {
    if (!('caches' in window)) return 'unsupported';
    if (manifestUrl && !lod.manifest) return 'none';
    try {
      const cache = await caches.open(MODEL_CACHE);
      const models = await Promise.all(modelUrls().map(url => cache.match(url, { ignoreVary: true })));
      const deps = await Promise.all(dependencies().map(url => caches.match(url, { ignoreVary: true })));
      if (models.every(Boolean) && deps.every(Boolean)) return 'saved';
      return models.some(Boolean) ? 'partial' : 'none';
    } catch {
      return 'unsupported';
    }
  }

  async function save(onProgress) {
    if (!await lod.ensureServiceWorker()) throw new Error('service worker hazır değil');
    if (manifestUrl && !lod.manifest) {
      await lod.init();
      if (!lod.manifest) throw new Error('kademe bilgisi yüklenemedi');
    }
    const modelCache = await caches.open(MODEL_CACHE);
    const sharedCache = await caches.open(OFFLINE_ASSET_CACHE);
    const files = [
      ...modelUrls().map(url => ({ url, cache: modelCache })),
      ...dependencies().map(url => ({ url, cache: sharedCache })),
    ];
    let done = 0;
    for (const { url, cache } of files) {
      onProgress?.(done, files.length);
      if (!await cache.match(url, { ignoreVary: true })) {
        const response = await fetch(url, { credentials: 'same-origin', headers: { 'X-Geometry-LOD-Prefetch': '1' } });
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
        await cache.put(url, response);
      }
      if (url.includes('.geometry-lod/') && url.endsWith('.glb')) {
        navigator.serviceWorker.controller?.postMessage({ type: 'touch-tier', url });
      }
      done += 1;
    }
    onProgress?.(done, files.length);
    if (await state() !== 'saved') throw new Error('bazı dosyalar doğrulanamadı');
    navigator.serviceWorker.controller?.postMessage({ type: 'enforce-budget' });
    return files.length;
  }

  async function remove() {
    if (!('caches' in window)) return;
    // Paylaşılan görüntüleyici dosyaları korunur: başka kayıtlı yapılar da kullanır.
    const cache = await caches.open(MODEL_CACHE);
    await Promise.all(modelUrls().map(url => cache.delete(url, { ignoreVary: true })));
  }

  return { state, save, remove, totalBytes };
}
