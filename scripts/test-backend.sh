#!/usr/bin/env bash
# Runs backend tests against a disposable postgres (tmpfs, removed afterwards).
# Schema comes from `prisma db push` (migration history does not apply on an empty DB,
# see AUDIT.md). Never touches the production stack: separate network + container names, no .env.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NET=bloomly-audit-net
PG=bloomly-audit-pg
IMG="${NODE_IMAGE:-bloomly-audit-node}"

docker network inspect "$NET" >/dev/null 2>&1 || docker network create "$NET" >/dev/null
# Fresh database every run.
docker rm -f "$PG" >/dev/null 2>&1 || true
{
  docker run -d --name "$PG" --network "$NET" --tmpfs /var/lib/postgresql/data \
    -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=bloomly_test \
    postgres:16-alpine >/dev/null
  until docker exec "$PG" pg_isready -U test -d bloomly_test >/dev/null 2>&1; do sleep 1; done
  sleep 1
}
trap 'docker rm -f "$PG" >/dev/null 2>&1 || true' EXIT

docker run --rm -m 1500m --network "$NET" -v "$ROOT":/app -w /app/backend \
  -e DATABASE_URL="postgresql://test:test@$PG:5432/bloomly_test" \
  "$IMG" sh -c "npx prisma db push --skip-generate >/tmp/migrate.log 2>&1 || { cat /tmp/migrate.log; exit 1; }; npx vitest run $*"
