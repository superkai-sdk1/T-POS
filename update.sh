#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────
#  T-POS — Quick update script
#  Pulls latest code, installs deps, rebuilds.
#  Does NOT touch nginx, SSL, or .env.
#
#  Usage:
#    cd /var/www/tpos && sudo bash update.sh
# ─────────────────────────────────────────────

GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC}  $1"; }
success() { echo -e "${GREEN}[ OK ]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()     { echo -e "${RED}[ERR]${NC}  $1"; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo -e "${BOLD}${CYAN}▸ T-POS — Обновление${NC}"
echo -e "  Директория: ${SCRIPT_DIR}"
echo ""

# ── Checks ────────────────────────────────────

if [ ! -f "package.json" ]; then
  err "package.json не найден. Убедитесь что вы в директории T-POS."
  exit 1
fi

if [ ! -f ".env" ]; then
  err ".env не найден. Сначала запустите install.sh"
  exit 1
fi

# ── Pull ──────────────────────────────────────

info "Получение обновлений из git..."
BEFORE=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
git pull origin main
AFTER=$(git rev-parse HEAD 2>/dev/null || echo "unknown")

if [ "$BEFORE" = "$AFTER" ]; then
  warn "Нет новых коммитов"
  echo ""
  echo -ne "${BOLD}Всё равно пересобрать проект? (y/n): ${NC}"
  read -r yn
  if [ "$yn" != "y" ] && [ "$yn" != "Y" ]; then
    info "Обновление не требуется"
    exit 0
  fi
else
  COMMIT_COUNT=$(git rev-list --count "$BEFORE".."$AFTER" 2>/dev/null || echo "?")
  success "Получено коммитов: ${COMMIT_COUNT}"
fi

# ── Install deps ──────────────────────────────

info "Установка зависимостей..."
npm ci --loglevel=error 2>&1
success "Зависимости установлены"

# ── Build ─────────────────────────────────────

info "Сборка проекта..."
set +e
BUILD_OUTPUT=$(npm run build 2>&1)
BUILD_EXIT=$?
set -e

if [ $BUILD_EXIT -ne 0 ]; then
  err "Сборка не удалась!"
  echo "$BUILD_OUTPUT" | tail -20
  exit 1
fi

if [ ! -d "dist" ]; then
  err "dist/ не найден после сборки"
  exit 1
fi

success "Проект собран"
chown -R www-data:www-data dist

# ── Reload nginx ──────────────────────────────

if command -v nginx > /dev/null 2>&1; then
  systemctl reload nginx 2>/dev/null && success "nginx перезагружен" || warn "Не удалось перезагрузить nginx"
fi

# ── Done ──────────────────────────────────────

echo ""
echo -e "${BOLD}${GREEN}Обновление завершено!${NC}"
echo -e "  Коммит: $(git log -1 --format='%h %s' 2>/dev/null)"
echo ""
