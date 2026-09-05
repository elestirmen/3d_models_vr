#!/usr/bin/env python3
"""Bina modellerinin kampüs planı üzerindeki konumunu ÖLÇEREK bulur.

Neden gerekli? Harita işaretçileri göz kararıyla yerleştirilirse uydurma
veri üretilmiş olur. Bunun yerine her bina modelinin tepeden render'ı,
yerleşke genel planının tepeden render'ı içinde aranır: iki görüntü de aynı
renderer ve aynı HDR ile üretildiği için renk/doku doğrudan karşılaştırılabilir.

Yöntem: ölçek ve dönüş taraması + normalize çapraz korelasyon
(skimage.feature.match_template). Model kendi koordinat sisteminde normalize
olduğu için ölçek ve dönüş bilinmez, bu yüzden taranır.

Çıktı, `models.json` içine yapıştırılabilecek `map` alanlarıdır. Skoru eşiğin
altında kalan model YERLEŞTİRİLMEZ — yanlış işaretçi, işaretçi olmamasından
kötüdür.

Kullanım:
  python3 tools/locate_models.py                    # tümü
  python3 tools/locate_models.py kutuphane fabrika  # seçili
  python3 tools/locate_models.py --write            # models.json'a yaz
  python3 tools/locate_models.py --min-score=0.32   # eşiği değiştir
  python3 tools/locate_models.py --crop=1.0          # kırpmayı kapat (tüm şablon)

Önkoşul: tools/build_map.mjs ile hem plan hem de her model için tepeden
render üretilmiş olmalı (probe-<id>.webp).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from skimage.feature import match_template

ROOT_DIR = Path(__file__).resolve().parents[1]
MAP_DIR = ROOT_DIR / "assets/map"
PLAN_PATH = MAP_DIR / "campus-plan.webp"

WORK_WIDTH = 420          # çalışma çözünürlüğü (hız/doğruluk dengesi)
DEFAULT_SCALE_MIN = 0.10
DEFAULT_SCALE_MAX = 0.46
DEFAULT_SCALE_STEP = 0.02
DEFAULT_ANGLE_STEP = 10
DEFAULT_MIN_SCORE = 0.35
# Şablonun kenarları modelin kendi tarama sınırıdır ve planda karşılığı
# yoktur; merkezden kırpmak skorları belirgin yükseltir (0,26→0,43).
DEFAULT_CROP = 0.6


def _features(image: Image.Image) -> tuple[np.ndarray, np.ndarray]:
  """Parlaklık + (kırmızı−yeşil) kanalı: kiremit çatıyı ayırt eder."""
  array = np.asarray(image.convert("RGBA"), dtype=np.float32) / 255.0
  rgb, alpha = array[..., :3], array[..., 3]
  luma = rgb @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
  red_green = (rgb[..., 0] - rgb[..., 1]) * 2.0
  return np.stack([luma, red_green], axis=0), alpha


def _load_plan() -> tuple[np.ndarray, np.ndarray, tuple[int, int]]:
  image = Image.open(PLAN_PATH)
  size = image.size
  scaled = image.resize(
    (WORK_WIDTH, max(1, round(image.height * WORK_WIDTH / image.width))),
    Image.LANCZOS,
  )
  features, alpha = _features(scaled)
  return features, alpha, size


def locate(model_id: str, plan: np.ndarray, plan_alpha: np.ndarray,
           scales, angles, crop_ratio: float = 1.0) -> dict | None:
  probe = MAP_DIR / f"probe-{model_id}.webp"
  if not probe.is_file():
    print(f"  ! {model_id}: {probe.name} yok — önce tools/build_map.mjs --model={model_id} "
          f"--name=probe-{model_id} çalıştırın")
    return None

  source = Image.open(probe).convert("RGBA")
  if crop_ratio < 1.0:
    # Tarama kenarları (düzensiz plaka sınırı) plan görselinde bulunmaz ve
    # korelasyonu bozar; merkezden kırpmak binanın kendisine odaklar.
    width, height = source.size
    dx, dy = width * (1 - crop_ratio) / 2, height * (1 - crop_ratio) / 2
    source = source.crop((int(dx), int(dy), int(width - dx), int(height - dy)))
  plan_height, plan_width = plan.shape[1:]
  best: dict | None = None

  for scale in scales:
    target_width = max(8, round(plan_width * float(scale)))
    for angle in angles:
      rotated = source.rotate(angle, expand=True, resample=Image.BICUBIC)
      template = rotated.resize(
        (target_width, max(8, round(rotated.height * target_width / rotated.width))),
        Image.LANCZOS,
      )
      features, alpha = _features(template)
      if features.shape[1] >= plan_height or features.shape[2] >= plan_width:
        continue
      mask = alpha > 0.6
      if mask.sum() < 60:
        continue

      # Saydam alanlar şablonun ortalamasıyla doldurulur: mean çıkarıldıktan
      # sonra korelasyona katkıları ~0 olur.
      score = 0.0
      for channel in range(features.shape[0]):
        plane = features[channel].copy()
        plane[~mask] = plane[mask].mean()
        response = match_template(plan[channel], plane, pad_input=False)
        if channel == 0:
          combined = response
        else:
          combined = combined + response
      combined = combined / features.shape[0]

      index = int(np.argmax(combined))
      y_index, x_index = np.unravel_index(index, combined.shape)
      score = float(combined[y_index, x_index])

      # Plan tarafında saydam (kampüs dışı) bölgeye oturan eşleşmeler elenir.
      window = plan_alpha[y_index:y_index + features.shape[1],
                          x_index:x_index + features.shape[2]]
      if window.size == 0 or float((window[mask] > 0.5).mean()) < 0.85:
        continue

      if best is None or score > best["score"]:
        best = {
          "score": round(score, 4),
          "scale": round(float(scale), 3),
          "angle": int(angle),
          "x": round(float((x_index + features.shape[2] / 2) / plan_width), 4),
          "y": round(float((y_index + features.shape[1] / 2) / plan_height), 4),
        }
  return best


def main() -> int:
  parser = argparse.ArgumentParser(description=__doc__,
                                   formatter_class=argparse.RawDescriptionHelpFormatter)
  parser.add_argument("ids", nargs="*", help="model kimlikleri (boşsa tümü)")
  parser.add_argument("--min-score", type=float, default=DEFAULT_MIN_SCORE)
  parser.add_argument("--scale-min", type=float, default=DEFAULT_SCALE_MIN,
                      help="en küçük şablon ölçeği (plan genişliğine oran)")
  parser.add_argument("--scale-max", type=float, default=DEFAULT_SCALE_MAX,
                      help="en büyük şablon ölçeği; büyük yerleşkeler için artırın")
  parser.add_argument("--scale-step", type=float, default=DEFAULT_SCALE_STEP)
  parser.add_argument("--angle-step", type=int, default=DEFAULT_ANGLE_STEP)
  parser.add_argument("--crop", type=float, default=DEFAULT_CROP,
                      help="şablonu merkezden kırp (0.6 = orta %%60); tarama kenarlarını eler")
  parser.add_argument("--write", action="store_true",
                      help="eşiği geçen sonuçları models.json'a yaz (confirmed: false)")
  args = parser.parse_args()

  if not PLAN_PATH.is_file():
    print(f"ERROR: {PLAN_PATH} yok. Önce: node tools/build_map.mjs")
    return 2

  manifest = json.loads((ROOT_DIR / "models.json").read_text(encoding="utf-8"))
  models = manifest.get("models", [])
  wanted = set(args.ids)
  plan, plan_alpha, plan_size = _load_plan()
  scales = np.arange(args.scale_min, args.scale_max + 1e-9, args.scale_step)
  angles = list(range(0, 360, max(1, args.angle_step)))
  print(f"Plan: {plan_size[0]}x{plan_size[1]} → çalışma {plan.shape[2]}x{plan.shape[1]}, "
        f"ölçek {args.scale_min:.2f}–{args.scale_max:.2f} ({len(scales)} adım) × {len(angles)} açı\n")

  results: dict[str, dict] = {}
  for model in models:
    model_id = str(model["id"])
    if wanted and model_id not in wanted:
      continue
    if model_id == "oku_genel_plan":
      continue  # planın kendisi
    best = locate(model_id, plan, plan_alpha, scales, angles, args.crop)
    if not best:
      continue
    at_edge = (abs(best["scale"] - args.scale_min) < 1e-6
               or abs(best["scale"] - args.scale_max) < args.scale_step)
    verdict = "kabul" if best["score"] >= args.min_score else "ZAYIF — yerleştirilmedi"
    if at_edge and best["score"] < args.min_score:
      verdict += " (ölçek arama sınırında: aralığı genişletmeyi deneyin)"
    print(f"  {model_id:16s} skor {best['score']:.3f}  "
          f"({best['x']:.3f}, {best['y']:.3f})  ölçek {best['scale']}  açı {best['angle']}°  → {verdict}")
    if best["score"] >= args.min_score:
      results[model_id] = best

  print("\nmodels.json için:")
  print(json.dumps(
    {mid: {"map": {"x": r["x"], "y": r["y"], "confirmed": False}} for mid, r in results.items()},
    ensure_ascii=False, indent=2))

  if args.write and results:
    for model in models:
      match = results.get(str(model["id"]))
      if match:
        model["map"] = {"x": match["x"], "y": match["y"], "confirmed": False}
    (ROOT_DIR / "models.json").write_text(
      json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\nmodels.json güncellendi ({len(results)} model). "
          "Konumlar 'confirmed: false' — haritada doğrulanmadı işaretiyle görünür.")
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
