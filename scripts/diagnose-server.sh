#!/usr/bin/env bash
# Диагностика сервера T-POS — проверка .env, dist, nginx, /sb proxy
# Запуск: ./scripts/diagnose-server.sh
# На сервере: cd /var/www/tpos && bash scripts/diagnose-server.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env"

echo -e "${CYAN}=== Диагностика T-POS ===${NC}"
echo "Проект: $ROOT_DIR"
echo ""

# 1. .env
echo "--- .env ---"
if [ ! -f "$ENV_FILE" ]; then
  echo -e "${RED}✗ .env не найден${NC}"
else
  echo -e "${GREEN}✓ .env существует${NC}"
  for key in VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY; do
    val=$(grep -m1 "^${key}=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2-) || true
    val=$(echo "$val" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    if [ -z "$val" ] || [ "$val" = "your-"* ]; then
      echo -e "  ${RED}✗ ${key} — пусто или placeholder${NC}"
    else
      echo -e "  ${GREEN}✓ ${key} — задан${NC}"
    fi
  done
fi
echo ""

# 2. dist
echo "--- Сборка (dist) ---"
if [ ! -f "${ROOT_DIR}/dist/index.html" ]; then
  echo -e "${RED}✗ dist/index.html не найден — выполните: npm run build${NC}"
else
  echo -e "${GREEN}✓ dist/index.html есть${NC}"
  assets=$(find "${ROOT_DIR}/dist/assets" -name "*.js" 2>/dev/null | wc -l)
  echo "  JS файлов в assets: $assets"
fi

if [ ! -f "${ROOT_DIR}/dist-wallet/wallet.html" ]; then
  echo -e "${YELLOW}○ dist-wallet/wallet.html не найден — выполните: npm run build:wallet${NC}"
else
  echo -e "${GREEN}✓ dist-wallet/wallet.html есть${NC}"
fi
echo ""

# 3. nginx
echo "--- Nginx ---"
if ! command -v nginx &>/dev/null; then
  echo -e "${YELLOW}○ nginx не найден в PATH${NC}"
else
  if nginx -t 2>/dev/null; then
    echo -e "${GREEN}✓ nginx config OK${NC}"
  else
    echo -e "${RED}✗ nginx config ошибка:${NC}"
    nginx -t 2>&1 || true
  fi

  # Проверка /sb/ в конфиге
  nginx_conf="/etc/nginx/sites-available/tpos"
  if [ -d /etc/nginx/sites-enabled ]; then
    for f in /etc/nginx/sites-enabled/*; do
      [ -f "$f" ] || continue
      if grep -q "tpos\|titanpos" "$f" 2>/dev/null; then
        nginx_conf="$f"
        break
      fi
    done
  fi

  if [ -f "$nginx_conf" ] && grep -q "location /sb/" "$nginx_conf" 2>/dev/null; then
    echo -e "${GREEN}✓ location /sb/ найден в $nginx_conf${NC}"
  else
    echo -e "${RED}✗ location /sb/ не найден — Supabase proxy не настроен${NC}"
    echo "  Добавьте блок location /sb/ в nginx (см. install.sh)"
  fi

  if systemctl is-active --quiet nginx 2>/dev/null; then
    echo -e "${GREEN}✓ nginx запущен${NC}"
  else
    echo -e "${RED}✗ nginx не запущен — sudo systemctl start nginx${NC}"
  fi
fi
echo ""

# 4. Update server (порт 3100)
echo "--- Update Server (порт 3100) ---"
if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3100/api/system/info 2>/dev/null | grep -q 200; then
  echo -e "${GREEN}✓ Update server отвечает${NC}"
else
  echo -e "${YELLOW}○ Update server не отвечает на :3100${NC}"
  echo "  Запуск: node server/update-server.js или systemctl start tpos-update"
fi
echo ""

# 5. Проверка /sb через curl (если nginx на 80)
echo "--- Тест /sb proxy ---"
if [ -f "$ENV_FILE" ]; then
  sb_url=$(grep -m1 "^VITE_SUPABASE_URL=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2-) || true
  sb_host=$(echo "$sb_url" | sed 's|https://||' | sed 's|/.*||')
  if [ -n "$sb_host" ] && [ "$sb_host" != "your-project.supabase.co" ]; then
    # Пробуем через localhost если nginx слушает 80
    if curl -s -o /dev/null -w "%{http_code}" -H "Host: $(hostname)" "http://127.0.0.1/sb/rest/v1/" 2>/dev/null | grep -qE "200|401|404"; then
      echo -e "${GREEN}✓ /sb/ proxy отвечает (200/401/404 — ожидаемо без ключа)${NC}"
    else
      echo -e "${YELLOW}○ /sb/ proxy не проверен (nginx может быть на другом порту)${NC}"
    fi
  fi
fi
echo ""

echo -e "${CYAN}--- Рекомендации ---${NC}"
echo "Если приложение не грузится:"
echo "  1. Откройте консоль браузера (F12 → Console) — смотрите ошибки"
echo "  2. Очистите кэш PWA: Настройки → Приложения → T-POS → Очистить данные"
echo "  3. Пересоберите с .env: npm run build && npm run build:wallet"
echo "  4. Перезагрузите nginx: sudo systemctl reload nginx"
