import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Bell, MessageSquare, ChevronRight, Inbox, Send, Smartphone } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { hapticNotification } from '@/lib/telegram';
import { useOnTableChange } from '@/hooks/useRealtimeSync';
import type { AdminNotificationType, NotificationChannel, TypeSetting } from '@/lib/notifications';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  created_at: string;
}

const TYPE_LABELS: Record<AdminNotificationType, string> = {
  shift_open: 'Открытие смены',
  shift_close: 'Закрытие смены',
  payment_cash: 'Оплата наличными',
  payment_card: 'Оплата картой',
  payment_deposit: 'Оплата депозитом',
  payment_debt: 'Оплата в долг',
  birthday: 'День рождения',
  refund: 'Возврат',
  supply: 'Приёмка товаров',
  revision: 'Ревизия',
};

const CHANNEL_OPTIONS: { id: NotificationChannel; label: string; short: string }[] = [
  { id: 'telegram', label: 'Telegram', short: 'TG' },
  { id: 'pwa', label: 'PWA', short: 'PWA' },
  { id: 'both', label: 'Оба', short: 'Оба' },
];

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

function migrateLegacy(raw: Record<string, unknown>, legacyChannel?: string): Record<AdminNotificationType, TypeSetting> {
  const result = { ...DEFAULT_TYPES };
  const ch = (legacyChannel || 'both') as NotificationChannel;
  for (const key of Object.keys(result) as AdminNotificationType[]) {
    const v = raw[key];
    if (typeof v === 'boolean') {
      result[key] = { enabled: v, channel: ch };
    } else if (v && typeof v === 'object' && 'enabled' in v && 'channel' in v) {
      result[key] = { enabled: !!(v as TypeSetting).enabled, channel: ((v as TypeSetting).channel as NotificationChannel) || 'both' };
    }
  }
  return result;
}

export function NotificationsManager() {
  const [telegramChatIds, setTelegramChatIds] = useState('');
  const [types, setTypes] = useState<Record<AdminNotificationType, TypeSetting>>(DEFAULT_TYPES);
  const [saving, setSaving] = useState(false);
  const [clientBonusAccrual, setClientBonusAccrual] = useState(true);
  const [clientBonusSpend, setClientBonusSpend] = useState(true);
  const [showClientSection, setShowClientSection] = useState(false);
  const [recentNotifications, setRecentNotifications] = useState<Notification[]>([]);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'denied',
  );

  const load = useCallback(async () => {
    const { data } = await supabase.from('app_settings').select('key, value').in('key', [
      'notification_admin_channel',
      'notification_admin_telegram_chat_ids',
      'notification_admin_types',
      'notification_client_bonus_accrual',
      'notification_client_bonus_spend',
    ]);
    const map = new Map((data || []).map((r) => [r.key, r.value]));
    setTelegramChatIds(map.get('notification_admin_telegram_chat_ids') || '');
    setClientBonusAccrual(map.get('notification_client_bonus_accrual') !== 'false');
    setClientBonusSpend(map.get('notification_client_bonus_spend') !== 'false');
    try {
      const raw = JSON.parse(map.get('notification_admin_types') || '{}') as Record<string, unknown>;
      const legacyChannel = map.get('notification_admin_channel') as string | undefined;
      setTypes(migrateLegacy(raw, legacyChannel));
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

  const requestNotifPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return;
    const perm = await Notification.requestPermission();
    setNotifPermission(perm);
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await supabase.from('app_settings').upsert([
        { key: 'notification_admin_telegram_chat_ids', value: telegramChatIds.trim(), updated_at: new Date().toISOString() },
        { key: 'notification_admin_types', value: JSON.stringify(types), updated_at: new Date().toISOString() },
        { key: 'notification_client_bonus_accrual', value: String(clientBonusAccrual), updated_at: new Date().toISOString() },
        { key: 'notification_client_bonus_spend', value: String(clientBonusSpend), updated_at: new Date().toISOString() },
      ], { onConflict: 'key' });
      const usesPwa = Object.values(types).some((t) => t.enabled && (t.channel === 'pwa' || t.channel === 'both'));
      if (usesPwa && typeof Notification !== 'undefined' && Notification.permission === 'default') {
        const perm = await Notification.requestPermission();
        setNotifPermission(perm);
      }
      hapticNotification('success');
    } finally {
      setSaving(false);
    }
  };

  const toggleType = (key: AdminNotificationType) => {
    setTypes((prev) => ({
      ...prev,
      [key]: { ...prev[key], enabled: !prev[key].enabled },
    }));
  };

  const setTypeChannel = (key: AdminNotificationType, channel: NotificationChannel) => {
    setTypes((prev) => ({
      ...prev,
      [key]: { ...prev[key], channel },
    }));
  };

  const usesTelegram = Object.values(types).some((t) => t.enabled && (t.channel === 'telegram' || t.channel === 'both'));
  const usesPwa = Object.values(types).some((t) => t.enabled && (t.channel === 'pwa' || t.channel === 'both'));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-[var(--c-text)] flex items-center gap-2">
          <Bell className="w-5 h-5 text-[var(--c-accent)]" />
          Уведомления
        </h2>
        <p className="text-xs text-[var(--c-hint)] mt-1">
          Выберите уведомления и канал доставки (Telegram или PWA) для каждого типа
        </p>
      </div>

      <div className="p-4 rounded-xl card space-y-4">
        <h3 className="text-sm font-semibold text-[var(--c-text)]">Владельцам и администраторам</h3>
        <p className="text-[11px] text-[var(--c-hint)]">
          Telegram и PWA — каналы доставки. Для каждого уведомления выберите, куда его отправлять.
        </p>

        {usesTelegram && (
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
          <p className="text-[11px] font-medium text-[var(--c-hint)] mb-2">Типы уведомлений и каналы доставки</p>
          <div className="space-y-2">
            {(Object.keys(TYPE_LABELS) as AdminNotificationType[]).map((key) => (
              <div
                key={key}
                className="p-2.5 rounded-xl card space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[var(--c-text)]">{TYPE_LABELS[key]}</span>
                  <button
                    onClick={() => toggleType(key)}
                    className="shrink-0"
                  >
                    <Badge variant={types[key]?.enabled ? 'success' : 'default'} size="sm">
                      {types[key]?.enabled ? 'Вкл' : 'Выкл'}
                    </Badge>
                  </button>
                </div>
                {types[key]?.enabled && (
                  <div className="flex gap-1.5 pt-1 border-t border-[var(--c-border)]">
                    <span className="text-[10px] text-[var(--c-muted)] self-center">Канал:</span>
                    {CHANNEL_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => setTypeChannel(key, opt.id)}
                        className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium transition-all flex items-center justify-center gap-1 ${
                          types[key]?.channel === opt.id
                            ? 'bg-[var(--c-accent)] text-[var(--c-accent-text)]'
                            : 'bg-[var(--c-surface)] text-[var(--c-hint)]'
                        }`}
                      >
                        {opt.id === 'telegram' && <Send className="w-3 h-3" />}
                        {opt.id === 'pwa' && <Smartphone className="w-3 h-3" />}
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
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

      {(usesPwa || recentNotifications.length > 0) && (
        <div className="p-4 rounded-xl card space-y-3">
          {typeof Notification !== 'undefined' && notifPermission !== 'granted' && usesPwa && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <p className="text-xs text-[var(--c-text)] mb-2">
                {notifPermission === 'denied'
                  ? 'Уведомления заблокированы в браузере. Разрешите их в настройках сайта.'
                  : 'Разрешите уведомления, чтобы получать их в PWA.'}
              </p>
              {notifPermission !== 'denied' && (
                <button
                  onClick={requestNotifPermission}
                  className="px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-400 text-xs font-medium"
                >
                  Разрешить уведомления
                </button>
              )}
            </div>
          )}
          <h3 className="text-sm font-semibold text-[var(--c-text)] flex items-center gap-2">
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
