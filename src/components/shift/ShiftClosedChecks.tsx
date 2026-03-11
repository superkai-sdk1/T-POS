import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useShiftStore } from '@/store/shift';
import type { Check, CheckItem, CheckPayment } from '@/types';
import {
  Receipt, User, DoorOpen, Home, Building2, Warehouse,
  ChevronRight, Package, ArrowLeft, CreditCard, Banknote,
  BadgeDollarSign, Wallet, Split, PiggyBank,
} from 'lucide-react';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';
import { hapticFeedback } from '@/lib/telegram';

const spaceIconMap: Record<string, typeof Home> = {
  cabin_small: Home,
  cabin_big: Building2,
  hall: Warehouse,
};

const paymentMethodLabels: Record<string, { label: string; icon: typeof Banknote }> = {
  cash: { label: 'Наличные', icon: Banknote },
  card: { label: 'Карта', icon: CreditCard },
  debt: { label: 'Долг', icon: BadgeDollarSign },
  bonus: { label: 'Бонусы', icon: PiggyBank },
  deposit: { label: 'Депозит', icon: Wallet },
  split: { label: 'Сплит', icon: Split },
};

const fmtCur = (n: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + '₽';

const fmtDate = (d: string) =>
  new Date(d).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

interface CheckDetail {
  check: Check;
  items: (CheckItem & { item?: { name: string; category?: string } })[];
  payments: CheckPayment[];
}

export function ShiftClosedChecks() {
  const activeShift = useShiftStore((s) => s.activeShift);
  const [checks, setChecks] = useState<Check[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [detail, setDetail] = useState<CheckDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    if (!activeShift?.id) {
      setChecks([]);
      setIsLoading(false);
      return;
    }
    const { data } = await supabase
      .from('checks')
      .select('*, player:profiles!checks_player_id_fkey(*), space:spaces!checks_space_id_fkey(*)')
      .eq('shift_id', activeShift.id)
      .eq('status', 'closed')
      .order('closed_at', { ascending: false })
      .limit(100);
    if (data) {
      setChecks(
        data.map((c) => ({
          ...c,
          player: Array.isArray(c.player) ? c.player[0] : c.player,
          space: Array.isArray(c.space) ? c.space[0] : c.space,
        })) as Check[],
      );
    } else {
      setChecks([]);
    }
    setIsLoading(false);
  }, [activeShift?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const openDetail = async (check: Check) => {
    hapticFeedback('light');
    setDetailLoading(true);
    setDetail({ check, items: [], payments: [] });

    const [itemsRes, paymentsRes] = await Promise.all([
      supabase
        .from('check_items')
        .select('*, item:inventory(name, category)')
        .eq('check_id', check.id),
      supabase
        .from('check_payments')
        .select('*')
        .eq('check_id', check.id),
    ]);

    const items = (itemsRes.data || []).map((ci) => ({
      ...ci,
      item: Array.isArray(ci.item) ? ci.item[0] : ci.item,
    }));

    setDetail({
      check,
      items: items as CheckDetail['items'],
      payments: (paymentsRes.data || []) as CheckPayment[],
    });
    setDetailLoading(false);
  };

  if (!activeShift) {
    return (
      <div className="text-center py-16">
        <Receipt className="w-16 h-16 text-[var(--c-muted)] mx-auto mb-4" />
        <p className="text-[var(--c-hint)]">Смена не открыта</p>
        <p className="text-[11px] text-[var(--c-muted)] mt-1">
          Откройте смену, чтобы видеть закрытые чеки
        </p>
      </div>
    );
  }

  if (isLoading) {
    return <ListSkeleton rows={4} />;
  }

  if (checks.length === 0) {
    return (
      <div className="text-center py-16">
        <Receipt className="w-16 h-16 text-[var(--c-muted)] mx-auto mb-4" />
        <p className="text-[var(--c-hint)]">Пока нет закрытых чеков</p>
        <p className="text-[11px] text-[var(--c-muted)] mt-1">
          Закрытые чеки этой смены появятся здесь
        </p>
      </div>
    );
  }

  if (detail) {
    const { check, items, payments } = detail;
    const hasSpace = !!check.space;
    const displayName = hasSpace
      ? check.space!.name
      : (() => {
          const names: string[] = [];
          if (check.player?.nickname) names.push(check.player.nickname);
          if (check.guest_names)
            names.push(...check.guest_names.split(', ').filter(Boolean));
          return names.length > 0 ? names.join(', ') : 'Без клиента';
        })();
    const Icon = hasSpace
      ? spaceIconMap[check.space!.type] || DoorOpen
      : User;

    const pm = paymentMethodLabels[check.payment_method || ''];

    const itemsSubtotal = items.reduce(
      (s, ci) => s + ci.quantity * ci.price_at_time,
      0,
    );

    return (
      <div className="space-y-3">
        <button
          onClick={() => setDetail(null)}
          className="flex items-center gap-1.5 text-[11px] text-[var(--c-hint)] font-semibold active:scale-95 transition-transform"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Назад к списку
        </button>

        {/* Header */}
        <div className="p-3 rounded-xl bg-[var(--c-surface)] border border-[var(--c-border)] space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--c-accent)]/15 flex items-center justify-center shrink-0">
              <Icon className="w-5 h-5 text-[var(--c-accent)]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm text-[var(--c-text)] truncate">
                {displayName}
              </p>
              <p className="text-[10px] text-[var(--c-muted)] mt-0.5">
                {check.closed_at ? fmtDate(check.closed_at) : '—'}
              </p>
            </div>
            <div className="font-black italic tabular-nums text-[var(--c-accent)] text-lg shrink-0">
              {fmtCur(check.total_amount || 0)}
            </div>
          </div>
        </div>

        {/* Items */}
        {detailLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 rounded-xl bg-[var(--c-surface)] animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {items.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-[var(--c-muted)] uppercase tracking-wider">
                  Позиции ({items.length})
                </p>
                {items.map((ci) => (
                  <div
                    key={ci.id}
                    className="flex items-center gap-2 p-2.5 rounded-xl bg-[var(--c-surface)] border border-[var(--c-border)]"
                  >
                    <div className="w-7 h-7 rounded-lg bg-[var(--c-accent)]/10 flex items-center justify-center shrink-0">
                      <Package className="w-3.5 h-3.5 text-[var(--c-accent)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-[var(--c-text)] truncate">
                        {ci.item?.name || '—'}
                      </p>
                      <p className="text-[10px] text-[var(--c-muted)]">
                        {fmtCur(ci.price_at_time)} × {ci.quantity}
                      </p>
                    </div>
                    <span className="text-[13px] font-bold text-[var(--c-text)] tabular-nums shrink-0">
                      {fmtCur(ci.price_at_time * ci.quantity)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Payment info */}
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-[var(--c-muted)] uppercase tracking-wider">
                Оплата
              </p>

              {check.payment_method === 'split' && payments.length > 0 ? (
                <div className="space-y-1">
                  {payments.map((p) => {
                    const info = paymentMethodLabels[p.method];
                    const PayIcon = info?.icon || Wallet;
                    return (
                      <div
                        key={p.id}
                        className="flex items-center gap-2 p-2.5 rounded-xl bg-[var(--c-surface)] border border-[var(--c-border)]"
                      >
                        <div className="w-7 h-7 rounded-lg bg-[var(--c-success)]/10 flex items-center justify-center shrink-0">
                          <PayIcon className="w-3.5 h-3.5 text-[var(--c-success)]" />
                        </div>
                        <span className="text-[12px] font-medium text-[var(--c-text)] flex-1">
                          {info?.label || p.method}
                        </span>
                        <span className="text-[13px] font-bold text-[var(--c-text)] tabular-nums">
                          {fmtCur(p.amount)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : pm ? (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[var(--c-surface)] border border-[var(--c-border)]">
                  <div className="w-7 h-7 rounded-lg bg-[var(--c-success)]/10 flex items-center justify-center shrink-0">
                    <pm.icon className="w-3.5 h-3.5 text-[var(--c-success)]" />
                  </div>
                  <span className="text-[12px] font-medium text-[var(--c-text)] flex-1">
                    {pm.label}
                  </span>
                  <span className="text-[13px] font-bold text-[var(--c-text)] tabular-nums">
                    {fmtCur(check.total_amount)}
                  </span>
                </div>
              ) : null}
            </div>

            {/* Summary */}
            <div className="p-3 rounded-xl bg-[var(--c-accent)]/5 border border-[var(--c-accent)]/15 space-y-1.5">
              {itemsSubtotal !== check.total_amount && (
                <div className="flex justify-between text-[12px]">
                  <span className="text-[var(--c-hint)]">Подытог</span>
                  <span className="font-semibold text-[var(--c-text)] tabular-nums">
                    {fmtCur(itemsSubtotal)}
                  </span>
                </div>
              )}

              {(check.discount_total || 0) > 0 && (
                <div className="flex justify-between text-[12px]">
                  <span className="text-[var(--c-hint)]">Скидка</span>
                  <span className="font-semibold text-[var(--c-success)] tabular-nums">
                    −{fmtCur(check.discount_total)}
                  </span>
                </div>
              )}

              {check.bonus_used > 0 && (
                <div className="flex justify-between text-[12px]">
                  <span className="text-[var(--c-hint)]">Бонусы</span>
                  <span className="font-semibold text-[var(--c-warning)] tabular-nums">
                    −{fmtCur(check.bonus_used)}
                  </span>
                </div>
              )}

              {check.certificate_used > 0 && (
                <div className="flex justify-between text-[12px]">
                  <span className="text-[var(--c-hint)]">Сертификат</span>
                  <span className="font-semibold text-[var(--c-info)] tabular-nums">
                    −{fmtCur(check.certificate_used)}
                  </span>
                </div>
              )}

              <div className="flex justify-between text-[13px] pt-1 border-t border-[var(--c-border)]">
                <span className="font-bold text-[var(--c-text)]">Итого</span>
                <span className="font-black text-[var(--c-accent)] tabular-nums">
                  {fmtCur(check.total_amount || 0)}
                </span>
              </div>
            </div>

            {check.note && (
              <div className="p-2.5 rounded-xl bg-[var(--c-surface)] border border-[var(--c-border)]">
                <p className="text-[10px] text-[var(--c-muted)] mb-0.5">Заметка</p>
                <p className="text-[12px] text-[var(--c-hint)]">{check.note}</p>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {checks.map((check) => {
        const hasSpace = !!check.space;
        const displayName = hasSpace
          ? check.space!.name
          : (() => {
              const names: string[] = [];
              if (check.player?.nickname) names.push(check.player.nickname);
              if (check.guest_names)
                names.push(...check.guest_names.split(', ').filter(Boolean));
              return names.length > 0 ? names.join(', ') : 'Без клиента';
            })();
        const Icon = hasSpace
          ? spaceIconMap[check.space!.type] || DoorOpen
          : User;

        return (
          <button
            key={check.id}
            onClick={() => openDetail(check)}
            className="w-full p-4 rounded-2xl bg-[var(--c-surface)] border border-[var(--c-border)] active:scale-[0.98] transition-all text-left"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-10 h-10 rounded-xl bg-[var(--c-accent)]/15 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-[var(--c-accent)]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-[var(--c-text)] truncate">
                    {displayName}
                  </p>
                  <p className="text-[11px] text-[var(--c-hint)] mt-0.5">
                    {check.closed_at ? fmtDate(check.closed_at) : '—'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-black italic tabular-nums text-[var(--c-accent)]">
                  {fmtCur(check.total_amount || 0)}
                </span>
                <ChevronRight className="w-4 h-4 text-[var(--c-muted)]" />
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
