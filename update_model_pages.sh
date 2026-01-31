#!/usr/bin/env bash
set -euo pipefail

# Deprecated wrapper kept for backwards compatibility.
# Source of truth is now `models.json` + `tools/build_site.py`.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

python3 "$ROOT_DIR/tools/build_site.py" --no-index
