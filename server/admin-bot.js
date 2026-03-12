import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
const BOT_TOKEN = env.VITE_TELEGRAM_BOT_TOKEN || process.env.VITE_TELEGRAM_BOT_TOKEN;
const API_SECRET = env.API_SECRET || process.env.API_SECRET || '';
const API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const ALLOWED_CHAT_IDS = (env.OWNER_CHAT_IDS || process.env.OWNER_CHAT_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);

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

function formatEventDraft(params) {
    const typeLabel = params.type === 'titan' ? 'Титан' : 'Выезд';
    const loc = params.location || '—';
    const pay = params.payment_type === 'hourly' ? 'Почасовая' : `Фикс ${params.fixed_amount || 0}₽`;
    return `📅 <b>Всё верно?</b>\n\nТип: ${typeLabel}\nЛокация: ${loc}\nДата: ${params.date}\nВремя: ${params.start_time}\nОплата: ${pay}`;
}

const chatState = new Map(); // chatId -> { pendingEvent, mode }

const CONFIRM_KEYBOARD = {
    inline_keyboard: [
        [{ text: '✅ Подтвердить', callback_data: 'event_confirm' }],
        [{ text: '✏️ Изменить', callback_data: 'event_change' }],
    ],
};

async function callAi(messages, draft = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (API_SECRET) headers['Authorization'] = `Bearer ${API_SECRET}`;
    const body = { messages };
    if (draft) body.draft = draft;
    const res = await fetch('http://127.0.0.1:3100/api/ai', { method: 'POST', headers, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) return { error: data.details || data.error || `HTTP ${res.status}` };
    return data;
}

async function handleAiMessage(msg) {
    const chatId = msg.chat.id;
    const text = msg.text?.trim() || '';

    try {
        const state = chatState.get(chatId);
        let messages = [{ role: 'user', content: text }];
        let draft = null;

        if (state?.pendingEvent && state.mode === 'awaiting_changes') {
            const cancel = /^(отмена|отменить|cancel)$/i.test(text);
            if (cancel) {
                chatState.delete(chatId);
                await sendMessage(chatId, '❌ Создание отменено.');
                return;
            }
            draft = state.pendingEvent;
            messages = [{ role: 'user', content: `[Режим изменения] Пользователь: ${text}` }];
            chatState.delete(chatId);
        }

        console.log(`[AdminBot] Sending to AI: "${text}"${draft ? ' (edit mode)' : ''}`);
        const data = await callAi(messages, draft);

        if (!data.response && data.error) {
            await sendMessage(chatId, `❌ Ошибка ИИ: ${data.error}`);
            return;
        }

        const aiResponse = data.response || '';

        try {
            let jsonStr = aiResponse.trim();
            const jsonMatch = jsonStr.match(/\{[\s\S]*"action"[\s\S]*\}/);
            if (jsonMatch) jsonStr = jsonMatch[0];
            const parsed = JSON.parse(jsonStr);

            if (parsed.action === 'create_event' && parsed.params) {
                const params = parsed.params;
                const normParams = {
                    type: params.type || 'exit',
                    location: params.location ?? null,
                    date: params.date || new Date(Date.now() + 3 * 3600000).toISOString().split('T')[0],
                    start_time: params.start_time || '18:00',
                    payment_type: params.payment_type || 'fixed',
                    fixed_amount: params.fixed_amount ?? 0,
                    comment: params.comment ?? null,
                };

                chatState.set(chatId, { pendingEvent: normParams, mode: 'awaiting_confirmation' });
                await sendMessage(chatId, formatEventDraft(normParams), { reply_markup: CONFIRM_KEYBOARD });
                return;
            }

            if (parsed.action === 'list_events' || parsed.action === 'update_event' || parsed.action === 'create_check' || parsed.action === 'add_items') {
                const actionHeaders = { 'Content-Type': 'application/json' };
                if (API_SECRET) actionHeaders['Authorization'] = `Bearer ${API_SECRET}`;
                const actionRes = await fetch('http://127.0.0.1:3100/api/ai/action', {
                    method: 'POST',
                    headers: actionHeaders,
                    body: JSON.stringify({ action: parsed.action, params: parsed.params, staffId: null }),
                });
                const actionData = await actionRes.json();
                if (actionData.success) {
                    await sendMessage(chatId, `✅ ${actionData.message || 'Готово!'}`);
                } else {
                    await sendMessage(chatId, `❌ ${actionData.error}`);
                }
                return;
            }
        } catch { }

        await sendMessage(chatId, aiResponse);
    } catch (err) {
        console.error('Admin Bot AI Error:', err);
        await sendMessage(chatId, '⚠️ Не удалось связаться с сервером ИИ.');
    }
}

async function handleCallback(callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    if (data === 'event_confirm') {
        const state = chatState.get(chatId);
        chatState.delete(chatId);
        if (!state?.pendingEvent) {
            await tg('answerCallbackQuery', { callback_query_id: callbackQuery.id, text: 'Сессия истекла' });
            return;
        }
        const actionHeaders = { 'Content-Type': 'application/json' };
        if (API_SECRET) actionHeaders['Authorization'] = `Bearer ${API_SECRET}`;
        const actionRes = await fetch('http://127.0.0.1:3100/api/ai/action', {
            method: 'POST',
            headers: actionHeaders,
            body: JSON.stringify({ action: 'create_event', params: state.pendingEvent, staffId: null }),
        });
        const actionData = await actionRes.json();
        await tg('answerCallbackQuery', { callback_query_id: callbackQuery.id });
        if (actionData.success) {
            await sendMessage(chatId, `✅ ${actionData.message || 'Мероприятие создано!'}`);
        } else {
            await sendMessage(chatId, `❌ ${actionData.error}`);
        }
        return;
    }

    if (data === 'event_change') {
        const state = chatState.get(chatId);
        if (!state?.pendingEvent) {
            await tg('answerCallbackQuery', { callback_query_id: callbackQuery.id, text: 'Сессия истекла' });
            return;
        }
        state.mode = 'awaiting_changes';
        chatState.set(chatId, state);
        await tg('answerCallbackQuery', { callback_query_id: callbackQuery.id });
        await sendMessage(chatId, '✏️ Что изменить? Напишите, например:\n• время на 20:00\n• локация Офис\n• фикс 7000\n• почасовая');
        return;
    }

    await tg('answerCallbackQuery', { callback_query_id: callbackQuery.id });
}

async function main() {
    console.log('Admin Bot starting...');

    // Clear any previous webhooks to enable polling
    await tg('deleteWebhook', { drop_pending_updates: true });
    console.log('Webhook deleted, starting polling...');

    let pollOffset = 0;

    while (true) {
        try {
            const res = await fetch(`${API}/getUpdates?offset=${pollOffset}&timeout=30`);
            const json = await res.json();

            if (!json.ok) {
                console.error('Telegram API Error:', json);
                await new Promise(r => setTimeout(r, 5000));
                continue;
            }

            if (!json.result) {
                await new Promise(r => setTimeout(r, 3000));
                continue;
            }

            for (const update of json.result) {
                pollOffset = update.update_id + 1;
                if (update.callback_query) {
                    const senderId = String(update.callback_query.from.id);
                    if (ALLOWED_CHAT_IDS.length > 0 && !ALLOWED_CHAT_IDS.includes(senderId)) {
                        await tg('answerCallbackQuery', { callback_query_id: update.callback_query.id, text: 'Доступ запрещён' });
                        continue;
                    }
                    await handleCallback(update.callback_query);
                    continue;
                }
                if (update.message?.text) {
                    const senderId = String(update.message.from.id);
                    console.log(`[AdminBot] Message from ${senderId}: ${update.message.text}`);
                    if (ALLOWED_CHAT_IDS.length > 0 && !ALLOWED_CHAT_IDS.includes(senderId)) {
                        console.log(`[AdminBot] Unauthorized user ${senderId}, ignoring`);
                        await sendMessage(update.message.chat.id, '⛔ Доступ запрещён.');
                        continue;
                    }
                    await handleAiMessage(update.message);
                }
            }
        } catch (e) {
            console.error('Polling error:', e);
            await new Promise(r => setTimeout(r, 5000));
        }
    }
}

main();
