# OKÜ Dijital Yerleşke — Premium Yükseltme Planı

**Tarih:** 4 Eylül 2026
**Proje:** `/opt/vr` · [vr.perinet.org](https://vr.perinet.org/)
**Kapsam:** UI/görsel dil + işlevsellik + performans/teslim mimarisi
**Durum:** Faz 0–3 uygulandı (4–5 Eylül 2026); bina/hotspot içeriği kurumsal teyit bekliyor, Faz 4 plan aşamasında.
**İlgili belge:** `UI_UX_INCELEME_RAPORU.md` (23 Tem 2026) — o rapordaki Aşama 1–3 maddelerinin büyük bölümü uygulandı; bu plan oradan sonrasını tanımlar.

---

## 0. Yönetici özeti

Proje teknik olarak artık "iyi bir 3B galeri" seviyesinde: tek `viewer.html`, `models.json` tek kaynak, üç kademeli geometri LOD, zoom'a duyarlı otomatik kademe geçişi, Babylon.js ile WebXR AR, service worker önbelleği, onaylı indirme akışı, gerçek WebP posterler, CSP ve nginx MIME/cache yapılandırması mevcut.

Premium olmayan tarafı ise **ürün** tarafı: site hâlâ "dosya listesi" mantığıyla çalışıyor. Kullanıcı bir bina seçiyor, döndürüyor, çıkıyor. Bina hakkında bilgi yok, kampüs bağlamı yok, ölçüm/işaretleme yok, kaydedilebilir bir görünüm yok, dil seçeneği yok, kurumsal görsel imza yok.

Premium algısını en çok yükseltecek beş şey:

| # | Konu | Neden premium |
|---|---|---|
| 1 | **Kampüs haritası merkezli keşif** (genel plan = ana ekran, binalar tıklanabilir) | Galeri yerine "dijital ikiz" hissi verir |
| 2 | **Bina bilgi katmanı** (birimler, kat sayısı, alan, yol tarifi, foto/tur) | 3B modeli veriye bağlar; kurumsal değer üretir |
| 3 | **Görüntüleyici araç seti** (hotspot, ölçüm, kamera presetleri, kesit, ekran görüntüsü, kamera durumlu paylaşım) | "Oyuncak" değil "araç" algısı |
| 4 | **Görsel dil ve hareket disiplini** (tipografi, poster sistemi, View Transitions, sinematik açılış) | İlk 3 saniyedeki kalite algısı buradan gelir |
| 5 | **Bağımsız teslim** (model-viewer/meshopt self-host, hash'li varlıklar, Brotli, PWA) | Hız + gizlilik + CDN kesintisine dayanıklılık |

---

## 1. Mevcut durum envanteri

### 1.1 Ölçülen veriler

| Ölçüm | Değer |
|---|---:|
| Model sayısı | 10 |
| `low` kademe toplamı (galeriden ilk açılan) | **18,7 MB** (ort. 1,9 MB) |
| `medium` kademe toplamı | 64,5 MB |
| `high` kademe toplamı | 320,6 MB (en büyük: A‑B Blok 39,2 MB) |
| Kaynak `.bin` toplamı | 348,4 MB |
| Kaynak JPEG dokular | ~560,9 MB |
| Depo boyutu (LFS dahil) | **3,4 GB** |
| `tools/doctor.py` | ✅ `OK: critical assets present` / `OK: manifest looks consistent` |

İlk açılış maliyeti artık makul (1–6 MB). Sorun boyut değil, **deneyimin derinliği**.

### 1.2 Teknik tespitler (kod seviyesinde)

| # | Tespit | Konum | Etki |
|---|---|---|---|
| | *(✅ = Faz 0'da giderildi, ◑ = kısmen)* | | |
| T1 ✅ | `model-viewer` 4.3.1, 3 polyfill ve meshopt decoder **unpkg CDN'den** çekiliyor; Babylon ise self-host | `viewer.html:18-26`, `assets/model-viewer-config.js:2` | CDN kesintisinde görüntüleyici tamamen çalışmaz; üçüncü taraf IP/UA sızıntısı; CSP `unsafe-eval` gerekliliği |
| T2 ✅ | **Doku LOD boru hattı ölü kod**: `viewer.js` içinde ~240 satırlık doku yükseltme mantığı ve 5 model için üretilmiş `.lod/high/*.webp` piramitleri var, ama `models.json`'da hiçbir modelde `textureLod` alanı yok | `assets/viewer.js:722-960`, `d_blok/e_blok/f_blok/ilahiyat/fabrika` `.lod/` | Bakım yükü, kafa karışıklığı, boşa giden disk; ya bağlanmalı ya kaldırılmalı |
| T3 ✅ | `"Inter"` font ailesi CSS'te tanımlı ama **hiçbir yerde yüklenmiyor** | `assets/index.css:34`, `assets/viewer.css:20,111,481` | Tipografi sistem fontuna düşüyor; premium algının en kolay kazanımı kaçıyor |
| T4 ✅ | Posterler tek çekim, **siyah arka plan baskılı**, zemin plakası keskin kesik | `assets/posters/*.webp` (1200×675) | Açık temada kartların içinde siyah dikdörtgen; kartlar arası çerçeveleme tutarsız |
| T5 ◑ | Her blok klasöründe şablon artığı dosyalar: `demo-styles.css`, `responsive.css`, `README.md`, `CONTRIBUTING.md`, `LICENSE`, `.gitignore` + `index.html`/`responsive.html` ikisi de aynı meta-refresh yönlendirmesi | 9 klasör × 8 dosya | Depo kirliliği; yönlendirme sayfaları OG/SEO fırsatını harcıyor |
| T6 | `robots.txt`, `sitemap.xml`, `manifest.webmanifest` **yok**; JSON‑LD yok; OG görseli tüm modeller için aynı | kök dizin, `index.html:16` | Paylaşımda ve aramada kurumsal görünürlük kaybı |
| T7 ✅ | Service worker sadece `viewer.js` içinden kayıt ediliyor ve yalnızca LOD/doku isteklerini önbelleğe alıyor | `assets/viewer.js:449`, `geometry-lod-sw.js` | Galeri kabuğu offline çalışmıyor, PWA kurulumu yok |
| T8 ✅ | `.stage` yüksekliği sabit başlık payıyla hesaplanıyor (`calc(100dvh - 150px)` / mobilde `- 112px`) | `assets/viewer.css:58-62,517-520` | Başlık metni uzayınca sahne taşar/kırpılır |
| T9 ✅ | Aydınlatma varsayılan: `environment-image="neutral"`, `shadow-intensity=1`, `shadow-softness` ve tone mapping ayarlanmamış, HDR ortam yok | `assets/viewer.js:250-256` | Modeller "flat" görünüyor; fotogrametri dokular sönük kalıyor |
| T10 ✅ | `Paylaş` sadece mevcut URL'yi kopyalıyor; kamera açısı/kademe/hotspot durumu paylaşılmıyor | `assets/viewer.js:1159` | "Şu köşeye bak" denemiyor; sunum senaryosu zayıf |
| T11 | Galeri filtresi yalnızca metin arama; kategori, sıralama, görünüm değiştirme yok | `assets/index.js:104` | 10 modelde tolere edilebilir, 25+ modelde çöker |
| T12 | Tek dil (TR). `lang="tr"` sabit, çeviri altyapısı yok | tüm HTML | Uluslararası öğrenci/akademik paylaşım hedefi için engel |
| T13 | CI/otomatik test/lint yok; `doctor.py` elle çalıştırılıyor | `tools/` | Regresyon riski her yayında elle kontrole bağlı |
| T14 ✅ | Analitik/telemetri yok: hangi model açılıyor, yükleme tamamlanıyor mu, AR gerçekten çalışıyor mu bilinmiyor | — | Karar verecek veri yok |

---

## 2. "Premium" tanımı — tasarım ilkeleri

Bu plandaki her karar şu beş ilkeye bağlanır:

1. **Bağlam önce gelir.** Kullanıcı bir binayı, kampüsün içindeki yerini görerek seçer.
2. **Hiçbir bekleme boş geçmez.** Her yükleme anında poster, ilerleme, tahmini süre ve iptal seçeneği vardır.
3. **Hareket amaçlıdır.** Animasyon geçişi anlatır (kart → sahne), dikkat çekmek için kullanılmaz. `prefers-reduced-motion` tam olarak saygı görür.
4. **Tek vurgu rengi, disiplinli tipografi.** Kurumsal renk yalnızca eylem ve durum bildirir; gerisi nötr.
5. **Her yetenek dürüsttür.** AR rozeti yalnızca gerçekten desteklendiğinde vaat eder; kalite kademesi görünür.

---

## 3. UI / görsel dil planı

### 3.1 Tasarım sistemi (tek kaynak)

- `assets/tokens.css` oluştur: renk, uzay ölçeği (4/8 px), yarıçap, gölge katmanları, tipografi ölçeği, z-index skalası, hareket süreleri.
- `index.css` ve `viewer.css` şu anda **ayrı** palet tanımlıyor (galeri `--accent:#1d4f91`, görüntüleyici `--accent:#3b82f6`). Tek token setine indirgenmeli; kurumsal OKÜ rengi tek doğru kaynak olmalı.
- z-index skalası tanımla: `--z-scene:1`, `--z-controls:20`, `--z-overlay:40`, `--z-modal:60`, `--z-toast:80`. Şu anda 1, 2, 5, 10, 15, 16, 40, 100, 1000 karışık kullanılıyor.

### 3.2 Tipografi (T3'ün çözümü)

- **Inter variable** (veya kurumsal font) `latin` + `latin-ext` alt kümesiyle **self-host** → `assets/fonts/`.
- `font-display: swap`, `preload` yalnızca gövde ağırlığı için.
- Ölçek: 12 / 14 / 16 / 20 / 25 / 32 / 40 px, satır yüksekliği 1.2 (başlık) ve 1.55 (gövde).
- Sayısal veriler (boyut, üçgen sayısı, süre) için `font-variant-numeric: tabular-nums`.

### 3.3 Poster sistemi (T4'ün çözümü)

Şu an: 1 çekim, siyah zemin, 1200×675 WebP.
Hedef: **her model için standart 3 çekim** ve tema uyumlu zemin.

| Varyant | Kullanım | Ölçü |
|---|---|---|
| `hero` | Kart medyası, viewer poster, tier geçiş posteri | 1600×900, 1x/2x |
| `wide` | Öne çıkan / harita bilgi kartı | 2400×1000 |
| `detail` | Bina detay sayfası galeri | 1200×1200 |

- Zemin: **alfa kanallı** üret (WebP/AVIF alpha) → kart arka planı temaya uyar; siyah dikdörtgen sorunu biter.
- Aynı kamera açısı, aynı ışık, aynı çerçeveleme (bina yüksekliğinin %80'i kadrajda). `tools/build_posters.py` ile otomatikleştir (Babylon/Blender headless).
- Format zinciri: `AVIF → WebP → JPEG` (`<picture>`), + LQIP (20 px blur-up) `models.json` içinde base64 olarak.
- **Hover turntable:** kart üzerine gelince 2 sn'lik 360° döngü (`<video>` webm, ~150 KB, `preload="none"`, yalnızca hover + reduced-motion kapalıysa).

### 3.4 Galeri sayfası (IA yeniden düzeni)

```
┌─ Hero (kurumsal kimlik + tek cümle görev)      [tema] [dil] ────┐
├─ ÖNE ÇIKAN: OKÜ Yerleşke Genel Planı — geniş kart, "Kampüsü aç" ┤
├─ Görünüm:  [ Harita ]  [ Galeri ]  [ Liste ]      Sırala: A-Z ▾ ┤
├─ Filtreler: Eğitim (5) · Yönetim (1) · Sosyal (2) · Uygulama (2)┤
├─ Arama [ / ]                                        10 / 10 model┤
├─ Kart ızgarası (skeleton → blur-up → poster)                    ┤
└─ Footer: kurum · erişilebilirlik · veri kaynağı · son güncelleme ┘
```

- **Kart içeriği zenginleşir:** bina adı, tür, kısa açıklama, `low` boyutu, kalite kademe göstergesi (●●○), tarama tarihi, AR durumu (cihaz yeteneği algılandıktan sonra).
- Kartlarda `content-visibility: auto` + `contain-intrinsic-size` → uzun listede ilk boyama hızlanır.
- İlk 2 poster `fetchpriority="high"`, gerisi `loading="lazy"`.
- Boş durum, hata durumu ve iskelet durumları tasarlanır (şu an yalnızca boş durum var).

### 3.5 Görüntüleyici arayüzü (chrome)

- **Sahne tam ekranı kaplar**, başlık üstte yüzen cam panel olur → T8'deki sabit `- 150px` hesabı kalkar, `100dvh` + `env(safe-area-inset-*)` yeter.
- Kontrol çubuğu üç katmana ayrılır:
  - **Birincil (her zaman):** Galeri · AR · Sıfırla
  - **İkincil (segment):** Kamera presetleri (Perspektif / Cephe / Kuş bakışı / Plan)
  - **Menü:** Oto döndür, tam ekran, ölçüm, kesit, ekran görüntüsü, paylaş, yardım, kalite kademesi
- Tüm dokunma hedefleri ≥ 44×44 px (WCAG 2.2 minimumu 24×24; premium hedef 44).
- **Kalite göstergesi:** `low/medium/high` kademe durumu ve indirilen veri miktarı küçük bir çip olarak görünür; kullanıcı elle "En yüksek kalite" isteyebilir.
- Yardım: geçici ipucu balonu yerine **kalıcı, kapatılabilir `<dialog>`** (odak tuzağı + `Esc`).

### 3.6 Aydınlatma ve render kalitesi (T9)

- Kampüs için özel **HDR ortam haritası** üret (gün ortası, yumuşak gölge) → `assets/env/campus-1k.hdr` (~1 MB), `environment-image` olarak ver; `skybox-image` opsiyonel.
- `shadow-softness`, `exposure` ve `tone-mapping` değerlerini **model başına** `models.json`'a taşı (şu an `exposure` var, kullanılmıyor denecek kadar sabit).
- Zemin: `shadow-intensity` + ince kontak gölgesi; fotogrametri zemin plakasının keskin kenarını maskeleyen yumuşak vinyet.
- İlk açılışta **sinematik giriş**: 1,2 sn'lik dolly-in + 15° yörünge kayması, `prefers-reduced-motion` ile devre dışı.

### 3.7 Hareket ve geçişler

- **Cross-document View Transitions**: kart posterinden viewer posterine `view-transition-name` ile morph (destekleyen tarayıcıda; desteklemeyende sade fade).
- Kademe geçişinde mevcut poster crossfade'i korunur, ama `opacity` + `filter: blur()` ile 220 ms yumuşatılır.
- Tüm animasyonlar için tek token seti: `--motion-fast:120ms`, `--motion:220ms`, `--motion-slow:420ms`, easing `cubic-bezier(.2,.7,.2,1)`.

---

## 4. İşlevsellik planı

### 4.1 Kampüs haritası merkezli keşif ★ (en yüksek ürün etkisi)

Genel plan modeli zaten var (`oku_genel_plan`, low 6,2 MB). Onu **hub** yap:

- `map.html` (veya `index.html` içinde "Harita" görünümü): genel plan modeli + her bina için `<hotspot>` işaretçisi.
- Hotspot'a tıklama → yan panelde bina kartı (poster, tür, birimler, boyut, "3B aç", "AR'da aç", "Yol tarifi").
- İki yönlü bağlantı: bina görüntüleyicisinde "Kampüste göster" düğmesi haritaya dönüp o hotspot'u seçer.
- Hafif alternatif (Aşama 1): 3B yerine **SVG kampüs planı** üzerinde tıklanabilir alanlar — maliyeti 1/5, faydası %70.

### 4.2 Bina bilgi katmanı

`models.json` v2 şemasına eklenecek alanlar (bkz. §7) sayesinde görüntüleyicide açılır **bilgi paneli**:

- Resmî bina adı, kısa tarih, yapım yılı, kat sayısı, kapalı alan
- İçindeki birimler/bölümler listesi (bağlantılı)
- Erişilebilirlik bilgisi (asansör, rampa, engelli WC)
- Koordinat + "Yol tarifi" (harita uygulaması deep-link)
- Tarama/model künyesi: tarama tarihi, üçgen sayısı, kaynak, lisans

### 4.3 Görüntüleyici araç seti

| Araç | Açıklama | Not |
|---|---|---|
| **Hotspot / açıklama** | Model üzerinde etiketli noktalar (giriş, amfi, laboratuvar) | `model-viewer` `slot="hotspot-*"` yerel desteği var |
| **Kamera presetleri** | Perspektif / Kuzey cephe / Kuş bakışı / Plan; `camera-orbit` animasyonlu geçiş | Sunumda en çok kullanılan özellik |
| **Ölçüm** | İki nokta arası mesafe (yaklaşık, ±%2 uyarısıyla) | `positionAndNormalFromPoint` ile mümkün |
| **Kesit / kat düzlemi** | Y ekseninde kesme düzlemi kaydırıcısı | Babylon yolunda daha kolay; model-viewer'da sınırlı |
| **Ekran görüntüsü** | `toDataURL` ile PNG indir, köşede kurum logosu + bina adı | Paylaşımı tetikleyen "viral" özellik |
| **Kamera durumlu paylaşım** (T10) | URL'ye `orbit`, `target`, `tier`, `hotspot` yaz; "Bu görünümü paylaş" | Zaten `orbit` parametresi okunuyor, yazılması gerekiyor |
| **Karşılaştırma** | İki modeli yan yana, senkron kamera | Faz 4, niş ama etkileyici |
| **VR modu** | `immersive-vr` (Quest tarayıcısı) — Babylon yolu buna hazır | AR altyapısı yeniden kullanılır |

### 4.4 AR olgunlaştırma

- AR rozeti/etiketi **cihaz yeteneği algılandıktan sonra** gerçek durumu söyler (şu an tüm kartlarda koşulsuz "AR uyumlu").
- iOS için **gerçek USDZ** üret (`tools/build_usdz.py`) → Quick Look kalitesi otomatik dönüşüme bırakılmaz; `models.json` `ios` alanı zaten destekliyor.
- AR içinde ölçek referansı (1 m ızgara / insan silueti), yerleştirme sonrası "Kilitle" ve "Yeniden yerleştir".
- AR oturumundan çıkışta kullanıcıya "Yerleştirmeyi 3B görünümde koru" seçeneği.

### 4.5 Doku LOD kararı (T2)

İki seçenekten biri **bu faz içinde** seçilmeli:

- **(A) Bağla:** 5 modelde `textureLod` alanını `models.json`'a ekle, kalan 5 model için `tools/build_texture_lods.py` çalıştır, `doctor.py`'ye "geometryLod olan her modelde textureLod da olmalı" kuralı ekle.
- **(B) Kaldır:** `viewer.js:722-960` doku LOD katmanını, `.lod/` klasörlerini, `build_texture_lods.py`'yi ve şemadaki `textureLod` alanını sil.

**Öneri: (A)**, çünkü `high` geometri kademeleri (320 MB) hâlâ ağır; dokuyu ayrı kademelendirmek en büyük kalanan kazanç. Ancak (A) seçilirse KTX2'ye geçiş de aynı işte yapılmalı, yoksa iki paralel doku yolu oluşur.

### 4.6 Arama, filtre, çok dillilik

- Facet'li filtre (tür, kampüs bölgesi, AR uygunluğu, boyut aralığı) + sıralama (ad, boyut, tarama tarihi).
- Arama alanına eşanlamlı sözlük (`kütüphane/library/kitaplık`) — `keywords` alanı zaten var, genişletilir.
- **i18n (T12):** `assets/i18n/tr.json` + `en.json`, `data-i18n` anahtarları, `hreflang`, dil seçici, `lang` niteliği dinamik. Build zamanında `index.tr.html` / `index.en.html` üretmek en hızlı yol (SPA gerekmez).

### 4.7 PWA ve offline (T7)

- `manifest.webmanifest`: ad, kısa ad, ikonlar (192/512/maskable), `display: standalone`, tema renkleri.
- Service worker'ı iki stratejiye ayır:
  - **App shell** (HTML/CSS/JS/font/poster): stale-while-revalidate, sürüm hash'i ile
  - **Model kademeleri**: cache-first + kota yönetimi (`navigator.storage.estimate`, LRU ile en eski `high` kademeyi at)
- "Bu binayı çevrimdışı kaydet" düğmesi → seçilen kademeyi kalıcı önbelleğe al, kart üzerinde ⤓ göstergesi.
- Kurulum önerisi (`beforeinstallprompt`) sadece ikinci ziyarette, kapatılabilir.

### 4.8 Paylaşım, SEO, yapılandırılmış veri (T6)

- Her model için **gerçek landing page** (`bina/<id>.html`) — mevcut meta-refresh yönlendirmeleri (T5) bunlarla değiştirilir: kendi `og:image` (model posteri), `og:title`, açıklama, JSON‑LD.
- JSON‑LD: `Place` / `CollegeOrUniversity` + `hasMap` + `photo` + `geo`.
- `robots.txt` + `sitemap.xml` (build zamanında üretilir).
- Canlı sunucudaki `X-Robots-Tag: noindex` kararı gözden geçirilir (halka açık ise kaldırılmalı).

### 4.9 Analitik ve telemetri (T14)

Gizlilik dostu, çerezsiz, self-host (Umami/Plausible) veya tek uç noktalı kendi beacon'u:

- `model_open` (id, kademe), `tier_reached`, `load_complete` (süre, bayt), `load_abandoned` (yüzde), `ar_available`, `ar_entered`, `ar_placed`, `error` (kod), `offline_saved`
- Panoda: en çok açılan bina, ortalama yükleme süresi, terk oranı, AR başarı oranı, cihaz/GPU dağılımı
- KVKK notu: IP toplanmaz, kullanıcı tanımlayıcı yok, aydınlatma metni footer'da.

---

## 5. Performans ve teslim mimarisi

### 5.1 Bağımlılıkları içselleştir (T1) ★

- `model-viewer@4.3.1`, meshopt decoder ve `nomodule` polyfill'leri `assets/vendor/` altına al.
- CSP'yi sıkılaştır: `script-src 'self' 'wasm-unsafe-eval'` (unpkg ve `unsafe-eval` kalkar), `connect-src 'self'`.
- `preconnect https://unpkg.com` satırı silinir.
- Kazanç: CDN kesintisine bağımsızlık, ~100–200 ms bağlantı kurulum süresi, üçüncü taraf isteği sıfır.

### 5.2 Varlık sürümleme

- Şu an tüm varlıklarda elle yazılan `?v=20260724-babylon-ar-v1` sorgusu var (`build_site.py:20`). **İçerik hash'ine** geçir (`index.a1b2c3.css`) → `Cache-Control: immutable, max-age=31536000` güvenle verilebilir.
- `deploy/nginx.conf`: CSS/JS için 3600 sn yerine hash'li dosyalarda 1 yıl; `.glb`/`.bin` için `immutable` ekle.

### 5.3 Sunucu

- **Brotli** ekle (`.gltf`, `.json`, `.css`, `.js`, `.svg`; `.glb`/`.jpeg`/`.webp` hariç — zaten sıkıştırılmış).
- HTTP/3 + 0‑RTT (ters vekilde).
- `103 Early Hints` ile `low.glb` ve font preload.
- `Accept-Ranges` zaten var; `.glb` için `Content-Length` doğruluğu izlenmeli (ilerleme çubuğu buna bağlı).
- Güvenlik başlıkları: `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(self), xr-spatial-tracking=(self), geolocation=(self)`, `Cross-Origin-Opener-Policy: same-origin`, HSTS (vekilde).

### 5.4 Performans bütçeleri (yayın kapısı)

| Metrik | Bütçe |
|---|---:|
| Galeri LCP (4G, orta segment Android) | ≤ 2,0 s |
| Galeri toplam transfer (ilk boyama) | ≤ 350 KB |
| INP | ≤ 200 ms |
| CLS | ≤ 0,05 |
| Viewer ilk etkileşimli kare (`low` kademe) | ≤ 3,5 s |
| `low` kademe boyutu (model başına) | ≤ 3 MB |
| GPU doku belleği tahmini (mobil) | ≤ 350 MB |
| Lighthouse Performance / A11y / Best-Practices | ≥ 90 / 100 / 100 |

---

## 6. Erişilebilirlik (WCAG 2.2 AA hedefi)

- [ ] Tüm etkileşimli hedefler ≥ 44×44 px (min. 24×24 zorunlu)
- [ ] Görüntüleyici için **klavyeyle kamera kontrolü** (ok tuşları yörünge, `+/−` zoom — kısmen var, dokümantasyonu ve odak göstergesi eksik)
- [ ] Model `alt` metni anlamlı: "Kütüphane binası, 4 katlı, güneydoğu cepheden görünüm" gibi (şu an `başlık: açıklama`)
- [ ] Yardım paneli `<dialog>` + odak tuzağı + `Esc` (şu an zaman aşımıyla kaybolan balon)
- [ ] AR düğmesi devre dışıyken **neden** ekran okuyucuya söylenir (`aria-describedby`)
- [ ] `prefers-reduced-motion`: spinner tamamen durur, oto-döndürme kapalı başlar, View Transitions devre dışı
- [ ] Kontrast: cam panellerdeki metin (`--ctrl-text` üzerinde `rgba` zemin) ölçülür, ≥ 4.5:1
- [ ] Tema düğmesi mevcut durumu bildirir (`aria-pressed` var, metin de eklenmeli)
- [ ] Kademe geçişleri `aria-live="polite"` ile duyurulur ama spam yapmaz (debounce)
- [ ] Ekran okuyucu ile tam akış testi (NVDA + VoiceOver iOS)

---

## 7. Veri modeli: `models.json` v2

`tools/models.schema.json` şu an 15 alan destekliyor (`additionalProperties: false`). Genişletme önerisi:

```jsonc
{
  "id": "kutuphane",
  "title": "Merkez Kütüphane",
  "officialName": "OKÜ Prof. Dr. ... Merkez Kütüphanesi",
  "category": "sosyal",              // egitim | yonetim | sosyal | uygulama | plan
  "campusZone": "merkez",
  "geo": { "lat": 37.21, "lng": 36.17, "heading": 143 },
  "facts": { "floors": 4, "grossArea_m2": 8200, "builtYear": 2014, "capacity": 600 },
  "units": [{ "name": "Kütüphane ve Dokümantasyon Daire Başkanlığı", "url": "..." }],
  "accessibility": { "elevator": true, "ramp": true, "accessibleWc": true },
  "scan": { "date": "2025-04-09", "method": "fotogrametri", "triangles": 2491704 },
  "media": { "hero": "...", "wide": "...", "detail": [...], "turntable": "...", "lqip": "data:..." },
  "render": { "exposure": 0.85, "shadowSoftness": 0.6, "env": "assets/env/campus-1k.hdr" },
  "hotspots": [{ "id": "giris", "label": "Ana giriş", "position": "1.2 0 3.4", "normal": "0 1 0" }],
  "geometryLod": "...", "textureLod": "...", "ios": "...", "fallback": "..."
}
```

- `additionalProperties: false` korunur → şema ile birlikte genişletilir.
- `doctor.py`'ye yeni kurallar: her modelde `category`, `geo`, `scan.date` zorunlu; `hotspots` pozisyonları sayısal; `textureLod` ve `geometryLod` tutarlılığı.
- Alanların doldurulma formu: **`BINA_BILGI_FORMU.md`**.
- Bu şema **haritayı, filtreleri, bilgi panelini, JSON‑LD'yi ve i18n'i** aynı anda besler. Bu yüzden §4'teki işlerin çoğunun önkoşuludur — ilk yapılacak iştir.

---

## 8. Kod sağlığı ve boru hattı

### 8.1 Temizlik (T5)

- 9 blok klasöründeki şablon artıklarını sil: `demo-styles.css`, `responsive.css`, `README.md`, `CONTRIBUTING.md`, `LICENSE`, `.gitignore`, `responsive.html`.
- `index.nginx-debian.html`, `generate_modelviewer_html.sh`, `update_model_pages.sh` (artık `build_site.py` var) → kaldır veya `tools/legacy/` altına taşı.
- `tools/__pycache__` `.gitignore`'a girsin.
- Meta-refresh yönlendirme sayfaları → gerçek landing page'lerle değiştir (§4.8).

### 8.2 Depo / varlık stratejisi (3,4 GB)

- Türetilmiş varlıklar (`*.geometry-lod/`, `*.lod/`, posterler) **git'te tutulmamalı**: build çıktısı olarak üretilip ayrı bir nesne deposuna (S3/MinIO) veya sunucuda `rsync` ile yayılmalı.
- Kaynak varlıklar (orijinal `.gltf/.bin/.jpeg`) LFS'te veya tamamen depo dışı arşivde.
- Hedef: git klonu < 100 MB.

### 8.3 Otomasyon (T13)

- `Makefile`: `make build`, `make lod`, `make posters`, `make check`, `make deploy`.
- CI (GitHub Actions veya yerel runner):
  - `models.json` şema doğrulaması
  - `tools/doctor.py`
  - HTML doğrulama (`vnu`)
  - `eslint` + `stylelint` + `ruff`
  - Playwright duman testi: galeri açılır → kart tıklanır → `low` kademe yüklenir → kontroller görünür
  - Lighthouse CI + §5.4 bütçeleri (bütçe aşımı = kırmızı)
- Yayın: `deploy/nginx.conf` container'a mount ediliyor; `make deploy` öncesi `doctor.py` + smoke test zorunlu.

---

## 9. Yol haritası

Efor tahminleri kabaca adam-gün (1 kişi, tam odak).

### Faz 0 — Temel sağlamlaştırma · **UYGULANDI (4 Eylül 2026)**

| # | İş | Durum | Sonuç |
|---|---|---|---|
| 0.1 | `model-viewer` + meshopt + KTX2/Draco çözücüleri self-host, CSP sıkılaştırma (T1) | ✅ | Üçüncü taraf istek **0** (canlı sitede tarayıcı ile doğrulandı); `unpkg` + `gstatic` CSP'den kalktı, `unsafe-eval` **kalmak zorunda** (aşağıya bakın) |
| 0.2 | Inter variable self-host + tipografi ölçeği (T3) | ✅ | `assets/fonts/` (latin 48 KB + latin-ext 85 KB), `document.fonts.check('700 16px Inter') === true` |
| 0.3 | `assets/tokens.css` + z-index skalası; iki paletin birleştirilmesi | ✅ | Tek marka ölçeği; galeri `#1d4f91`, görüntüleyici `#2f6fbf` (aynı aileden); 10 ham z-index değeri 8 token'a indi |
| 0.4 | Depo temizliği + legacy script'ler (T5) | ✅ | 9 klasörden model-viewer codelab artıkları, `responsive.html` kopyaları, `index.nginx-debian.html` ve 2 eski script kaldırıldı |
| 0.5 | Doku LOD kararı ve uygulanması (T2) | ✅ | **(B) kaldırma** seçildi (gerekçe aşağıda): −324 satır JS, **−173 MB** disk |
| 0.6 | Hash'li varlık sürümleme + nginx immutable/gzip (§5.2–5.3) | ✅ | `?v=<sha256[:10]>` damgaları build'de üretiliyor; `/assets` altındaki css/js/wasm/woff2 → `immutable`; Brotli **mümkün değil** (aşağıya bakın) |

#### Uygulama notları ve plandan sapmalar

**0.5 — plan (A)'yı öneriyordu, (B) uygulandı.** Gerekçe kodda bulundu:
`tools/build_geometry_lods.py` üç kademenin **hepsini** gltfpack `-tc` ile,
yani KTX2/Basis dokularla üretiyor (`high` kademe kaynak piksel boyutunu
kalite 10'da koruyor). Dolayısıyla her kademe kendi GPU-sıkıştırmalı dokusunu
zaten taşıyor; WebP doku katmanı bunları RGBA WebP ile **değiştirerek** GPU
belleğini artırıyordu. Ayrıca `tools/doctor.py` içinde
`legacy textureLod is not allowed` kuralı hâlihazırda vardı — proje bu kararı
zaten vermiş, kod temizlenmemişti. Kaldırılanlar: `viewer.js` (−262 satır),
`ar-viewer.js` (−62), `build_texture_lods.py`, 5 modeldeki `.lod/` piramitleri,
şema/manifest/`lod` URL parametresi ve service worker kuralı.

**0.1 — `'unsafe-eval'` CSP'de kalmak zorunda.** `basis_transcoder.js`
(Emscripten **embind**) modül başlatılırken `new Function` çağırıyor
(`createNamedFunction`). Tüm modeller KTX2 olduğu için bu yol her yüklemede
çalışır; izin kaldırılırsa doku çözme kırılır. Kalıcı çözüm: embind'siz
(`-sDYNAMIC_EXECUTION=0`) derlenmiş bir Basis transcoder'a geçmek.
Ayrıca `nomodule` polyfill'leri self-host edilmek yerine **kaldırıldı**:
ES modülü desteklemeyen bir tarayıcı `model-viewer` 4.x'i zaten yükleyemez.

**0.6 — dosya adı hash'i yerine sorgu dizesi hash'i.** Plan
`index.<hash>.css` biçimini öngörüyordu; bunun için el ile bakılan
`viewer.html`'in de şablona dönüştürülmesi gerekiyordu (162 satır, canlı
görüntüleyici). Bunun yerine `?v=<içerik hash'i>` damgaları build tarafından
hem üretilen `index.html`'e hem `viewer.html`'e ve `tokens.css` içindeki font
adreslerine yazılıyor; site CDN arkasında değil doğrudan nginx'ten servis
edildiği için sorgu tabanlı damga yeterli ve `immutable` güvenli.
`build_site.py --check` damgaların bayatladığını yakalar (çıkış kodu 3).
Ek olarak `assets/models.generated.js` **deterministik** yapıldı (duvar saati
yerine `models.json` hash'i), yoksa her yapı `viewer.html`'i boşuna değiştiriyordu.

**0.6 — Brotli mümkün değil, gzip genişletildi.** Üretimdeki container
`nginx:alpine` (nginx 1.31.4) ve `nginx -V` çıktısında `ngx_brotli` yok;
`brotli on;` eklenmesi nginx'i başlatmaz. Bunun yerine `gzip_types` listesine
`application/wasm`, `model/gltf+json` ve `text/javascript` eklendi
(`basis_transcoder.wasm` 500 KB → gzip ile ~%60 küçülüyor). Brotli, brotli ile
derlenmiş bir imaja geçildiğinde açılabilir (`deploy/nginx.conf` başındaki nota bakın).

**0.6 — `immutable` kapsamı bilinçli olarak sınırlı.** Yalnızca damgalı
`/assets/*.{css,js,mjs,wasm,woff2}` bir yıl `immutable`. Posterler damgasız
olduğu için 30 günde kalıyor (poster boru hattı Faz 2'de damgalanacak).
Model dosyaları (`low/medium/high.glb`) yeniden üretildiğinde **aynı adla**
üzerine yazıldığı için `immutable` **verilmedi**, 7 gün korundu.

**Yayın tuzağı (kayda geçirildi).** `deploy/nginx.conf` container'a tek dosya
olarak bağlı; dosyayı yeniden oluşturmak yeni inode ürettiği için container
değişikliği görmedi. `docker restart personal-web` (≈0,5 sn) ile mount tazelendi.
README'ye yayın notu olarak eklendi.

#### Faz 0 doğrulaması

| Kontrol | Sonuç |
|---|---|
| `python3 tools/doctor.py` | ✅ `OK: critical assets present` / `OK: manifest looks consistent` |
| `python3 tools/build_site.py --check` | ✅ idempotent (iki ardışık koşuda değişiklik yok) |
| `node --check` (5 JS dosyası) | ✅ |
| Canlı galeri (Playwright/Chromium) | ✅ 10 kart, Inter yüklü, token'lar çözülüyor |
| Canlı görüntüleyici + model yükleme | ✅ `mv.loaded = true`, `low.glb`, 2 materyal |
| Çözücü kaynağı | ✅ `meshopt_decoder.js`, `basis_transcoder.js`, `basis_transcoder.wasm` → `/assets/vendor/...` |
| Üçüncü taraf köken sayısı | ✅ **0** |
| CSP ihlali / başarısız istek / konsol hatası | ✅ 0 / 0 / 0 |
| HTTP başlıkları | ✅ `immutable` (damgalı varlık), `no-cache` (HTML + SW), `Permissions-Policy` (AR izinli), gzip |

### Faz 1 — `models.json` v2 + bilgi katmanı · **UYGULANDI (4 Eylül 2026)** · 1.2 kurumsal veri bekliyor

| # | İş | Durum | Sonuç |
|---|---|---|---|
| 1.1 | Şema v2 + `doctor.py` kuralları (§7) | ✅ | 7 yeni isteğe bağlı alan (`officialName`, `campusZone`, `geo`, `facts`, `units`, `accessibility`, `scan`); `doctor.py` artık **jsonschema ile gerçek şema doğrulaması** yapıyor, `category` zorunlu, eksik içerik alanları özet uyarı olarak raporlanıyor |
| 1.2 | 10 bina için içerik toplama | ⏸ | **Kurumdan teyit gerekiyor** — uydurulmadı. Doldurulacak alanlar, ne işe yaradıkları ve kopyala–yapıştır şablonu `BINA_BILGI_FORMU.md` dosyasında; `doctor.py` hangi alanın hangi modelde eksik olduğunu her koşuda listeliyor |
| 1.3 | Görüntüleyici bilgi paneli | ✅ | `<dialog>` tabanlı panel (mobilde alt sayfa, masaüstünde yan panel), `I` kısayolu, odak tuzağı + `Esc`; teyitli olmayan bölüm hiç render edilmiyor |
| 1.4 | Kart zenginleştirme | ✅ | Kartta kalite kademesi + en yüksek üçgen sayısı; AR rozeti cihaz yeteneği ölçüldükten sonra "AR hazır" / "AR uyumlu" oluyor; `data-category` ile filtre altyapısı hazır |

#### Uygulama notları

**Adres şeması kısaldı (planda yoktu, 1.3'ün önkoşulu).** Bilgi panelinin tüm
alanlara erişmesi için model künyesi `assets/models.generated.js` içine
katalog olarak yazıldı; galeri bağlantıları artık `viewer.html?id=<id>`.
Eski uzun parametreli bağlantılar (`title`, `model`, `poster`, …) çalışmaya
devam ediyor — `id` yoksa eski yol kullanılıyor. Yan etki: `index.html`
29,1 KB → 27,1 KB.

**Model künyesi verisi türetilir, elle yazılmaz.** Kalite kademelerinin
boyutu ve üçgen sayısı `*.geometry-lod.json` üretim raporlarından okunuyor,
yani panelde her zaman gerçek üretim değerleri görünüyor
(ör. Fabrika: Hafif 738 KB / 87.460 üçgen → Yüksek 16,0 MB / 531.864 üçgen).

**Eksik veri dürüstçe bildiriliyor.** Bina bilgileri girilmediği sürece panel
"Birim, kat, alan ve konum bilgileri bu bina için henüz eklenmedi." notunu
gösteriyor; `geo` yokken "Yol tarifi al" düğmesi hiç oluşturulmuyor.

**`category` zorunlu, `geo`/`scan.date` uyarı.** Plan üçünü de zorunlu
öngörüyordu; veri gelmeden zorunlu kılmak `doctor.py`'yi kalıcı kırmızıya
düşüreceği için yalnızca sınıflandırma (elde olan) zorunlu yapıldı.

#### Faz 1 doğrulaması (canlı site, Chromium)

| Kontrol | Sonuç |
|---|---|
| Galeri kartı | ✅ `viewer.html?id=a_b_blok`, `data-category="egitim"`, künye: "3 kalite kademesi · en yüksek 2,5 M üçgen" |
| AR rozeti (XR'sız cihaz) | ✅ `AR uyumlu` + "bu cihaz veya tarayıcı AR desteklemiyor" |
| `?id=` çözümlemesi | ✅ başlık, açıklama, poster, `low.glb` katalogdan geldi; model yüklendi |
| Bilgi paneli | ✅ açılıyor, odak panel içinde, 3 kademe satırı + etkin kademe işaretli, eksik veri notu görünüyor |
| `Esc` / `I` | ✅ kapanıyor / açılıyor |
| Eski uzun bağlantı | ✅ hâlâ çalışıyor (parametreden gelen açıklama korunuyor) |
| Üçüncü taraf / CSP / konsol | ✅ 0 / 0 / 0 |
| `doctor.py` (şema dahil) · `build_site.py --check` | ✅ · ✅ |

### Faz 2 — Görsel yükseltme · **UYGULANDI (5 Eylül 2026)**

| # | İş | Durum | Sonuç |
|---|---|---|---|
| 2.1 | Poster hattı — alfa kanal, AVIF/WebP, LQIP (T4) | ✅ | `tools/build_posters.mjs`: 1600×1000 alfa WebP (82–178 KB) + AVIF (40–96 KB) + gömülü LQIP; kadraj otomatik (taşarsa daha uzak yarıçapla yeniden dener, sonra saydam kenarı kırpar) |
| 2.2 | Hover turntable | ✅ | `tools/build_turntables.mjs`: 28 kare / 512×320 / alfa kanallı VP9, **82–211 KB** (toplam 1,4 MB, yalnızca hover'da iner) |
| 2.3 | HDR ortam + model başına render ayarları (T9) | ✅ | `tools/build_environment.py` ile üretilmiş 72 KB stüdyo HDRI; `neutral` ile karşılaştırıldı ve görsel olarak seçildi; şemaya `render` nesnesi eklendi |
| 2.4 | Viewer chrome + kamera presetleri + kalite çipi (§3.5) | ✅ | Sahne tam ekran (model alanı %81 → **%100**), alt yerleşim (dock), 4 preset (`1`–`4`), kalite çipi + kademe sabitleme, yardım kalıcı `<dialog>` |
| 2.5 | View Transitions + iskelet durumları | ✅ | Cross-document geçiş (`model-media`), parıltı iskeleti, LQIP blur-up; `prefers-reduced-motion`'da tamamen kapalı |

#### Uygulama notları ve plandan sapmalar

**Faz 1'den gelen canlı hata düzeltildi.** `.info-panel { display: flex }` yazar
stili, UA'nın `dialog:not([open]) { display: none }` kuralını köken sırası
nedeniyle eziyordu; bilgi ve yardım panelleri **kapalıyken de görünüyordu**.
Ekran görüntüsü almadan fark edilmemişti (Faz 1 testi yalnızca `dialog.open`
özelliğini kontrol ediyordu). `.info-panel:not([open]) { display: none }`
eklendi ve artık her iki panel için `display === 'none'` doğrulanıyor.

**Poster üretimi Blender yerine sitenin kendi renderer'ı ile.** Blender kurulu
değil; bunun yerine headless Chromium + model-viewer kullanıldı. Beklenmedik
avantaj: poster ile sahne arasında ışık/ton/doku farkı **yapısal olarak**
imkânsız, çünkü ikisi de aynı motoru ve aynı HDR'ı kullanıyor.

**Poster varyantları: yalnızca `hero` üretildi.** Plan `hero`/`wide`/`detail`
öngörüyordu; `wide` haritanın (Faz 4.1), `detail` bina galerisinin tüketicisi
olmadığı için üretilmedi. Boyut yerine tüketici ölçütü kullanıldı: kullanılmayan
4,5 MB varlık üretmek yerine hat üç varyanta hazır bırakıldı. `social` (OG)
varyantı Faz 4.2'deki landing sayfalarıyla gelecek.

**Kadraj sayısal olarak kalibre edildi.** `auto` kadrajda fotogrametri
modelleri kareyi yalnızca **%47–56** dolduruyordu (geniş zemin plakası
yüzünden). Ölçümle (`-trim` ile piksel kaplaması) %68 seçildi → **%74–88**
doluluk, kırpma yok. Dikey ekranlarda çerçeveleme genişlikle sınırlı olduğu
için ölçek 0,82 ile çarpılıyor.

**Turntable boyutu deneyle indirildi.** İlk üretim 232–693 KB idi. Kart
boyutunda (~380 px) kalite farkı ayırt edilmediği için 512×320 + crf 52 +
28 kare seçildi → 82–211 KB. Kadraj, karelerin **birleşik** sınır kutusundan
kırpılıyor: tek kareye göre kırpmak model dönerken kesilmesine yol açıyordu.

**VP9 alfa desteği çalışma zamanında ölçülüyor.** Tarayıcıya "alfa kanallı VP9
oynatabilir misin" diye sorulamıyor. İlk kare bir canvas'a çizilip **köşe
piksellerinin saydamlığı** okunuyor; saydam değilse (alfa desteklenmiyorsa)
videolar DOM'dan kaldırılıp posterde kalınıyor — siyah kutulu bir döngü
gösterilmiyor.

**LQIP satır içi stil olarak verilemedi.** `style-src 'self'` CSP'si satır içi
`style` özniteliğini engelliyor; bu yüzden LQIP'ler üretilmiş bir stil
dosyasına (`assets/posters.lqip.css`) yazılıyor ve `data-id` seçicisiyle
eşleşiyor.

#### Faz 2 doğrulaması (canlı site, Chromium)

| Kontrol | Sonuç |
|---|---|
| Poster biçimi | ✅ AVIF servis ediliyor, 1600×1000, alfa (açık ve koyu temada siyah kutu yok) |
| LQIP + iskelet | ✅ `data:image/webp` arka plan, poster yüklenince iskelet kalkıyor |
| Turntable | ✅ hover'da oynuyor, **alfa algılaması geçti**, `opacity: 1` |
| Kalite çipi + sabitleme | ✅ "En yüksek kaliteyi yükle (16.0 MB)" → `high.glb` yüklendi |
| Kamera presetleri | ✅ `3` tuşu → phi 65° → 38°, etkin preset işaretlendi |
| Kapalı dialog'lar | ✅ `display: none` (bilgi + yardım) |
| HDR ortam | ✅ `campus-studio.hdr`, exposure 1, shadow-softness 0,85 |
| Sahne alanı | ✅ görünümün %100'ü (önce %81) |
| View Transitions | ✅ kart tıklamasında `model-media` adı atanıyor, sahnede karşılığı var |
| Üçüncü taraf / CSP / konsol | ✅ 0 / 0 / 0 |

### Faz 3 — Araç seti ve PWA · **UYGULANDI (5 Eylül 2026)**

| # | İş | Durum | Sonuç |
|---|---|---|---|
| 3.1 | Hotspot sistemi + **yazma modu** | ✅ | Şema + render hazır; içerik `?edit=hotspot` ile sahnede tıklanarak üretiliyor (şemaya uygun JSON veriyor). Hotspot **içeriği** kurumsal bilgi olduğu için uydurulmadı |
| 3.2 | Kamera durumlu paylaşım + ekran görüntüsü (T10) | ✅ | Bağlantı `orbit`/`target`/`quality` taşıyor ve aynı kadrajı geri getiriyor; PNG indirme bina adı + kurum künyesiyle imzalanıyor |
| 3.3 | Ölçüm aracı | ✅ | **Plandan saptı:** ±%2 doğruluk ancak ölçek bilinirse mümkün (aşağıya bakın). Ölçek yoksa "model birimi" gösterilip kalibrasyon sunuluyor |
| 3.4 | PWA: manifest + iki katmanlı SW + çevrimdışı kaydet (T7) | ✅ | Yüklenebilir uygulama, maskable ikonlar, SWR + cache-first/LRU, "Çevrimdışı kaydet (18,0 MB)" |
| 3.5 | Analitik + hata telemetrisi (T14) | ✅ | **Yeni servis kurulmadı:** olaylar `/e` ucuna, nginx yalnızca zaman damgası + sorgu dizesi yazıyor; `tools/report_events.py` özetliyor |

#### Uygulama notları ve plandan sapmalar

**3.3 — ölçüm aracı "±%2 doğruluk" vaadini olduğu gibi karşılayamaz.**
Ölçüm çalışırken fark edildi: fotogrametri modelleri **ölçeksiz** üretilmiş.
Fabrika modelinde iki nokta arası mesafe 0,324 *model birimi*; bunu metre
sanıp "38 cm" yazmak kullanıcıyı yanıltıyordu. Çözüm:
- Şemaya `scan.metersPerUnit` eklendi (1 model birimi kaç metre).
- Tanımlıysa sonuç metre cinsinden ve ±%2 uyarısıyla gösteriliyor.
- Tanımlı değilse **"model birimi · ölçek tanımlı değil"** yazıyor ve
  *Ölçeği kalibre et* düğmesi çıkıyor: bilinen bir uzunluk girilince ölçek
  hesaplanıyor, bu tarayıcıda saklanıyor ve `models.json`'a eklenecek değer
  ekranda gösteriliyor. Doğrulandı: 25 m girildiğinde okuma "≈ 25.0 m",
  sayfa yenilendikten sonra ölçek korunuyor.

**3.5 — Umami/Plausible yerine nginx günlüğü.** Site statik ve backend yok;
yeni bir konteyner + veritabanı kurmak yerine `/e` ucu 204 dönüyor ve nginx
`oku_events` biçimiyle **yalnızca** `$time_iso8601 $args` yazıyor: IP,
user-agent, referrer, çerez yok. Kişisel veri işlenmediği için KVKK yükü
minimum; footer'da bu açıkça yazıyor. `Do Not Track` ve
`localStorage['analytics-opt-out']` saygı görüyor. Umami'ye geçmek
`assets/analytics.js` içindeki `ENDPOINT` değişkenini değiştirmek kadar.
Sınır: günlük container'ın standart çıktısına gidiyor; kalıcı saklama için
`access_log` volume'ü gerekir (README'de not düşüldü).

**3.1 — hotspot içeriği yazma moduyla devredildi.** Plan "en az 3 binada
hotspot yayında" diyordu; hangi noktanın etiketlenmesi gerektiği kurumsal
bilgi olduğu için (bina bilgileri gibi) uydurulmadı. Yerine editör yapıldı:
`?edit=hotspot` ile tıklanan noktanın konumu/normali okunup şemaya uygun,
4 haneye yuvarlanmış JSON üretiliyor.

#### Bu fazda yakalanan iki regresyon

**(a) Faz 2'den gelen canlı hata: "Diğer" menüsü tıklanamıyordu.** Faz 2'de
kontrol çubuğuna eklediğim `overflow-x: auto`, yukarı doğru açılan
(`bottom: 100%`) ikincil menüyü ve tooltip'leri kırpıyordu; menü görünse de
tıklama model-viewer'a gidiyordu. Yani Oto Döndür, Yakınlaştır, Tam Ekran,
Paylaş ve Yardım düğmeleri canlıda kullanılamaz durumdaydı. Faz 2 testleri
menüyü hiç açmadığı için kaçmıştı; Playwright'ın "element is not visible /
model-viewer intercepts pointer events" hatasıyla ortaya çıktı.
`overflow` kaldırılıp satır sarmasına dönüldü ve CSS'e neden kullanılmaması
gerektiği not olarak yazıldı. `elementFromPoint` ile doğrulandı.

**(b) Kendi düzenleme hatam.** İki çapa arasındaki *dilimi* değiştiren bir
düzenleme, o aralıkta duran bilgi paneli + kalite çipi + hotspot kodunu da
sildi. `node --check` sözdizimi geçerli olduğu için yakalamadı; fonksiyon
envanteri karşılaştırması yakaladı. Dosya git'ten geri alındı ve tüm
düzenlemeler yalnızca **tam eşleşen dizge** değişimiyle, her adımda
`function` envanteri karşılaştırılarak yeniden uygulandı.

#### Faz 3 doğrulaması (canlı site, Chromium)

| Kontrol | Sonuç |
|---|---|
| Ölçüm (ölçeksiz) | ✅ "0.324 model birimi · ölçek tanımlı değil" + kalibrasyon düğmesi |
| Ölçüm (kalibre) | ✅ 25 m girişi → "≈ 25.0 m · ±%2"; yenilemeden sonra ölçek korunuyor |
| Hotspot yazma modu | ✅ tıklama → şemaya uygun JSON (`position` metreli, `normal` birimsiz, 4 hane) |
| Kamera durumlu paylaşım | ✅ `?id=...&orbit=...rad ...m&target=...` |
| Ekran görüntüsü | ✅ `oku-fabrika-2026-09-04.png` indirildi (imzalı) |
| Çevrimdışı bölümü | ✅ "Çevrimdışı kaydet (18,0 MB)" |
| Service worker | ✅ kapsam `/`, etkin, sayfayı kontrol ediyor |
| PWA manifesti | ✅ `application/manifest+json`, maskable ikon dahil |
| Ölçüm olayları | ✅ `model_open`, `load_complete` (ms/kb), `ar_available`, `share`, `snapshot` günlüğe düştü |
| `report_events.py` | ✅ açılış/tamamlama oranı/kademe/AR özeti üretiyor |
| Konsol hatası | ✅ 0 |

### Faz 4 — Dijital ikiz deneyimi (≈ 12 gün)

| # | İş | Efor | Kabul kriteri |
|---|---|---:|---|
| 4.1 | Kampüs haritası hub'ı (Aşama 1: SVG plan → Aşama 2: 3B genel plan + hotspot) | 4 g | Haritadan her binaya, binadan haritaya gidiş |
| 4.2 | Landing page'ler + JSON‑LD + sitemap/robots (T6) | 1,5 g | Paylaşımda bina posteri görünüyor; rich result testi geçiyor |
| 4.3 | i18n TR/EN (T12) | 2 g | `hreflang` doğru; tüm arayüz metinleri çevrildi |
| 4.4 | Gerçek USDZ üretimi + AR ölçek referansı | 1,5 g | iPhone Quick Look'ta doğru ölçek |
| 4.5 | VR modu (`immersive-vr`) | 1,5 g | Quest tarayıcısında yürünebilir sahne |
| 4.6 | CI + Lighthouse bütçe kapısı + Playwright (§8.3) | 1,5 g | Bütçe aşımında yayın bloke |

**Toplam:** ≈ 38 adam-gün. Faz 0–2 (18 gün) tamamlandığında "premium" algısının büyük kısmı elde edilir; Faz 3–4 ürünü dijital ikize dönüştürür.

---

## 10. Bu hafta yapılabilecek 10 hızlı kazanım

1. ✅ `model-viewer` + meshopt + KTX2/Draco'yu self-host et, CSP'den unpkg/gstatic'i kaldır. *(T1 — `unsafe-eval` teknik zorunluluk olarak kaldı)*
2. ✅ Inter variable'ı `assets/fonts`'a koy, `preload` et. *(T3)*
3. ✅ Ölü doku LOD katmanını sil. *(T2)*
4. ✅ `.stage` tam görünüm kaplıyor; sabit başlık payı kalktı. *(T8)*
5. ⬜ `robots.txt` + `sitemap.xml` üret; `noindex` kararını netleştir. *(T6 → Faz 4.2)*
6. ✅ Blok klasörlerindeki şablon artıklarını ve `responsive.html` kopyalarını sil. *(T5)*
7. ✅ `Paylaş` kamera durumunu taşıyor. *(T10)*
8. ⬜ AR rozetini cihaz yeteneğine bağla; desteklenmiyorsa nedenini yaz. *(→ Faz 1.4)*
9. ✅ Yardım kalıcı `<dialog>` (odak tuzağı + `Esc`). *(Faz 2.4)*
10. ◑ nginx'e `Referrer-Policy` + `Permissions-Policy` eklendi; **Brotli** imaj değişikliği gerektiriyor.

---

## 11. Riskler ve önlemler

| Risk | Etki | Önlem |
|---|---|---|
| `high` kademe (39 MB'a kadar) düşük segment cihazda WebGL bağlamını düşürür | Sekme çöker | Cihaz belleği/GPU'ya göre kademe tavanı; `high` yalnızca kullanıcı isterse |
| Self-host sonrası model-viewer güncellemeleri elle takip edilir | Güvenlik/uyumluluk gecikmesi | `tools/` içinde sürüm pinleme + üç ayda bir güncelleme kontrolü, `integrity` doğrulaması |
| KTX2 + doku LOD birlikte iki paralel yol oluşturur | Bakım kâbusu | Tek karar: KTX2 tek doku standardı, LOD onun üstünde kademe |
| Bina bilgileri kurumdan teyit gerektirir | Faz 1 bloke olur | İçerik toplama işi Faz 0 ile paralel başlatılır; teyit gelmeyen alan gizlenir, uydurulmaz |
| Harita hub'ı kapsam kayması yaratır | Faz 4 uzar | SVG plan ile MVP, 3B hub ikinci aşamada |
| 3,4 GB depo CI'yı yavaşlatır | Yavaş yayın | Türetilmiş varlıkları depo dışına çıkar (§8.2) |

---

## 12. Doğrulama planı

Her faz sonunda:

- `python3 tools/doctor.py` · `python3 tools/report_sizes.py`
- W3C HTML doğrulaması (`vnu`)
- Lighthouse (mobil + masaüstü) → §5.4 bütçeleri
- Cihaz matrisi: düşük segment Android (Chrome), iPhone (Safari), masaüstü Chrome/Firefox/Safari, Quest tarayıcısı
- Yavaş 4G + %30 paket kaybı simülasyonu
- Klavye-yalnızca tam akış + NVDA + VoiceOver
- Açık/koyu tema kontrast ölçümü, `prefers-reduced-motion`
- AR: destekli ve desteksiz cihazda durum mesajları
- Kurtarma akışları: 404 model, iptal edilen indirme, kademe geçiş hatası, çevrimdışı

---

*Bu belge karar desteği içindir; uygulama onaydan sonra fazlar hâlinde yapılır.*
