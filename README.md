# 🏛️ OKÜ Dijital Yerleşke

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
- **Bina Tanıtım Sayfaları**: `/<model>/` altında modele özel OG görseli, açıklaması ve schema.org (Place + 3DModel + BreadcrumbList) işaretlemesiyle paylaşılabilir statik sayfa
- **Kaynaklı Bina Bilgisi**: `sources` alanı panelde "Kaynak" bölümü olarak gösterilir; derlenen bilginin kurumca ayrıca teyit edilmediği açıkça yazılır
- **Bina Bilgisi Paneli**: Kategori, açıklama, teyitli bina bilgileri (kat/alan/yıl/birim/erişilebilirlik), konum + yol tarifi ve model künyesi (kalite kademeleri, boyut, üçgen sayısı); yalnızca `models.json`'a yazılmış alanlar gösterilir
- **Tam Ekran Sahne**: Başlık ve kontroller sahnenin üzerinde yüzer; sabit başlık payı yok
- **Kamera Presetleri**: Perspektif / Cephe / Kuş bakışı / Plan (`1`–`4`)
- **Kalite Çipi**: Etkin geometri kademesini gösterir, künyeyi açar; kademe elle sabitlenebilir ("En yüksek kaliteyi yükle")
- **Hotspot'lar**: Model üzerinde etiketli noktalar; `?edit=hotspot` modunda tıklayarak üretilir ve şemaya uygun JSON verir
- **Ölçüm Aracı**: İki nokta arası mesafe. Fotogrametri çıktıları ölçeksiz olduğu için gerçek mesafe ancak `scan.metersPerUnit` tanımlıysa gösterilir; değilse model birimi gösterilip bir kez kalibre edilebilir
- **Kamera Durumlu Paylaşım**: Bağlantı, o an bakılan kadrajı (`orbit`, `target`, sabitlenmiş kalite) taşır
- **İmzalı Ekran Görüntüsü**: Sahne PNG olarak indirilir, alt köşesine bina adı ve kurum künyesi basılır
- **Kısa Bağlantılar**: `viewer.html?id=<model>`; ayrıntılar üretilen katalogdan okunur, eski uzun adresler desteklenmeye devam eder
- **Kampüs Haritası**: `map.html` — taban görsel yerleşke genel planı modelinin tepeden render'ıdır (çizim değil); yapılar işaretçilerle seçilir, zum/kaydırma vardır, görüntüleyiciyle iki yönlü bağlantılıdır
- **İlerleme Çubuğu**: Yükleme durumu görselleştirmesi
- **Doğrudan Açılış**: Galeriden model seçildiğinde hafif başlangıç sürümü otomatik yüklenir
- **Hata Kurtarma**: Tekrar deneme, indirmeyi iptal etme ve galeriye dönüş seçenekleri
- **Uyarlanabilir AR**: Android WebXR'da düşük model hemen yerleşir; üst kalite yalnızca cihazın üçgen bütçesi ve ölçülen kare hızı izin verirse devreye girer
- **Otomatik Döndürme**: İsteğe bağlı model rotasyonu
- **Kamera Kontrolleri**: Zoom, pan, rotate işlemleri
- **Ortak Model Standardı**: Galerideki her model düşük, orta ve yüksek detaylı KTX2+Meshopt GLB kademelerini kullanır
- **Geometri LOD**: Bütün modeller üç GLB kademesi arasında zooma ve cihaz performansına göre otomatik geçer; üst kademeler ilk görünümden sonra sırayla arka planda indirilir
- **Kaynak Çözünürlüklü High**: En yüksek kademe geometriyi sadeleştirmez ve kaynak dokuların özgün piksel boyutlarını KTX2 kalite 10 ile korur
- **Tam Ekran Modu**: Daha sürükleyici görüntüleme deneyimi
- **Responsive Kontroller**: Mobil ve masaüstü için optimize edilmiş

### 🔧 Teknik Özellikler
- **Model-Viewer v4.3.1 (self-host)**: `assets/vendor/` altında sabitlenmiş sürüm; KTX2/Draco/Meshopt çözücüleri de yereldir, üçüncü taraf CDN'e istek gitmez
- **Babylon.js v9.18.0**: WebXR içinde yerleştirmeyi bozmadan model kademesi değiştiren AR motoru
- **Optimize Kaynak + Fallback**: Sıkıştırılmış kaynak yüklenemezse standart model otomatik denenir
- **KTX2 Texture Compression**: Destekleyen cihazlarda optimize edilmiş yükleme
- **iOS Quick Look**: Otomatik USDZ üretimi; gerektiğinde isteğe bağlı özel USDZ desteği
- **Üretilmiş HDR Ortam**: `tools/build_environment.py` ile üretilen stüdyo HDRI (72 KB, atıf gerektirmez) hem sahnede hem posterlerde kullanılır; cepheler yönlü ışıkla ayrışır
- **Model Başına Render Ayarı**: `render` alanı ile pozlama, gölge yoğunluğu/yumuşaklığı ve ortam haritası
- **Alfa Kanallı Posterler**: Her model aynı ışık ve kadrajla, saydam zeminli AVIF/WebP olarak üretilir; kart arka planı temaya uyar (siyah kutu yok)
- **Turntable Önizleme**: Fare ile kart üzerine gelindiğinde 2 saniyelik alfa kanallı VP9 döngüsü; poster ile aynı açıdan başlar
- **LQIP + İskelet**: Poster yüklenene kadar gömülü bulanık önizleme ve parıltı iskeleti
- **Sayfa Geçişi**: Galeri kartından sahneye View Transitions morph'u (destekleyen tarayıcılarda)
- **Paylaşılan Tasarım Katmanı**: `assets/tokens.css` renk/uzay/hareket/z-index token'larının tek kaynağı; Inter variable self-host edilir
- **İçerik Hash'li Varlıklar**: `?v=<sha256>` damgaları `tools/build_site.py` tarafından üretilir; nginx `/assets` altını `immutable` ile bir yıl önbellekler
- **PWA**: Yüklenebilir uygulama (manifest + maskable ikonlar), çevrimdışı uygulama kabuğu ve "bu binayı çevrimdışı kaydet"
- **İki Katmanlı Service Worker**: Damgalı varlıklar stale-while-revalidate, model kademeleri cache-first + kota tabanlı LRU
- **Çerezsiz Ölçüm**: Olaylar aynı kökendeki `/e` ucuna gider; nginx yalnızca zaman damgası ve sorgu dizesini yazar (IP, user-agent, çerez yok), `tools/report_events.py` özetler

---

## 🎬 Demo

Projeyi yerel olarak çalıştırdıktan sonra:

1. Ana sayfa: `http://localhost/` veya sunucu IP'niz
2. Örnek model: `http://localhost/viewer.html?title=Kütüphane&model=kutuphane/kutuphane/Kutuphane.gltf&poster=assets/posters/kutuphane.webp`

---

## 🏢 Mevcut Modeller

| Model Adı | Klasör | Dosya Formatı | Özellikler |
|-----------|--------|---------------|------------|
| **A-B Blok** | `a_b_blok/` | glTF + .bin | Spor tesisleri ile birleşik yapı |
| **C Blok** | `c_blok/` | KTX2/Meshopt GLB + glTF fallback | 35,02 MB optimize kaynak, kalite doğrulamalı fallback |
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
cd /opt/vr

# Repo Git LFS kullanıyorsa (özellikle .bin/.glb dosyaları):
git lfs install
git lfs pull
```

#### 2. Web Sunucusunu Yapılandırın

Üretimde kullanılan yapılandırma depoda hazırdır: **`deploy/nginx.conf`**
(içerik hash'li varlıklar için `immutable` önbellek, service worker için
`no-cache`, doğru glTF/GLB/WASM MIME türleri, `Referrer-Policy` ve AR için
kamera + `xr-spatial-tracking` izni veren `Permissions-Policy`).

> **Yayın notu — Brotli:** resmî `nginx:alpine` imajında `ngx_brotli` modülü
> yoktur (`nginx -V` ile doğrulanabilir), bu yüzden yalnızca gzip etkindir
> (css/js/json/svg/wasm/gltf). Brotli isteniyorsa brotli ile derlenmiş bir
> imaja geçilmelidir.

> **Yayın notu — tek dosya bağlaması:** `deploy/nginx.conf` container'a tek
> dosya olarak bağlanıyorsa, dosyayı **yerinde** güncelleyin
> (`cat > deploy/nginx.conf`). Dosyayı silip yeniden oluşturan araçlar yeni bir
> inode üretir ve bağlama eski inode'a takılı kaldığı için container değişikliği
> görmez; bu durumda `docker restart <container>` gerekir.

**Asgari Nginx örneği:**

```nginx
server {
    listen 80;
    server_name localhost;
    root /opt/vr;
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
- `I`: Bina bilgisi panelini aç/kapat
- `1`–`4`: Kamera açıları (Perspektif / Cephe / Kuş bakışı / Plan)
- `+` / `−`: Yakınlaştır / uzaklaştır
- `?`: Yardım panelini göster

#### AR Modu
AR özellikli cihazlarda "AR'da Görüntüle" butonu ile modeli gerçek dünyada görüntüleyin. Android Chrome/WebXR'da Babylon motoru düşük kademeyi önce gösterir. Yerleştirmeden sonra tek parmak modeli zeminde taşır; iki parmak modeli ölçeklendirir ve dikey eksende döndürür. Orta/yüksek kademe ancak yerleştirme stabil, kare hızı yeterli ve model cihazın AR üçgen bütçesi içindeyse uygulanır; kare hızı düşerse önceki kalite geri yüklenir. WebXR bulunmayan cihazlarda mevcut model-viewer / Scene Viewer / Quick Look yolu otomatik fallback olarak kullanılır.

### Görüntüleyici Adresi

Galeri bağlantıları modelin kimliğini taşır; ayrıntılar
`assets/models.generated.js` içindeki katalogdan (kaynak: `models.json`) okunur:

```
/viewer.html?id=kutuphane
```

Bu sayede adres kısa kalır, model yolu/poster/boyut tek kaynakta durur ve
bilgi paneli tüm alanlara erişir.

#### Kimlik

| Parametre | Açıklama | Örnek |
|-----------|----------|-------|
| `id` | `models.json` içindeki model kimliği | `id=kutuphane` |

#### Sunum parametreleri (isteğe bağlı, katalogu geçici olarak ezer)

| Parametre | Tip | Varsayılan | Açıklama | Örnek |
|-----------|-----|-----------|----------|-------|
| `orbit` | string | `55deg 65deg auto` | Başlangıç kamera pozisyonu | `orbit=45deg 60deg auto` |
| `exposure` | number | `0.7` | Sahne pozlaması (0-2) | `exposure=0.8` |
| `reveal` | string | `auto` | Yükleme davranışı | `auto`, `interaction`, `manual` |
| `arPlacement` | string | `floor` | AR yerleştirme modu | `floor`, `wall` |
| `arScale` | string | `auto` | AR ölçekleme | `auto`, `fixed` |
| `debug` | flag | - | Teknik tanı katmanını açar | `debug=1` |

#### Eski (uzun) parametreli adresler

Daha önce paylaşılmış bağlantılar çalışmaya devam eder: `id` verilmediğinde
görüntüleyici `title`, `model`, `fallback`, `geomLod`, `poster`, `ios`, `type`,
`description`, `size` ve `fallbackSize` parametrelerini okur. Yeni bağlantılar
için `?id=` tercih edilmelidir.

#### Tam Örnek

```html
<a href="/viewer.html?id=kutuphane&orbit=45deg%2060deg%203m&exposure=0.8">
  Kütüphane Modelini Görüntüle
</a>
```

---

## 📁 Proje Yapısı

```
/opt/vr/
│
├── models.json                 # Model manifesti (tek kaynak)
├── index.html                  # Ana sayfa (manifestten üretilir)
├── viewer.html                 # Ortak 3D görüntüleyici
├── geometry-lod-sw.js         # Arka plan LOD disk önbelleği
├── README.md                   # Bu dosya
├── .gitattributes             # Git LFS yapılandırması
│
├── assets/                     # Paylaşılan varlıklar
│   ├── index.css              # Ana sayfa stilleri
│   ├── index.js               # Ana sayfa arama/filtre
│   ├── viewer.css             # Görüntüleyici stilleri
│   ├── viewer.js              # Görüntüleyici JS mantığı
│   ├── ar-viewer.js           # Babylon WebXR + AR içi kademeli yükleme
│   ├── models.generated.js    # (build) allowlist vb.
│   ├── model-viewer-config.js # yerel KTX2 / Draco / Meshopt çözücü yolları
│   ├── tokens.css             # tasarım token'ları + Inter @font-face
│   ├── analytics.js           # çerezsiz olay gönderimi (/e ucuna)
│   ├── landing.css / landing.js # bina tanıtım sayfası
│   ├── fonts/                 # Inter variable (latin + latin-ext, woff2)
│   ├── env/                   # (build) üretilmiş HDR ortam haritası
│   ├── map/                   # (build) kampüs planı taban görseli + problar
│   ├── map.css / map.js       # kampüs haritası arayüzü
│   ├── posters.lqip.css       # (build) kart bulanık önizlemeleri
│   ├── vendor/                # Pinli çalışma zamanları
│   │   ├── babylon-9.18.0/    # AR motoru + KTX2/meshopt çözücüleri
│   │   ├── model-viewer-4.3.1/# model-viewer + basis/draco çözücüleri
│   │   └── meshoptimizer-0.18.1/
│   └── posters/               # (build) poster görselleri
│
├── tools/                      # Yardımcı araçlar
│   ├── build_site.py          # index/redirect/poster üretimi
│   ├── build_geometry_lods.py # üç kademeli geometri+doku GLB üretimi
│   ├── build_posters.mjs      # alfa kanallı poster + AVIF + LQIP üretimi
│   ├── build_turntables.mjs   # hover turntable döngüleri (VP9/WebM)
│   ├── build_environment.py   # stüdyo HDR ortam haritası üretimi
│   ├── build_map.mjs          # kampüs planı taban görseli (tepeden render)
│   ├── locate_models.py       # binaların plan üzerindeki konumunu ölçer
│   ├── report_events.py       # kullanım ölçümü günlüğü özeti
│   ├── poster-render.html     # poster/turntable render koşumu
│   ├── package.json           # playwright (yalnızca üretim araçları için)
│   ├── optimize_models.py     # manifestten gltf -> glb optimizasyonu
│   ├── optimize_models.sh     # (wrapper) optimize_models.py
│   ├── report_sizes.py        # Boyut raporu
│   └── models.schema.json     # Manifest şeması (v2)
│   └── bin/
│       ├── gltfpack           # glTF optimizasyon aracı
│       └── gltfpack-ubuntu.zip
│
├── a_b_blok/                   # A-B Blok modeli
│   ├── a_b_blok/
│   │   ├── *.gltf             # glTF model dosyası
│   │   ├── *.bin              # Binary geometri/animasyon
│   │   └── *.jpeg             # Texture dosyaları
│   └── index.html             # (build) bina tanıtım sayfası (OG + JSON-LD)
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
- **`.hdr`**: Radiance RGBE ortam haritası (IBL)
- **`.webm`**: Alfa kanallı VP9 turntable döngüsü

---

## 🔧 Teknik Detaylar

### Kullanılan Teknolojiler

- **[Model Viewer](https://modelviewer.dev/)** v4.3.1 - Google'ın 3D model görüntüleyici kütüphanesi
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
- **Ortak GLB Standardı**: Bütün modeller ilk açılışta hafif GLB ile başlar; orta ve tam ayrıntı arka planda önbelleğe alınır, zoomda hazır kademeye geçilir
- **AR Geometry LOD**: WebXR oturumunda yerleştirme kökü korunarak düşük → orta → yüksek GLB geçişi yapılır
- **Bellek Kontrolü**: Uzaklaşınca ağır kademe bırakılır; model önbelleği tek kademe ile sınırlandırılır
- **Arka Plan Önbelleği**: Üst model kademeleri RAM yerine Cache Storage alanında tutulur (HTTPS veya localhost gerekir)
- **Veri Tasarrufu**: `Save-Data` veya 2G bağlantıda yüksek çözünürlük katmanı devre dışı kalır
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
cd /opt/vr

# glTF dosyalarını GLB formatına dönüştür ve optimize et
./tools/optimize_models.sh

# Büyük modeller için düşük/orta/yüksek geometri+doku GLB kademeleri üret
python3 tools/build_geometry_lods.py

python3 tools/build_site.py
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

### Kampüs Haritası

Harita **çizilmez**: taban görsel, yerleşke genel planı modelinin tepeden
render'ıdır, yani gerçek taramadan gelir. İşaretçi konumları `models.json`
içindeki `map: { x, y }` alanındadır ve görselin 0–1 normalize uzayındadır.

```bash
# Taban görsel (yüksek kademe, ~6 derece eğimli plan görünümü)
node tools/build_map.mjs

# Binaların plan üzerindeki konumunu ÖLÇEREK bul
node tools/build_map.mjs --model=kutuphane --tier=low --width=900 --name=probe-kutuphane --phi=2deg
python3 tools/locate_models.py            # skorları göster
python3 tools/locate_models.py --write     # eşiği geçenleri models.json'a yaz

python3 tools/build_site.py
```

`locate_models.py`, bina modelinin tepeden render'ını plan görselinin içinde
ölçek ve dönüş tarayarak arar (normalize çapraz korelasyon). Şablon varsayılan
olarak **merkezden %60 kırpılır**: modelin kendi tarama sınırı (düzensiz plaka
kenarı) planda bulunmadığı için korelasyonu bozuyordu; kırpma skorları belirgin
yükseltir (ör. F Blok 0,26 → 0,43). Eşiğin altında kalan model
**yerleştirilmez** — yanlış işaretçi, işaretçi olmamasından kötüdür. Otomatik bulunan konumlar `confirmed: false` ile yazılır ve haritada
kesikli işaretçi + `?` ile gösterilir.

Konumu elle düzeltmek veya eklemek için:

```
https://vr.perinet.org/map.html?edit=map
```

Listeden yapıyı seçip plan üzerinde doğru noktaya tıklayın; panel
`models.json`'a yapıştırılacak JSON'u verir (`confirmed: true`).

### Arama Motoru ve Paylaşım

Her model için `/<model>/` altında statik bir **tanıtım sayfası** üretilir:
modele özel `og:image` (poster), açıklama, canonical, schema.org işaretlemesi
(`Place` + `3DModel` + `BreadcrumbList`), birimler, konum + yol tarifi, model
künyesi ve kaynaklar. Görüntüleyici tek sayfa olduğu için modele özel paylaşım
önizlemesi ancak burada verilebilir. `sitemap.xml` de build sırasında üretilir.

> **İndeksleme şu anda KAPALI ve bu depodan değil.** Ön vekil (openresty)
> `X-Robots-Tag: noindex, nofollow, noarchive` başlığı gönderiyor ve kendi
> `robots.txt` dosyasını `Disallow: /` ile servis ediyor. Bu bilinçli bir
> karar olabilir; açmak isteniyorsa **vekil yapılandırması** değiştirilmelidir
> (bu depodaki dosyalar bu başlığı ezemez). Sitemap ve işaretlemeler o gün
> için hazır bekler. Sosyal paylaşım önizlemeleri (OG/Twitter) bu başlıktan
> etkilenmez.

### Kullanım Ölçümü

Olaylar aynı kökendeki `/e` ucuna `navigator.sendBeacon` ile gönderilir.
nginx bu adrese 204 döner ve **yalnızca** zaman damgası ile sorgu dizesini
günlüğe yazar (`oku_events` biçimi): IP, user-agent, referrer ve çerez
kaydedilmez. Tarayıcı "Do Not Track" gönderiyorsa veya
`localStorage['analytics-opt-out'] = '1'` ise hiç ölçüm yapılmaz.

```bash
# Son 24 saatin özeti
docker logs --since 24h personal-web 2>&1 | python3 tools/report_events.py

# Dosyadan
python3 tools/report_events.py events.log --since-hours 6
```

Ölçülen olaylar: `model_open`, `load_complete` (süre/boyut), `load_abandoned`
(yüzde), `tier_reached`, `ar_available`, `ar_entered`, `ar_placed`,
`offline_saved`, `snapshot`, `share`, `error`.

> Günlük satırları container'ın standart çıktısına gider; kalıcı saklama
> gerekirse `access_log` için bir volume bağlanmalıdır.

### Hotspot ve Ölçek Üretimi

Hotspot konumları ve model ölçeği tahminle yazılmaz, sahnede üretilir:

```
https://vr.perinet.org/viewer.html?id=<model>&edit=hotspot
```

Modele tıklayın, etiketi yazın; panel `models.json` içindeki `hotspots`
alanına yapıştırılabilecek şemaya uygun JSON üretir.

Ölçüm aracı için: **Diğer → Ölçüm** ile iki nokta seçin. Model ölçeği tanımlı
değilse sonuç "model birimi" olarak gösterilir ve **Ölçeği kalibre et** ile
bilinen bir uzunluk girilebilir. Değer bu tarayıcıda saklanır; kalıcı olması
için gösterilen `scan.metersPerUnit` değerini `models.json`'a ekleyin.

### Görsel Varlık Üretimi (poster · turntable · HDR)

Posterler ve turntable döngüleri **sitenin kendi renderer'ı** (model-viewer)
ile üretilir; böylece önizleme ile sahne arasında ışık/ton farkı oluşmaz.
Blender veya harici bir render zinciri gerekmez.

```bash
# Tek seferlik: üretim araçlarının tarayıcısı
cd tools && npm install && npx playwright install chromium && cd ..

# Stüdyo HDR ortamı (yalnızca ayar değişirse yeniden üretilir)
python3 tools/build_environment.py

# Posterler: 1600x1000 alfa kanallı WebP + AVIF + LQIP
node tools/build_posters.mjs                    # tümü
node tools/build_posters.mjs kutuphane          # tek model
node tools/build_posters.mjs --exposure=1.1     # pozlama denemesi

# Turntable döngüleri (poster açısından başlar, ~2 sn)
node tools/build_turntables.mjs
node tools/build_turntables.mjs --crf=44        # daha küçük dosya

# Kartları/katalogu tazele
python3 tools/build_site.py
```

Poster hattı kadrajı otomatik ayarlar: model kareye taşarsa daha uzak bir
yarıçapla yeniden dener, ardından saydam kenarları kırpıp hedef orana
yerleştirir. Bu yüzden fotogrametri modellerinin geniş zemin plakası
kadrajı bozmaz.

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
<a href="/viewer.html?title=C%20Blok&amp;model=c_blok/c_blok/C%20Blok%20lab_ktx2.glb&amp;fallback=c_blok/c_blok/C%20Blok%20lab.gltf">
  C Blok modelini aç
</a>
```

### Optimizasyon Karşılaştırması

| C Blok kaynağı | Dosya Boyutu | Kullanım |
|----------------|--------------|----------|
| Orijinal glTF ve bağımlılıkları | 96,34 MB | Otomatik fallback |
| KTX2 + Meshopt GLB | 35,02 MB | Birincil kaynak |

Optimize kaynak yaklaşık %64 daha küçüktür. Geometri, doku ve sabit kamera görsel kontrolü tamamlanmıştır.

---

## 💻 Geliştirme

### Yeni Model Ekleme

1. Model klasörü oluşturun:

```bash
mkdir -p /opt/vr/yeni_bina/yeni_bina
```

2. Model dosyalarını kopyalayın:

```bash
cp model.gltf model.bin *.jpg /opt/vr/yeni_bina/yeni_bina/
```

3. `models.json` içine yeni model ekleyin (`category` zorunludur):

```json
{
  "id": "yeni_bina",
  "title": "Yeni Bina",
  "label": "Yeni Bina",
  "emoji": "🏢",
  "category": "egitim",
  "model": "yeni_bina/yeni_bina/model.geometry-lod/low.glb",
  "fallback": "yeni_bina/yeni_bina/model.gltf",
  "geometryLod": "yeni_bina/yeni_bina/model.geometry-lod.json",
  "poster": "assets/posters/yeni_bina.webp",
  "type": "Eğitim bloğu",
  "description": "Yeni bina yapısını farklı açılardan inceleyin.",
  "keywords": ["Yeni", "Bina"]
}
```

Geçerli `category` değerleri: `egitim` · `yonetim` · `sosyal` · `uygulama` · `plan`.

Bina bilgisi panelini besleyen isteğe bağlı alanlar (`officialName`,
`campusZone`, `facts`, `units`, `accessibility`, `geo`, `scan`) için
**[BINA_BILGI_FORMU.md](BINA_BILGI_FORMU.md)** dosyasındaki şablonu kullanın.
Bu alanlar yalnızca kurumdan teyitli bilgiyle doldurulur; boş bırakılan alan
arayüzde gösterilmez.

4. Doğrulayın ve sayfaları yeniden üretin:

```bash
python3 tools/doctor.py        # şema + varlık + içerik boşluk kontrolü
python3 tools/build_site.py    # katalog, index.html, yönlendirmeler, damgalar
python3 tools/build_site.py --check   # damga tazeliği (CI için; çıkış 3 = bayat)
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
4. Kontrollü yükleme için gerçek poster ve boyut bilgisi ekleyin
5. KTX2 compression kullanın

### AR Çalışmıyor

**Sorun**: AR butonu görünmüyor veya çalışmıyor

**Çözümler**:
- **Android Chrome**: WebXR destekli cihaz gerekli (ARCore)
- **iOS Safari**: Quick Look otomatik USDZ üretimini kullanabilir; özel sonuç gerekiyorsa `ios` parametresiyle USDZ ekleyin
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
- [x] Modellerden üretilmiş gerçek WebP posterler
- [ ] Gereksinim olan modeller için özel USDZ sürümleri

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
