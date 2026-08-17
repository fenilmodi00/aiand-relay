#!/usr/bin/env bash
# Builds the aiandrelay site for Build.io / Heroku-style dynos.
# Uses Nitro's heroku preset so the app listens on $PORT at runtime.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v bun >/dev/null 2>&1; then
  npm install -g bun
  export PATH="$(npm prefix -g)/bin:$PATH"
fi

export NITRO_PRESET=heroku
pnpm build:site:preview
