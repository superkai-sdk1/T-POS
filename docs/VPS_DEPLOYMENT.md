# Развертывание T-POS на VPS (Миграция с Supabase)

## Обзор
Этот документ описывает процесс полной миграции с Supabase на локальный PostgreSQL + MinIO на вашем VPS.

## Предварительные требования
- VPS с Ubuntu 20.04+ или Debian 11+
- Docker и Docker Compose установлены
- Доступ к VPS по SSH
- Домены настроены (titanpos.ru, wallet.titanpos.ru)

## Шаг 1: Подготовка VPS

### Установка Docker и Docker Compose
```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Установка Docker Compose
sudo apt install docker-compose -y

# Добавление пользователя в группу docker
sudo usermod -aG docker $USER
newgrp docker
```

### Настройка Firewall
```bash
# Разрешить SSH, HTTP, HTTPS
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## Шаг 2: Развертывание приложения

### Клонирование и настройка
```bash
# Клонирование репозитория
git clone <your-repo-url> /var/www/tpos
cd /var/www/tpos

# Копирование .env.example в .env
cp .env.example .env

# Редактирование .env
nano .env
```

### Настройка переменных окружения в .env
```bash
# Удалите или закомментируйте Supabase переменные
# VITE_SUPABASE_URL=...
# VITE_SUPABASE_ANON_KEY=...

# Настройте локальный Postgres
POSTGRES_PASSWORD=<сильный_пароль>
DATABASE_URL=postgresql://tpos:<сильный_пароль>@localhost:5432/tpos

# Настройте MinIO
MINIO_ROOT_USER=<имя_пользователя>
MINIO_ROOT_PASSWORD=<сильный_пароль>
MINIO_ACCESS_KEY=<access_key>
MINIO_SECRET_KEY=<secret_key>
MINIO_ENDPOINT=localhost
MINIO_PORT=9000

# Оставьте остальные переменные без изменений
TELEGRAM_BOT_TOKEN=<ваш_токен>
CLIENT_BOT_TOKEN=<ваш_токен>
API_SECRET=<секретный_ключ>
OWNER_CHAT_IDS=<ваш_chat_id>
POLZA_AI_API_KEY=<ключ_если_используется>
```

### Запуск Docker Compose
```bash
# Запуск Postgres и MinIO
docker-compose up -d

# Проверка статуса
docker-compose ps

# Просмотр логов
docker-compose logs -f postgres
docker-compose logs -f minio
```

## Шаг 3: Инициализация MinIO

```bash
# Установка зависимостей для скрипта инициализации
npm install @aws-sdk/client-s3 dotenv

# Запуск инициализации
node scripts/init-minio.mjs
```

## Шаг 4: Установка зависимостей и сборка

```bash
# Установка зависимостей
npm install

# Установка pg клиента для локального Postgres
npm install pg

# Сборка проекта
npm run build
npm run build:wallet
```

## Шаг 5: Настройка Nginx

### Конфигурация для titanpos.ru
```nginx
server {
    listen 80;
    server_name titanpos.ru;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Конфигурация для wallet.titanpos.ru
```nginx
server {
    listen 80;
    server_name wallet.titanpos.ru;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Применение конфигурации
```bash
# Создание symbolic link
sudo ln -s /var/www/tpos/nginx/titanpos.conf /etc/nginx/sites-available/titanpos.ru
sudo ln -s /var/www/tpos/nginx/wallet.conf /etc/nginx/sites-available/wallet.titanpos.ru

# Активация
sudo ln -s /etc/nginx/sites-available/titanpos.ru /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/wallet.titanpos.ru /etc/nginx/sites-enabled/

# Проверка и перезагрузка
sudo nginx -t
sudo systemctl reload nginx
```

## Шаг 6: Настройка SSL с Let's Encrypt

```bash
# Установка certbot
sudo apt install certbot python3-certbot-nginx -y

# Получение сертификатов
sudo certbot --nginx -d titanpos.ru
sudo certbot --nginx -d wallet.titanpos.ru

# Автоматическое обновление
sudo certbot renew --dry-run
```

## Шаг 7: Запуск серверов

```bash
# Запуск update-server
node server/update-server.js &

# Запуск wallet-bot
node server/wallet-bot.js &

# Запуск admin-bot (если используется)
node server/admin-bot.js &
```

### Использование PM2 для управления процессами
```bash
# Установка PM2
npm install -g pm2

# Запуск процессов
pm2 start server/update-server.js --name tpos-api
pm2 start server/wallet-bot.js --name wallet-bot
pm2 start server/admin-bot.js --name admin-bot

# Сохранение конфигурации
pm2 save

# Автозапуск при старте системы
pm2 startup
```

## Шаг 8: Проверка работоспособности

### Проверка базы данных
```bash
# Подключение к Postgres
docker exec -it tpos-postgres psql -U tpos -d tpos

# Проверка таблиц
\dt

# Проверка данных
SELECT COUNT(*) FROM profiles;
SELECT COUNT(*) FROM inventory;
SELECT COUNT(*) FROM checks;
```

### Проверка MinIO
- Откройте http://your-vps-ip:9001
- Войдите с MINIO_ROOT_USER и MINIO_ROOT_PASSWORD
- Убедитесь, что bucket 'client-photos' создан

### Проверка API
```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/inventory
```

## Резервное копирование

### База данных
```bash
# Создание бэкапа
docker exec tpos-postgres pg_dump -U tpos tpos > backup_$(date +%Y%m%d).sql

# Восстановление из бэкапа
docker exec -i tpos-postgres psql -U tpos tpos < backup_20240426.sql
```

### MinIO
```bash
# Бэкап данных MinIO
docker run --rm --volumes-from tpos-minio -v $(pwd):/backup ubuntu tar czf /backup/minio_backup_$(date +%Y%m%d).tar.gz /data
```

## Мониторинг

### Просмотр логов
```bash
# Docker Compose
docker-compose logs -f

# PM2
pm2 logs

# Nginx
sudo tail -f /var/log/nginx/error.log
```

### Проверка ресурсов
```bash
htop
df -h
docker stats
```

## Устранение неполадок

### Postgres не запускается
```bash
# Проверка логов
docker-compose logs postgres

# Перезапуск
docker-compose restart postgres
```

### MinIO недоступен
```bash
# Проверка портов
sudo netstat -tulpn | grep 9000

# Перезапуск
docker-compose restart minio
```

### API не отвечает
```bash
# Проверка PM2
pm2 status
pm2 logs tpos-api

# Перезапуск
pm2 restart tpos-api
```

## Следующие шаги после миграции

После успешного развертывания:
1. Протестируйте все функции приложения
2. Проверьте работу ботов
3. Убедитесь, что загрузка файлов работает (MinIO)
4. Проверьте realtime функциональность (WebSocket)
5. Удалите старые Supabase переменные из .env
6. Закройте доступ к Supabase Dashboard (если больше не нужен)
