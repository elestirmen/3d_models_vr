#!/usr/bin/env bash
set -euo pipefail

# Deprecated wrapper kept for backwards compatibility.
# Source of truth is now `models.json` + `tools/build_site.py`.
#
# NOTE: This script previously overwrote `/var/www/html/index.html`.
# To avoid accidental writes outside the repo, it now builds the site in-place.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "Generating index/redirects from models.json…"
python3 "$SCRIPT_DIR/tools/build_site.py"
