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

export const DEFAULT_TYPES: Record<AdminNotificationType, TypeSetting> = {
  shift_open: { enabled: false, channel: 'both' },
  shift_close: { enabled: false, channel: 'both' },
  payment_cash: { enabled: false, channel: 'both' },
  payment_card: { enabled: false, channel: 'both' },
  payment_deposit: { enabled: false, channel: 'both' },
  payment_debt: { enabled: false, channel: 'both' },
  birthday: { enabled: false, channel: 'both' },
  refund: { enabled: false, channel: 'both' },
  supply: { enabled: false, channel: 'both' },
  revision: { enabled: false, channel: 'both' },
};

interface UserSettings {
  userId: string;
  tgId: string | null;
  types: Record<AdminNotificationType, TypeSetting>;
}

function parseTypes(raw: unknown): Record<AdminNotificationType, TypeSetting> {
  const result = { ...DEFAULT_TYPES };
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    for (const key of Object.keys(result) as AdminNotificationType[]) {
      const v = obj[key];
      if (v && typeof v === 'object' && 'enabled' in v && 'channel' in v) {
        result[key] = {
          enabled: !!(v as TypeSetting).enabled,
          channel: ((v as TypeSetting).channel as NotificationChannel) || 'both',
        };
      }
    }
  }
  return result;
}

async function loadAllUserSettings(): Promise<UserSettings[]> {
  const { data } = await supabase
    .from('user_notification_settings')
    .select('user_id, types, profiles!inner(tg_id)');

  if (!data || data.length === 0) return [];

  return data.map((row: Record<string, unknown>) => {
    const profile = row.profiles as Record<string, unknown> | null;
    return {
      userId: row.user_id as string,
      tgId: (profile?.tg_id as string) || null,
      types: parseTypes(row.types),
    };
  });
}

function userWantsTelegram(user: UserSettings, type: AdminNotificationType): boolean {
  const t = user.types[type];
  if (!t?.enabled) return false;
  return (t.channel === 'telegram' || t.channel === 'both') && !!user.tgId;
}

function userWantsPwa(user: UserSettings, type: AdminNotificationType): boolean {
  const t = user.types[type];
  if (!t?.enabled) return false;
  return t.channel === 'pwa' || t.channel === 'both';
}

async function sendToTelegram(text: string, chatId: string): Promise<void> {
  if (!BOT_TOKEN || !chatId) return;
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

async function insertPwaNotification(type: string, title: string, body: string, meta?: Record<string, unknown>): Promise<void> {
  await supabase.from('notifications').insert({
    type,
    title,
    body: body || null,
    meta: meta || null,
  });
}

export async function notifyShiftOpen(staffName: string, cashStart: number): Promise<void> {
  const allUsers = await loadAllUserSettings();
  const tgUsers = allUsers.filter((u) => userWantsTelegram(u, 'shift_open'));
  const anyPwa = allUsers.some((u) => userWantsPwa(u, 'shift_open'));
  if (tgUsers.length === 0 && !anyPwa) return;

  const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const text = `[+] <b>Смена открыта</b> · ${time}\n- ${staffName}\n- В кассе: ${fmt(cashStart)}₽`;
  const title = 'Смена открыта';
  const body = `${staffName} · В кассе: ${fmt(cashStart)}₽`;

  for (const u of tgUsers) {
    await sendToTelegram(text, u.tgId!);
  }
  if (anyPwa) {
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
  const allUsers = await loadAllUserSettings();
  const tgUsers = allUsers.filter((u) => userWantsTelegram(u, 'shift_close'));
  const anyPwa = allUsers.some((u) => userWantsPwa(u, 'shift_close'));
  if (tgUsers.length === 0 && !anyPwa) return;

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

  for (const u of tgUsers) {
    await sendToTelegram(text, u.tgId!);
  }
  if (anyPwa) {
    await insertPwaNotification('shift_close', title, body, d as unknown as Record<string, unknown>);
  }
}

export async function notifyPayment(
  paymentType: 'payment_cash' | 'payment_card' | 'payment_deposit' | 'payment_debt',
  amount: number,
  playerNickname: string,
  checkId?: string
): Promise<void> {
  const allUsers = await loadAllUserSettings();
  const tgUsers = allUsers.filter((u) => userWantsTelegram(u, paymentType));
  const anyPwa = allUsers.some((u) => userWantsPwa(u, paymentType));
  if (tgUsers.length === 0 && !anyPwa) return;

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

  for (const u of tgUsers) {
    await sendToTelegram(text, u.tgId!);
  }
  if (anyPwa) {
    await insertPwaNotification(paymentType, title, body, { amount, playerNickname, checkId });
  }
}

export async function notifyBirthday(names: string[]): Promise<void> {
  if (names.length === 0) return;
  const allUsers = await loadAllUserSettings();
  const tgUsers = allUsers.filter((u) => userWantsTelegram(u, 'birthday'));
  const anyPwa = allUsers.some((u) => userWantsPwa(u, 'birthday'));
  if (tgUsers.length === 0 && !anyPwa) return;

  const list = names.join(', ');
  const text = `🎂 <b>Сегодня день рождения!</b>\n${list}`;
  const title = 'День рождения';
  const body = list;

  for (const u of tgUsers) {
    await sendToTelegram(text, u.tgId!);
  }
  if (anyPwa) {
    await insertPwaNotification('birthday', title, body, { names });
  }
}

export async function notifyRefund(
  amount: number,
  refundType: 'full' | 'partial',
  playerNickname: string,
  creatorNickname?: string
): Promise<void> {
  const allUsers = await loadAllUserSettings();
  const tgUsers = allUsers.filter((u) => userWantsTelegram(u, 'refund'));
  const anyPwa = allUsers.some((u) => userWantsPwa(u, 'refund'));
  if (tgUsers.length === 0 && !anyPwa) return;

  const typeLabel = refundType === 'full' ? 'Полный возврат' : 'Частичный возврат';
  const text = `↩️ <b>${typeLabel}</b>\n${playerNickname} — −${fmt(amount)}₽${creatorNickname ? `\nВыполнил: ${creatorNickname}` : ''}`;
  const title = typeLabel;
  const body = `${playerNickname} — −${fmt(amount)}₽`;

  for (const u of tgUsers) {
    await sendToTelegram(text, u.tgId!);
  }
  if (anyPwa) {
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
  const allUsers = await loadAllUserSettings();
  const tgUsers = allUsers.filter((u) => userWantsTelegram(u, 'supply'));
  const anyPwa = allUsers.some((u) => userWantsPwa(u, 'supply'));
  if (tgUsers.length === 0 && !anyPwa) return;

  const title = 'Приёмка товаров';
  const body = `${items.length} поз. на ${fmt(totalCost)}₽`;

  if (tgUsers.length > 0) {
    const lines: string[] = [
      `📦 <b>Приёмка товаров</b>`,
      `${items.length} поз. · ${fmt(totalCost)}₽`,
      ``,
      ...items.slice(0, 15).map((i) => `  • ${i.name} × ${i.quantity} — ${fmt(i.totalCost)}₽`),
      ...(items.length > 15 ? [`  ... и ещё ${items.length - 15}`] : []),
      ``,
    ];
    if (creatorNickname) lines.push(`Выполнил: ${creatorNickname}`);
    const text = lines.join('\n');
    for (const u of tgUsers) {
      await sendToTelegram(text, u.tgId!);
    }
  }
  if (anyPwa) {
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
  const allUsers = await loadAllUserSettings();
  const tgUsers = allUsers.filter((u) => userWantsTelegram(u, 'revision'));
  const anyPwa = allUsers.some((u) => userWantsPwa(u, 'revision'));
  if (tgUsers.length === 0 && !anyPwa) return;

  const diffSign = totalDiff >= 0 ? '+' : '';
  const title = 'Ревизия';
  const body = `${items.length} поз. · разница ${diffSign}${totalDiff}`;

  if (tgUsers.length > 0) {
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
    const text = lines.join('\n');
    for (const u of tgUsers) {
      await sendToTelegram(text, u.tgId!);
    }
  }
  if (anyPwa) {
    await insertPwaNotification('revision', title, body, { revisionId, totalDiff, itemsCount: items.length, creatorNickname });
  }
}
