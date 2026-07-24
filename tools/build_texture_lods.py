#!/usr/bin/env python3
from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class TextureTask:
  source: Path
  output: Path
  max_size: int
  quality: int
  image_format: str


def _read_json(path: Path) -> dict[str, Any]:
  return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, data: dict[str, Any]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _safe_rel(path: str) -> bool:
  if not path or path.startswith(("/", "\\", "//")) or ":" in path:
    return False
  return ".." not in Path(path).parts


def _dimensions(magick: str, path: Path) -> tuple[int, int]:
  result = subprocess.run(
    [magick, "identify", "-format", "%w %h", str(path)],
    check=True,
    capture_output=True,
    text=True,
  )
  width, height = result.stdout.strip().split()
  return int(width), int(height)


def _convert(magick: str, task: TextureTask, *, overwrite: bool) -> None:
  if task.output.is_file() and not overwrite:
    return

  task.output.parent.mkdir(parents=True, exist_ok=True)
  temp = task.output.with_name(f".{task.output.name}.tmp")
  command = [
    magick,
    str(task.source),
    "-auto-orient",
    "-resize",
    f"{task.max_size}x{task.max_size}>",
    "-strip",
  ]
  if task.image_format == "jpeg":
    command.extend([
      "-sampling-factor", "4:2:0",
      "-interlace", "Plane",
      "-quality", str(task.quality),
      f"jpeg:{temp}",
    ])
  else:
    command.extend([
      "-quality", str(task.quality),
      "-define", "webp:method=4",
      f"webp:{temp}",
    ])

  try:
    subprocess.run(command, check=True)
    os.replace(temp, task.output)
  finally:
    if temp.exists():
      temp.unlink()


def _source_model(model: dict[str, Any]) -> str:
  primary = str(model.get("model", "")).strip()
  fallback = str(model.get("fallback", "")).strip()
  if primary.lower().endswith(".lod.gltf") and fallback.lower().endswith(".gltf"):
    return fallback
  if primary.lower().endswith(".gltf"):
    return primary
  return ""


def _build_model(
  model: dict[str, Any],
  *,
  magick: str,
  low_max: int,
  high_max: int,
  low_quality: int,
  high_quality: int,
  overwrite: bool,
) -> tuple[list[TextureTask], dict[str, Any]] | None:
  source_rel = _source_model(model)
  if not source_rel:
    return None
  if not _safe_rel(source_rel):
    raise ValueError(f"Unsafe model path: {source_rel}")

  source_abs = ROOT_DIR / source_rel
  if not source_abs.is_file():
    raise FileNotFoundError(source_rel)

  document = _read_json(source_abs)
  images = document.get("images") or []
  textures = document.get("textures") or []
  materials = document.get("materials") or []
  if not images or not textures or not materials:
    return None

  output_name = f"{source_abs.stem}.lod.gltf"
  output_abs = source_abs.with_name(output_name)
  output_rel = output_abs.relative_to(ROOT_DIR).as_posix()
  lod_dir_name = f"{source_abs.stem}.lod"
  lod_dir = source_abs.parent / lod_dir_name
  sidecar_abs = source_abs.with_name(f"{source_abs.stem}.lod.json")
  sidecar_rel = sidecar_abs.relative_to(ROOT_DIR).as_posix()

  tasks: list[TextureTask] = []
  high_by_image: dict[int, str] = {}

  for image_index, image in enumerate(images):
    uri = str(image.get("uri", "")).strip()
    if not _safe_rel(uri) or uri.lower().startswith("data:"):
      continue
    source_texture = source_abs.parent / uri
    if not source_texture.is_file():
      raise FileNotFoundError(f"{source_rel}: missing texture {uri}")
    if source_texture.suffix.lower() not in {".jpg", ".jpeg"}:
      continue

    width, height = _dimensions(magick, source_texture)
    if max(width, height) <= low_max:
      continue

    low_rel_from_model = f"{lod_dir_name}/low/image_{image_index:03d}.jpg"
    high_rel_from_model = f"{lod_dir_name}/high/image_{image_index:03d}.webp"
    low_abs = source_abs.parent / low_rel_from_model
    high_abs = source_abs.parent / high_rel_from_model

    image["uri"] = low_rel_from_model
    image.pop("mimeType", None)
    high_by_image[image_index] = high_rel_from_model
    tasks.extend([
      TextureTask(source_texture, low_abs, low_max, low_quality, "jpeg"),
      TextureTask(source_texture, high_abs, high_max, high_quality, "webp"),
    ])

  if not high_by_image:
    return None

  material_lods: dict[str, dict[str, str]] = {}
  slot_paths = (
    ("baseColorTexture", ("pbrMetallicRoughness", "baseColorTexture")),
    ("metallicRoughnessTexture", ("pbrMetallicRoughness", "metallicRoughnessTexture")),
    ("normalTexture", ("normalTexture",)),
    ("occlusionTexture", ("occlusionTexture",)),
    ("emissiveTexture", ("emissiveTexture",)),
  )

  for material_index, material in enumerate(materials):
    mapped: dict[str, str] = {}
    for slot_name, path in slot_paths:
      value: Any = material
      for key in path:
        value = value.get(key) if isinstance(value, dict) else None
      if not isinstance(value, dict) or not isinstance(value.get("index"), int):
        continue
      texture_index = value["index"]
      if texture_index < 0 or texture_index >= len(textures):
        continue
      image_index = textures[texture_index].get("source")
      if isinstance(image_index, int) and image_index in high_by_image:
        mapped[slot_name] = high_by_image[image_index]
    if mapped:
      material_lods[str(material_index)] = mapped

  sidecar = {
    "version": 1,
    "zoomInRatio": 0.72,
    "sampleGrid": [0.18, 0.38, 0.5, 0.62, 0.82],
    "maxConcurrent": 2,
    "materials": material_lods,
  }
  document.setdefault("asset", {}).setdefault("extras", {})["textureLod"] = sidecar_abs.name
  _write_json(output_abs, document)
  _write_json(sidecar_abs, sidecar)

  model["fallback"] = source_rel
  model["model"] = output_rel
  model["textureLod"] = sidecar_rel

  print(
    f"{model.get('id', source_abs.stem)}: "
    f"{len(high_by_image)} texture(s), {len(material_lods)} material(s)"
  )
  return tasks, sidecar


def main() -> int:
  parser = argparse.ArgumentParser(
    description="Generate 2K JPEG base textures and on-demand 4K WebP texture LODs."
  )
  parser.add_argument("--manifest", default="models.json")
  parser.add_argument("--low-max", type=int, default=2048)
  parser.add_argument("--high-max", type=int, default=4096)
  parser.add_argument("--low-quality", type=int, default=82)
  parser.add_argument("--high-quality", type=int, default=84)
  parser.add_argument("--jobs", type=int, default=2)
  parser.add_argument("--overwrite", action="store_true")
  parser.add_argument("--no-update-manifest", action="store_true")
  parser.add_argument("--ids", nargs="*", default=[])
  args = parser.parse_args()

  if args.low_max < 256 or args.high_max < args.low_max:
    raise SystemExit("high-max must be >= low-max, and low-max must be >= 256")
  if args.jobs < 1:
    raise SystemExit("jobs must be >= 1")

  magick = shutil.which("magick")
  if not magick:
    raise SystemExit("ImageMagick 'magick' executable is required")

  manifest_path = ROOT_DIR / args.manifest
  manifest = _read_json(manifest_path)
  selected = set(args.ids)
  all_tasks: list[TextureTask] = []
  changed = False

  for model in manifest.get("models", []):
    model_id = str(model.get("id", ""))
    if selected and model_id not in selected:
      continue
    result = _build_model(
      model,
      magick=magick,
      low_max=args.low_max,
      high_max=args.high_max,
      low_quality=args.low_quality,
      high_quality=args.high_quality,
      overwrite=args.overwrite,
    )
    if result:
      tasks, _ = result
      all_tasks.extend(tasks)
      changed = True

  unique_tasks = list({task.output: task for task in all_tasks}.values())
  print(f"Generating {len(unique_tasks)} texture file(s) with {args.jobs} worker(s)…")
  with concurrent.futures.ThreadPoolExecutor(max_workers=args.jobs) as executor:
    futures = [
      executor.submit(_convert, magick, task, overwrite=args.overwrite)
      for task in unique_tasks
    ]
    for index, future in enumerate(concurrent.futures.as_completed(futures), start=1):
      future.result()
      if index % 10 == 0 or index == len(futures):
        print(f"  {index}/{len(futures)}")

  if changed and not args.no_update_manifest:
    _write_json(manifest_path, manifest)
    print(f"Updated {manifest_path.relative_to(ROOT_DIR)}")
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
