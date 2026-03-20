# Миграция данных в новый Supabase проект

Перенос дампа из старого проекта (dscadajjthbcrullhwtx) в новый.

## Статус

- **Схема** — применена через Supabase Management API
- **Данные** — требуют прямого подключения к БД (psql или pg)

Прямое подключение (psql) может не работать из-за сети (IPv6, firewall). В этом случае:
1. Запустите миграцию с машины с доступом к Supabase (например, облачный сервер)
2. Или используйте **Supabase Dashboard → SQL Editor**: вставьте содержимое `data-insert.sql` и выполните (по частям, если большой объём)

**Важно:** `data.sql` использует формат `COPY ... FROM stdin`, который работает только с psql. Для SQL Editor нужен `data-insert.sql` (INSERT-запросы). Сгенерировать его: `node copy-to-insert.mjs`

## Подготовка

### 1. Пароль базы данных

Получите пароль в Supabase Dashboard нового проекта:
**Settings → Database → Database password** (или Reset password)

### 2. Добавьте в `.env` в корне проекта:

```env
# Пароль от БД нового проекта (из Settings → Database)
SUPABASE_DB_PASSWORD=ваш_пароль_от_базы_данных
```

Или полную строку подключения:

```env
SUPABASE_DB_URL=postgresql://postgres:[PASSWORD]@db.nazkpapbbedkkglxyows.supabase.co:5432/postgres
```

### 3. Установите psql (если нет)

- **macOS**: `brew install libpq` или уже есть с Postgres
- **Проверка**: `psql --version`

## Запуск миграции

```bash
cd supabase-export
chmod +x import.sh
./import.sh
```

Скрипт:
1. Применит схему (таблицы, типы, функции, RLS)
2. Импортирует все данные из data.sql

## Варианты

### Новый проект пустой
Запустите `./import.sh` — схема и данные будут применены.

### В проекте уже есть схема из migrations
Если вы делали `supabase db push`, схема может частично существовать. Скрипт попытается создать объекты; ошибки «already exists» допустимы. Данные импортируются после.

### Только данные (схема уже есть)
Отредактируйте `import.sh` — закомментируйте блок «Шаг 1» (применение schema.sql).

## После миграции

1. **Auth users**: `auth_users.json` пуст (старый проект был ограничен). Создайте пользователей заново через Supabase Auth или приложение.

2. **Storage**: Файлы (фото, документы) нужно перенести отдельно:
   - Supabase Dashboard → Storage
   - Создайте бакеты как в старом проекте
   - Загрузите файлы вручную или через API

3. **Проверка**: Запустите приложение `npm run dev` и проверьте работу.

## Структура дампа

| Файл | Описание |
|------|----------|
| schema.sql | Схема БД (таблицы, типы, RLS, политики) |
| data.sql | Данные (COPY формат, для psql) |
| data-insert.sql | Данные (INSERT формат, для SQL Editor) |
| copy-to-insert.mjs | Конвертер COPY → INSERT |
| auth_dump.sql | Схема auth (не запускать на новом проекте) |
| storage_dump.sql | Метаданные storage |
| data/*.json | Экспорт через REST API (частично пустые) |
