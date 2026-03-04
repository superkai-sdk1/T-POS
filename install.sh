#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────
#  T-POS — Install & Update script for Ubuntu
#
#  First run:  full interactive setup
#  Next runs:  pulls, rebuilds, fixes nginx/ssl if missing
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
NGINX_CONF="/etc/nginx/sites-available/tpos"
NGINX_LINK="/etc/nginx/sites-enabled/tpos"

info()    { echo -e "${CYAN}[INFO]${NC}  $1"; }
success() { echo -e "${GREEN}[ OK ]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()     { echo -e "${RED}[ERR]${NC}  $1"; }

# ── Shared: nginx setup function ──────────────

setup_nginx() {
  local domain="$1"
  local root_dir="$2"

  info "Создание конфигурации nginx..."

  cat > "$NGINX_CONF" <<NGINXEOF
server {
    listen 80;
    listen [::]:80;
    server_name ${domain};

    root ${root_dir}/dist;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/system/ {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
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

  fix_and_reload_nginx
}

setup_update_server() {
  local dir="$1"

  info "Настройка сервера обновлений..."

  cat > /etc/systemd/system/tpos-update.service <<SVCEOF
[Unit]
Description=T-POS Update Server
After=network.target

[Service]
Type=simple
WorkingDirectory=${dir}
ExecStart=$(which node) ${dir}/server/update-server.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
SVCEOF

  systemctl daemon-reload
  systemctl enable tpos-update --quiet
  systemctl restart tpos-update
  success "Сервер обновлений запущен (порт 3100)"
}

ensure_nginx_proxy() {
  local conf="$1"
  if [ -f "$conf" ] && ! grep -q 'api/system' "$conf" 2>/dev/null; then
    info "Добавление proxy для update-server в nginx..."
    sed -i '/location \/ {/i \
    location /api/system/ {\
        proxy_pass http://127.0.0.1:3100;\
        proxy_http_version 1.1;\
        proxy_set_header Connection "";\
        proxy_buffering off;\
        proxy_cache off;\
        proxy_read_timeout 300s;\
    }' "$conf"
    success "Proxy для update-server добавлен"
  fi
}

fix_and_reload_nginx() {
  info "Проверка nginx..."
  if ! nginx -t 2>&1; then
    if nginx -t 2>&1 | grep -q "server_names_hash"; then
      info "Увеличение server_names_hash_bucket_size..."
      if ! grep -q 'server_names_hash_bucket_size' /etc/nginx/nginx.conf; then
        sed -i '/http {/a \\tserver_names_hash_bucket_size 128;' /etc/nginx/nginx.conf
      fi
    fi
    if ! nginx -t 2>&1; then
      err "Ошибка nginx! Проверьте: nginx -t"
      return 1
    fi
  fi
  success "Конфигурация nginx корректна"
  systemctl reload nginx
  success "nginx перезагружен"
}

setup_ssl() {
  local domain="$1"
  local email="$2"

  info "Запрос SSL-сертификата для ${domain}..."
  if certbot --nginx \
    -d "$domain" \
    --non-interactive \
    --agree-tos \
    --email "$email" \
    --redirect; then
    success "SSL-сертификат получен"
  else
    warn "Не удалось. Попробуйте: certbot --nginx -d ${domain}"
  fi
}

# ── Header ────────────────────────────────────

echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║     T-POS — Установка / Обновление      ║${NC}"
echo -e "${BOLD}${CYAN}║     Клуб спортивной мафии «Титан»        ║${NC}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════╝${NC}"
echo ""

if [ "$EUID" -ne 0 ]; then
  err "Запустите от root: sudo bash install.sh"
  exit 1
fi

# ── Detect mode ───────────────────────────────

INSTALL_DIR="$DEFAULT_DIR"
MODE="install"

if [ -d "$DEFAULT_DIR/.git" ] && [ -f "$DEFAULT_DIR/.env" ]; then
  MODE="update"
fi

# ══════════════════════════════════════════════
#  UPDATE MODE
# ══════════════════════════════════════════════

if [ "$MODE" = "update" ]; then
  echo -e "${BOLD}${YELLOW}▸ Обновление T-POS${NC}"
  echo ""

  cd "$INSTALL_DIR"

  info "Загрузка обновлений..."
  git pull origin main

  info "Установка зависимостей..."
  npm ci --loglevel=error 2>&1

  info "Сборка..."
  npm run build 2>&1

  chown -R www-data:www-data dist 2>/dev/null || true

  success "Проект обновлён"

  setup_update_server "$INSTALL_DIR"
  ensure_nginx_proxy "$NGINX_CONF"

  # ── Check nginx config, set up if missing ──

  if [ ! -f "$NGINX_CONF" ]; then
    echo ""
    warn "Конфигурация nginx не найдена — настраиваю"

    DOMAIN=""
    echo -ne "${BOLD}Домен для T-POS: ${NC}"
    read -r DOMAIN
    if [ -z "$DOMAIN" ]; then
      err "Домен обязателен для настройки nginx"
      exit 1
    fi

    setup_nginx "$DOMAIN" "$INSTALL_DIR"

    # ── SSL ──
    echo ""
    echo -ne "${BOLD}Выпустить SSL-сертификат? (y/n): ${NC}"
    read -r yn
    if [ "$yn" = "y" ] || [ "$yn" = "Y" ]; then
      EMAIL=""
      echo -ne "${BOLD}Email для certbot: ${NC}"
      read -r EMAIL
      if [ -n "$EMAIL" ]; then
        setup_ssl "$DOMAIN" "$EMAIL"
      fi
    fi
  else
    systemctl reload nginx 2>/dev/null || true
    success "nginx перезагружен"

    # Check if SSL is configured
    if ! grep -q 'ssl_certificate' "$NGINX_CONF" 2>/dev/null; then
      warn "SSL не настроен"
      echo -ne "${BOLD}Выпустить SSL-сертификат? (y/n): ${NC}"
      read -r yn
      if [ "$yn" = "y" ] || [ "$yn" = "Y" ]; then
        DOMAIN=$(grep 'server_name' "$NGINX_CONF" | head -1 | awk '{print $2}' | tr -d ';')
        EMAIL=""
        echo -ne "${BOLD}Email для certbot: ${NC}"
        read -r EMAIL
        if [ -n "$EMAIL" ] && [ -n "$DOMAIN" ]; then
          setup_ssl "$DOMAIN" "$EMAIL"
        fi
      fi
    fi
  fi

  echo ""
  echo -e "${BOLD}${GREEN}Готово!${NC} $(git log -1 --format='%h %s')"
  echo ""
  exit 0
fi

# ══════════════════════════════════════════════
#  INSTALL MODE
# ══════════════════════════════════════════════

if [ ! -t 0 ]; then
  err "Установка интерактивная — скачайте и запустите:"
  echo "  wget https://raw.githubusercontent.com/superkai-sdk1/T-POS/main/install.sh"
  echo "  sudo bash install.sh"
  exit 1
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

echo -ne "${BOLD}Начинаем установку? (y/n): ${NC}"
read -r yn
if [ "$yn" != "y" ] && [ "$yn" != "Y" ]; then
  info "Отменено"
  exit 0
fi

# ── Step 2: Dependencies ─────────────────────

echo ""
echo -e "${BOLD}${YELLOW}▸ Шаг 2/5: Зависимости${NC}"
echo ""

apt-get update -qq > /dev/null 2>&1
success "Пакеты обновлены"

for pkg in nginx certbot git; do
  if command -v "$pkg" > /dev/null 2>&1; then
    success "$pkg уже установлен"
  else
    info "Установка $pkg..."
    apt-get install -y -qq "$pkg" > /dev/null 2>&1
    success "$pkg установлен"
  fi
done

if ! command -v certbot > /dev/null 2>&1; then
  apt-get install -y -qq python3-certbot-nginx > /dev/null 2>&1
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
    install_node
  fi
else
  install_node
fi

# ── Step 3: Clone & build ────────────────────

echo ""
echo -e "${BOLD}${YELLOW}▸ Шаг 3/5: Клонирование и сборка${NC}"
echo ""

if [ -d "$INSTALL_DIR" ]; then
  cd /
  rm -rf "$INSTALL_DIR"
fi

git clone "$REPO_URL" "$INSTALL_DIR"
success "Репозиторий клонирован"
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

info "npm ci..."
npm ci --loglevel=error 2>&1
success "Зависимости установлены"

info "Сборка..."
npm run build 2>&1

if [ ! -d "$INSTALL_DIR/dist" ]; then
  err "Сборка не удалась"
  exit 1
fi

success "Проект собран"
chown -R www-data:www-data "$INSTALL_DIR/dist"

setup_update_server "$INSTALL_DIR"

# ── Step 4: Nginx ────────────────────────────

echo ""
echo -e "${BOLD}${YELLOW}▸ Шаг 4/5: Nginx${NC}"
echo ""

setup_nginx "$DOMAIN" "$INSTALL_DIR"

# ── Step 5: SSL ──────────────────────────────

echo ""
echo -e "${BOLD}${YELLOW}▸ Шаг 5/5: SSL-сертификат${NC}"
echo ""

echo -ne "${BOLD}Выпустить SSL-сертификат? (y/n): ${NC}"
read -r yn
if [ "$yn" = "y" ] || [ "$yn" = "Y" ]; then
  setup_ssl "$DOMAIN" "$EMAIL"
else
  warn "SSL пропущен: certbot --nginx -d ${DOMAIN} --email ${EMAIL}"
fi

# ── Done ─────────────────────────────────────

echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║        Установка завершена!              ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Сайт:${NC}      https://${DOMAIN}"
echo -e "  ${BOLD}Файлы:${NC}     ${INSTALL_DIR}"
echo ""
echo -e "  ${CYAN}Обновление:${NC}  sudo bash ${INSTALL_DIR}/install.sh"
echo ""
