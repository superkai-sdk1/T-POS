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
      if (!process.env[key]) process.env[key] = val;
    }
  }
} catch { }

function getVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(PROJECT_DIR, 'package.json'), 'utf-8'));
    return pkg.version || '0.0.0';
  } catch { return '0.0.0'; }
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function json(res, data, status = 200) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

let updateInProgress = false;

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/system/info' && req.method === 'GET') {
    let hash = '?', date = '?', branch = '?', behindCount = 0;
    try {
      hash = execSync('git rev-parse --short HEAD', { cwd: PROJECT_DIR }).toString().trim();
      date = execSync('git log -1 --format=%ci', { cwd: PROJECT_DIR }).toString().trim();
      branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: PROJECT_DIR }).toString().trim();
      execSync('git fetch origin --quiet', { cwd: PROJECT_DIR, timeout: 15000 });
      const behind = execSync(`git rev-list HEAD..origin/${branch} --count`, { cwd: PROJECT_DIR }).toString().trim();
      behindCount = parseInt(behind) || 0;
    } catch { }
    json(res, {
      version: getVersion(),
      git: { hash, date, branch },
      updateAvailable: behindCount > 0,
      behindCount,
      nodeVersion: process.version,
    });
    return;
  }

  if (url.pathname === '/api/system/update' && req.method === 'POST') {
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
      { label: 'Сброс локальных изменений', cmd: 'git', args: ['reset', '--hard', 'HEAD'] },
      { label: 'Загрузка обновлений', cmd: 'git', args: ['pull', 'origin', 'main'] },
      { label: 'Установка зависимостей', cmd: 'npm', args: ['ci', '--include=dev', '--loglevel=error'] },
      { label: 'Сборка проекта', cmd: 'npm', args: ['run', 'build'] },
      { label: 'Сборка Wallet', cmd: 'npm', args: ['run', 'build:wallet'] },
    ];

    let stepIdx = 0;

    const runStep = () => {
      if (stepIdx >= steps.length) {
        try { execSync('chown -R www-data:www-data dist', { cwd: PROJECT_DIR }); } catch { }
        try { execSync('chown -R www-data:www-data dist-wallet', { cwd: PROJECT_DIR }); } catch { }
        try { execSync('systemctl restart tpos-wallet-bot', { timeout: 5000 }); } catch { }
        try { execSync('systemctl restart tpos-update', { timeout: 5000 }); } catch { }
        send({ type: 'complete', message: 'Обновление завершено. Если добавлены новые таблицы — выполните SQL из supabase/migration.sql в Supabase Dashboard.' });
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
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const { messages, context } = JSON.parse(body);
        const GROQ_KEY = process.env.GROQ_API_KEY;
        const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
        const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;
        const groqUrl = 'https://api.groq.com/openai/v1/chat/completions';

        // --- Fetch compact database context from Supabase ---
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
          ] = await Promise.all([
            sbFetch('profiles', 'select=id,nickname,role,balance,bonus_points,client_tier,is_resident,created_at,deleted_at&order=created_at.desc&limit=200'),
            sbFetch('checks', 'select=id,player_id,total_amount,payment_method,bonus_used,closed_at&status=eq.closed&order=closed_at.desc&limit=200'),
            sbFetch('check_items', 'select=check_id,item_id,quantity,price_at_time&limit=1000'),
            sbFetch('inventory', 'select=id,name,category,price,stock_quantity,is_active&order=name'),
            sbFetch('expenses', 'select=category,amount,expense_date&order=expense_date.desc&limit=100'),
            sbFetch('supplies', 'select=total_cost,created_at&order=created_at.desc&limit=50'),
            sbFetch('cash_operations', 'select=type,amount,created_at&order=created_at.desc&limit=50'),
            sbFetch('shifts', 'select=status,cash_start,cash_end,opened_at,closed_at&order=opened_at.desc&limit=10'),
            sbFetch('events', 'select=id,type,location,date,start_time,status,comment&order=date.desc&limit=100'),
          ]);

          // Pre-aggregate data to keep context compact
          const staff = profiles.filter((p) => p.role === 'owner' || p.role === 'staff');
          const clients = profiles.filter((p) => p.role === 'client' && !p.deleted_at);
          const debtors = clients.filter((p) => p.balance < 0);

          // Aggregate product sales from check items
          const productSales = {};
          for (const ci of checkItems) {
            if (!productSales[ci.item_id]) productSales[ci.item_id] = { qty: 0, revenue: 0 };
            productSales[ci.item_id].qty += ci.quantity;
            productSales[ci.item_id].revenue += ci.quantity * ci.price_at_time;
          }
          const productStats = inventory.map((item) => {
            const sales = productSales[item.id] || { qty: 0, revenue: 0 };
            return { name: item.name, category: item.category, price: item.price, stock: item.stock_quantity, sold: sales.qty, revenue: sales.revenue };
          }).filter((p) => p.sold > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 20);

          // Aggregate payment methods
          const payments = { cash: 0, card: 0, debt: 0, bonus: 0 };
          let totalRevenue = 0;
          for (const c of checks) {
            totalRevenue += c.total_amount || 0;
            if (c.payment_method && payments.hasOwnProperty(c.payment_method)) {
              payments[c.payment_method] += c.total_amount || 0;
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

          dbContext = `\n\n=== ДАННЫЕ T-POS ===
ПЕРСОНАЛ: ${JSON.stringify(staff.map((p) => ({ nickname: p.nickname, role: p.role })))}
КЛИЕНТОВ: ${clients.length}, должников: ${debtors.length}
ТОП-20 КЛИЕНТОВ: ${JSON.stringify(topClients)}
ДОЛЖНИКИ: ${JSON.stringify(debtors.map((p) => ({ nickname: p.nickname, debt: p.balance })))}
ВЫРУЧКА: ${totalRevenue}₽ за ${checks.length} чеков, ср.чек: ${checks.length > 0 ? Math.round(totalRevenue / checks.length) : 0}₽
ОПЛАТА: ${JSON.stringify(payments)}
ТОП-20 ТОВАРОВ: ${JSON.stringify(productStats)}
РАСХОДЫ ПО КАТЕГОРИЯМ: ${JSON.stringify(expByCategory)}
ПОСТАВКИ: ${supplies.length} шт, сумма: ${supplies.reduce((s, x) => s + (x.total_cost || 0), 0)}₽
КАССА: ${JSON.stringify(cashOps.slice(0, 10).map((o) => ({ type: o.type, amount: o.amount })))}
ПОСЛЕДНИЕ СМЕНЫ: ${JSON.stringify(shifts.slice(0, 5).map((s) => ({ status: s.status, cash_start: s.cash_start, cash_end: s.cash_end, opened: s.opened_at, closed: s.closed_at })))}
МЕНЮ (все ${inventory.length} позиций): ${JSON.stringify(inventory.map((i) => ({ name: i.name, cat: i.category, price: i.price, stock: i.stock_quantity, active: i.is_active })))}
МЕРОПРИЯТИЯ (${events.length} всего): ${JSON.stringify(events.slice(0, 10).map((e) => ({ type: e.type, location: e.location, date: e.date, status: e.status })))}
===`;
        }

        // Inject DB context into system message
        const enrichedMessages = messages.map((m) => {
          if (m.role === 'system') {
            return { ...m, content: m.content + dbContext };
          }
          return m;
        });

        // If no system message exists, add one with DB context
        if (!enrichedMessages.find((m) => m.role === 'system') && dbContext) {
          enrichedMessages.unshift({
            role: 'system',
            content: `Ты — ИИ-ассистент POS-системы T-POS. У тебя есть доступ к инструментам для создания и просмотра мероприятий.

ИНСТРУМЕНТЫ:
1. create_event: { type: 'titan'|'exit', location: string, date: 'YYYY-MM-DD', start_time: 'HH:mm', payment_type: 'fixed'|'hourly', fixed_amount: number, comment: string }
2. list_events: { upcoming: boolean }
3. create_check: { playerNickname: string }
4. add_items: { checkId: string, items: [{ name: string, quantity: number }] }

Если пользователь просит создать мероприятие, ВЫЗЫВАЙ create_event в формате JSON-ответа: {"action": "create_event", "params": {...}}. 
Если пользователь спрашивает про планы, ВЫЗЫВАЙ list_events: {"action": "list_events", "params": {"upcoming": true}}.

Отвечай кратко и по делу после выполнения действия.${dbContext}`,
          });
        }

        const groqBody = {
          model: 'llama-3.3-70b-versatile',
          messages: enrichedMessages,
          temperature: 0.7,
          max_tokens: 8192,
        };

        const groqRes = await fetch(groqUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GROQ_KEY}`,
          },
          body: JSON.stringify(groqBody),
        });

        const data = await groqRes.json();

        if (!groqRes.ok) {
          console.error('Groq API Error:', data);
          json(res, {
            error: `Groq API error: ${groqRes.status}`,
            details: data.error?.message || 'Unknown error',
          }, 200);
          return;
        }

        const text = data?.choices?.[0]?.message?.content || 'Нет ответа';
        json(res, { response: text });
      } catch (e) {
        console.error('AI Route Error:', e);
        json(res, { error: String(e) }, 200);
      }
    });
    return;
  }

  // AI Agent Actions
  if (url.pathname === '/api/ai/action' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
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
            date: params.date || new Date().toISOString().split('T')[0],
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
          const query = params.upcoming ? 'status=neq.completed&date=gte.now()' : '';
          const eventsRes = await fetch(`${SUPABASE_URL}/rest/v1/events?${query}&order=date.asc,start_time.asc`, {
            headers: sbHeaders
          });
          const events = await eventsRes.json();
          json(res, { success: true, events });
          return;
        } else if (action === 'add_items') {
          const { checkId, items } = params; // items: [{ name, quantity }]
          const invRes = await fetch(
            `${SUPABASE_URL}/rest/v1/inventory?is_active=eq.true&select=id,name,price`,
            { headers: sbHeaders }
          );
          const inventory = await invRes.json();
          const added = [];
          let totalAdded = 0;

          for (const item of items) {
            const found = inventory.find((inv) => inv.name.toLowerCase().includes(item.name.toLowerCase()));
            if (found) {
              const qty = item.quantity || 1;
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

          // Update check total
          if (totalAdded > 0) {
            await fetch(`${SUPABASE_URL}/rest/v1/checks?id=eq.${checkId}`, {
              method: 'PATCH',
              headers: sbHeaders,
              body: JSON.stringify({ total_amount: totalAdded }),
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
        json(res, { error: String(e) }, 200);
      }
    });
    return;
  }

  json(res, { error: 'Not found' }, 404);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`T-POS Update Server on port ${PORT}`);
});
