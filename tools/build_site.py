#!/usr/bin/env python3
"""OKÜ Dijital Yerleşke — statik site üretimi.

Tek kaynaktan (models.json + src/locales + src/templates) bütün yayın
dosyalarını üretir:

  - index.html, map.html, viewer.html ve /<model>/ tanıtım sayfaları,
    her biri Türkçe (kök) ve İngilizce (/en/) olarak,
  - assets/js/catalog.js (görüntüleyici ve haritanın okuduğu katalog),
  - manifest.webmanifest + en/manifest.webmanifest, sitemap.xml,
  - geometry-lod-sw.js içindeki uygulama kabuğu listesi ve sürüm kimliği.

Varlık sürümleme içerik hash'iyle yapılır (`?v=<sha256[:10]>`); nginx
/assets altını bir yıl "immutable" önbelleklediği için içerik değişince
adres de değişmelidir. ES modüllerinin göreli import'ları da damgalanır:
bir modül değişince onu içe aktaran modüllerin hash'i de değişir
(bağımlılık grafiği yapraktan köke doğru işlenir).

Kullanım:
  python3 tools/build_site.py           # üret ve yaz
  python3 tools/build_site.py --check   # yalnızca doğrula; bayat dosya varsa 3 ile çıkar
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
import sys
from dataclasses import dataclass, field
from html import escape
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

try:
  import jinja2
  from markupsafe import Markup
except ModuleNotFoundError:  # pragma: no cover - kurulum yönergesi
  print("HATA: jinja2 gerekli (apt install python3-jinja2 veya pip install jinja2)", file=sys.stderr)
  raise SystemExit(2)


ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "models.json"
TEMPLATES = ROOT / "src" / "templates"
LOCALES = ROOT / "src" / "locales"
PUBLIC_URL = "https://vr.perinet.org/"
LANGS = ("tr", "en")
DEFAULT_LANG = "tr"
CATEGORY_ORDER = ("egitim", "yonetim", "sosyal", "uygulama", "plan")
CAMPUS_ID = "oku_genel_plan"
POSTER_DERIVATIVE_WIDTHS = (480, 800)
POSTER_SIZES = "(min-width: 1240px) 390px, (min-width: 720px) 45vw, 92vw"

# Damgalanan kaynaklar: göreli import'lar (statik + dinamik) ve CSS url().
JS_IMPORT_RE = re.compile(
  r"""(?P<pre>\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(?P<q>['"])(?P<spec>\.{1,2}/[^'"?#\s]+?\.js)(?:\?v=[0-9a-f]*)?(?P=q)"""
)
CSS_URL_RE = re.compile(
  r"""url\(\s*(?P<q>['"]?)(?P<path>(?!data:|https?:|/)[^'")?#]+)(?:\?v=[^'")#]*)?(?P<frag>#[^'")]*)?(?P=q)\s*\)"""
)

HTML_CSP = (
  "default-src 'self'; base-uri 'self'; object-src 'none'; form-action 'self'; "
  "script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; "
  "connect-src 'self'; media-src 'self'; worker-src 'self'; manifest-src 'self'; "
  "upgrade-insecure-requests"
)
# Görüntüleyici: 'wasm-unsafe-eval' Meshopt/Basis/Draco WASM çözücüleri için,
# 'unsafe-eval' basis_transcoder.js (Emscripten embind, new Function) için
# zorunludur. 'unsafe-inline' stil, model-viewer'ın gölge DOM stilleri içindir.
VIEWER_CSP = (
  "default-src 'self'; base-uri 'self'; object-src 'none'; form-action 'self'; "
  "script-src 'self' blob: 'wasm-unsafe-eval' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; "
  "img-src 'self' data: blob:; font-src 'self'; connect-src 'self' blob:; media-src 'self'; "
  "worker-src 'self' blob:; manifest-src 'self'; upgrade-insecure-requests"
)


class BuildError(Exception):
  pass


# --------------------------------------------------------------------------
# Sanal dosya sistemi: üretilen içerik önce bellekte tutulur. Damgalar
# bellekteki son içerikten hesaplanır; --check diske hiç yazmaz.
# --------------------------------------------------------------------------
@dataclass
class Workspace:
  files: dict[str, bytes] = field(default_factory=dict)
  _hashes: dict[str, str] = field(default_factory=dict)

  def exists(self, rel: str) -> bool:
    return rel in self.files or (ROOT / rel).is_file()

  def read_bytes(self, rel: str) -> bytes:
    if rel in self.files:
      return self.files[rel]
    return (ROOT / rel).read_bytes()

  def read_text(self, rel: str) -> str:
    return self.read_bytes(rel).decode("utf-8")

  def put(self, rel: str, content: str | bytes) -> None:
    data = content.encode("utf-8") if isinstance(content, str) else content
    self.files[rel] = data
    self._hashes.pop(rel, None)

  def digest(self, rel: str) -> str:
    if rel not in self._hashes:
      if not self.exists(rel):
        raise BuildError(f"damgalanacak dosya yok: {rel}")
      self._hashes[rel] = hashlib.sha256(self.read_bytes(rel)).hexdigest()[:10]
    return self._hashes[rel]

  def stamped(self, rel: str) -> str:
    return f"{rel}?v={self.digest(rel)}"

  def changed(self) -> list[str]:
    out = []
    for rel, data in sorted(self.files.items()):
      path = ROOT / rel
      if not path.is_file() or path.read_bytes() != data:
        out.append(rel)
    return out

  def commit(self) -> list[str]:
    written = self.changed()
    for rel in written:
      path = ROOT / rel
      path.parent.mkdir(parents=True, exist_ok=True)
      path.write_bytes(self.files[rel])
    return written


# --------------------------------------------------------------------------
# Yardımcılar
# --------------------------------------------------------------------------
def read_json(path: Path) -> Any:
  return json.loads(path.read_text(encoding="utf-8"))


def is_safe_rel(path: str) -> bool:
  if not path or path.startswith(("/", "\\")) or ":" in path:
    return False
  return ".." not in Path(path).parts


def normalize(base: Path | str, spec: str) -> str:
  """`base` klasörüne göre `spec` yolunu kökten göreli, '..' içermeyen yola çevirir."""
  parts: list[str] = [p for p in Path(base).parts if p not in ("", ".")]
  for part in spec.split("/"):
    if part == "..":
      if not parts:
        raise BuildError(f"yol kökün dışına çıkıyor: {spec}")
      parts.pop()
    elif part not in ("", "."):
      parts.append(part)
  return "/".join(parts)


def strip_private(value: Any) -> Any:
  """`_` ile başlayan anahtarlar (çeviri notları) yayına çıkmaz."""
  if isinstance(value, dict):
    return {k: strip_private(v) for k, v in value.items() if not str(k).startswith("_")}
  if isinstance(value, list):
    return [strip_private(v) for v in value]
  return value


class Strings:
  """Şablonda `t.home.title` erişimi; eksik anahtar derlemeyi durdurur.

  dict alt sınıfı DEĞİLDİR: `t.common.copy` gibi anahtarlar dict
  metotlarıyla (copy, items, keys…) çakışıp metodu döndürürdü.
  """

  __slots__ = ("_data",)

  def __init__(self, data: dict[str, Any]) -> None:
    self._data = data

  def _get(self, key: str) -> Any:
    try:
      value = self._data[key]
    except KeyError as error:
      raise BuildError(f"çeviri anahtarı eksik: {key}") from error
    return Strings(value) if isinstance(value, dict) else value

  def __getattr__(self, key: str) -> Any:
    if key.startswith("__"):
      raise AttributeError(key)
    return self._get(key)

  def __getitem__(self, key: str) -> Any:
    return self._get(key)

  def __contains__(self, key: object) -> bool:
    return key in self._data


def fill(template: str, **values: Any) -> str:
  for key, value in values.items():
    template = template.replace("{" + key + "}", str(value))
  return template


def format_number(value: float, lang: str, digits: int = 1) -> str:
  text = f"{value:.{digits}f}"
  return text.replace(".", ",") if lang == "tr" else text


def format_mb(size: int, lang: str) -> str:
  return f"{format_number(size / (1024 * 1024), lang)} MB"


def format_triangles(count: int, lang: str, strings: Strings) -> str:
  if count <= 0:
    return ""
  if count >= 1_000_000:
    return fill(strings.format.trianglesM, n=format_number(count / 1_000_000, lang))
  if count >= 1_000:
    return fill(strings.format.trianglesK, n=round(count / 1000))
  return fill(strings.format.triangles, n=count)


def json_script(value: Any) -> Markup:
  """<script type=application/json> içine güvenli JSON (</ kaçışlı)."""
  text = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
  return Markup(text.replace("</", "<\\/").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029"))


# --------------------------------------------------------------------------
# Manifest doğrulama ve zenginleştirme
# --------------------------------------------------------------------------
def gltf_total_bytes(model_path: Path) -> int:
  total = model_path.stat().st_size
  if model_path.suffix.lower() != ".gltf":
    return total
  try:
    document = json.loads(model_path.read_text(encoding="utf-8"))
  except (OSError, json.JSONDecodeError, UnicodeDecodeError):
    return total
  uris = {
    item.get("uri") for item in [*(document.get("buffers") or []), *(document.get("images") or [])]
    if isinstance(item.get("uri"), str) and not item["uri"].startswith("data:") and is_safe_rel(item["uri"])
  }
  for uri in uris:
    dependency = model_path.parent / uri
    if dependency.is_file():
      total += dependency.stat().st_size
  return total


def geometry_tiers(rel: str) -> list[dict[str, Any]]:
  """Kademe künyesi gltfpack raporlarından gelir; elle yazılmaz."""
  path = ROOT / rel
  if not rel or not path.is_file():
    return []
  try:
    document = read_json(path)
  except (OSError, json.JSONDecodeError):
    return []
  tiers = []
  for tier in document.get("tiers") or []:
    tier_id = str(tier.get("id", "")).strip()
    if tier_id:
      tiers.append({"id": tier_id, "bytes": int(tier.get("bytes") or 0), "triangles": int(tier.get("triangles") or 0)})
  return tiers


def load_models() -> tuple[dict[str, Any], list[dict[str, Any]]]:
  manifest = read_json(MANIFEST_PATH)
  models: list[dict[str, Any]] = list(manifest.get("models") or [])
  errors: list[str] = []
  seen: set[str] = set()
  for index, m in enumerate(models):
    model_id = str(m.get("id", "")).strip()
    if not re.fullmatch(r"[a-z0-9_\-]+", model_id):
      errors.append(f"{model_id or '<id yok>'}: geçersiz id ([a-z0-9_-])")
      continue
    if model_id in seen:
      errors.append(f"{model_id}: yinelenen id")
      continue
    seen.add(model_id)
    for key in ("title", "label", "emoji", "model", "category"):
      if not str(m.get(key, "")).strip():
        errors.append(f"{model_id}: '{key}' zorunlu")
    if m.get("category") and m["category"] not in CATEGORY_ORDER:
      errors.append(f"{model_id}: geçersiz kategori '{m['category']}'")
    for key in ("model", "fallback"):
      rel = str(m.get(key, "")).strip()
      if not rel:
        continue
      if not is_safe_rel(rel) or not rel.lower().endswith((".gltf", ".glb")):
        errors.append(f"{model_id}: güvensiz {key} yolu '{rel}'")
      elif not (ROOT / rel).is_file():
        errors.append(f"{model_id}: {key} dosyası yok '{rel}'")
    lod = str(m.get("geometryLod", "")).strip()
    if lod and (not is_safe_rel(lod) or not (ROOT / lod).is_file()):
      errors.append(f"{model_id}: geometryLod yok '{lod}'")
    if "textureLod" in m:
      errors.append(f"{model_id}: 'textureLod' kaldırıldı (geometri kademeleri KTX2 dokuları taşır)")
    for lang, values in (m.get("i18n") or {}).items():
      if lang not in LANGS or lang == DEFAULT_LANG:
        errors.append(f"{model_id}: desteklenmeyen çeviri dili '{lang}'")
      elif not isinstance(values, dict):
        errors.append(f"{model_id}: i18n.{lang} bir nesne olmalı")
    if errors:
      continue
    m["_order"] = index
    m["_size_bytes"] = gltf_total_bytes(ROOT / m["model"])
    if m.get("fallback"):
      m["_fallback_size_bytes"] = gltf_total_bytes(ROOT / m["fallback"])
    m["_tiers"] = geometry_tiers(lod)
    m.setdefault("poster", f"assets/posters/{model_id}.svg")
  if errors:
    raise BuildError("\n".join(errors))
  return manifest, models


def localized(m: dict[str, Any], key: str, lang: str) -> Any:
  if lang != DEFAULT_LANG:
    value = (m.get("i18n") or {}).get(lang, {}).get(key)
    if value not in (None, "", []):
      return value
  return m.get(key)


def localized_list(m: dict[str, Any], key: str, field_name: str, lang: str) -> list[dict[str, str]]:
  """Birim/kaynak listelerini sırayı koruyarak çevirir (yalnızca ad/etiket çevrilir)."""
  items = [dict(item) for item in (m.get(key) or []) if isinstance(item, dict) and item.get(field_name)]
  names = (m.get("i18n") or {}).get(lang, {}).get(key) if lang != DEFAULT_LANG else None
  if isinstance(names, list):
    for item, name in zip(items, names):
      if name:
        item[field_name] = str(name)
  return items


# --------------------------------------------------------------------------
# Damgalama: CSS url() ve ES modül grafiği
# --------------------------------------------------------------------------
def stamp_css(ws: Workspace, rel: str) -> None:
  base = Path(rel).parent

  def replace(match: re.Match[str]) -> str:
    resolved = normalize(base, match.group("path"))
    if not ws.exists(resolved):
      raise BuildError(f"{rel}: url() hedefi yok: {match.group('path')}")
    q = match.group("q")
    return f'url({q}{match.group("path")}?v={ws.digest(resolved)}{match.group("frag") or ""}{q})'

  ws.put(rel, CSS_URL_RE.sub(replace, ws.read_text(rel)))


def stamp_module_graph(ws: Workspace, entries: list[str]) -> list[str]:
  """Modülleri yapraktan köke damgalar; ziyaret edilen modülleri döndürür."""
  state: dict[str, str] = {}
  order: list[str] = []

  def visit(rel: str, stack: list[str]) -> None:
    if state.get(rel) == "done":
      return
    if state.get(rel) == "active":
      raise BuildError("modül döngüsü: " + " → ".join([*stack, rel]))
    if not ws.exists(rel):
      raise BuildError(f"modül yok: {rel} (içe aktaran: {stack[-1] if stack else '-'})")
    state[rel] = "active"
    text = ws.read_text(rel)
    base = Path(rel).parent
    for match in JS_IMPORT_RE.finditer(text):
      visit(normalize(base, match.group("spec")), [*stack, rel])

    def replace(match: re.Match[str]) -> str:
      target = normalize(base, match.group("spec"))
      q = match.group("q")
      return f'{match.group("pre")}{q}{match.group("spec")}?v={ws.digest(target)}{q}'

    ws.put(rel, JS_IMPORT_RE.sub(replace, text))
    state[rel] = "done"
    order.append(rel)

  for entry in entries:
    visit(entry, [])
  return order


# --------------------------------------------------------------------------
# Sayfa bağlamı
# --------------------------------------------------------------------------
@dataclass
class PageInfo:
  page: str             # home | map | viewer | landing
  lang: str
  path: str             # dil kökünden göreli çıktı yolu (index.html, kutuphane/index.html)
  depth: int            # dil kökünden derinlik

  @property
  def prefix(self) -> str:
    return "" if self.lang == DEFAULT_LANG else f"{self.lang}/"

  @property
  def out(self) -> str:
    return self.prefix + self.path

  @property
  def root(self) -> str:
    return "../" * (self.depth + (0 if self.lang == DEFAULT_LANG else 1))

  @property
  def lang_root(self) -> str:
    return "../" * self.depth

  @property
  def pretty_path(self) -> str:
    return self.path[: -len("index.html")] if self.path.endswith("index.html") else self.path

  def public_url(self, lang: str | None = None) -> str:
    lang = lang or self.lang
    prefix = "" if lang == DEFAULT_LANG else f"{lang}/"
    return PUBLIC_URL + prefix + self.pretty_path

  def other_lang_href(self, other: str) -> str:
    prefix = "" if other == DEFAULT_LANG else f"{other}/"
    return (self.root + prefix + self.pretty_path) or "./"


class SiteBuilder:
  def __init__(self) -> None:
    self.ws = Workspace()
    self.manifest, self.models = load_models()
    self.by_id = {str(m["id"]): m for m in self.models}
    self.locales = {lang: strip_private(read_json(LOCALES / f"{lang}.json")) for lang in LANGS}
    self._check_locales()
    self.map_meta = self._map_meta()
    self.campus_hotspots = self._campus_hotspots()
    self.env = jinja2.Environment(
      loader=jinja2.FileSystemLoader(str(TEMPLATES)),
      autoescape=jinja2.select_autoescape(["html"]),
      undefined=jinja2.StrictUndefined,
      keep_trailing_newline=True,
    )

  # ---------- girdiler ----------
  def _check_locales(self) -> None:
    def keys(value: Any, prefix: str = "") -> set[str]:
      if isinstance(value, dict):
        out: set[str] = set()
        for k, v in value.items():
          out |= keys(v, f"{prefix}.{k}" if prefix else k)
        return out
      return {prefix}

    reference = keys(self.locales[DEFAULT_LANG])
    for lang in LANGS:
      if lang == DEFAULT_LANG:
        continue
      other = keys(self.locales[lang])
      missing, extra = sorted(reference - other), sorted(other - reference)
      if missing or extra:
        raise BuildError(f"{lang}.json anahtarları tr.json ile uyuşmuyor; eksik: {missing[:8]} fazla: {extra[:8]}")

  def _map_meta(self) -> dict[str, Any]:
    meta_path = ROOT / "assets/map/campus-plan.json"
    meta = read_json(meta_path) if meta_path.is_file() else {}
    size = meta.get("imageSize") or {"width": 1332, "height": 1395}
    return {"width": int(size["width"]), "height": int(size["height"])}

  def _campus_hotspots(self) -> list[dict[str, Any]]:
    """Genel plan modeli üzerindeki bina etiketleri (tools/build_campus_hotspots.mjs)."""
    path = ROOT / "assets/map/campus-hotspots.json"
    if not path.is_file():
      return []
    spots = []
    for spot in read_json(path).get("hotspots") or []:
      target = str(spot.get("model", ""))
      if target in self.by_id and spot.get("position"):
        spots.append({k: spot[k] for k in ("model", "position", "normal", "radius") if spot.get(k) is not None})
    return spots

  # ---------- varlıklar ----------
  def poster_sources(self, m: dict[str, Any], root: str) -> dict[str, str]:
    poster = str(m.get("poster") or "")
    stem = Path(poster).with_suffix("").as_posix()
    out = {"avif": "", "webp": "", "src": ""}
    for variant in ("avif", "webp"):
      candidates = []
      for width in POSTER_DERIVATIVE_WIDTHS:
        derivative = f"{stem}@{width}.{variant}"
        if self.ws.exists(derivative):
          candidates.append(f"{root}{self.ws.stamped(derivative)} {width}w")
      master = f"{stem}.{variant}"
      if self.ws.exists(master):
        candidates.append(f"{root}{self.ws.stamped(master)} 1600w")
      out[variant] = ", ".join(candidates)
    fallback = f"{stem}@800.webp"
    out["src"] = root + self.ws.stamped(fallback if self.ws.exists(fallback) else poster)
    return out

  def og_image(self, model_id: str | None, lang: str) -> str:
    name = f"assets/og/{model_id or 'home'}.{lang}.jpg"
    if self.ws.exists(name):
      return PUBLIC_URL + self.ws.stamped(name)
    if model_id:
      return PUBLIC_URL + str(self.by_id[model_id].get("poster") or "assets/social-card.webp")
    return PUBLIC_URL + "assets/social-card.webp"

  # ---------- katalog ----------
  def catalog_entry(self, m: dict[str, Any]) -> dict[str, Any]:
    entry: dict[str, Any] = {"id": str(m["id"])}
    for key in ("title", "label", "emoji", "model", "fallback", "geometryLod", "ios", "orbit", "type",
                "description", "officialName", "campusZone", "category"):
      if m.get(key):
        entry[key] = str(m[key])
    if m.get("poster"):
      entry["poster"] = self.ws.stamped(str(m["poster"]))
    if m.get("exposure") is not None:
      entry["exposure"] = str(m["exposure"])
    entry["sizeBytes"] = int(m.get("_size_bytes") or 0)
    if m.get("_fallback_size_bytes"):
      entry["fallbackSizeBytes"] = int(m["_fallback_size_bytes"])
    if m.get("_tiers"):
      entry["tiers"] = m["_tiers"]
    for key in ("geo", "facts", "units", "accessibility", "scan", "render", "hotspots", "map", "sources", "keywords"):
      if m.get(key):
        entry[key] = m[key]
    translations = {lang: {k: v for k, v in values.items() if v not in (None, "", [])}
                    for lang, values in (m.get("i18n") or {}).items()}
    if translations:
      entry["i18n"] = translations
    if str(m["id"]) == CAMPUS_ID and self.campus_hotspots:
      entry["campusHotspots"] = self.campus_hotspots
    return entry

  def build_catalog(self) -> None:
    prefixes = sorted({str(m["model"]).split("/", 1)[0].lower() + "/" for m in self.models})
    map_assets = {}
    for variant in ("avif", "webp"):
      rel = f"assets/map/campus-plan.{variant}"
      map_assets[variant] = self.ws.stamped(rel) if self.ws.exists(rel) else ""
    payload = {
      "manifestVersion": hashlib.sha256(MANIFEST_PATH.read_bytes()).hexdigest()[:10],
      "allowedModelPrefixes": prefixes,
      "map": {**self.map_meta, **map_assets},
      "models": [self.catalog_entry(m) for m in self.models],
    }
    body = json.dumps(payload, ensure_ascii=False, indent=2)
    self.ws.put("assets/js/catalog.js",
                "/* tools/build_site.py tarafından üretilir — elle düzenlemeyin. */\n"
                f"export const CATALOG = {body};\n")

  def build_svg_posters(self) -> None:
    for m in self.models:
      poster = str(m.get("poster") or "")
      if not poster.lower().endswith(".svg") or not poster.startswith("assets/posters/"):
        continue
      title = escape(str(m["title"]))
      emoji = escape(str(m.get("emoji", "🏢")))
      self.ws.put(poster, f"""<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000" role="img" aria-label="{title}">
  <rect width="1600" height="1000" fill="#efede7"/>
  <text x="800" y="470" text-anchor="middle" font-size="150" font-family="system-ui, sans-serif">{emoji}</text>
  <text x="800" y="610" text-anchor="middle" font-size="64" font-weight="700" fill="#1c1a17" font-family="system-ui, sans-serif">{title}</text>
</svg>
""")

  # ---------- manifest / sitemap ----------
  def build_web_manifests(self) -> None:
    for lang in LANGS:
      t = Strings(self.locales[lang])
      prefix = "" if lang == DEFAULT_LANG else f"{lang}/"
      up = "../" if prefix else ""
      manifest = {
        "id": f"/{prefix}",
        "name": t.common.siteName,
        "short_name": t.common.shortName,
        "description": t.home.description,
        "lang": lang,
        "dir": "ltr",
        "start_url": "./",
        "scope": "./",
        "display": "standalone",
        "orientation": "any",
        "background_color": "#f6f5f1",
        "theme_color": "#b3441f",
        "categories": ["education", "navigation", "travel"],
        "icons": [
          {"src": f"{up}assets/icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
          {"src": f"{up}assets/icons/icon-512.png", "sizes": "512x512", "type": "image/png"},
          {"src": f"{up}assets/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
          {"src": f"{up}assets/favicon.svg", "sizes": "any", "type": "image/svg+xml"},
        ],
        "shortcuts": [
          {"name": t.common.footerCampus3d, "url": f"viewer.html?id={CAMPUS_ID}"},
          {"name": t.common.navMap, "url": "map.html"},
        ],
      }
      self.ws.put(f"{prefix}manifest.webmanifest", json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")

  def build_sitemap(self, pages: list[PageInfo]) -> None:
    stamp = dt.datetime.fromtimestamp(MANIFEST_PATH.stat().st_mtime, dt.timezone.utc).strftime("%Y-%m-%d")
    entries = []
    for info in pages:
      if info.lang != DEFAULT_LANG or info.page == "viewer":
        continue
      alternates = "".join(
        f'\n    <xhtml:link rel="alternate" hreflang="{lang}" href="{escape(info.public_url(lang))}"/>' for lang in LANGS
      )
      for lang in LANGS:
        entries.append(
          f"  <url>\n    <loc>{escape(info.public_url(lang))}</loc>\n    <lastmod>{stamp}</lastmod>{alternates}\n  </url>"
        )
    self.ws.put("sitemap.xml",
                '<?xml version="1.0" encoding="UTF-8"?>\n'
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
                + "\n".join(entries) + "\n</urlset>\n")

  # ---------- sayfalar ----------
  def page_strings(self, lang: str, page: str) -> dict[str, Any]:
    """Sayfanın JS'inin ihtiyaç duyduğu metinler (HTML'e JSON olarak gömülür)."""
    wanted = {"meta", "common", "categories", "tiers", "format", page}
    return {key: value for key, value in self.locales[lang].items() if key in wanted}

  def base_context(self, info: PageInfo) -> dict[str, Any]:
    t = Strings(self.locales[info.lang])
    ws = self.ws

    def asset(rel: str) -> str:
      return info.root + ws.stamped(rel)

    def href(path: str) -> str:
      return info.lang_root + path

    other = next(lang for lang in LANGS if lang != info.lang)
    alternates = [{"hreflang": lang, "href": info.public_url(lang)} for lang in LANGS]
    alternates.append({"hreflang": "x-default", "href": info.public_url(DEFAULT_LANG)})
    return {
      "t": t,
      "lang": info.lang,
      "page": info.page,
      "theme_lock": "",
      "asset": asset,
      "href": href,
      "root": info.root,
      "other_lang_href": info.other_lang_href(other),
      "alternates": alternates,
      "canonical": info.public_url(),
      "manifest_path": f"{info.prefix}manifest.webmanifest",
      "og_image": self.og_image(None, info.lang),
      "og_image_alt": t.home.ogImageAlt,
      "og_title": "",
      "csp": Markup(HTML_CSP),
      "i18n_json": json_script(self.page_strings(info.lang, info.page)),
    }

  def model_view(self, m: dict[str, Any], info: PageInfo, t: Strings) -> dict[str, Any]:
    lang = info.lang
    model_id = str(m["id"])
    category = str(m.get("category", ""))
    label = str(localized(m, "label", lang))
    units = localized_list(m, "units", "name", lang)
    search = " ".join(str(x) for x in [
      m.get("title"), m.get("label"), localized(m, "title", lang), label, m.get("type"), localized(m, "type", lang),
      localized(m, "description", lang), t.categories[category] if category in t.categories else "",
      m.get("officialName"), localized(m, "officialName", lang), localized(m, "campusZone", lang),
      model_id.replace("_", " "), *[u["name"] for u in units], *[u.get("name", "") for u in m.get("units") or []],
      *(localized(m, "keywords", lang) or []), *(m.get("keywords") or []),
    ] if x)
    poster_rel = f"assets/posters/{model_id}.turntable.webm"
    return {
      "id": model_id,
      "order": int(m.get("_order", 0)),
      "category": category,
      "category_label": t.categories[category] if category in t.categories else "",
      "title": str(localized(m, "title", lang)),
      "label": label,
      "official": str(localized(m, "officialName", lang) or localized(m, "title", lang)),
      "type": str(localized(m, "type", lang) or ""),
      "description": str(localized(m, "description", lang) or ""),
      "zone": str(localized(m, "campusZone", lang) or ""),
      "size_bytes": int(m.get("_size_bytes") or 0),
      "size_label": format_mb(int(m.get("_size_bytes") or 0), lang),
      "search": search,
      "poster": self.poster_sources(m, info.root),
      "turntable": info.root + self.ws.stamped(poster_rel) if self.ws.exists(poster_rel) else "",
      "viewer_href": f"{info.lang_root}viewer.html?{urlencode({'id': model_id})}",
      "landing_href": f"{info.lang_root}{model_id}/",
      "map_href": f"{info.lang_root}map.html?{urlencode({'focus': model_id})}" if m.get("map") else "",
      "map": m.get("map"),
      "geo": m.get("geo"),
      "units": units,
      "sources": [s for s in localized_list(m, "sources", "label", lang)
                  if str(s.get("url", "")).startswith(("http://", "https://"))],
      "tiers": [
        {"id": tier["id"], "label": t.tiers[tier["id"]] if tier["id"] in t.tiers else tier["id"],
         "size": format_mb(tier["bytes"], lang), "triangles": format_triangles(tier["triangles"], lang, t)}
        for tier in m.get("_tiers") or []
      ],
      "eager": False,
    }

  def render(self, template: str, info: PageInfo, **context: Any) -> None:
    base = self.base_context(info)
    base.update(context)
    try:
      html = self.env.get_template(template).render(**base)
    except jinja2.TemplateError as error:
      raise BuildError(f"{template} ({info.lang}): {error}") from error
    html = re.sub(r"[ \t]+\n", "\n", html)
    html = re.sub(r"\n{3,}", "\n\n", html)
    self.ws.put(info.out, html)

  def pins(self, views: list[dict[str, Any]]) -> list[dict[str, Any]]:
    width, height = self.map_meta["width"], self.map_meta["height"]
    return [{
      "id": view["id"], "label": view["label"], "href": view["map_href"], "viewer_href": view["viewer_href"],
      "x": round(float(view["map"]["x"]) * width, 1), "y": round(float(view["map"]["y"]) * height, 1),
      "nx": float(view["map"]["x"]), "ny": float(view["map"]["y"]),
    } for view in views if view.get("map")]

  def map_image(self, info: PageInfo, *, teaser: bool = False) -> dict[str, Any]:
    """Kampüs planı görseli; ana sayfa önizlemesi 900 px türevi kullanır."""
    out = {"width": self.map_meta["width"], "height": self.map_meta["height"], "avif": "", "src": ""}
    suffix = "@900" if teaser else ""
    for key, ext in (("avif", "avif"), ("src", "webp")):
      name = f"assets/map/campus-plan{suffix}.{ext}"
      if not self.ws.exists(name):
        name = f"assets/map/campus-plan.{ext}"
      if self.ws.exists(name):
        out[key] = info.root + self.ws.stamped(name)
    return out

  def map_crop(self, model_id: str, info: PageInfo) -> dict[str, Any]:
    """Tanıtım sayfasındaki konum kesiti (tools/build_map_crops.py)."""
    index_path = ROOT / "assets/map/crops/crops.json"
    index = read_json(index_path) if index_path.is_file() else {}
    crop = index.get(model_id)
    if not crop:
      return {}
    out: dict[str, Any] = dict(crop)
    for variant in ("avif", "webp"):
      rel = f"assets/map/crops/{model_id}.{variant}"
      if self.ws.exists(rel):
        out[variant] = info.root + self.ws.stamped(rel)
    return out if out.get("webp") else {}

  def build_pages(self) -> list[PageInfo]:
    pages: list[PageInfo] = []
    for lang in LANGS:
      t = Strings(self.locales[lang])

      home = PageInfo("home", lang, "index.html", 0)
      views = [self.model_view(m, home, t) for m in self.models]
      buildings = [v for v in views if v["category"] != "plan"]
      ordered = buildings + [v for v in views if v["category"] == "plan"]
      for index, view in enumerate(ordered):
        view["order"] = index
        view["eager"] = index < 3
      campus = next((v for v in views if v["id"] == CAMPUS_ID), views[0])
      triangles = sum(max((tier["triangles"] for tier in m.get("_tiers") or []), default=0) for m in self.models)
      categories = [{"id": c, "label": t.categories[c], "count": sum(1 for v in views if v["category"] == c)}
                    for c in CATEGORY_ORDER if any(v["category"] == c for v in views)]
      self.render("home.html", home,
                  title=t.home.title, description=t.home.description,
                  models=ordered, campus=campus, categories=categories,
                  stats={"buildings": len(buildings),
                         "triangles": fill(t.format.millionShort, n=format_number(triangles / 1e6, lang))},
                  pins=self.pins(buildings), map_image=self.map_image(home, teaser=True), poster_sizes=POSTER_SIZES)
      pages.append(home)

      map_page = PageInfo("map", lang, "map.html", 0)
      map_views = [self.model_view(m, map_page, t) for m in self.models]
      placed = [v for v in map_views if v.get("map")]
      self.render("map.html", map_page,
                  title=f"{t.map.title} • {t.common.siteName}", description=t.map.description,
                  map_image=self.map_image(map_page), places=placed, pins=self.pins(placed),
                  outside=[v for v in map_views if not v.get("map") and v["category"] != "plan"])
      pages.append(map_page)

      viewer = PageInfo("viewer", lang, "viewer.html", 0)
      self.render("viewer.html", viewer,
                  title=f"{t.viewer.title} • {t.common.siteName}", description=t.viewer.description,
                  csp=Markup(VIEWER_CSP), canonical="", alternates=[])
      pages.append(viewer)

      for m in self.models:
        model_id = str(m["id"])
        if not (ROOT / model_id).is_dir():
          continue
        info = PageInfo("landing", lang, f"{model_id}/index.html", 1)
        view = self.model_view(m, info, t)
        others = [self.model_view(o, info, t) for o in self.models if o is not m]
        related = sorted(others, key=lambda o: (o["category"] != view["category"], o["category"] == "plan", o["order"]))[:3]
        self.render("landing.html", info,
                    title=f"{view['official']} • {t.common.siteName}",
                    description=view["description"] or fill(t.landing.fallbackDescription, name=view["official"]),
                    og_title=f"{view['official']} — {t.common.siteName}",
                    og_image=self.og_image(model_id, lang),
                    og_image_alt=fill(t.landing.posterAlt, name=view["official"]),
                    model=view, related=related, crop=self.map_crop(model_id, info),
                    json_ld=self.json_ld(m, info, t, view))
        pages.append(info)
    return pages

  def json_ld(self, m: dict[str, Any], info: PageInfo, t: Strings, view: dict[str, Any]) -> Markup:
    page_url = info.public_url()
    place: dict[str, Any] = {
      "@type": "Place",
      "name": view["official"],
      "url": page_url,
      "image": self.og_image(view["id"], info.lang),
      "containedInPlace": {"@type": "CollegeOrUniversity", "name": t.common.university, "url": "https://www.osmaniye.edu.tr/"},
    }
    if view["description"]:
      place["description"] = view["description"]
    if view["label"] != view["official"]:
      place["alternateName"] = view["label"]
    geo = m.get("geo") or {}
    if geo.get("lat") is not None and geo.get("lng") is not None:
      place["geo"] = {"@type": "GeoCoordinates", "latitude": geo["lat"], "longitude": geo["lng"]}
    if view["units"]:
      place["containsPlace"] = [{"@type": "Place", "name": unit["name"]} for unit in view["units"]]
    place["subjectOf"] = {
      "@type": "3DModel",
      "name": fill(t.landing.modelName, name=view["official"]),
      "encodingFormat": "model/gltf-binary",
      "contentUrl": PUBLIC_URL + str(m["model"]),
      "inLanguage": info.lang,
    }
    graph = {
      "@context": "https://schema.org",
      "@graph": [
        place,
        {"@type": "BreadcrumbList", "itemListElement": [
          {"@type": "ListItem", "position": 1, "name": t.common.siteName, "item": PUBLIC_URL + info.prefix},
          {"@type": "ListItem", "position": 2, "name": view["official"], "item": page_url},
        ]},
      ],
    }
    return json_script(graph)

  # ---------- service worker ----------
  def build_service_worker(self, pages: list[PageInfo], modules: list[str]) -> None:
    urls: set[str] = set()
    digest = hashlib.sha256()
    for info in pages:
      if info.page == "landing":
        continue
      html = self.ws.read_text(info.out)
      digest.update(html.encode())
      urls.add((info.prefix + ("" if info.path == "index.html" else info.path)) or "./")
      for match in re.finditer(r'(?:src|href)="([^"]+)"', html):
        value = match.group(1)
        if value.startswith(("http:", "https:", "data:", "#", "mailto:", "?")):
          continue
        path, _, query = value.split("#")[0].partition("?")
        try:
          clean = normalize(Path(info.out).parent, path)
        except BuildError:
          continue
        if not clean.startswith("assets/"):
          continue
        # Posterler, 3B motoru ve paylaşım görselleri kabuğa girmez: kart
        # posterleri gezildikçe, motor ilk görüntüleyici açılışında önbelleğe alınır.
        if any(part in clean for part in ("/posters/", "/vendor/", "/og/")) or clean.endswith(".webm"):
          continue
        urls.add(clean + (f"?{query}" if query else ""))
    for rel in modules:
      urls.add(self.ws.stamped(rel))
    for lang in LANGS:
      manifest = ("" if lang == DEFAULT_LANG else f"{lang}/") + "manifest.webmanifest"
      urls.add(self.ws.stamped(manifest))
    # Kart posterlerinin en küçük AVIF türevi kabuğa girer: çevrimdışı galeride
    # posterler görünsün (service worker diğer boyut isteklerini buna düşürür).
    for m in self.models:
      small = f"assets/posters/{m['id']}@{POSTER_DERIVATIVE_WIDTHS[0]}.avif"
      if self.ws.exists(small):
        urls.add(self.ws.stamped(small))
    for rel in ("assets/map/campus-plan.avif", "assets/map/campus-plan.webp", "assets/map/campus-plan@900.avif", "assets/icons.svg",
                "assets/fonts/inter-latin-wght-normal.woff2", "assets/fonts/inter-tr-wght-normal.woff2"):
      if self.ws.exists(rel):
        urls.add(self.ws.stamped(rel))
    for url in sorted(urls):
      digest.update(url.encode())
    block = ("// BEGIN GENERATED SHELL — tools/build_site.py\n"
             f"const VERSION = '{digest.hexdigest()[:12]}';\n"
             f"const SHELL_URLS = {json.dumps(sorted(urls), ensure_ascii=False, indent=2)};\n"
             "// END GENERATED SHELL")
    original = self.ws.read_text("geometry-lod-sw.js")
    updated, count = re.subn(r"// BEGIN GENERATED SHELL.*?// END GENERATED SHELL", lambda _: block, original, flags=re.S)
    if count != 1:
      raise BuildError("geometry-lod-sw.js içinde üretilen kabuk bloğu bulunamadı")
    self.ws.put("geometry-lod-sw.js", updated)

  # ---------- tümü ----------
  def run(self) -> Workspace:
    self.build_svg_posters()
    for css in sorted(p.relative_to(ROOT).as_posix() for p in (ROOT / "assets/css").glob("*.css")):
      stamp_css(self.ws, css)
    self.build_catalog()
    entries = sorted(p.relative_to(ROOT).as_posix() for p in (ROOT / "assets/js").rglob("*.js"))
    modules = stamp_module_graph(self.ws, entries)
    self.build_web_manifests()
    pages = self.build_pages()
    self.build_sitemap(pages)
    self.build_service_worker(pages, modules)
    return self.ws


def main() -> int:
  parser = argparse.ArgumentParser(description="models.json + şablonlardan statik siteyi üretir")
  parser.add_argument("--check", action="store_true", help="yalnızca doğrula; bayat dosya varsa 3 ile çık")
  parser.add_argument("--quiet", action="store_true")
  args = parser.parse_args()
  try:
    ws = SiteBuilder().run()
  except BuildError as error:
    for line in str(error).splitlines():
      print(f"HATA: {line}", file=sys.stderr)
    return 2
  if args.check:
    stale = ws.changed()
    for rel in stale:
      print(f"BAYAT: {rel} (python3 tools/build_site.py ile yeniden üretin)")
    if not stale and not args.quiet:
      print("OK: üretilen dosyalar ve varlık damgaları güncel")
    return 3 if stale else 0
  written = ws.commit()
  if not args.quiet:
    print(f"{len(written)} dosya güncellendi" + (":" if written else "."))
    for rel in written:
      print(f"  · {rel}")
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
