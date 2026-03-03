const BOT_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN as string;
const OWNER_CHAT_IDS = ['556525624', '1005574994'];

export async function sendToOwners(text: string): Promise<void> {
  if (!BOT_TOKEN) return;
  for (const chatId of OWNER_CHAT_IDS) {
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
      // silently ignore — don't break app flow
    }
  }
}

const fmt = (n: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n);

const pmLabel: Record<string, string> = {
  cash: 'нал',
  card: 'карта',
  debt: 'долг',
  bonus: 'бонусы',
};

export function buildShiftOpenReport(staffName: string, cashStart: number): string {
  const now = new Date();
  const time = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  return `🟢 <b>Смена открыта</b> · ${time}\n👤 ${staffName}\n💰 В кассе: ${fmt(cashStart)}₽`;
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

export function buildShiftCloseReport(d: CloseReportData): string {
  const openTime = new Date(d.openedAt);
  const closeTime = new Date(d.closedAt);
  const durationMs = closeTime.getTime() - openTime.getTime();
  const hours = Math.floor(durationMs / 3600000);
  const minutes = Math.floor((durationMs % 3600000) / 60000);
  const dur = hours > 0 ? `${hours}ч ${minutes}м` : `${minutes}м`;

  const time = closeTime.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  const lines: string[] = [
    `🔴 <b>Смена закрыта</b> · ${time} (${dur})`,
    `👤 ${d.staffClose}`,
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
  lines.push(`💰 В кассе: ${fmt(d.cashEnd)}₽`);

  return lines.join('\n');
}
