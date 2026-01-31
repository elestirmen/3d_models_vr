# 🏛️ 3D Model Galerisi ve Görüntüleyici

Modern web teknolojileri ile oluşturulmuş, binalara ait glTF/GLB tabanlı 3D modellerin web üzerinden görüntülenmesi ve WebXR destekli AR (Artırılmış Gerçeklik) deneyimi sunan gelişmiş bir platform.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![glTF](https://img.shields.io/badge/glTF-2.0-green.svg)](https://www.khronos.org/gltf/)
[![WebXR](https://img.shields.io/badge/WebXR-AR%20Ready-orange.svg)](https://immersiveweb.dev/)

---

## 📋 İçindekiler

- [Özellikler](#-özellikler)
- [Demo](#-demo)
- [Mevcut Modeller](#-mevcut-modeller)
- [Kurulum](#-kurulum)
- [Kullanım](#-kullanım)
- [Proje Yapısı](#-proje-yapısı)
- [Teknik Detaylar](#-teknik-detaylar)
- [Model Optimizasyonu](#-model-optimizasyonu)
- [Geliştirme](#-geliştirme)
- [Sorun Giderme](#-sorun-giderme)
- [Katkıda Bulunma](#-katkıda-bulunma)
- [Lisans](#-lisans)

---

## ✨ Özellikler

### 🎨 Görsel ve Kullanıcı Deneyimi
- **Modern ve Responsive Tasarım**: Tüm cihazlarda mükemmel görünüm
- **Gerçek Zamanlı Arama**: Türkçe karakter normalizasyonu ile gelişmiş filtreleme
- **Klavye Kısayolları**: Hızlı erişim için özelleştirilmiş kısayollar (`/`, `Esc`, `F`, `R`)
- **Erişilebilirlik**: ARIA etiketleri ve klavye navigasyonu desteği
- **Gradient Arka Plan**: Göz alıcı modern arayüz

### 🎮 3D Görüntüleyici Özellikleri
- **Ortak Görüntüleyici Sistemi**: Tek `viewer.html` ile tüm modeller
- **İlerleme Çubuğu**: Yükleme durumu görselleştirmesi
- **AR Desteği**: WebXR ile artırılmış gerçeklik deneyimi
- **Otomatik Döndürme**: İsteğe bağlı model rotasyonu
- **Kamera Kontrolleri**: Zoom, pan, rotate işlemleri
- **Tam Ekran Modu**: Daha sürükleyici görüntüleme deneyimi
- **Responsive Kontroller**: Mobil ve masaüstü için optimize edilmiş

### 🔧 Teknik Özellikler
- **Model-Viewer v4.1.0**: Sabit sürüm ile tutarlı performans
- **Progressive Loading**: Fallback mekanizması ile uyumluluk
- **KTX2 Texture Compression**: Destekleyen cihazlarda optimize edilmiş yükleme
- **iOS Quick Look**: USDZ formatı desteği
- **Custom Lighting**: Ayarlanabilir pozlama ve aydınlatma
- **Poster Images**: Yükleme öncesi önizleme desteği

---

## 🎬 Demo

Projeyi yerel olarak çalıştırdıktan sonra:

1. Ana sayfa: `http://localhost/` veya sunucu IP'niz
2. Örnek model: `http://localhost/viewer.html?title=Kütüphane&model=kutuphane/kutuphane/Kutuphane.gltf&poster=assets/posters/kutuphane.svg`

---

## 🏢 Mevcut Modeller

| Model Adı | Klasör | Dosya Formatı | Özellikler |
|-----------|--------|---------------|------------|
| **A-B Blok** | `a_b_blok/` | glTF + .bin | Spor tesisleri ile birleşik yapı |
| **C Blok** | `c_blok/` | glTF/GLB + KTX2 | Laboratuvar binası, texture compression |
| **D Blok** | `d_blok/` | glTF | Eğitim binası |
| **E Blok** | `e_blok/` | glTF | Eğitim binası |
| **F Blok** | `f_blok/` | glTF | Eğitim binası |
| **İlahiyat Fakültesi** | `ilahiyat/` | glTF | Fakülte binası |
| **Kütüphane** | `kutuphane/` | glTF | Merkez kütüphane |
| **Rektörlük** | `rektorluk/` | glTF | Rektörlük ve amfi |
| **Fabrika Yerleşkesi** | `fabrika/` | glTF | Fabrika kampüsü |
| **OKÜ Genel Plan** | `oku_genel_plan/` | glTF | Kampüs master planı |

Her model klasörü kendi alt dizininde `.gltf`, `.bin` ve texture dosyalarını içerir.

---

## 🚀 Kurulum

### Ön Gereksinimler

- **Web Sunucusu**: Nginx, Apache veya herhangi bir HTTP sunucusu
- **Modern Web Tarayıcı**: Chrome, Firefox, Safari, Edge (WebGL desteği gerekli)
- **Node.js** _(isteğe bağlı)_: Model optimizasyonu için

### Kurulum Adımları

#### 1. Depoyu Klonlayın

```bash
git clone <repository-url>
cd /opt/nginx-html

# Repo Git LFS kullanıyorsa (özellikle .bin/.glb dosyaları):
git lfs install
git lfs pull
```

#### 2. Web Sunucusunu Yapılandırın

**Nginx örneği:**

```nginx
server {
    listen 80;
    server_name localhost;
    root /opt/nginx-html;
    index index.html;
    
    location / {
        try_files $uri $uri/ =404;
        add_header Access-Control-Allow-Origin *;
    }
    
    # MIME types (bazı dağıtımlarda zaten tanımlıdır)
    types {
        model/gltf+json    gltf;
        model/gltf-binary  glb;
        application/wasm   wasm;
    }

    # Statik varlıklar (CSS/JS/poster) için cache
    location /assets/ {
        add_header Cache-Control "public, max-age=604800";
        expires 7d;
    }

    # Modeller için cache (ihtiyaca göre artırılabilir)
    location ~* \.(gltf|glb|bin|jpg|jpeg|png|webp|ktx2)$ {
        add_header Cache-Control "public, max-age=604800";
        expires 7d;
        add_header Access-Control-Allow-Origin *;
    }
}
```

#### 3. Servisi Başlatın

```bash
sudo systemctl restart nginx
# veya
sudo service nginx restart
```

#### 4. Tarayıcıda Açın

```
http://localhost/
```

---

## 📖 Kullanım

### Ana Sayfa

Ana sayfada (`index.html`) tüm modeller kart şeklinde listelenir:

- **Arama**: `/` tuşuna basarak arama kutusunu aktif edin
- **Filtreleme**: Model isimlerine göre gerçek zamanlı filtreleme
- **Temizleme**: `Esc` tuşu ile aramayı temizleyin
- **Seçim**: Bir karta tıklayarak modeli görüntüleyicide açın

### Görüntüleyici Sayfası

Model görüntüleyicide (`viewer.html`):

#### Temel Kontroller
- **Fare/Dokunma**: Modeli döndürün
- **Scroll/Pinch**: Zoom yapın
- **Sağ Tık/İki Parmak**: Pan (kaydırma)

#### Klavye Kısayolları
- `F`: Tam ekran modunu aç/kapat
- `R`: Kamerayı varsayılan konuma sıfırla
- `?`: Yardım panelini göster

#### AR Modu
AR özellikli cihazlarda "AR'da Görüntüle" butonu ile modeli gerçek dünyada görüntüleyin.

### URL Parametreleri

Viewer sayfası sorgu parametreleri ile özelleştirilebilir:

```
/viewer.html?title=<başlık>&model=<model-yolu>[&opsiyonel-parametreler]
```

#### Zorunlu Parametreler

| Parametre | Açıklama | Örnek |
|-----------|----------|-------|
| `title` | Model başlığı | `title=Kütüphane` |
| `model` | Model dosya yolu | `model=kutuphane/kutuphane/Kutuphane.gltf` |

#### İsteğe Bağlı Parametreler

| Parametre | Tip | Varsayılan | Açıklama | Örnek |
|-----------|-----|-----------|----------|-------|
| `orbit` | string | `55deg 75deg 2.5m` | Başlangıç kamera pozisyonu | `orbit=45deg 60deg 3m` |
| `exposure` | number | `0.7` | Sahne pozlaması (0-2) | `exposure=0.8` |
| `poster` | string | - | Yükleme öncesi poster görsel | `poster=path/poster.webp` |
| `reveal` | string | `auto` | Yükleme davranışı | `auto`, `interaction`, `manual` |
| `ios` | string | - | iOS AR için USDZ yolu | `ios=path/model.usdz` |
| `arPlacement` | string | `floor` | AR yerleştirme modu | `floor`, `wall`, `auto` |
| `arScale` | string | `auto` | AR ölçekleme | `auto`, `fixed` |
| `fallback` | string | - | Alternatif model yolu | `fallback=model.glb` |

#### Tam Örnek

```html
<a href="/viewer.html?title=Kütüphane&model=kutuphane/kutuphane/Kutuphane.gltf&orbit=45deg%2060deg%203m&exposure=0.8&arPlacement=floor">
  Kütüphane Modelini Görüntüle
</a>
```

---

## 📁 Proje Yapısı

```
/opt/nginx-html/
│
├── models.json                 # Model manifesti (tek kaynak)
├── index.html                  # Ana sayfa (manifestten üretilir)
├── viewer.html                 # Ortak 3D görüntüleyici
├── README.md                   # Bu dosya
├── .gitattributes             # Git LFS yapılandırması
│
├── assets/                     # Paylaşılan varlıklar
│   ├── index.css              # Ana sayfa stilleri
│   ├── index.js               # Ana sayfa arama/filtre
│   ├── viewer.css             # Görüntüleyici stilleri
│   ├── viewer.js              # Görüntüleyici JS mantığı
│   ├── models.generated.js    # (build) allowlist vb.
│   ├── model-viewer-config.js # model-viewer ayarları (meshopt decoder)
│   └── posters/               # (build) poster görselleri
│
├── tools/                      # Yardımcı araçlar
│   ├── build_site.py          # index/redirect/poster üretimi
│   ├── optimize_models.py     # manifestten gltf -> glb optimizasyonu
│   ├── optimize_models.sh     # (wrapper) optimize_models.py
│   ├── report_sizes.py        # Boyut raporu
│   └── models.schema.json     # Manifest şeması
│   └── bin/
│       ├── gltfpack           # glTF optimizasyon aracı
│       └── gltfpack-ubuntu.zip
│
├── a_b_blok/                   # A-B Blok modeli
│   ├── a_b_blok/
│   │   ├── *.gltf             # glTF model dosyası
│   │   ├── *.bin              # Binary geometri/animasyon
│   │   └── *.jpeg             # Texture dosyaları
│   ├── index.html             # (build) redirect -> viewer.html
│   └── responsive.html        # (build) redirect -> viewer.html
│
├── c_blok/                     # C Blok modeli (KTX2 optimized)
├── d_blok/                     # D Blok modeli
├── e_blok/                     # E Blok modeli
├── f_blok/                     # F Blok modeli
├── ilahiyat/                   # İlahiyat Fakültesi modeli
├── kutuphane/                  # Kütüphane modeli
├── rektorluk/                  # Rektörlük modeli
├── fabrika/                    # Fabrika yerleşkesi modeli
└── oku_genel_plan/            # OKÜ genel planı
```

### Dosya Türleri

- **`.gltf`**: JSON formatında 3D model tanımı
- **`.glb`**: Binary glTF formatı (tek dosya)
- **`.bin`**: Binary geometri ve animasyon verisi
- **`.jpeg/.jpg`**: Texture ve material map'leri
- **`.usdz`**: iOS AR Quick Look formatı

---

## 🔧 Teknik Detaylar

### Kullanılan Teknolojiler

- **[Model Viewer](https://modelviewer.dev/)** v4.1.0 - Google'ın 3D model görüntüleyici kütüphanesi
- **[glTF 2.0](https://www.khronos.org/gltf/)** - 3D model formatı standardı
- **[WebXR](https://immersiveweb.dev/)** - AR/VR web API'si
- **HTML5, CSS3, JavaScript (ES6+)** - Modern web standartları
- **Sistem fontları + emoji ikonlar** - Harici font/ikon bağımlılığı yok
- **CSP + SRI** - Temel güvenlik sertleştirmeleri

### Tarayıcı Desteği

| Özellik | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| 3D Görüntüleme | ✅ | ✅ | ✅ | ✅ |
| WebXR AR | ✅ | ⚠️ | ⚠️ | ✅ |
| iOS Quick Look | ❌ | ❌ | ✅ | ❌ |

- ✅ Tam destek
- ⚠️ Kısmi destek veya deneysel
- ❌ Desteklenmiyor

### Performans Özellikleri

- **Lazy Loading**: Modeller sadece gerektiğinde yüklenir
- **Progressive Enhancement**: Cihaz yeteneklerine göre optimizasyon
- **Texture Compression**: KTX2/Basis ile %70'e varan boyut azaltma
- **Mesh Quantization**: Geometri verisi optimizasyonu
- **Fallback System**: Uyumsuz formatlar için alternatif modeller

### Mimari

```
┌─────────────────┐
│   index.html    │  ← Kullanıcı buradan başlar
│  (Model Listesi)│
└────────┬────────┘
         │ Model seçimi
         ↓
┌─────────────────┐
│   viewer.html   │  ← Ortak görüntüleyici
│  + viewer.css   │
│  + viewer.js    │
└────────┬────────┘
         │ Model yolu
         ↓
┌─────────────────┐
│  Model Klasörü  │  ← .gltf + .bin + textures
│  (örn: c_blok/) │
└─────────────────┘
```

---

## 🎯 Model Optimizasyonu

Model dosyaları büyük olabilir ve yükleme süresini uzatabilir. Optimizasyon araçları ile dosya boyutlarını %50-90 oranında azaltabilirsiniz.

### Otomatik Optimizasyon

Proje `tools/` dizininde hazır optimizasyon scripti içerir:

```bash
cd /opt/nginx-html

# glTF dosyalarını GLB formatına dönüştür ve optimize et
./tools/optimize_models.sh
```

Bu script:
- `models.json` içindeki `.gltf` modelleri tarar
- Mesh quantization uygular (gltfpack varsayılanları)
- `.glb` formatına dönüştürür (varsayılan: `.opt.glb`)
- Dosya boyutunu %30-50 azaltır

İsteğe bağlı:

```bash
# Sadece planı göster
python3 tools/optimize_models.py --dry-run

# Manifesti güncelle (opt.glb primary, eski gltf fallback)
python3 tools/optimize_models.py --update-manifest
python3 tools/build_site.py
```

### Manuel Optimizasyon

#### 1. gltfpack Kurulumu

```bash
# npm ile global kurulum
npm install -g gltfpack

# veya binary indir
wget https://github.com/zeux/meshoptimizer/releases/latest/download/gltfpack
chmod +x gltfpack
```

#### 2. Temel Optimizasyon

```bash
gltfpack -i input.gltf -o output.glb
```

#### 3. Agresif Optimizasyon (daha küçük dosya)

```bash
gltfpack -i input.gltf -o output.glb -cc -tc
```

Parametreler:
- `-cc`: Mesh sıkıştırma (Draco)
- `-tc`: Texture sıkıştırma (KTX2/Basis)
- `-si 0.5`: Texture boyutunu %50 küçült
- `-tq 8`: Texture kalitesi (1-10, düşük = küçük dosya)

#### 4. Texture Optimizasyonu

```bash
# JPEG texture'ları optimize et
for img in **/*.jpg **/*.jpeg; do
  convert "$img" -quality 85 -sampling-factor 4:2:0 -strip "$img"
done

# PNG'leri küçült
for img in **/*.png; do
  pngquant --quality=65-80 "$img" --ext .png --force
done
```

### KTX2 Texture Compression

C Blok modelinde örnek kullanım:

```html
<!-- KTX2 destekleyen cihazlar için -->
<model-viewer src="c_blok_ktx2.glb"></model-viewer>

<!-- Fallback: KTX2 desteklemeyenler için -->
<model-viewer 
  src="c_blok_ktx2.glb" 
  fallback="c_blok.glb">
</model-viewer>
```

### Optimizasyon Karşılaştırması

| Format | Dosya Boyutu | Yükleme Süresi* | Kalite |
|--------|--------------|-----------------|--------|
| Orijinal glTF + PNG | ~50 MB | ~15 sn | %100 |
| GLB + JPEG (85%) | ~25 MB | ~8 sn | %95 |
| GLB + Draco | ~15 MB | ~6 sn | %98 |
| GLB + Draco + KTX2 | ~8 MB | ~3 sn | %90 |

*Ortalama 4G mobil bağlantı için tahmin

---

## 💻 Geliştirme

### Yeni Model Ekleme

1. Model klasörü oluşturun:

```bash
mkdir -p /opt/nginx-html/yeni_bina/yeni_bina
```

2. Model dosyalarını kopyalayın:

```bash
cp model.gltf model.bin *.jpg /opt/nginx-html/yeni_bina/yeni_bina/
```

3. `models.json` içine yeni model ekleyin:

```json
{
  "id": "yeni_bina",
  "title": "Yeni Bina",
  "label": "Yeni Bina",
  "emoji": "🏢",
  "model": "yeni_bina/yeni_bina/model.gltf",
  "keywords": ["Yeni", "Bina"]
}
```

4. Sayfaları yeniden üretin:

```bash
python3 tools/build_site.py
```

5. (İsteğe bağlı) Boyut raporu:

```bash
python3 tools/report_sizes.py
```

6. (İsteğe bağlı) Optimizasyon:

```bash
python3 tools/optimize_models.py --dry-run
python3 tools/optimize_models.py
```

### Per-model Viewer Ayarları (İsteğe Bağlı)

`models.json` içinde her modele `orbit`, `exposure`, `ios` gibi alanlar ekleyebilirsiniz; `tools/build_site.py` bu parametreleri linklere taşır.

```markdown
# Yeni Bina 3D Modeli

## Özellikler
- Boyut: X x Y x Z metre
- Polygon sayısı: ~XXX
- Texture boyutu: XX MB

## Notlar
Model özellikleri hakkında notlar...
```

### Viewer Özelleştirme

`assets/viewer.js` dosyasında özelleştirmeler yapabilirsiniz:

```javascript
// Varsayılan kamera pozisyonu (URL parametresi yoksa)
const orbit = qsp('orbit', '55deg 75deg 2.5m');

// Varsayılan pozlama (URL parametresi yoksa)
const exposure = qsp('exposure', '0.7');
```

### Stil Değişiklikleri

`assets/viewer.css` dosyasında görsel özelleştirmeler:

```css
/* Tema renkleri */
:root {
  --primary-color: #667eea;
  --secondary-color: #764ba2;
  --text-color: #2c3e50;
}
```

### Test Sunucusu

Geliştirme için basit HTTP sunucusu:

```bash
# Python 3
python3 -m http.server 8000

# Node.js
npx serve -p 8000

# PHP
php -S localhost:8000
```

Ardından tarayıcıda `http://localhost:8000` adresine gidin.

---

## 🐛 Sorun Giderme

### Model Yüklenmiyor

**Sorun**: Model görüntüleyicide görünmüyor

**Çözümler**:
1. Tarayıcı konsolunu kontrol edin (F12)
2. Dosya yollarının doğru olduğunu kontrol edin
3. CORS hatası varsa, sunucu yapılandırmasını kontrol edin
4. `.bin` ve texture dosyalarının aynı dizinde olduğundan emin olun

```bash
# Dosya yapısını kontrol et
ls -la kutuphane/kutuphane/
```

### CORS Hatası

**Sorun**: `CORS policy` hatası

**Çözüm**: Nginx yapılandırmasına header ekleyin:

```nginx
add_header Access-Control-Allow-Origin *;
add_header Access-Control-Allow-Methods "GET, OPTIONS";
```

### Yavaş Yükleme

**Sorun**: Modeller çok yavaş yükleniyor

**Çözümler**:
1. Model optimizasyonu yapın (yukarıya bakın)
2. Texture boyutlarını küçültün
3. GLB formatı kullanın (tek dosya)
4. Progressive loading için poster image ekleyin
5. KTX2 compression kullanın

### AR Çalışmıyor

**Sorun**: AR butonu görünmüyor veya çalışmıyor

**Çözümler**:
- **Android Chrome**: WebXR destekli cihaz gerekli (ARCore)
- **iOS Safari**: `.usdz` dosyası gerekli, `ios` parametresi ile ekleyin
- HTTPS gereklidir (localhost hariç)

### Mobilde Performans Sorunu

**Sorun**: Mobil cihazlarda yavaş çalışıyor

**Çözümler**:
1. Polygon sayısını azaltın (LOD - Level of Detail)
2. Texture çözünürlüğünü düşürün (512x512 veya 1024x1024)
3. Draco compression kullanın
4. Gereksiz detayları kaldırın

---

## 🤝 Katkıda Bulunma

Katkılarınızı memnuniyetle karşılıyoruz! Lütfen şu adımları izleyin:

### Katkı Süreci

1. **Depoyu Fork Edin**

```bash
git clone <forked-repo-url>
cd nginx-html
```

2. **Feature Branch Oluşturun**

```bash
git checkout -b feature/yeni-ozellik
```

3. **Değişikliklerinizi Yapın**

- Kod standartlarına uyun
- Yorumları Türkçe yazın
- Semantik commit mesajları kullanın

4. **Test Edin**

```bash
# Tüm bağlantıları test edin
# Farklı tarayıcılarda test edin
# Mobil görünümü test edin
```

5. **Commit ve Push**

```bash
git add .
git commit -m "feat: yeni özellik eklendi"
git push origin feature/yeni-ozellik
```

6. **Pull Request Açın**

- Değişiklikleri detaylı açıklayın
- Ekran görüntüleri ekleyin (UI değişiklikleri için)
- Test sonuçlarını paylaşın

### Commit Mesaj Formatı

```
<tip>: <kısa açıklama>

<detaylı açıklama (isteğe bağlı)>

<footer (isteğe bağlı)>
```

Tipler:
- `feat`: Yeni özellik
- `fix`: Hata düzeltme
- `docs`: Dokümantasyon
- `style`: Kod formatı
- `refactor`: Yeniden yapılandırma
- `perf`: Performans iyileştirme
- `test`: Test ekleme/düzeltme
- `chore`: Bakım işleri

Örnek:
```
feat: KTX2 texture compression desteği eklendi

- Fallback mekanizması eklendi
- Viewer.js'de format tespiti yapıldı
- Tüm modeller için optimize edilmiş versiyonlar oluşturuldu

Closes #42
```

### Kod Standartları

- **JavaScript**: ES6+ syntax, camelCase isimlendirme
- **CSS**: BEM metodolojisi, responsive-first
- **HTML**: Semantic HTML5, ARIA attributes
- **Accessibility**: WCAG 2.1 AA standartları

---

## 📄 Lisans

Bu proje MIT lisansı altında lisanslanmıştır. Detaylar için [LICENSE](LICENSE) dosyasına bakın.

Not: Depo içinde üçüncü parti içerikler (ör. bazı model klasörlerindeki örnek dosyalar) bulunabilir ve bunlar kendi klasörlerindeki `LICENSE` dosyalarıyla (örn. Apache-2.0) lisanslanmış olabilir.

```
MIT License

Copyright (c) 2024-2026

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction...
```

---

## 🙏 Teşekkürler

- **[Google Model Viewer](https://modelviewer.dev/)** - Harika 3D viewer kütüphanesi
- **[Khronos Group](https://www.khronos.org/)** - glTF formatı standardı
- **[Meshoptimizer](https://github.com/zeux/meshoptimizer)** - gltfpack optimizasyon aracı
- **Tüm katkıda bulunanlar** - Açık kaynak topluluğu

---

## 📞 İletişim ve Destek

- **Issues**: [GitHub Issues](../../issues) üzerinden sorun bildirin
- **Discussions**: [GitHub Discussions](../../discussions) üzerinden tartışın
- **Documentation**: Bu README ve model klasörlerindeki README dosyaları

---

## 🗺️ Yol Haritası

### Kısa Vadeli (v1.x)
- [x] Ortak viewer sistemi
- [x] Responsive tasarım
- [x] AR desteği
- [x] Klavye kısayolları
- [x] Model optimizasyon araçları
- [x] Poster görselleri için otomatik üretim
- [ ] Tüm modeller için USDZ versiyonları

### Orta Vadeli (v2.x)
- [ ] Model karşılaştırma modu (yan yana görüntüleme)
- [ ] Animasyon desteği
- [ ] Açıklama notları (annotations) sistemi
- [ ] QR kod ile mobil erişim
- [ ] Offline PWA desteği
- [ ] Multi-language desteği (EN, TR)

### Uzun Vadeli (v3.x)
- [ ] VR modu desteği
- [ ] Collaborative viewing (çoklu kullanıcı)
- [ ] 360° panorama entegrasyonu
- [ ] Model karşılaştırma (tarihsel versiyonlar)
- [ ] Admin paneli (model yönetimi)

---

## 📊 İstatistikler

- **Toplam Model Sayısı**: 10
- **Toplam Dosya Boyutu**: ~500 MB (optimize öncesi)
- **Desteklenen Format**: glTF 2.0, GLB, USDZ
- **Tarayıcı Uyumluluğu**: %95+ modern tarayıcılar

---

<div align="center">

**[⬆ Başa Dön](#-3d-model-galerisi-ve-görüntüleyici)**

Made with ❤️ for modern web experiences

</div>
