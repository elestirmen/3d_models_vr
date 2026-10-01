#!/usr/bin/env python3
"""Bina tanıtım sayfaları için harita kesitleri ve ana sayfa önizleme türevi.

Kampüs planı görselinden (assets/map/campus-plan.webp) her binanın harita
noktası çevresinde küçük bir kesit alınır: assets/map/crops/<id>.avif|webp.
Kesit görselin kenarına taşarsa içeri kaydırılır; işaretçinin kesit içindeki
konumu assets/map/crops/crops.json'a yazılır (sayfa SVG ile işaretler).

Kullanım: python3 tools/build_map_crops.py   (ImageMagick 7 gerekir)
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/map/campus-plan.webp"
OUT = ROOT / "assets/map/crops"
WIDTH, HEIGHT = 640, 400


def main() -> int:
  manifest = json.loads((ROOT / "models.json").read_text(encoding="utf-8"))
  meta = json.loads((ROOT / "assets/map/campus-plan.json").read_text(encoding="utf-8"))
  image_w, image_h = meta["imageSize"]["width"], meta["imageSize"]["height"]
  OUT.mkdir(parents=True, exist_ok=True)
  index = {}
  for model in manifest["models"]:
    point = model.get("map")
    if not point:
      continue
    cx, cy = point["x"] * image_w, point["y"] * image_h
    x = int(round(min(max(cx - WIDTH / 2, 0), image_w - WIDTH)))
    y = int(round(min(max(cy - HEIGHT / 2, 0), image_h - HEIGHT)))
    geometry = f"{WIDTH}x{HEIGHT}+{x}+{y}"
    for ext, quality in (("webp", "80"), ("avif", "50")):
      target = OUT / f"{model['id']}.{ext}"
      subprocess.run(["magick", str(SOURCE), "-crop", geometry, "+repage", "-background", "none",
                      "-quality", quality, str(target)], check=True)
    index[model["id"]] = {"width": WIDTH, "height": HEIGHT, "px": round(cx - x, 1), "py": round(cy - y, 1)}
    print(f"  ✓ {model['id']:<10} {geometry}")
  (OUT / "crops.json").write_text(json.dumps(index, indent=2) + "\n", encoding="utf-8")
  # Ana sayfa harita önizlemesi ~700 CSS px gösterilir: 900 px türev yeterli.
  for ext, quality in (("webp", "80"), ("avif", "50")):
    subprocess.run(["magick", str(ROOT / f"assets/map/campus-plan.{ext}"), "-resize", "900x", "-quality", quality,
                    str(ROOT / f"assets/map/campus-plan@900.{ext}")], check=True)
  print("  ✓ campus-plan@900 (ana sayfa önizlemesi)")
  print(f"{len(index)} kesit → assets/map/crops/")
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
