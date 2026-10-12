#!/usr/bin/env bash
# tsc --noEmit and a full build of the backend in a disposable container.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
docker run --rm -m 1500m -v "$ROOT":/app -w /app/backend "${NODE_IMAGE:-bloomly-audit-node}" sh -c '
  npx prisma generate >/dev/null && npx tsc -p tsconfig.json --noEmit && echo "TSC: OK"'
