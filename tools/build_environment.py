#!/usr/bin/env python3
"""Kampüs modelleri için stüdyo tipi HDR ortam haritası üretir.

Neden elle üretiliyor? Hazır HDRI'lar ya çok büyük ya da lisans/atıf
gerektiriyor. Burada üretilen harita küçük (≈70 KB), atıf gerektirmiyor ve
tek bir yumuşak güneş + gökyüzü gradyanı + nötr zemin yansımasından oluşuyor:
fotogrametri cephelerini yönlü ışıkla ayırmaya yeterli, IBL için zaten
bulanıklaştırılıyor.

Çıktı: assets/env/campus-studio.hdr  (Radiance RGBE, eşdikdörtgen)

Kullanım:
  python3 tools/build_environment.py
  python3 tools/build_environment.py --width 384 --sun-elevation 45
"""

from __future__ import annotations

import argparse
import math
import struct
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT_DIR / "assets/env/campus-studio.hdr"

# Doğrusal (linear) renkler; tonlama model-viewer tarafında yapılır.
ZENITH = (0.42, 0.52, 0.72)
HORIZON = (0.86, 0.88, 0.90)
GROUND = (0.26, 0.25, 0.23)
SUN_COLOR = (1.0, 0.95, 0.86)


def _rgbe(r: float, g: float, b: float) -> bytes:
  """Doğrusal RGB üçlüsünü 4 baytlık RGBE'ye çevirir."""
  peak = max(r, g, b)
  if peak < 1e-8:
    return bytes((0, 0, 0, 0))
  mantissa, exponent = math.frexp(peak)
  scale = mantissa * 256.0 / peak
  return bytes((
    min(255, int(r * scale)),
    min(255, int(g * scale)),
    min(255, int(b * scale)),
    max(0, min(255, exponent + 128)),
  ))


def _sky(direction: tuple[float, float, float], sun: tuple[float, float, float],
         *, sun_intensity: float, sun_angle: float) -> tuple[float, float, float]:
  x, y, z = direction

  if y >= 0:
    # Zenite doğru yumuşak gradyan.
    t = y ** 0.55
    base = tuple(HORIZON[i] * (1 - t) + ZENITH[i] * t for i in range(3))
  else:
    # Zemin: sert bir yansıma yerine nötr, hafif bir dolgu.
    t = min(1.0, (-y) ** 0.7)
    base = tuple(HORIZON[i] * (1 - t) + GROUND[i] * t for i in range(3))

  # Güneş: açısal yarıçap içinde yumuşak (smoothstep) düşüş.
  cosine = max(-1.0, min(1.0, x * sun[0] + y * sun[1] + z * sun[2]))
  angle = math.acos(cosine)
  if angle < sun_angle:
    falloff = 1.0 - (angle / sun_angle)
    weight = falloff * falloff * (3 - 2 * falloff)
    return tuple(base[i] + SUN_COLOR[i] * sun_intensity * weight for i in range(3))

  # Güneş çevresinde geniş, çok zayıf bir hale (yumuşak yönlülük).
  halo_angle = sun_angle * 4.0
  if angle < halo_angle:
    falloff = 1.0 - (angle / halo_angle)
    return tuple(base[i] * (1.0 + 0.35 * falloff * falloff) for i in range(3))

  return base


def build(width: int, sun_azimuth: float, sun_elevation: float,
          sun_intensity: float, sun_angle_deg: float, output: Path) -> None:
  height = width // 2
  azimuth = math.radians(sun_azimuth)
  elevation = math.radians(sun_elevation)
  sun = (
    math.cos(elevation) * math.sin(azimuth),
    math.sin(elevation),
    math.cos(elevation) * math.cos(azimuth),
  )
  sun_angle = math.radians(sun_angle_deg)

  rows: list[bytes] = []
  for row in range(height):
    # v: 0 (tepe) -> 1 (dip)
    theta = math.pi * (row + 0.5) / height
    sin_theta = math.sin(theta)
    cos_theta = math.cos(theta)
    scanline = bytearray()
    for column in range(width):
      phi = 2 * math.pi * (column + 0.5) / width - math.pi
      direction = (sin_theta * math.sin(phi), cos_theta, -sin_theta * math.cos(phi))
      scanline += _rgbe(*_sky(direction, sun, sun_intensity=sun_intensity, sun_angle=sun_angle))
    rows.append(bytes(scanline))

  header = (
    "#?RADIANCE\n"
    "# OKU Dijital Yerleske - uretilmis studyo ortami\n"
    "FORMAT=32-bit_rle_rgbe\n"
    "\n"
    f"-Y {height} +X {width}\n"
  ).encode("ascii")

  output.parent.mkdir(parents=True, exist_ok=True)
  # Sıkıştırmasız (flat) RGBE tarama satırları: RGBELoader bu biçimi de okur.
  output.write_bytes(header + b"".join(rows))
  print(f"{output.relative_to(ROOT_DIR)} yazıldı — {width}x{height}, "
        f"{output.stat().st_size / 1024:.0f} KB")


def main() -> int:
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument("--width", type=int, default=192, help="eşdikdörtgen genişlik (varsayılan 192)")
  parser.add_argument("--sun-azimuth", type=float, default=135.0)
  parser.add_argument("--sun-elevation", type=float, default=38.0)
  parser.add_argument("--sun-intensity", type=float, default=16.0)
  parser.add_argument("--sun-angle", type=float, default=7.0, help="güneşin açısal yarıçapı (derece)")
  parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
  args = parser.parse_args()

  if args.width % 2 != 0 or args.width < 32:
    print("ERROR: --width çift ve en az 32 olmalı")
    return 2

  build(args.width, args.sun_azimuth, args.sun_elevation,
        args.sun_intensity, args.sun_angle, args.output)
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
