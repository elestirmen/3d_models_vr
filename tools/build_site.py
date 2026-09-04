#!/usr/bin/env python3
from __future__ import annotations

import argparse
import functools
import hashlib
import json
import re
from html import escape
from pathlib import Path
from typing import Any
from urllib.parse import urlencode


ROOT_DIR = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT_DIR / "models.json"

DEFAULT_THEME_COLOR = "#f6f6f7"
PUBLIC_URL = "https://vr.perinet.org/"

# Varlik surumleme: elle yazilan bir surum etiketi yerine dosya icerigi.
# Boylece nginx /assets/ altini "immutable" ile bir yil onbelleklerken
# icerik degistiginde adres de degisir.
ASSET_QUERY_RE = re.compile(
  r'((?:href|src|srcset)=")((?:assets/[^"?\s]+|manifest\.webmanifest))(\?v=)[^"]*(")'
)
CSS_FONT_QUERY_RE = re.compile(r'(url\(")(fonts/[^")?]+)(\?v=)[^")]*("\))')
STAMPED_HTML_FILES = ("viewer.html", "map.html")

# Satır içi SVG ikonlar (currentColor ile renklenir, CSP dostu).
ICON_CUBE = (
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>'
  '<path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>'
)
ICON_SCAN = (
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/>'
  '<path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/></svg>'
)
ICON_ARROW = (
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>'
)
ICON_SEARCH = (
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>'
)
ICON_SUN = (
  '<svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  '<circle cx="12" cy="12" r="4"/>'
  '<path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>'
)
ICON_MOON = (
  '<svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
  '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>'
)


@functools.lru_cache(maxsize=None)
def _asset_version(rel_path: str) -> str:
  """Varlik icerigi icin kisa sha256 damgasi (yoksa '0')."""
  path = ROOT_DIR / rel_path
  if not path.is_file():
    return "0"
  digest = hashlib.sha256(path.read_bytes()).hexdigest()
  return digest[:10]


def _stamp_text(text: str, pattern: re.Pattern[str], *, prefix: str = "") -> str:
  """`?v=` tasiyan ayni-koken varlik adreslerini icerik damgasiyla gunceller."""
  def replace(match: re.Match[str]) -> str:
    rel = prefix + match.group(2)
    return f"{match.group(1)}{match.group(2)}{match.group(3)}{_asset_version(rel)}{match.group(4)}"
  return pattern.sub(replace, text)


def _stamp_file(rel_path: str, pattern: re.Pattern[str], *, prefix: str = "", write: bool) -> bool:
  """Dosya icindeki varlik damgalarini tazeler; degisiklik olduysa True doner."""
  path = ROOT_DIR / rel_path
  if not path.is_file():
    return False
  original = path.read_text(encoding="utf-8")
  stamped = _stamp_text(original, pattern, prefix=prefix)
  if stamped == original:
    return False
  if write:
    path.write_text(stamped, encoding="utf-8", newline="\n")
    _asset_version.cache_clear()
  return True


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


def _model_total_bytes(model_path: Path) -> int:
  total = model_path.stat().st_size
  if model_path.suffix.lower() != ".gltf":
    return total

  try:
    document = json.loads(model_path.read_text(encoding="utf-8"))
  except (OSError, json.JSONDecodeError):
    return total

  uris: set[str] = set()
  for item in [*(document.get("buffers") or []), *(document.get("images") or [])]:
    uri = item.get("uri")
    if isinstance(uri, str) and uri and not uri.startswith("data:") and _is_safe_rel_path(uri):
      uris.add(uri)

  for uri in uris:
    dependency = model_path.parent / uri
    if dependency.is_file():
      total += dependency.stat().st_size
  return total


def _format_megabytes(size_bytes: int) -> str:
  return f"{size_bytes / (1024 * 1024):.1f} MB"


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


CATEGORY_LABELS = {
  "egitim": "Eğitim",
  "yonetim": "Yönetim",
  "sosyal": "Sosyal",
  "uygulama": "Uygulama",
  "plan": "Yerleşke planı",
}

TIER_LABELS = {"low": "Hafif", "medium": "Orta", "high": "Yüksek"}


def _geometry_tiers(rel_path: str) -> list[dict[str, Any]]:
  """Geometri LOD manifestinden kademe künyesi (boyut + üçgen sayısı).

  Üçgen sayısı ve kademe boyutları gltfpack raporlarından gelir; manifeste
  elle yazılmaz, bu yüzden her zaman gerçek üretim değerleridir.
  """
  if not rel_path:
    return []
  path = ROOT_DIR / rel_path
  if not path.is_file():
    return []
  try:
    document = json.loads(path.read_text(encoding="utf-8"))
  except (OSError, json.JSONDecodeError):
    return []

  tiers: list[dict[str, Any]] = []
  for tier in document.get("tiers") or []:
    tier_id = str(tier.get("id", "")).strip()
    if not tier_id:
      continue
    tiers.append({
      "id": tier_id,
      "label": TIER_LABELS.get(tier_id, tier_id),
      "bytes": int(tier.get("bytes") or 0),
      "triangles": int(tier.get("triangles") or 0),
    })
  return tiers


def _format_triangles(count: int) -> str:
  if count <= 0:
    return ""
  if count >= 1_000_000:
    return f"{count / 1_000_000:.1f}".replace(".", ",") + " M üçgen"
  if count >= 1_000:
    return f"{round(count / 1000)} bin üçgen"
  return f"{count} üçgen"


LQIP_STYLESHEET = "assets/posters.lqip.css"


def _stamped(path: str) -> str:
  """Aynı adla yerinde güncellenen varlıklara içerik damgası ekler.

  Posterler yeniden üretildiğinde dosya adı değişmediği için, damga olmadan
  30 günlük önbellek yüzünden geri dönen ziyaretçiler eski görseli görürdü.
  """
  if not path or "?" in path:
    return path
  return f"{path}?v={_asset_version(path)}"


def _poster_sources(poster: str) -> tuple[str, str]:
  """Poster için (avif, webp/asıl) çiftini döndürür; AVIF yoksa boş kalır."""
  if not poster:
    return "", ""
  candidate = Path(poster).with_suffix(".avif").as_posix()
  avif = _stamped(candidate) if (ROOT_DIR / candidate).is_file() else ""
  return avif, _stamped(poster)


def _poster_svg(*, title: str, emoji: str) -> str:
  safe_title = escape(title)
  safe_emoji = escape(emoji)
  font = "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif"
  return f"""<!doctype svg>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" role="img" aria-label="{safe_title}">
  <rect width="1200" height="675" fill="#ececed"/>
  <g transform="translate(1014 70)">
    <rect width="118" height="40" rx="20" fill="#ffffff" stroke="#dcdce0"/>
    <text x="59" y="26" text-anchor="middle" font-size="19" font-weight="600" fill="#6b7280" letter-spacing="1.5" font-family="{font}">3D · AR</text>
  </g>
  <text x="600" y="322" text-anchor="middle" font-size="116" font-family="{font}">{safe_emoji}</text>
  <text x="600" y="432" text-anchor="middle" font-size="50" font-weight="700" fill="#27272a" font-family="{font}">{safe_title}</text>
  <text x="600" y="488" text-anchor="middle" font-size="22" fill="#71717a" letter-spacing="0.5" font-family="{font}">Görüntülemek için tıklayın</text>
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


def _index_page(*, cards_html: str, model_count: int) -> str:
  lqip_link = ""
  if (ROOT_DIR / LQIP_STYLESHEET).is_file():
    lqip_link = (
      f'\n    <link rel="stylesheet" href="{LQIP_STYLESHEET}'
      f'?v={_asset_version(LQIP_STYLESHEET)}">'
    )

  csp = (
    "default-src 'self'; "
    "base-uri 'self'; "
    "object-src 'none'; "
    "script-src 'self'; "
    "style-src 'self'; "
    "img-src 'self' data:; "
    "font-src 'self'; "
    "upgrade-insecure-requests"
  )
  return f"""<!doctype html>
<html lang="tr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="Osmaniye Korkut Ata Üniversitesi yerleşkesini ve kampüs binalarını etkileşimli 3B modellerle keşfedin.">
    <meta name="theme-color" content="{DEFAULT_THEME_COLOR}">
    <meta http-equiv="Content-Security-Policy" content="{csp}">
    <link rel="canonical" href="{PUBLIC_URL}">
    <meta property="og:type" content="website">
    <meta property="og:locale" content="tr_TR">
    <meta property="og:title" content="OKÜ Dijital Yerleşke">
    <meta property="og:description" content="OKÜ yerleşkesini ve kampüs binalarını etkileşimli 3B modellerle keşfedin.">
    <meta property="og:url" content="{PUBLIC_URL}">
    <meta property="og:image" content="{PUBLIC_URL}assets/social-card.webp">
    <meta property="og:image:alt" content="OKÜ Dijital Yerleşke 3B kampüs deneyimi">
    <meta name="twitter:card" content="summary_large_image">
    <title>OKÜ Dijital Yerleşke</title>
    <link rel="icon" type="image/svg+xml" href="assets/favicon.svg?v={_asset_version('assets/favicon.svg')}">
    <link rel="apple-touch-icon" href="assets/icons/icon-192.png?v={_asset_version('assets/icons/icon-192.png')}">
    <link rel="manifest" href="manifest.webmanifest?v={_asset_version('manifest.webmanifest')}">
    <link rel="preload" href="assets/fonts/inter-latin-wght-normal.woff2?v={_asset_version('assets/fonts/inter-latin-wght-normal.woff2')}" as="font" type="font/woff2" crossorigin>
    <link rel="stylesheet" href="assets/tokens.css?v={_asset_version('assets/tokens.css')}">
    <link rel="stylesheet" href="assets/index.css?v={_asset_version('assets/index.css')}">{lqip_link}
  </head>
  <body>
    <header class="hero">
      <div class="hero-text">
        <span class="eyebrow"><span class="dot" aria-hidden="true"></span> Osmaniye Korkut Ata Üniversitesi</span>
        <h1 class="title"><span class="logo" aria-hidden="true">🏛️</span> OKÜ Dijital Yerleşke</h1>
        <p class="subtitle">Yerleşkeyi ve kampüs binalarını 3B keşfedin. Bir yapı seçin, her açıdan inceleyin; destekleyen cihazlarda gerçek ortamınıza yerleştirin.</p>
      </div>
      <button id="themeToggle" class="theme-toggle" type="button" aria-label="Koyu temaya geç" title="Koyu temaya geç">
        {ICON_SUN}{ICON_MOON}
      </button>
    </header>

    <div class="toolbar">
      <div class="search" role="search">
        <label class="sr-only" for="searchInput">Model ara</label>
        <span class="search-icon" aria-hidden="true">{ICON_SEARCH}</span>
        <input id="searchInput" type="search" placeholder="Bina ara — Kütüphane, Rektörlük, Fabrika…" autocomplete="off" inputmode="search">
        <kbd class="kbd" id="searchHint" aria-hidden="true">/</kbd>
        <button id="clearSearch" type="button" aria-label="Aramayı temizle" title="Temizle">×</button>
      </div>
      <a class="view-switch" href="map.html">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/></svg>
        Haritada gör
      </a>
      <div id="count" class="count" aria-live="polite">{model_count} model</div>
    </div>

    <main class="grid" id="grid" aria-label="Modeller">
{cards_html}
    </main>

    <div id="empty" class="empty is-hidden" role="status" aria-live="polite">
      <div class="empty-icon" aria-hidden="true">🔎</div>
      <h2>Sonuç bulunamadı</h2>
      <p>Aramanızla eşleşen bir model yok. Farklı bir anahtar kelime deneyin.</p>
    </div>

    <footer class="footer">
      <p><strong>OKÜ Dijital Yerleşke</strong> · Kampüsü erişilebilir ve etkileşimli biçimde keşfedin</p>
      <p class="footer-note">3B model, galeriden bir yapı seçtiğinizde hafif başlangıç sürümüyle yüklenir.</p>
      <p class="footer-note">Kullanım ölçümü çerezsizdir; IP adresi, tarayıcı bilgisi ve kişisel veri kaydedilmez. Tarayıcınız &ldquo;Do Not Track&rdquo; gönderiyorsa ölçüm hiç yapılmaz.</p>
    </footer>

    <script src="assets/analytics.js?v={_asset_version('assets/analytics.js')}"></script>
    <script src="assets/index.js?v={_asset_version('assets/index.js')}"></script>
  </body>
</html>
"""


def _catalog_entry(model: dict[str, Any]) -> dict[str, Any]:
  """viewer.html'in okudugu model kunyesi.

  Adresler burada tek kaynaktan gelir; boylece viewer URL'si `?id=<id>`
  kadar kisa kalir ve bilgi paneli tum alanlara erisir.
  """
  entry: dict[str, Any] = {
    "id": str(model["id"]),
    "title": str(model["title"]),
    "label": str(model["label"]),
    "emoji": str(model.get("emoji", "🏢")),
    "model": str(model["model"]),
  }

  for key in ("fallback", "geometryLod", "ios", "orbit", "type",
              "description", "officialName", "campusZone"):
    value = model.get(key)
    if value:
      entry[key] = str(value)

  if model.get("poster"):
    entry["poster"] = _stamped(str(model["poster"]))

  if model.get("exposure") is not None:
    entry["exposure"] = str(model["exposure"])

  category = str(model.get("category", "")).strip()
  if category:
    entry["category"] = category
    entry["categoryLabel"] = CATEGORY_LABELS.get(category, category)

  if model.get("_size_bytes"):
    entry["sizeBytes"] = int(model["_size_bytes"])
  if model.get("_fallback_size_bytes"):
    entry["fallbackSizeBytes"] = int(model["_fallback_size_bytes"])

  tiers = model.get("_tiers") or []
  if tiers:
    entry["tiers"] = tiers

  # Yalnizca manifeste yazilmis (yani teyitli) bilgi alanlari tasinir.
  for key in ("geo", "facts", "units", "accessibility", "scan", "render", "hotspots", "map"):
    value = model.get(key)
    if value:
      entry[key] = value

  keywords = model.get("keywords") or []
  if keywords:
    entry["keywords"] = [str(k) for k in keywords]

  return entry


def _models_generated_js(
  *,
  allowed_prefixes: list[str],
  catalog: list[dict[str, Any]],
) -> str:
  # Duvar saati yerine manifest icerigi: ayni girdi ayni cikti uretir,
  # boylece varlik damgalari her yapida bosuna degismez.
  payload = {
    "manifestVersion": _asset_version("models.json"),
    "allowedModelPrefixes": allowed_prefixes,
    "models": catalog,
  }
  json_text = json.dumps(payload, ensure_ascii=False, indent=2)
  return f"""/* Auto-generated by tools/build_site.py. Do not edit by hand. */
window.MODEL_GALLERY = {json_text};
"""


def _viewer_url(model: dict[str, Any], *, prefix: str) -> str:
  """Kisa goruntuleyici adresi.

  Model ayrintilari artik assets/models.generated.js icindeki katalogdan
  okunur; adres yalnizca kimlik tasir. Eski uzun parametreli baglantilar
  viewer.js tarafinda desteklenmeye devam eder.
  """
  return f"{prefix}viewer.html?{urlencode({'id': str(model['id'])})}"


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
    geometry_lod_path = str(m.get("geometryLod", "")).strip()

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
      m["_size_bytes"] = _model_total_bytes(ROOT_DIR / model_path)
      m["_tiers"] = _geometry_tiers(geometry_lod_path)

    if fallback_path:
      fb_errs = _validate_model_path(fallback_path)
      if fb_errs:
        errors.append(f"{model_id}: fallback '{fallback_path}': {', '.join(fb_errs)}")
      else:
        m["_fallback_size_bytes"] = _model_total_bytes(ROOT_DIR / fallback_path)

    if "textureLod" in m:
      errors.append(
        f"{model_id}: 'textureLod' alani kaldirildi "
        "(geometri LOD kademeleri KTX2 dokularini kendisi tasir)"
      )

    if geometry_lod_path:
      lod_errs = _validate_asset_path(
        geometry_lod_path,
        tuple(sorted(allowed_prefixes)),
        (".json",),
      )
      if lod_errs:
        errors.append(f"{model_id}: geometryLod '{geometry_lod_path}': {', '.join(lod_errs)}")

    # Default poster path (generated)
    poster_path = str(m.get("poster", "")).strip() or f"assets/posters/{model_id}.svg"
    m["poster"] = poster_path

    if write and generated_js and poster_path.lower().endswith(".svg"):
      poster_abs = ROOT_DIR / poster_path
      _write_text(poster_abs, _poster_svg(title=title, emoji=emoji))

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
    js = _models_generated_js(
      allowed_prefixes=allowed_sorted,
      catalog=[_catalog_entry(m) for m in models],
    )
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

  if index:
    cards: list[str] = []
    for m in models:
      label = escape(str(m["label"]))
      emoji = escape(str(m.get("emoji", "🏢")))
      url = escape(_viewer_url(m, prefix=""), quote=True)
      poster = escape(str(m.get("poster", "")), quote=True)
      keywords = m.get("keywords") or []
      model_type = escape(str(m.get("type", "3B kampüs modeli")))
      description = escape(str(m.get("description", "")))
      size_label = _format_megabytes(int(m.get("_size_bytes", 0)))
      category = str(m.get("category", "")).strip()
      category_label = CATEGORY_LABELS.get(category, "")
      tiers = m.get("_tiers") or []
      top_triangles = max((int(t.get("triangles") or 0) for t in tiers), default=0)
      meta_items = []
      if len(tiers) > 1:
        meta_items.append(f"{len(tiers)} kalite kademesi")
      triangle_label = _format_triangles(top_triangles)
      if triangle_label:
        meta_items.append(f"en yüksek {triangle_label}")
      meta_html = "".join(
        f'<span class="meta-item">{escape(item)}</span>' for item in meta_items
      )
      search_blob = " ".join([
        str(m.get("title", "")),
        str(m.get("label", "")),
        str(m.get("type", "")),
        str(m.get("description", "")),
        category_label,
        *[str(k) for k in keywords],
      ])
      data_title = escape(search_blob, quote=True)
      poster_avif, poster_main = _poster_sources(str(m.get("poster", "")))
      # İlk iki kart görünür alanda olduğu için erken ve yüksek öncelikli yüklenir.
      eager = len(cards) < 2
      img_attrs = (
        'loading="eager" fetchpriority="high" decoding="async"'
        if eager else 'loading="lazy" decoding="async"'
      )
      img_tag = (
        f'<img class="thumb" src="{poster_main}" alt="" width="1600" height="1000" {img_attrs}>'
      )
      media_html = (
        f'<picture><source type="image/avif" srcset="{escape(poster_avif, quote=True)}">{img_tag}</picture>'
        if poster_avif else img_tag
      )
      # Turntable döngüsü yalnızca üretilmişse eklenir; oynatma kararı
      # (hover yeteneği, hareket azaltma, alfa desteği) istemcide verilir.
      turntable_rel = f"assets/posters/{m['id']}.turntable.webm"
      if (ROOT_DIR / turntable_rel).is_file():
        media_html += (
          f'<video class="turntable" src="{escape(_stamped(turntable_rel), quote=True)}" '
          'muted loop playsinline preload="none" tabindex="-1" aria-hidden="true"></video>'
        )
      cards.append(
        "      "
        + f'<a class="card" href="{url}" data-id="{escape(str(m["id"]), quote=True)}" data-title="{data_title}" data-category="{escape(category, quote=True)}">'
        + '<div class="card-media">'
        + media_html
        + '<div class="card-badges">'
        + f'<span class="badge badge-3d">{ICON_CUBE}3D</span>'
        + f'<span class="badge badge-ar" data-ar-badge>{ICON_SCAN}'
        + '<span class="badge-ar-text">AR uyumlu</span></span>'
        + f'<span class="badge badge-size">{size_label}</span>'
        + '</div>'
        + '<div class="card-overlay" aria-hidden="true">'
        + f'<span class="cta">{ICON_CUBE} Ayrıntıları aç</span>'
        + '</div>'
        + '</div>'
        + '<div class="card-body">'
        + f'<span class="emoji" aria-hidden="true">{emoji}</span>'
        + '<span class="card-copy">'
        + f'<span class="label">{label}</span>'
        + f'<span class="card-type">{model_type}</span>'
        + f'<span class="card-description">{description}</span>'
        + (f'<span class="card-meta tabular">{meta_html}</span>' if meta_html else '')
        + '</span>'
        + f'<span class="card-arrow" aria-hidden="true">{ICON_ARROW}</span>'
        + '</div>'
        + "</a>"
      )
    cards_html = "\n".join(cards)
    page = _index_page(cards_html=cards_html, model_count=len(cards))
    if write:
      _write_text(ROOT_DIR / "index.html", page)

  return 0


def stamp_css(*, write: bool) -> list[str]:
  """tokens.css icindeki font adreslerini damgalar.

  index.html tokens.css'in hash'ini tasidigi icin bu adim yapidan ONCE
  calismalidir.
  """
  if _stamp_file("assets/tokens.css", CSS_FONT_QUERY_RE, prefix="assets/", write=write):
    return ["assets/tokens.css"]
  return []


def stamp_html(*, write: bool) -> list[str]:
  """El ile bakilan HTML dosyalarindaki varlik damgalarini tazeler.

  Uretilen dosyalari (assets/models.generated.js) da damgaladigi icin bu
  adim yapidan SONRA calismalidir.
  """
  changed: list[str] = []
  for rel in STAMPED_HTML_FILES:
    if _stamp_file(rel, ASSET_QUERY_RE, write=write):
      changed.append(rel)
  return changed


def main() -> int:
  parser = argparse.ArgumentParser(description="Build static pages from models.json")
  parser.add_argument("--check", action="store_true", help="validate only (do not write files)")
  parser.add_argument("--no-index", action="store_true", help="skip index.html generation")
  parser.add_argument("--no-redirects", action="store_true", help="skip per-folder redirect pages")
  parser.add_argument("--no-generated-js", action="store_true", help="skip assets/models.generated.js + posters")
  args = parser.parse_args()

  write = not args.check

  # index.html icindeki damgalar tokens.css'in son halinden turetildigi icin
  # damgalama, index uretiminden ONCE yapilir.
  changed = stamp_css(write=write)

  status = build(
    write=write,
    index=not args.no_index,
    redirects=not args.no_redirects,
    generated_js=not args.no_generated_js,
  )
  if status != 0:
    return status

  changed += stamp_html(write=write)
  if changed and not write:
    for rel in changed:
      print(f"STALE: {rel}: varlik damgasi guncel degil (tools/build_site.py ile tazelenir)")
    return 3
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
