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
  | 'birthday'
  | 'refund'
  | 'supply'
  | 'revision';

export type NotificationChannel = 'telegram' | 'pwa' | 'both';

export interface TypeSetting {
  enabled: boolean;
  channel: NotificationChannel;
}

interface NotificationSettings {
  telegramChatIds: string[];
  types: Record<AdminNotificationType, TypeSetting>;
}

const DEFAULT_TYPES: Record<AdminNotificationType, TypeSetting> = {
  shift_open: { enabled: true, channel: 'both' },
  shift_close: { enabled: true, channel: 'both' },
  payment_cash: { enabled: true, channel: 'both' },
  payment_card: { enabled: true, channel: 'both' },
  payment_deposit: { enabled: true, channel: 'both' },
  payment_debt: { enabled: true, channel: 'both' },
  birthday: { enabled: true, channel: 'both' },
  refund: { enabled: true, channel: 'both' },
  supply: { enabled: true, channel: 'both' },
  revision: { enabled: true, channel: 'both' },
};

function migrateLegacyTypes(raw: unknown, legacyChannel?: string): Record<AdminNotificationType, TypeSetting> {
  const result = { ...DEFAULT_TYPES };
  const ch = (legacyChannel || 'both') as NotificationChannel;
  if (raw && typeof raw === 'object') {
    const legacy = raw as Record<string, unknown>;
    for (const key of Object.keys(result) as AdminNotificationType[]) {
      const v = legacy[key];
      if (typeof v === 'boolean') {
        result[key] = { enabled: v, channel: ch };
      } else if (v && typeof v === 'object' && 'enabled' in v && 'channel' in v) {
        result[key] = { enabled: !!(v as TypeSetting).enabled, channel: ((v as TypeSetting).channel as NotificationChannel) || 'both' };
      }
    }
  }
  return result;
}

async function loadSettings(): Promise<NotificationSettings> {
  const { data } = await supabase.from('app_settings').select('key, value').in('key', [
    'notification_admin_channel',
    'notification_admin_telegram_chat_ids',
    'notification_admin_types',
  ]);
  const map = new Map((data || []).map((r) => [r.key, r.value]));
  let types: Record<AdminNotificationType, TypeSetting>;
  try {
    const raw = JSON.parse(map.get('notification_admin_types') || '{}') as Record<string, unknown>;
    const legacyChannel = map.get('notification_admin_channel') as string | undefined;
    types = migrateLegacyTypes(raw, legacyChannel);
  } catch {
    types = { ...DEFAULT_TYPES };
  }
  const chatIds = (map.get('notification_admin_telegram_chat_ids') || '')
    .split(',')
    .map((id: string) => id.trim())
    .filter(Boolean);
  return { telegramChatIds: chatIds, types };
}

function shouldSendToTelegram(settings: NotificationSettings, type: AdminNotificationType): boolean {
  const t = settings.types[type];
  if (!t?.enabled) return false;
  return t.channel === 'telegram' || t.channel === 'both';
}

function shouldSendToPwa(settings: NotificationSettings, type: AdminNotificationType): boolean {
  const t = settings.types[type];
  if (!t?.enabled) return false;
  return t.channel === 'pwa' || t.channel === 'both';
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
  if (!shouldSendToTelegram(settings, 'shift_open') && !shouldSendToPwa(settings, 'shift_open')) return;

  const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const text = `[+] <b>Смена открыта</b> · ${time}\n- ${staffName}\n- В кассе: ${fmt(cashStart)}₽`;
  const title = 'Смена открыта';
  const body = `${staffName} · В кассе: ${fmt(cashStart)}₽`;

  if (shouldSendToTelegram(settings, 'shift_open')) {
    await sendToTelegram(text, settings.telegramChatIds);
  }
  if (shouldSendToPwa(settings, 'shift_open')) {
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
  if (!shouldSendToTelegram(settings, 'shift_close') && !shouldSendToPwa(settings, 'shift_close')) return;

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

  if (shouldSendToTelegram(settings, 'shift_close')) {
    await sendToTelegram(text, settings.telegramChatIds);
  }
  if (shouldSendToPwa(settings, 'shift_close')) {
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
  if (!shouldSendToTelegram(settings, paymentType) && !shouldSendToPwa(settings, paymentType)) return;

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

  if (shouldSendToTelegram(settings, paymentType)) {
    await sendToTelegram(text, settings.telegramChatIds);
  }
  if (shouldSendToPwa(settings, paymentType)) {
    await insertPwaNotification(paymentType, title, body, { amount, playerNickname, checkId });
  }
}

export async function notifyBirthday(names: string[]): Promise<void> {
  const settings = await loadSettings();
  if (names.length === 0) return;
  if (!shouldSendToTelegram(settings, 'birthday') && !shouldSendToPwa(settings, 'birthday')) return;

  const list = names.join(', ');
  const text = `🎂 <b>Сегодня день рождения!</b>\n${list}`;
  const title = 'День рождения';
  const body = list;

  if (shouldSendToTelegram(settings, 'birthday')) {
    await sendToTelegram(text, settings.telegramChatIds);
  }
  if (shouldSendToPwa(settings, 'birthday')) {
    await insertPwaNotification('birthday', title, body, { names });
  }
}

export async function notifyRefund(
  amount: number,
  refundType: 'full' | 'partial',
  playerNickname: string,
  creatorNickname?: string
): Promise<void> {
  const settings = await loadSettings();
  if (!shouldSendToTelegram(settings, 'refund') && !shouldSendToPwa(settings, 'refund')) return;

  const typeLabel = refundType === 'full' ? 'Полный возврат' : 'Частичный возврат';
  const text = `↩️ <b>${typeLabel}</b>\n${playerNickname} — −${fmt(amount)}₽${creatorNickname ? `\nВыполнил: ${creatorNickname}` : ''}`;
  const title = typeLabel;
  const body = `${playerNickname} — −${fmt(amount)}₽`;

  if (shouldSendToTelegram(settings, 'refund')) {
    await sendToTelegram(text, settings.telegramChatIds);
  }
  if (shouldSendToPwa(settings, 'refund')) {
    await insertPwaNotification('refund', title, body, { amount, refundType, playerNickname, creatorNickname });
  }
}

export interface SupplyNotifyItem {
  name: string;
  quantity: number;
  costPerUnit: number;
  totalCost: number;
}

export async function notifySupply(
  supplyId: string,
  totalCost: number,
  items: SupplyNotifyItem[],
  creatorNickname?: string
): Promise<void> {
  const settings = await loadSettings();
  if (!shouldSendToTelegram(settings, 'supply') && !shouldSendToPwa(settings, 'supply')) return;

  const title = 'Приёмка товаров';
  const body = `${items.length} поз. на ${fmt(totalCost)}₽`;

  if (shouldSendToTelegram(settings, 'supply')) {
    const lines: string[] = [
      `📦 <b>Приёмка товаров</b>`,
      `${items.length} поз. · ${fmt(totalCost)}₽`,
      ``,
      ...items.slice(0, 15).map((i) => `  • ${i.name} × ${i.quantity} — ${fmt(i.totalCost)}₽`),
      ...(items.length > 15 ? [`  ... и ещё ${items.length - 15}`] : []),
      ``,
    ];
    if (creatorNickname) lines.push(`Выполнил: ${creatorNickname}`);
    await sendToTelegram(lines.join('\n'), settings.telegramChatIds);
  }
  if (shouldSendToPwa(settings, 'supply')) {
    await insertPwaNotification('supply', title, body, { supplyId, totalCost, itemsCount: items.length, creatorNickname });
  }
}

export interface RevisionNotifyItem {
  name: string;
  expected: number;
  actual: number;
  diff: number;
}

export async function notifyRevision(
  revisionId: string,
  totalDiff: number,
  items: RevisionNotifyItem[],
  creatorNickname?: string
): Promise<void> {
  const settings = await loadSettings();
  if (!shouldSendToTelegram(settings, 'revision') && !shouldSendToPwa(settings, 'revision')) return;

  const diffSign = totalDiff >= 0 ? '+' : '';
  const title = 'Ревизия';
  const body = `${items.length} поз. · разница ${diffSign}${totalDiff}`;

  if (shouldSendToTelegram(settings, 'revision')) {
    const lines: string[] = [
      `📋 <b>Ревизия</b>`,
      `${items.length} поз. · разница ${diffSign}${totalDiff}`,
      ``,
      ...items.slice(0, 15).map((i) => {
        const d = i.diff >= 0 ? `+${i.diff}` : String(i.diff);
        return `  • ${i.name}: ${i.expected} → ${i.actual} (${d})`;
      }),
      ...(items.length > 15 ? [`  ... и ещё ${items.length - 15}`] : []),
      ``,
    ];
    if (creatorNickname) lines.push(`Выполнил: ${creatorNickname}`);
    await sendToTelegram(lines.join('\n'), settings.telegramChatIds);
  }
  if (shouldSendToPwa(settings, 'revision')) {
    await insertPwaNotification('revision', title, body, { revisionId, totalDiff, itemsCount: items.length, creatorNickname });
  }
}
