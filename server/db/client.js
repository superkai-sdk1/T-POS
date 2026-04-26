import { Pool } from 'pg';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../../.env') });

// Подключение к локальному PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  ssl: false, // Локальный PostgreSQL в Docker не требует SSL
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client', err);
  process.exit(-1);
});

// Проверка соединения
pool.connect((err, client, release) => {
  if (err) {
    console.error('[DB] Connection error:', err.message);
  } else {
    console.log('[DB] Connected to PostgreSQL');
    release();
  }
});

export default pool;
