import http from 'node:http';
import { spawn, execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// Импорт локального DB слоя вместо Supabase
import { sbSelect, sbUpdate, getAIContext } from './db/supabase-adapter.js';
import { initWebSocketServer, setupPostgresNotify } from './websocket-server.js';
import db from './db/index.js';
import queries from './db/queries.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = join(__dirname, '..');
const PORT = 3100;

// Load .env file into process.env
try {
  const envFile = readFileSync(join(PROJECT_DIR, '.env'), 'utf-8');
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx > 0) {
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (key) process.env[key] = val;
    }
  }
} catch { }

function getVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(PROJECT_DIR, 'package.json'), 'utf-8'));
    return pkg.version || '0.0.0';
  } catch { return '0.0.0'; }
}

const API_SECRET = process.env.API_SECRET || '';

function cors(res) {
  const allowedOrigin = process.env.POS_DOMAIN
    ? `https://${process.env.POS_DOMAIN}`
    : '*';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function checkAuth(req, res) {
  if (!API_SECRET) return true;
  const auth = req.headers['authorization'] || '';
  if (auth === `Bearer ${API_SECRET}`) return true;
  json(res, { error: 'Unauthorized' }, 401);
  return false;
}

function json(res, data, status = 200) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

let updateInProgress = false;

const MAX_BODY_SIZE = 1024 * 1024; // 1 MB

// Supabase функции теперь импортируются из ./db/supabase-adapter.js

// --- Telegram helper (server-side only) ---
function getTelegramToken() {
  return process.env.TELEGRAM_BOT_TOKEN || process.env.VITE_TELEGRAM_BOT_TOKEN || '';
}

async function sendTelegram(chatId, text) {
  const token = getTelegramToken();
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
  } catch { /* ignore */ }
}

// --- Password/PIN hashing helpers ---
const BCRYPT_ROUNDS = 10;
const isBcrypt = (hash) => hash && (hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$'));

async function verifyAndMigrate(table, id, field, plainValue, storedHash) {
  // db уже импортирован в начале файла
  
  if (isBcrypt(storedHash)) {
    return bcrypt.compareSync(plainValue, storedHash);
  }
  // Plain text comparison (legacy) — migrate to bcrypt on success
  if (storedHash === plainValue) {
    const hashed = bcrypt.hashSync(plainValue, BCRYPT_ROUNDS);
    await db.update(table, { id }, { [field]: hashed });
    return true;
  }
  return false;
}

let _cachedInfo = null;
let _cachedInfoAt = 0;
const INFO_CACHE_MS = 5 * 60 * 1000; // 5 minutes

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) { req.destroy(); reject(new Error('Body too large')); return; }
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/system/info' && req.method === 'GET') {
    if (_cachedInfo && (Date.now() - _cachedInfoAt) < INFO_CACHE_MS) {
      json(res, _cachedInfo);
      return;
    }
    let hash = '?', date = '?', branch = '?', behindCount = 0;
    try {
      hash = execSync('git rev-parse --short HEAD', { cwd: PROJECT_DIR }).toString().trim();
      date = execSync('git log -1 --format=%ci', { cwd: PROJECT_DIR }).toString().trim();
      branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: PROJECT_DIR }).toString().trim();
      execSync('git fetch origin --quiet', { cwd: PROJECT_DIR, timeout: 15000 });
      const behind = execSync(`git rev-list HEAD..origin/${branch} --count`, { cwd: PROJECT_DIR }).toString().trim();
      behindCount = parseInt(behind) || 0;
    } catch { }
    _cachedInfo = {
      version: getVersion(),
      git: { hash, date, branch },
      updateAvailable: behindCount > 0,
      behindCount,
      nodeVersion: process.version,
    };
    _cachedInfoAt = Date.now();
    json(res, _cachedInfo);
    return;
  }

  if (url.pathname === '/api/system/update' && req.method === 'POST') {
    if (!checkAuth(req, res)) return;
    if (updateInProgress) {
      json(res, { error: 'Обновление уже выполняется' }, 409);
      return;
    }

    updateInProgress = true;
    cors(res);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const send = (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const steps = [
      { label: 'Очистка неотслеживаемых файлов', cmd: 'git', args: ['clean', '-fd', '-e', '.env', '-e', '.env.local'] },
      { label: 'Загрузка обновлений с сервера', cmd: 'git', args: ['fetch', 'origin'] },
      { label: 'Сброс до актуальной версии', cmd: 'git', args: ['reset', '--hard', 'origin/main'] },
      { label: 'Установка зависимостей', cmd: 'npm', args: ['ci', '--include=dev', '--loglevel=error'] },
      { label: 'Проверка ключей и токенов', cmd: 'bash', args: ['scripts/check-env.sh'] },
      { label: 'Сборка проекта', cmd: 'npm', args: ['run', 'build'] },
      { label: 'Сборка Wallet', cmd: 'npm', args: ['run', 'build:wallet'] },
    ];

    let stepIdx = 0;

    const runStep = () => {
      if (stepIdx >= steps.length) {
        try { execSync('chown -R www-data:www-data dist', { cwd: PROJECT_DIR }); } catch { }
        try { execSync('chown -R www-data:www-data dist-wallet', { cwd: PROJECT_DIR }); } catch { }
        try { execSync('systemctl restart tpos-wallet-bot', { timeout: 5000 }); } catch { }
        try { execSync('systemctl restart tpos-admin-bot', { timeout: 5000 }); } catch { }
        try { execSync('systemctl restart tpos-update', { timeout: 5000 }); } catch { }
        send({ type: 'complete', message: 'Обновление завершено. Локальная PostgreSQL БД готова к использованию. Для запуска: docker-compose up -d' });
        res.end();
        updateInProgress = false;
        return;
      }

      const step = steps[stepIdx];
      send({ type: 'step', step: stepIdx + 1, total: steps.length, label: step.label });

      const cleanEnv = { ...process.env };
      delete cleanEnv.NODE_ENV;
      const proc = spawn(step.cmd, step.args, {
        cwd: PROJECT_DIR,
        env: cleanEnv,
        shell: true,
      });

      proc.stdout.on('data', (chunk) => {
        send({ type: 'log', text: chunk.toString().trim() });
      });
      proc.stderr.on('data', (chunk) => {
        send({ type: 'log', text: chunk.toString().trim() });
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          send({ type: 'error', message: `Ошибка: "${step.label}" (код ${code})` });
          res.end();
          updateInProgress = false;
          return;
        }
        send({ type: 'step_done', step: stepIdx + 1, label: step.label });
        stepIdx++;
        runStep();
      });
    };

    runStep();
    return;
  }

  if (url.pathname === '/api/ai' && req.method === 'POST') {
    if (!checkAuth(req, res)) return;
    readBody(req).then(async (body) => {
      try {
        const { messages, context, draft } = JSON.parse(body);
        const POLZA_KEY = process.env.POLZA_AI_API_KEY;
        const aiUrl = 'https://polza.ai/api/v1/chat/completions';

        // --- Fetch compact database context from local PostgreSQL (cached 60s) ---
        let dbContext = '';
        const AI_CACHE_TTL = 60_000; // 60 seconds
        if (!global._aiContextCache) global._aiContextCache = { text: '', ts: 0 };
        const cacheValid = Date.now() - global._aiContextCache.ts < AI_CACHE_TTL && global._aiContextCache.text;
        if (cacheValid) {
          dbContext = global._aiContextCache.text;
        } else {
          // Используем локальный db слой через sbSelect
          const [
            profiles, checks, checkItems, inventory,
            expenses, supplies, cashOps, shifts, events,
            refunds, salaryPayments, supplyItems,
            certificates, spaces,
          ] = await Promise.all([
            sbSelect('profiles', 'select=id,nickname,role,balance,bonus_points,client_tier,is_resident,created_at,deleted_at&order=created_at.desc&limit=500'),
            sbSelect('checks', 'select=id,player_id,total_amount,payment_method,bonus_used,closed_at,staff_id&status=eq.closed&order=closed_at.desc&limit=500'),
            sbSelect('check_items', 'select=check_id,item_id,quantity,price_at_time&limit=3000'),
            sbSelect('inventory', 'select=id,name,category,price,stock_quantity,is_active&order=name'),
            sbSelect('expenses', 'select=category,amount,expense_date&order=expense_date.desc&limit=200'),
            sbSelect('supplies', 'select=total_cost,created_at&order=created_at.desc&limit=100'),
            sbSelect('cash_operations', 'select=type,amount,created_at&order=created_at.desc&limit=100'),
            sbSelect('shifts', 'select=status,cash_start,cash_end,opened_at,closed_at&order=opened_at.desc&limit=20'),
            sbSelect('events', `status=in.(planned,active)&date=gte.${new Date(Date.now() + 3 * 3600000).toISOString().split('T')[0]}&order=date.asc&limit=20`),
            sbSelect('refunds', 'select=check_id,total_amount,created_at&order=created_at.desc&limit=100'),
            sbSelect('salary_payments', 'select=amount,created_at,payment_method,profile_id&order=created_at.desc&limit=50'),
            sbSelect('supply_items', 'select=item_id,cost_per_unit,quantity&limit=500'),
            sbSelect('certificates', 'select=nominal,balance,is_used&limit=500'),
            sbSelect('spaces', 'select=name,type,hourly_rate&is_active=eq.true'),
          ]);

          // Pre-aggregate data to keep context compact
          const staff = profiles.filter((p) => p.role === 'owner' || p.role === 'staff');
          const clients = profiles.filter((p) => p.role === 'client' && !p.deleted_at);
          const debtors = clients.filter((p) => p.balance < 0);

          // Себестоимость из поставок
          const supplyCostAgg = {};
          for (const si of supplyItems) {
            if (!supplyCostAgg[si.item_id]) supplyCostAgg[si.item_id] = { cost: 0, qty: 0 };
            supplyCostAgg[si.item_id].cost += (si.cost_per_unit || 0) * (si.quantity || 0);
            supplyCostAgg[si.item_id].qty += si.quantity || 0;
          }
          const itemCosts = {};
          for (const [id, v] of Object.entries(supplyCostAgg)) {
            itemCosts[id] = v.qty > 0 ? Math.round(v.cost / v.qty) : 0;
          }

          // Aggregate product sales from check items
          const productSales = {};
          for (const ci of checkItems) {
            if (!productSales[ci.item_id]) productSales[ci.item_id] = { qty: 0, revenue: 0 };
            productSales[ci.item_id].qty += ci.quantity;
            productSales[ci.item_id].revenue += ci.quantity * ci.price_at_time;
          }
          const productStats = inventory.map((item) => {
            const sales = productSales[item.id] || { qty: 0, revenue: 0 };
            const cost = itemCosts[item.id];
            return { name: item.name, category: item.category, price: item.price, cost, stock: item.stock_quantity, sold: sales.qty, revenue: sales.revenue };
          }).filter((p) => p.sold > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 30);

          // Refunds
          const refundByCheck = {};
          let totalRefunded = 0;
          for (const r of refunds) {
            refundByCheck[r.check_id] = (refundByCheck[r.check_id] || 0) + (r.total_amount || 0);
            totalRefunded += r.total_amount || 0;
          }

          // Aggregate payment methods
          const payments = { cash: 0, card: 0, debt: 0, bonus: 0 };
          let totalRevenue = 0;
          for (const c of checks) {
            const refAmt = refundByCheck[c.id] || 0;
            const effectiveAmt = (c.total_amount || 0) - refAmt;
            totalRevenue += effectiveAmt;
            if (c.payment_method && payments.hasOwnProperty(c.payment_method)) {
              payments[c.payment_method] += effectiveAmt;
            }
          }

          // Aggregate expenses by category
          const expByCategory = {};
          for (const e of expenses) {
            expByCategory[e.category] = (expByCategory[e.category] || 0) + Number(e.amount);
          }

          // Top clients by spend
          const clientSpend = {};
          for (const c of checks) {
            if (!c.player_id) continue;
            clientSpend[c.player_id] = (clientSpend[c.player_id] || 0) + (c.total_amount || 0);
          }
          const topClients = clients
            .map((p) => ({ nickname: p.nickname, balance: p.balance, bonus: p.bonus_points, tier: p.client_tier, spent: clientSpend[p.id] || 0 }))
            .sort((a, b) => b.spent - a.spent)
            .slice(0, 20);

          const salaryTotal = salaryPayments.reduce((s, p) => s + (p.amount || 0), 0);

          // Выручка по персоналу (для контекстной аналитики)
          const staffRevenue = {};
          for (const c of checks) {
            const refAmt = refundByCheck[c.id] || 0;
            const amt = (c.total_amount || 0) - refAmt;
            const sid = c.staff_id || '_без_смены_';
            staffRevenue[sid] = (staffRevenue[sid] || 0) + amt;
          }
          const staffWithRevenue = staff.map((p) => ({ nickname: p.nickname, role: p.role, revenue: staffRevenue[p.id] || 0 })).sort((a, b) => b.revenue - a.revenue);

          // Товары с низким остатком (дефицит)
          const lowStock = inventory.filter((i) => i.is_active && (i.stock_quantity || 0) < 5).map((i) => ({ name: i.name, stock: i.stock_quantity }));

          // Аналитика по периодам (для ответов на вопросы)
          const now = new Date();
          const mskOffset = 3 * 3600000;
          const todayStart = new Date(new Date(now.getTime() + mskOffset).toISOString().split('T')[0]).getTime() - mskOffset;
          const weekAgo = todayStart - 7 * 86400000;
          const twoWeeksAgo = todayStart - 14 * 86400000;
          let weekRevenue = 0, weekChecks = 0, weekRefunded = 0;
          let prevWeekRevenue = 0, prevWeekChecks = 0, prevWeekRefunded = 0;
          for (const c of checks) {
            const t = new Date(c.closed_at).getTime();
            const refAmt = refundByCheck[c.id] || 0;
            const amt = (c.total_amount || 0) - refAmt;
            if (t >= weekAgo) {
              weekRevenue += amt;
              weekChecks++;
              weekRefunded += refAmt;
            } else if (t >= twoWeeksAgo) {
              prevWeekRevenue += amt;
              prevWeekChecks++;
              prevWeekRefunded += refAmt;
            }
          }
          const weekDelta = prevWeekRevenue > 0 ? Math.round(((weekRevenue - prevWeekRevenue) / prevWeekRevenue) * 100) : (weekRevenue > 0 ? 100 : 0);
          const weekCogs = checkItems.filter((ci) => {
            const ch = checks.find((c) => c.id === ci.check_id);
            return ch && new Date(ch.closed_at).getTime() >= weekAgo;
          }).reduce((s, ci) => s + (ci.quantity || 0) * (itemCosts[ci.item_id] || 0), 0);
          const weekAgoStr = new Date(weekAgo + mskOffset).toISOString().split('T')[0];
          const weekExpenses = expenses
            .filter((e) => (e.expense_date || '') >= weekAgoStr)
            .reduce((s, e) => s + Number(e.amount || 0), 0);
          const weekProfit = Math.round(weekRevenue - weekCogs - weekExpenses);
          const weekMargin = weekRevenue > 0 ? Math.round((weekProfit / weekRevenue) * 100) : 0;
          const weekCheckIds = new Set(checks.filter((c) => new Date(c.closed_at).getTime() >= weekAgo).map((c) => c.id));
          const weekProductSales = {};
          for (const ci of checkItems) {
            if (!weekCheckIds.has(ci.check_id)) continue;
            if (!weekProductSales[ci.item_id]) weekProductSales[ci.item_id] = { qty: 0, revenue: 0 };
            weekProductSales[ci.item_id].qty += ci.quantity || 0;
            weekProductSales[ci.item_id].revenue += (ci.quantity || 0) * (ci.price_at_time || 0);
          }
          const weekTopProducts = inventory
            .map((i) => ({ name: i.name, revenue: weekProductSales[i.id]?.revenue || 0, qty: weekProductSales[i.id]?.qty || 0 }))
            .filter((p) => p.revenue > 0)
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10);

          // Зарплата: до 7к → 700₽, каждые 1000₽ сверх → +100₽
          const calcSalary = (rev) => rev <= 7000 ? 700 : 700 + Math.ceil((rev - 7000) / 1000) * 100;
          const weekSalaryEstimate = calcSalary(weekRevenue);

          const tierCounts = { regular: 0, resident: 0, student: 0 };
          for (const c of clients) {
            const t = c.client_tier || 'regular';
            if (tierCounts[t] !== undefined) tierCounts[t]++;
          }
          const certTotal = (certificates || []).length;
          const certUsed = (certificates || []).filter((c) => c.is_used).length;
          const certBalance = (certificates || []).filter((c) => !c.is_used).reduce((s, c) => s + (c.balance || 0), 0);

          dbContext = `\n\n=== ДАННЫЕ T-POS (актуальные из БД) ===
АНАЛИТИКА ЗА НЕДЕЛЮ: выручка ${weekRevenue}₽, чеков ${weekChecks}, возвраты ${weekRefunded}₽, себестоимость ${Math.round(weekCogs)}₽, расходы ${Math.round(weekExpenses)}₽, прибыль ${weekProfit}₽, маржа ${weekMargin}%. Предыдущая неделя: ${prevWeekRevenue}₽. Динамика: ${weekDelta}%.
ТОП ТОВАРОВ ЗА НЕДЕЛЮ: ${JSON.stringify(weekTopProducts)}.
ПЕРСОНАЛ И ВЫРУЧКА: ${JSON.stringify(staffWithRevenue)} — сопоставляй работу с цифрами.
ДЕФИЦИТ (остаток < 5): ${JSON.stringify(lowStock)} — обращай внимание на товары для дозаказа.
КЛИЕНТОВ: ${clients.length}, должников: ${debtors.length}
ТОП-20 КЛИЕНТОВ: ${JSON.stringify(topClients)}
ДОЛЖНИКИ: ${JSON.stringify(debtors.map((p) => ({ nickname: p.nickname, debt: p.balance })))}
ВЫРУЧКА: ${totalRevenue}₽ за ${checks.length} чеков (возвраты: ${totalRefunded}₽), ср.чек: ${checks.length > 0 ? Math.round(totalRevenue / checks.length) : 0}₽
ОПЛАТА: ${JSON.stringify(payments)}
ТОП-20 ТОВАРОВ: ${JSON.stringify(productStats)}
РАСХОДЫ ПО КАТЕГОРИЯМ: ${JSON.stringify(expByCategory)}
ПОСТАВКИ: ${supplies.length} шт, сумма: ${supplies.reduce((s, x) => s + (x.total_cost || 0), 0)}₽
ВОЗВРАТЫ: ${refunds.length} шт, сумма: ${totalRefunded}₽
ЗАРПЛАТЫ: формула — до 7к выручки → 700₽, каждые +1000₽ → +100₽. За неделю (${weekRevenue}₽) расчётная ЗП ≈ ${weekSalaryEstimate}₽. Фактически выплачено: ${salaryTotal}₽.
ТИРЫ КЛИЕНТОВ: гости ${tierCounts.regular}, резиденты ${tierCounts.resident}, студенты ${tierCounts.student}.
СЕРТИФИКАТЫ: ${certTotal} шт (использовано ${certUsed}), остаток номинала ${certBalance}₽.
ПРОСТРАНСТВА: ${JSON.stringify((spaces || []).map((s) => ({ name: s.name, type: s.type, rate: s.hourly_rate })))}
КАССА: ${JSON.stringify(cashOps.slice(0, 15).map((o) => ({ type: o.type, amount: o.amount })))}
ПОСЛЕДНИЕ СМЕНЫ: ${JSON.stringify(shifts.slice(0, 10).map((s) => ({ status: s.status, cash_start: s.cash_start, cash_end: s.cash_end, opened: s.opened_at, closed: s.closed_at })))}
МЕНЮ (остатки stock — актуальные, используй для предупреждений): ${JSON.stringify(inventory.map((i) => ({ name: i.name, cat: i.category, price: i.price, stock: i.stock_quantity ?? 0, active: i.is_active })))}
МЕРОПРИЯТИЯ (предстоящие, с id для update_event): ${JSON.stringify(events.slice(0, 20).map((e) => ({ id: e.id, type: e.type, location: e.location, date: e.date, start_time: e.start_time, payment_type: e.payment_type, fixed_amount: e.fixed_amount, status: e.status, comment: e.comment })))}
(ВНИМАНИЕ: Даты в списке могут быть старыми. ИСПОЛЬЗУЙ ТЕКУЩИЙ ГОД ИЗ СЕКЦИИ "СЕЙЧАС" ДЛЯ НОВЫХ ЗАПИСЕЙ!)
===`;
          // Save to cache
          global._aiContextCache = { text: dbContext, ts: Date.now() };
        }

        // --- Construct System Prompt ---
        const now = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'long', timeStyle: 'short' });
        const systemPromptHeader = `СЕЙЧАС (МСК): ${now}. ТЕКУЩИЙ ГОД: ${new Date().getFullYear()}.

ТЫ — TITAN AI, ИИ-ассистент для сотрудников клуба "Titan Mafia Club" (titanmafia.ru, @titankbr, Нальчик, ул. Кабардинская 189а). Интегрирован с T-POS. Используй данные T-POS в реальном времени — полный доступ к коммерческой информации: выручка, прибыль, расходы, зарплаты, должники, остатки, поставки, персонал.

ГЛУБОКОЕ ПОНИМАНИЕ:
• Понимай произвольные запросы. Примеры: "кто что закупил" → supply_summary; "сколько должны" → list_debtors; "что по Ивану" → client_report; "когда выезд" → list_events; "как дела сегодня" → report_today; "открытые чеки" → open_checks; "что заказать" → stock_alert; "расчёт зарплаты при 15к" → salary_estimate; "расходы за неделю" → expense_summary.
• Интерпретируй контекст: "а за неделю?", "подробнее", "и что с этим?" — уточняй с учётом предыдущих сообщений.
• Анализируй данные: сравнивай периоды, замечай тренды, дефицит, риски. Делай выводы и предлагай действия.
• Отвечай на основе актуальных данных из ДАННЫЕ T-POS. Никогда не угадывай.

ФОРМАТ ОТВЕТОВ:
• Коротко, по делу. Эмодзи: 📊 💰 📉 ✅ ⚠️ 🔥 📅 👤 — для акцентов.
• Никаких таблиц, markdown, UUID. Цифры — в предложениях.

ЛОКАЦИИ/ФОРМАТЫ:
• ТИТАН (клуб): Кабардинская 189а. Фикс 500₽/вечер или 200₽/час. type:"titan".
• ВЫЕЗД: корпоративы/ДР. type:"exit", location.
• Клиенты: regular (гость), resident (резидент), student (студент).

УМНЫЕ ДАТЫ:
• "в субботу" / "следующая суббота" = ближайшая суббота. "завтра", "15 марта" → 2026-03-15.

ОШИБКИ:
• Если данных нет или запрос неясен: "Данные T-POS не загружены" или уточни вопрос. Никогда не выдумывай цифры.

ИНСТРУМЕНТЫ (JSON только для действий):
1. create_event — бронь/выезд. params: type, location, date, start_time, payment_type, fixed_amount, comment
2. list_events — params: { upcoming: true }
3. update_event — params: event_id + date, start_time, location, status:"cancelled"
4. create_check — params: { playerNickname, items?: [{ name, quantity }] }
5. add_items — params: { checkId, items: [{ name, quantity }] }
6. client_report — params: { playerNickname } — клиент: тир, баланс, игр, любимое, долг
7. list_menu — params: {} — меню с ценами и остатками
8. list_players — params: {} — клиенты с балансом и бонусами
9. report_today — params: {} — отчёт за сегодня: выручка, чеков, топ товары
10. list_debtors — params: {} — должники с суммами, итого долг
11. open_checks — params: {} — открытые чеки (не закрытые)
12. stock_alert — params: { threshold?: 5 } — товары для дозаказа (остаток < threshold)
13. salary_estimate — params: { revenue } — расчёт ЗП по выручке (до 7к→700₽, +100₽/1000₽)
14. supply_summary — params: {} — последние поставки, сумма
15. expense_summary — params: { period?: "month"|"week" } — расходы за период по категориям

СОЗДАНИЕ МЕРОПРИЯТИЙ:
Титан → type:"titan". Выезд → type:"exit", location. Ответ ТОЛЬКО JSON: {"action":"create_event","params":{...}}

РЕЖИМ ИЗМЕНЕНИЯ (draft передан):
Примени правки к черновику, верни JSON create_event.`;

        const draftHint = draft ? `\n\nЧЕРНОВИК ДЛЯ ИЗМЕНЕНИЯ: ${JSON.stringify(draft)}\nПользователь написал правки. Примени их и верни обновлённый create_event.` : '';
        // Inject into messages
        let systemMessageFound = false;
        const enrichedMessages = messages.map((m) => {
          if (m.role === 'system') {
            systemMessageFound = true;
            return { ...m, content: `${systemPromptHeader}\n\n${m.content}${draftHint}\n\n${dbContext}` };
          }
          return m;
        });

        if (!systemMessageFound) {
          enrichedMessages.unshift({
            role: 'system',
            content: `${systemPromptHeader}${draftHint}\n\n${dbContext}`,
          });
        }

        if (!POLZA_KEY) {
          json(res, {
            error: 'AI API error: Missing Key',
            details: 'В файле .env на сервере отсутствует POLZA_AI_API_KEY. Получите ключ на polza.ai/dashboard/api-keys',
          }, 200);
          return;
        }

        const aiBody = {
          model: 'google/gemini-2.5-flash-lite-preview-09-2025',
          messages: enrichedMessages,
          temperature: 0.7,
          max_tokens: 4096,
        };

        let aiRes;
        let attempts = 0;
        const maxAttempts = 5;

        while (attempts < maxAttempts) {
          aiRes = await fetch(aiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${POLZA_KEY}`,
            },
            body: JSON.stringify(aiBody),
          });

          if (aiRes.status === 429 && attempts < maxAttempts - 1) {
            attempts++;
            const delay = Math.pow(2, attempts) * 1000;
            console.warn(`AI 429: Rate limit hit. Retrying in ${delay}ms... (Attempt ${attempts}/${maxAttempts})`);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          break;
        }

        const data = await aiRes.json();

        if (!aiRes.ok) {
          console.error(`AI API Error (${aiRes.status}):`, JSON.stringify(data));
          let errorDetail = data.error?.message || 'Unknown error';
          if (aiRes.status === 401) {
            errorDetail = 'Неверный API ключ Polza.ai. Проверьте .env и ключ на polza.ai/dashboard';
          }
          if (aiRes.status === 402) {
            errorDetail = 'Недостаточно средств на балансе Polza.ai. Пополните счёт на polza.ai/dashboard';
          }
          json(res, {
            error: `AI API error: ${aiRes.status}`,
            details: errorDetail,
          }, 200);
          return;
        }

        let text = data?.choices?.[0]?.message?.content ?? data?.output_text ?? '';
        if (Array.isArray(text)) {
          text = text.map((p) => (p?.text ?? (typeof p === 'string' ? p : ''))).join('');
        }
        text = String(text || '').trim() || 'Нет ответа';
        json(res, { response: text });
      } catch (e) {
        console.error('AI Route Error:', e);
        json(res, { error: String(e) }, 500);
      }
    }).catch((e) => {
      json(res, { error: String(e) }, 400);
    });
    return;
  }

  // AI Agent Actions
  if (url.pathname === '/api/ai/action' && req.method === 'POST') {
    if (!checkAuth(req, res)) return;
    readBody(req).then(async (body) => {
      try {
        const { action, params, staffId } = JSON.parse(body);
        // db уже импортирован в начале файла

        if (action === 'create_check') {
          const { playerNickname, items } = params;
          if (!playerNickname) {
            json(res, { success: false, error: 'playerNickname обязателен' });
            return;
          }
          
          // Используем локальный db слой
          const players = await db.select('profiles', { role: 'client' }, '*');
          const player = players.find(p => p.nickname.toLowerCase() === playerNickname.toLowerCase());
          
          if (!player) {
            json(res, { success: false, error: `Игрок "${playerNickname}" не найден` });
            return;
          }

          // Find active shift
          let activeShiftId = null;
          try {
            const shifts = await db.select('shifts', { status: 'open' }, '*');
            if (Array.isArray(shifts) && shifts.length > 0) activeShiftId = shifts[0].id;
          } catch { /* no shift */ }

          const newCheck = await db.insert('checks', {
            player_id: player.id,
            staff_id: staffId || null,
            shift_id: activeShiftId,
            status: 'open',
            total_amount: 0,
            bonus_used: 0,
            discount_total: 0,
          });
          
          const checkId = newCheck?.id;
          if (!checkId) {
            json(res, { success: false, error: 'Чек не создан' });
            return;
          }

          let totalAdded = 0;
          const added = [];
          if (Array.isArray(items) && items.length > 0) {
            const inventory = await db.select('inventory', { is_active: true }, '*');
            for (const item of items) {
              const nameLower = (item.name || '').toLowerCase();
              const found = inventory.find((inv) => inv.name?.toLowerCase() === nameLower) || inventory.find((inv) => inv.name?.toLowerCase()?.includes(nameLower));
              if (found) {
                const qty = Math.max(1, parseInt(item.quantity) || 1);
                await db.insert('check_items', {
                  check_id: checkId,
                  item_id: found.id,
                  quantity: qty,
                  price_at_time: found.price
                });
                added.push({ name: found.name, qty, price: found.price });
                totalAdded += found.price * qty;
              }
            }
            if (totalAdded > 0) {
              await db.update('checks', { id: checkId }, { total_amount: totalAdded });
            }
          }

          const msg = added.length > 0
            ? `Чек для ${player.nickname} создан, добавлено ${added.length} позиций на ${totalAdded}₽`
            : `Чек для ${player.nickname} создан`;
          json(res, { success: true, message: msg, check: newCheck, added: added.length > 0 ? added : undefined });
          return;
        }

        if (action === 'client_report') {
          const { playerNickname, period } = params;
          if (!playerNickname) {
            json(res, { success: false, error: 'playerNickname обязателен' });
            return;
          }
          
          // Используем локальный db слой
          const players = await db.select('profiles', { role: 'client' }, '*');
          const player = players.find(p => p.nickname.toLowerCase() === playerNickname.toLowerCase());
          
          if (!player) {
            json(res, { success: false, error: `Клиент "${playerNickname}" не найден` });
            return;
          }
          
          let clientChecks = await db.select('checks', { player_id: player.id, status: 'closed' }, '*');
          
          // Фильтрация по периоду
          if (period === 'month' || period === 'week') {
            const now = new Date();
            const from = period === 'week'
              ? new Date(now.getTime() - 7 * 86400000)
              : new Date(now.getFullYear(), now.getMonth(), 1);
            clientChecks = clientChecks.filter(c => new Date(c.closed_at) >= from);
          }
          
          // Сортировка по дате закрытия
          clientChecks.sort((a, b) => new Date(b.closed_at) - new Date(a.closed_at));
          clientChecks = clientChecks.slice(0, 100);
          
          const checkIds = clientChecks.slice(0, 50).map((c) => c.id).filter(Boolean);
          const shiftIds = [...new Set(clientChecks.map((c) => c.shift_id).filter(Boolean))];
          let shiftMap = {};
          if (shiftIds.length > 0) {
            const shifts = await db.query(`SELECT id, evening_type FROM shifts WHERE id = ANY($1)`, [shiftIds]);
            shiftMap = Object.fromEntries(shifts.map((s) => [s.id, s.evening_type || 'no_event']));
          }
          const eveningLabels = { sport_mafia: 'Спортивная', city_mafia: 'Городская', kids_mafia: 'Детская', board_games: 'Настолки', no_event: 'Без вечера' };
          const eveningCounts = {};
          for (const c of clientChecks) {
            const et = shiftMap[c.shift_id] || 'no_event';
            eveningCounts[et] = (eveningCounts[et] || 0) + 1;
          }
          const eveningLines = Object.entries(eveningCounts)
            .filter(([, n]) => n > 0)
            .map(([k, n]) => `${eveningLabels[k] || k}: ${n}`)
            .join(', ');
          let favoriteItem = null;
          let checkItems = [];
          if (checkIds.length > 0) {
            const items = await db.query(`SELECT check_id, item_id, quantity, price_at_time FROM check_items WHERE check_id = ANY($1)`, [checkIds]);
            const inv = await db.select('inventory', {}, 'id, name');
            const itemCount = {};
            for (const ci of items) {
              const name = inv.find((i) => i.id === ci.item_id)?.name || '?';
              itemCount[name] = (itemCount[name] || 0) + (ci.quantity || 0);
              checkItems.push({ ...ci, name });
            }
            const top = Object.entries(itemCount).sort((a, b) => b[1] - a[1])[0];
            if (top) favoriteItem = top[0];
          }
          const totalSpent = clientChecks.reduce((s, c) => s + (c.total_amount || 0), 0);
          const lastCheck = clientChecks[0];
          const lastVisit = lastCheck?.closed_at ? new Date(lastCheck.closed_at).toLocaleDateString('ru-RU') : '—';
          const tierLabel = { resident: 'Резидент', student: 'Студент', regular: 'Гость' };
          const status = tierLabel[player.client_tier] || 'Гость';
          const debt = (player.balance || 0) < 0 ? ` Долг: ${player.balance}₽` : '';
          const fav = favoriteItem ? ` Любимое: ${favoriteItem}.` : '';
          let msg = `👤 <b>${player.nickname}</b> (${status})\n`;
          msg += `Баланс: ${player.balance ?? 0}₽ · Бонусы: ${player.bonus_points ?? 0}${debt}\n`;
          msg += `Визитов: ${clientChecks.length} · LTV: ${Math.round(totalSpent)}₽\n`;
          if (eveningLines) msg += `Вечера: ${eveningLines}\n`;
          msg += `Последний визит: ${lastVisit}${fav ? `\n${fav}` : ''}`;
          const itemsByCheck = {};
          for (const ci of checkItems) {
            if (!itemsByCheck[ci.check_id]) itemsByCheck[ci.check_id] = [];
            itemsByCheck[ci.check_id].push(ci);
          }
          const checkHistory = clientChecks.slice(0, 10).map((c) => ({
            id: c.id,
            total: c.total_amount,
            closed_at: c.closed_at,
            evening_type: shiftMap[c.shift_id] || 'no_event',
            items: (itemsByCheck[c.id] || []).map((i) => ({ name: i.name, quantity: i.quantity, price: i.price_at_time })),
          }));
          json(res, { success: true, message: msg, eveningCounts, checkHistory, totalSpent });
          return;
        }

        if (action === 'create_event') {
          const eventData = {
            type: params.type || 'exit',
            location: params.location || null,
            date: params.date || new Date(Date.now() + 3 * 3600000).toISOString().split('T')[0],
            start_time: params.start_time || '18:00',
            payment_type: params.payment_type || 'fixed',
            fixed_amount: params.fixed_amount || 0,
            status: 'planned',
            comment: params.comment || null,
            created_by: staffId || null,
          };

          const event = await db.insert('events', eventData);

          json(res, {
            success: true,
            message: `Мероприятие "${eventData.type === 'titan' ? 'Титан' : eventData.location}" на ${eventData.date} создано`,
            event
          });
          return;
        }

        if (action === 'list_events') {
          const today = new Date(Date.now() + 3 * 3600000).toISOString().split('T')[0];
          let evList = await db.select('events', {}, '*');
          
          if (params.upcoming !== false) {
            evList = evList.filter(e => 
              (e.status === 'planned' || e.status === 'active') && e.date >= today
            );
          }
          
          evList.sort((a, b) => {
            if (a.date !== b.date) return a.date.localeCompare(b.date);
            return a.start_time.localeCompare(b.start_time);
          });
          evList = evList.slice(0, 30);
          
          const lines = evList.length === 0
            ? ['📅 Нет запланированных мероприятий.']
            : evList.map((e, i) => {
                const label = e.type === 'titan' ? 'Титан' : (e.location || 'Выезд');
                const pay = e.payment_type === 'hourly' ? 'почасовая' : `фикс ${e.fixed_amount || 0}₽`;
                return `${i + 1}. ${label} — ${e.date} в ${e.start_time || '18:00'}, ${pay}${e.comment ? ` (${e.comment})` : ''}`;
              });
          json(res, { success: true, events: evList, message: `📅 Мероприятия:\n\n${lines.join('\n')}` });
          return;
        }

        if (action === 'update_event') {
          const { event_id, ...updates } = params;
          if (!event_id) {
            json(res, { success: false, error: 'event_id обязателен' });
            return;
          }
          const allowed = ['type', 'location', 'date', 'start_time', 'payment_type', 'fixed_amount', 'comment', 'status'];
          const payload = {};
          for (const k of allowed) {
            if (params[k] !== undefined) payload[k] = params[k];
          }
          if (Object.keys(payload).length === 0) {
            json(res, { success: false, error: 'Нет полей для обновления' });
            return;
          }
          
          const result = await db.update('events', { id: event_id }, payload);
          if (!result || result.length === 0) {
            json(res, { success: false, error: 'Ошибка обновления' });
            return;
          }
          const label = payload.type === 'titan' ? 'Титан' : (payload.location || 'мероприятие');
          json(res, { success: true, message: `✅ Обновлено: ${label}` });
          return;
        }

        if (action === 'add_items') {
          const { checkId, items } = params; // items: [{ name, quantity }]
          if (!checkId || !Array.isArray(items) || items.length === 0) {
            json(res, { success: false, error: 'checkId и items[] обязательны' });
            return;
          }
          const inventory = await db.select('inventory', { is_active: true }, 'id,name,price');
          const added = [];
          let totalAdded = 0;

          for (const item of items) {
            const nameLower = (item.name || '').toLowerCase();
            const found = inventory.find((inv) => inv.name?.toLowerCase() === nameLower)
              || inventory.find((inv) => inv.name?.toLowerCase()?.includes(nameLower));
            if (found) {
              const qty = Math.max(1, parseInt(item.quantity) || 1);
              await db.insert('check_items', {
                check_id: checkId,
                item_id: found.id,
                quantity: qty,
                price_at_time: found.price,
              });
              added.push({ name: found.name, qty, price: found.price });
              totalAdded += found.price * qty;
            }
          }

          if (totalAdded > 0) {
            const check = await db.selectOne('checks', { id: checkId }, 'total_amount');
            const currentTotal = check?.total_amount || 0;
            await db.update('checks', { id: checkId }, { total_amount: currentTotal + totalAdded });
          }

          json(res, { success: true, message: `Добавлено ${added.length} позиций на ${totalAdded}₽`, added });

        } else if (action === 'list_menu') {
          const menu = await db.select('inventory', { is_active: true }, 'name,category,price,stock_quantity');
          menu.sort((a, b) => {
            if (a.category !== b.category) return a.category.localeCompare(b.category);
            return a.name.localeCompare(b.name);
          });
          const byCat = {};
          for (const m of menu) {
            const cat = m.category || 'Прочее';
            if (!byCat[cat]) byCat[cat] = [];
            byCat[cat].push(`${m.name} — ${m.price}₽ (остаток: ${m.stock_quantity ?? 0})`);
          }
          const lines = Object.entries(byCat).map(([cat, items]) => `🍽 ${cat}:\n${items.slice(0, 15).join('\n')}${items.length > 15 ? `\n... и ещё ${items.length - 15}` : ''}`).join('\n\n');
          const msg = `📋 Меню (${menu.length} позиций):\n\n${lines}`;
          json(res, { success: true, menu, message: msg });

        } else if (action === 'list_players') {
          const players = await db.select('profiles', { role: 'client', deleted_at: null }, 'nickname,balance,bonus_points,client_tier');
          players.sort((a, b) => a.nickname.localeCompare(b.nickname));
          const tierLabel = { regular: 'Гость', resident: 'Резидент', student: 'Студент' };
          const lines = players.slice(0, 25).map((p) => {
            const tier = tierLabel[p.client_tier] || 'Гость';
            const bal = p.balance != null ? p.balance : 0;
            const bonus = p.bonus_points != null ? p.bonus_points : 0;
            return `${p.nickname} (${tier}) — баланс ${bal}₽, бонусы ${bonus}`;
          });
          const msg = `👥 Клиенты (${players.length}):\n\n${lines.join('\n')}${players.length > 25 ? `\n\n... и ещё ${players.length - 25}` : ''}`;
          json(res, { success: true, players, message: msg });

        } else if (action === 'report_today') {
          const mskOffset = 3 * 3600000;
          const mskDate = new Date(Date.now() + mskOffset);
          const todayStr = mskDate.toISOString().split('T')[0];
          const dayStartMs = new Date(todayStr + 'T00:00:00+03:00').getTime();
          const dayEndMs = dayStartMs + 86400000;
          const dayStartIso = new Date(dayStartMs).toISOString();
          const dayEndIso = new Date(dayEndMs).toISOString();
          
          const [checks, inventory] = await Promise.all([
            db.query(`SELECT id,total_amount,player_id FROM checks WHERE status='closed' AND closed_at >= $1 AND closed_at < $2`, [dayStartIso, dayEndIso]),
            db.select('inventory', { is_active: true }, 'id,name'),
          ]);
          const checkIds = checks.map((c) => c.id).filter(Boolean);
          let dayRevenue = 0, itemSales = {};
          for (const c of checks) dayRevenue += c.total_amount || 0;
          if (checkIds.length > 0) {
            const items = await db.query(`SELECT item_id,quantity,price_at_time FROM check_items WHERE check_id = ANY($1)`, [checkIds]);
            for (const ci of items) {
              const name = inventory.find((i) => i.id === ci.item_id)?.name || '?';
              itemSales[name] = (itemSales[name] || 0) + (ci.quantity || 0) * (ci.price_at_time || 0);
            }
          }
          const topItems = Object.entries(itemSales).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, r]) => `${n}: ${Math.round(r)}₽`);
          const msg = `📊 Сегодня (${todayStr}): выручка ${dayRevenue}₽, чеков ${checks.length}. Топ: ${topItems.join('; ') || '—'}`;
          json(res, { success: true, message: msg });

        } else if (action === 'list_debtors') {
          const debtors = await db.select('profiles', { role: 'client', deleted_at: null }, 'nickname,balance');
          const filtered = debtors.filter(p => (p.balance || 0) < 0);
          filtered.sort((a, b) => a.balance - b.balance);
          filtered.slice(0, 50);
          const totalDebt = filtered.reduce((s, p) => s + (p.balance || 0), 0);
          const lines = filtered.map((p) => `${p.nickname}: ${p.balance}₽`);
          const msg = `⚠️ Должники (${filtered.length}):\n\n${lines.join('\n') || 'Нет'}\n\nИтого долг: ${totalDebt}₽`;
          json(res, { success: true, message: msg });

        } else if (action === 'open_checks') {
          const checks = await db.select('checks', { status: 'open' }, 'id,total_amount,player_id');
          checks.sort((a, b) => b.id.localeCompare(a.id));
          checks.slice(0, 20);
          const playerIds = [...new Set(checks.map((c) => c.player_id).filter(Boolean))];
          let players = [];
          if (playerIds.length > 0) {
            players = await db.query(`SELECT id,nickname FROM profiles WHERE id = ANY($1)`, [playerIds]);
          }
          const plMap = Object.fromEntries(players.map((p) => [p.id, p.nickname]));
          const lines = checks.map((c) => {
            const name = plMap[c.player_id] || 'Без игрока';
            return `${name}: ${c.total_amount || 0}₽`;
          });
          const msg = `📋 Открытые чеки (${checks.length}):\n\n${lines.join('\n') || 'Нет открытых чеков'}`;
          json(res, { success: true, message: msg });

        } else if (action === 'stock_alert') {
          const threshold = params.threshold ?? 5;
          const all = await db.select('inventory', { is_active: true }, 'name,stock_quantity,category');
          const low = all.filter((i) => (i.stock_quantity ?? 0) < threshold).sort((a, b) => (a.stock_quantity ?? 0) - (b.stock_quantity ?? 0));
          const lines = low.map((i) => `${i.name}: ${i.stock_quantity ?? 0} шт`);
          const msg = lines.length > 0
            ? `⚠️ Для дозаказа (остаток < ${threshold}):\n\n${lines.join('\n')}`
            : `✅ Все позиции в норме (остаток ≥ ${threshold})`;
          json(res, { success: true, message: msg });

        } else if (action === 'salary_estimate') {
          const revenue = Number(params.revenue) || 0;
          const salary = revenue <= 7000 ? 700 : 700 + Math.ceil((revenue - 7000) / 1000) * 100;
          const msg = `💰 При выручке ${revenue}₽ расчётная ЗП: ${salary}₽ (формула: до 7к → 700₽, +100₽ за каждые 1000₽ сверх)`;
          json(res, { success: true, message: msg });

        } else if (action === 'supply_summary') {
          const supplies = await db.select('supplies', {}, 'total_cost,created_at');
          supplies.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          supplies.slice(0, 15);
          const total = supplies.reduce((s, x) => s + (x.total_cost || 0), 0);
          const lines = supplies.map((s) => {
            const d = s.created_at ? new Date(s.created_at).toLocaleDateString('ru-RU') : '—';
            return `${d}: ${s.total_cost || 0}₽`;
          });
          const msg = `📦 Поставки (последние ${supplies.length}):\n\n${lines.join('\n')}\n\nСумма: ${total}₽`;
          json(res, { success: true, message: msg });

        } else if (action === 'expense_summary') {
          const period = params.period || 'month';
          const now = new Date();
          let fromDate;
          if (period === 'week') {
            fromDate = new Date(now);
            fromDate.setDate(fromDate.getDate() - 7);
          } else {
            fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
          }
          const expenses = await db.query(`SELECT category,amount,expense_date FROM expenses WHERE expense_date >= $1 ORDER BY expense_date DESC`, [fromDate.toISOString().split('T')[0]]);
          const byCat = {};
          for (const e of expenses) {
            const c = e.category || 'Прочее';
            byCat[c] = (byCat[c] || 0) + Number(e.amount || 0);
          }
          const total = Object.values(byCat).reduce((s, v) => s + v, 0);
          const lines = Object.entries(byCat).map(([c, a]) => `${c}: ${Math.round(a)}₽`);
          const msg = `📉 Расходы (${period === 'week' ? 'неделя' : 'месяц'}):\n\n${lines.join('\n')}\n\nИтого: ${Math.round(total)}₽`;
          json(res, { success: true, message: msg });

        } else {
          json(res, { error: `Неизвестное действие: ${action}` }, 200);
        }
      } catch (e) {
        console.error('AI Action Error:', e);
        json(res, { error: String(e) }, 500);
      }
    }).catch((e) => {
      json(res, { error: String(e) }, 400);
    });
    return;
  }

  // ── Auth: Login by nickname + password ──
  if (url.pathname === '/api/auth/login' && req.method === 'POST') {
    // db уже импортирован в начале файла
    readBody(req).then(async (body) => {
      try {
        const { nickname, password } = JSON.parse(body);
        if (!nickname || !password) { json(res, { error: 'nickname и password обязательны' }, 400); return; }
        const profiles = await db.select('profiles', {}, '*');
        const profile = profiles.find(p => p.nickname.toLowerCase() === nickname.toLowerCase());
        if (!profile) { json(res, { error: 'Неверный логин или пароль' }, 401); return; }
        const ok = await verifyAndMigrate('profiles', profile.id, 'password_hash', password, profile.password_hash);
        if (!ok) { json(res, { error: 'Неверный логин или пароль' }, 401); return; }
        const { password_hash: _ph, pin: _p, ...safe } = profile;
        void _ph; void _p;
        json(res, { data: safe });
      } catch (e) { json(res, { error: String(e) }, 500); }
    }).catch((e) => json(res, { error: String(e) }, 400));
    return;
  }

  // ── Auth: Login by PIN ──
  if (url.pathname === '/api/auth/pin' && req.method === 'POST') {
    // db уже импортирован в начале файла
    readBody(req).then(async (body) => {
      try {
        const { userId, pin } = JSON.parse(body);
        if (!pin) { json(res, { error: 'PIN обязателен' }, 400); return; }
        let profiles;
        if (userId) {
          profiles = await db.select('profiles', { id: userId }, '*');
        } else {
          // Global PIN search (staff/owner/tablet) — load all with non-null pins
          profiles = await db.query(`SELECT * FROM profiles WHERE role IN ('owner', 'staff', 'tablet') AND pin IS NOT NULL`);
        }
        if (!profiles || profiles.length === 0) { json(res, { error: 'Неверный PIN-код' }, 401); return; }

        let matched = null;
        for (const p of profiles) {
          if (!p.pin) continue;
          const ok = await verifyAndMigrate('profiles', p.id, 'pin', pin, p.pin);
          if (ok) { matched = p; break; }
        }
        if (!matched) { json(res, { error: 'Неверный PIN-код' }, 401); return; }
        const { password_hash: _ph, pin: _p, ...safe } = matched;
        void _ph; void _p;
        json(res, { data: safe });
      } catch (e) { json(res, { error: String(e) }, 500); }
    }).catch((e) => json(res, { error: String(e) }, 400));
    return;
  }

  // ── Auth: Setup / Change PIN ──
  if (url.pathname === '/api/auth/setup-pin' && req.method === 'POST') {
    // db уже импортирован в начале файла
    readBody(req).then(async (body) => {
      try {
        const { userId, pin } = JSON.parse(body);
        if (!userId || !pin) { json(res, { error: 'userId и pin обязательны' }, 400); return; }
        const hashed = bcrypt.hashSync(pin, BCRYPT_ROUNDS);
        const result = await db.update('profiles', { id: userId }, { pin: hashed });
        if (!result || result.length === 0) { json(res, { error: 'Ошибка сохранения PIN' }, 500); return; }
        json(res, { success: true });
      } catch (e) { json(res, { error: String(e) }, 500); }
    }).catch((e) => json(res, { error: String(e) }, 400));
    return;
  }

  // ── Auth: Hash password (for staff management) ──
  if (url.pathname === '/api/auth/hash-password' && req.method === 'POST') {
    readBody(req).then(async (body) => {
      try {
        const { password } = JSON.parse(body);
        if (!password) { json(res, { error: 'password обязателен' }, 400); return; }
        const hash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
        json(res, { hash });
      } catch (e) { json(res, { error: String(e) }, 500); }
    }).catch((e) => json(res, { error: String(e) }, 400));
    return;
  }

  // ── Notify: Server-side Telegram + PWA ──
  if (url.pathname === '/api/notify' && req.method === 'POST') {
    // db уже импортирован в начале файла
    readBody(req).then(async (body) => {
      try {
        const { type, text, chatIds, title, pwaBody, meta } = JSON.parse(body);

        // Direct Telegram send (by chatIds)
        if (text && Array.isArray(chatIds)) {
          for (const chatId of chatIds) {
            await sendTelegram(chatId, text);
          }
        }

        // User-settings-aware Telegram + PWA notification
        if (type && text) {
          const settingsRows = await db.query(`
            SELECT uns.user_id, uns.types, p.tg_id 
            FROM user_notification_settings uns
            INNER JOIN profiles p ON p.id = uns.user_id
            WHERE p.tg_id IS NOT NULL
          `);
          
          for (const row of settingsRows) {
            const tgId = row.tg_id;
            const userTypes = row.types || {};
            const typeSetting = userTypes[type];
            if (!typeSetting?.enabled) continue;
            const ch = typeSetting.channel || 'both';
            if ((ch === 'telegram' || ch === 'both') && tgId) {
              await sendTelegram(tgId, text);
            }
          }
          // PWA notification (insert into notifications table)
          if (title) {
            const anyPwa = settingsRows.some(row => {
              const ts = (row.types || {})[type];
              return ts?.enabled && (ts.channel === 'pwa' || ts.channel === 'both');
            });
            if (anyPwa) {
              await db.insert('notifications', { type, title, body: pwaBody || null, meta: meta || null });
            }
          }
        }

        json(res, { success: true });
      } catch (e) { json(res, { error: String(e) }, 500); }
    }).catch((e) => json(res, { error: String(e) }, 400));
    return;
  }

  // ── Auth: Get profile by Telegram ID ──
  if (url.pathname === '/api/auth/telegram' && req.method === 'POST') {
    // db уже импортирован в начале файла
    readBody(req).then(async (body) => {
      try {
        const { tgId } = JSON.parse(body);
        if (!tgId) { json(res, { error: 'tgId обязателен' }, 400); return; }
        
        const profiles = await db.select('profiles', { tg_id: tgId }, 
          'id, nickname, role, balance, bonus_points, client_tier, is_resident, photo_url, tg_id, tg_username, phone, birthday, linked_space_id, created_at, deleted_at');
        
        if (!profiles || profiles.length === 0) {
          json(res, { error: 'Пользователь не найден' }, 404);
          return;
        }
        
        json(res, { data: profiles[0] });
      } catch (e) { json(res, { error: String(e) }, 500); }
    }).catch((e) => json(res, { error: String(e) }, 400));
    return;
  }

  // ── Auth: Get staff users ──
  if (url.pathname === '/api/auth/staff' && req.method === 'GET') {
    (async () => {
      // db уже импортирован в начале файла
      try {
        const profiles = await db.query(`
          SELECT id, nickname, role, pin 
          FROM profiles 
          WHERE role IN ('staff', 'owner', 'tablet') 
          ORDER BY role, nickname
        `);
        json(res, { data: profiles });
      } catch (e) { json(res, { error: String(e) }, 500); }
    })();
    return;
  }

  // ── Auth: Refresh profile ──
  if (url.pathname === '/api/auth/profile' && req.method === 'GET') {
    (async () => {
      // db уже импортирован в начале файла
      const userId = url.searchParams.get('userId');
      if (!userId) { json(res, { error: 'userId обязателен' }, 400); return; }
      
      try {
        const profiles = await db.select('profiles', { id: userId }, 
          'id, nickname, role, balance, bonus_points, client_tier, is_resident, photo_url, tg_id, tg_username, phone, birthday, linked_space_id, permissions, created_at, deleted_at');
        
        if (!profiles || profiles.length === 0) {
          json(res, { error: 'Пользователь не найден' }, 404);
          return;
        }
        
        json(res, { data: profiles[0] });
      } catch (e) { json(res, { error: String(e) }, 500); }
    })();
    return;
  }

  // ── API: Generic database operations for frontend ──
  if (url.pathname === '/api/db' && req.method === 'POST') {
    // db уже импортирован в начале файла
    readBody(req).then(async (body) => {
      try {
        const { operation, table, filters, data, columns, orderBy, limit } = JSON.parse(body);
        
        if (!operation || !table) {
          json(res, { error: 'operation и table обязательны' }, 400);
          return;
        }

        let result;
        switch (operation) {
          case 'select':
            result = await db.select(table, filters || {}, columns || '*');
            if (orderBy) {
              result.sort((a, b) => {
                if (orderBy.direction === 'desc') return b[orderBy.column] - a[orderBy.column];
                return a[orderBy.column] - b[orderBy.column];
              });
            }
            if (limit) result = result.slice(0, limit);
            break;
          case 'selectOne':
            result = await db.selectOne(table, filters || {}, columns || '*');
            break;
          case 'insert':
            result = await db.insert(table, data || {});
            break;
          case 'update':
            result = await db.update(table, filters || {}, data || {});
            break;
          case 'delete':
            result = await db.delete(table, filters || {});
            break;
          case 'query':
            if (!data?.sql) {
              json(res, { error: 'SQL query обязателен для операции query' }, 400);
              return;
            }
            result = await db.query(data.sql, data.params || []);
            break;
          default:
            json(res, { error: `Неизвестная операция: ${operation}` }, 400);
            return;
        }

        json(res, { data: result });
      } catch (e) {
        console.error('[DB API Error]', e);
        json(res, { error: String(e) }, 500);
      }
    }).catch((e) => json(res, { error: String(e) }, 400));
    return;
  }

  // ── API: Close check (RPC replacement) ──
  if (url.pathname === '/api/checks/close' && req.method === 'POST') {
    // db уже импортирован в начале файла
    readBody(req).then(async (body) => {
      try {
        const { checkId, payments, bonusUsed, spaceRental, certificateUsed, certificateId, discountTotal, closedBy, cartItems } = JSON.parse(body);
        
        if (!checkId) {
          json(res, { error: 'checkId обязателен' }, 400);
          return;
        }

        // Execute as transaction
        const result = await db.transaction(async (client) => {
          // 1. Lock and validate check
          const checkResult = await db.query(client, `SELECT * FROM checks WHERE id = $1 FOR UPDATE`, [checkId]);
          const check = checkResult[0];
          
          if (!check) {
            throw new Error('Check not found');
          }
          
          if (check.status !== 'open') {
            throw new Error(`Check is not open (status: ${check.status})`);
          }

          // 2. Calculate total
          let total = (check.total_amount || 0) + (spaceRental || 0);
          
          // Check for linked event
          const eventResult = await db.query(client, `SELECT COALESCE(fixed_amount, 0) as amount FROM events WHERE check_id = $1 LIMIT 1`, [checkId]);
          if (eventResult.length > 0) {
            total += eventResult[0].amount;
          }

          const finalAmount = Math.max(0, total - (bonusUsed || 0) - (certificateUsed || 0));

          // Determine payment method
          const isSplit = Array.isArray(payments) && payments.length > 1;
          let primaryMethod = 'cash';
          if (Array.isArray(payments) && payments.length === 0) {
            primaryMethod = 'cash';
          } else if (isSplit) {
            primaryMethod = 'split';
          } else {
            primaryMethod = payments[0]?.method || 'cash';
          }

          // 3. Update check status
          await db.query(client, `
            UPDATE checks SET
              status = 'closed',
              total_amount = $1,
              payment_method = $2,
              bonus_used = $3,
              certificate_used = $4,
              certificate_id = $5,
              discount_total = $6,
              closed_at = NOW()
            WHERE id = $7
          `, [finalAmount, primaryMethod, bonusUsed || 0, certificateUsed || 0, certificateId || null, discountTotal || 0, checkId]);

          // 4. Insert payments
          if (Array.isArray(payments) && payments.length > 0) {
            for (const payment of payments) {
              await db.query(client, `
                INSERT INTO check_payments (check_id, method, amount)
                VALUES ($1, $2, $3)
              `, [checkId, payment.method, payment.amount]);
            }
          }

          // 5. Player balance/bonus updates
          if (check.player_id) {
            const playerResult = await db.query(client, `SELECT balance, bonus_points FROM profiles WHERE id = $1 FOR UPDATE`, [check.player_id]);
            const player = playerResult[0];

            if (player) {
              // Sum debt and deposit payments
              let debtAmount = 0;
              let depositAmount = 0;
              let hasNonDebt = false;
              
              if (Array.isArray(payments)) {
                for (const payment of payments) {
                  if (payment.method === 'debt') debtAmount += payment.amount;
                  if (payment.method === 'deposit') depositAmount += payment.amount;
                  if (payment.method !== 'debt') hasNonDebt = true;
                }
              }

              // Load bonus settings (defaults)
              let bonusEnabled = true;
              let bonusRate = 10;
              let bonusMin = 0;
              let bonusOnDebt = false;

              const settingsResult = await db.query(client, `SELECT key, value FROM app_settings WHERE key IN ('bonus_enabled', 'bonus_accrual_rate', 'bonus_min_purchase', 'bonus_accrual_on_debt')`);
              for (const setting of settingsResult) {
                if (setting.key === 'bonus_enabled' && setting.value === 'false') bonusEnabled = false;
                if (setting.key === 'bonus_accrual_rate') bonusRate = parseInt(setting.value) || 10;
                if (setting.key === 'bonus_min_purchase') bonusMin = parseInt(setting.value) || 0;
                if (setting.key === 'bonus_accrual_on_debt' && setting.value === 'true') bonusOnDebt = true;
              }

              // Calculate bonus accrual
              let bonusAccrual = 0;
              if (bonusEnabled && total >= bonusMin && (hasNonDebt || bonusOnDebt)) {
                bonusAccrual = Math.round(total * bonusRate / 100);
              }

              // Update player balance
              let newBalance = player.balance || 0;
              if (debtAmount > 0) newBalance -= debtAmount;
              if (depositAmount > 0) newBalance -= depositAmount;

              const newPoints = Math.max(0, (player.bonus_points || 0) - (bonusUsed || 0)) + bonusAccrual;

              await db.query(client, `
                UPDATE profiles SET
                  balance = $1,
                  bonus_points = $2
                WHERE id = $3
              `, [newBalance, newPoints, check.player_id]);

              // Insert bonus transactions
              if (bonusUsed > 0) {
                await db.query(client, `
                  INSERT INTO transactions (type, amount, description, check_id, player_id, created_by)
                  VALUES ('bonus_spend', $1, 'Списание бонусов по чеку', $2, $3, $4)
                `, [bonusUsed, checkId, check.player_id, closedBy || null]);

                await db.query(client, `
                  INSERT INTO bonus_history (profile_id, amount, balance_after, reason)
                  VALUES ($1, $2, $3, 'Списание по чеку')
                `, [check.player_id, -bonusUsed, Math.max(0, player.bonus_points - bonusUsed)]);
              }

              if (bonusAccrual > 0) {
                await db.query(client, `
                  INSERT INTO transactions (type, amount, description, check_id, player_id, created_by)
                  VALUES ('bonus_accrual', $1, 'Начисление бонусов (' || $2 || '% от ' || $3 || '₽)', $4, $5, $6)
                `, [bonusAccrual, bonusRate, total, checkId, check.player_id, closedBy || null]);

                await db.query(client, `
                  INSERT INTO bonus_history (profile_id, amount, balance_after, reason)
                  VALUES ($1, $2, $3, 'Начисление ' || $4 || '% от ' || $5 || '₽')
                `, [check.player_id, bonusAccrual, newPoints, bonusRate, total]);
              }

              if (depositAmount > 0) {
                await db.query(client, `
                  INSERT INTO transactions (type, amount, description, check_id, player_id, created_by)
                  VALUES ('debt_adjustment', $1, 'Оплата с депозита по чеку (было ' || $2 || '₽, стало ' || $3 || '₽)', $4, $5, $6)
                `, [-depositAmount, player.balance || 0, newBalance, checkId, check.player_id, closedBy || null]);
              }
            }
          }

          // 6. Sale transaction
          let methodDesc = '';
          if (certificateUsed > 0 && Array.isArray(payments) && payments.length > 0) {
            methodDesc = 'сертификат + ' + (isSplit ? 'разд. оплата' : (primaryMethod || 'cash'));
          } else if (certificateUsed > 0) {
            methodDesc = 'сертификат';
          } else if (isSplit) {
            methodDesc = 'разд. оплата';
          } else {
            methodDesc = primaryMethod || 'cash';
          }

          await db.query(client, `
            INSERT INTO transactions (type, amount, description, check_id, player_id, created_by)
            VALUES ('sale', $1, 'Закрытие чека (' || $2 || ')', $3, $4, $5)
          `, [finalAmount, methodDesc, checkId, check.player_id, closedBy || null]);

          if (certificateUsed > 0) {
            const certDesc = 'Оплата сертификатом: ' + certificateUsed + '₽' + (certificateId ? ` (${certificateId.substring(0, 8)})` : '');
            await db.query(client, `
              INSERT INTO transactions (type, amount, description, check_id, player_id, created_by)
              VALUES ('sale', 0, $1, $2, $3, $4)
            `, [certDesc, checkId, check.player_id, closedBy || null]);
          }

          // 7. Decrement stock
          if (Array.isArray(cartItems)) {
            for (const cartItem of cartItems) {
              const itemId = cartItem.item_id || cartItem.value?.item_id;
              const quantity = cartItem.quantity || cartItem.value?.quantity;
              if (itemId && quantity) {
                await db.query(client, `
                  UPDATE inventory SET stock_quantity = stock_quantity - $1
                  WHERE id = $2
                `, [quantity, itemId]);
              }
            }
          }

          // 8. Complete bookings & events
          if (check.space_id) {
            await db.query(client, `
              UPDATE bookings SET status = 'completed'
              WHERE check_id = $1 AND status = 'active'
            `, [checkId]);
          }

          await db.query(client, `
            UPDATE events SET status = 'completed'
            WHERE check_id = $1 AND status != 'completed'
          `, [checkId]);

          return {
            success: true,
            finalAmount,
            bonusAccrual: 0, // calculated but not returned for simplicity
            method: primaryMethod
          };
        });

        json(res, { data: result });
      } catch (e) {
        console.error('[Close Check Error]', e);
        json(res, { error: String(e) }, 500);
      }
    }).catch((e) => json(res, { error: String(e) }, 400));
    return;
  }

  // ── API: Upload file to MinIO ──
  if (url.pathname === '/api/storage/upload' && req.method === 'POST') {
    // S3Client и PutObjectCommand уже импортированы в начале файла
    readBody(req, async (body) => {
      try {
        const { file, filename, folder } = JSON.parse(body);
        
        if (!file || !filename) {
          json(res, { error: 'file и filename обязательны' }, 400);
          return;
        }

        const s3Client = new S3Client({
          endpoint: process.env.MINIO_ENDPOINT || 'http://localhost:9000',
          region: 'us-east-1',
          credentials: {
            accessKeyId: process.env.MINIO_ACCESS_KEY || 'minioadmin',
            secretAccessKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
          },
          forcePathStyle: true,
        });

        const buffer = Buffer.from(file, 'base64');
        const key = folder ? `${folder}/${filename}` : filename;

        const command = new PutObjectCommand({
          Bucket: process.env.MINIO_BUCKET || 'tpos-storage',
          Key: key,
          Body: buffer,
          ContentType: 'image/jpeg',
        });

        await s3Client.send(command);
        
        const url = `${process.env.MINIO_ENDPOINT || 'http://localhost:9000'}/${process.env.MINIO_BUCKET || 'tpos-storage'}/${key}`;
        
        json(res, { data: { url, key } });
      } catch (e) {
        console.error('[Storage Upload Error]', e);
        json(res, { error: String(e) }, 500);
      }
    }).catch((e) => json(res, { error: String(e) }, 400));
    return;
  }

  json(res, { error: 'Not found' }, 404);
});

// --- Event reminders (24h, 12h, 3h, 1h before) ---
const REMINDER_INTERVALS = [
  { key: '24h', hours: 24, label: '24 часа' },
  { key: '12h', hours: 12, label: '12 часов' },
  { key: '3h', hours: 3, label: '3 часа' },
  { key: '1h', hours: 1, label: '1 час' },
];

async function runEventReminders() {
  const BOT_TOKEN = process.env.VITE_TELEGRAM_BOT_TOKEN;
  const CHAT_IDS = (process.env.OWNER_CHAT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!BOT_TOKEN || CHAT_IDS.length === 0) return;

  const today = new Date(Date.now() + 3 * 3600000).toISOString().split('T')[0];
  const events = await query(`SELECT * FROM events WHERE status IN ('planned', 'active') AND date >= $1 ORDER BY date ASC, start_time ASC`, [today]);
  if (!Array.isArray(events)) return;

  const nowMs = Date.now();

  for (const ev of events) {
    const startStr = `${ev.date}T${(ev.start_time || '18:00').slice(0, 5)}:00+03:00`;
    const startMs = new Date(startStr).getTime();
    const hoursUntil = (startMs - nowMs) / (1000 * 3600);
    const raw = ev.reminders;
    const reminders = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' ? Object.values(raw) : []);
    const sent = new Set(reminders.filter((x) => x && x.t).map((x) => x.t));

    for (const r of REMINDER_INTERVALS) {
      const lo = r.hours - 0.5;
      const hi = r.hours + 0.5;
      if (hoursUntil >= lo && hoursUntil <= hi && !sent.has(r.key)) {
        const label = ev.type === 'titan' ? 'Титан' : (ev.location || 'Выезд');
        const text = `⏰ Напоминание: ${r.label} до мероприятия\n\n${label}\n${ev.date} в ${ev.start_time || '18:00'}`;
        for (const chatId of CHAT_IDS) {
          try {
            await sendTelegram(chatId, text);
          } catch { /* ignore */ }
        }
        // Mark as sent
        const newReminders = [...reminders, { t: r.key, at: new Date().toISOString() }];
        await db.update('events', { id: ev.id }, { reminders: newReminders });
        break;
      }
    }
  }
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`T-POS Update Server on port ${PORT}`);
  setInterval(runEventReminders, 10 * 60 * 1000);
  setTimeout(runEventReminders, 30 * 1000);
  
  // Initialize WebSocket server
  initWebSocketServer(server);
  setupPostgresNotify().catch(e => console.error('[WS] Failed to setup PostgreSQL NOTIFY:', e));
});
