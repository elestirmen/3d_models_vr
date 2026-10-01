# OpenUSD uyumluluk denetçisi (ARKit kuralları)

`complianceChecker.py`, Pixar OpenUSD **v25.08** etiketindeki
`pxr/usd/usdUtils/complianceChecker.py` dosyasının **değiştirilmemiş**
kopyasıdır:

https://raw.githubusercontent.com/PixarAnimationStudios/OpenUSD/v25.08/pxr/usd/usdUtils/complianceChecker.py
(sha256 `357442bb4038f61829edee5cf82bbb6c1e27faf345c4589f32253317639158d2`)

Neden kopya: `usdchecker --arkit` ile aynı ARKit kuralları (paket hizalama,
sıkıştırmasız zip, izinli prim/gölgelendirici türleri, doku uzantıları,
paket kapsülleme…) bu Python sınıfındadır. usd-core 26.x tekerlekleri onu artık
içermiyor; Python 3.14 için daha eski tekerlek de yok. Dosya pxr 26.8 ile
çalışır (`tools/usdz_finalize.py` içe aktarır).

Lisans: OpenUSD lisansı (değiştirilmiş Apache 2.0) — https://openusd.org/license
