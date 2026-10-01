# OKÜ Dijital Yerleşke — üretim ve doğrulama görevleri
#
# Yayın kökü bu dizindir (nginx doğrudan buradan sunar): `make build` çıktısı
# kaydedildiği an canlıdır. Bu yüzden `make check` yayından ÖNCE çalıştırılır.
# Geliştirme için ayrı bir çalışma kopyası (git worktree) önerilir; bkz. README.

SHELL := /bin/bash
NODE  ?= node
PY    ?= python3

JS_FILES = $(shell find assets/js -name '*.js' | sort) geometry-lod-sw.js $(wildcard tools/*.mjs tools/lib/*.mjs)

.PHONY: help build check lint doctor smoke a11y qr posters turntables map crops hotspots env sizes reload serve

help:
	@echo "Görevler:"
	@echo "  make build       sayfalar (TR + EN), katalog, manifestler ve varlık damgaları"
	@echo "  make check       doctor + damga/üretim tazeliği + sözdizimi + QR + duman testi"
	@echo "  make smoke       yalnızca tarayıcı duman testi (erişilebilirlik dahil)"
	@echo "  make serve       yerel önizleme sunucusu (boş port, POST /e = 204)"
	@echo "  make posters     posterleri yeniden render et (yavaş)"
	@echo "  make turntables  hover turntable döngüleri (yavaş)"
	@echo "  make map         kampüs planı taban görseli (yavaş)"
	@echo "  make hotspots    yerleşke modelindeki bina etiketlerini ölç"
	@echo "  make crops       tanıtım sayfaları için harita kesitleri"
	@echo "  make env         stüdyo HDR ortam haritası"
	@echo "  make sizes       model boyut raporu"
	@echo "  make reload      nginx yapılandırmasını sına ve yeniden yükle"

build:
	$(PY) tools/build_site.py

doctor:
	$(PY) tools/doctor.py

lint:
	@for file in $(JS_FILES); do $(NODE) --check $$file || exit 1; done
	@$(PY) -c "import ast,pathlib; [ast.parse(p.read_text(encoding='utf-8')) for p in pathlib.Path('tools').glob('*.py')]; print('python sözdizimi OK')"
	@$(PY) -c "import json,pathlib; [json.loads(p.read_text(encoding='utf-8')) for p in [*pathlib.Path('src/locales').glob('*.json'), pathlib.Path('models.json')]]; print('json OK')"
	@echo "js sözdizimi OK ($(words $(JS_FILES)) dosya)"

qr:
	$(NODE) tools/qr-check.mjs

# Üretim tazeliği: build_site.py --check bayat dosyada 3 ile çıkar.
check: doctor lint qr
	$(PY) tools/build_site.py --check
	$(NODE) tools/smoke.mjs

smoke:
	$(NODE) tools/smoke.mjs

serve:
	$(NODE) tools/serve.mjs

posters:
	$(NODE) tools/build_posters.mjs
	$(PY) tools/build_site.py

turntables:
	$(NODE) tools/build_turntables.mjs
	$(PY) tools/build_site.py

map:
	$(NODE) tools/build_map.mjs
	$(PY) tools/build_site.py

hotspots:
	$(NODE) tools/build_campus_hotspots.mjs
	$(PY) tools/build_site.py

crops:
	$(PY) tools/build_map_crops.py
	$(PY) tools/build_site.py

env:
	$(PY) tools/build_environment.py

sizes:
	$(PY) tools/report_sizes.py

# nginx yapılandırması container'a tek dosya olarak bağlıdır: dosyayı YERİNDE
# güncelleyin, yeniden oluşturmayın (inode değişirse container görmez).
reload:
	docker exec personal-web nginx -t
	docker exec personal-web nginx -s reload
