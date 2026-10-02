#!/usr/bin/env python3
"""build_site.py birim testleri (stdlib unittest).

Sayfa üretiminin en kırılgan iki sözleşmesini sınar:
  - ES modül damgaları: içe aktarılan modül değişince içe aktaranın adresi
    de değişmeli; döngü ve kök dışı yol hata vermeli.
  - CSS url() damgaları, Git LFS işaretçisinden boyut okuma, çeviri anahtarı
    erişiminde dict metotlarıyla ad çakışması olmaması.

Kullanım: python3 tools/test_build.py
"""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_site as bs  # noqa: E402


class Sandbox:
  """build_site.ROOT'u geçici bir dizine yönlendirir."""

  def __init__(self) -> None:
    self.dir = tempfile.TemporaryDirectory()
    self.root = Path(self.dir.name)
    self.saved = bs.ROOT

  def __enter__(self) -> "Sandbox":
    bs.ROOT = self.root
    return self

  def __exit__(self, *exc: object) -> None:
    bs.ROOT = self.saved
    self.dir.cleanup()

  def write(self, rel: str, text: str | bytes) -> None:
    path = self.root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(text.encode() if isinstance(text, str) else text)


class ModuleStamping(unittest.TestCase):
  def test_dependency_change_propagates_to_importer(self) -> None:
    with Sandbox() as box:
      box.write("assets/js/a.js", "import { b } from './lib/b.js';\nexport const a = b;\n")
      box.write("assets/js/lib/b.js", "export const b = 1;\n")
      ws = bs.Workspace()
      bs.stamp_module_graph(ws, ["assets/js/a.js"])
      first = ws.read_text("assets/js/a.js")
      self.assertRegex(first, r"\./lib/b\.js\?v=[0-9a-f]{10}'")

      box.write("assets/js/lib/b.js", "export const b = 2;\n")
      ws2 = bs.Workspace()
      bs.stamp_module_graph(ws2, ["assets/js/a.js"])
      self.assertNotEqual(first, ws2.read_text("assets/js/a.js"))
      self.assertNotEqual(ws.digest("assets/js/a.js"), ws2.digest("assets/js/a.js"))

  def test_existing_stamp_is_replaced_not_duplicated(self) -> None:
    with Sandbox() as box:
      box.write("assets/js/a.js", "import './b.js?v=0000000000';\nconst m = import(\"./b.js\");\n")
      box.write("assets/js/b.js", "export {};\n")
      ws = bs.Workspace()
      bs.stamp_module_graph(ws, ["assets/js/a.js"])
      text = ws.read_text("assets/js/a.js")
      self.assertEqual(text.count("?v="), 2)
      self.assertNotIn("0000000000", text)

  def test_cycle_is_rejected(self) -> None:
    with Sandbox() as box:
      box.write("assets/js/a.js", "import './b.js';\n")
      box.write("assets/js/b.js", "import './a.js';\n")
      with self.assertRaises(bs.BuildError):
        bs.stamp_module_graph(bs.Workspace(), ["assets/js/a.js"])

  def test_missing_module_is_rejected(self) -> None:
    with Sandbox() as box:
      box.write("assets/js/a.js", "import './yok.js';\n")
      with self.assertRaises(bs.BuildError):
        bs.stamp_module_graph(bs.Workspace(), ["assets/js/a.js"])

  def test_path_escaping_root_is_rejected(self) -> None:
    with self.assertRaises(bs.BuildError):
      bs.normalize("assets", "../../x.js")


class CssStamping(unittest.TestCase):
  def test_relative_url_is_stamped_and_fragment_kept(self) -> None:
    with Sandbox() as box:
      box.write("assets/fonts/f.woff2", b"font")
      box.write("assets/icons.svg", "<svg/>")
      box.write("assets/css/a.css", 'a{src:url("../fonts/f.woff2?v=old")} b{background:url(../icons.svg#x)} c{background:url(data:image/png;base64,AA)}')
      ws = bs.Workspace()
      bs.stamp_css(ws, "assets/css/a.css")
      text = ws.read_text("assets/css/a.css")
      self.assertIn(f'url("../fonts/f.woff2?v={ws.digest("assets/fonts/f.woff2")}")', text)
      self.assertIn(f'url(../icons.svg?v={ws.digest("assets/icons.svg")}#x)', text)
      self.assertIn("url(data:image/png;base64,AA)", text)

  def test_missing_target_is_rejected(self) -> None:
    with Sandbox() as box:
      box.write("assets/css/a.css", 'a{src:url("../fonts/yok.woff2")}')
      with self.assertRaises(bs.BuildError):
        bs.stamp_css(bs.Workspace(), "assets/css/a.css")


class Helpers(unittest.TestCase):
  def test_lfs_pointer_size(self) -> None:
    with Sandbox() as box:
      box.write("m.glb", "version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 1234567\n")
      box.write("real.bin", b"x" * 300)
      self.assertEqual(bs.file_size(box.root / "m.glb"), 1234567)
      self.assertEqual(bs.file_size(box.root / "real.bin"), 300)

  def test_strings_do_not_collide_with_dict_methods(self) -> None:
    t = bs.Strings({"common": {"copy": "Kopyala", "items": "Öğeler", "keys": "Anahtarlar"}})
    self.assertEqual(t.common.copy, "Kopyala")
    self.assertEqual(t.common.items, "Öğeler")
    self.assertEqual(t["common"]["keys"], "Anahtarlar")
    with self.assertRaises(bs.BuildError):
      _ = t.common.yok

  def test_page_paths(self) -> None:
    landing_en = bs.PageInfo("landing", "en", "kutuphane/index.html", 1)
    self.assertEqual(landing_en.root, "../../")
    self.assertEqual(landing_en.lang_root, "../")
    self.assertEqual(landing_en.public_url(), "https://vr.perinet.org/en/kutuphane/")
    self.assertEqual(landing_en.other_lang_href("tr"), "../../kutuphane/")
    home_tr = bs.PageInfo("home", "tr", "index.html", 0)
    self.assertEqual(home_tr.other_lang_href("en"), "en/")
    self.assertEqual(bs.PageInfo("404", "tr", "404.html", 0, absolute=True).root, "/")

  def test_number_formats(self) -> None:
    self.assertEqual(bs.format_mb(1572864, "tr"), "1,5 MB")
    self.assertEqual(bs.format_mb(1572864, "en"), "1.5 MB")

  def test_json_script_escapes_closing_tag(self) -> None:
    self.assertNotIn("</script", str(bs.json_script({"x": "</script><b>"})))


class QuickLook(unittest.TestCase):
  def test_usdz_matches_current_source_tier(self) -> None:
    # Kademe GLB'si yeniden üretilip USDZ unutulursa iPhone AR eski modeli açar.
    # Özetler LFS işaretçisinden de okunur (CI modelleri indirmez).
    manifest = bs.read_json(bs.MANIFEST_PATH)
    checked = 0
    for m in manifest["models"]:
      ios = m.get("ios")
      if not ios:
        continue
      side = bs.read_json(bs.ROOT / f"{ios}.json")
      self.assertEqual(bs.content_digest(bs.ROOT / side["source"]), side["sourceSha256"],
                       f"{m['id']}: USDZ bayat — node tools/build_usdz.mjs --models={m['id']}")
      self.assertEqual(bs.content_digest(bs.ROOT / ios), side["sha256"], f"{m['id']}: USDZ ile kaynak bilgisi uyuşmuyor")
      checked += 1
    self.assertGreater(checked, 0, "hiçbir modelde iPhone AR (ios) dosyası yok")


class GeometryTiers(unittest.TestCase):
  def test_tier_digests_match_files(self) -> None:
    # Görüntüleyici kademe adresini künyedeki sha256 ile damgalar (?v=). Künye
    # bayatsa yeni dosya eski adresle önbellekten eski hâliyle döner.
    manifest = bs.read_json(bs.MANIFEST_PATH)
    checked = 0
    for m in manifest["models"]:
      lod = m.get("geometryLod")
      if not lod:
        continue
      side = bs.read_json(bs.ROOT / lod)
      for tier in side["tiers"]:
        path = (bs.ROOT / lod).parent / tier["src"]
        self.assertEqual(bs.content_digest(path), tier.get("sha256"),
                         f"{m['id']}/{tier['id']}: künye bayat — python3 tools/build_geometry_lods.py --ids {m['id']}")
        checked += 1
      # Katalogdaki ilk model hafif kademedir: aynı damga, aynı adres.
      low = next(tier for tier in side["tiers"] if tier["id"] == "low")
      self.assertEqual((bs.ROOT / lod).parent / low["src"], bs.ROOT / m["model"], f"{m['id']}: model hafif kademe değil")
    self.assertGreater(checked, 0, "hiçbir modelde geometri kademesi yok")


class RealSite(unittest.TestCase):
  def test_locales_have_identical_keys_and_build_is_fresh(self) -> None:
    # SiteBuilder anahtar kümelerini denetler; run() bütün sayfaları bellekte üretir.
    ws = bs.SiteBuilder().run()
    self.assertEqual(ws.changed(), [], "üretilen dosyalar bayat: python3 tools/build_site.py")


if __name__ == "__main__":
  unittest.main(verbosity=1)
