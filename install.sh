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
WALLET_NGINX_CONF="/etc/nginx/sites-available/tpos-wallet"
WALLET_NGINX_LINK="/etc/nginx/sites-enabled/tpos-wallet"
DEFAULT_WALLET_DOMAIN="wallet.cloudtitan.ru"

info()    { echo -e "${CYAN}[INFO]${NC}  $1"; }
success() { echo -e "${GREEN}[ OK ]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()     { echo -e "${RED}[ERR]${NC}  $1"; }

# ── .env helpers ──────────────────────────────
# All grep pipelines use `|| true` to survive `set -eo pipefail`

read_env_value() {
  local file="$1" key="$2" val=""
  if [ -f "$file" ]; then
    val=$(grep -m1 "^${key}=" "$file" 2>/dev/null | cut -d'=' -f2-) || true
  fi
  echo "$val"
}

add_env_key() {
  local file="$1" key="$2" value="$3"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    echo "${key}=${value}" >> "$file"
  fi
}

ensure_env_key() {
  local file="$1" key="$2" prompt_text="$3"
  local default_val="${4:-}" is_secret="${5:-false}"

  local current=""
  current=$(read_env_value "$file" "$key") || true

  if [ -n "$current" ]; then
    success "${key} уже задан"
    return 0
  fi

  if [ -n "$default_val" ]; then
    echo -ne "${BOLD}${prompt_text} [${default_val}]: ${NC}"
  else
    echo -ne "${BOLD}${prompt_text}: ${NC}"
  fi

  local input=""
  if [ "$is_secret" = "true" ]; then
    read -rs input || true
    echo ""
  else
    read -r input || true
  fi

  input="${input:-$default_val}"

  if [ -z "$input" ]; then
    warn "Пропущено: ${key}"
    return 0
  fi

  add_env_key "$file" "$key" "$input"
  success "${key} добавлен в .env"
  return 0
}

grep_safe() {
  grep "$@" 2>/dev/null || true
}

# ── Shared: nginx setup functions ─────────────

setup_nginx() {
  local domain="$1" root_dir="$2"

  info "Создание конфигурации nginx для ${domain}..."

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

    location /sb/ {
        proxy_pass https://dscadajjthbcrullhwtx.supabase.co/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host dscadajjthbcrullhwtx.supabase.co;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_ssl_server_name on;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
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
  success "Конфигурация nginx создана для ${domain}"
}

setup_wallet_nginx() {
  local wallet_domain="$1" root_dir="$2"

  info "Создание конфигурации nginx для ${wallet_domain}..."

  cat > "$WALLET_NGINX_CONF" <<WNEOF
server {
    listen 80;
    listen [::]:80;
    server_name ${wallet_domain};

    root ${root_dir}/dist-wallet;
    index wallet.html;

    location / {
        try_files \$uri \$uri/ /wallet.html;
    }

    location /sb/ {
        proxy_pass https://dscadajjthbcrullhwtx.supabase.co/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host dscadajjthbcrullhwtx.supabase.co;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_ssl_server_name on;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
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
WNEOF

  ln -sf "$WALLET_NGINX_CONF" "$WALLET_NGINX_LINK"
  success "Конфигурация nginx создана для ${wallet_domain}"
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

setup_wallet_bot() {
  local dir="$1"

  local has_token=""
  has_token=$(read_env_value "${dir}/.env" "CLIENT_BOT_TOKEN") || true
  if [ -z "$has_token" ]; then
    warn "CLIENT_BOT_TOKEN не задан — бот wallet не будет запущен"
    return 0
  fi

  info "Настройка TITAN Wallet Bot..."

  cat > /etc/systemd/system/tpos-wallet-bot.service <<WBEOF
[Unit]
Description=TITAN Wallet Bot
After=network.target

[Service]
Type=simple
WorkingDirectory=${dir}
ExecStart=$(which node) ${dir}/server/wallet-bot.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
WBEOF

  systemctl daemon-reload
  systemctl enable tpos-wallet-bot --quiet
  systemctl restart tpos-wallet-bot
  success "TITAN Wallet Bot запущен"
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

ensure_supabase_proxy() {
  local conf="$1"
  if [ -f "$conf" ] && ! grep -q 'location /sb/' "$conf" 2>/dev/null; then
    info "Добавление Supabase proxy в nginx (обход блокировок)..."
    sed -i '/location \/ {/i \
    location /sb/ {\
        proxy_pass https://dscadajjthbcrullhwtx.supabase.co/;\
        proxy_http_version 1.1;\
        proxy_set_header Upgrade $http_upgrade;\
        proxy_set_header Connection "upgrade";\
        proxy_set_header Host dscadajjthbcrullhwtx.supabase.co;\
        proxy_set_header X-Real-IP $remote_addr;\
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\
        proxy_set_header X-Forwarded-Proto $scheme;\
        proxy_ssl_server_name on;\
        proxy_buffering off;\
        proxy_cache off;\
        proxy_read_timeout 86400s;\
        proxy_send_timeout 86400s;\
    }' "$conf"
    success "Supabase proxy добавлен"
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
  local domain="$1" email="$2"

  info "Запрос SSL-сертификата для ${domain}..."
  if certbot --nginx \
    -d "$domain" \
    --non-interactive \
    --agree-tos \
    --email "$email" \
    --redirect; then
    success "SSL-сертификат получен для ${domain}"
  else
    warn "Не удалось получить SSL для ${domain}. Попробуйте: certbot --nginx -d ${domain}"
  fi
}

get_certbot_email() {
  local email=""
  if [ -d /etc/letsencrypt/renewal ]; then
    email=$(grep -rh '^email' /etc/letsencrypt/renewal/*.conf 2>/dev/null | head -1 | sed 's/^email *= *//') || true
  fi
  echo "$email"
}

extract_server_name() {
  local conf="$1" name=""
  name=$(grep_safe 'server_name' "$conf" | head -1 | awk '{print $2}' | tr -d ';') || true
  echo "$name"
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

  # ── Save hash of current script before pull ──

  SCRIPT_HASH_BEFORE=$(md5sum "$INSTALL_DIR/install.sh" 2>/dev/null | awk '{print $1}') || true

  info "Загрузка обновлений..."
  git pull origin main

  # ── Re-exec if install.sh itself was updated ──

  SCRIPT_HASH_AFTER=$(md5sum "$INSTALL_DIR/install.sh" 2>/dev/null | awk '{print $1}') || true
  if [ -n "$SCRIPT_HASH_BEFORE" ] && [ -n "$SCRIPT_HASH_AFTER" ] && [ "$SCRIPT_HASH_BEFORE" != "$SCRIPT_HASH_AFTER" ]; then
    echo ""
    info "Скрипт обновления изменился — перезапуск с новой версией..."
    exec bash "$INSTALL_DIR/install.sh"
  fi

  info "Установка зависимостей..."
  npm ci --loglevel=error 2>&1

  info "Сборка T-POS..."
  npm run build 2>&1

  info "Сборка Wallet..."
  npm run build:wallet 2>&1

  chown -R www-data:www-data dist 2>/dev/null || true
  chown -R www-data:www-data dist-wallet 2>/dev/null || true

  success "Проект обновлён"

  # ── Ensure .env has all required keys ──

  echo ""
  info "Проверка .env..."

  ensure_env_key "$INSTALL_DIR/.env" "CLIENT_BOT_TOKEN" \
    "Telegram Bot Token для клиентского кошелька" "" "true"

  ensure_env_key "$INSTALL_DIR/.env" "WALLET_DOMAIN" \
    "Домен для клиентского кошелька" "$DEFAULT_WALLET_DOMAIN" "false"

  WALLET_DOMAIN=$(read_env_value "$INSTALL_DIR/.env" "WALLET_DOMAIN") || true
  WALLET_DOMAIN="${WALLET_DOMAIN:-$DEFAULT_WALLET_DOMAIN}"

  # ── Services ──

  echo ""
  setup_update_server "$INSTALL_DIR"
  ensure_nginx_proxy "$NGINX_CONF"
  ensure_supabase_proxy "$NGINX_CONF"
  ensure_supabase_proxy "$WALLET_NGINX_CONF"

  # ── Wallet Bot ──

  if [ -f "${INSTALL_DIR}/server/wallet-bot.js" ]; then
    setup_wallet_bot "$INSTALL_DIR"
  fi

  # ── Main Nginx ──

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
  fi

  # ── Wallet Nginx ──

  if [ ! -f "$WALLET_NGINX_CONF" ]; then
    echo ""
    info "Настройка nginx для ${WALLET_DOMAIN}..."
    setup_wallet_nginx "$WALLET_DOMAIN" "$INSTALL_DIR"
  else
    local_current=$(extract_server_name "$WALLET_NGINX_CONF")
    if [ -n "$WALLET_DOMAIN" ] && [ "$local_current" != "$WALLET_DOMAIN" ]; then
      info "Обновление домена wallet: ${local_current} → ${WALLET_DOMAIN}"
      setup_wallet_nginx "$WALLET_DOMAIN" "$INSTALL_DIR"
    fi
  fi

  fix_and_reload_nginx

  # ── SSL ──

  echo ""

  if [ -f "$NGINX_CONF" ] && ! grep -q 'ssl_certificate' "$NGINX_CONF" 2>/dev/null; then
    DOMAIN=$(extract_server_name "$NGINX_CONF")
    warn "SSL для ${DOMAIN} не настроен"
    echo -ne "${BOLD}Выпустить SSL-сертификат для ${DOMAIN}? (y/n): ${NC}"
    read -r yn || true
    if [ "$yn" = "y" ] || [ "$yn" = "Y" ]; then
      SSL_EMAIL=$(get_certbot_email)
      if [ -z "$SSL_EMAIL" ]; then
        echo -ne "${BOLD}Email для certbot: ${NC}"
        read -r SSL_EMAIL || true
      else
        info "Используем email: ${SSL_EMAIL}"
      fi
      if [ -n "$SSL_EMAIL" ] && [ -n "$DOMAIN" ]; then
        setup_ssl "$DOMAIN" "$SSL_EMAIL"
      fi
    fi
  fi

  if [ -f "$WALLET_NGINX_CONF" ] && ! grep -q 'ssl_certificate' "$WALLET_NGINX_CONF" 2>/dev/null; then
    warn "SSL для ${WALLET_DOMAIN} не настроен"
    echo -ne "${BOLD}Выпустить SSL-сертификат для ${WALLET_DOMAIN}? (y/n): ${NC}"
    read -r yn || true
    if [ "$yn" = "y" ] || [ "$yn" = "Y" ]; then
      SSL_EMAIL=$(get_certbot_email)
      if [ -z "$SSL_EMAIL" ]; then
        echo -ne "${BOLD}Email для certbot: ${NC}"
        read -r SSL_EMAIL || true
      else
        info "Используем email: ${SSL_EMAIL}"
      fi
      if [ -n "$SSL_EMAIL" ]; then
        setup_ssl "$WALLET_DOMAIN" "$SSL_EMAIL"
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
  echo -ne "${BOLD}  Telegram Bot Token (для T-POS): ${NC}"
  read -rs TG_BOT_TOKEN
  echo ""
  if [ -z "$TG_BOT_TOKEN" ]; then err "Обязательное поле"; fi
done

CLIENT_TG_TOKEN=""
echo -ne "${BOLD}  Client Bot Token (для TITAN Wallet, Enter — пропустить): ${NC}"
read -rs CLIENT_TG_TOKEN || true
echo ""

echo ""
info "Клиентский кошелёк:"

WALLET_DOMAIN=""
echo -ne "${BOLD}  Домен для кошелька [${DEFAULT_WALLET_DOMAIN}]: ${NC}"
read -r WALLET_DOMAIN || true
WALLET_DOMAIN="${WALLET_DOMAIN:-$DEFAULT_WALLET_DOMAIN}"

echo ""
echo -ne "${BOLD}Директория установки [${DEFAULT_DIR}]: ${NC}"
read -r INSTALL_DIR || true
INSTALL_DIR="${INSTALL_DIR:-$DEFAULT_DIR}"

echo ""
echo -e "${BOLD}─── Проверьте данные ───${NC}"
echo -e "  Домен T-POS:   ${GREEN}${DOMAIN}${NC}"
echo -e "  Домен Wallet:  ${GREEN}${WALLET_DOMAIN}${NC}"
echo -e "  Email:         ${GREEN}${EMAIL}${NC}"
echo -e "  Supabase:      ${GREEN}${SUPABASE_URL}${NC}"
echo -e "  Anon Key:      ${GREEN}${SUPABASE_ANON_KEY:0:20}...${NC}"
echo -e "  Bot Token:     ${GREEN}${TG_BOT_TOKEN:0:15}...${NC}"
if [ -n "$CLIENT_TG_TOKEN" ]; then
  echo -e "  Client Bot:    ${GREEN}${CLIENT_TG_TOKEN:0:15}...${NC}"
else
  echo -e "  Client Bot:    ${YELLOW}(пропущен)${NC}"
fi
echo -e "  Директория:    ${GREEN}${INSTALL_DIR}${NC}"
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
cat > .env <<ENVEOF
VITE_SUPABASE_URL=${SUPABASE_URL}
VITE_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
VITE_TELEGRAM_BOT_TOKEN=${TG_BOT_TOKEN}
CLIENT_BOT_TOKEN=${CLIENT_TG_TOKEN}
WALLET_DOMAIN=${WALLET_DOMAIN}
ENVEOF
success ".env создан"

info "npm ci..."
npm ci --loglevel=error 2>&1
success "Зависимости установлены"

info "Сборка T-POS..."
npm run build 2>&1

if [ ! -d "$INSTALL_DIR/dist" ]; then
  err "Сборка T-POS не удалась"
  exit 1
fi

info "Сборка TITAN Wallet..."
npm run build:wallet 2>&1

success "Проект собран"
chown -R www-data:www-data "$INSTALL_DIR/dist"
chown -R www-data:www-data "$INSTALL_DIR/dist-wallet" 2>/dev/null || true

setup_update_server "$INSTALL_DIR"

# ── Step 4: Nginx ────────────────────────────

echo ""
echo -e "${BOLD}${YELLOW}▸ Шаг 4/5: Nginx${NC}"
echo ""

setup_nginx "$DOMAIN" "$INSTALL_DIR"
setup_wallet_nginx "$WALLET_DOMAIN" "$INSTALL_DIR"
fix_and_reload_nginx

setup_wallet_bot "$INSTALL_DIR"

# ── Step 5: SSL ──────────────────────────────

echo ""
echo -e "${BOLD}${YELLOW}▸ Шаг 5/5: SSL-сертификаты${NC}"
echo ""

echo -ne "${BOLD}Выпустить SSL-сертификаты? (y/n): ${NC}"
read -r yn
if [ "$yn" = "y" ] || [ "$yn" = "Y" ]; then
  setup_ssl "$DOMAIN" "$EMAIL"
  setup_ssl "$WALLET_DOMAIN" "$EMAIL"
else
  warn "SSL пропущен"
  warn "  Основной:  certbot --nginx -d ${DOMAIN} --email ${EMAIL}"
  warn "  Wallet:    certbot --nginx -d ${WALLET_DOMAIN} --email ${EMAIL}"
fi

# ── Done ─────────────────────────────────────

echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${GREEN}║        Установка завершена!              ║${NC}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}T-POS:${NC}    https://${DOMAIN}"
echo -e "  ${BOLD}Wallet:${NC}   https://${WALLET_DOMAIN}"
echo -e "  ${BOLD}Файлы:${NC}    ${INSTALL_DIR}"
echo ""
echo -e "  ${CYAN}Обновление:${NC}  sudo bash ${INSTALL_DIR}/install.sh"
echo ""
