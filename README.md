# OKÜ Dijital Yerleşke

Osmaniye Korkut Ata Üniversitesi Karacaoğlan Yerleşkesi'nin fotogrametri
taramalarından üretilmiş etkileşimli 3B modelleri: galeri, kampüs haritası,
yapı tanıtım sayfaları ve WebXR destekli artırılmış gerçeklik. Türkçe ve
İngilizce.

**Canlı:** [vr.perinet.org](https://vr.perinet.org/) ·
[English](https://vr.perinet.org/en/) ·
[Yerleşkenin tamamı (3B)](https://vr.perinet.org/viewer.html?id=oku_genel_plan)

[![CI](https://github.com/elestirmen/3d_models_vr/actions/workflows/ci.yml/badge.svg)](https://github.com/elestirmen/3d_models_vr/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## İçindekiler

- [Özellikler](#özellikler)
- [Hızlı başlangıç](#hızlı-başlangıç)
- [Proje yapısı](#proje-yapısı)
- [Yeni yapı ekleme](#yeni-yapı-ekleme)
- [Üretim araçları](#üretim-araçları)
- [Mimari](#mimari)
- [Görüntüleyici adresi](#görüntüleyici-adresi)
- [Yayın](#yayın)
- [Test ve CI](#test-ve-ci)
- [Gizlilik ve kullanım ölçümü](#gizlilik-ve-kullanım-ölçümü)
- [Sorun giderme](#sorun-giderme)

---

## Özellikler

**Keşif**
- Galeri: Türkçe/İngilizce, aksan duyarsız çok sözcüklü arama (birim adları
  dahil; Türkçe sayfada "library", İngilizce sayfada "kütüphane" de bulur),
  kategori filtresi, sıralama, kart/liste görünümü. Durum adreste tutulur
  (`/?q=blok&category=egitim&sort=size&view=list`), geri tuşu çalışır.
- Kampüs haritası: taban görsel, yerleşke genel planı modelinin tepeden
  render'ıdır (çizim değil). Bina konumları görüntü eşleştirmesiyle ölçülüp
  teyit edildi. Masaüstünde yapı listesi + panel, mobilde alt sayfa.
- Her yapının paylaşılabilir tanıtım sayfası (`/<yapı>/`, `/en/<yapı>/`):
  yapıya özel paylaşım kartı, schema.org (Place + 3DModel + BreadcrumbList),
  konum kesiti, model künyesi, birimler, kaynaklar.

**3B görüntüleyici**
- Üç geometri kademesi (hafif / orta / yüksek, KTX2 + Meshopt): hafif sürüm
  saniyeler içinde açılır, yakınlaştıkça ayrıntı arka planda gelir; veri
  tasarrufu ve yavaş bağlantıda kendiliğinden indirme yapılmaz.
- Kamera açıları, sinematik açılış ve **sinematik tur**, ölçüm aracı, imzalı
  ekran görüntüsü, kadrajı taşıyan paylaşım bağlantısı ve **QR kodu**
  (masaüstünden telefona — ve AR'a — geçişin en kısa yolu).
- **Yerleşke modeli:** genel planda 8 yapı etiketi. Konumlar tahmin değil;
  haritayı üreten kamera yeniden kurulup teyitli harita noktalarından modele
  ışın atılarak ölçüldü. Etikete dokununca yapının kendi modeline geçilir;
  **yerleşke turu** yapıları yakın komşu sırasıyla gezer (`?tour=loop` sergi
  ekranı için sonsuz döngü).
- AR: Android'de Babylon.js WebXR (AR içinde kademe yükseltme, kare hızı
  izlenir), diğer cihazlarda Scene Viewer / Quick Look. Babylon motoru
  (~1,8 MB) yalnızca AR'a dokunulduğunda iner.
- Bilgi paneli masaüstünde modeli kapatmadan yanda açılır; yalnızca kaynaklı
  bilgi gösterilir (eksik alan uydurulmaz).

**Kalite**
- Erişilebilirlik: axe-core ile ciddi/kritik ihlal sıfır (açık/koyu tema,
  masaüstü/mobil); bütün denetimlerin erişilebilir adı var; klavye
  kısayolları; `prefers-reduced-motion`.
- Tasarım sistemi: token'lar (kontrast WCAG AA ölçülerek seçildi), açık/koyu
  tema boyamadan önce uygulanır, 12 px altı yazı yok.
- Performans: galeri ilk yükü ~384 KB (sıkıştırmasız); Türkçe yazı tipi alt
  kümesi 3 KB; 480/800/1600 px poster türevleri; içerik damgalı, bir yıl
  önbelleklenen varlıklar.
- PWA ve çevrimdışı: dil başına uygulama kabuğu; bir yapıyı bütün kademeleri
  ve motoruyla cihaza kaydetme; kısmi kayıt asla "kaydedildi" görünmez.
- Üçüncü taraf istek yok: model-viewer, çözücüler, Babylon ve yazı tipleri
  self-host; sıkı CSP.

---

## Hızlı başlangıç

```bash
git clone git@github.com:elestirmen/3d_models_vr.git
cd 3d_models_vr
git lfs install && git lfs pull          # modeller Git LFS'te (~1 GB)

cd tools && npm ci && npx playwright install chromium && cd ..
make serve                               # yerel önizleme (boş bir port seçer)
```

Gereksinimler: Python 3.10+ ve `jinja2` (`apt install python3-jinja2`),
Node 20+, ImageMagick 7 (yalnızca görsel üretim araçları için).

| Görev | Ne yapar |
|---|---|
| `make build` | Sayfaları (TR + EN), katalogu, manifestleri ve varlık damgalarını üretir |
| `make check` | doctor + sözdizimi + QR doğrulaması + üretim tazeliği + duman testi |
| `make smoke` | Yalnızca tarayıcı duman testi (erişilebilirlik dahil) |
| `make serve` | Yerel önizleme sunucusu |
| `make help` | Bütün görevler |

> **Not:** Canlı sunucuda yayın kökü bu çalışma ağacının kendisidir; kaydedilen
> her dosya anında yayındadır. Geliştirme için ayrı bir çalışma kopyası
> kullanın: `git worktree add ../vr-dev -b <dal>`.

---

## Proje yapısı

```
models.json                 Model manifesti — tek kaynak (şema: tools/models.schema.json)
src/
  templates/                Jinja2 sayfa şablonları (_base, home, viewer, map, landing)
  locales/tr.json, en.json  Arayüz metinleri (anahtar kümeleri eşit olmalı)
assets/
  css/                      tokens.css (tasarım token'ları) · base.css (bileşenler) · sayfa stilleri
  js/
    boot.js                 Boyamadan önce tema (klasik betik)
    core/                   i18n.js, site.js (adresler, depolama, tema, dil, ölçüm, SW)
    home.js map.js landing.js
    viewer/                 main.js, lod.js, offline.js, info.js, measure.js, share.js,
                            qr.js, tour.js, ar.js, snapshot.js, editor.js, ar-babylon.js
    catalog.js              (üretilir) görüntüleyici ve haritanın okuduğu katalog
  icons.svg                 İkon sprite'ı
  posters/                  (üretilir) alfa kanallı posterler, türevler, turntable döngüleri
  og/                       (üretilir) paylaşım kartları, yapı × dil
  map/                      (üretilir) kampüs planı, yerleşke etiketleri, konum kesitleri
  fonts/ env/ icons/ vendor/
index.html map.html viewer.html <yapı>/index.html     (üretilir) Türkçe
en/…                                                   (üretilir) İngilizce
geometry-lod-sw.js          Service worker (kabuk listesi build'de üretilir)
deploy/nginx.conf           Üretim nginx yapılandırması
tools/                      Üretim, doğrulama ve test araçları
<yapı>/<yapı>/…             Model kaynakları ve *.geometry-lod/ kademeleri (Git LFS)
```

Üretilen dosyalar elle düzenlenmez: kaynak `models.json`, `src/` ve
`assets/css|js` altındadır; `make build` gerisini üretir, `make check`
bayat kalan dosyayı yakalar.

---

## Yeni yapı ekleme

1. Model klasörünü ekleyin ve geometri kademelerini üretin:
   ```bash
   python3 tools/build_geometry_lods.py      # low / medium / high GLB + rapor
   ```
2. `models.json`'a kaydı ekleyin (`category`: `egitim | yonetim | sosyal | uygulama | plan`):
   ```json
   {
     "id": "yeni_bina",
     "title": "Yeni Bina", "label": "Yeni Bina", "emoji": "🏢",
     "category": "egitim",
     "model": "yeni_bina/yeni_bina/Model.geometry-lod/low.glb",
     "fallback": "yeni_bina/yeni_bina/Model.gltf",
     "geometryLod": "yeni_bina/yeni_bina/Model.geometry-lod.json",
     "poster": "assets/posters/yeni_bina.webp",
     "type": "Eğitim bloğu",
     "description": "Yeni binayı farklı açılardan inceleyin.",
     "i18n": { "en": { "title": "New Building", "label": "New Building",
                       "type": "Teaching block", "description": "Explore the new building from every angle." } }
   }
   ```
   Bina bilgisi alanları (`officialName`, `campusZone`, `facts`, `units`,
   `accessibility`, `geo`, `scan`, `sources`) yalnızca kaynaklı bilgiyle
   doldurulur; şablon: [BINA_BILGI_FORMU.md](BINA_BILGI_FORMU.md).
3. Görselleri üretin, gerekiyorsa haritaya yerleştirin, siteyi kurun:
   ```bash
   node tools/build_posters.mjs yeni_bina      # poster + türevler + LQIP
   node tools/build_turntables.mjs yeni_bina   # isteğe bağlı hover döngüsü
   # Harita konumu: map.html?edit=map ile tıklayıp JSON'u models.json → map alanına ekleyin
   make hotspots crops                          # yerleşke etiketleri + konum kesitleri
   node tools/build_brand.mjs                   # paylaşım kartları
   make build && make check
   ```

---

## Üretim araçları

| Araç | Çıktı | Ne zaman |
|---|---|---|
| `tools/build_site.py` | Bütün sayfalar, katalog, manifestler, sitemap, SW kabuğu | Her içerik/kod değişikliğinde (`make build`) |
| `tools/build_geometry_lods.py` | Üç GLB kademesi + gltfpack raporları | Yeni/yenilenen model |
| `tools/build_posters.mjs` | Alfa kanallı poster (AVIF/WebP, 480/800/1600 px) + LQIP | Model ya da ışık değişince |
| `tools/build_turntables.mjs` | Hover döngüleri (alfa kanallı VP9) | İsteğe bağlı |
| `tools/build_map.mjs` | Kampüs planı taban görseli (tepeden render) | Genel plan modeli değişince |
| `tools/locate_models.py` | Binaların plan üzerindeki konumu (normalize çapraz korelasyon) | Yeni bina |
| `tools/build_campus_hotspots.mjs` | Genel plan modelindeki yapı etiketleri (ışın testi) | Harita konumu ya da plan değişince |
| `tools/build_map_crops.py` | Tanıtım sayfası konum kesitleri, harita önizleme türevi | Harita konumu değişince |
| `tools/build_brand.mjs` | Favicon, uygulama ikonları, paylaşım kartları | Marka ya da metin değişince |
| `tools/build_environment.py` | Stüdyo HDR ortam haritası | Işık ayarı değişince |
| `tools/doctor.py` · `report_sizes.py` · `report_events.py` | Manifest/varlık denetimi, boyut ve kullanım raporları | İhtiyaç olunca |

Render araçları sitenin kendi model-viewer'ını kullanır; poster ile sahne
arasında ışık ve ton farkı oluşmaz.

---

## Mimari

**Tek kaynak, iki dil.** `build_site.py`, `models.json` + `src/locales` +
`src/templates` girdilerinden Türkçe sayfaları köke, İngilizceleri `/en/`
altına üretir. Arayüz metinleri sayfaya `<script type="application/json"
id="oku-i18n">` olarak gömülür (ek istek yok); model içerikleri
`models.json → i18n.en` alanından gelir. Eksik çeviri anahtarı build'i durdurur.

**İçerik damgalı varlıklar.** `/assets` altındaki her dosya `?v=<sha256[:10]>`
ile istenir ve bir yıl `immutable` önbelleklenir. ES modüllerinin göreli
import'ları da damgalanır; bağımlılık grafiği yapraktan köke işlendiği için
bir modül değişince onu içe aktaran modüllerin adresi de değişir.
`--check` bellekte yeniden üretip diskle karşılaştırır (bayat dosya: çıkış 3).

**Görüntüleyici.** `viewer/main.js` adres ve katalogdan modeli çözer;
`lod.js` kademeleri yakınlığa göre değiştirir (geçişte son kare poster
olarak tutulur, kamera korunur); `tour.js` turu kademe geçişleriyle
eşgüdümlü yürütür (uçuş sırasında kademe kararı bekler); `offline.js`
kaydı doğrular; `ar.js` + `ar-babylon.js` AR'ı yönetir.

**Service worker.** Gezinme ağ öncelikli; çevrimdışıyken kayıtlı sayfa ya da
ziyaretçinin dilindeki ana sayfa. Damgalı varlıklar önbellek öncelikli;
model kademeleri önbellek öncelikli + kota/LRU bakımı. İstenen poster boyutu
çevrimdışı yoksa aynı posterin kayıtlı başka bir boyutu verilir.

---

## Görüntüleyici adresi

```
/viewer.html?id=kutuphane          Türkçe
/en/viewer.html?id=kutuphane       İngilizce
```

| Parametre | Örnek | Açıklama |
|---|---|---|
| `id` | `kutuphane` | `models.json` kimliği |
| `orbit`, `target` | `0.96rad 1.13rad 4.2m` | Paylaşılan kadraj (Paylaş penceresi üretir) |
| `quality` | `high` | Kaliteyi sabitler (`low`, `medium`, `high`) |
| `tour` | `1`, `loop` | Açılışta turu başlatır; `loop` sonsuz döngü |
| `kiosk` | `1` | Sergi ekranı: denetimler gizlenir, tur döngüde oynar, dokunmadan 20 sn sonra sürer |
| `exposure` | `0.9` | Sahne pozlaması (0–2) |
| `arPlacement`, `arScale` | `wall`, `fixed` | AR yerleştirme davranışı |
| `edit` | `hotspot` | Hotspot yazma modu (JSON üretir) |

Harita: `map.html?focus=<id>` yapıyı seçili açar, `map.html?edit=map`
yerleştirme modudur. Eski uzun parametreli adresler (`?model=…&title=…`)
çalışmaya devam eder.

---

## Yayın

Site `personal-web` (nginx:alpine) konteynerinden sunulur; yayın kökü bu
dizinin kendisidir, yapılandırma `deploy/nginx.conf`'tur:

- HTML: `no-cache, no-transform` — `no-transform`, Cloudflare'in otomatik
  Web Analytics betiğini enjekte etmesini engeller (CSP'ye takılıp her
  sayfada konsol hatası üretiyordu).
- `/assets` damgalı betik/stil/yazı tipi: bir yıl `immutable`; görseller 30 gün;
  model kademeleri 7 gün.
- Bütün yanıtlarda güvenlik başlıkları (X-Frame-Options, COOP,
  Referrer-Policy, Permissions-Policy — AR için kamera/XR izni).
- `src/`, `tools/`, `deploy/`, `*.md`, `*.py`, `Makefile`, nokta dosyaları
  yayınlanmaz.

Yapılandırma konteynere **tek dosya** bağlıdır: dosyayı yerinde güncelleyin
(`cat yeni.conf > deploy/nginx.conf`), sonra `make reload`.

> **İndeksleme bilinçli olarak kapalı (karar: 1 Ekim 2026).** Ön vekil
> `X-Robots-Tag: noindex, nofollow, noarchive` gönderiyor ve `Disallow: /`
> içeren bir `robots.txt` sunuyor; bu korunur, depoya `robots.txt` eklenmez.
> Sitemap ve yapılandırılmış veri yine üretilir (ileride açılırsa hazır).
> WhatsApp önizlemesi gönderenin cihazında oluştuğu için etkilenmez;
> `robots.txt`'ye uyan önizleme botları (ör. X) kart göstermeyebilir.

---

## Test ve CI

`make check` sırasıyla: manifest/şema ve varlık denetimi, JS/Python/JSON
sözdizimi, build betiğinin birim testleri (modül damgaları, döngü tespiti,
CSS url(), LFS boyutu), QR üreticisinin bağımsız bir çözücüyle (jsQR) doğrulanması,
üretim tazeliği ve gerçek Chromium'da duman testi (76 kontrol):

- Galeri: arama (Türkçe karakter/İngilizce ad/birim), filtre, sıralama,
  adres durumu, geri tuşu, tema, 320–1280 px taşma, aktarım bütçesi (450 KB).
- Harita, tanıtım sayfası (JSON-LD, hreflang), İngilizce sayfalar.
- Görüntüleyici: model yükleme, veri tasarrufu, kamera açıları, paylaşım/QR,
  tur, kipsiz bilgi paneli, çevrimdışı kayıt (kota hatası + internetsiz açılış),
  mobil araç çubuğunun tek satır kalması, yerleşke etiketleri.
- axe-core: bütün sayfa türlerinde ciddi/kritik erişilebilirlik ihlali yok.
- Üçüncü taraf istek, CSP ihlali, başarısız istek ve konsol hatası yok.

Birkaç kontrol bu projede canlıya çıkmış regresyonların birebir testidir:
kapalı `<dialog>`'ların görünmesi, kırpılan "Diğer" menüsü, sürüklemeden
sonra tıklanamayan harita işaretçileri ve mobilde dar bir sütuna sıkışan
araç çubuğu.

CI (`.github/workflows/ci.yml`) aynı adımları koşar. Modeller Git LFS'te
olduğu için yalnızca en küçük model indirilir; diğer 3B adımları kendiliğinden
atlanır. Boyutlar LFS işaretçisinden okunduğu için tazelik denetimi CI'da da
kesindir.

---

## Gizlilik ve kullanım ölçümü

Çerez yok. Olaylar aynı kökendeki `/e` ucuna `sendBeacon` ile gider; nginx
yalnızca zaman damgası ile sorgu dizesini yazar (IP, user-agent, referrer
kaydedilmez). Do Not Track ya da `localStorage['analytics-opt-out'] = '1'`
varsa hiç ölçüm yapılmaz; çevrimdışıyken gönderilmez.

```bash
docker logs --since 24h personal-web 2>&1 | python3 tools/report_events.py
```

---

## Sorun giderme

| Belirti | Neden / çözüm |
|---|---|
| Model açılmıyor, "Git LFS" uyarısı | `git lfs pull` |
| `file://` ile açınca hata | Yerel sunucu kullanın: `make serve` |
| Değişiklik görünmüyor | `make build` çalıştırın; tarayıcıda service worker'ı yenileyin |
| `make check` "BAYAT" diyor | Kaynak değişmiş ama `make build` çalıştırılmamış |
| AR düğmesi soluk | Cihaz/tarayıcı AR desteklemiyor; düğmeye dokununca nedeni yazılır |

---

## Lisans

Kod MIT ([LICENSE](LICENSE)). Inter yazı tipi SIL OFL 1.1, model-viewer ve
Babylon.js Apache-2.0, meshoptimizer MIT (lisans dosyaları `assets/` altında).
Model ve görsel içerikler MIT lisansının kapsamında değildir.
