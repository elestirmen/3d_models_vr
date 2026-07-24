#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parents[1]
LFS_HEADER = b"version https://git-lfs.github.com/spec/v1"


def _read_json(path: Path) -> dict[str, Any]:
  return json.loads(path.read_text(encoding="utf-8"))


def _is_lfs_pointer(path: Path) -> bool:
  try:
    head = path.read_bytes()[:64]
  except OSError:
    return False
  return head.startswith(LFS_HEADER)


def _ok(msg: str) -> None:
  print(f"OK: {msg}")


def _warn(msg: str) -> None:
  print(f"WARN: {msg}")


def _err(msg: str) -> None:
  print(f"ERROR: {msg}")


def _safe_rel(uri: str) -> bool:
  if not uri:
    return False
  if uri.startswith("data:"):
    return False
  if uri.startswith("/") or uri.startswith("\\") or uri.startswith("//"):
    return False
  if ":" in uri:
    return False
  if ".." in Path(uri).parts:
    return False
  return True


def main() -> int:
  manifest_path = ROOT_DIR / "models.json"
  if not manifest_path.is_file():
    _err("models.json not found")
    return 2

  manifest = _read_json(manifest_path)
  models: list[dict[str, Any]] = list(manifest.get("models", []))
  if not models:
    _err("models.json: no models found")
    return 2

  # Critical assets
  critical_files = [
    "index.html",
    "viewer.html",
    "assets/index.css",
    "assets/index.js",
    "assets/viewer.css",
    "assets/viewer.js",
    "assets/ar-viewer.js",
    "assets/vendor/babylon-9.18.0/babylon.js",
    "assets/vendor/babylon-9.18.0/babylonjs.loaders.min.js",
    "assets/vendor/babylon-9.18.0/decoders/meshopt_decoder.js",
    "assets/vendor/babylon-9.18.0/decoders/babylon.ktx2Decoder.js",
    "assets/vendor/babylon-9.18.0/decoders/msc_basis_transcoder.wasm",
    "geometry-lod-sw.js",
  ]
  for rel in critical_files:
    p = ROOT_DIR / rel
    if not p.is_file():
      _err(f"missing file: {rel}")
      return 2
  _ok("critical assets present")

  had_error = False
  lfs_pointer_files: list[str] = []
  missing_files: list[str] = []

  for m in models:
    model_id = str(m.get("id", "<missing id>"))
    model_rel = str(m.get("model", "")).strip()
    if not model_rel:
      _err(f"{model_id}: missing model path")
      had_error = True
      continue

    model_path = ROOT_DIR / model_rel
    if not model_path.is_file():
      _err(f"{model_id}: missing model file: {model_rel}")
      missing_files.append(model_rel)
      had_error = True
      continue

    if _is_lfs_pointer(model_path):
      lfs_pointer_files.append(model_rel)

    texture_lod_rel = str(m.get("textureLod", "")).strip()
    if texture_lod_rel:
      _err(f"{model_id}: legacy textureLod is not allowed; use geometryLod tiers")
      had_error = True
    if not model_rel.lower().endswith("/low.glb"):
      _err(f"{model_id}: active model must be the standard low.glb tier")
      had_error = True

    if texture_lod_rel:
      texture_lod_path = ROOT_DIR / texture_lod_rel
      if not _safe_rel(texture_lod_rel) or not texture_lod_path.is_file():
        _err(f"{model_id}: missing texture LOD manifest: {texture_lod_rel}")
        missing_files.append(texture_lod_rel)
        had_error = True
      else:
        try:
          lod_doc = _read_json(texture_lod_path)
          if lod_doc.get("version") != 1 or not isinstance(lod_doc.get("materials"), dict):
            raise ValueError("unsupported texture LOD manifest")
          for slots in lod_doc["materials"].values():
            if not isinstance(slots, dict):
              raise ValueError("invalid material texture mapping")
            for uri in slots.values():
              if not isinstance(uri, str) or not _safe_rel(uri):
                raise ValueError(f"unsafe texture LOD path: {uri}")
              texture_path = texture_lod_path.parent / uri
              if not texture_path.is_file():
                rel = texture_path.relative_to(ROOT_DIR).as_posix()
                missing_files.append(rel)
                _err(f"{model_id}: missing high-resolution texture: {rel}")
                had_error = True
        except (OSError, json.JSONDecodeError, ValueError) as error:
          _err(f"{model_id}: invalid texture LOD manifest: {error}")
          had_error = True

    geometry_lod_rel = str(m.get("geometryLod", "")).strip()
    if not geometry_lod_rel:
      _err(f"{model_id}: geometryLod manifest is required by the common model standard")
      had_error = True
    if geometry_lod_rel:
      geometry_lod_path = ROOT_DIR / geometry_lod_rel
      if not _safe_rel(geometry_lod_rel) or not geometry_lod_path.is_file():
        _err(f"{model_id}: missing geometry LOD manifest: {geometry_lod_rel}")
        missing_files.append(geometry_lod_rel)
        had_error = True
      else:
        try:
          lod_doc = _read_json(geometry_lod_path)
          tiers = lod_doc.get("tiers")
          if lod_doc.get("version") != 1 or not isinstance(tiers, list) or len(tiers) != 3:
            raise ValueError("unsupported geometry LOD manifest")
          if [tier.get("id") for tier in tiers] != ["low", "medium", "high"]:
            raise ValueError("geometry LOD tiers must be low, medium, high")
          for tier in tiers:
            uri = tier.get("src")
            if not isinstance(uri, str) or not _safe_rel(uri):
              raise ValueError(f"unsafe geometry LOD path: {uri}")
            tier_path = geometry_lod_path.parent / uri
            if not tier_path.is_file():
              rel = tier_path.relative_to(ROOT_DIR).as_posix()
              missing_files.append(rel)
              _err(f"{model_id}: missing geometry LOD tier: {rel}")
              had_error = True
        except (OSError, json.JSONDecodeError, ValueError) as error:
          _err(f"{model_id}: invalid geometry LOD manifest: {error}")
          had_error = True

    # Parse dependencies for .gltf only
    if model_path.suffix.lower() != ".gltf":
      continue

    try:
      doc = json.loads(model_path.read_text(encoding="utf-8"))
    except Exception:
      _warn(f"{model_id}: failed to parse gltf JSON: {model_rel}")
      continue

    base_dir = model_path.parent
    uris: set[str] = set()
    for buf in doc.get("buffers", []) or []:
      uri = buf.get("uri")
      if isinstance(uri, str) and _safe_rel(uri):
        uris.add(uri)
    for img in doc.get("images", []) or []:
      uri = img.get("uri")
      if isinstance(uri, str) and _safe_rel(uri):
        uris.add(uri)

    for uri in sorted(uris):
      dep = base_dir / uri
      rel = dep.relative_to(ROOT_DIR).as_posix()
      if not dep.is_file():
        missing_files.append(rel)
        _err(f"{model_id}: missing dependency: {rel}")
        had_error = True
        continue
      if _is_lfs_pointer(dep):
        lfs_pointer_files.append(rel)

  if lfs_pointer_files:
    _warn("Git LFS pointer files detected (models may not load until downloaded):")
    for p in sorted(set(lfs_pointer_files)):
      print(f"  - {p}")
    print("")
    print("Fix:")
    print("  git lfs install")
    print("  git lfs pull")
    print("")

  if missing_files:
    _warn("Missing files detected:")
    for p in sorted(set(missing_files)):
      print(f"  - {p}")

  if had_error:
    return 2

  _ok("manifest looks consistent")
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
