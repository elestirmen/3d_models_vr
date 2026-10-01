#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
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

DEFAULT_THEME_COLOR = "#f9fafb"
PUBLIC_URL = "https://vr.perinet.org/"

# Varlik surumleme: elle yazilan bir surum etiketi yerine dosya icerigi.
# Boylece nginx /assets/ altini "immutable" ile bir yil onbelleklerken
# icerik degistiginde adres de degisir.
# Damgalama iki aşamalı: önce ilgili öznitelik bulunur, sonra DEĞERİN İÇİNDEKİ
# her adres ayrı damgalanır. Tek aşamalı bir desen, çok kaynaklı
# `srcset="a.avif?v=1 800w, b.avif?v=2 1600w"` değerini bozardı.
ASSET_ATTR_RE = re.compile(r'((?:href|src|srcset)=")([^"]*)(")')
ASSET_URL_RE = re.compile(r'(assets/[^"?\s,]+|manifest\.webmanifest)(\?v=)([^\s,"]*)')
CSS_FONT_QUERY_RE = re.compile(r'(url\(")(fonts/[^")?]+)(\?v=)[^")]*("\))')
STAMPED_HTML_FILES = ("index.html", "viewer.html", "map.html")

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


def _icon(paths: str) -> str:
  return ('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" '
          'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>')

ICON_MAP = _icon('<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>')
ICON_GRID = _icon('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>')
ICON_LIST = _icon('<path d="M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1"/>')


@functools.lru_cache(maxsize=None)
def _asset_version(rel_path: str) -> str:
  """Varlik icerigi icin kisa sha256 damgasi (yoksa '0')."""
  path = ROOT_DIR / rel_path
  if not path.is_file():
    return "0"
  digest = hashlib.sha256(path.read_bytes()).hexdigest()
  return digest[:10]


def _stamp_text(text: str, pattern: re.Pattern[str], *, prefix: str = "") -> str:
  """`?v=` taşıyan aynı köken varlık adreslerini içerik damgasıyla günceller."""
  if pattern is ASSET_ATTR_RE:
    def replace_attr(match: re.Match[str]) -> str:
      value = ASSET_URL_RE.sub(
        lambda url: f"{url.group(1)}{url.group(2)}{_asset_version(prefix + url.group(1))}",
        match.group(2),
      )
      return f"{match.group(1)}{value}{match.group(3)}"
    return pattern.sub(replace_attr, text)

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


POSTER_SIZES = "(min-width: 1180px) 358px, (min-width: 640px) 45vw, 92vw"
POSTER_DERIVATIVE_WIDTH = 800


def _poster_srcset(poster: str, variant: str) -> str:
  """Poster için `srcset` adayları (800 px türevi + 1600 px ana dosya)."""
  if not poster:
    return ""
  master = Path(poster).with_suffix(f".{variant}").as_posix()
  derivative = Path(poster).with_name(
    f"{Path(poster).stem}@{POSTER_DERIVATIVE_WIDTH}.{variant}"
  ).as_posix()
  candidates = []
  if (ROOT_DIR / derivative).is_file():
    candidates.append(f"{_stamped(derivative)} {POSTER_DERIVATIVE_WIDTH}w")
  if (ROOT_DIR / master).is_file():
    candidates.append(f"{_stamped(master)} 1600w")
  return ", ".join(candidates)


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


def _json_ld(model: dict[str, Any], *, page_url: str, poster_url: str) -> str:
  """schema.org işaretlemesi.

  `application/ld+json` çalıştırılabilir betik olmadığı için CSP `script-src`
  altında engellenmez; yine de dışarıdan gelen değer yok, tümü manifestten.
  """
  place: dict[str, Any] = {
    "@type": "Place",
    "name": str(model.get("officialName") or model.get("title")),
    "url": page_url,
    "image": poster_url,
    "containedInPlace": {
      "@type": "CollegeOrUniversity",
      "name": "Osmaniye Korkut Ata Üniversitesi",
      "url": "https://www.osmaniye.edu.tr/",
    },
  }
  if model.get("description"):
    place["description"] = str(model["description"])
  if model.get("label") and model["label"] != place["name"]:
    place["alternateName"] = str(model["label"])

  geo = model.get("geo") or {}
  if isinstance(geo, dict) and geo.get("lat") is not None and geo.get("lng") is not None:
    place["geo"] = {
      "@type": "GeoCoordinates",
      "latitude": geo["lat"],
      "longitude": geo["lng"],
    }

  units = model.get("units") or []
  if units:
    place["containsPlace"] = [
      {"@type": "Place", "name": str(unit.get("name"))}
      for unit in units if isinstance(unit, dict) and unit.get("name")
    ]

  model_path = str(model.get("model", ""))
  if model_path:
    place["subjectOf"] = {
      "@type": "3DModel",
      "name": f"{model.get('title')} 3B modeli",
      "encodingFormat": "model/gltf-binary",
      "contentUrl": PUBLIC_URL + model_path,
    }

  graph = {
    "@context": "https://schema.org",
    "@graph": [
      place,
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          {"@type": "ListItem", "position": 1, "name": "OKÜ Dijital Yerleşke", "item": PUBLIC_URL},
          {"@type": "ListItem", "position": 2, "name": place["name"], "item": page_url},
        ],
      },
    ],
  }
  # </script> kaçışı: JSON içinde geçemez ama savunma amaçlı.
  return json.dumps(graph, ensure_ascii=False, indent=2).replace("</", "<\\/")


def _landing_page(model: dict[str, Any], *, tiers: list[dict[str, Any]]) -> str:
  """Model başına paylaşılabilir tanıtım sayfası.

  Görüntüleyici tek sayfa olduğu için modele özel OG görseli ve açıklaması
  yalnızca burada verilebilir; bu sayfalar paylaşım ve arama için giriş
  noktasıdır ve 3B görüntüleyiciye yönlendirir.
  """
  model_id = str(model["id"])
  title = str(model.get("officialName") or model.get("title"))
  short = str(model.get("label") or model.get("title"))
  description = str(model.get("description") or f"{title} yapısını 3B olarak inceleyin.")
  page_url = f"{PUBLIC_URL}{model_id}/"
  poster = str(model.get("poster") or "")
  poster_url = PUBLIC_URL + poster if poster else f"{PUBLIC_URL}assets/social-card.webp"
  poster_avif, poster_main = _poster_sources(poster)

  chips = []
  category_label = CATEGORY_LABELS.get(str(model.get("category", "")), "")
  for value in (category_label, model.get("type"), model.get("campusZone")):
    if value:
      chips.append(f'<span class="chip">{escape(str(value))}</span>')

  units_html = ""
  units = model.get("units") or []
  if units:
    items = []
    for unit in units:
      name = escape(str(unit.get("name", "")))
      url = str(unit.get("url", ""))
      if not name:
        continue
      if url.startswith(("http://", "https://")):
        items.append(f'<li><a href="{escape(url, quote=True)}" rel="noopener">{name}</a></li>')
      else:
        items.append(f"<li>{name}</li>")
    if items:
      units_html = ('<section class="block"><h2>Birimler</h2><ul class="list">'
                    + "".join(items) + "</ul></section>")

  location_html = ""
  geo = model.get("geo") or {}
  if isinstance(geo, dict) and geo.get("lat") is not None and geo.get("lng") is not None:
    latitude, longitude = geo["lat"], geo["lng"]
    location_html = (
      '<section class="block"><h2>Konum</h2>'
      f'<p class="mono">{latitude:.5f}, {longitude:.5f}</p>'
      f'<a class="action action-secondary" rel="noopener" target="_blank" '
      f'href="https://www.google.com/maps/dir/?api=1&amp;destination={latitude},{longitude}">Yol tarifi al</a>'
      "</section>"
    )

  tiers_html = ""
  if tiers:
    rows = "".join(
      f'<tr><th scope="row">{escape(str(tier.get("label", tier.get("id"))))}</th>'
      f'<td>{escape(_format_megabytes(int(tier.get("bytes") or 0)))}</td>'
      f'<td>{escape(_format_triangles(int(tier.get("triangles") or 0)) or "—")}</td></tr>'
      for tier in tiers
    )
    tiers_html = (
      '<section class="block"><h2>Model künyesi</h2>'
      '<table class="table"><thead><tr><th>Kalite</th><th>Boyut</th><th>Üçgen</th></tr></thead>'
      f"<tbody>{rows}</tbody></table>"
      '<p class="note">Biçim: glTF 2.0 · KTX2 doku · Meshopt geometri</p></section>'
    )

  sources_html = ""
  sources = model.get("sources") or []
  if sources:
    items = "".join(
      f'<li><a href="{escape(str(source["url"]), quote=True)}" rel="noopener" target="_blank">'
      f'{escape(str(source["label"]))}</a></li>'
      for source in sources
      if isinstance(source, dict) and source.get("label") and str(source.get("url", "")).startswith("http")
    )
    if items:
      sources_html = (
        f'<section class="block"><h2>Kaynak</h2><ul class="list">{items}</ul>'
        '<p class="note">Bu bilgiler kurumun kamuya açık sayfalarından derlendi; '
        'yapı bazında ayrıca teyit edilmedi.</p></section>'
      )

  map_button = ""
  if model.get("map"):
    map_button = (
      f'<a class="action action-secondary" href="../map.html?focus={escape(model_id, quote=True)}">'
      "Haritada göster</a>"
    )

  picture = (
    f'<picture><source type="image/avif" srcset="../{escape(poster_avif, quote=True)}">'
    f'<img class="poster" src="../{escape(poster_main, quote=True)}" alt="" '
    'width="1600" height="1000" decoding="async"></picture>'
    if poster_avif else
    f'<img class="poster" src="../{escape(poster_main, quote=True)}" alt="" '
    'width="1600" height="1000" decoding="async">'
  )

  csp = (
    "default-src 'self'; base-uri 'self'; object-src 'none'; "
    "script-src 'self'; style-src 'self'; img-src 'self' data:; "
    "font-src 'self'; connect-src 'self'; upgrade-insecure-requests"
  )

  return f"""<!doctype html>
<html lang="tr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{escape(title)} • OKÜ Dijital Yerleşke</title>
    <meta name="description" content="{escape(description, quote=True)}">
    <meta name="theme-color" content="{DEFAULT_THEME_COLOR}">
    <meta http-equiv="Content-Security-Policy" content="{csp}">
    <link rel="canonical" href="{page_url}">
    <meta property="og:type" content="website">
    <meta property="og:locale" content="tr_TR">
    <meta property="og:site_name" content="OKÜ Dijital Yerleşke">
    <meta property="og:title" content="{escape(title, quote=True)}">
    <meta property="og:description" content="{escape(description, quote=True)}">
    <meta property="og:url" content="{page_url}">
    <meta property="og:image" content="{poster_url}">
    <meta property="og:image:alt" content="{escape(title, quote=True)} 3B modeli">
    <meta name="twitter:card" content="summary_large_image">
    <link rel="icon" type="image/svg+xml" href="../assets/favicon.svg?v={_asset_version('assets/favicon.svg')}">
    <link rel="manifest" href="../manifest.webmanifest?v={_asset_version('manifest.webmanifest')}">
    <link rel="preload" href="../assets/fonts/inter-latin-wght-normal.woff2?v={_asset_version('assets/fonts/inter-latin-wght-normal.woff2')}" as="font" type="font/woff2" crossorigin>
    <script src="../assets/theme.js?v={_asset_version('assets/theme.js')}"></script>
    <link rel="stylesheet" href="../assets/tokens.css?v={_asset_version('assets/tokens.css')}">
    <link rel="stylesheet" href="../assets/landing.css?v={_asset_version('assets/landing.css')}">
    <script type="application/ld+json">
{_json_ld(model, page_url=page_url, poster_url=poster_url)}
    </script>
  </head>
  <body>
    <header class="top">
      <a class="back" href="../">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
        OKÜ Dijital Yerleşke
      </a>
    </header>

    <main class="wrap">
      <div class="media">{picture}</div>

      <h1>{escape(title)}</h1>
      <p class="chips">{"".join(chips)}</p>
      <p class="lead">{escape(description)}</p>

      <div class="actions">
        <a class="action action-primary" href="../viewer.html?id={escape(model_id, quote=True)}">3B görüntüle</a>
        {map_button}
      </div>

      {units_html}
      {location_html}
      {tiers_html}
      {sources_html}
    </main>

    <footer class="foot">
      <p><strong>OKÜ Dijital Yerleşke</strong> · {escape(short)} · <a href="../">Tüm yapılar</a></p>
    </footer>
    <script src="../assets/landing.js?v={_asset_version('assets/landing.js')}"></script>
  </body>
</html>
"""


def _index_page(*, cards_html: str, model_count: int, category_counts: dict[str, int]) -> str:
  filters_html = f'<button type="button" data-category="all" aria-pressed="true">Tümü <span>{model_count}</span></button>'
  for category, label in CATEGORY_LABELS.items():
    count = category_counts.get(category, 0)
    if count:
      filters_html += (f'<button type="button" data-category="{escape(category)}" aria-pressed="false">'
                       f'{escape(label)} <span>{count}</span></button>')
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
    <script src="assets/theme.js?v={_asset_version('assets/theme.js')}"></script>
    <link rel="stylesheet" href="assets/tokens.css?v={_asset_version('assets/tokens.css')}">
    <link rel="stylesheet" href="assets/index.css?v={_asset_version('assets/index.css')}">{lqip_link}
  </head>
  <body>
    <a class="skip-link" href="#explore">İçeriğe geç</a>
    <header class="site-header page-width">
      <a class="brand-lockup" href="./" aria-label="OKÜ Dijital Yerleşke ana sayfa">
        <span class="brand-mark">{ICON_CUBE}</span>
        <span><strong>OKÜ <span>Dijital Yerleşke</span></strong><small>OSMANİYE KORKUT ATA ÜNİVERSİTESİ</small></span>
      </a>
      <nav class="site-nav" aria-label="Ana gezinme">
        <a class="is-current" href="#explore">Keşfet</a>
        <a href="map.html">Kampüs haritası</a>
        <a href="#how-it-works">Nasıl çalışır?</a>
      </nav>
      <button id="themeToggle" class="theme-toggle" type="button" aria-label="Koyu temaya geç" title="Koyu temaya geç">{ICON_SUN}{ICON_MOON}</button>
    </header>

    <main id="mainContent" class="page-width">
      <section class="hero" aria-labelledby="heroTitle">
        <div class="hero-text">
          <p class="eyebrow"><span class="dot" aria-hidden="true"></span> KAMPÜSÜN DİJİTAL İKİZİ</p>
          <h1 id="heroTitle">Bir kampüs.<br><span>Sınırsız keşif.</span></h1>
          <p class="subtitle">Kampüse yeni bir açıdan bakın. Binaları üç boyutlu keşfedin, her ayrıntıya yaklaşın ve yerleşkeyi bulunduğunuz yere taşıyın.</p>
          <div class="hero-actions">
            <a class="button button-primary" href="#explore">Keşfetmeye başla {ICON_ARROW}</a>
            <a class="button button-secondary" href="map.html">{ICON_MAP} Haritayı aç</a>
          </div>
          <a id="continueExploring" class="continue-link" hidden></a>
          <div class="hero-stats" aria-label="Deneyim özellikleri">
            <div><strong>{model_count}<span> yapı ve plan</span></strong><small>Tek bir yerleşke, farklı hikâyeler</small></div>
            <div><strong>360°<span> bakış açısı</span></strong><small>Her ayrıntıyı özgürce inceleyin</small></div>
            <div><strong>AR<span> deneyimi</span></strong><small>Destekleyen telefonlarda</small></div>
          </div>
        </div>
        <a class="hero-scene" href="viewer.html?id=oku_genel_plan" aria-label="Yerleşke genel planını 3B keşfet">
          <div class="scene-topline"><span class="scene-label">{ICON_CUBE} YERLEŞKEYE GENEL BAKIŞ</span><span class="scene-mode">3B MODEL</span></div>
          <div class="scene-orbit" aria-hidden="true"></div>
          <picture>
            <source type="image/avif" srcset="{_poster_srcset('assets/posters/oku_genel_plan.webp', 'avif')}" sizes="(min-width: 1000px) 620px, 90vw">
            <img class="hero-model" src="{_stamped('assets/posters/oku_genel_plan@800.webp')}" width="800" height="500" alt="OKÜ yerleşkesinin gerçek 3B taramasından genel görünüm" fetchpriority="high" decoding="async">
          </picture>
          <span class="scene-coordinate" aria-hidden="true">OKÜ / KARACAOĞLAN YERLEŞKESİ</span>
          <div class="scene-caption"><span><small>İLK DURAĞINIZ</small><strong>Kampüsün tamamını keşfedin</strong></span><span class="scene-open">{ICON_ARROW}</span></div>
        </a>
      </section>

      <section id="explore" class="catalog" aria-labelledby="exploreTitle" tabindex="-1">
        <div class="section-heading"><div><p class="eyebrow">YERLEŞKEYİ TANIYIN</p><h2 id="exploreTitle">Bir yapı seçin, keşfe çıkın.</h2></div><span class="section-note">Size en yakın açı, sizin açınız.</span></div>
        <div class="toolbar">
          <div class="search" role="search">
            <label class="sr-only" for="searchInput">Bina veya birim ara</label>
            <span class="search-icon">{ICON_SEARCH}</span>
            <input id="searchInput" type="search" placeholder="Bina veya birim ara…" autocomplete="off" inputmode="search" aria-controls="grid">
            <kbd class="kbd" aria-hidden="true">/</kbd>
            <button id="clearSearch" type="button" aria-label="Aramayı temizle" hidden>×</button>
          </div>
          <div class="catalog-tools">
            <label class="sort-control"><span class="sr-only">Yapıları sırala</span><select id="sortOrder"><option value="default">Yerleşke sırası</option><option value="az">Ada göre: A–Z</option><option value="size">En küçük indirme</option></select></label>
            <div class="layout-switch" role="group" aria-label="Görünüm">
              <button type="button" data-layout="grid" aria-label="Kart görünümü" aria-pressed="true">{ICON_GRID}</button>
              <button type="button" data-layout="list" aria-label="Liste görünümü" aria-pressed="false">{ICON_LIST}</button>
            </div>
          </div>
        </div>
        <div class="filter-row"><div class="filters" role="group" aria-label="Yapı kategorileri">{filters_html}</div><span id="count" class="count" role="status" aria-live="polite" aria-atomic="true">{model_count} yapı ve plan</span></div>
        <div class="grid" id="grid" aria-label="Yapılar ve yerleşke planı">
{cards_html}
        </div>
        <div id="empty" class="empty is-hidden">
          <span class="empty-icon" aria-hidden="true">{ICON_SEARCH}</span><h3>Aradığınız yapı görünmüyor.</h3>
          <p id="emptyMessage">Farklı bir bina adı deneyin veya kategori seçimini kaldırın.</p>
          <button id="resetFilters" class="button button-primary" type="button">Tüm yapıları göster</button>
        </div>
      </section>

      <section id="how-it-works" class="guide" aria-labelledby="guideTitle">
        <div class="section-heading"><div><p class="eyebrow">İLK KEŞFİNİZ Mİ?</p><h2 id="guideTitle">Yerleşke, parmaklarınızın ucunda.</h2></div><a class="text-link" href="map.html">Haritadan başla {ICON_ARROW}</a></div>
        <div class="guide-steps">
          <article><span class="step-number">01</span><h3>Merak ettiğiniz yapıyı bulun.</h3><p>İsme göre arayın, kategorileri keşfedin veya kampüs haritasından bir bina seçin.</p></article>
          <article><span class="step-number">02</span><h3>Bakış açınızı değiştirin.</h3><p>Modeli sürükleyerek döndürün, yakınlaştırın. Hazır kamera açılarıyla çatıdan cepheye geçin.</p></article>
          <article><span class="step-number">03</span><h3>Kampüsü yanınıza alın.</h3><p>Destekleyen telefonlarda AR ile gerçek ortamınıza yerleştirin. Bina bilgisi panelinden çevrimdışı kaydedin.</p></article>
        </div>
      </section>
    </main>

    <footer class="footer page-width"><div class="footer-main"><a class="brand-lockup" href="./"><span class="brand-mark">{ICON_CUBE}</span><strong>OKÜ Dijital Yerleşke</strong></a><span>Keşfetmenin yeni boyutu.</span><a href="#heroTitle">Başa dön ↑</a></div>
      <div class="footer-bottom"><span>Osmaniye Korkut Ata Üniversitesi</span><p>Çerezsiz kullanım ölçümü · IP adresi ve kişisel veri kaydedilmez. Do Not Track tercihinize uyulur.</p></div>
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
  for key in ("geo", "facts", "units", "accessibility", "scan", "render", "hotspots",
              "map", "sources"):
    value = model.get(key)
    if value:
      entry[key] = value

  keywords = model.get("keywords") or []
  if keywords:
    entry["keywords"] = [str(k) for k in keywords]

  return entry


def _sitemap(urls: list[str]) -> str:
  """Basit sitemap.

  NOT: Site şu anda ön vekilde `X-Robots-Tag: noindex` ile ve kendi
  robots.txt'si `Disallow: /` ile arama motorlarına kapalı. Sitemap bu karar
  değiştiğinde hazır olsun diye üretilir; tek başına indekslemeyi açmaz.
  """
  # lastmod: manifest son değişiklik tarihi (içerik bu dosyadan türetilir)
  manifest_path = ROOT_DIR / "models.json"
  stamp = dt.datetime.fromtimestamp(
    manifest_path.stat().st_mtime, dt.timezone.utc
  ).strftime("%Y-%m-%d") if manifest_path.is_file() else ""

  entries = "\n".join(
    f"  <url>\n    <loc>{escape(url)}</loc>\n"
    + (f"    <lastmod>{stamp}</lastmod>\n" if stamp else "")
    + "  </url>"
    for url in urls
  )
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    f"{entries}\n"
    "</urlset>\n"
  )


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
    landing_urls: list[str] = []
    for m in models:
      model_id = str(m["id"])
      folder = ROOT_DIR / model_id
      if not folder.is_dir():
        # Klasörü olmayan kimlikler için tanıtım sayfası üretilmez.
        continue
      page = _landing_page(m, tiers=m.get("_tiers") or [])
      landing_urls.append(f"{PUBLIC_URL}{model_id}/")
      if write:
        _write_text(folder / "index.html", page)

    if write:
      _write_text(ROOT_DIR / "sitemap.xml", _sitemap([
        PUBLIC_URL,
        f"{PUBLIC_URL}map.html",
        *landing_urls,
      ]))

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
      search_blob = " ".join([
        str(m.get("title", "")),
        str(m.get("label", "")),
        str(m.get("type", "")),
        str(m.get("description", "")),
        category_label,
        str(m.get("officialName", "")),
        str(m.get("campusZone", "")),
        *[str(unit.get("name", "")) for unit in m.get("units", [])],
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
      # Kart ~358 px genişlikte gösteriliyor; 1600 px ana dosya yalnızca büyük
      # ekran/3x için gerekli. srcset ile tarayıcı 800 px türevi seçebiliyor.
      sources = []
      for variant, mime in (("avif", "image/avif"), ("webp", "image/webp")):
        candidates = _poster_srcset(str(m.get("poster", "")), variant)
        if candidates:
          sources.append(
            f'<source type="{mime}" srcset="{escape(candidates, quote=True)}" sizes="{POSTER_SIZES}">'
          )
      media_html = (
        f'<picture>{"".join(sources)}{img_tag}</picture>' if sources else img_tag
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
        + f'<a class="card" href="{url}" data-id="{escape(str(m["id"]), quote=True)}" data-title="{data_title}" data-category="{escape(category, quote=True)}" data-size="{int(m.get("_size_bytes", 0))}">'
        + '<div class="card-media">'
        + media_html
        + '<div class="card-badges">'
        + f'<span class="badge badge-3d">{ICON_CUBE}3D</span>'
        + f'<span class="badge badge-ar" data-ar-badge>{ICON_SCAN}'
        + '<span class="badge-ar-text">AR uyumlu</span></span>'
        + f'<span class="badge badge-size" title="Başlangıç indirme boyutu">{size_label}</span>'
        + '</div>'
        + '<div class="card-overlay" aria-hidden="true">'
        + f'<span class="cta">{ICON_CUBE} 3B keşfet</span>'
        + '</div>'
        + '</div>'
        + '<div class="card-body">'

        + '<span class="card-copy">'
        + f'<span class="card-category">{escape(category_label)}</span>'
        + f'<span class="label">{label}</span>'
        + f'<span class="card-type">{model_type}</span>'
        + f'<span class="card-description">{description}</span>'
        + f'<span class="card-meta">3B keşfet {ICON_ARROW}</span>'
        + '</span>'
        + f'<span class="card-arrow" aria-hidden="true">{ICON_ARROW}</span>'
        + '</div>'
        + "</a>"
      )
    cards_html = "\n".join(cards)
    page = _index_page(cards_html=cards_html, model_count=len(cards),
                       category_counts={c: sum(m.get("category") == c for m in models) for c in CATEGORY_LABELS})
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
  for rel in (*STAMPED_HTML_FILES, *(str(path.relative_to(ROOT_DIR)) for path in ROOT_DIR.glob("*/index.html"))):
    if _stamp_file(rel, ASSET_ATTR_RE, write=write):
      changed.append(rel)
  return changed


def stamp_service_worker(*, write: bool) -> list[str]:
  """Derive an offline shell and release ID from the actual built documents."""
  documents = ("index.html", "map.html", "viewer.html")
  urls = {"./", "map.html", "viewer.html", "manifest.webmanifest"}
  digest = hashlib.sha256()
  for document in documents:
    content = (ROOT_DIR / document).read_text(encoding="utf-8")
    digest.update(content.encode())
    # The rendering engine is loaded on demand and saved with an offline model;
    # visiting the gallery must not download the 3D runtime.
    for url in re.findall(r'(?:src|href)="(assets/[^" ]+)"', content):
      # Never precache model geometry or optional preview videos. Lazy gallery
      # posters are cached when visited; keep the shell small and predictable.
      if "/posters/" in url or url.endswith(".webm") or ".webm?" in url or (document == "viewer.html" and "/vendor/" in url):
        continue
      urls.add(url)
  for font in ("inter-latin-wght-normal.woff2", "inter-latin-ext-wght-normal.woff2"):
    urls.add(_stamped("assets/fonts/" + font))
  urls.add(_stamped("assets/map/campus-plan.avif"))
  urls.add(_stamped("manifest.webmanifest"))
  for url in sorted(urls):
    digest.update(url.encode())
  block = ("// BEGIN GENERATED SHELL — tools/build_site.py\n"
           f"const VERSION = '{digest.hexdigest()[:12]}';\n"
           f"const SHELL_URLS = {json.dumps(sorted(urls), ensure_ascii=False, indent=2)};\n"
           "// END GENERATED SHELL")
  path = ROOT_DIR / "geometry-lod-sw.js"
  original = path.read_text(encoding="utf-8")
  updated = re.sub(r"// BEGIN GENERATED SHELL.*?// END GENERATED SHELL", lambda _: block, original, flags=re.S)
  if updated == original:
    return []
  if write:
    _write_text(path, updated)
  return ["geometry-lod-sw.js"]


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
  changed += stamp_service_worker(write=write)
  if changed and not write:
    for rel in changed:
      print(f"STALE: {rel}: varlik damgasi guncel degil (tools/build_site.py ile tazelenir)")
    return 3
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
