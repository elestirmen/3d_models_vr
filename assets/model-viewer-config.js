/* model-viewer çalışma zamanı yapılandırması.
   Bu dosya model-viewer betiğinden ÖNCE yüklenmelidir; ayarlar
   modül değerlendirilirken bir kez okunur.

   Tüm çözücüler yereldir. Varsayılanlar üçüncü taraf CDN'lere
   (gstatic / unpkg) gider; burada geçersiz kılınmazsa KTX2 dokular
   ve Meshopt geometri sıkıştırması dış istek üretir ve CSP 'self'
   ile engellenir. */

window.ModelViewerElement = window.ModelViewerElement || {};

(() => {
  const local = (path) => new URL(path, document.baseURI).toString();

  // KTX2/Basis ve Draco çözücüleri KLASÖR yolu bekler (sonda '/').
  const decoders = local('assets/vendor/model-viewer-4.3.1/decoders/');

  window.ModelViewerElement.ktx2TranscoderLocation = decoders;
  window.ModelViewerElement.dracoDecoderLocation = decoders;

  // Meshopt (EXT_meshopt_compression) çözücüsü tam dosya yolu bekler.
  window.ModelViewerElement.meshoptDecoderLocation =
    local('assets/vendor/meshoptimizer-0.18.1/meshopt_decoder.js');
})();

// Kademe değişiminde kullanılmayan ağır modeller GPU/RAM önbelleğinde tutulmasın.
window.ModelViewerElement.modelCacheSize = 1;
