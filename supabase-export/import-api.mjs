#!/usr/bin/env node
/**
 * Миграция через Supabase Management API (POST /database/query)
 */
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
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

if (!PROJECT_REF || !TOKEN) {
  console.error('Нужны VITE_SUPABASE_URL и SUPABASE_ACCESS_TOKEN в .env');
  process.exit(1);
}

const API = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

async function runQuery(sql) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API ${res.status}: ${err}`);
  }
  return res.json();
}

async function migrate() {
  console.log('Миграция через Supabase Management API...\n');

  const stripRestrict = (s) =>
    s
      .split('\n')
      .filter((l) => !l.startsWith('\\restrict') && !l.startsWith('\\unrestrict'))
      .join('\n');

  const schema = stripRestrict(readFileSync(join(__dirname, 'schema.sql'), 'utf8'));
  const data = stripRestrict(readFileSync(join(__dirname, 'data.sql'), 'utf8'));

  console.log('Шаг 1/2: Применение схемы...');
  try {
    await runQuery(schema);
    console.log('  ✓ Схема применена.\n');
  } catch (e) {
    if (e.message?.includes('already exists')) console.log('  (частично, продолжаем)');
    else throw e;
  }

  console.log('Шаг 2/2: Импорт данных...');
  await runQuery(data);
  console.log('  ✓ Данные импортированы.\n');
  console.log('=== Миграция завершена ===');
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
