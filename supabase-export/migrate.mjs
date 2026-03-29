#!/usr/bin/env node
/**
 * Автоматическая миграция Supabase: schema.sql + data-insert.sql
 *
 * Требуется в .env:
 *   SUPABASE_DB_URL - полная строка подключения (рекомендуется)
 *   Или: SUPABASE_DB_PASSWORD + VITE_SUPABASE_URL
 *
 * Получить: Supabase Dashboard → Settings → Database → Connection string (URI)
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Загрузка .env
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, 'utf8');
  for (const line of env.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

function getDbUrl() {
  if (process.env.SUPABASE_DB_URL) {
    return process.env.SUPABASE_DB_URL;
  }
  const password = process.env.SUPABASE_DB_PASSWORD;
  const apiUrl = process.env.VITE_SUPABASE_URL;
  if (!password || !apiUrl) {
    console.error('Ошибка: нужен SUPABASE_DB_URL или (SUPABASE_DB_PASSWORD + VITE_SUPABASE_URL) в .env');
    console.error('');
    console.error('Получить: Supabase Dashboard → Settings → Database → Connection string (URI)');
    process.exit(1);
  }
  const projectRef = apiUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  if (!projectRef) {
    console.error('Не удалось извлечь project ref из VITE_SUPABASE_URL');
    process.exit(1);
  }
  const region = process.env.SUPABASE_DB_REGION || 'eu-west-1';
  const pooler = process.env.SUPABASE_DB_POOLER || 'aws-1';
  // Пароль без encodeURIComponent — pg сам обработает спецсимволы
  const safePass = password.includes('@') || password.includes(':') ? encodeURIComponent(password) : password;
  return `postgresql://postgres.${projectRef}:${safePass}@${pooler}-${region}.pooler.supabase.com:5432/postgres`;
}

async function main() {
  const dbUrl = getDbUrl();
  console.log('=== Миграция Supabase ===');
  console.log('Подключение к БД...');

  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    // 1. Схема — выполняем целиком (PostgreSQL поддерживает несколько statements)
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8').replace(/\\restrict.*\n|\\unrestrict.*\n/g, '');
    console.log('Шаг 1/2: Применение схемы (schema.sql)...');
    await client.query(schema);
    console.log('Схема применена.');

    // 2. Данные
    const dataPath = path.join(__dirname, 'data-insert.sql');
    if (fs.existsSync(dataPath)) {
      console.log('Шаг 2/2: Импорт данных (data-insert.sql)...');
      const data = fs.readFileSync(dataPath, 'utf8');
      await client.query(data);
      console.log('Данные импортированы.');
    } else {
      console.log('Шаг 2/2: data-insert.sql не найден, пропуск.');
    }

    console.log('');
    console.log('=== Миграция завершена ===');
  } catch (err) {
    console.error('Ошибка:', err.message);
    if (err.code === '28P01') {
      console.error('');
      console.error('Проверьте пароль БД: Supabase Dashboard → Settings → Database → Database password');
      console.error('Или добавьте SUPABASE_DB_URL с полной строкой подключения из Dashboard.');
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
