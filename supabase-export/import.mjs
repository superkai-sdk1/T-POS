#!/usr/bin/env node
/**
 * Миграция через Node.js pg (обход проблем psql с IPv6/pooler)
 */
import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Load .env
try {
  const env = readFileSync(join(__dirname, '../.env'), 'utf8');
  for (const line of env.split('\n')) {
    const idx = line.indexOf('=');
    if (idx > 0 && !line.startsWith('#')) {
      const k = line.slice(0, idx).trim();
      const v = line.slice(idx + 1).trim();
      if (k) process.env[k] = v;
    }
  }
} catch (_) {}

const PROJECT_REF = process.env.VITE_SUPABASE_URL?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
const REGION = process.env.SUPABASE_DB_REGION || 'eu-west-1';

if (!PROJECT_REF || !PASSWORD) {
  console.error('Нужны VITE_SUPABASE_URL и SUPABASE_DB_PASSWORD в .env');
  process.exit(1);
}

// Pooler session (5432) и transaction (6543)
const pooler5432 = `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(PASSWORD)}@aws-0-${REGION}.pooler.supabase.com:5432/postgres`;
const pooler6543 = `postgresql://postgres.${PROJECT_REF}:${encodeURIComponent(PASSWORD)}@aws-0-${REGION}.pooler.supabase.com:6543/postgres`;
const directUrl = `postgresql://postgres:${encodeURIComponent(PASSWORD)}@db.${PROJECT_REF}.supabase.co:5432/postgres`;

async function run(sql, client, label) {
  try {
    await client.query(sql);
    console.log(`  ✓ ${label}`);
  } catch (e) {
    if (e.message?.includes('already exists')) return;
    throw e;
  }
}

async function migrate() {
  const urls = [pooler5432, pooler6543, directUrl];
  let client;

  for (const url of urls) {
    try {
      console.log('Подключение...');
      client = new pg.Client({
        connectionString: url,
        ssl: { rejectUnauthorized: false },
      });
      await client.connect();
      console.log('Подключено.\n');
      break;
    } catch (e) {
      console.log(`  Ошибка: ${e.message?.slice(0, 60)}...`);
      if (client) await client.end().catch(() => {});
      client = null;
    }
  }

  if (!client) {
    console.error('Не удалось подключиться ни к pooler, ни к direct.');
    process.exit(1);
  }

  try {
    console.log('Шаг 1/2: Схема...');
    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8')
      .split('\n')
      .filter((l) => !l.startsWith('\\restrict'))
      .join('\n');
    await client.query(schema);
    console.log('  Схема применена.\n');

    console.log('Шаг 2/2: Данные...');
    const data = readFileSync(join(__dirname, 'data.sql'), 'utf8')
      .split('\n')
      .filter((l) => !l.startsWith('\\restrict'))
      .join('\n');
    await client.query(data);
    console.log('  Данные импортированы.\n');
    console.log('=== Миграция завершена ===');
  } finally {
    await client.end();
  }
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
