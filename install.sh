#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────
#  T-POS — Interactive installer for Ubuntu
#  Safely adds nginx config without touching
#  existing sites. Obtains SSL via certbot.
# ─────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

REPO_URL="https://github.com/superkai-sdk1/T-POS.git"
INSTALL_DIR="/var/www/tpos"
NODE_MAJOR=22

info()    { echo -e "${CYAN}[INFO]${NC}  $1"; }
success() { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error()   { echo -e "${RED}[ERR]${NC}   $1"; }

header() {
  echo ""
  echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}${CYAN}║         T-POS — Установка проекта        ║${NC}"
  echo -e "${BOLD}${CYAN}║     Клуб спортивной мафии «Титан»        ║${NC}"
  echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════╝${NC}"
  echo ""
}

ask() {
  local prompt="$1" var="$2" default="${3:-}"
  if [[ -n "$default" ]]; then
    read -rp "$(echo -e "${BOLD}$prompt${NC} [${default}]: ")" input
    eval "$var=\"${input:-$default}\""
  else
    while true; do
      read -rp "$(echo -e "${BOLD}$prompt${NC}: ")" input
      if [[ -n "$input" ]]; then
        eval "$var=\"$input\""
        break
      fi
      error "Это обязательное поле"
    done
  fi
}

ask_secret() {
  local prompt="$1" var="$2"
  while true; do
    read -srp "$(echo -e "${BOLD}$prompt${NC}: ")" input
    echo ""
    if [[ -n "$input" ]]; then
      eval "$var=\"$input\""
      break
    fi
    error "Это обязательное поле"
  done
}

confirm() {
  read -rp "$(echo -e "${BOLD}$1${NC} (y/n): ")" yn
  [[ "$yn" =~ ^[Yy]$ ]]
}

# ── Preflight checks ──────────────────────────

header

if [[ $EUID -ne 0 ]]; then
  error "Скрипт необходимо запускать от root (sudo)"
  echo "  Используйте: sudo bash install.sh"
  exit 1
fi

if ! grep -qi 'ubuntu' /etc/os-release 2>/dev/null; then
  warn "Похоже это не Ubuntu. Скрипт рассчитан на Ubuntu 20.04+"
  if ! confirm "Продолжить?"; then exit 1; fi
fi

# ── Collect data ───────────────────────────────

echo -e "${BOLD}${YELLOW}▸ Шаг 1/5: Ввод данных${NC}\n"

ask "Домен для T-POS (например tpos.example.com)" DOMAIN
ask "Email для SSL-сертификата (certbot)" EMAIL
echo ""
info "Supabase настройки:"
ask "  Supabase URL" SUPABASE_URL
ask_secret "  Supabase Anon Key" SUPABASE_ANON_KEY
echo ""
info "Telegram настройки:"
ask_secret "  Telegram Bot Token" TG_BOT_TOKEN
echo ""
ask "Директория установки" INSTALL_DIR "$INSTALL_DIR"

echo ""
echo -e "${BOLD}─── Проверьте данные ───${NC}"
echo -e "  Домен:       ${GREEN}${DOMAIN}${NC}"
echo -e "  Email:       ${GREEN}${EMAIL}${NC}"
echo -e "  Supabase:    ${GREEN}${SUPABASE_URL}${NC}"
echo -e "  Anon Key:    ${GREEN}${SUPABASE_ANON_KEY:0:20}...${NC}"
echo -e "  Bot Token:   ${GREEN}${TG_BOT_TOKEN:0:15}...${NC}"
echo -e "  Директория:  ${GREEN}${INSTALL_DIR}${NC}"
echo ""

if ! confirm "Всё верно? Начинаем установку?"; then
  info "Установка отменена"
  exit 0
fi

# ── Step 2: Install system dependencies ────────

echo ""
echo -e "${BOLD}${YELLOW}▸ Шаг 2/5: Установка зависимостей${NC}\n"

info "Обновление списка пакетов..."
apt-get update -qq

# nginx
if command -v nginx &>/dev/null; then
  success "nginx уже установлен"
else
  info "Установка nginx..."
  apt-get install -y -qq nginx
  success "nginx установлен"
fi

# certbot
if command -v certbot &>/dev/null; then
  success "certbot уже установлен"
else
  info "Установка certbot..."
  apt-get install -y -qq certbot python3-certbot-nginx
  success "certbot установлен"
fi

# git
if command -v git &>/dev/null; then
  success "git уже установлен"
else
  info "Установка git..."
  apt-get install -y -qq git
  success "git установлен"
fi

# Node.js
install_node() {
  info "Установка Node.js ${NODE_MAJOR}..."
  apt-get install -y -qq ca-certificates curl gnupg
  mkdir -p /etc/apt/keyrings
  if [[ ! -f /etc/apt/keyrings/nodesource.gpg ]]; then
    curl -fsSL "https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key" | \
      gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  fi
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" > \
    /etc/apt/sources.list.d/nodesource.list
  apt-get update -qq
  apt-get install -y -qq nodejs
  success "Node.js $(node -v) установлен"
}

if command -v node &>/dev/null; then
  NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
  if [[ "$NODE_VER" -ge 18 ]]; then
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
echo -e "${BOLD}${YELLOW}▸ Шаг 3/5: Клонирование и сборка${NC}\n"

if [[ -d "$INSTALL_DIR" ]]; then
  warn "Директория ${INSTALL_DIR} уже существует"
  if confirm "Удалить и клонировать заново?"; then
    rm -rf "$INSTALL_DIR"
  else
    info "Обновление существующего репозитория..."
    cd "$INSTALL_DIR"
    git pull origin main
  fi
fi

if [[ ! -d "$INSTALL_DIR" ]]; then
  info "Клонирование репозитория..."
  git clone "$REPO_URL" "$INSTALL_DIR"
  success "Репозиторий клонирован"
fi

cd "$INSTALL_DIR"

info "Создание .env..."
cat > .env <<ENVEOF
VITE_SUPABASE_URL=${SUPABASE_URL}
VITE_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
VITE_TELEGRAM_BOT_TOKEN=${TG_BOT_TOKEN}
ENVEOF
success ".env создан"

info "Установка npm зависимостей..."
npm ci --silent 2>&1 | tail -1
success "Зависимости установлены"

info "Сборка проекта..."
npm run build 2>&1 | tail -3
if [[ -d "$INSTALL_DIR/dist" ]]; then
  success "Проект собран → ${INSTALL_DIR}/dist"
else
  error "Сборка не удалась (dist/ не найден)"
  exit 1
fi

chown -R www-data:www-data "$INSTALL_DIR/dist"

# ── Step 4: Nginx config ─────────────────────

echo ""
echo -e "${BOLD}${YELLOW}▸ Шаг 4/5: Настройка nginx${NC}\n"

NGINX_CONF="/etc/nginx/sites-available/tpos"
NGINX_LINK="/etc/nginx/sites-enabled/tpos"

if [[ -f "$NGINX_CONF" ]]; then
  warn "Конфигурация nginx для T-POS уже существует"
  if ! confirm "Перезаписать?"; then
    info "Пропускаем настройку nginx"
  else
    rm -f "$NGINX_CONF" "$NGINX_LINK"
  fi
fi

if [[ ! -f "$NGINX_CONF" ]]; then
  info "Создание конфигурации nginx..."

  cat > "$NGINX_CONF" <<NGINXEOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    root ${INSTALL_DIR}/dist;
    index index.html;

    # SPA: all routes → index.html
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?|ttf|eot)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # Security headers
    add_header X-Frame-Allow "https://web.telegram.org";
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;
    gzip_min_length 256;
}
NGINXEOF

  ln -sf "$NGINX_CONF" "$NGINX_LINK"
  success "Конфигурация nginx создана"
fi

info "Проверка конфигурации nginx..."
if nginx -t 2>&1; then
  success "Конфигурация nginx корректна"
  systemctl reload nginx
  success "nginx перезагружен"
else
  error "Ошибка в конфигурации nginx!"
  error "Проверьте: nginx -t"
  exit 1
fi

# ── Step 5: SSL certificate ──────────────────

echo ""
echo -e "${BOLD}${YELLOW}▸ Шаг 5/5: SSL-сертификат${NC}\n"

info "Убедитесь что DNS для ${DOMAIN} указывает на этот сервер"
echo ""

if confirm "Выпустить SSL-сертификат через certbot?"; then
  info "Запрос сертификата для ${DOMAIN}..."
  certbot --nginx \
    -d "$DOMAIN" \
    --non-interactive \
    --agree-tos \
    --email "$EMAIL" \
    --redirect

  if [[ $? -eq 0 ]]; then
    success "SSL-сертификат получен и установлен"
  else
    warn "Не удалось получить сертификат"
    warn "Проверьте DNS и попробуйте вручную: certbot --nginx -d ${DOMAIN}"
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
echo -e "  ${CYAN}Обновление проекта:${NC}"
echo -e "    cd ${INSTALL_DIR} && git pull && npm ci && npm run build"
echo -e "    chown -R www-data:www-data dist"
echo ""
echo -e "  ${CYAN}Перевыпуск сертификата (автоматически по cron):${NC}"
echo -e "    certbot renew --dry-run"
echo ""
