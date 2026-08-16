#!/usr/bin/env bash
# Thin wrapper — real logic lives in build-bundle.mjs (Windows/macOS/Linux).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec node "$ROOT/scripts/build-bundle.mjs"
