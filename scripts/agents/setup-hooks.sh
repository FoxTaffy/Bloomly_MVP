#!/bin/sh
# Подключает хуки репозитория: git config core.hooksPath .githooks
cd "$(git rev-parse --show-toplevel)" || exit 1
chmod +x .githooks/* scripts/agents/*.mjs
git config core.hooksPath .githooks
echo "Хуки подключены (.githooks). Отключить: git config --unset core.hooksPath"
