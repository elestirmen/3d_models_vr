#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parents[1]


def _read_json(path: Path) -> dict[str, Any]:
  return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, data: dict[str, Any]) -> None:
  path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _find_gltfpack(explicit: str | None) -> str:
  if explicit:
    p = Path(explicit)
    if not p.is_file():
      raise SystemExit(f"Error: gltfpack not found: {explicit}")
    return str(p)

  in_path = shutil.which("gltfpack")
  if in_path:
    return in_path

  bundled = ROOT_DIR / "tools/bin/gltfpack"
  if bundled.is_file():
    return str(bundled)

  raise SystemExit("Error: gltfpack not found. Install it or use tools/bin/gltfpack.")


def _safe_rel(path: str) -> bool:
  if not path:
    return False
  if path.startswith("/") or path.startswith("\\") or path.startswith("//"):
    return False
  if ":" in path:
    return False
  if ".." in Path(path).parts:
    return False
  return True


def main() -> int:
  parser = argparse.ArgumentParser(description="Optimize manifest-listed .gltf models to .glb via gltfpack")
  parser.add_argument("--manifest", default="models.json", help="path to models.json (default: models.json)")
  parser.add_argument("--suffix", default="opt", help="output suffix before .glb (default: opt)")
  parser.add_argument("--overwrite", action="store_true", help="overwrite existing outputs")
  parser.add_argument("--update-manifest", action="store_true", help="set optimized .glb as primary and original as fallback")
  parser.add_argument("--gltfpack", default=None, help="explicit gltfpack binary path")
  parser.add_argument("--dry-run", action="store_true", help="print planned operations only")
  args = parser.parse_args()

  gltfpack = _find_gltfpack(args.gltfpack)
  manifest_path = (ROOT_DIR / args.manifest).resolve()
  manifest = _read_json(manifest_path)
  models: list[dict[str, Any]] = list(manifest.get("models", []))

  planned: list[tuple[str, str]] = []
  for m in models:
    src = str(m.get("model", "")).strip()
    if not src.lower().endswith(".gltf"):
      continue
    if not _safe_rel(src):
      raise SystemExit(f"Error: unsafe model path in manifest: {src}")
    src_abs = ROOT_DIR / src
    if not src_abs.is_file():
      raise SystemExit(f"Error: missing model file: {src}")

    out_rel = src[:-5] + f".{args.suffix}.glb"
    out_abs = ROOT_DIR / out_rel
    planned.append((src, out_rel))

    if out_abs.exists() and not args.overwrite:
      continue

    if args.dry_run:
      continue

    out_abs.parent.mkdir(parents=True, exist_ok=True)
    cmd = [gltfpack, "-i", str(src_abs), "-o", str(out_abs)]
    subprocess.run(cmd, check=True)

  if args.update_manifest:
    changed = False
    for m in models:
      src = str(m.get("model", "")).strip()
      if not src.lower().endswith(".gltf"):
        continue
      out_rel = src[:-5] + f".{args.suffix}.glb"
      out_abs = ROOT_DIR / out_rel
      if not out_abs.is_file():
        continue
      if m.get("model") != out_rel:
        m.setdefault("fallback", src)
        m["model"] = out_rel
        changed = True

    if changed and not args.dry_run:
      _write_json(manifest_path, manifest)

  if args.dry_run:
    for src, out in planned:
      print(f"{src} -> {out}")

  return 0


if __name__ == "__main__":
  raise SystemExit(main())

