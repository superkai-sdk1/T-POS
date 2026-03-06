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
        const res = await fetch(`http://127.0.0.1:3100/api/ai`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [{ role: 'user', content: text }],
            }),
        });
        const data = await res.json();

        if (data.error) {
            await sendMessage(chatId, `❌ Ошибка ИИ: ${data.error}`);
            return;
        }

        const aiResponse = data.response || '';

        try {
            const parsed = JSON.parse(aiResponse);
            if (parsed.action) {
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
        console.error('Admin Bot Error:', err);
        await sendMessage(chatId, '⚠️ Не удалось связаться с сервером ИИ.');
    }
}

async function main() {
    console.log('Admin Bot starting...');
    let pollOffset = 0;

    while (true) {
        try {
            const res = await fetch(`${API}/getUpdates?offset=${pollOffset}&timeout=30`);
            const json = await res.json();
            if (!json.ok || !json.result) {
                await new Promise(r => setTimeout(r, 3000));
                continue;
            }
            for (const update of json.result) {
                pollOffset = update.update_id + 1;
                if (update.message?.text) {
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
