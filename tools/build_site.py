#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
from html import escape
from pathlib import Path
from typing import Any
from urllib.parse import urlencode


ROOT_DIR = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT_DIR / "models.json"

DEFAULT_THEME_COLOR = "#667eea"


def _read_json(path: Path) -> dict[str, Any]:
  return json.loads(path.read_text(encoding="utf-8"))


def _write_text(path: Path, content: str) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  path.write_text(content, encoding="utf-8", newline="\n")


def _is_safe_rel_path(path: str) -> bool:
  if not path:
    return False
  if path.startswith("/"):
    return False
  if path.startswith("\\"):
    return False
  if path.startswith("//"):
    return False
  if ":" in path:
    return False
  if ".." in Path(path).parts:
    return False
  return True


def _validate_model_path(path: str) -> list[str]:
  errors: list[str] = []
  if not _is_safe_rel_path(path):
    errors.append("unsafe path")
    return errors
  lower = path.lower()
  if not (lower.endswith(".gltf") or lower.endswith(".glb")):
    errors.append("unsupported extension (expected .gltf or .glb)")
  if not (ROOT_DIR / path).is_file():
    errors.append("file missing on disk")
  return errors


def _validate_asset_path(
  path: str,
  allowed_prefixes: tuple[str, ...],
  allowed_exts: tuple[str, ...],
  *,
  require_exists: bool = True,
) -> list[str]:
  errors: list[str] = []
  if not path:
    return errors
  if not _is_safe_rel_path(path):
    errors.append("unsafe path")
    return errors
  lower = path.lower()
  if not lower.endswith(allowed_exts):
    errors.append(f"unsupported extension (expected {', '.join(allowed_exts)})")
  if not any(lower.startswith(p) for p in allowed_prefixes):
    errors.append("path not allowed by prefix")
  if require_exists and not (ROOT_DIR / path).is_file():
    errors.append("file missing on disk")
  return errors


def _color_pair(seed: str) -> tuple[str, str]:
  palette = [
    ("#667eea", "#764ba2"),
    ("#06b6d4", "#2563eb"),
    ("#22c55e", "#0ea5e9"),
    ("#f97316", "#db2777"),
    ("#a855f7", "#ec4899"),
    ("#14b8a6", "#6366f1"),
  ]
  idx = sum(seed.encode("utf-8")) % len(palette)
  return palette[idx]


def _poster_svg(*, title: str, emoji: str, seed: str) -> str:
  c1, c2 = _color_pair(seed)
  safe_title = escape(title)
  safe_emoji = escape(emoji)
  return f"""<!doctype svg>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" role="img" aria-label="{safe_title}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="{c1}"/>
      <stop offset="1" stop-color="{c2}"/>
    </linearGradient>
    <filter id="s" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="18" flood-color="#000" flood-opacity="0.35"/>
    </filter>
  </defs>
  <rect width="1200" height="675" fill="url(#g)"/>
  <g filter="url(#s)">
    <rect x="72" y="92" width="1056" height="491" rx="28" fill="rgba(255,255,255,0.14)"/>
  </g>
  <text x="600" y="310" text-anchor="middle" font-size="92" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif">{safe_emoji}</text>
  <text x="600" y="420" text-anchor="middle" font-size="48" font-weight="700" fill="white"
        font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif">{safe_title}</text>
  <text x="600" y="475" text-anchor="middle" font-size="22" fill="rgba(255,255,255,0.9)"
        font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif">3D Model • WebXR/AR Ready</text>
</svg>
"""


def _redirect_page(*, url: str) -> str:
  url_html = escape(url, quote=True)
  return f"""<!doctype html>
<html lang="tr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="refresh" content="0; url={url_html}">
    <link rel="canonical" href="{url_html}">
    <title>Yönlendiriliyor…</title>
    <style>
      body {{ font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 24px; }}
      a {{ color: {DEFAULT_THEME_COLOR}; }}
    </style>
  </head>
  <body>
    <p>Yönlendiriliyor… <a href="{url_html}">Devam et</a></p>
  </body>
</html>
"""


def _index_page(*, cards_html: str) -> str:
  csp = (
    "default-src 'self'; "
    "base-uri 'self'; "
    "object-src 'none'; "
    "script-src 'self'; "
    "style-src 'self'; "
    "img-src 'self' data:; "
    "frame-ancestors 'none'; "
    "upgrade-insecure-requests"
  )
  return f"""<!doctype html>
<html lang="tr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="Binalara ait 3B (glTF/GLB) modelleri web üzerinden görüntüleyin ve WebXR destekli AR deneyimini deneyin.">
    <meta name="theme-color" content="{DEFAULT_THEME_COLOR}">
    <meta http-equiv="Content-Security-Policy" content="{csp}">
    <title>3D Model Galerisi</title>
    <link rel="stylesheet" href="assets/index.css">
  </head>
  <body>
    <header class="hero">
      <h1 class="title"><span aria-hidden="true">🏛️</span> 3D Model Galerisi</h1>
      <p class="subtitle">Modeli seçin, görüntüleyicide döndürün/zoom yapın. Destekleyen cihazlarda AR ile sahnede deneyimleyin.</p>
    </header>

    <div class="toolbar">
      <div class="search" role="search">
        <label class="sr-only" for="searchInput">Model ara</label>
        <span class="search-icon" aria-hidden="true">⌕</span>
        <input id="searchInput" type="search" placeholder="Model ara (örn. Kütüphane, Rektörlük…)" autocomplete="off" inputmode="search">
        <button id="clearSearch" type="button" aria-label="Aramayı temizle" title="Temizle">×</button>
      </div>
      <div id="count" class="count" aria-live="polite"></div>
    </div>

    <main class="grid" id="grid" aria-label="Modeller">
{cards_html}
    </main>

    <script src="assets/index.js"></script>
  </body>
</html>
"""


def _models_generated_js(*, allowed_prefixes: list[str]) -> str:
  payload = {
    "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
    "allowedModelPrefixes": allowed_prefixes,
  }
  json_text = json.dumps(payload, ensure_ascii=False, indent=2)
  return f"""/* Auto-generated by tools/build_site.py. Do not edit by hand. */
window.MODEL_GALLERY = {json_text};
"""


def _viewer_url(model: dict[str, Any], *, prefix: str) -> str:
  params: dict[str, str] = {
    "title": str(model["title"]),
    "model": str(model["model"]),
  }
  if model.get("fallback"):
    params["fallback"] = str(model["fallback"])
  if model.get("poster"):
    params["poster"] = str(model["poster"])
  if model.get("ios"):
    params["ios"] = str(model["ios"])
  if model.get("orbit"):
    params["orbit"] = str(model["orbit"])
  if model.get("exposure") is not None:
    params["exposure"] = str(model["exposure"])
  return f"{prefix}viewer.html?{urlencode(params)}"


def build(*, write: bool, index: bool, redirects: bool, generated_js: bool) -> int:
  manifest = _read_json(MANIFEST_PATH)
  models: list[dict[str, Any]] = list(manifest.get("models", []))

  errors: list[str] = []
  ids: set[str] = set()
  allowed_prefixes: set[str] = set()

  for m in models:
    model_id = str(m.get("id", "")).strip()
    if not re.fullmatch(r"[a-z0-9_\-]+", model_id):
      errors.append(f"{model_id or '<missing id>'}: invalid id (use [a-z0-9_-])")
      continue
    if model_id in ids:
      errors.append(f"{model_id}: duplicate id")
      continue
    ids.add(model_id)

    title = str(m.get("title", "")).strip()
    label = str(m.get("label", "")).strip()
    emoji = str(m.get("emoji", "")).strip()
    model_path = str(m.get("model", "")).strip()
    fallback_path = str(m.get("fallback", "")).strip()

    if not title:
      errors.append(f"{model_id}: missing title")
    if not label:
      errors.append(f"{model_id}: missing label")
    if not emoji:
      errors.append(f"{model_id}: missing emoji")

    model_errs = _validate_model_path(model_path)
    if model_errs:
      errors.append(f"{model_id}: model '{model_path}': {', '.join(model_errs)}")
    else:
      prefix = model_path.split("/", 1)[0].lower() + "/"
      allowed_prefixes.add(prefix)

    if fallback_path:
      fb_errs = _validate_model_path(fallback_path)
      if fb_errs:
        errors.append(f"{model_id}: fallback '{fallback_path}': {', '.join(fb_errs)}")

    # Default poster path (generated)
    poster_path = str(m.get("poster", "")).strip() or f"assets/posters/{model_id}.svg"
    m["poster"] = poster_path

    if write and generated_js:
      poster_abs = ROOT_DIR / poster_path
      _write_text(poster_abs, _poster_svg(title=title, emoji=emoji, seed=model_id))

    poster_require_exists = not (poster_path.lower().startswith("assets/posters/") and poster_path.lower().endswith(".svg")) or write
    poster_errs = _validate_asset_path(
      poster_path,
      ("assets/posters/",),
      (".svg", ".png", ".jpg", ".jpeg", ".webp"),
      require_exists=poster_require_exists,
    )
    if poster_errs:
      errors.append(f"{model_id}: poster '{poster_path}': {', '.join(poster_errs)}")

    if m.get("ios"):
      ios_errs = _validate_asset_path(
        str(m["ios"]),
        tuple(sorted(allowed_prefixes)),
        (".usdz",),
      )
      if ios_errs:
        errors.append(f"{model_id}: ios '{m['ios']}': {', '.join(ios_errs)}")

  if errors:
    for e in errors:
      print(f"ERROR: {e}")
    return 2

  if generated_js:
    allowed_sorted = sorted(allowed_prefixes)
    js = _models_generated_js(allowed_prefixes=allowed_sorted)
    if write:
      _write_text(ROOT_DIR / "assets/models.generated.js", js)

  if redirects:
    for m in models:
      model_id = str(m["id"])
      folder = ROOT_DIR / model_id
      if not folder.is_dir():
        # Backwards compatibility: some ids might not have folders.
        continue
      url = _viewer_url(m, prefix="../")
      page = _redirect_page(url=url)
      if write:
        _write_text(folder / "index.html", page)
        _write_text(folder / "responsive.html", page)

  if index:
    cards: list[str] = []
    for m in models:
      label = escape(str(m["label"]))
      emoji = escape(str(m.get("emoji", "🏢")))
      url = escape(_viewer_url(m, prefix=""), quote=True)
      poster = escape(str(m.get("poster", "")), quote=True)
      keywords = m.get("keywords") or []
      search_blob = " ".join([str(m.get("title", "")), str(m.get("label", "")), *[str(k) for k in keywords]])
      data_title = escape(search_blob, quote=True)
      cards.append(
        "      "
        + f'<a class="card" href="{url}" data-title="{data_title}">'
        + f'<img class="thumb" src="{poster}" alt="" loading="lazy" decoding="async">'
        + f'<div class="card-body"><span class="emoji" aria-hidden="true">{emoji}</span><span class="label">{label}</span></div>'
        + "</a>"
      )
    cards_html = "\n".join(cards)
    page = _index_page(cards_html=cards_html)
    if write:
      _write_text(ROOT_DIR / "index.html", page)

  return 0


def main() -> int:
  parser = argparse.ArgumentParser(description="Build static pages from models.json")
  parser.add_argument("--check", action="store_true", help="validate only (do not write files)")
  parser.add_argument("--no-index", action="store_true", help="skip index.html generation")
  parser.add_argument("--no-redirects", action="store_true", help="skip per-folder redirect pages")
  parser.add_argument("--no-generated-js", action="store_true", help="skip assets/models.generated.js + posters")
  args = parser.parse_args()

  return build(
    write=not args.check,
    index=not args.no_index,
    redirects=not args.no_redirects,
    generated_js=not args.no_generated_js,
  )


if __name__ == "__main__":
  raise SystemExit(main())
