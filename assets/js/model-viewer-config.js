/* model-viewer çalışma zamanı yapılandırması (klasik betik).
   model-viewer modülünden ÖNCE yüklenmelidir; ayarlar modül değerlendirilirken
   bir kez okunur. Bütün çözücüler yereldir: varsayılanlar üçüncü taraf
   CDN'lere (gstatic / unpkg) gider ve CSP 'self' ile engellenirdi.

   Yollar bu betiğin adresinden (assets/js/) türetilen site kökünden çözülür;
   böylece /en/ altındaki görüntüleyici de aynı dosyaları kullanır. */
window.ModelViewerElement = window.ModelViewerElement || {};

(() => {
  const root = new URL('../../', document.currentScript?.src || document.baseURI);
  const local = (path) => new URL(path, root).toString();

  // KTX2/Basis ve Draco çözücüleri KLASÖR yolu bekler (sonda '/').
  const decoders = local('assets/vendor/model-viewer-4.3.1/decoders/');
  window.ModelViewerElement.ktx2TranscoderLocation = decoders;
  window.ModelViewerElement.dracoDecoderLocation = decoders;

  // Meshopt (EXT_meshopt_compression) çözücüsü tam dosya yolu bekler.
  window.ModelViewerElement.meshoptDecoderLocation = local('assets/vendor/meshoptimizer-0.18.1/meshopt_decoder.js');

  // Kademe değişiminde kullanılmayan ağır modeller GPU/RAM önbelleğinde tutulmasın.
  window.ModelViewerElement.modelCacheSize = 1;
})();
