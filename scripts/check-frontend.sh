#!/usr/bin/env bash
# vue-tsc + vite build in a disposable container. vue-tsc needs a bigger heap than default.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
docker run --rm -m 3g -e NODE_OPTIONS=--max-old-space-size=2600 -v "$ROOT":/app -w /app/frontend \
  "${NODE_IMAGE:-bloomly-audit-node}" sh -c '
    [ -d node_modules ] || npm ci --no-audit --no-fund >/dev/null
    set -e
    npx vue-tsc --noEmit; echo "VUE_TSC: OK"
    npx vite build --logLevel warn >/dev/null; echo "VITE_BUILD: OK"'
