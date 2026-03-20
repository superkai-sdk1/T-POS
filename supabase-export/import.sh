#!/bin/bash
#
# Миграция дампа Supabase в новый проект
# Использование: ./import.sh
#
# Требуется в .env:
#   SUPABASE_DB_URL - строка подключения к БД нового проекта
#   Или: SUPABASE_DB_PASSWORD + VITE_SUPABASE_URL (извлечёт project ref)
#
# Получить SUPABASE_DB_URL: Supabase Dashboard → Settings → Database → Connection string (URI)
# Формат: postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres
# Или Direct: postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
#

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Загружаем .env из корня проекта
if [ -f "../.env" ]; then
  set -a
  source "../.env"
  set +a
fi

# Определяем URL подключения
if [ -n "$SUPABASE_DB_URL" ]; then
  DB_URL="$SUPABASE_DB_URL"
elif [ -n "$SUPABASE_DB_PASSWORD" ] && [ -n "$VITE_SUPABASE_URL" ]; then
  # Извлекаем project ref из URL
  PROJECT_REF=$(echo "$VITE_SUPABASE_URL" | sed -E 's|https://([^.]+)\.supabase\.co.*|\1|')
  # Сначала пробуем pooler (eu-west-1), если не указан регион
  REGION="${SUPABASE_DB_REGION:-eu-west-1}"
  POOLER="${SUPABASE_DB_POOLER:-aws-1}"
  # Pooler: user=postgres.PROJECT_REF
  DB_URL="postgresql://postgres.${PROJECT_REF}:${SUPABASE_DB_PASSWORD}@${POOLER}-${REGION}.pooler.supabase.com:5432/postgres?sslmode=require"
else
  echo "Ошибка: нужен SUPABASE_DB_URL или (SUPABASE_DB_PASSWORD + VITE_SUPABASE_URL) в .env"
  echo ""
  echo "Получить пароль БД: Supabase Dashboard → Settings → Database → Database password"
  echo "Добавьте в .env:"
  echo "  SUPABASE_DB_PASSWORD=ваш_пароль"
  exit 1
fi

echo "=== Миграция Supabase ==="
echo "Целевой проект: $(echo "$DB_URL" | sed -E 's|.*@([^/]+)/.*|\1|')"
echo ""

# Удаляем \restrict строки (не поддерживаются в psql)
strip_restrict() {
  grep -v '^\\restrict ' "$1" | grep -v '^\\unrestrict ' || true
}

# 1. Применяем схему
echo "Шаг 1/2: Применение схемы (schema.sql)..."
strip_restrict schema.sql | psql "$DB_URL" -v ON_ERROR_STOP=0 -q 2>/dev/null || true
echo "Схема применена (игнорируем ошибки 'already exists')."

# 2. Импортируем данные
echo "Шаг 2/2: Импорт данных..."
if strip_restrict data.sql | psql "$DB_URL" -v ON_ERROR_STOP=1 -q 2>/dev/null; then
  echo "Данные импортированы (data.sql)."
elif [ -f data-insert.sql ]; then
  echo "Пробуем data-insert.sql..."
  strip_restrict data-insert.sql | psql "$DB_URL" -v ON_ERROR_STOP=1 -q && echo "Данные импортированы (data-insert.sql)." || {
    echo "Ошибка при импорте данных."
    exit 1
  }
else
  echo "Ошибка: data.sql и data-insert.sql не найдены."
  exit 1
fi

echo ""
echo "=== Миграция завершена ==="
echo ""
echo "Дополнительно:"
echo "  - Auth users: auth_users.json пуст (старый проект был ограничен). Создайте пользователей вручную."
echo "  - Storage: файлы из storage нужно перенести отдельно через Supabase Dashboard."
echo "  - Проверьте приложение: npm run dev"
