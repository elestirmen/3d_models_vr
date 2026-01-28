#!/usr/bin/env bash
set -euo pipefail

# Bu script artık her model klasörü altındaki `index.html` ve `responsive.html` dosyalarını
# tek kaynak olan `/viewer.html` sayfasına yönlendirir.
#
# Amaç:
# - Her klasörde ayrı ayrı model-viewer / CSS / JS taşımamak
# - Tek tip UX ve tek tip sürüm yönetimi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Error: python3 is required to URL-encode query parameters." >&2
  exit 1
fi

FOLDERS=(
  a_b_blok
  c_blok
  d_blok
  e_blok
  f_blok
  fabrika
  ilahiyat
  kutuphane
  oku_genel_plan
  rektorluk
)

declare -A MODEL_TITLES=(
  [a_b_blok]="A-B Blok"
  [c_blok]="C Blok"
  [d_blok]="D Blok"
  [e_blok]="E Blok"
  [f_blok]="F Blok"
  [fabrika]="Fabrika Yerleşkesi"
  [ilahiyat]="İlahiyat"
  [kutuphane]="Kütüphane"
  [oku_genel_plan]="OKÜ Yerleşke Genel Plan"
  [rektorluk]="Rektörlük"
)

declare -A MODEL_PATHS=(
  [a_b_blok]="a_b_blok/a_b_blok/A blok B blok Spor Tesisleri.gltf"
  [c_blok]="c_blok/c_blok/C Blok lab_ktx2.glb"
  [d_blok]="d_blok/d_blok/D Blok .gltf"
  [e_blok]="e_blok/e_blok/E Blok.gltf"
  [f_blok]="f_blok/f_blok/F Blok.gltf"
  [fabrika]="fabrika/fabrika_yerleskesi.gltf"
  [ilahiyat]="ilahiyat/ilahiyat/ilahiyat.gltf"
  [kutuphane]="kutuphane/kutuphane/Kutuphane.gltf"
  [oku_genel_plan]="oku_genel_plan/oku_genel_plan/OKÜ YERLEŞKE GENEL PLAN.gltf"
  [rektorluk]="rektorluk/rektorluk/Rektörlük Amfi.gltf"
)

declare -A MODEL_FALLBACKS=(
  # KTX2 desteklemeyen cihazlar için alternatif
  [c_blok]="c_blok/c_blok/C Blok lab.glb"
)

encode_qs() {
  local title="$1"
  local model="$2"
  local fallback="${3:-}"

  python3 - "$title" "$model" "$fallback" <<'PY'
import sys
import urllib.parse

title = sys.argv[1]
model = sys.argv[2]
fallback = sys.argv[3] if len(sys.argv) > 3 else ""

params = {"title": title, "model": model}
if fallback:
    params["fallback"] = fallback

print(urllib.parse.urlencode(params))
PY
}

write_redirect_page() {
  local out="$1"
  local url="$2"
  local url_html="${url//&/&amp;}"

  cat > "$out" <<EOF
<!doctype html>
<html lang="tr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Yönlendiriliyor…</title>
    <meta http-equiv="refresh" content="0; url=${url_html}">
    <link rel="canonical" href="${url_html}">
    <script>
      location.replace('${url}');
    </script>
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 24px; }
      a { color: #667eea; }
    </style>
  </head>
  <body>
    <p>Yönlendiriliyor… <a href="${url_html}">Devam et</a></p>
  </body>
</html>
EOF
}

echo "Updating redirect pages under: $ROOT_DIR"

for folder in "${FOLDERS[@]}"; do
  title="${MODEL_TITLES[$folder]}"
  model="${MODEL_PATHS[$folder]}"
  fallback="${MODEL_FALLBACKS[$folder]:-}"

  folder_path="$ROOT_DIR/$folder"
  if [[ ! -d "$folder_path" ]]; then
    echo "WARN: Folder not found: $folder_path" >&2
    continue
  fi

  if [[ ! -f "$ROOT_DIR/$model" ]]; then
    echo "WARN: Model file not found: $model" >&2
  fi
  if [[ -n "$fallback" && ! -f "$ROOT_DIR/$fallback" ]]; then
    echo "WARN: Fallback model file not found: $fallback" >&2
  fi

  qs="$(encode_qs "$title" "$model" "$fallback")"
  url="/viewer.html?${qs}"

  write_redirect_page "$folder_path/index.html" "$url"
  write_redirect_page "$folder_path/responsive.html" "$url"

  echo "✔ $folder/index.html -> $url"
done

echo "Done."
