import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Bell, MessageSquare, ChevronRight, Inbox } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { hapticNotification } from '@/lib/telegram';
import { useOnTableChange } from '@/hooks/useRealtimeSync';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  created_at: string;
}

type AdminNotificationType = 'shift_open' | 'shift_close' | 'payment_cash' | 'payment_card' | 'payment_deposit' | 'payment_debt' | 'birthday';

const TYPE_LABELS: Record<AdminNotificationType, string> = {
  shift_open: 'Открытие смены',
  shift_close: 'Закрытие смены',
  payment_cash: 'Оплата наличными',
  payment_card: 'Оплата картой',
  payment_deposit: 'Оплата депозитом',
  payment_debt: 'Оплата в долг',
  birthday: 'День рождения',
};

type Channel = 'telegram' | 'pwa' | 'both';

const CHANNEL_OPTIONS: { id: Channel; label: string }[] = [
  { id: 'telegram', label: 'Telegram' },
  { id: 'pwa', label: 'PWA' },
  { id: 'both', label: 'Оба' },
];

export function NotificationsManager() {
  const [channel, setChannel] = useState<Channel>('telegram');
  const [telegramChatIds, setTelegramChatIds] = useState('');
  const [types, setTypes] = useState<Record<AdminNotificationType, boolean>>({
    shift_open: true,
    shift_close: true,
    payment_cash: true,
    payment_card: true,
    payment_deposit: true,
    payment_debt: true,
    birthday: true,
  });
  const [saving, setSaving] = useState(false);
  const [clientBonusAccrual, setClientBonusAccrual] = useState(true);
  const [clientBonusSpend, setClientBonusSpend] = useState(true);
  const [showClientSection, setShowClientSection] = useState(false);
  const [recentNotifications, setRecentNotifications] = useState<Notification[]>([]);

  const load = useCallback(async () => {
    const { data } = await supabase.from('app_settings').select('key, value').in('key', [
      'notification_admin_channel',
      'notification_admin_telegram_chat_ids',
      'notification_admin_types',
      'notification_client_bonus_accrual',
      'notification_client_bonus_spend',
    ]);
    const map = new Map((data || []).map((r) => [r.key, r.value]));
    setChannel((map.get('notification_admin_channel') as Channel) || 'telegram');
    setTelegramChatIds(map.get('notification_admin_telegram_chat_ids') || '');
    setClientBonusAccrual(map.get('notification_client_bonus_accrual') !== 'false');
    setClientBonusSpend(map.get('notification_client_bonus_spend') !== 'false');
    try {
      const t = JSON.parse(map.get('notification_admin_types') || '{}');
      setTypes((prev) => ({ ...prev, ...t }));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadNotifications = useCallback(async () => {
    const { data } = await supabase
      .from('notifications')
      .select('id, type, title, body, created_at')
      .order('created_at', { ascending: false })
      .limit(20);
    setRecentNotifications((data || []) as Notification[]);
  }, []);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);
  useOnTableChange(['notifications'], loadNotifications);

  const save = async () => {
    setSaving(true);
    try {
      await supabase.from('app_settings').upsert([
        { key: 'notification_admin_channel', value: channel, updated_at: new Date().toISOString() },
        { key: 'notification_admin_telegram_chat_ids', value: telegramChatIds.trim(), updated_at: new Date().toISOString() },
        { key: 'notification_admin_types', value: JSON.stringify(types), updated_at: new Date().toISOString() },
        { key: 'notification_client_bonus_accrual', value: String(clientBonusAccrual), updated_at: new Date().toISOString() },
        { key: 'notification_client_bonus_spend', value: String(clientBonusSpend), updated_at: new Date().toISOString() },
      ], { onConflict: 'key' });
      hapticNotification('success');
    } finally {
      setSaving(false);
    }
  };

  const toggleType = (key: AdminNotificationType) => {
    setTypes((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-[var(--c-text)] flex items-center gap-2">
          <Bell className="w-5 h-5 text-[var(--c-accent)]" />
          Уведомления
        </h2>
        <p className="text-xs text-[var(--c-hint)] mt-1">
          Настройте уведомления для администраторов и клиентов
        </p>
      </div>

      <div className="p-4 rounded-xl card space-y-4">
        <h3 className="text-sm font-semibold text-[var(--c-text)]">Администраторам</h3>
        <p className="text-[11px] text-[var(--c-hint)]">Куда отправлять уведомления</p>
        <div className="flex gap-2">
          {CHANNEL_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setChannel(opt.id)}
              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                channel === opt.id ? 'bg-[var(--c-accent)] text-[var(--c-accent-text)]' : 'bg-[var(--c-surface)] text-[var(--c-hint)]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {(channel === 'telegram' || channel === 'both') && (
          <div>
            <label className="block text-[11px] font-medium text-[var(--c-hint)] mb-1">ID чатов Telegram (через запятую)</label>
            <input
              type="text"
              value={telegramChatIds}
              onChange={(e) => setTelegramChatIds(e.target.value)}
              placeholder="556525624, 1005574994"
              className="w-full px-3 py-2 rounded-xl bg-[var(--c-surface)] border border-[var(--c-border)] text-sm text-[var(--c-text)] placeholder:text-[var(--c-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--c-accent)]"
            />
          </div>
        )}

        <div>
          <p className="text-[11px] font-medium text-[var(--c-hint)] mb-2">Какие уведомления отправлять</p>
          <div className="space-y-2">
            {(Object.keys(TYPE_LABELS) as AdminNotificationType[]).map((key) => (
              <button
                key={key}
                onClick={() => toggleType(key)}
                className="w-full flex items-center justify-between p-2.5 rounded-xl card-interactive text-left"
              >
                <span className="text-sm text-[var(--c-text)]">{TYPE_LABELS[key]}</span>
                <Badge variant={types[key] ? 'success' : 'default'} size="sm">
                  {types[key] ? 'Вкл' : 'Выкл'}
                </Badge>
              </button>
            ))}
          </div>
        </div>
      </div>

      <button
        onClick={() => setShowClientSection(!showClientSection)}
        className="w-full flex items-center justify-between p-3 rounded-xl card-interactive"
      >
        <span className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-[var(--c-accent)]" />
          <span className="text-sm font-medium text-[var(--c-text)]">Клиентам (Wallet)</span>
        </span>
        <ChevronRight className={`w-4 h-4 text-[var(--c-muted)] transition-transform ${showClientSection ? 'rotate-90' : ''}`} />
      </button>

      {showClientSection && (
        <div className="p-4 rounded-xl card space-y-4 animate-fade-in-up">
          <p className="text-[11px] text-[var(--c-hint)]">
            Уведомления в Telegram при изменении бонусов. Клиент должен быть привязан к @wallet боту.
          </p>
          <div className="space-y-2">
            <button
              onClick={() => setClientBonusAccrual(!clientBonusAccrual)}
              className="w-full flex items-center justify-between p-2.5 rounded-xl card-interactive text-left"
            >
              <span className="text-sm text-[var(--c-text)]">Начисление бонусов</span>
              <Badge variant={clientBonusAccrual ? 'success' : 'default'} size="sm">
                {clientBonusAccrual ? 'Вкл' : 'Выкл'}
              </Badge>
            </button>
            <button
              onClick={() => setClientBonusSpend(!clientBonusSpend)}
              className="w-full flex items-center justify-between p-2.5 rounded-xl card-interactive text-left"
            >
              <span className="text-sm text-[var(--c-text)]">Списание бонусов</span>
              <Badge variant={clientBonusSpend ? 'success' : 'default'} size="sm">
                {clientBonusSpend ? 'Вкл' : 'Выкл'}
              </Badge>
            </button>
          </div>
          <p className="text-[10px] text-[var(--c-muted)]">
            Кастомное сообщение можно отправить через бота Wallet командой /broadcast (только для владельцев).
          </p>
        </div>
      )}

      <button
        onClick={save}
        disabled={saving}
        className="w-full py-3 rounded-xl bg-[var(--c-accent)] text-[var(--c-accent-text)] font-semibold text-sm disabled:opacity-50 active:scale-[0.98] transition-transform"
      >
        {saving ? 'Сохранение...' : 'Сохранить'}
      </button>

      {(channel === 'pwa' || channel === 'both') && (
        <div className="p-4 rounded-xl card">
          <h3 className="text-sm font-semibold text-[var(--c-text)] flex items-center gap-2 mb-3">
            <Inbox className="w-4 h-4" />
            Последние уведомления (PWA)
          </h3>
          {recentNotifications.length === 0 ? (
            <p className="text-xs text-[var(--c-muted)]">Пока нет уведомлений</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {recentNotifications.map((n) => (
                <div key={n.id} className="p-2.5 rounded-lg bg-[var(--c-surface)]">
                  <p className="text-xs font-medium text-[var(--c-text)]">{n.title}</p>
                  {n.body && <p className="text-[11px] text-[var(--c-hint)] mt-0.5">{n.body}</p>}
                  <p className="text-[10px] text-[var(--c-muted)] mt-1">
                    {new Date(n.created_at).toLocaleString('ru-RU')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
