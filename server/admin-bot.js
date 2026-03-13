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

async function editMessageText(chatId, messageId, text) {
    try {
        return await tg('editMessageText', {
            chat_id: chatId,
            message_id: messageId,
            text,
            parse_mode: 'HTML',
        });
    } catch { return null; }
}

function formatEventDraft(params) {
    const typeLabel = params.type === 'titan' ? 'Титан' : 'Выезд';
    const loc = params.location || '—';
    const pay = params.payment_type === 'hourly' ? 'Почасовая' : `Фикс ${params.fixed_amount || 0}₽`;
    return `📅 <b>Всё верно?</b>\n\nТип: ${typeLabel}\nЛокация: ${loc}\nДата: ${params.date}\nВремя: ${params.start_time}\nОплата: ${pay}`;
}

// --- Conversation history with 1h TTL ---
const chatHistory = new Map(); // chatId -> { messages: [], lastActivity: timestamp }
const HISTORY_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_HISTORY_MESSAGES = 20;

function getHistory(chatId) {
    const entry = chatHistory.get(chatId);
    if (!entry || Date.now() - entry.lastActivity > HISTORY_TTL_MS) {
        chatHistory.set(chatId, { messages: [], lastActivity: Date.now() });
        return [];
    }
    entry.lastActivity = Date.now();
    return entry.messages;
}

function addToHistory(chatId, role, content) {
    let entry = chatHistory.get(chatId);
    if (!entry || Date.now() - entry.lastActivity > HISTORY_TTL_MS) {
        entry = { messages: [], lastActivity: Date.now() };
    }
    entry.messages.push({ role, content });
    if (entry.messages.length > MAX_HISTORY_MESSAGES) {
        entry.messages = entry.messages.slice(-MAX_HISTORY_MESSAGES);
    }
    entry.lastActivity = Date.now();
    chatHistory.set(chatId, entry);
}

// Cleanup expired entries every 10 minutes
setInterval(() => {
    const now = Date.now();
    for (const [chatId, entry] of chatHistory) {
        if (now - entry.lastActivity > HISTORY_TTL_MS) {
            chatHistory.delete(chatId);
        }
    }
}, 10 * 60 * 1000);

const chatState = new Map(); // chatId -> { pendingEvent, mode }

const CONFIRM_KEYBOARD = {
    inline_keyboard: [
        [{ text: '✅ Подтвердить', callback_data: 'event_confirm' }],
        [{ text: '✏️ Изменить', callback_data: 'event_change' }],
    ],
};

const MAIN_MENU_KEYBOARD = {
    keyboard: [
        [{ text: '🧾 Чеки' }, { text: '📅 Мероприятия' }],
        [{ text: '📦 Склад' }, { text: '👥 Клиенты' }],
        [{ text: '💼 Финансы' }, { text: '📊 Аналитика' }]
    ],
    resize_keyboard: true,
    persistent: true
};

// --- Streaming AI call with editMessageText ---
async function callAiStream(messages, chatId, thinkingMsgId, draft = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (API_SECRET) headers['Authorization'] = `Bearer ${API_SECRET}`;
    const body = { messages };
    if (draft) body.draft = draft;

    let fullText = '';

    try {
        const res = await fetch('http://127.0.0.1:3100/api/ai/stream', {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const errText = await res.text();
            return { error: errText || `HTTP ${res.status}` };
        }

        // Parse SSE stream using async iteration (Web ReadableStream)
        let buffer = '';
        let lastEditTime = 0;
        const EDIT_INTERVAL = 800; // ms between editMessageText calls
        const decoder = new TextDecoder();

        for await (const chunk of res.body) {
            buffer += decoder.decode(chunk, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data: ')) continue;
                const payload = trimmed.slice(6);
                try {
                    const parsed = JSON.parse(payload);
                    if (parsed.error) {
                        return { error: parsed.error };
                    }
                    if (parsed.done) {
                        fullText = parsed.full || fullText;
                        continue;
                    }
                    if (parsed.token) {
                        fullText += parsed.token;
                        // Throttled edit
                        const now = Date.now();
                        if (now - lastEditTime >= EDIT_INTERVAL && fullText.length > 3) {
                            lastEditTime = now;
                            const editText = fullText + ' ✍️';
                            editMessageText(chatId, thinkingMsgId, editText);
                        }
                    }
                } catch { }
            }
        }

        return { response: fullText };
    } catch (err) {
        // Fallback to non-streaming
        console.warn('[AdminBot] Stream failed, falling back to non-streaming:', err.message);
        try {
            const fallbackHeaders = { 'Content-Type': 'application/json' };
            if (API_SECRET) fallbackHeaders['Authorization'] = `Bearer ${API_SECRET}`;
            const fallbackBody = { messages };
            if (draft) fallbackBody.draft = draft;
            const res = await fetch('http://127.0.0.1:3100/api/ai', {
                method: 'POST',
                headers: fallbackHeaders,
                body: JSON.stringify(fallbackBody),
            });
            const data = await res.json();
            if (!res.ok) return { error: data.details || data.error || `HTTP ${res.status}` };
            return data;
        } catch (e2) {
            return { error: String(e2) };
        }
    }
}

async function handleAiMessage(msg) {
    const chatId = msg.chat.id;
    const text = msg.text?.trim() || '';

    try {
        if (text === '/start' || text.toLowerCase() === 'меню') {
            await sendMessage(chatId, '👋 Привет! Я твой ИИ-Директор T-POS. Выбирай раздел или пиши запрос текстом:', { reply_markup: MAIN_MENU_KEYBOARD });
            return;
        }

        const state = chatState.get(chatId);
        let draft = null;
        let userContent = text;

        if (state?.pendingEvent && state.mode === 'awaiting_changes') {
            const cancel = /^(отмена|отменить|cancel)$/i.test(text);
            if (cancel) {
                chatState.delete(chatId);
                await sendMessage(chatId, '❌ Создание отменено.');
                return;
            }
            draft = state.pendingEvent;
            userContent = `[Режим изменения] Пользователь: ${text}`;
            chatState.delete(chatId);
        }

        // Add user message to history
        addToHistory(chatId, 'user', userContent);

        // Build messages array with history
        const history = getHistory(chatId);
        const messages = [...history]; // already includes the current user message

        // Send "thinking" message immediately
        const thinkingResult = await sendMessage(chatId, '🤔 Думаю...');
        const thinkingMsgId = thinkingResult?.result?.message_id;

        console.log(`[AdminBot] Sending to AI (${messages.length} messages): "${text}"${draft ? ' (edit mode)' : ''}`);
        const data = await callAiStream(messages, chatId, thinkingMsgId, draft);

        if (!data.response && data.error) {
            const errText = `❌ Ошибка ИИ: ${data.error}`;
            if (thinkingMsgId) {
                await editMessageText(chatId, thinkingMsgId, errText);
            } else {
                await sendMessage(chatId, errText);
            }
            return;
        }

        const aiResponse = data.response || '';

        // Save AI response to history
        addToHistory(chatId, 'assistant', aiResponse);

        // Try to parse as JSON action
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
                // Replace thinking message with event draft
                if (thinkingMsgId) {
                    await editMessageText(chatId, thinkingMsgId, formatEventDraft(normParams));
                    await tg('editMessageReplyMarkup', {
                        chat_id: chatId,
                        message_id: thinkingMsgId,
                        reply_markup: CONFIRM_KEYBOARD,
                    });
                } else {
                    await sendMessage(chatId, formatEventDraft(normParams), { reply_markup: CONFIRM_KEYBOARD });
                }
                return;
            }

            if (parsed.action === 'reply_with_buttons') {
                const message = parsed.message || (parsed.params && parsed.params.message);
                const buttons = parsed.buttons || (parsed.params && parsed.params.buttons) || [];
                
                if (message) {
                    const markup = {
                        inline_keyboard: buttons.map((row) =>
                            row.map((btn) => ({ text: btn.text, callback_data: btn.data }))
                        ),
                    };
                    if (thinkingMsgId) {
                        await editMessageText(chatId, thinkingMsgId, message);
                        if (buttons.length > 0) {
                            await tg('editMessageReplyMarkup', {
                                chat_id: chatId,
                                message_id: thinkingMsgId,
                                reply_markup: markup,
                            });
                        }
                    } else {
                        await sendMessage(chatId, message, buttons.length > 0 ? { reply_markup: markup } : undefined);
                    }
                    return;
                }
            }

            if (parsed.action && parsed.action !== 'create_event') {
                const actionHeaders = { 'Content-Type': 'application/json' };
                if (API_SECRET) actionHeaders['Authorization'] = `Bearer ${API_SECRET}`;
                const actionRes = await fetch('http://127.0.0.1:3100/api/ai/action', {
                    method: 'POST',
                    headers: actionHeaders,
                    body: JSON.stringify({ action: parsed.action, params: parsed.params, staffId: null }),
                });
                const actionData = await actionRes.json();
                const resultText = actionData.success
                    ? `✅ ${actionData.message || 'Готово!'}`
                    : `❌ ${actionData.error}`;
                if (thinkingMsgId) {
                    await editMessageText(chatId, thinkingMsgId, resultText);
                } else {
                    await sendMessage(chatId, resultText);
                }
                return;
            }
        } catch { }

        // Final edit with complete response
        if (thinkingMsgId) {
            await editMessageText(chatId, thinkingMsgId, aiResponse);
        } else {
            await sendMessage(chatId, aiResponse);
        }
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

    // Treat other callbacks as direct messages to AI
    await tg('answerCallbackQuery', { callback_query_id: callbackQuery.id });
    const mockMsg = {
        chat: { id: chatId },
        text: data,
        from: callbackQuery.from,
    };
    await handleAiMessage(mockMsg);
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
