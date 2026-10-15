#!/usr/bin/env bash
# Regenerates frontend/src/lib/icons.ts: the lucide icons that the frontend actually references.
# BIcon resolves icon names at runtime, so the registry is built from every quoted PascalCase
# literal in src/ that is also a lucide export. Re-run after adding a new icon name.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMG="${NODE_IMAGE:-bloomly-audit-node}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

docker run --rm -v "$ROOT/frontend":/app -w /app "$IMG" \
  node --input-type=module -e 'import * as m from "lucide-vue-next"; console.log(Object.keys(m).join("\n"))' \
  | sort -u > "$TMP/lucide.txt"

grep -rhoE "['\"\`][A-Z][A-Za-z0-9]*['\"\`]" "$ROOT/frontend/src" | tr -d "'\"\`" | sort -u > "$TMP/literals.txt"
comm -12 "$TMP/literals.txt" "$TMP/lucide.txt" > "$TMP/used.txt"

{
  echo "// Реестр иконок для BIcon. Список собран по строковым литералам в src/ (см. scripts/gen-icon-registry.sh)."
  echo "// Импорт по именам вместо import * as icons: так в сборку попадают только используемые иконки."
  echo "import {"
  sed 's/^/  /;s/$/,/' "$TMP/used.txt"
  echo "} from 'lucide-vue-next'"
  echo
  echo "export const iconMap: Record<string, any> = {"
  sed 's/^/  /;s/$/,/' "$TMP/used.txt"
  echo "}"
} > "$ROOT/frontend/src/lib/icons.ts"

echo "icons registered: $(wc -l < "$TMP/used.txt")"
