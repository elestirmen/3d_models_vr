#!/usr/bin/env bash
set -euo pipefail

if ! command -v gltfpack >/dev/null 2>&1; then
  echo "Error: gltfpack bulunamadı. Kurulum için: npm i -g gltfpack" >&2
  exit 1
fi

shopt -s globstar nullglob

echo "Optimizing .gltf files to compressed .glb (with mesh quantization)..."
for f in **/*.gltf; do
  out="${f%.gltf}.glb"
  echo "- $f -> $out"
  #
  # Açıklama:
  #  - no texture changes; sadece mesh quantization + iç içe paket
  #  - kaliteyi korumak için varsayılanlar çoğu bina modeli için uygundur
  #  - daha agresif için: gltfpack -i "$f" -o "$out" -cc
  #
  gltfpack -i "$f" -o "$out"
done

echo "Bitti. viewer.html 'model=' parametresinde .glb yollarını tercih edebilirsiniz."

