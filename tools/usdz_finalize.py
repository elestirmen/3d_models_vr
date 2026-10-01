#!/usr/bin/env python3
"""three.js'in ürettiği ham USDZ'yi iPhone/iPad AR Quick Look için sonlandırır.

  1. JPEG dokular yeniden sıkıştırılır (Pillow, kalite --jpeg-quality).
  2. Gömülü UV dönüşümü sonrası birim (etkisiz) UsdTransform2d düğümleri
     kaldırılır; UsdUVTexture doğrudan UsdPrimvarReader_float2'ye bağlanır.
  3. Sahne düzleştirilip tek katmanlı ikili crate (.usdc) olarak yazılır:
     ASCII .usda'ya göre hem küçük hem cihazda hızlı açılır. Düzleştirme doku
     yollarını mutlaklaştırır; paket içinde göreli kalsınlar diye geri
     çevrilir.
  4. UsdUtils.CreateNewARKitUsdzPackage ile paketlenir (64 bayt hizalı,
     sıkıştırmasız zip — Quick Look'un istediği biçim).
  5. Denetim: `usdchecker --arkit` kuralları (OpenUSD v25.08
     complianceChecker, tools/vendor/openusd) ve OpenUSD 26 doğrulama
     çerçevesinin USDZ/geometri/malzeme denetçileri. Hata varsa çıkış 1.

Pixar OpenUSD gerekir:
  python3 -m venv tools/.venv && tools/.venv/bin/pip install -r tools/requirements-usd.txt
  tools/.venv/bin/python tools/usdz_finalize.py --in ham.usdz --out cikti.usdz

Çıktı: stdout'a tek satır JSON özet (bayt, sha256, üçgen, doku, uyarılar).
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import io
import json
import os
import shutil
import struct
import sys
import tempfile
import zipfile
from pathlib import Path

try:
  from PIL import Image
  from pxr import Gf, Sdf, Usd, UsdGeom, UsdShade, UsdUtils, UsdValidation
except ModuleNotFoundError as error:  # pragma: no cover - kurulum yönergesi
  print(f"HATA: {error.name} yok. python3 -m venv tools/.venv && tools/.venv/bin/pip install -r tools/requirements-usd.txt", file=sys.stderr)
  sys.exit(2)

CHECKER_PATH = Path(__file__).resolve().parent / "vendor" / "openusd" / "complianceChecker.py"
# Yeni doğrulama çerçevesinin anahtar sözcükleri (fizik/iskelet bu modelde yok).
VALIDATOR_KEYWORDS = ["UsdzValidators", "UsdCoreValidators", "UsdGeomValidators", "UsdShadeValidators"]


def load_compliance_checker():
  spec = importlib.util.spec_from_file_location("oku_compliance_checker", CHECKER_PATH)
  module = importlib.util.module_from_spec(spec)
  spec.loader.exec_module(module)
  return module.ComplianceChecker


def recompress_jpegs(root: Path, quality: int) -> int:
  count = 0
  for path in sorted((root / "textures").glob("*.jpg")):
    with Image.open(path) as image:
      rgb = image.convert("RGB")
    # Taban (baseline) JPEG: Quick Look ilerlemeli JPEG'i her sürümde açmayabilir.
    rgb.save(path, "JPEG", quality=quality, optimize=True, progressive=False)
    count += 1
  return count


def is_identity_transform(shader: UsdShade.Shader) -> bool:
  def value(name, default):
    attr = shader.GetInput(name)
    current = attr.Get() if attr else None
    return default if current is None else current
  scale = value("scale", Gf.Vec2f(1, 1))
  translation = value("translation", Gf.Vec2f(0, 0))
  rotation = value("rotation", 0.0)
  return (abs(scale[0] - 1) < 1e-6 and abs(scale[1] - 1) < 1e-6
          and abs(translation[0]) < 1e-6 and abs(translation[1]) < 1e-6 and abs(rotation) < 1e-6)


def strip_identity_transforms(stage: Usd.Stage) -> int:
  removed = []
  for prim in stage.Traverse():
    shader = UsdShade.Shader(prim)
    if not shader or shader.GetIdAttr().Get() != "UsdUVTexture":
      continue
    st = shader.GetInput("st")
    if not st:
      continue
    sources = st.GetConnectedSources()[0]
    if not sources:
      continue
    transform = UsdShade.Shader(sources[0].source.GetPrim())
    if not transform or transform.GetIdAttr().Get() != "UsdTransform2d" or not is_identity_transform(transform):
      continue
    upstream = transform.GetInput("in").GetConnectedSources()[0]
    if not upstream:
      continue
    st.ConnectToSource(upstream[0].source, upstream[0].sourceName)
    removed.append(transform.GetPath())
  for path in sorted(set(removed)):
    stage.RemovePrim(path)
  return len(set(removed))


def relativize_assets(layer: Sdf.Layer, base: Path) -> int:
  """Düzleştirmenin mutlaklaştırdığı doku yollarını yeniden göreli yapar."""
  fixed = 0
  prefix = str(base.resolve()) + os.sep

  def visit(path: Sdf.Path) -> None:
    nonlocal fixed
    if not path.IsPropertyPath():
      return
    spec = layer.GetAttributeAtPath(path)
    if not spec or spec.typeName != Sdf.ValueTypeNames.Asset or not spec.HasDefaultValue():
      return
    value = spec.default
    if value.path.startswith(prefix):
      spec.default = Sdf.AssetPath(value.path[len(prefix):])
      fixed += 1

  layer.Traverse(Sdf.Path.absoluteRootPath, visit)
  return fixed


def check_package(path: Path) -> tuple[list[str], list[str]]:
  checker = load_compliance_checker()(arkit=True, skipARKitRootLayerCheck=False, rootPackageOnly=False, skipVariants=False, verbose=False)
  checker.CheckCompliance(str(path))
  errors = list(checker.GetErrors()) + [f"başarısız denetim: {name}" for name in checker.GetFailedChecks()]
  warnings = list(checker.GetWarnings())
  # OpenUSD 26 doğrulama çerçevesi: ayrı uygulanmış ikinci bir göz.
  registry = UsdValidation.ValidationRegistry()
  validators = registry.GetOrLoadValidatorsByName(
    [meta.name for meta in registry.GetValidatorMetadataForKeywords(VALIDATOR_KEYWORDS)])
  stage = Usd.Stage.Open(str(path))
  for error in UsdValidation.ValidationContext(validators).Validate(stage):
    message = f"{error.GetName()}: {error.GetMessage()}"
    if error.GetType() == UsdValidation.ValidationErrorType.Error:
      errors.append(message)
    elif error.GetType() == UsdValidation.ValidationErrorType.Warn:
      warnings.append(message)
  return errors, warnings


def normalize_zip_timestamps(path: Path) -> None:
  """Zip girişlerinin tarihini 1980-01-01'e sabitler: aynı girdi → aynı bayt
  (Git LFS her üretimde yeni nesne saklamaz). Başlık alanları yerinde
  yazılır; boyutlar, CRC ve 64 bayt hizası değişmez."""
  data = bytearray(path.read_bytes())
  dos_time, dos_date = 0, (1 << 5) | 1
  with zipfile.ZipFile(io.BytesIO(bytes(data))) as archive:
    offsets = [info.header_offset for info in archive.infolist()]
  for offset in offsets:
    if data[offset:offset + 4] != b"PK\x03\x04":
      raise RuntimeError("beklenmeyen zip yerel başlığı")
    struct.pack_into("<HH", data, offset + 10, dos_time, dos_date)
  end = data.rfind(b"PK\x05\x06")
  size, start = struct.unpack_from("<II", data, end + 12)
  position = start
  while position < start + size:
    if data[position:position + 4] != b"PK\x01\x02":
      raise RuntimeError("beklenmeyen zip merkezi dizin girişi")
    struct.pack_into("<HH", data, position + 12, dos_time, dos_date)
    name, extra, comment = struct.unpack_from("<HHH", data, position + 28)
    position += 46 + name + extra + comment
  path.write_bytes(bytes(data))


def scene_stats(stage: Usd.Stage) -> dict:
  meshes = triangles = points = 0
  for prim in stage.Traverse():
    if prim.IsA(UsdGeom.Mesh):
      mesh = UsdGeom.Mesh(prim)
      counts = mesh.GetFaceVertexCountsAttr().Get() or []
      meshes += 1
      triangles += sum(max(0, c - 2) for c in counts)
      points += len(mesh.GetPointsAttr().Get() or [])
  return {"meshes": meshes, "triangles": triangles, "points": points}


def finalize(raw: Path, out: Path, quality: int) -> dict:
  work = Path(tempfile.mkdtemp(prefix="oku-usdz-"))
  try:
    with zipfile.ZipFile(raw) as archive:
      archive.extractall(work)
    jpegs = recompress_jpegs(work, quality)
    stage = Usd.Stage.Open(str(work / "model.usda"))
    removed = strip_identity_transforms(stage)
    flat = stage.Flatten()
    # Düzleştirme açıklamaya geçici dizin yolunu yazar: hem bayt bayt aynılığı
    # bozar hem yayımlanan dosyaya yerel yol sızdırır.
    flat.documentation = "OKÜ Dijital Yerleşke — AR Quick Look (tools/build_usdz.mjs)"
    relativize_assets(flat, work)
    usdc = work / "model.usdc"
    flat.Export(str(usdc))
    out.parent.mkdir(parents=True, exist_ok=True)
    temp_out = out.with_name(out.stem + ".tmp.usdz")
    temp_out.unlink(missing_ok=True)
    if not UsdUtils.CreateNewARKitUsdzPackage(Sdf.AssetPath(str(usdc)), str(temp_out)):
      raise RuntimeError("CreateNewARKitUsdzPackage başarısız")
    normalize_zip_timestamps(temp_out)

    errors, warnings = check_package(temp_out)
    if errors:
      temp_out.unlink(missing_ok=True)
      return {"ok": False, "errors": errors, "warnings": warnings}
    temp_out.replace(out)

    packaged = Usd.Stage.Open(str(out))
    with zipfile.ZipFile(out) as archive:
      names = archive.namelist()
    data = out.read_bytes()
    return {
      "ok": True,
      "bytes": len(data),
      "sha256": hashlib.sha256(data).hexdigest(),
      "files": len(names),
      "rootLayer": names[0],
      "jpegs": jpegs,
      "transformsRemoved": removed,
      "metersPerUnit": UsdGeom.GetStageMetersPerUnit(packaged),
      "upAxis": UsdGeom.GetStageUpAxis(packaged),
      **scene_stats(packaged),
      "warnings": warnings,
    }
  finally:
    shutil.rmtree(work, ignore_errors=True)


def main() -> int:
  parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
  parser.add_argument("--in", dest="raw", required=True, type=Path)
  parser.add_argument("--out", required=True, type=Path)
  parser.add_argument("--jpeg-quality", type=int, default=85)
  args = parser.parse_args()
  result = finalize(args.raw, args.out, args.jpeg_quality)
  print(json.dumps(result, ensure_ascii=False))
  return 0 if result["ok"] else 1


if __name__ == "__main__":
  sys.exit(main())
