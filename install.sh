#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────
#  T-POS — Interactive installer for Ubuntu
#  Safely adds nginx config without touching
#  existing sites. Obtains SSL via certbot.
#
#  Usage:
#    wget https://raw.githubusercontent.com/superkai-sdk1/T-POS/main/install.sh
#    sudo bash install.sh
# ─────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

REPO_URL="https://github.com/superkai-sdk1/T-POS.git"
DEFAULT_DIR="/var/www/tpos"
NODE_MAJOR=22

info()    { echo -e "${CYAN}[INFO]${NC}  $1"; }
success() { echo -e "${GREEN}[ OK ]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()     { echo -e "${RED}[ERR]${NC}  $1"; }

# ── Ensure we can read from terminal ──────────

if [ ! -t 0 ]; then
  err "Этот скрипт интерактивный и не может запускаться через pipe."
  echo ""
  echo "  Скачайте и запустите:"
  echo "    wget https://raw.githubusercontent.com/superkai-sdk1/T-POS/main/install.sh"
  echo "    sudo bash install.sh"
  echo ""
  exit 1
fi

# ── Header ────────────────────────────────────

echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║         T-POS — Установка проекта        ║${NC}"
echo -e "${BOLD}${CYAN}║     Клуб спортивной мафии «Титан»        ║${NC}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════╝${NC}"
echo ""

# ── Root check ────────────────────────────────

if [ "$EUID" -ne 0 ]; then
  err "Запустите от root: sudo bash install.sh"
  exit 1
fi

# ── OS check ──────────────────────────────────

if ! grep -qi 'ubuntu' /etc/os-release 2>/dev/null; then
  warn "Похоже это не Ubuntu. Скрипт рассчитан на Ubuntu 20.04+"
  echo -ne "${BOLD}Продолжить? (y/n): ${NC}"
  read -r yn
  if [ "$yn" != "y" ] && [ "$yn" != "Y" ]; then exit 1; fi
fi

# ── Step 1: Collect data ──────────────────────

echo -e "${BOLD}${YELLOW}▸ Шаг 1/5: Ввод данных${NC}"
echo ""

DOMAIN=""
while [ -z "$DOMAIN" ]; do
  echo -ne "${BOLD}Домен для T-POS (например pos.example.com): ${NC}"
  read -r DOMAIN
  if [ -z "$DOMAIN" ]; then err "Обязательное поле"; fi
done

EMAIL=""
while [ -z "$EMAIL" ]; do
  echo -ne "${BOLD}Email для SSL-сертификата (certbot): ${NC}"
  read -r EMAIL
  if [ -z "$EMAIL" ]; then err "Обязательное поле"; fi
done

echo ""
info "Supabase настройки:"

SUPABASE_URL=""
while [ -z "$SUPABASE_URL" ]; do
  echo -ne "${BOLD}  Supabase URL: ${NC}"
  read -r SUPABASE_URL
  if [ -z "$SUPABASE_URL" ]; then err "Обязательное поле"; fi
done

SUPABASE_ANON_KEY=""
while [ -z "$SUPABASE_ANON_KEY" ]; do
  echo -ne "${BOLD}  Supabase Anon Key: ${NC}"
  read -rs SUPABASE_ANON_KEY
  echo ""
  if [ -z "$SUPABASE_ANON_KEY" ]; then err "Обязательное поле"; fi
done

echo ""
info "Telegram настройки:"

TG_BOT_TOKEN=""
while [ -z "$TG_BOT_TOKEN" ]; do
  echo -ne "${BOLD}  Telegram Bot Token: ${NC}"
  read -rs TG_BOT_TOKEN
  echo ""
  if [ -z "$TG_BOT_TOKEN" ]; then err "Обязательное поле"; fi
done

echo ""
echo -ne "${BOLD}Директория установки [${DEFAULT_DIR}]: ${NC}"
read -r INSTALL_DIR
INSTALL_DIR="${INSTALL_DIR:-$DEFAULT_DIR}"

echo ""
echo -e "${BOLD}─── Проверьте данные ───${NC}"
echo -e "  Домен:       ${GREEN}${DOMAIN}${NC}"
echo -e "  Email:       ${GREEN}${EMAIL}${NC}"
echo -e "  Supabase:    ${GREEN}${SUPABASE_URL}${NC}"
echo -e "  Anon Key:    ${GREEN}${SUPABASE_ANON_KEY:0:20}...${NC}"
echo -e "  Bot Token:   ${GREEN}${TG_BOT_TOKEN:0:15}...${NC}"
echo -e "  Директория:  ${GREEN}${INSTALL_DIR}${NC}"
echo ""

echo -ne "${BOLD}Всё верно? Начинаем установку? (y/n): ${NC}"
read -r yn
if [ "$yn" != "y" ] && [ "$yn" != "Y" ]; then
  info "Установка отменена"
  exit 0
fi

# ── Step 2: Install system dependencies ───────

echo ""
echo -e "${BOLD}${YELLOW}▸ Шаг 2/5: Установка зависимостей${NC}"
echo ""

info "Обновление списка пакетов..."
apt-get update -qq > /dev/null 2>&1
success "Пакеты обновлены"

if command -v nginx > /dev/null 2>&1; then
  success "nginx уже установлен ($(nginx -v 2>&1 | cut -d/ -f2))"
else
  info "Установка nginx..."
  apt-get install -y -qq nginx > /dev/null 2>&1
  success "nginx установлен"
fi

if command -v certbot > /dev/null 2>&1; then
  success "certbot уже установлен"
else
  info "Установка certbot..."
  apt-get install -y -qq certbot python3-certbot-nginx > /dev/null 2>&1
  success "certbot установлен"
fi

if command -v git > /dev/null 2>&1; then
  success "git уже установлен"
else
  info "Установка git..."
  apt-get install -y -qq git > /dev/null 2>&1
  success "git установлен"
fi

install_node() {
  info "Установка Node.js ${NODE_MAJOR}..."
  apt-get install -y -qq ca-certificates curl gnupg > /dev/null 2>&1
  mkdir -p /etc/apt/keyrings
  if [ ! -f /etc/apt/keyrings/nodesource.gpg ]; then
    curl -fsSL "https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key" | \
      gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg 2>/dev/null
  fi
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" > \
    /etc/apt/sources.list.d/nodesource.list
  apt-get update -qq > /dev/null 2>&1
  apt-get install -y -qq nodejs > /dev/null 2>&1
  success "Node.js $(node -v) установлен"
}

if command -v node > /dev/null 2>&1; then
  NODE_VER="$(node -v | sed 's/v//' | cut -d. -f1)"
  if [ "$NODE_VER" -ge 18 ] 2>/dev/null; then
    success "Node.js $(node -v) уже установлен"
  else
    warn "Node.js $(node -v) слишком старый (нужна >=18)"
    install_node
  fi
else
  install_node
fi

# ── Step 3: Clone & build ─────────────────────

echo ""
echo -e "${BOLD}${YELLOW}▸ Шаг 3/5: Клонирование и сборка${NC}"
echo ""

if [ -d "$INSTALL_DIR" ]; then
  warn "Директория ${INSTALL_DIR} уже существует"
  echo -ne "${BOLD}Удалить и клонировать заново? (y/n): ${NC}"
  read -r yn
  if [ "$yn" = "y" ] || [ "$yn" = "Y" ]; then
    rm -rf "$INSTALL_DIR"
  else
    info "Обновление существующего репозитория..."
    cd "$INSTALL_DIR"
    git pull origin main || true
  fi
fi

if [ ! -d "$INSTALL_DIR" ]; then
  info "Клонирование репозитория..."
  git clone "$REPO_URL" "$INSTALL_DIR"
  success "Репозиторий клонирован"
fi

cd "$INSTALL_DIR"

info "Создание .env..."
cat > .env <<'ENVEOF'
VITE_SUPABASE_URL=__SUPABASE_URL__
VITE_SUPABASE_ANON_KEY=__SUPABASE_ANON_KEY__
VITE_TELEGRAM_BOT_TOKEN=__TG_BOT_TOKEN__
ENVEOF
sed -i "s|__SUPABASE_URL__|${SUPABASE_URL}|g" .env
sed -i "s|__SUPABASE_ANON_KEY__|${SUPABASE_ANON_KEY}|g" .env
sed -i "s|__TG_BOT_TOKEN__|${TG_BOT_TOKEN}|g" .env
success ".env создан"

info "Установка npm зависимостей (может занять пару минут)..."
npm ci --loglevel=error 2>&1
success "Зависимости установлены"

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

if [ ! -d "$INSTALL_DIR/dist" ]; then
  err "Сборка завершилась но dist/ не найден"
  exit 1
fi

success "Проект собран -> ${INSTALL_DIR}/dist"
chown -R www-data:www-data "$INSTALL_DIR/dist"

# ── Step 4: Nginx config ─────────────────────

echo ""
echo -e "${BOLD}${YELLOW}▸ Шаг 4/5: Настройка nginx${NC}"
echo ""

NGINX_CONF="/etc/nginx/sites-available/tpos"
NGINX_LINK="/etc/nginx/sites-enabled/tpos"
WRITE_NGINX=1

if [ -f "$NGINX_CONF" ]; then
  warn "Конфигурация nginx для T-POS уже существует"
  echo -ne "${BOLD}Перезаписать? (y/n): ${NC}"
  read -r yn
  if [ "$yn" = "y" ] || [ "$yn" = "Y" ]; then
    rm -f "$NGINX_CONF" "$NGINX_LINK"
  else
    info "Пропускаем настройку nginx"
    WRITE_NGINX=0
  fi
fi

if [ "$WRITE_NGINX" -eq 1 ] && [ ! -f "$NGINX_CONF" ]; then
  info "Создание конфигурации nginx..."

  cat > "$NGINX_CONF" <<NGINXEOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    root ${INSTALL_DIR}/dist;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?|ttf|eot)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;
    gzip_min_length 256;
}
NGINXEOF

  ln -sf "$NGINX_CONF" "$NGINX_LINK"
  success "Конфигурация nginx создана"
fi

info "Проверка конфигурации nginx..."
set +e
NGINX_TEST=$(nginx -t 2>&1)
NGINX_EXIT=$?
set -e

if [ $NGINX_EXIT -eq 0 ]; then
  success "Конфигурация nginx корректна"
  systemctl reload nginx
  success "nginx перезагружен"
else
  err "Ошибка в конфигурации nginx!"
  echo "$NGINX_TEST"
  err "Исправьте вручную: nano ${NGINX_CONF} && nginx -t && systemctl reload nginx"
  exit 1
fi

# ── Step 5: SSL certificate ──────────────────

echo ""
echo -e "${BOLD}${YELLOW}▸ Шаг 5/5: SSL-сертификат${NC}"
echo ""

info "Убедитесь что DNS для ${DOMAIN} указывает на этот сервер"
echo ""

echo -ne "${BOLD}Выпустить SSL-сертификат через certbot? (y/n): ${NC}"
read -r yn
if [ "$yn" = "y" ] || [ "$yn" = "Y" ]; then
  info "Запрос сертификата для ${DOMAIN}..."
  if certbot --nginx \
    -d "$DOMAIN" \
    --non-interactive \
    --agree-tos \
    --email "$EMAIL" \
    --redirect; then
    success "SSL-сертификат получен и установлен"
  else
    warn "Не удалось получить сертификат"
    warn "Проверьте DNS и попробуйте: certbot --nginx -d ${DOMAIN}"
  fi
else
  warn "SSL пропущен. Для получения вручную:"
  echo "  certbot --nginx -d ${DOMAIN} --email ${EMAIL}"
fi

# ── Done ──────────────────────────────────────

echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║        Установка завершена!              ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Сайт:${NC}      https://${DOMAIN}"
echo -e "  ${BOLD}Файлы:${NC}     ${INSTALL_DIR}"
echo -e "  ${BOLD}Билд:${NC}      ${INSTALL_DIR}/dist"
echo -e "  ${BOLD}Nginx:${NC}     ${NGINX_CONF}"
echo -e "  ${BOLD}.env:${NC}      ${INSTALL_DIR}/.env"
echo ""
echo -e "  ${CYAN}Быстрое обновление:${NC}"
echo -e "    cd ${INSTALL_DIR} && sudo bash update.sh"
echo ""
echo -e "  ${CYAN}Сертификат обновляется автоматически (certbot cron).${NC}"
echo ""
