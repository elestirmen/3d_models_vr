#!/usr/bin/env python3
"""Geometri kademeleri (low / medium / high GLB) ve kademe künyesi üretir.

Hafif ve orta kademe önce tools/simplify_lod.mjs ile sadeleştirilir: kaynak
ağın bütün malzeme parçaları birlikte, dikişler korunarak. (gltfpack -si her
parçayı ayrı sadeleştiriyor, parça sınırlarında çatlak açıyordu.) Sonra
gltfpack yalnızca nicemleme, Meshopt sıkıştırması ve KTX2 dokuları uygular.

Künye (<kaynak>.geometry-lod.json) her kademenin sha256'sını taşır; görüntüleyici
kademe adresini bununla damgalar (?v=…), yeniden üretilen kademe önbellekten
eski hâliyle dönmez. Kademe değişince `make usdz`, `make posters` ve
`make turntables` de yeniden çalıştırılmalıdır (bu kademelerden üretilirler).

Kullanım:
  python3 tools/build_geometry_lods.py                       # eksik kademeler
  python3 tools/build_geometry_lods.py --overwrite --tiers low medium
  python3 tools/build_geometry_lods.py --ids e_blok --overwrite
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT_DIR / "models.json"
SIMPLIFIER = ROOT_DIR / "tools" / "simplify_lod.mjs"
# (ad, (üçgen oranı, en büyük göreli hata) ya da None, gltfpack bayrakları)
TIERS = (
  ("low", (0.08, 0.025), ("-cc", "-tc", "-tq", "5", "-tl", "512", "-tj", "2")),
  ("medium", (0.30, 0.012), ("-cc", "-tc", "-tq", "7", "-tl", "1024", "-tj", "2")),
  # Kaynak doku boyutunu koru; yalnız KTX2/Basis sıkıştırması uygula.
  # -tl verilmediğinde gltfpack özgün piksel çözünürlüğünü sınırlandırmaz.
  ("high", None, ("-cc", "-tc", "-tq", "10", "-tj", "2")),
)


def _read_json(path: Path) -> dict[str, Any]:
  return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, data: dict[str, Any]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  temporary = path.with_name(f".{path.name}.tmp")
  temporary.write_text(
    json.dumps(data, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
  )
  os.replace(temporary, path)


def _safe_rel(path: str) -> bool:
  if not path or path.startswith(("/", "\\", "//")) or ":" in path:
    return False
  return ".." not in Path(path).parts


def _source_model(model: dict[str, Any]) -> str:
  fallback = str(model.get("fallback", "")).strip()
  primary = str(model.get("model", "")).strip()
  # Her kademeyi özgün, tam kaliteli kaynaktan üret; ara/ölçeklenmiş bir
  # türev kaynak alınırsa üst kademelere düşük çözünürlüklü dokular taşınır.
  if fallback.lower().endswith(".gltf"):
    return fallback
  if primary.lower().endswith(".gltf"):
    return primary
  return ""


def _build_tier(
  *,
  gltfpack: str,
  node: str,
  source: Path,
  output: Path,
  report: Path,
  simplify: tuple[float, float] | None,
  flags: tuple[str, ...],
  overwrite: bool,
) -> None:
  if output.is_file() and report.is_file() and not overwrite:
    print(f"  reuse {output.relative_to(ROOT_DIR)}")
    return

  output.parent.mkdir(parents=True, exist_ok=True)
  with tempfile.TemporaryDirectory(prefix=".geometry-lod-", dir=output.parent) as temporary_dir:
    temporary = Path(temporary_dir)
    temp_output = temporary / output.name
    temp_report = temporary / report.name
    packed_source = source
    print("  build", output.stem)
    if simplify:
      ratio, error = simplify
      packed_source = temporary / "simplified.gltf"
      result = subprocess.run(
        [node, str(SIMPLIFIER), str(source), str(packed_source), f"--ratio={ratio}", f"--error={error}"],
        check=True, capture_output=True, text=True,
      )
      stats = json.loads(result.stdout.strip().splitlines()[-1])
      print(f"    sadeleştirme: {stats['sourceTriangles']:,} → {stats['triangles']:,} üçgen, "
            f"hata {stats['error']}, açık kenar {stats['open']:,}")
    command = [
      gltfpack,
      "-i", str(packed_source),
      "-o", str(temp_output),
      *flags,
      "-r", str(temp_report),
    ]
    subprocess.run(command, check=True)
    os.replace(temp_output, output)
    os.replace(temp_report, report)


def _sha256(path: Path) -> str:
  digest = hashlib.sha256()
  with path.open("rb") as handle:
    for chunk in iter(lambda: handle.read(1 << 20), b""):
      digest.update(chunk)
  return digest.hexdigest()


def _tier_info(name: str, output: Path, report: Path) -> dict[str, Any]:
  report_data = _read_json(report)
  return {
    "id": name,
    "src": output.relative_to(output.parent.parent).as_posix(),
    "bytes": output.stat().st_size,
    "triangles": int(report_data.get("render", {}).get("triangleCount", 0)),
    # Git LFS oid'i ile aynı değer; görüntüleyici adresi bununla damgalar.
    "sha256": _sha256(output),
  }


def main() -> int:
  parser = argparse.ArgumentParser(
    description="Build three progressive mesh+texture GLB tiers for large gallery models.",
  )
  parser.add_argument("--ids", nargs="+", help="model ids to process (default: every model with a .gltf source)")
  parser.add_argument(
    "--tiers",
    nargs="+",
    choices=[name for name, _simplify, _flags in TIERS],
    default=[name for name, _simplify, _flags in TIERS],
    help="tiers to rebuild when --overwrite is used",
  )
  parser.add_argument("--overwrite", action="store_true", help="rebuild existing tier files")
  parser.add_argument(
    "--gltfpack",
    default=str(ROOT_DIR / "tools" / "bin" / "gltfpack"),
    help="gltfpack executable",
  )
  parser.add_argument("--node", default=os.environ.get("NODE", "node"), help="node executable (tools/simplify_lod.mjs)")
  args = parser.parse_args()

  gltfpack = shutil.which(args.gltfpack) or args.gltfpack
  if not Path(gltfpack).is_file():
    raise FileNotFoundError(f"gltfpack not found: {args.gltfpack}")
  node = shutil.which(args.node) or args.node

  manifest = _read_json(MANIFEST_PATH)
  models = {str(item.get("id", "")): item for item in manifest.get("models", [])}
  ids = args.ids or [model_id for model_id, item in models.items() if _source_model(item)]

  for model_id in ids:
    if model_id not in models:
      raise ValueError(f"Unknown model id: {model_id}")
    model = models[model_id]
    source_rel = _source_model(model)
    if not source_rel or not _safe_rel(source_rel):
      raise ValueError(f"{model_id}: a safe source .gltf is required")
    source = ROOT_DIR / source_rel
    if not source.is_file():
      raise FileNotFoundError(source_rel)

    output_dir = source.with_name(f"{source.stem}.geometry-lod")
    sidecar = source.with_name(f"{source.stem}.geometry-lod.json")
    print(f"{model_id}: {source_rel}")

    tier_entries: list[dict[str, Any]] = []
    for tier_name, simplify, flags in TIERS:
      output = output_dir / f"{tier_name}.glb"
      report = output_dir / f"{tier_name}.report.json"
      _build_tier(
        gltfpack=gltfpack,
        node=node,
        source=source,
        output=output,
        report=report,
        simplify=simplify,
        flags=flags,
        overwrite=args.overwrite and tier_name in args.tiers,
      )
      tier_entries.append(_tier_info(tier_name, output, report))

    sidecar_data = {
      "version": 1,
      "initial": "low",
      "thresholds": {
        "mediumEnter": 0.68,
        "mediumExit": 0.88,
        "highEnter": 0.38,
        "highExit": 0.55,
      },
      "tiers": tier_entries,
    }
    _write_json(sidecar, sidecar_data)

    model["model"] = (output_dir / "low.glb").relative_to(ROOT_DIR).as_posix()
    model["fallback"] = source_rel
    model["geometryLod"] = sidecar.relative_to(ROOT_DIR).as_posix()
    model.pop("textureLod", None)

    sizes = ", ".join(
      f"{item['id']}={item['bytes'] / 1024 / 1024:.1f} MB/{item['triangles']:,} üçgen"
      for item in tier_entries
    )
    print(f"  {sizes}")

  _write_json(MANIFEST_PATH, manifest)
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
