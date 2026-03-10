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

async function handleAiMessage(msg) {
    const chatId = msg.chat.id;
    const text = msg.text;

    try {
        console.log(`[AdminBot] Sending to AI: "${text}"`);
        const res = await fetch(`http://127.0.0.1:3100/api/ai`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [{ role: 'user', content: text }],
            }),
        });

        if (!res.ok) {
            console.error(`[AdminBot] AI Server HTTP Error: ${res.status}`);
            await sendMessage(chatId, `⚠️ Ошибка сервера ИИ (${res.status})`);
            return;
        }

        const data = await res.json();
        console.log(`[AdminBot] AI Server Response:`, JSON.stringify(data).slice(0, 100) + '...');

        if (data.error) {
            await sendMessage(chatId, `❌ Ошибка ИИ: ${data.error}`);
            return;
        }

        const aiResponse = data.response || '';

        try {
            const parsed = JSON.parse(aiResponse);
            if (parsed.action) {
                console.log(`[AdminBot] Executing action: ${parsed.action}`);
                const actionRes = await fetch(`http://127.0.0.1:3100/api/ai/action`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: parsed.action,
                        params: parsed.params,
                        staffId: null,
                    }),
                });
                const actionData = await actionRes.json();
                console.log(`[AdminBot] Action Result:`, actionData);
                if (actionData.success) {
                    await sendMessage(chatId, `✅ ${actionData.message || 'Готово!'}`);
                } else {
                    await sendMessage(chatId, `❌ Ошибка действия: ${actionData.error}`);
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
