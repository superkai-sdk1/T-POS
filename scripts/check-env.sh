#!/usr/bin/env bash
# Проверка .env — все ли ключи на месте для запуска приложения
# Запуск: ./scripts/check-env.sh
# Или с сервера: cd /var/www/tpos && bash scripts/check-env.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo -e "${RED}✗ Файл .env не найден${NC}"
  echo "  Путь: $ENV_FILE"
  echo ""
  echo "Создайте .env из примера:"
  echo "  cp .env.example .env"
  echo "  # Затем заполните значения в .env"
  exit 1
fi

echo -e "${CYAN}=== Проверка ключей T-POS ===${NC}"
echo "Файл: $ENV_FILE"
echo ""

# Критичные для веб-приложения (встроены в build)
check_required() {
  local key="$1" desc="$2"
  local val
  val=$(grep -m1 "^${key}=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2-) || true
  val=$(echo "$val" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

  if [ -z "$val" ] || [ "$val" = "your-project.supabase.co" ] || [ "$val" = "your-anon-key" ]; then
    echo -e "${RED}✗ ${key}${NC} — отсутствует или placeholder"
    echo "  Нужно для: $desc"
    return 1
  fi
  echo -e "${GREEN}✓ ${key}${NC}"
  return 0
}

# Опциональные
check_optional() {
  local key="$1" desc="$2"
  local val
  val=$(grep -m1 "^${key}=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2-) || true
  val=$(echo "$val" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

  if [ -z "$val" ] || [ "$val" = "your-"* ]; then
    echo -e "${YELLOW}○ ${key}${NC} — не задан (опционально: $desc)"
    return 0
  fi
  echo -e "${GREEN}✓ ${key}${NC}"
  return 0
}

FAIL=0

echo "--- Критичные для приложения (без них не откроется) ---"
check_required "VITE_SUPABASE_URL" "подключение к Supabase" || FAIL=1
check_required "VITE_SUPABASE_ANON_KEY" "anon ключ Supabase" || FAIL=1
echo ""

echo "--- Для ботов и API ---"
check_optional "TELEGRAM_BOT_TOKEN" "Telegram-уведомления и auth (серверный)"
# Проверка устаревшей переменной
OLD_TG=$(grep -m1 "^VITE_TELEGRAM_BOT_TOKEN=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2-) || true
NEW_TG=$(grep -m1 "^TELEGRAM_BOT_TOKEN=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2-) || true
if [ -n "$OLD_TG" ] && [ -z "$NEW_TG" ]; then
  echo -e "${YELLOW}⚠ VITE_TELEGRAM_BOT_TOKEN${NC} — устарел! Переименуйте в TELEGRAM_BOT_TOKEN"
  echo "  VITE_ префикс небезопасен — токен попадает в клиентский бандл"
fi
check_optional "CLIENT_BOT_TOKEN" "wallet-бот"
check_optional "API_SECRET" "защита /api/system/update"
check_optional "OWNER_CHAT_IDS" "чат admins"
check_optional "POLZA_AI_API_KEY" "AI-ассистент (Polza.ai)"
echo ""

echo "--- Домены ---"
check_optional "POS_DOMAIN" "CORS для POS"
check_optional "WALLET_DOMAIN" "CORS для wallet"
check_optional "VITE_WALLET_BOT_USERNAME" "username бота"
echo ""

if [ $FAIL -eq 1 ]; then
  echo -e "${RED}Проблема: критичные ключи отсутствуют.${NC}"
  echo ""
  echo "Где взять Supabase:"
  echo "  Supabase Dashboard → Project Settings → API"
  echo "  - Project URL → VITE_SUPABASE_URL"
  echo "  - anon public → VITE_SUPABASE_ANON_KEY"
  echo ""
  echo "После правки .env пересоберите:"
  echo "  npm run build"
  echo "  npm run build:wallet"
  exit 1
fi

echo -e "${GREEN}✓ Все критичные ключи на месте${NC}"
echo ""
echo "Если приложение всё равно не открывается:"
echo "  1. Проверьте консоль браузера (F12 → Console)"
echo "  2. Пересоберите: npm run build && npm run build:wallet"
echo "  3. Проверьте nginx: sudo nginx -t && sudo systemctl status nginx"
