#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Backwards compatible wrapper: prefers manifest-driven optimization.
python3 "$ROOT_DIR/tools/optimize_models.py" "$@"
