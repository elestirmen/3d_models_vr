#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT_DIR / "models.json"
DEFAULT_IDS = ("a_b_blok", "kutuphane", "oku_genel_plan", "rektorluk")
TIERS = (
  (
    "low",
    ("-cc", "-si", "0.08", "-se", "0.025", "-sp", "-tc", "-tq", "5", "-tl", "512", "-tj", "2"),
  ),
  (
    "medium",
    ("-cc", "-si", "0.30", "-se", "0.012", "-sp", "-tc", "-tq", "7", "-tl", "1024", "-tj", "2"),
  ),
  (
    "high",
    ("-cc", "-tc", "-tq", "8", "-tl", "2048", "-tj", "2"),
  ),
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
  if model.get("geometryLod") and fallback.lower().endswith(".gltf"):
    return fallback
  if primary.lower().endswith(".gltf"):
    return primary
  return ""


def _build_tier(
  *,
  gltfpack: str,
  source: Path,
  output: Path,
  report: Path,
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
    command = [
      gltfpack,
      "-i", str(source),
      "-o", str(temp_output),
      *flags,
      "-r", str(temp_report),
    ]
    print("  build", output.stem)
    subprocess.run(command, check=True)
    os.replace(temp_output, output)
    os.replace(temp_report, report)


def _tier_info(name: str, output: Path, report: Path) -> dict[str, Any]:
  report_data = _read_json(report)
  return {
    "id": name,
    "src": output.relative_to(output.parent.parent).as_posix(),
    "bytes": output.stat().st_size,
    "triangles": int(report_data.get("render", {}).get("triangleCount", 0)),
  }


def main() -> int:
  parser = argparse.ArgumentParser(
    description="Build three progressive mesh+texture GLB tiers for large gallery models.",
  )
  parser.add_argument("--ids", nargs="+", default=list(DEFAULT_IDS), help="model ids to process")
  parser.add_argument("--overwrite", action="store_true", help="rebuild existing tier files")
  parser.add_argument(
    "--gltfpack",
    default=str(ROOT_DIR / "tools" / "bin" / "gltfpack"),
    help="gltfpack executable",
  )
  args = parser.parse_args()

  gltfpack = shutil.which(args.gltfpack) or args.gltfpack
  if not Path(gltfpack).is_file():
    raise FileNotFoundError(f"gltfpack not found: {args.gltfpack}")

  manifest = _read_json(MANIFEST_PATH)
  models = {str(item.get("id", "")): item for item in manifest.get("models", [])}

  for model_id in args.ids:
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
    for tier_name, flags in TIERS:
      output = output_dir / f"{tier_name}.glb"
      report = output_dir / f"{tier_name}.report.json"
      _build_tier(
        gltfpack=gltfpack,
        source=source,
        output=output,
        report=report,
        flags=flags,
        overwrite=args.overwrite,
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

    sizes = ", ".join(
      f"{item['id']}={item['bytes'] / 1024 / 1024:.1f} MB/{item['triangles']:,} üçgen"
      for item in tier_entries
    )
    print(f"  {sizes}")

  _write_json(MANIFEST_PATH, manifest)
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
