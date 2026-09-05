# OKÜ Dijital Yerleşke — üretim ve doğrulama görevleri
#
# Çalışma ağacı doğrudan yayın kökü olduğu için "deploy" adımı yoktur:
# `make build` çıktısı anında canlıdır. Bu yüzden `make check` yayından
# ÖNCE çalıştırılmalıdır.

SHELL := /bin/bash
NODE  ?= node
PY    ?= python3

JS_FILES := assets/index.js assets/viewer.js assets/ar-viewer.js assets/map.js \
            assets/analytics.js assets/landing.js assets/model-viewer-config.js \
            geometry-lod-sw.js

.PHONY: help build check lint doctor smoke posters turntables map env locate reload sizes

help:
	@echo "Görevler:"
	@echo "  make build       index/tanıtım sayfaları, katalog ve varlık damgaları"
	@echo "  make check       doctor + damga tazeliği + JS sözdizimi + duman testi"
	@echo "  make smoke       yalnızca tarayıcı duman testi"
	@echo "  make posters     posterleri yeniden render et (yavaş)"
	@echo "  make turntables  hover turntable döngüleri (yavaş)"
	@echo "  make map         kampüs planı taban görseli (yavaş)"
	@echo "  make locate      binaların plan üzerindeki konumunu ölç"
	@echo "  make env         stüdyo HDR ortam haritası"
	@echo "  make sizes       model boyut raporu"
	@echo "  make reload      nginx yapılandırmasını sına ve yeniden yükle"

build:
	$(PY) tools/build_site.py

doctor:
	$(PY) tools/doctor.py

lint:
	@for file in $(JS_FILES); do $(NODE) --check $$file || exit 1; done
	@$(PY) -c "import ast,pathlib,sys; [ast.parse(pathlib.Path(f).read_text(encoding='utf-8')) for f in pathlib.Path('tools').glob('*.py')]; print('python sözdizimi OK')"
	@echo "js sözdizimi OK"

# Damga tazeliği: build_site.py --check bayat damgada 3 ile çıkar.
check: doctor lint
	$(PY) tools/build_site.py --check
	$(NODE) tools/smoke.mjs

smoke:
	$(NODE) tools/smoke.mjs

posters:
	$(NODE) tools/build_posters.mjs
	$(PY) tools/build_site.py

turntables:
	$(NODE) tools/build_turntables.mjs
	$(PY) tools/build_site.py

map:
	$(NODE) tools/build_map.mjs
	$(PY) tools/build_site.py

locate:
	$(PY) tools/locate_models.py

env:
	$(PY) tools/build_environment.py

sizes:
	$(PY) tools/report_sizes.py

# nginx yapılandırması container'a tek dosya olarak bağlıdır: dosyayı YERİNDE
# güncelleyin, yeniden oluşturmayın (inode değişirse container görmez).
reload:
	docker exec personal-web nginx -t
	docker exec personal-web nginx -s reload
