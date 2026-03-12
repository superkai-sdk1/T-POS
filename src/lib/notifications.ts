import { supabase } from '@/lib/supabase';

const BOT_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN as string;

const fmt = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n);

export type AdminNotificationType =
  | 'shift_open'
  | 'shift_close'
  | 'payment_cash'
  | 'payment_card'
  | 'payment_deposit'
  | 'payment_debt'
  | 'birthday';

interface NotificationSettings {
  channel: 'telegram' | 'pwa' | 'both';
  telegramChatIds: string[];
  types: Record<AdminNotificationType, boolean>;
}

async function loadSettings(): Promise<NotificationSettings> {
  const { data } = await supabase.from('app_settings').select('key, value').in('key', [
    'notification_admin_channel',
    'notification_admin_telegram_chat_ids',
    'notification_admin_types',
  ]);
  const map = new Map((data || []).map((r) => [r.key, r.value]));
  let types: Record<AdminNotificationType, boolean>;
  try {
    types = JSON.parse(map.get('notification_admin_types') || '{}');
  } catch {
    types = {
      shift_open: true,
      shift_close: true,
      payment_cash: true,
      payment_card: true,
      payment_deposit: true,
      payment_debt: true,
      birthday: true,
    };
  }
  const chatIds = (map.get('notification_admin_telegram_chat_ids') || '')
    .split(',')
    .map((id: string) => id.trim())
    .filter(Boolean);
  const channel = (map.get('notification_admin_channel') || 'telegram') as NotificationSettings['channel'];
  return { channel, telegramChatIds: chatIds, types };
}

async function sendToTelegram(text: string, chatIds: string[]): Promise<void> {
  if (!BOT_TOKEN || chatIds.length === 0) return;
  for (const chatId of chatIds) {
    try {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      });
    } catch {
      // silently ignore
    }
  }
}

async function insertPwaNotification(type: string, title: string, body: string, meta?: Record<string, unknown>): Promise<void> {
  await supabase.from('notifications').insert({
    type,
    title,
    body: body || null,
    meta: meta || null,
  });
}

export async function notifyShiftOpen(staffName: string, cashStart: number): Promise<void> {
  const settings = await loadSettings();
  if (!settings.types.shift_open) return;

  const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const text = `[+] <b>Смена открыта</b> · ${time}\n- ${staffName}\n- В кассе: ${fmt(cashStart)}₽`;
  const title = 'Смена открыта';
  const body = `${staffName} · В кассе: ${fmt(cashStart)}₽`;

  if (settings.channel === 'telegram' || settings.channel === 'both') {
    await sendToTelegram(text, settings.telegramChatIds);
  }
  if (settings.channel === 'pwa' || settings.channel === 'both') {
    await insertPwaNotification('shift_open', title, body, { staffName, cashStart });
  }
}

export interface CloseReportCheck {
  playerNickname: string;
  totalAmount: number;
  paymentMethod: string | null;
}

export interface CloseReportData {
  staffClose: string;
  openedAt: string;
  closedAt: string;
  cashEnd: number;
  totalRevenue: number;
  checks: CloseReportCheck[];
}

const pmLabel: Record<string, string> = {
  cash: 'нал',
  card: 'карта',
  debt: 'долг',
  bonus: 'бонусы',
  split: 'разд.',
};

export async function notifyShiftClose(d: CloseReportData): Promise<void> {
  const settings = await loadSettings();
  if (!settings.types.shift_close) return;

  const openTime = new Date(d.openedAt);
  const closeTime = new Date(d.closedAt);
  const durationMs = closeTime.getTime() - openTime.getTime();
  const hours = Math.floor(durationMs / 3600000);
  const minutes = Math.floor((durationMs % 3600000) / 60000);
  const dur = hours > 0 ? `${hours}ч ${minutes}м` : `${minutes}м`;
  const time = closeTime.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  const lines: string[] = [
    `[-] <b>Смена закрыта</b> · ${time} (${dur})`,
    `- ${d.staffClose}`,
    ``,
  ];
  if (d.checks.length > 0) {
    for (const c of d.checks) {
      const pm = pmLabel[c.paymentMethod || ''] || c.paymentMethod || '?';
      lines.push(`  ${c.playerNickname} — ${fmt(c.totalAmount)}₽ (${pm})`);
    }
    lines.push(``);
  }
  lines.push(`<b>Итого: ${fmt(d.totalRevenue)}₽</b> · ${d.checks.length} чек.`);
  lines.push(`- В кассе: ${fmt(d.cashEnd)}₽`);
  const text = lines.join('\n');

  const title = 'Смена закрыта';
  const body = `Итого: ${fmt(d.totalRevenue)}₽ · ${d.checks.length} чек. В кассе: ${fmt(d.cashEnd)}₽`;

  if (settings.channel === 'telegram' || settings.channel === 'both') {
    await sendToTelegram(text, settings.telegramChatIds);
  }
  if (settings.channel === 'pwa' || settings.channel === 'both') {
    await insertPwaNotification('shift_close', title, body, d as unknown as Record<string, unknown>);
  }
}

export async function notifyPayment(
  paymentType: 'payment_cash' | 'payment_card' | 'payment_deposit' | 'payment_debt',
  amount: number,
  playerNickname: string,
  checkId?: string
): Promise<void> {
  const settings = await loadSettings();
  if (!settings.types[paymentType]) return;

  const labels: Record<string, string> = {
    payment_cash: 'Наличные',
    payment_card: 'Карта',
    payment_deposit: 'Депозит',
    payment_debt: 'Долг',
  };
  const label = labels[paymentType];
  const text = `💳 <b>Оплата ${label}</b>\n${playerNickname} — ${fmt(amount)}₽`;
  const title = `Оплата ${label}`;
  const body = `${playerNickname} — ${fmt(amount)}₽`;

  if (settings.channel === 'telegram' || settings.channel === 'both') {
    await sendToTelegram(text, settings.telegramChatIds);
  }
  if (settings.channel === 'pwa' || settings.channel === 'both') {
    await insertPwaNotification(paymentType, title, body, { amount, playerNickname, checkId });
  }
}

export async function notifyBirthday(names: string[]): Promise<void> {
  const settings = await loadSettings();
  if (!settings.types.birthday || names.length === 0) return;

  const list = names.join(', ');
  const text = `🎂 <b>Сегодня день рождения!</b>\n${list}`;
  const title = 'День рождения';
  const body = list;

  if (settings.channel === 'telegram' || settings.channel === 'both') {
    await sendToTelegram(text, settings.telegramChatIds);
  }
  if (settings.channel === 'pwa' || settings.channel === 'both') {
    await insertPwaNotification('birthday', title, body, { names });
  }
}
