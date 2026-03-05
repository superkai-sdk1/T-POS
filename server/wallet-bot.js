import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = join(__dirname, '..');

function loadEnv() {
  try {
    const raw = readFileSync(join(PROJECT_DIR, '.env'), 'utf-8');
    const env = {};
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
    }
    return env;
  } catch { return {}; }
}

const env = loadEnv();
const BOT_TOKEN = env.CLIENT_BOT_TOKEN || process.env.CLIENT_BOT_TOKEN;
const SUPABASE_URL = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const WALLET_DOMAIN = env.WALLET_DOMAIN || process.env.WALLET_DOMAIN || 'wallet.cloudtitan.ru';
const WEBAPP_URL = `https://${WALLET_DOMAIN}`;

if (!BOT_TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing env vars: CLIENT_BOT_TOKEN, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const API = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function tg(method, body) {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function sendMessage(chatId, text, extra = {}) {
  return tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra });
}

async function answerCallback(callbackQueryId, text) {
  return tg('answerCallbackQuery', { callback_query_id: callbackQueryId, text });
}

const fmt = (n) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n);

async function findProfileByTgId(tgId) {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('tg_id', String(tgId))
    .single();
  return data;
}

async function findProfileByUsername(username) {
  if (!username) return null;
  const clean = username.replace(/^@/, '').toLowerCase();
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .ilike('tg_username', clean)
    .eq('role', 'client')
    .single();
  return data;
}

async function linkTgId(profileId, tgId) {
  await supabase.from('profiles').update({ tg_id: String(tgId) }).eq('id', profileId);
}

async function getClientsList() {
  const { data } = await supabase
    .from('profiles')
    .select('id, nickname, tg_id, tg_username')
    .eq('role', 'client')
    .is('tg_id', null)
    .order('nickname');
  return data || [];
}

async function getPendingRequest(tgId) {
  const { data } = await supabase
    .from('tg_link_requests')
    .select('*')
    .eq('tg_id', String(tgId))
    .eq('status', 'pending')
    .single();
  return data;
}

async function createLinkRequest(tgId, tgUsername, tgFirstName, profileId) {
  await supabase.from('tg_link_requests').insert({
    tg_id: String(tgId),
    tg_username: tgUsername || null,
    tg_first_name: tgFirstName || null,
    profile_id: profileId,
  });
}

function welcomeMessage(profile) {
  return (
    `<b>TITAN Wallet</b>\n\n` +
    `Привет, <b>${profile.nickname}</b>!\n\n` +
    `Твой баланс бонусов: <b>${fmt(profile.bonus_points)} баллов</b>\n` +
    (profile.balance < 0 ? `Долг: <b>${fmt(Math.abs(profile.balance))}₽</b>\n` : '') +
    `\nОткрой кошелёк, чтобы увидеть детали:`
  );
}

function walletButton(linkProfileId) {
  const url = linkProfileId
    ? `${WEBAPP_URL}?linkProfile=${linkProfileId}`
    : WEBAPP_URL;
  return {
    reply_markup: {
      inline_keyboard: [[
        { text: '💎 Открыть TITAN Wallet', web_app: { url } },
      ]],
    },
  };
}

async function handleStart(msg) {
  const chatId = msg.chat.id;
  const tgId = msg.from.id;
  const tgUsername = msg.from.username;
  const tgFirstName = msg.from.first_name;
  const startParam = msg.text?.split(' ')[1] || '';

  // Deep link: /start link_PROFILE_ID — auto-link from QR code
  if (startParam.startsWith('link_')) {
    const profileId = startParam.slice(5);
    let existing = await findProfileByTgId(tgId);
    if (existing) {
      await sendMessage(chatId, welcomeMessage(existing), walletButton());
      return;
    }

    const { data: target } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', profileId)
      .single();

    if (!target) {
      await sendMessage(chatId, '❌ Профиль не найден.');
      return;
    }

    if (target.tg_id && target.tg_id !== String(tgId)) {
      await sendMessage(chatId, `❌ Профиль <b>${target.nickname}</b> уже привязан к другому Telegram.`);
      return;
    }

    await linkTgId(target.id, tgId);
    if (tgUsername) {
      await supabase.from('profiles').update({ tg_username: tgUsername.toLowerCase() }).eq('id', target.id);
    }
    const linked = { ...target, tg_id: String(tgId) };
    await sendMessage(
      chatId,
      `✅ <b>Привязка выполнена!</b>\n\nТвой профиль: <b>${target.nickname}</b>\n\n` + welcomeMessage(linked),
      walletButton(profileId)
    );
    return;
  }

  let profile = await findProfileByTgId(tgId);

  if (profile) {
    await sendMessage(chatId, welcomeMessage(profile), walletButton());
    return;
  }

  profile = await findProfileByUsername(tgUsername);
  if (profile) {
    await linkTgId(profile.id, tgId);
    await sendMessage(chatId, welcomeMessage(profile), walletButton());
    return;
  }

  const pending = await getPendingRequest(tgId);
  if (pending) {
    await sendMessage(
      chatId,
      `⏳ <b>Заявка на привязку отправлена</b>\n\nОжидайте подтверждения от администратора.`
    );
    return;
  }

  const clients = await getClientsList();
  if (clients.length === 0) {
    await sendMessage(chatId, '❌ Нет доступных профилей для привязки. Обратитесь к администратору.');
    return;
  }

  const PAGE_SIZE = 8;
  await sendClientPage(chatId, tgFirstName, clients, 0, PAGE_SIZE);
}

async function sendClientPage(chatId, tgFirstName, clients, page, pageSize) {
  const start = page * pageSize;
  const slice = clients.slice(start, start + pageSize);
  const totalPages = Math.ceil(clients.length / pageSize);

  const keyboard = slice.map((c) => [
    { text: c.nickname, callback_data: `link:${c.id}` },
  ]);

  const nav = [];
  if (page > 0) nav.push({ text: '◀️ Назад', callback_data: `page:${page - 1}` });
  if (page < totalPages - 1) nav.push({ text: 'Далее ▶️', callback_data: `page:${page + 1}` });
  if (nav.length > 0) keyboard.push(nav);

  await sendMessage(
    chatId,
    `👋 <b>${tgFirstName || 'Привет'}</b>, выбери свой игровой никнейм:\n\n<i>Страница ${page + 1} из ${totalPages}</i>`,
    { reply_markup: { inline_keyboard: keyboard } }
  );
}

async function handleCallback(cb) {
  const chatId = cb.message.chat.id;
  const tgId = cb.from.id;
  const tgUsername = cb.from.username;
  const tgFirstName = cb.from.first_name;
  const data = cb.data;

  if (data.startsWith('page:')) {
    const page = parseInt(data.split(':')[1]);
    const clients = await getClientsList();
    await answerCallback(cb.id);
    try {
      await tg('editMessageText', {
        chat_id: chatId,
        message_id: cb.message.message_id,
        text: `👋 <b>${tgFirstName || 'Привет'}</b>, выбери свой игровой никнейм:\n\n<i>Страница ${page + 1} из ${Math.ceil(clients.length / 8)}</i>`,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: buildClientKeyboard(clients, page, 8),
        },
      });
    } catch { /* message unchanged */ }
    return;
  }

  if (data.startsWith('link:')) {
    const profileId = data.split(':')[1];
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', profileId)
      .single();

    if (!profile) {
      await answerCallback(cb.id, 'Профиль не найден');
      return;
    }

    if (profile.tg_id) {
      await answerCallback(cb.id, 'Этот профиль уже привязан');
      return;
    }

    await createLinkRequest(tgId, tgUsername, tgFirstName, profileId);
    await answerCallback(cb.id, 'Заявка отправлена!');

    try {
      await tg('editMessageText', {
        chat_id: chatId,
        message_id: cb.message.message_id,
        text: `✅ <b>Заявка отправлена</b>\n\nТы выбрал никнейм <b>${profile.nickname}</b>.\nОжидай подтверждения от администратора.`,
        parse_mode: 'HTML',
      });
    } catch { /* */ }

    await notifyOwnersAboutLinkRequest(tgFirstName, tgUsername, profile.nickname);
    return;
  }
}

function buildClientKeyboard(clients, page, pageSize) {
  const start = page * pageSize;
  const slice = clients.slice(start, start + pageSize);
  const totalPages = Math.ceil(clients.length / pageSize);

  const keyboard = slice.map((c) => [
    { text: c.nickname, callback_data: `link:${c.id}` },
  ]);

  const nav = [];
  if (page > 0) nav.push({ text: '◀️ Назад', callback_data: `page:${page - 1}` });
  if (page < totalPages - 1) nav.push({ text: 'Далее ▶️', callback_data: `page:${page + 1}` });
  if (nav.length > 0) keyboard.push(nav);

  return keyboard;
}

const OWNER_TOKEN = env.VITE_TELEGRAM_BOT_TOKEN || process.env.VITE_TELEGRAM_BOT_TOKEN;
const OWNER_CHAT_IDS = ['556525624', '1005574994'];

async function notifyOwnersAboutLinkRequest(tgName, tgUsername, nickname) {
  if (!OWNER_TOKEN) return;
  const uTag = tgUsername ? `@${tgUsername}` : tgName || '?';
  const text = `🔗 <b>Заявка на привязку</b>\n\nПользователь ${uTag} хочет привязаться к профилю <b>${nickname}</b>.\n\nПодтвердите в разделе «Клиенты».`;

  for (const chatId of OWNER_CHAT_IDS) {
    try {
      await fetch(`https://api.telegram.org/bot${OWNER_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      });
    } catch { /* */ }
  }
}

async function setupBonusNotifications() {
  const channel = supabase
    .channel('wallet-bonus-notifications')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'transactions', filter: 'type=eq.bonus_accrual' },
      async (payload) => {
        const tx = payload.new;
        if (!tx.player_id) return;

        const { data: profile } = await supabase
          .from('profiles')
          .select('tg_id, nickname, bonus_points')
          .eq('id', tx.player_id)
          .single();

        if (!profile?.tg_id) return;

        const text =
          `🎁 <b>Начисление бонусов!</b>\n\n` +
          `+<b>${fmt(tx.amount)}</b> баллов\n` +
          `${tx.description || ''}\n\n` +
          `Баланс: <b>${fmt(profile.bonus_points)} баллов</b>`;

        await sendMessage(profile.tg_id, text, walletButton());
      }
    )
    .subscribe();

  console.log('Subscribed to bonus notifications');
  return channel;
}

async function setupLinkApprovals() {
  supabase
    .channel('wallet-link-approvals')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'tg_link_requests' },
      async (payload) => {
        const req = payload.new;
        if (req.status !== 'approved') return;

        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', req.profile_id)
          .single();

        if (!profile) return;

        await linkTgId(profile.id, req.tg_id);

        const updatedProfile = { ...profile, tg_id: req.tg_id };
        await sendMessage(req.tg_id, welcomeMessage(updatedProfile), walletButton());
      }
    )
    .subscribe();

  console.log('Subscribed to link approvals');
}

const WEBHOOK_PORT = parseInt(env.WALLET_BOT_PORT || process.env.WALLET_BOT_PORT || '3001', 10);
const POS_DOMAIN = env.POS_DOMAIN || process.env.POS_DOMAIN || 'cloudtitan.ru';
const WEBHOOK_PATH = `/webhook/wallet-bot-${BOT_TOKEN.split(':')[0]}`;

async function handleUpdate(update) {
  try {
    if (update.message?.text?.startsWith('/start')) {
      await handleStart(update.message);
    } else if (update.callback_query) {
      await handleCallback(update.callback_query);
    }
  } catch (err) {
    console.error('Error handling update:', err);
  }
}

function startWebhookServer() {
  const server = createServer((req, res) => {
    if (req.method === 'POST' && req.url === WEBHOOK_PATH) {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
        try {
          const update = JSON.parse(body);
          handleUpdate(update);
        } catch (err) {
          console.error('Failed to parse update:', err);
        }
      });
    } else if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200);
      res.end('OK');
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  server.listen(WEBHOOK_PORT, '127.0.0.1', () => {
    console.log(`Webhook server listening on 127.0.0.1:${WEBHOOK_PORT}`);
  });
}

async function registerWebhook() {
  const webhookUrl = `https://${POS_DOMAIN}${WEBHOOK_PATH}`;
  const result = await tg('setWebhook', {
    url: webhookUrl,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: false,
  });
  if (result.ok) {
    console.log(`Webhook registered: ${webhookUrl}`);
  } else {
    console.error('Failed to register webhook:', result);
    console.log('Falling back to polling...');
    fallbackPoll();
  }
}

let pollOffset = 0;

async function fallbackPoll() {
  console.log('Starting fallback polling...');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  while (true) {
    try {
      const res = await fetch(`${API}/getUpdates?offset=${pollOffset}&timeout=30`);
      const json = await res.json();
      if (!json.ok || !json.result) { await sleep(3000); continue; }
      for (const update of json.result) {
        pollOffset = update.update_id + 1;
        await handleUpdate(update);
      }
    } catch {
      await sleep(5000);
    }
  }
}

async function main() {
  console.log('TITAN Wallet Bot starting...');

  try {
    await tg('setMyCommands', {
      commands: [{ command: 'start', description: 'Открыть кошелёк' }],
    });

    await tg('setChatMenuButton', {
      menu_button: {
        type: 'web_app',
        text: 'TITAN Wallet',
        web_app: { url: WEBAPP_URL },
      },
    });
  } catch (err) {
    console.error('Warning: Could not set bot commands:', err.message);
  }

  await setupBonusNotifications();
  await setupLinkApprovals();

  startWebhookServer();
  await registerWebhook();

  console.log('TITAN Wallet Bot ready');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
