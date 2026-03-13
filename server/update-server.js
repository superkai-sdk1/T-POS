import http from 'node:http';
import { spawn, execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
        send({ type: 'complete', message: 'Обновление завершено. Если добавлены новые таблицы — выполните SQL из supabase/migration.sql (или supabase/migrations/) в Supabase Dashboard → SQL Editor.' });
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

  // --- Shared: Build enriched messages for AI ---
  async function buildEnrichedMessages(messages, draft) {
    const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
    const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

    let dbContext = '';
    if (SUPABASE_URL && SUPABASE_KEY) {
      const sbHeaders = {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      };
      const sbFetch = (table, query = '') =>
        fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: sbHeaders })
          .then((r) => r.ok ? r.json() : [])
          .catch(() => []);

      const [
        profiles, checks, checkItems, inventory,
        expenses, supplies, cashOps, shifts, events,
        refunds, salaryPayments, supplyItems,
        checkPayments, refundItems, checkDiscounts,
        openChecks, certificates, transactions,
      ] = await Promise.all([
        sbFetch('profiles', 'select=id,nickname,role,balance,bonus_points,client_tier,is_resident,created_at,deleted_at&order=created_at.desc&limit=500'),
        sbFetch('checks', 'select=id,player_id,total_amount,payment_method,bonus_used,closed_at,staff_id,discount_total,note&status=eq.closed&order=closed_at.desc&limit=500'),
        sbFetch('check_items', 'select=check_id,item_id,quantity,price_at_time&limit=3000'),
        sbFetch('inventory', 'select=id,name,category,price,stock_quantity,is_active&order=name'),
        sbFetch('expenses', 'select=category,amount,expense_date,description&order=expense_date.desc&limit=200'),
        sbFetch('supplies', 'select=total_cost,created_at,supplier&order=created_at.desc&limit=100'),
        sbFetch('cash_operations', 'select=type,amount,created_at,description&order=created_at.desc&limit=100'),
        sbFetch('shifts', 'select=id,status,cash_start,cash_end,opened_at,closed_at,staff_id&order=opened_at.desc&limit=20'),
        sbFetch('events', `status=neq.completed&date=gte.${new Date(Date.now() + 3 * 3600000).toISOString().split('T')[0]}&order=date.asc&limit=20`),
        sbFetch('refunds', 'select=id,check_id,total_amount,refund_type,created_at,created_by&order=created_at.desc&limit=100'),
        sbFetch('salary_payments', 'select=amount,created_at,payment_method,profile_id&order=created_at.desc&limit=50'),
        sbFetch('supply_items', 'select=item_id,cost_per_unit,quantity&limit=500'),
        sbFetch('check_payments', 'select=check_id,method,amount&limit=1000'),
        sbFetch('refund_items', 'select=refund_id,item_id,quantity,price_at_time&limit=500'),
        sbFetch('check_discounts', 'select=check_id,type,value,amount&limit=500'),
        sbFetch('checks', 'select=id,player_id,total_amount,status,created_at,note&status=eq.open&order=created_at.desc&limit=20'),
        sbFetch('certificates', 'select=id,code,amount,balance,is_active,created_at,used_by&order=created_at.desc&limit=50'),
        sbFetch('transactions', 'select=profile_id,type,amount,description,created_at&order=created_at.desc&limit=200'),
      ]);

      const staff = profiles.filter((p) => p.role === 'owner' || p.role === 'staff');
      const clients = profiles.filter((p) => p.role === 'client' && !p.deleted_at);
      const debtors = clients.filter((p) => p.balance < 0);

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

      const refundByCheck = {};
      let totalRefunded = 0;
      for (const r of refunds) {
        refundByCheck[r.check_id] = (refundByCheck[r.check_id] || 0) + (r.total_amount || 0);
        totalRefunded += r.total_amount || 0;
      }

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

      const expByCategory = {};
      for (const e of expenses) {
        expByCategory[e.category] = (expByCategory[e.category] || 0) + Number(e.amount);
      }

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

      // Build lookup maps
      const profileMap = {};
      for (const p of profiles) profileMap[p.id] = p.nickname;
      const itemNameMap = {};
      for (const i of inventory) itemNameMap[i.id] = i.name;

      // Check items by check
      const itemsByCheck = {};
      for (const ci of checkItems) {
        if (!itemsByCheck[ci.check_id]) itemsByCheck[ci.check_id] = [];
        itemsByCheck[ci.check_id].push({ name: itemNameMap[ci.item_id] || '?', qty: ci.quantity, price: ci.price_at_time });
      }

      // Split payments by check
      const splitByCheck = {};
      for (const cp of checkPayments) {
        if (!splitByCheck[cp.check_id]) splitByCheck[cp.check_id] = [];
        splitByCheck[cp.check_id].push({ method: cp.method, amount: cp.amount });
      }

      // Refund items by refund
      const refItemsByRefund = {};
      for (const ri of refundItems) {
        if (!refItemsByRefund[ri.refund_id]) refItemsByRefund[ri.refund_id] = [];
        refItemsByRefund[ri.refund_id].push({ name: itemNameMap[ri.item_id] || '?', qty: ri.quantity, price: ri.price_at_time });
      }

      // Detailed refunds
      const detailedRefunds = refunds.slice(0, 30).map((r) => {
        const checkInfo = checks.find((c) => c.id === r.check_id);
        return {
          player: checkInfo ? (profileMap[checkInfo.player_id] || 'Гость') : '?',
          amount: r.total_amount,
          type: r.refund_type,
          who: profileMap[r.created_by] || '?',
          date: r.created_at,
          items: refItemsByRefund[r.id] || [],
        };
      });

      // Staff on shifts
      const shiftStaff = shifts.slice(0, 10).map((s) => ({
        admin: profileMap[s.staff_id] || '?',
        status: s.status,
        cash_start: s.cash_start,
        cash_end: s.cash_end,
        opened: s.opened_at,
        closed: s.closed_at,
      }));

      // Open checks
      const openChecksList = (openChecks || []).map((c) => ({
        player: profileMap[c.player_id] || 'Гость',
        total: c.total_amount,
        created: c.created_at,
        note: c.note,
        items: itemsByCheck[c.id] || [],
      }));

      // Recent transactions
      const recentTransactions = (transactions || []).slice(0, 50).map((t) => ({
        player: profileMap[t.profile_id] || '?',
        type: t.type,
        amount: t.amount,
        desc: t.description,
        date: t.created_at,
      }));

      // Salary with names
      const salaryDetailed = salaryPayments.slice(0, 20).map((sp) => ({
        who: profileMap[sp.profile_id] || '?',
        amount: sp.amount,
        method: sp.payment_method,
        date: sp.created_at,
      }));

      dbContext = `\n\n=== ДАННЫЕ T-POS (актуальные из БД) ===
АНАЛИТИКА ЗА НЕДЕЛЮ: выручка ${weekRevenue}₽, чеков ${weekChecks}, возвраты ${weekRefunded}₽, себестоимость ${Math.round(weekCogs)}₽, расходы ${Math.round(weekExpenses)}₽, прибыль ${weekProfit}₽, маржа ${weekMargin}%. Предыдущая неделя: ${prevWeekRevenue}₽. Динамика: ${weekDelta}%.
ТОП ТОВАРОВ ЗА НЕДЕЛЮ: ${JSON.stringify(weekTopProducts)}.
ПЕРСОНАЛ: ${JSON.stringify(staff.map((p) => ({ nickname: p.nickname, role: p.role })))}
КЛИЕНТОВ: ${clients.length}, должников: ${debtors.length}
ТОП-20 КЛИЕНТОВ: ${JSON.stringify(topClients)}
ДОЛЖНИКИ: ${JSON.stringify(debtors.map((p) => ({ nickname: p.nickname, debt: p.balance })))}
ВЫРУЧКА: ${totalRevenue}₽ за ${checks.length} чеков (возвраты: ${totalRefunded}₽), ср.чек: ${checks.length > 0 ? Math.round(totalRevenue / checks.length) : 0}₽
ОПЛАТА: ${JSON.stringify(payments)}
ТОП-20 ТОВАРОВ: ${JSON.stringify(productStats)}
РАСХОДЫ ПО КАТЕГОРИЯМ: ${JSON.stringify(expByCategory)}
РАСХОДЫ ДЕТАЛЬНО (последние 30): ${JSON.stringify(expenses.slice(0, 30).map((e) => ({ cat: e.category, amount: e.amount, date: e.expense_date, desc: e.description })))}
ПОСТАВКИ: ${supplies.length} шт, сумма: ${supplies.reduce((s, x) => s + (x.total_cost || 0), 0)}₽, последние: ${JSON.stringify(supplies.slice(0, 10).map((s) => ({ cost: s.total_cost, supplier: s.supplier, date: s.created_at })))}
ВОЗВРАТЫ ПОДРОБНО (последние 30): ${JSON.stringify(detailedRefunds)}
ЗАРПЛАТЫ: ${JSON.stringify(salaryDetailed)}
КАССА ОПЕРАЦИИ: ${JSON.stringify(cashOps.slice(0, 30).map((o) => ({ type: o.type, amount: o.amount, desc: o.description, date: o.created_at })))}
СМЕНЫ (кто работал): ${JSON.stringify(shiftStaff)}
ОТКРЫТЫЕ ЧЕКИ СЕЙЧАС: ${JSON.stringify(openChecksList)}
ПОСЛЕДНИЕ 50 ЧЕКОВ С ПОЗИЦИЯМИ (кто что купил): ${JSON.stringify(checks.slice(0, 50).map((c) => ({
        player: profileMap[c.player_id] || 'Гость',
        total: c.total_amount,
        method: c.payment_method,
        bonus: c.bonus_used || 0,
        discount: c.discount_total || 0,
        note: c.note,
        date: c.closed_at,
        items: itemsByCheck[c.id] || [],
        split: splitByCheck[c.id] || null,
      })))}
СЕРТИФИКАТЫ: ${JSON.stringify((certificates || []).map((c) => ({ code: c.code, nominal: c.amount, balance: c.balance, active: c.is_active, created: c.created_at })))}
ТРАНЗАКЦИИ БАЛАНСОВ (последние 50): ${JSON.stringify(recentTransactions)}
МЕНЮ (все ${inventory.length} позиций): ${JSON.stringify(inventory.map((i) => ({ name: i.name, cat: i.category, price: i.price, stock: i.stock_quantity, active: i.is_active })))}
МЕРОПРИЯТИЯ (предстоящие, с id для update_event): ${JSON.stringify(events.slice(0, 20).map((e) => ({ id: e.id, type: e.type, location: e.location, date: e.date, start_time: e.start_time, payment_type: e.payment_type, fixed_amount: e.fixed_amount, status: e.status, comment: e.comment })))}
(ВНИМАНИЕ: Даты в списке могут быть старыми. ИСПОЛЬЗУЙ ТЕКУЩИЙ ГОД ИЗ СЕКЦИИ "СЕЙЧАС" ДЛЯ НОВЫХ ЗАПИСЕЙ!)
===`;
    }

    const now2 = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'long', timeStyle: 'short' });
    const systemPromptHeader = `СЕЙЧАС (МСК): ${now2}.
ТЕКУЩИЙ ГОД: 2026.
ИГНОРИРУЙ любые мысли о 2024 годе. Если ты создаешь мероприятие без указания года, ВСЕГДА используй 2026.
Ты — ИИ-ассистент POS-системы T-POS.
BUILD_ID: 20260306_v8_ULTRA_FIX
ВАЖНО: Сегодня 2026 год. Игнорируй любые упоминания 2024 года в истории, если они противоречат здравому смыслу. Все новые мероприятия создавай на 2026 год.
ИДЕНТИФИКАЦИЯ: Если пользователь спрашивает "кто ты", отвечай что ты ассистент T-POS.

ВОПРОСЫ ПО СИСТЕМЕ — ОТВЕЧАЙ НА ЛЮБЫЕ:
У тебя есть ПОЛНЫЙ ДОСТУП ко всем данным T-POS в секции ДАННЫЕ T-POS. Ты можешь и ДОЛЖЕН отвечать на ЛЮБЫЕ вопросы по системе:
- Кто что покупал (ПОСЛЕДНИЕ 50 ЧЕКОВ С ПОЗИЦИЯМИ — там есть player, items, date)
- Кто делал возвраты и каких товаров (ВОЗВРАТЫ ПОДРОБНО — player, items, who, type)
- Кто работал на смене, когда, сколько в кассе (СМЕНЫ — admin, opened, closed, cash)
- Открытые чеки прямо сейчас (ОТКРЫТЫЕ ЧЕКИ СЕЙЧАС)
- Какие сертификаты есть, их баланс (СЕРТИФИКАТЫ)
- История пополнений/списаний баланса клиентов (ТРАНЗАКЦИИ БАЛАНСОВ)
- Зарплаты: кому, сколько, когда (ЗАРПЛАТЫ)
- Расходы: детали каждого расхода (РАСХОДЫ ДЕТАЛЬНО)
- Поставки: от кого, на сколько (ПОСТАВКИ)
- Кассовые операции: внесения, изъятия с описанием (КАССА ОПЕРАЦИИ)
- Сплит-оплаты: кто чем платил (split поле в чеках)
- Скидки, бонусы (bonus, discount поля в чеках)
- Аналитика за неделю, маржа, прибыль, динамика
- Должники, топ клиентов, топ товаров
Используй конкретные цифры и имена из данных. Не говори "у меня нет информации" — ИЩИ В ДАННЫХ.
Не возвращай JSON для аналитических вопросов, отвечай текстом.

ИНСТРУМЕНТЫ (возвращай JSON только для действий):
1. create_event: { type, location, date, start_time, payment_type, fixed_amount, comment }
2. list_events: { upcoming: boolean } — показать мероприятия
3. update_event: { event_id: string, type?, location?, date?, start_time?, payment_type?, fixed_amount?, comment?, status? } — изменить мероприятие по id
4. create_check: { playerNickname: string }
5. add_items: { checkId: string, items: [{ name: string, quantity: number }] }

СОЗДАНИЕ МЕРОПРИЯТИЙ (create_event):
Когда пользователь пишет о мероприятии (выезд, титан, бронь и т.п.) — ВСЕГДА отвечай ТОЛЬКО JSON: {"action": "create_event", "params": {...}}.
Парсинг из текста:
- type: "титан"|"в титане"|"в клубе"|"клуб" → type: "titan", location: null
- type: "выезд"|"выездное"|"на локации"|"на выезде" → type: "exit", location: из текста (адрес/место) или "Выезд"
- date: "завтра" → завтрашняя дата, "15 марта"|"15.03" → 2026-03-15, "в субботу" → ближайшая суббота
- start_time: "19:00"|"в 7"|"в 7 вечера" → "19:00", "14:30"|"в 2 дня"|"в 14:30" → "14:30"
- payment_type: "почасовая"|"по часам"|"часовая" → "hourly", fixed_amount: 0
- payment_type: "фиксированная"|"фикс"|"5000"|"5к" → "fixed", fixed_amount: число из текста (5000, 3000 и т.д.)
Если оплата не указана → payment_type: "fixed", fixed_amount: 0
Если дата не указана → сегодня или завтра по контексту
Если время не указано → "18:00"

Примеры: "Выезд 15 марта в 19:00 почасовая" → {"action":"create_event","params":{"type":"exit","location":"Выезд","date":"2026-03-15","start_time":"19:00","payment_type":"hourly","fixed_amount":0,"comment":null}}
"Титан завтра в 18:00 фикс 5000" → вычисли date завтра от СЕЙЧАС, params: type:"titan", location:null, start_time:"18:00", payment_type:"fixed", fixed_amount:5000

ЗАПРОСЫ ПО МЕРОПРИЯТИЯМ:
- "какие мероприятия?", "что на этой неделе?", "планы на завтра?", "расскажи про мероприятия" → list_events: {"action":"list_events","params":{"upcoming":true}}
- "перенеси на 20:00", "измени время/дату/локацию", "отмени" → update_event с event_id из МЕРОПРИЯТИЯ (id в списке). При отмене: status:"cancelled". При переносе: date и/или start_time.

Для вопросов без действия (аналитика, отчёты) — отвечай текстом, не JSON.

РЕЖИМ ИЗМЕНЕНИЯ (когда передан draft):
Если в запросе есть draft — это черновик мероприятия. Пользователь хочет что-то изменить. Примени его правки к draft и верни обновлённый JSON: {"action": "create_event", "params": {...}}.
Примеры правок: "время на 20:00" → start_time: "20:00"; "локация Офис" → location: "Офис"; "фикс 7000" → payment_type: "fixed", fixed_amount: 7000; "почасовая" → payment_type: "hourly", fixed_amount: 0.
Отвечай ТОЛЬКО JSON. (Год 2026!)`;

    const draftHint = draft ? `\n\nЧЕРНОВИК ДЛЯ ИЗМЕНЕНИЯ: ${JSON.stringify(draft)}\nПользователь написал правки. Примени их и верни обновлённый create_event.` : '';

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

    return enrichedMessages;
  }

  // --- /api/ai (non-streaming, original) ---
  if (url.pathname === '/api/ai' && req.method === 'POST') {
    if (!checkAuth(req, res)) return;
    readBody(req).then(async (body) => {
      try {
        const { messages, context, draft } = JSON.parse(body);
        const POLZA_KEY = process.env.POLZA_AI_API_KEY;
        const aiUrl = 'https://polza.ai/api/v1/chat/completions';

        const enrichedMessages = await buildEnrichedMessages(messages, draft);

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

        const text = data?.choices?.[0]?.message?.content || 'Нет ответа';
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

  // --- /api/ai/stream (SSE streaming) ---
  if (url.pathname === '/api/ai/stream' && req.method === 'POST') {
    if (!checkAuth(req, res)) return;
    readBody(req).then(async (body) => {
      try {
        const { messages, draft } = JSON.parse(body);
        const POLZA_KEY = process.env.POLZA_AI_API_KEY;
        const aiUrl = 'https://polza.ai/api/v1/chat/completions';

        const enrichedMessages = await buildEnrichedMessages(messages, draft);

        if (!POLZA_KEY) {
          cors(res);
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
          res.write(`data: ${JSON.stringify({ error: 'Missing POLZA_AI_API_KEY' })}\n\n`);
          res.end();
          return;
        }

        const aiBody = {
          model: 'google/gemini-2.5-flash-lite-preview-09-2025',
          messages: enrichedMessages,
          temperature: 0.7,
          max_tokens: 4096,
          stream: true,
        };

        let aiRes;
        let attempts = 0;
        const maxAttempts = 3;

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
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          break;
        }

        cors(res);
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });

        if (!aiRes.ok) {
          const errData = await aiRes.text();
          res.write(`data: ${JSON.stringify({ error: `AI API ${aiRes.status}`, details: errData })}\n\n`);
          res.end();
          return;
        }

        // Parse SSE stream from Polza.ai using async iteration (Web ReadableStream)
        let fullText = '';
        let buffer = '';
        const decoder = new TextDecoder();

        try {
          for await (const chunk of aiRes.body) {
            buffer += decoder.decode(chunk, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith('data: ')) continue;
              const payload = trimmed.slice(6);
              if (payload === '[DONE]') continue;
              try {
                const parsed = JSON.parse(payload);
                const token = parsed.choices?.[0]?.delta?.content || '';
                if (token) {
                  fullText += token;
                  res.write(`data: ${JSON.stringify({ token })}\n\n`);
                }
              } catch { /* skip unparseable lines */ }
            }
          }
        } catch (streamErr) {
          console.error('Stream read error:', streamErr);
        }

        // Process remaining buffer
        if (buffer.trim()) {
          const trimmed = buffer.trim();
          if (trimmed.startsWith('data: ') && trimmed.slice(6) !== '[DONE]') {
            try {
              const parsed = JSON.parse(trimmed.slice(6));
              const token = parsed.choices?.[0]?.delta?.content || '';
              if (token) fullText += token;
            } catch { }
          }
        }

        res.write(`data: ${JSON.stringify({ done: true, full: fullText })}\n\n`);
        res.end();

      } catch (e) {
        console.error('AI Stream Error:', e);
        cors(res);
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
        res.write(`data: ${JSON.stringify({ error: String(e) })}\n\n`);
        res.end();
      }
    }).catch((e) => {
      cors(res);
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      res.write(`data: ${JSON.stringify({ error: String(e) })}\n\n`);
      res.end();
    });
    return;
  }

  // AI Agent Actions
  if (url.pathname === '/api/ai/action' && req.method === 'POST') {
    if (!checkAuth(req, res)) return;
    readBody(req).then(async (body) => {
      try {
        const { action, params, staffId } = JSON.parse(body);
        const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
        const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

        if (!SUPABASE_URL || !SUPABASE_KEY) {
          json(res, { error: 'Supabase не настроен' }, 200);
          return;
        }

        const sbHeaders = {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        };

        if (action === 'create_check') {
          // Find player by nickname
          const playerRes = await fetch(
            `${SUPABASE_URL}/rest/v1/profiles?nickname=ilike.${encodeURIComponent(params.playerNickname)}&role=eq.client&limit=1`,
            { headers: sbHeaders }
          );
          const players = await playerRes.json();
          if (!players.length) {
            json(res, { success: false, error: `Игрок "${params.playerNickname}" не найден` });
            return;
          }

          const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/checks`, {
            method: 'POST',
            headers: sbHeaders,
            body: JSON.stringify({
              player_id: players[0].id,
              staff_id: staffId || null,
              status: 'open',
              total_amount: 0,
              bonus_used: 0,
              discount_total: 0,
            }),
          });
          const check = await checkRes.json();
          json(res, { success: true, message: `Чек для ${players[0].nickname} создан`, check: check[0] || check });
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

          const eventRes = await fetch(`${SUPABASE_URL}/rest/v1/events`, {
            method: 'POST',
            headers: sbHeaders,
            body: JSON.stringify(eventData),
          });

          if (!eventRes.ok) {
            const err = await eventRes.json();
            json(res, { success: false, error: err.message || 'Ошибка создания мероприятия' });
            return;
          }

          const event = await eventRes.json();
          json(res, {
            success: true,
            message: `Мероприятие "${eventData.type === 'titan' ? 'Титан' : eventData.location}" на ${eventData.date} создано`,
            event: event[0] || event
          });
          return;
        }

        if (action === 'list_events') {
          const today = new Date(Date.now() + 3 * 3600000).toISOString().split('T')[0];
          const query = params.upcoming !== false ? `status=in.(planned,active)&date=gte.${today}` : '';
          const eventsRes = await fetch(`${SUPABASE_URL}/rest/v1/events?${query}&order=date.asc,start_time.asc&limit=30`, {
            headers: sbHeaders
          });
          const evList = await eventsRes.json();
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
          const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/events?id=eq.${encodeURIComponent(event_id)}`, {
            method: 'PATCH',
            headers: sbHeaders,
            body: JSON.stringify(payload),
          });
          if (!patchRes.ok) {
            const err = await patchRes.json();
            json(res, { success: false, error: err.message || 'Ошибка обновления' });
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
          const invRes = await fetch(
            `${SUPABASE_URL}/rest/v1/inventory?is_active=eq.true&select=id,name,price`,
            { headers: sbHeaders }
          );
          const inventory = await invRes.json();
          const added = [];
          let totalAdded = 0;

          for (const item of items) {
            const nameLower = (item.name || '').toLowerCase();
            const found = inventory.find((inv) => inv.name.toLowerCase() === nameLower)
              || inventory.find((inv) => inv.name.toLowerCase().includes(nameLower));
            if (found) {
              const qty = Math.max(1, parseInt(item.quantity) || 1);
              await fetch(`${SUPABASE_URL}/rest/v1/check_items`, {
                method: 'POST',
                headers: sbHeaders,
                body: JSON.stringify({
                  check_id: checkId,
                  item_id: found.id,
                  quantity: qty,
                  price_at_time: found.price,
                }),
              });
              added.push({ name: found.name, qty, price: found.price });
              totalAdded += found.price * qty;
            }
          }

          if (totalAdded > 0) {
            const checkRes = await fetch(
              `${SUPABASE_URL}/rest/v1/checks?id=eq.${encodeURIComponent(checkId)}&select=total_amount`,
              { headers: sbHeaders }
            );
            const checkData = await checkRes.json();
            const currentTotal = (checkData && checkData[0] && checkData[0].total_amount) || 0;
            await fetch(`${SUPABASE_URL}/rest/v1/checks?id=eq.${encodeURIComponent(checkId)}`, {
              method: 'PATCH',
              headers: sbHeaders,
              body: JSON.stringify({ total_amount: currentTotal + totalAdded }),
            });
          }

          json(res, { success: true, message: `Добавлено ${added.length} позиций на ${totalAdded}₽`, added });

        } else if (action === 'list_menu') {
          const invRes = await fetch(
            `${SUPABASE_URL}/rest/v1/inventory?is_active=eq.true&select=name,category,price,stock_quantity&order=category,name`,
            { headers: sbHeaders }
          );
          const menu = await invRes.json();
          json(res, { success: true, menu });

        } else if (action === 'list_players') {
          const plRes = await fetch(
            `${SUPABASE_URL}/rest/v1/profiles?role=eq.client&deleted_at=is.null&select=nickname,balance,bonus_points,client_tier&order=nickname&limit=50`,
            { headers: sbHeaders }
          );
          const players = await plRes.json();
          json(res, { success: true, players });

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
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;
  const BOT_TOKEN = process.env.VITE_TELEGRAM_BOT_TOKEN;
  const CHAT_IDS = (process.env.OWNER_CHAT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!SUPABASE_URL || !SUPABASE_KEY || !BOT_TOKEN || CHAT_IDS.length === 0) return;

  const today = new Date(Date.now() + 3 * 3600000).toISOString().split('T')[0];
  const sbHeaders = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/events?status=in.(planned,active)&date=gte.${today}&order=date.asc,start_time.asc`, { headers: sbHeaders });
  const events = await res.json();
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
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
            });
          } catch (e) {
            console.warn('[Reminders] Telegram send error:', e);
          }
        }
        const updated = [...reminders, { t: r.key, at: new Date().toISOString() }];
        await fetch(`${SUPABASE_URL}/rest/v1/events?id=eq.${ev.id}`, {
          method: 'PATCH',
          headers: sbHeaders,
          body: JSON.stringify({ reminders: updated }),
        });
        break;
      }
    }
  }
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`T-POS Update Server on port ${PORT}`);
  setInterval(runEventReminders, 10 * 60 * 1000);
  setTimeout(runEventReminders, 30 * 1000);
});
