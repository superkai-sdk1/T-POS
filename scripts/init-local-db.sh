#!/bin/bash

# Инициализация локальной PostgreSQL БД для T-POS
# Использование: ./scripts/init-local-db.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Инициализация локальной PostgreSQL БД ==="

# Загружаем .env
if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  source "$PROJECT_DIR/.env"
  set +a
fi

# Проверяем переменные окружения
if [ -z "$POSTGRES_PASSWORD" ]; then
  echo "Ошибка: POSTGRES_PASSWORD не установлен в .env"
  exit 1
fi

# Запускаем Docker Compose
echo "Запуск PostgreSQL и MinIO..."
cd "$PROJECT_DIR"
docker-compose up -d postgres minio

# Ждем готовности PostgreSQL
echo "Ожидание готовности PostgreSQL..."
for i in {1..30}; do
  if docker exec tpos-postgres pg_isready -U tpos > /dev/null 2>&1; then
    echo "PostgreSQL готов"
    break
  fi
  echo "Ожидание... ($i/30)"
  sleep 2
done

# Применяем схему и данные
echo "Применение схемы и данных..."
docker exec -i tpos-postgres psql -U tpos -d tpos < "$PROJECT_DIR/supabase-export/local-schema.sql"
docker exec -i tpos-postgres psql -U tpos -d tpos < "$PROJECT_DIR/supabase-export/local-data.sql"

echo "=== Инициализация завершена ==="
echo "PostgreSQL: http://localhost:5432"
echo "MinIO Console: http://localhost:9001"
echo "MinIO API: http://localhost:9000"
echo ""
echo "Для инициализации MinIO bucket запустите:"
echo "  node scripts/init-minio.mjs"
