# 3D Model Galerisi ve Görüntüleyici

Bu depo; binalara ait glTF tabanlı 3B modellerin web üzerinden görüntülenmesi ve WebXR destekli AR deneyimi için hazırlanmıştır. Tüm modelleri ortak bir arayüzde açmak için `viewer.html` sayfası eklendi ve anasayfa bu viewer'a yönlendirilmiştir.

## Özellikler

- Ortak `viewer.html` ile ilerleme çubuğu, AR butonu, oto-döndürme, kamera sıfırlama ve tam ekran kontrolü
- Anasayfada arama/filtreleme (kısayol: `/`, temizle: `Esc`)
- Model-Viewer kütüphanesi sabit sürüm (v4.1.0) ile yüklenir
- iOS cihazlar için USDZ olmadığında bilgilendirme

## Klasör yapısı

- `viewer.html`: Ortak görüntüleyici sayfası (sorgu parametreleri ile çalışır)
- `assets/viewer.css`: Ortak stiller
- `assets/viewer.js`: Ortak işlevler ve etkileşimler
- `index.html`: Kartlar halinde model listesi (viewer'a yönlendirilmiş)
- `a_b_blok`, `c_blok`, ...: Mevcut model klasörleri ve eski index sayfaları

## Kullanım

Model açmak için `viewer.html?model=<yol>&title=<başlık>` formatında bağlantı verin. Örnek:

```
/viewer.html?title=A%20B%20Blok&model=a_b_blok/a_b_blok/A%20blok%20B%20blok%20Spor%20Tesisleri.gltf
```

İsteğe bağlı parametreler:

- `orbit`: Varsayılan kamera yörüngesi (örn. `55deg 75deg 2.5m`)
- `exposure`: Pozlama değeri (örn. `0.7`)
- `ios`: iOS AR Quick Look için USDZ dosya yolu (örn. `.../model.usdz`)
- `poster`: Yükleme öncesi poster görseli (örn. `path/poster.webp`)
- `reveal`: `auto` | `interaction` | `manual` (yükleme davranışı)
- `arPlacement`: `floor` | `wall` | `auto` (AR yerleşimi)
- `arScale`: `auto` | `fixed` (AR ölçek davranışı)
- `fallback`: İlk model yüklenemezse denenecek alternatif model yolu (örn. KTX2 desteklemeyen cihazlar için)

Kısayollar (viewer):

- `F`: Tam ekran aç/kapat
- `R`: Kamerayı sıfırla
- `?`: Yardımı göster

## Notlar ve İyileştirme Önerileri

- Büyük `.bin` ve çok sayıdaki doku (`.jpg`) dosyaları yükleme süresini uzatabilir. Mesh sıkıştırma (Draco) ve doku sıkıştırma (KTX2/Basis) ile boyutlar ciddi oranda düşürülebilir.
- iOS AR (Quick Look) için her modelin `.usdz` eşleniği sağlanırsa `ios-src` parametresi ile viewer'a eklenebilir.
