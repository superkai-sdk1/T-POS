# T-POS — POS-система для клуба «Титан»

Полнофункциональная PWA-касса: чеки, смены, склад, клиенты, аналитика, AI-ассистент, Telegram-боты.

## Стек

- **Frontend**: React 19 + TypeScript + Vite 7 + TailwindCSS 4 + Zustand 5
- **Backend**: Supabase (PostgreSQL, Realtime, Storage) + Node.js сервер
- **PWA**: `vite-plugin-pwa`, offline-кэш, iOS safe areas
- **Боты**: Telegram Admin Bot, Wallet Bot

## Быстрый старт (сервер Ubuntu)

```bash
wget https://raw.githubusercontent.com/superkai-sdk1/T-POS/main/install.sh
sudo bash install.sh
```

Скрипт установит Node.js, nginx, SSL, и запустит все сервисы.

## Переменные окружения (.env)

| Переменная | Обязательна | Описание |
|-----------|:-----------:|----------|
| `VITE_SUPABASE_URL` | ✅ | URL проекта Supabase |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Anon key Supabase |
| `TELEGRAM_BOT_TOKEN` | ⚠️ | Токен Telegram-бота (**серверный**, без VITE_ префикса!) |
| `CLIENT_BOT_TOKEN` | — | Токен Wallet-бота |
| `POLZA_AI_API_KEY` | — | API-ключ AI-ассистента (Polza.ai) |
| `POS_DOMAIN` | — | Домен для CORS |
| `WALLET_DOMAIN` | — | Домен кошелька |
| `API_SECRET` | — | Bearer-токен для защиты /api/system/update |

> ⚠️ **НЕ используйте `VITE_TELEGRAM_BOT_TOKEN`** — переменные с префиксом `VITE_` попадают в клиентский JavaScript-бандл и видны любому пользователю через DevTools.

## Серверные API-эндпоинты

Сервер (`server/update-server.js`) слушает порт **3100**:

### Аутентификация
| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/auth/login` | Вход по никнейму + паролю (bcrypt) |
| POST | `/api/auth/pin` | Вход по PIN-коду |
| POST | `/api/auth/setup-pin` | Установка/смена PIN |
| POST | `/api/auth/hash-password` | Хеширование пароля (для StaffManager) |

### Уведомления
| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/notify` | Отправка Telegram-сообщений через сервер |

### Система
| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/system/info` | Версия, хеш, ветка |
| POST | `/api/system/update` | Git pull + rebuild (Bearer auth) |
| POST | `/api/ai` | AI-ассистент (Polza.ai / Gemini) |

## Безопасность

- **Пароли и PIN-коды** хешируются через bcrypt на сервере
- **Постепенная миграция**: при первом входе plain-text пароль автоматически хешируется
- **Telegram-токен** никогда не попадает в клиентский бандл
- **Секретные поля** (`password_hash`, `pin`) не запрашиваются фронтендом

## Разработка

```bash
npm install
npm run dev          # Vite dev server (порт 5173)
node server/update-server.js  # API-сервер (порт 3100)
```

## Сборка

```bash
npm run build          # T-POS → dist/
npm run build:wallet   # Wallet → dist-wallet/
```

## Обновление на сервере

```bash
sudo bash /var/www/tpos/install.sh
```

## Диагностика

```bash
./scripts/check-env.sh       # Проверка .env
./scripts/diagnose-server.sh  # Диагностика сервера
```
