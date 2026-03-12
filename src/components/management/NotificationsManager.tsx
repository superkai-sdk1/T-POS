import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Bell,
  MessageSquare,
  ChevronRight,
  Inbox,
  Send,
  Smartphone,
  AlertTriangle,
  CreditCard,
  Banknote,
  Gift,
  RotateCcw,
  Package,
  ClipboardList,
} from 'lucide-react';
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

const TYPE_META: Record<
  AdminNotificationType,
  { color: string; iconBg: string; icon: React.ReactNode }
> = {
  shift_open: {
    color: 'text-emerald-400',
    iconBg: 'bg-emerald-500/20',
    icon: <Bell className="w-4 h-4" />,
  },
  shift_close: {
    color: 'text-rose-400',
    iconBg: 'bg-rose-500/20',
    icon: <Bell className="w-4 h-4" />,
  },
  payment_cash: {
    color: 'text-emerald-300',
    iconBg: 'bg-emerald-500/15',
    icon: <Banknote className="w-4 h-4" />,
  },
  payment_card: {
    color: 'text-sky-300',
    iconBg: 'bg-sky-500/20',
    icon: <CreditCard className="w-4 h-4" />,
  },
  payment_deposit: {
    color: 'text-indigo-300',
    iconBg: 'bg-indigo-500/20',
    icon: <Inbox className="w-4 h-4" />,
  },
  payment_debt: {
    color: 'text-amber-300',
    iconBg: 'bg-amber-500/20',
    icon: <AlertTriangle className="w-4 h-4" />,
  },
  birthday: {
    color: 'text-pink-300',
    iconBg: 'bg-pink-500/20',
    icon: <Gift className="w-4 h-4" />,
  },
  refund: {
    color: 'text-rose-300',
    iconBg: 'bg-rose-500/20',
    icon: <RotateCcw className="w-4 h-4" />,
  },
  supply: {
    color: 'text-blue-300',
    iconBg: 'bg-blue-500/20',
    icon: <Package className="w-4 h-4" />,
  },
  revision: {
    color: 'text-violet-300',
    iconBg: 'bg-violet-500/20',
    icon: <ClipboardList className="w-4 h-4" />,
  },
};

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

  const makeChannelFlags = (channel: NotificationChannel): { tg: boolean; pwa: boolean } => {
    if (channel === 'telegram') return { tg: true, pwa: false };
    if (channel === 'pwa') return { tg: false, pwa: true };
    return { tg: true, pwa: true };
  };

  const flagsToChannel = (tg: boolean, pwa: boolean): NotificationChannel => {
    if (tg && pwa) return 'both';
    if (tg) return 'telegram';
    if (pwa) return 'pwa';
    return 'telegram';
  };

  const toggleChannelFlag = (key: AdminNotificationType, which: 'tg' | 'pwa') => {
    setTypes((prev) => {
      const current = prev[key] ?? DEFAULT_TYPES[key];
      const { tg, pwa } = makeChannelFlags(current.channel);
      const nextTg = which === 'tg' ? !tg : tg;
      const nextPwa = which === 'pwa' ? !pwa : pwa;
      const nextChannel = flagsToChannel(nextTg, nextPwa);
      return {
        ...prev,
        [key]: { ...current, channel: nextChannel },
      };
    });
  };

  return (
    <div className="space-y-5 pb-10">
      {/* PWA permission banner */}
      {usesPwa && typeof Notification !== 'undefined' && notifPermission !== 'granted' && (
        <div className="rounded-3xl bg-amber-500/10 border border-amber-500/25 px-4 py-4 sm:px-5 sm:py-5 shadow-lg shadow-amber-500/5 space-y-3">
          <div className="flex gap-3">
            <div className="text-amber-400 shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-amber-100">Требуется разрешение</h4>
              <p className="text-[11px] sm:text-xs text-amber-100/70 leading-relaxed">
                Чтобы получать мгновенные PWA‑уведомления о сменах и оплатах, разрешите их в браузере.
              </p>
            </div>
          </div>
          {notifPermission !== 'denied' && (
            <button
              onClick={requestNotifPermission}
              className="w-full bg-amber-500 hover:bg-amber-400 text-[#0A051E] font-bold py-2.5 rounded-2xl text-[11px] uppercase tracking-[0.16em] transition active:scale-95"
            >
              Разрешить уведомления
            </button>
          )}
          {notifPermission === 'denied' && (
            <p className="text-[10px] text-amber-200/70">
              Уведомления заблокированы в настройках браузера. Разрешите их вручную для этого сайта.
            </p>
          )}
        </div>
      )}

      {/* Telegram admin config */}
      {usesTelegram && (
        <section className="rounded-3xl bg-[var(--c-surface)]/80 border border-[var(--c-border)] px-4 py-4 sm:px-5 sm:py-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#0088cc]/20 text-[#0088cc]">
              <Send className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--c-text)]">Админ‑уведомления в Telegram</h3>
              <p className="text-[10px] text-[var(--c-hint)] uppercase tracking-[0.18em]">
                ВЛАДЕЛЬЦАМ И АДМИНИСТРАТОРАМ
              </p>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-[var(--c-hint)] mb-1">
              ID чатов Telegram (через запятую)
            </label>
            <input
              type="text"
              value={telegramChatIds}
              onChange={(e) => setTelegramChatIds(e.target.value)}
              placeholder="556525624, 1005574994"
              className="w-full px-3 py-2.5 rounded-2xl bg-[var(--c-bg)]/40 border border-[var(--c-border)] text-sm text-[var(--c-text)] placeholder:text-[var(--c-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--c-accent)]/60"
            />
          </div>
          <p className="text-[10px] text-[var(--c-muted)] leading-relaxed">
            Добавьте сюда чаты владельцев/админов, куда будут приходить отчёты о сменах, оплатах и других событиях.
          </p>
        </section>
      )}

      {/* System events */}
      <div className="space-y-3">
        <h3 className="text-[10px] font-bold text-[var(--c-hint)] uppercase tracking-[0.24em] px-1">
          Системные события
        </h3>
        <div className="space-y-2.5">
          {(Object.keys(TYPE_LABELS) as AdminNotificationType[]).map((key) => {
            const meta = TYPE_META[key];
            const cfg = types[key] ?? DEFAULT_TYPES[key];
            const { tg, pwa } = makeChannelFlags(cfg.channel);

            return (
              <div
                key={key}
                className="rounded-3xl bg-[var(--c-surface)]/80 border border-[var(--c-border)] px-3.5 py-3.5 sm:px-4 sm:py-4 space-y-3 transition-transform active:scale-[0.98]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-2xl flex items-center justify-center shadow-inner ${meta.iconBg} ${meta.color}`}>
                      {meta.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[var(--c-text)] truncate">
                          {TYPE_LABELS[key]}
                        </span>
                      </div>
                      <span
                        className={`mt-0.5 inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-[0.16em] ${
                          cfg.enabled
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : 'bg-slate-700/40 text-slate-300/70 border border-slate-600/60'
                        }`}
                      >
                        {cfg.enabled ? 'Активно' : 'Выключено'}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleType(key)}
                    className="hidden sm:inline-flex items-center justify-center px-2.5 py-1.5 rounded-full border border-[var(--c-border)] text-[10px] font-medium text-[var(--c-hint)] hover:border-[var(--c-accent)]/60 hover:text-[var(--c-accent)]/90 transition"
                  >
                    {cfg.enabled ? 'Выключить' : 'Включить'}
                  </button>
                </div>

                {cfg.enabled && (
                  <div className="flex gap-2">
                    {/* Telegram switch */}
                    <button
                      type="button"
                      onClick={() => toggleChannelFlag(key, 'tg')}
                      className="flex-1 flex items-center justify-between bg-white/5 hover:bg-white/10 rounded-2xl px-3 py-2.5 transition"
                    >
                      <span className="text-[11px] font-medium text-slate-200 uppercase tracking-[0.16em]">
                        Telegram
                      </span>
                      <div
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          tg ? 'bg-[#0088cc]' : 'bg-white/15'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                            tg ? 'translate-x-4' : 'translate-x-0.5'
                          }`}
                        />
                      </div>
                    </button>

                    {/* PWA switch */}
                    <button
                      type="button"
                      onClick={() => toggleChannelFlag(key, 'pwa')}
                      className="flex-1 flex items-center justify-between bg-white/5 hover:bg-white/10 rounded-2xl px-3 py-2.5 transition"
                    >
                      <span className="text-[11px] font-medium text-slate-200 uppercase tracking-[0.16em]">
                        PWA
                      </span>
                      <div
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          pwa ? 'bg-[var(--c-accent)]' : 'bg-white/15'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                            pwa ? 'translate-x-4' : 'translate-x-0.5'
                          }`}
                        />
                      </div>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Client / wallet section */}
      <button
        onClick={() => setShowClientSection(!showClientSection)}
        className="w-full flex items-center justify-between px-3.5 py-3 rounded-2xl bg-[var(--c-surface)]/80 border border-[var(--c-border)] hover:bg-[var(--c-surface-hover)] transition"
      >
        <span className="flex items-center gap-2.5">
          <MessageSquare className="w-4 h-4 text-[var(--c-accent)]" />
          <span className="text-sm font-medium text-[var(--c-text)]">Клиентские уведомления (Wallet)</span>
        </span>
        <ChevronRight
          className={`w-4 h-4 text-[var(--c-muted)] transition-transform ${showClientSection ? 'rotate-90' : ''}`}
        />
      </button>

      {showClientSection && (
        <div className="rounded-3xl bg-[var(--c-surface)]/80 border border-[var(--c-border)] px-4 py-4 sm:px-5 sm:py-5 space-y-3">
          <p className="text-[11px] text-[var(--c-hint)]">
            Уведомления в Telegram при изменении бонусов. Клиент должен быть привязан к Wallet‑боту.
          </p>
          <div className="space-y-2">
            <button
              onClick={() => setClientBonusAccrual(!clientBonusAccrual)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-2xl bg-white/5 hover:bg-white/10 transition text-left"
            >
              <span className="text-sm text-[var(--c-text)]">Начисление бонусов</span>
              <Badge variant={clientBonusAccrual ? 'success' : 'default'} size="sm">
                {clientBonusAccrual ? 'Вкл' : 'Выкл'}
              </Badge>
            </button>
            <button
              onClick={() => setClientBonusSpend(!clientBonusSpend)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-2xl bg-white/5 hover:bg-white/10 transition text-left"
            >
              <span className="text-sm text-[var(--c-text)]">Списание бонусов</span>
              <Badge variant={clientBonusSpend ? 'success' : 'default'} size="sm">
                {clientBonusSpend ? 'Вкл' : 'Выкл'}
              </Badge>
            </button>
          </div>
          <p className="text-[10px] text-[var(--c-muted)] leading-relaxed">
            Кастомные рассылки можно делать через Wallet‑бота командой /broadcast (доступно только владельцам).
          </p>
        </div>
      )}

      {/* Save button */}
      <div className="pt-1">
        <button
          onClick={save}
          disabled={saving}
          className="w-full py-3.5 rounded-2xl bg-[var(--c-accent)] text-[var(--c-accent-text)] font-semibold text-sm disabled:opacity-50 active:scale-[0.98] transition"
        >
          {saving ? 'Сохранение…' : 'Сохранить настройки'}
        </button>
      </div>

      {/* Recent PWA notifications */}
      {(usesPwa || recentNotifications.length > 0) && (
        <div className="rounded-3xl bg-[var(--c-surface)]/80 border border-[var(--c-border)] px-4 py-4 sm:px-5 sm:py-5 space-y-3">
          <h3 className="text-sm font-semibold text-[var(--c-text)] flex items-center gap-2">
            <Inbox className="w-4 h-4" />
            Последние PWA‑уведомления
          </h3>
          {recentNotifications.length === 0 ? (
            <p className="text-xs text-[var(--c-muted)]">Пока нет уведомлений</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {recentNotifications.map((n) => (
                <div key={n.id} className="p-2.5 rounded-2xl bg-[var(--c-bg)]/40 border border-[var(--c-border)]/60">
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
