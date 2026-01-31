#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parents[1]
LFS_HEADER = b"version https://git-lfs.github.com/spec/v1"


def _read_json(path: Path) -> dict[str, Any]:
  return json.loads(path.read_text(encoding="utf-8"))


def _fmt(n: int) -> str:
  unit = "B"
  value = float(n)
  for unit in ("B", "KB", "MB", "GB"):
    if value < 1024 or unit == "GB":
      break
    value /= 1024
  if unit == "B":
    return f"{int(value)} {unit}"
  return f"{value:.2f} {unit}"


def _lfs_pointer_size(path: Path) -> int | None:
  try:
    head = path.read_bytes()[:256]
  except OSError:
    return None

  if not head.startswith(LFS_HEADER):
    return None

  for raw_line in head.splitlines():
    line = raw_line.decode("utf-8", errors="ignore").strip()
    if line.startswith("size "):
      try:
        return int(line.split(" ", 1)[1])
      except ValueError:
        return None

  return None


def _effective_file_size(path: Path) -> tuple[int, bool]:
  lfs_size = _lfs_pointer_size(path)
  if lfs_size is not None:
    return lfs_size, True
  return path.stat().st_size, False


def _is_safe_rel(path: str) -> bool:
  if not path:
    return False
  if path.startswith("/") or path.startswith("\\") or path.startswith("//"):
    return False
  if ":" in path:
    return False
  if ".." in Path(path).parts:
    return False
  return True


def _model_total_bytes(model_abs: Path) -> tuple[int, int, list[str]]:
  """
  Returns (total_bytes, lfs_pointer_count, missing_files_rel_to_root).
  For .gltf, totals referenced buffers/images too.
  """
  total = 0
  lfs_pointers = 0
  missing: list[str] = []

  size, is_lfs = _effective_file_size(model_abs)
  total += size
  lfs_pointers += 1 if is_lfs else 0

  if model_abs.suffix.lower() == ".glb":
    return total, lfs_pointers, missing

  if model_abs.suffix.lower() != ".gltf":
    return total, lfs_pointers, missing

  try:
    doc = json.loads(model_abs.read_text(encoding="utf-8"))
  except (OSError, json.JSONDecodeError):
    return total, lfs_pointers, missing

  base_dir = model_abs.parent
  uris: set[str] = set()

  for buf in doc.get("buffers", []) or []:
    uri = buf.get("uri")
    if isinstance(uri, str) and uri and not uri.startswith("data:"):
      uris.add(uri)

  for img in doc.get("images", []) or []:
    uri = img.get("uri")
    if isinstance(uri, str) and uri and not uri.startswith("data:"):
      uris.add(uri)

  for uri in sorted(uris):
    if not _is_safe_rel(uri):
      continue
    p = base_dir / uri
    rel = os.path.relpath(p, ROOT_DIR)
    if not p.is_file():
      missing.append(rel)
      continue
    size, is_lfs = _effective_file_size(p)
    total += size
    lfs_pointers += 1 if is_lfs else 0

  return total, lfs_pointers, missing


def main() -> int:
  parser = argparse.ArgumentParser(description="Report model and asset sizes from models.json")
  parser.add_argument("--manifest", default="models.json")
  args = parser.parse_args()

  manifest = _read_json(ROOT_DIR / args.manifest)
  models: list[dict[str, Any]] = list(manifest.get("models", []))

  rows: list[tuple[int, int, str, str]] = []
  total = 0
  missing: list[str] = []

  for m in models:
    title = str(m.get("title", m.get("id", "")))
    path = str(m.get("model", ""))
    abs_path = ROOT_DIR / path
    if not abs_path.is_file():
      missing.append(path)
      continue
    size, lfs_count, missing_deps = _model_total_bytes(abs_path)
    total += size
    rows.append((size, lfs_count, title, path))
    missing.extend(missing_deps)

  rows.sort(reverse=True, key=lambda r: r[0])

  print(f"Toplam model dosyası: {len(rows)}/{len(models)}")
  print(f"Toplam boyut: {_fmt(total)}")
  print("")
  print(f"{'Boyut':>12}  {'LFS':>3}  {'Model':<28}  Yol")
  print("-" * 80)
  for size, lfs_count, title, path in rows:
    lfs_col = str(lfs_count) if lfs_count else "-"
    print(f"{_fmt(size):>12}  {lfs_col:>3}  {title:<28.28}  {path}")

  if missing:
    print("")
    print("Eksik dosyalar:")
    for p in sorted(set(missing)):
      print(f"- {p}")

  return 0


if __name__ == "__main__":
  raise SystemExit(main())
