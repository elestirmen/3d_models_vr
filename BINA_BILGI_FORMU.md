# Bina Bilgi Formu — `models.json` v2 içerik alanları

**Amaç:** Görüntüleyicideki **Bina bilgisi** panelini, gelecekteki kampüs
haritasını ve arama motoru meta verisini besleyen alanları doldurmak.

**Kural:** Bu alanlar **yalnızca kurumdan teyitli** bilgiyle doldurulur.
Boş bırakılan alan arayüzde hiç gösterilmez — tahmini değer yazılmaz.
Şu anda 10 modelin tamamında bu alanlar boştur; panel bu yüzden
"Birim, kat, alan ve konum bilgileri bu bina için henüz eklenmedi." notunu gösterir.

Doldurduktan sonra doğrulama:

```bash
python3 tools/doctor.py        # şema + içerik boşluk raporu
python3 tools/build_site.py    # katalog ve sayfaları yeniden üret
```

---

## Alanlar ne işe yarar?

| Alan | Nerede görünür | Not |
|---|---|---|
| `officialName` | Bilgi panelinin başlığı | Kartlarda kısa ad (`label`) kullanılmaya devam eder |
| `campusZone` | Bilgi paneli çipi | Ör. "Merkez yerleşke", "Uygulama alanı" |
| `facts.floors` | Bina bilgileri → Kat sayısı | Tam sayı |
| `facts.grossArea_m2` | Bina bilgileri → Kapalı alan | m², sayı (birim yazılmaz) |
| `facts.builtYear` | Bina bilgileri → Yapım yılı | Tam sayı |
| `facts.capacity` | Bina bilgileri → Kapasite | Kişi sayısı |
| `units[]` | Birimler listesi | `name` zorunlu, `url` isteğe bağlı (https) |
| `accessibility` | Erişilebilirlik → Var / Yok | `elevator`, `ramp`, `accessibleWc` (true/false), `note` |
| `geo.lat` / `geo.lng` | Konum + **Yol tarifi al** düğmesi | Bina **girişinin** koordinatı; alan yoksa düğme çıkmaz |
| `scan.date` | Model künyesi → Tarama tarihi | `YYYY-MM-DD` |
| `scan.metersPerUnit` | Ölçüm aracının gerçek mesafe göstermesi | Görüntüleyicideki kalibrasyonla üretilir |
| `hotspots[]` | Model üzerindeki etiketli noktalar | `?edit=hotspot` modunda üretilir |
| `scan.method` | Model künyesi → Üretim yöntemi | Ör. "fotogrametri (drone)" |
| `scan.source` | Model künyesi → Kaynak | Ör. "OKÜ Yapı İşleri Daire Başkanlığı" |

> Üçgen sayıları ve kademe boyutları **elle yazılmaz**; `build_site.py` bunları
> geometri LOD üretim raporlarından okur.

---

## Doldurulacak liste

Kategoriler zaten atanmıştır (değişmesi gerekiyorsa `category` alanı:
`egitim` · `yonetim` · `sosyal` · `uygulama` · `plan`).

| Model (`id`) | Kategori | Resmî ad | Kat | Kapalı alan | Yıl | Birimler | Koordinat | Tarama tarihi |
|---|---|---|---|---|---|---|---|---|
| `a_b_blok` | egitim | | | | | | | |
| `c_blok` | egitim | | | | | | | |
| `d_blok` | egitim | | | | | | | |
| `e_blok` | egitim | | | | | | | |
| `f_blok` | egitim | | | | | | | |
| `fabrika` | uygulama | | | | | | | |
| `ilahiyat` | egitim | | | | | | | |
| `kutuphane` | sosyal | | | | | | | |
| `oku_genel_plan` | plan | — | — | — | — | — | — | |
| `rektorluk` | yonetim | | | | | | | |

`oku_genel_plan` bir bina değil yerleşke planı olduğu için bina bilgileri
onda boş kalabilir; `scan` alanı yine anlamlıdır.

---

## Kopyala–yapıştır şablonu

`models.json` içindeki ilgili modelin `geometryLod` satırından **sonra**
eklenir (alan sırası serbesttir, JSON virgüllerine dikkat edin):

```jsonc
      "officialName": "OKÜ Merkez Kütüphanesi",
      "campusZone": "Merkez yerleşke",
      "facts": {
        "floors": 4,
        "grossArea_m2": 8200,
        "builtYear": 2014,
        "capacity": 600
      },
      "units": [
        { "name": "Kütüphane ve Dokümantasyon Daire Başkanlığı", "url": "https://kutuphane.oku.edu.tr/" }
      ],
      "accessibility": {
        "elevator": true,
        "ramp": true,
        "accessibleWc": true,
        "note": "Ana giriş kuzey cephede, rampa girişin solundadır."
      },
      "geo": { "lat": 37.00000, "lng": 36.00000, "heading": 143 },
      "scan": {
        "date": "2025-04-09",
        "method": "fotogrametri",
        "source": "OKÜ Yapı İşleri Daire Başkanlığı"
      }
```

Yalnızca elinizde olan alanları ekleyin; kısmi `facts` (ör. sadece `floors`)
geçerlidir ve panelde yalnızca o satır görünür.

---

## Hotspot'lar ve model ölçeği (sahnede üretilir)

Bu iki alan tabloya elle yazılmaz; görüntüleyicide üretilir.

**Hotspot'lar** — `viewer.html?id=<model>&edit=hotspot` adresini açın, modelin
üzerinde bir noktaya tıklayın ve etiketi yazın. Panel şemaya uygun JSON verir;
`hotspots` alanına yapıştırın:

```jsonc
      "hotspots": [
        { "id": "ana-giris", "label": "Ana giriş", "position": "-0.1282m 0.1724m -0.1096m", "normal": "-0.0012 1.0000 0.0051" }
      ]
```

**Model ölçeği** — Fotogrametri çıktıları ölçeksizdir; ölçüm aracı
`scan.metersPerUnit` tanımlanmadan gerçek mesafe göstermez. **Diğer → Ölçüm**
ile bilinen bir uzunluğu (kapı genişliği, park yeri, cephe) ölçün, **Ölçeği
kalibre et**'e basıp gerçek değeri girin; ekranda çıkan sayıyı ekleyin:

```jsonc
      "scan": { "date": "2025-04-09", "metersPerUnit": 77.16 }
```

---

## Sık yapılan hatalar

- **Koordinatı bina merkezinden almak.** Yol tarifi girişe götürmelidir.
- **`grossArea_m2` içine birim yazmak.** Sayı olmalı: `8200`, `"8200 m²"` değil.
- **Tahmini yıl/kat yazmak.** Teyit yoksa alan hiç eklenmez.
- **`units[].url` için http.** Şema yalnızca `https://` (ya da `http://`) ile
  başlayan tam adres kabul eder; göreli yol geçersizdir.
- **Şemayı atlamak.** `python3 tools/doctor.py` şema hatasını satır satır bildirir.
