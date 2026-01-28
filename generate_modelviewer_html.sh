#!/usr/bin/env bash
set -euo pipefail

# Geriye dönük uyumluluk için korunuyor.
# Bu proje artık her model klasöründe ayrı bir model-viewer sayfası üretmek yerine,
# tek kaynak olan `/viewer.html`'a yönlendirme sayfaları üretir.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Generating redirect pages (single viewer source)…"
"$SCRIPT_DIR/update_model_pages.sh"
