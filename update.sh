#!/usr/bin/env bash
set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC}  $1"; }
success() { echo -e "${GREEN}[ OK ]${NC} $1"; }
err()     { echo -e "${RED}[ERR]${NC}  $1"; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo -e "${BOLD}${CYAN}▸ T-POS — Обновление${NC}"
echo ""

if [ ! -f ".env" ]; then
  err ".env не найден. Сначала запустите install.sh"
  exit 1
fi

info "Загрузка обновлений..."
git pull origin main

info "Установка зависимостей..."
npm ci --loglevel=error 2>&1

info "Сборка..."
npm run build 2>&1

chown -R www-data:www-data dist 2>/dev/null || true
systemctl reload nginx 2>/dev/null || true

echo ""
echo -e "${BOLD}${GREEN}Готово!${NC} $(git log -1 --format='%h %s')"
echo ""
