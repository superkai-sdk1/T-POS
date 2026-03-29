#!/usr/bin/env node
/**
 * Миграция через Supabase Management API (не требует пароля БД)
 * Требуется: SUPABASE_ACCESS_TOKEN + VITE_SUPABASE_URL в .env
 */

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

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF
  || process.env.VITE_SUPABASE_URL?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

if (!PROJECT_REF || !ACCESS_TOKEN) {
  console.error('Нужны SUPABASE_ACCESS_TOKEN и VITE_SUPABASE_URL в .env');
  process.exit(1);
}

const API_URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

async function runQuery(sql) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

// Разбиваем SQL на statements (по ; в конце строки, учитывая строки и комментарии)
function splitStatements(sql) {
  const statements = [];
  let current = [];
  const lines = sql.split('\n');
  for (const line of lines) {
    current.push(line);
    const t = line.trim();
    if (t && t.endsWith(';') && !t.startsWith('--')) {
      const stmt = current.join('\n').trim();
      if (stmt.length > 5) statements.push(stmt);
      current = [];
    }
  }
  if (current.length > 0) {
    const stmt = current.join('\n').trim();
    if (stmt.length > 5) statements.push(stmt);
  }
  return statements;
}

function isSkipError(err) {
  const m = err.message || '';
  return /42710|already exists|duplicate key|does not exist/.test(m);
}

async function runStatements(statements, label, showProgress = true) {
  let ok = 0, skip = 0;
  for (const stmt of statements) {
    if (stmt.length < 10) continue;
    try {
      await runQuery(stmt);
      ok++;
      if (showProgress && ok % 30 === 0) process.stdout.write('.');
    } catch (e) {
      if (isSkipError(e)) skip++;
      else throw e;
    }
  }
  return { ok, skip };
}

async function main() {
  console.log('=== Миграция Supabase (Management API) ===');
  console.log(`Проект: ${PROJECT_REF}`);
  console.log('');

  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8').replace(/\\restrict.*\n|\\unrestrict.*\n/g, '');

  console.log('Шаг 1/2: Применение схемы...');
  try {
    await runQuery(schema);
    console.log('Схема применена.');
  } catch (err) {
    if (isSkipError(err) || err.message.includes('42710')) {
      console.log('Выполняем по частям (часть уже применена)...');
      const statements = splitStatements(schema);
      const { ok, skip } = await runStatements(statements, 'schema');
      console.log(`\nСхема: ${ok} применено, ${skip} пропущено (уже есть).`);
    } else {
      throw err;
    }
  }

  const dataPath = path.join(__dirname, 'data-insert.sql');
  if (fs.existsSync(dataPath)) {
    console.log('Шаг 2/2: Импорт данных...');
    const data = fs.readFileSync(dataPath, 'utf8');
    try {
      await runQuery(data);
      console.log('Данные импортированы.');
    } catch (err) {
      if (err.message.includes('413') || err.message.includes('too large')) {
        const statements = splitStatements(data);
        const { ok, skip } = await runStatements(statements, 'data');
        console.log(`\nДанные: ${ok} импортировано, ${skip} пропущено.`);
      } else if (isSkipError(err)) {
        const statements = splitStatements(data);
        const { ok, skip } = await runStatements(statements, 'data');
        console.log(`\nДанные: ${ok} импортировано, ${skip} пропущено.`);
      } else {
        throw err;
      }
    }
  }

  console.log('');
  console.log('=== Миграция завершена ===');
}

main().catch((err) => {
  console.error('Ошибка:', err.message);
  process.exit(1);
});
