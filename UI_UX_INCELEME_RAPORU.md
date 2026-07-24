# VR Dijital Yerleşke — UI/UX İnceleme Raporu

**Tarih:** 23 Temmuz 2026  
**Proje klasörü:** `/opt/vr`  
**Canlı adres:** [https://vr.perinet.org/](https://vr.perinet.org/)  
**Durum:** Yalnızca inceleme ve öneri; bu rapordaki düzeltmeler henüz uygulanmadı.

## 1. Yönetici özeti

Projenin görsel temeli temiz, kod yapısı anlaşılır ve erişilebilirlik için ARIA etiketleri, klavye kısayolları, odak stilleri ve `prefers-reduced-motion` gibi önlemler düşünülmüş.

Bununla birlikte kullanıcı deneyimini en fazla sınırlayan konu arayüzün görünümünden çok 3B modellerin indirme ve işleme maliyetidir. Manifestteki on modelin toplam aktarım boyutu yaklaşık **902,30 MB** ve tekil modeller **24,46 MB ile 189,94 MB** arasında değişmektedir. Mobil cihazlarda bu boyutlar uzun beklemeye, yüksek veri kullanımına ve bellek yetersizliğine neden olabilir.

En yüksek etkili geliştirme alanları:

1. Modellerin ve dokuların küçültülmesi.
2. Büyük model indirmesinin kullanıcı onayıyla başlatılması.
3. Yükleme ve hata ekranlarına geri dönüş/kurtarma seçenekleri eklenmesi.
4. Gerçek bina önizlemeleri ve daha güçlü kampüs kimliği kullanılması.
5. AR durumu ile mobil kontrollerin daha doğru ve sade sunulması.
6. Canlı sunucuda cache ve doğru MIME türlerinin yapılandırılması.

## 2. Klasör ve yayın durumu

Gerçek proje klasörü `/opt/nginx-html` konumundan `/opt/vr` konumuna taşındı.

Canlı `personal-web` container yapılandırmasındaki volume kaynağı `/opt/vr` olarak güncellendi ve container yeni yapılandırmayla yeniden oluşturuldu. Geçiş sırasında kullanılan `/opt/nginx-html -> /opt/vr` geriye dönük uyumluluk bağlantısı, yeni volume doğrulandıktan sonra kaldırıldı.

Taşıma işleminden sonra:

- Container içinden ana sayfa okunabildi.
- Canlı adres `200 OK` döndürdü.
- Canlı ana sayfa ile `/opt/vr/index.html` içeriğinin aynı olduğu doğrulandı.

Önceki Compose dosyasının kurtarma yedeği `/opt/docker-compose.personal-web.yml.bak-20260723` konumunda tutulmaktadır.

## 3. İncelenen alanlar

- Ana galeri sayfası: `index.html`
- Ortak 3B görüntüleyici: `viewer.html`
- Galeri stilleri ve etkileşimleri:
  - `assets/index.css`
  - `assets/index.js`
- Görüntüleyici stilleri ve davranışı:
  - `assets/viewer.css`
  - `assets/viewer.js`
- Model manifesti: `models.json`
- Üretim ve doğrulama araçları:
  - `tools/build_site.py`
  - `tools/doctor.py`
  - `tools/report_sizes.py`
  - `tools/optimize_models.py`
- Model, GLB, BIN ve doku dosyaları
- Canlı HTTP yanıt başlıkları
- W3C HTML doğrulaması
- Güncel WCAG, `model-viewer`, Khronos glTF ve Nginx belgeleri

## 4. Mevcut güçlü yönler

- Tek bir `viewer.html` üzerinden ortak görüntüleyici kullanılması bakımı kolaylaştırıyor.
- `models.json` tek kaynak olarak kullanılıyor ve sayfalar üretilebiliyor.
- Model yolları istemci tarafında izin verilen klasör ve uzantılarla sınırlandırılmış.
- Arama Türkçe karakterleri normalize ediyor.
- Galeri kartlarının klavye odak stilleri bulunuyor.
- Tema tercihi `localStorage` içinde saklanıyor.
- Hareket azaltma tercihi algılanıyor ve otomatik döndürme kapatılıyor.
- Yükleme yüzdesi ve hata durumu gösteriliyor.
- Paylaşım, tam ekran, kamera sıfırlama ve klavye kısayolları mevcut.
- `doctor.py` kontrolü kritik varlıkları ve manifesti başarılı buldu.
- Canlı ana sayfa W3C HTML doğrulamasında hata üretmedi.
- HTTPS, HTTP/2 ve byte-range desteği çalışıyor.

## 5. Performans bulguları

### 5.1 Model boyutları

| Model | Yaklaşık boyut |
|---|---:|
| OKÜ Yerleşke Genel Plan | 189,94 MB |
| A-B Blok | 121,09 MB |
| E Blok | 105,40 MB |
| F Blok | 98,44 MB |
| C Blok | 96,34 MB |
| Rektörlük | 85,14 MB |
| D Blok | 68,85 MB |
| İlahiyat | 62,13 MB |
| Kütüphane | 50,52 MB |
| Fabrika Yerleşkesi | 24,46 MB |

Toplam: **902,30 MB**

Örnek olarak 189,94 MB büyüklüğündeki genel plan modeli, 10 Mbps bağlantıda yalnızca ağ aktarımı için teorik olarak yaklaşık 152 saniye sürebilir. Buna modelin ayrıştırılması, dokuların GPU belleğine yüklenmesi ve sahnenin çizilmesi dahil değildir.

### 5.2 Büyük dokular

Projede:

- Çok sayıda 4096×4096 doku,
- Bir adet 8192×8192 doku,
- Tek başına 8–11 MB seviyesine ulaşan JPEG dosyaları

bulunuyor.

JPEG dosya boyutu GPU bellek kullanımını tam olarak göstermez. Örneğin 4096×4096 bir doku, tarayıcı/GPU tarafında RGBA olarak açıldığında yaklaşık 64 MB bellek kullanabilir. Aynı modelde çok sayıda böyle doku bulunması mobil cihazlarda sekmenin kapanmasına veya WebGL bağlamının kaybolmasına neden olabilir.

### 5.3 Kullanılmayan optimize C Blok sürümü

C Blok için hazır bir KTX2/Meshopt sürümü mevcut:

| Sürüm | Boyut |
|---|---:|
| Manifestte kullanılan C Blok | 96,34 MB |
| Standart GLB | 84,44 MB |
| KTX2 + Meshopt GLB | 36,72 MB |

Optimize sürüm, kullanılan sürümden yaklaşık **%62 daha küçük**, ancak `models.json` tarafından kullanılmıyor.

Bu dosyada aşağıdaki uzantılar tespit edildi:

- `KHR_texture_basisu`
- `EXT_meshopt_compression`
- `KHR_mesh_quantization`

Görsel kalite ve cihaz uyumluluğu test edildikten sonra optimize sürümün ana kaynak yapılması yüksek etkili, düşük kapsamlı bir iyileştirmedir.

### 5.4 Önerilen model optimizasyonu

- Tüm modelleri mümkünse tek GLB dosyası halinde sunmak.
- Geometri için Meshopt veya uygun durumda Draco kullanmak.
- Dokular için KTX2 veya WebP değerlendirmek.
- Mobil dağıtım için dokuları çoğunlukla 1K/2K ile sınırlandırmak.
- Gereksiz materyal ve dokuları birleştirmek.
- Görünmeyen/tekrarlanan geometriyi temizlemek.
- Masaüstü ve mobil için ayrı kalite seviyeleri değerlendirmek.
- Her model için görsel karşılaştırma ve bellek testi yapmak.
- Optimize dosyayı ana kaynak, orijinali gerektiğinde fallback yapmak.

Khronos’un güncel glTF doku sıkıştırma rehberi KTX2’nin özellikle GPU belleği, sürekli model yükleme ve hızlı görüntüleme gerektiren 3B uygulamalarda avantajlarını açıklamaktadır:

[Khronos — Best Practices for Compressing glTF Textures](https://www.khronos.org/developers/linkto/best-practices-for-compressing-gltf-textures)

## 6. Yükleme deneyimi

### 6.1 Model hemen indiriliyor

Kullanıcı bir karta bastığında model görüntüleyici sayfası açılıyor ve büyük model hemen yüklenmeye başlıyor. Poster görseli bulunsa da kullanıcı indirme boyutu hakkında önceden bilgilendirilmiyor.

Önerilen akış:

1. Gerçek bina posteri göster.
2. Model boyutunu belirt.
3. “3B modeli yükle — 96 MB” gibi açık bir buton sun.
4. Kullanıcı onayından sonra indirmeyi başlat.
5. Yükleme sırasında “İptal” ve “Galeriye dön” seçenekleri göster.

`model-viewer`, poster ve elle açma/yükleme akışlarını desteklemektedir:

[model-viewer — Lazy Loading](https://modelviewer.dev/examples/loading/)

### 6.2 Yükleme ve hata ekranında kaçış yolu yok

`viewer.html` içindeki loader ve hata katmanları tüm sahneyi kaplıyor. Katmanın `z-index` değeri kontrol çubuğundan yüksek olduğu için:

- “Galeri” kontrolü görünmez/kullanılamaz hale geliyor.
- Büyük modellerde kullanıcı uzun süre kapalı bir ekranda bekliyor.
- Hata oluştuğunda görünür bir “Tekrar dene” veya “Galeriye dön” seçeneği bulunmuyor.

Öneri:

- Loader içine “Galeriye dön” ve “İndirmeyi iptal et”.
- Hata ekranına “Tekrar dene”, “Galeriye dön” ve kısa, kullanıcı dostu hata açıklaması.
- Teknik Git LFS açıklamasını normal kullanıcıdan gizleyip debug ayrıntısına taşımak.
- Uzun yüklemelerde geçen süre ve indirilen veri miktarını göstermek.

## 7. Galeri sayfası UI/UX bulguları

### 7.1 Gerçek önizleme yerine yer tutucular

Mevcut posterler çoğunlukla:

- Açık gri arka plan,
- Emoji,
- Bina adı,
- “Görüntülemek için tıklayın”

içeriyor.

Bu yaklaşım temiz görünse de kullanıcıların binaları görsel olarak tanımasını sağlamıyor.

Öneri:

- Her model için aynı kamera açısı ve ışık düzeniyle gerçek render/poster üretmek.
- Kart üzerinde bina adı, bina türü ve kısa açıklama göstermek.
- Posterlerin WebP/AVIF biçimlerini değerlendirmek.
- Yükleme sırasında aynı posteri kullanarak görsel süreklilik sağlamak.

### 7.2 Kurum ve ürün kimliği zayıf

“3D Model Galerisi” başlığı teknik ve geneldir. Sayfanın OKÜ dijital yerleşkesi olduğu ilk bakışta yeterince güçlü anlaşılmıyor.

Öneri:

- Başlık: “OKÜ Dijital Yerleşke”
- Alt başlık: Kullanıcıya hangi görevi yapabileceğini söyleyen kısa metin.
- Kurumsal logo ve renklerin ölçülü kullanımı.
- Teknik “glTF/GLB · model-viewer” footer metni yerine kurum, yardım ve erişilebilirlik bağlantıları.

### 7.3 Galeri yerine harita temelli keşif

Bir kampüs deneyiminde kullanıcıların amacı yalnızca model seçmek olmayabilir. Bina bulmak, birimleri öğrenmek veya yol tarifi almak daha önemli olabilir.

Ürün düzeyinde öneri:

- OKÜ genel planını ana keşif ekranı yapmak.
- Binaları tıklanabilir noktalarla göstermek.
- Galeri ve harita görünümü arasında geçiş sunmak.
- Bina ayrıntısında:
  - Resmî bina adı,
  - İçindeki birimler,
  - Kısa açıklama,
  - Konum,
  - Yol tarifi,
  - 3B görüntüle,
  - AR’da görüntüle

seçenekleri sağlamak.

## 8. AR deneyimi

### 8.1 iOS uyarısı güncel davranışla uyuşmuyor

`viewer.js`, `ios-src` verilmediğinde iOS Quick Look için USDZ dosyasının zorunlu olduğunu ve modelde bulunmadığını belirten kalıcı bir uyarı gösteriyor.

Güncel `model-viewer` belgelerine göre `ios-src` belirtilmediğinde USDZ otomatik üretilebilir. Ayrı bir USDZ dosyası, otomatik oluşturulan sonuç yeterli olmadığında veya özel gereksinim olduğunda kullanılabilir.

[model-viewer — Augmented Reality](https://modelviewer.dev/examples/augmentedreality/)

Bu nedenle mevcut uyarı kaldırılmalı veya gerçek `canActivateAR` sonucuna göre yeniden yazılmalıdır.

### 8.2 AR rozetleri koşulsuz gösteriliyor

Galeri kartlarının tamamında “AR” rozeti bulunuyor. Kullanıcının cihazı veya tarayıcısı AR desteklemese bile aynı vaat gösteriliyor.

Öneri:

- Galeride rozeti “AR uyumlu model” şeklinde daha dikkatli ifade etmek veya
- Cihaz yeteneği algılandıktan sonra “Bu cihazda AR” durumunu göstermek.
- Görüntüleyicide:
  - AR destekleniyorsa güçlü birincil buton,
  - Desteklenmiyorsa pasif görünüm yerine nedenini açıklayan durum metni,
  - Ekran okuyucu için doğru `aria-label`/durum açıklaması kullanmak.

## 9. Mobil kontrol çubuğu

Görüntüleyicide aynı anda şu kontroller bulunuyor:

- AR
- Galeri
- Otomatik döndürme
- Yakınlaştır
- Uzaklaştır
- Kamera sıfırla
- Tam ekran
- Paylaş
- Yardım

Mobilde etiketlerin çoğu gizlendiği için kullanıcılar ikonların anlamını tahmin etmek zorunda kalıyor. Kontroller sarıldığında modelin alt kısmının önemli bölümü de kapanabilir.

Önerilen hiyerarşi:

### Her zaman görünür

- Galeriye dön
- AR
- Kamera sıfırla

### İkincil

- Otomatik döndürme
- Tam ekran
- Paylaş
- Yardım

### Gizlenebilir veya kaldırılabilir

- Yakınlaştır/uzaklaştır; pinch ve mouse wheel zaten aynı görevi sağlıyor. Erişilebilirlik gereği alternatifler korunacaksa “Diğer” menüsüne alınabilir.

Ek mobil öneriler:

- `100vh` yanında modern tarayıcılarda `100dvh` kullanmak.
- Safe-area boşluklarını tüm alt panelde hesaba katmak.
- Önemli dokunma hedeflerinde yaklaşık 44×44 px hedeflemek.
- İlk kullanımda tek seferlik kısa kontrol eğitimi göstermek.

WCAG 2.2, işaretçi hedefleri için en az 24×24 CSS piksel veya yeterli boşluk tanımlar:

[W3C — Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum)

## 10. Erişilebilirlik

### Olumlu noktalar

- Türkçe sayfa dili tanımlı.
- Kartlar bağlantı olarak kullanılabiliyor.
- Kartların anlamlı erişilebilir adları var.
- Arama alanı etiketli.
- Odak stilleri tanımlı.
- Zoom kontrollerinin `aria-label` değerleri var.
- Toggle kontrolleri `aria-pressed` kullanıyor.
- Yükleme ve hata durumlarında live region kullanılıyor.
- Hareket azaltma tercihi dikkate alınıyor.

### İyileştirme alanları

- Tema düğmesi mevcut tema veya hedef tema durumunu ekran okuyucuya söylemiyor.
- AR kullanılamadığında yalnızca CSS sınıfı ve tooltip değişiyor; erişilebilir ad/durum yeterince açık değil.
- Tooltip içerikleri dokunmatik ekranda güvenilir biçimde keşfedilemiyor.
- Yardım içeriği süre sonunda kapanıyor; kullanıcı tarafından kalıcı açma/kapatma daha uygun olur.
- 3B modelin `alt` metni yalnızca “Bina adı 3D Model” biçiminde. Modeldeki anlamlı bilgileri açıklayan metinsel alternatif bulunmuyor.
- `prefers-reduced-motion` durumunda spinner tamamen durmak yerine yalnızca yavaşlıyor.
- Uzun süre otomatik dönen model için durdurma kontrolü mevcut; bu olumlu fakat kontrolün görünürlüğü mobilde daha açık olmalı.

W3C gereksiz hareketin kaldırılmasını ve hareket azaltma tercihinin desteklenmesini önerir:

[W3C — Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions)

Hover/focus ile açılan ek içeriklerin kapatılabilir, üzerine gidilebilir ve yeterince kalıcı olması gerekir:

[W3C — Content on Hover or Focus](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus)

## 11. Canlı sunucu bulguları

Canlı yanıt başlıklarında:

- HTML içerik gzip ile sıkıştırılıyor.
- CSS için gzip yanıtı görülmedi.
- Statik varlık ve modellerde `Cache-Control` görülmedi.
- `.gltf` ve `.bin` dosyaları `application/octet-stream` olarak sunuluyor.
- Byte-range desteği mevcut.
- Site genelinde `X-Robots-Tag: noindex, nofollow, noarchive` bulunuyor.

### Öneriler

- Hash’li veya değişmeyen model/asset dosyalarına uzun süreli cache:

```nginx
Cache-Control: public, max-age=31536000, immutable
```

- HTML için kısa cache veya doğrulamalı cache.
- CSS ve JavaScript için gzip/Brotli.
- Doğru MIME türleri:

```text
.gltf  model/gltf+json
.glb   model/gltf-binary
.bin   application/gltf-buffer
```

IANA ve glTF standardında kayıtlı medya türleri:

- [IANA Media Types](https://www.iana.org/assignments/media-types/media-types.xhtml)
- [Khronos glTF 2.0 Specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)

Nginx resmî belgeleri:

- [Nginx Cache-Control ve Expires](https://nginx.org/en/docs/http/ngx_http_headers_module.html)
- [Nginx Gzip](https://nginx.org/en/docs/http/ngx_http_gzip_module.html)

`noindex` ayarı site yalnızca kapalı/deneysel kullanım içinse korunabilir. Halka açık bir dijital kampüs olarak arama motorlarında bulunması isteniyorsa kaldırılmalıdır.

## 12. Paylaşım ve keşfedilebilirlik

Ana sayfa ve model sayfalarında sosyal paylaşım için özel metadata bulunmuyor.

Öneri:

- Kuruma özgü sayfa başlığı ve açıklaması.
- Open Graph:
  - `og:title`
  - `og:description`
  - `og:image`
  - `og:url`
- Twitter/X card metadata.
- Model bağlantıları için bina posterinin paylaşım görseli olması.
- Canonical URL.
- İsteniyorsa anonim ve gizlilik dostu kullanım analitiği:
  - Hangi model açılıyor?
  - Yükleme tamamlanıyor mu?
  - Hangi modeller hata veriyor?
  - AR butonu kullanılabiliyor mu?
  - Kullanıcı yükleme bitmeden çıkıyor mu?

## 13. Önerilen uygulama sırası

### Aşama 1 — Hızlı ve düşük riskli kazanımlar

- iOS/AR uyarı metnini düzeltmek.
- Loader ve hata ekranına “Galeriye dön” eklemek.
- Hata ekranına “Tekrar dene” eklemek.
- Tema ve AR durumlarının erişilebilir adlarını güncellemek.
- Mobilde `100dvh` ve dokunma hedeflerini iyileştirmek.
- README ve sunucu yapılandırmalarında `/opt/vr` yolunu kullanmaya devam etmek.
- Nginx cache, gzip ve MIME başlıklarını düzeltmek.
- Site halka açıksa `noindex` kararını gözden geçirmek.

### Aşama 2 — En yüksek performans etkisi

- C Blok optimize sürümünü kalite/uyumluluk testinden geçirmek.
- Başarılıysa optimize C Blok’u ana kaynak yapmak.
- Diğer modeller için Meshopt + KTX2/WebP optimizasyon hattı oluşturmak.
- Doku çözünürlüğü ve GPU bellek bütçesi belirlemek.
- Kartlarda model boyutlarını göstermek.
- Büyük indirmeyi kullanıcı onayıyla başlatmak.

### Aşama 3 — Görsel ve ürün deneyimi

- Gerçek model render posterleri üretmek.
- Galeri kartlarına bina türü/açıklaması eklemek.
- OKÜ kurumsal kimliğini uygulamak.
- Kontrol çubuğunu mobil öncelikli sadeleştirmek.
- Kalıcı ve erişilebilir yardım paneli oluşturmak.

### Aşama 4 — Dijital kampüs deneyimi

- Harita/genel plan merkezli keşif.
- Tıklanabilir bina noktaları.
- Bina birimleri ve açıklamaları.
- Konum ve yol tarifi.
- Galeri/harita görünümü geçişi.
- Gerçek kullanıcılarla mobil kullanılabilirlik testi.

## 14. Doğrulama ve ölçüm planı

Düzeltmeler uygulandığında aşağıdaki kontroller yapılmalıdır:

- `python3 tools/doctor.py`
- `python3 tools/report_sizes.py`
- W3C HTML doğrulaması
- Chrome/Android, Safari/iOS ve masaüstü tarayıcı testleri
- Yavaş 4G ağ simülasyonu
- Düşük/orta segment Android cihaz bellek testi
- Klavye ile tüm akışın tamamlanması
- Ekran okuyucu temel kontrolü
- Açık/koyu tema kontrast kontrolü
- `prefers-reduced-motion` kontrolü
- AR destekli ve desteksiz cihazlarda durum mesajları
- 404/model yükleme hatası kurtarma akışı
- Lighthouse veya PageSpeed ölçümü

Core Web Vitals için önerilen “iyi” eşikleri:

- LCP: en fazla 2,5 saniye
- INP: en fazla 200 ms
- CLS: en fazla 0,1

[web.dev — Core Web Vitals thresholds](https://web.dev/articles/defining-core-web-vitals-thresholds)

Google PageSpeed API ölçümü inceleme sırasında günlük API kotasına takıldığı için bu rapora güvenilir bir Lighthouse puanı eklenemedi.

## 15. Karar özeti

Uygulama kararı verilmeden önce önerilerin şu üç grupta değerlendirilmesi uygun olur:

### Mutlaka önerilenler

- Model ve doku optimizasyonu
- Kontrollü model yükleme
- Loader/hata ekranında geri dönüş
- AR mesajlarının düzeltilmesi
- Cache/MIME yapılandırması

### Güçlü biçimde önerilenler

- Gerçek bina posterleri
- Mobil kontrol çubuğunun sadeleştirilmesi
- Kurum kimliği ve bina açıklamaları
- Erişilebilir yardım/durum metinleri

### Ürün vizyonuna bağlı olanlar

- Harita merkezli dijital kampüs
- Yol tarifi ve bina birimleri
- Arama motoru görünürlüğü
- Kullanım analitiği

Bu rapor karar desteği amacıyla hazırlanmıştır. Herhangi bir UI/UX veya model optimizasyonu değişikliği henüz uygulanmamıştır.
