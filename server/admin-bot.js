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
const API_BASE = env.API_URL || process.env.API_URL || 'http://127.0.0.1:3100';
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

const TG_MAX_LEN = 4096;

async function sendMessage(chatId, text, extra = {}) {
    return tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra });
}

async function sendPlainMessage(chatId, text) {
    if (!text || !String(text).trim()) return;
    const str = String(text).trim();
    const parts = [];
    for (let i = 0; i < str.length; i += TG_MAX_LEN) {
        parts.push(str.slice(i, i + TG_MAX_LEN));
    }
    for (const part of parts) {
        await tg('sendMessage', { chat_id: chatId, text: part });
    }
}

function formatEventDraft(params) {
    const typeLabel = params.type === 'titan' ? 'Титан' : 'Выезд';
    const loc = params.location || '—';
    const pay = params.payment_type === 'hourly' ? 'Почасовая' : `Фикс ${params.fixed_amount || 0}₽`;
    return `📅 <b>Всё верно?</b>\n\nТип: ${typeLabel}\nЛокация: ${loc}\nДата: ${params.date}\nВремя: ${params.start_time}\nОплата: ${pay}`;
}

const chatState = new Map(); // chatId -> { pendingEvent, mode }
const chatHistory = new Map(); // chatId -> [{ role, content }]
const MAX_HISTORY = 12; // последние 6 обменов для контекста

function trimHistory(history) {
    if (history.length <= MAX_HISTORY) return history;
    return history.slice(-MAX_HISTORY);
}

function stripMarkdown(text) {
    if (typeof text !== 'string') return String(text);
    return text
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/__(.+?)__/g, '$1')
        .replace(/_(.+?)_/g, '$1')
        .replace(/`(.+?)`/g, '$1')
        .replace(/^[-*]\s+/gm, '• ')
        .replace(/^\d+\.\s+/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

const CONFIRM_KEYBOARD = {
    inline_keyboard: [
        [{ text: '✅ Подтвердить', callback_data: 'event_confirm' }],
        [{ text: '✏️ Изменить', callback_data: 'event_change' }],
    ],
};

const MAIN_MENU_KEYBOARD = {
    keyboard: [
        [{ text: '📊 Отчёт за день' }, { text: '⚠️ Должники' }, { text: '📋 Открытые чеки' }],
        [{ text: '🛒 Что заказать' }, { text: '📅 Мероприятия' }, { text: '🍽 Меню' }],
        [{ text: '📦 Поставки' }, { text: '📉 Расходы' }, { text: '👥 Клиенты' }],
        [{ text: '🔄 Скрыть кнопки' }],
    ],
    resize_keyboard: true,
    one_time_keyboard: false,
};

const QUICK_ACTIONS_INLINE = {
    inline_keyboard: [
        [
            { text: '📊 Отчёт', callback_data: 'q_report_today' },
            { text: '⚠️ Должники', callback_data: 'q_list_debtors' },
            { text: '📋 Чеки', callback_data: 'q_open_checks' },
        ],
        [
            { text: '🛒 Склад', callback_data: 'q_stock_alert' },
            { text: '📅 События', callback_data: 'q_list_events' },
            { text: '🍽 Меню', callback_data: 'q_list_menu' },
        ],
        [
            { text: '📦 Поставки', callback_data: 'q_supply_summary' },
            { text: '📉 Расходы (нед)', callback_data: 'q_expense_week' },
            { text: '📉 Расходы (мес)', callback_data: 'q_expense_month' },
        ],
    ],
};

const QUICK_TEXT_MAP = {
    '📊 отчёт за день': 'report_today',
    'отчёт за день': 'report_today',
    'отчет за день': 'report_today',
    'отчёт сегодня': 'report_today',
    'отчет сегодня': 'report_today',
    '⚠️ должники': 'list_debtors',
    'должники': 'list_debtors',
    '📋 открытые чеки': 'open_checks',
    'открытые чеки': 'open_checks',
    'открытые': 'open_checks',
    '🛒 что заказать': 'stock_alert',
    'что заказать': 'stock_alert',
    'склад': 'stock_alert',
    'дефицит': 'stock_alert',
    '📅 мероприятия': 'list_events',
    'мероприятия': 'list_events',
    'события': 'list_events',
    '🍽 меню': 'list_menu',
    'меню': 'list_menu',
    '📦 поставки': 'supply_summary',
    'поставки': 'supply_summary',
    'закупки': 'supply_summary',
    '📉 расходы': 'expense_summary',
    'расходы': 'expense_summary',
    '👥 клиенты': 'list_players',
    'клиенты': 'list_players',
};

async function execQuickAction(chatId, action, params = {}) {
    const actionHeaders = { 'Content-Type': 'application/json' };
    if (API_SECRET) actionHeaders['Authorization'] = `Bearer ${API_SECRET}`;
    try {
        const res = await fetch(`${API_BASE}/api/ai/action`, {
            method: 'POST',
            headers: actionHeaders,
            body: JSON.stringify({ action, params, staffId: null }),
        });
        const data = await res.json();
        if (data.success && data.message) return data.message;
        return data.error ? `❌ ${data.error}` : 'Готово!';
    } catch (err) {
        console.error('[AdminBot] Quick action error:', err);
        return `❌ ${err.message}`;
    }
}

function getQuickActionFromText(text) {
    const normalized = text.toLowerCase().trim();
    return QUICK_TEXT_MAP[normalized] || null;
}

async function callAi(messages, draft = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (API_SECRET) headers['Authorization'] = `Bearer ${API_SECRET}`;
    const body = { messages };
    if (draft) body.draft = draft;
    try {
        const res = await fetch(`${API_BASE}/api/ai`, { method: 'POST', headers, body: JSON.stringify(body) });
        let data;
        try {
            data = await res.json();
        } catch {
            return { error: res.ok ? 'Неверный ответ сервера' : `HTTP ${res.status}` };
        }
        if (!res.ok) return { error: data.details || data.error || `HTTP ${res.status}` };
        return data;
    } catch (err) {
        console.error('[AdminBot] API request failed:', err.message);
        return { error: err.message || 'Сервер недоступен. Запущен ли update-server на порту 3100?' };
    }
}

async function handleAiMessage(msg) {
    const chatId = msg.chat.id;
    const text = msg.text?.trim() || '';

    try {
        // /start — приветствие и меню
        if (/^\/start$/i.test(text)) {
            await sendMessage(chatId,
                '👋 <b>TITAN AI</b>\n\nБот для управления клубом. Пишите вопросы или нажимайте кнопки для быстрых действий.\n\nКоманды:\n/menu — показать кнопки\n/clear — сбросить контекст',
                { reply_markup: MAIN_MENU_KEYBOARD }
            );
            await sendMessage(chatId, 'Быстрые действия:', { reply_markup: QUICK_ACTIONS_INLINE });
            return;
        }

        // /menu — показать кнопки
        if (/^\/menu$/i.test(text)) {
            await sendMessage(chatId, '📌 Выберите действие:', { reply_markup: MAIN_MENU_KEYBOARD });
            await sendMessage(chatId, 'Или нажмите кнопку ниже:', { reply_markup: QUICK_ACTIONS_INLINE });
            return;
        }

        // Скрыть кнопки
        if (/^(🔄 скрыть кнопки|скрыть кнопки|убрать кнопки)$/i.test(text)) {
            await tg('sendMessage', { chat_id: chatId, text: 'Кнопки скрыты. /menu — показать снова.', reply_markup: { remove_keyboard: true } });
            return;
        }

        // Быстрые действия по тексту кнопки
        const quickAction = getQuickActionFromText(text);
        if (quickAction) {
            const usePlain = ['list_menu', 'list_players', 'list_debtors', 'open_checks', 'stock_alert', 'supply_summary', 'expense_summary'].includes(quickAction);
            const params = quickAction === 'expense_summary' ? { period: 'week' } : {};
            const result = await execQuickAction(chatId, quickAction, params);
            const resultText = `✅ ${result}`;
            if (usePlain || result.length > 4000) await sendPlainMessage(chatId, resultText);
            else await sendMessage(chatId, resultText);
            await sendMessage(chatId, 'Другие действия:', { reply_markup: QUICK_ACTIONS_INLINE });
            return;
        }

        // Сброс контекста
        if (/^(\/clear|сброс|сбросить|новый чат|забудь)$/i.test(text)) {
            chatHistory.delete(chatId);
            await sendMessage(chatId, '🔄 Контекст сброшен. Начинаем с чистого листа.');
            return;
        }

        const state = chatState.get(chatId);
        let userContent = text;
        let draft = null;

        if (state?.pendingEvent && state.mode === 'awaiting_changes') {
            const cancel = /^(отмена|отменить|cancel)$/i.test(text);
            if (cancel) {
                chatState.delete(chatId);
                await sendMessage(chatId, '❌ Создание отменено.');
                return;
            }
            draft = state.pendingEvent;
            userContent = `[Режим изменения] Пользователь хочет изменить: ${text}`;
            chatState.delete(chatId);
        }

        const history = chatHistory.get(chatId) || [];
        const messages = [...history, { role: 'user', content: userContent }];

        console.log(`[AdminBot] Sending to AI (history: ${history.length}): "${text}"${draft ? ' (edit mode)' : ''}`);
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

                const draftText = formatEventDraft(normParams);
                chatHistory.set(chatId, trimHistory([...messages, { role: 'assistant', content: draftText }]));
                chatState.set(chatId, { pendingEvent: normParams, mode: 'awaiting_confirmation' });
                await sendMessage(chatId, draftText, { reply_markup: CONFIRM_KEYBOARD });
                return;
            }

            const actionList = ['list_events', 'update_event', 'create_check', 'add_items', 'client_report', 'list_menu', 'list_players', 'report_today', 'list_debtors', 'open_checks', 'stock_alert', 'salary_estimate', 'supply_summary', 'expense_summary'];
            if (actionList.includes(parsed.action)) {
                const actionHeaders = { 'Content-Type': 'application/json' };
                if (API_SECRET) actionHeaders['Authorization'] = `Bearer ${API_SECRET}`;
                try {
                    const actionRes = await fetch(`${API_BASE}/api/ai/action`, {
                        method: 'POST',
                        headers: actionHeaders,
                        body: JSON.stringify({ action: parsed.action, params: parsed.params || {}, staffId: null }),
                    });
                    const actionData = await actionRes.json();
                    const resultText = actionData.success ? (actionData.message ? `✅ ${actionData.message}` : 'Готово!') : `❌ ${actionData.error || 'Ошибка выполнения'}`;
                    chatHistory.set(chatId, trimHistory([...messages, { role: 'assistant', content: resultText }]));
                    const usePlain = ['list_menu', 'list_players', 'list_debtors', 'open_checks', 'stock_alert', 'supply_summary', 'expense_summary'].includes(parsed.action) || resultText.length > 4000;
                    if (usePlain) await sendPlainMessage(chatId, resultText);
                    else await sendMessage(chatId, resultText);
                } catch (actionErr) {
                    console.error('[AdminBot] Action API error:', actionErr);
                    await sendMessage(chatId, `❌ Ошибка сервера: ${actionErr.message}`);
                }
                return;
            }
        } catch { }

        const trimmed = String(aiResponse || '').trim();
        if (!trimmed) {
            await sendMessage(chatId, '⚠️ ИИ не вернул ответ. Попробуйте переформулировать.');
            return;
        }
        const plainText = stripMarkdown(trimmed);
        chatHistory.set(chatId, trimHistory([...messages, { role: 'assistant', content: plainText }]));
        await sendPlainMessage(chatId, plainText);
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
        try {
            const actionRes = await fetch(`${API_BASE}/api/ai/action`, {
                method: 'POST',
                headers: actionHeaders,
                body: JSON.stringify({ action: 'create_event', params: state.pendingEvent, staffId: null }),
            });
            const actionData = await actionRes.json();
            await tg('answerCallbackQuery', { callback_query_id: callbackQuery.id });
            if (actionData.success) {
                await sendMessage(chatId, `✅ ${actionData.message || 'Мероприятие создано!'}`);
            } else {
                await sendMessage(chatId, `❌ ${actionData.error || 'Ошибка создания'}`);
            }
        } catch (actionErr) {
            console.error('[AdminBot] create_event action error:', actionErr);
            await tg('answerCallbackQuery', { callback_query_id: callbackQuery.id });
            await sendMessage(chatId, `❌ Ошибка сервера: ${actionErr.message}`);
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

    // Быстрые действия (inline-кнопки)
    if (data.startsWith('q_')) {
        const rest = data.slice(2);
        const parts = rest.split('_');
        const act = parts[0] === 'expense' && parts[1] ? `expense_${parts[1]}` : rest;
        const validActions = ['report_today', 'list_debtors', 'open_checks', 'stock_alert', 'list_events', 'list_menu', 'supply_summary', 'expense_week', 'expense_month'];
        if (validActions.includes(act)) {
            await tg('answerCallbackQuery', { callback_query_id: callbackQuery.id, text: 'Загрузка...' });
            const params = (act === 'expense_summary' || act === 'expense_week') ? { period: 'week' } : act === 'expense_month' ? { period: 'month' } : {};
            const realAction = act.startsWith('expense_') ? 'expense_summary' : act;
            const result = await execQuickAction(chatId, realAction, params);
            const usePlain = ['list_menu', 'list_players', 'list_debtors', 'open_checks', 'stock_alert', 'supply_summary', 'expense_summary'].includes(realAction);
            if (usePlain || result.length > 4000) await sendPlainMessage(chatId, `✅ ${result}`);
            else await sendMessage(chatId, `✅ ${result}`);
            await sendMessage(chatId, 'Другие действия:', { reply_markup: QUICK_ACTIONS_INLINE });
            return;
        }
    }

    await tg('answerCallbackQuery', { callback_query_id: callbackQuery.id });
}

async function main() {
    console.log('Admin Bot starting...');
    if (!BOT_TOKEN) {
        console.error('ERROR: VITE_TELEGRAM_BOT_TOKEN не задан в .env');
        process.exit(1);
    }
    console.log(`API: ${API_BASE}`);

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
