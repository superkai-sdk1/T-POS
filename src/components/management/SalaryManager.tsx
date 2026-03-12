import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { useShiftStore } from '@/store/shift';
import { useOnTableChange } from '@/hooks/useRealtimeSync';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { TabSwitcher } from '@/components/ui/TabSwitcher';
import { calcSalaryFromRevenue } from '@/lib/salary';
import { notifySalaryPaid } from '@/lib/notifications';
import { Banknote, ArrowRightLeft, CalendarDays, Users, BarChart3, Clock, Pencil, XCircle } from 'lucide-react';
import { hapticNotification } from '@/lib/telegram';
import type { SalaryPayment, Profile, Shift } from '@/types';

const fmtCur = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + '₽';
const fmtDate = (d: string) => new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
const fmtDateTime = (d: string) => new Date(d).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

interface ShiftWithRevenue extends Shift {
  revenue: number;
  salary: number;
  closer?: Profile;
}

type Tab = 'shifts' | 'history' | 'reports';

export function SalaryManager() {
  const user = useAuthStore((s) => s.user);
  const isOwner = useAuthStore((s) => s.isOwner());
  const activeShift = useShiftStore((s) => s.activeShift);

  const [tab, setTab] = useState<Tab>(isOwner ? 'shifts' : 'history');
  const [payments, setPayments] = useState<(SalaryPayment & { shiftClosedAt?: string; shiftRevenue?: number })[]>([]);
  const [shifts, setShifts] = useState<ShiftWithRevenue[]>([]);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [showPay, setShowPay] = useState(false);
  const [payShift, setPayShift] = useState<ShiftWithRevenue | null>(null);
  const [selectedRecipient, setSelectedRecipient] = useState<Profile | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer'>('cash');
  const [note, setNote] = useState('');
  const [manualAmount, setManualAmount] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState('');

  const [filterMonth, setFilterMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const loadPayments = useCallback(async () => {
    const start = filterMonth + '-01T00:00:00';
    const [y, m] = filterMonth.split('-').map(Number);
    const end = new Date(y, m, 0, 23, 59, 59).toISOString();

    let q = supabase
      .from('salary_payments')
      .select('*, profile:profiles!salary_payments_profile_id_fkey(nickname), paidBy:profiles!salary_payments_paid_by_fkey(nickname), shift:shifts!salary_payments_shift_id_fkey(closed_at)')
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: false });

    if (!isOwner && user) {
      q = q.eq('profile_id', user.id);
    }
    const { data } = await q;
    if (data) {
      const mapped = data.map((p: Record<string, unknown>) => {
        const profile = Array.isArray(p.profile) ? p.profile[0] : p.profile;
        const paidBy = Array.isArray(p.paidBy) ? p.paidBy[0] : p.paidBy;
        const shift = Array.isArray(p.shift) ? p.shift[0] : p.shift;
        return {
          ...p,
          profile,
          paidBy,
          shift,
          shiftClosedAt: (shift as Record<string, string> | null)?.closed_at || null,
        };
      });
      setPayments(mapped as typeof payments);
    }
  }, [filterMonth, isOwner, user?.id]);

  const loadShifts = useCallback(async () => {
    const { data: shiftsData } = await supabase
      .from('shifts')
      .select('*, closer:profiles!shifts_closed_by_fkey(id, nickname)')
      .eq('status', 'closed')
      .order('closed_at', { ascending: false })
      .limit(100);
    if (!shiftsData) return;

    const paidShiftIds = new Set<string>();
    const { data: paidData } = await supabase.from('salary_payments').select('shift_id');
    if (paidData) for (const p of paidData) if (p.shift_id) paidShiftIds.add(p.shift_id);

    const shiftsWithRevenue: ShiftWithRevenue[] = [];
    for (const s of shiftsData) {
      const { data: checks } = await supabase
        .from('checks')
        .select('total_amount')
        .eq('shift_id', s.id)
        .eq('status', 'closed');
      const { data: refunds } = await supabase
        .from('refunds')
        .select('total_amount')
        .eq('shift_id', s.id);
      const totalRevenue = (checks || []).reduce((sum: number, c: { total_amount: number }) => sum + (c.total_amount || 0), 0) -
        (refunds || []).reduce((sum: number, r: { total_amount: number }) => sum + (r.total_amount || 0), 0);
      const salary = calcSalaryFromRevenue(totalRevenue);
      const closer = Array.isArray(s.closer) ? s.closer[0] : s.closer;
      shiftsWithRevenue.push({
        ...s,
        closer: closer as Profile,
        revenue: totalRevenue,
        salary,
        _paid: paidShiftIds.has(s.id),
      } as ShiftWithRevenue & { _paid: boolean });
    }
    setShifts(shiftsWithRevenue);
  }, []);

  const loadStaff = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .in('role', ['owner', 'staff'])
      .order('role')
      .order('nickname');
    if (data) setStaff(data as Profile[]);
  }, []);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    await Promise.all([loadPayments(), loadShifts(), loadStaff()]);
    setIsLoading(false);
  }, [loadPayments, loadShifts, loadStaff]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useOnTableChange(useMemo(() => ['salary_payments', 'shifts', 'checks', 'refunds'], []), loadAll);

  const paidShiftIds = useMemo(() => new Set(payments.filter((p) => p.shift_id).map((p) => p.shift_id)), [payments]);
  const pendingShifts = useMemo(() => shifts.filter((s) => !paidShiftIds.has(s.id) && !(s as ShiftWithRevenue & { _paid?: boolean })._paid), [shifts, paidShiftIds]);
  const paidShifts = useMemo(() => shifts.filter((s) => paidShiftIds.has(s.id) || (s as ShiftWithRevenue & { _paid?: boolean })._paid), [shifts, paidShiftIds]);

  const openPayDrawer = (shift: ShiftWithRevenue | null) => {
    setPayShift(shift);
    setSelectedRecipient(shift ? (shift.closer as Profile) || null : null);
    setPaymentMethod('cash');
    setNote('');
    setManualAmount(shift ? String(shift.salary) : '');
    setError('');
    setShowPay(true);
  };

  const handlePay = async () => {
    const amt = manualAmount.trim() ? Math.round(parseFloat(manualAmount.replace(/\s/g, '')) || 0) : (payShift?.salary ?? 0);
    if (!selectedRecipient || amt <= 0) {
      setError('Укажите сотрудника и сумму');
      return;
    }
    if (paymentMethod === 'cash') {
      if (!activeShift) {
        setError('Откройте смену для выдачи наличными');
        return;
      }
      if (amt > (useShiftStore.getState().cashInRegister ?? 0)) {
        setError('Недостаточно наличных в кассе');
        return;
      }
    }
    setError('');
    setSaving(true);

    let cashOpId: string | null = null;
    if (paymentMethod === 'cash' && activeShift) {
      const { data: cashOp, error: cashErr } = await supabase
        .from('cash_operations')
        .insert({
          shift_id: activeShift.id,
          type: 'salary',
          amount: amt,
          note: `Зарплата: ${selectedRecipient.nickname}`,
          created_by: user?.id || null,
        })
        .select('id')
        .single();
      if (cashErr) {
        setError('Ошибка записи операции с кассой');
        setSaving(false);
        return;
      }
      cashOpId = cashOp?.id || null;
    }

    const { error: payErr } = await supabase.from('salary_payments').insert({
      profile_id: selectedRecipient.id,
      amount: amt,
      shift_id: payShift?.id ?? null,
      payment_method: paymentMethod,
      cash_operation_id: cashOpId,
      paid_by: user?.id || null,
      note: note.trim() || null,
    });

    setSaving(false);
    if (payErr) {
      setError('Ошибка сохранения');
      return;
    }
    notifySalaryPaid(selectedRecipient.tg_id ?? null, amt, paymentMethod);
    hapticNotification('success');
    setShowPay(false);
    setPayShift(null);
    loadAll();
  };

  const handleCancel = async (p: SalaryPayment & { cash_operation_id?: string | null }) => {
    if (!isOwner) return;
    if (!confirm(`Отменить выдачу ${fmtCur(p.amount)} для ${(p.profile as Profile)?.nickname || '—'}?`)) return;
    setCancellingId(p.id);

    if (p.payment_method === 'cash' && p.cash_operation_id && activeShift) {
      const { error: depErr } = await supabase.from('cash_operations').insert({
        shift_id: activeShift.id,
        type: 'deposit',
        amount: p.amount,
        note: `Отмена зарплаты: ${(p.profile as Profile)?.nickname || '—'}`,
        created_by: user?.id || null,
      });
      if (depErr) {
        setCancelError('Ошибка возврата в кассу');
        setCancellingId(null);
        return;
      }
    } else if (p.payment_method === 'cash' && p.cash_operation_id && !activeShift) {
      setCancelError('Невозможно отменить: нет открытой смены для возврата в кассу');
      setCancellingId(null);
      return;
    }

    const { error: delErr } = await supabase.from('salary_payments').delete().eq('id', p.id);
    setCancellingId(null);
    if (delErr) {
      setCancelError('Ошибка отмены');
      return;
    }
    setCancelError('');
    hapticNotification('success');
    loadAll();
  };

  const periodTotal = payments.reduce((s, p) => s + p.amount, 0);
  const cashTotal = payments.filter((p) => p.payment_method === 'cash').reduce((s, p) => s + p.amount, 0);
  const transferTotal = payments.filter((p) => p.payment_method === 'transfer').reduce((s, p) => s + p.amount, 0);

  const byEmployee = useMemo(() => {
    const map: Record<string, { nickname: string; total: number; count: number; cash: number; transfer: number }> = {};
    for (const p of payments) {
      const pid = p.profile_id;
      const nick = (p.profile as Profile)?.nickname || '—';
      if (!map[pid]) map[pid] = { nickname: nick, total: 0, count: 0, cash: 0, transfer: 0 };
      map[pid].total += p.amount;
      map[pid].count++;
      if (p.payment_method === 'cash') map[pid].cash += p.amount;
      else map[pid].transfer += p.amount;
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [payments]);

  if (isLoading) {
    return (
      <div className="space-y-3 py-4">
        {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-16 rounded-xl skeleton" />)}
      </div>
    );
  }

  const tabsConfig = isOwner
    ? [
        { id: 'shifts' as Tab, label: 'Смены', icon: <Clock className="w-3.5 h-3.5" /> },
        { id: 'history' as Tab, label: 'История', icon: <CalendarDays className="w-3.5 h-3.5" /> },
        { id: 'reports' as Tab, label: 'Отчёт', icon: <BarChart3 className="w-3.5 h-3.5" /> },
      ]
    : [
        { id: 'history' as Tab, label: 'Мои выплаты', icon: <CalendarDays className="w-3.5 h-3.5" /> },
      ];

  return (
    <div className="space-y-4">
      <TabSwitcher
        tabs={tabsConfig}
        activeId={tab}
        onChange={(id) => setTab(id as Tab)}
      />

      {/* ── Shifts tab (owner only) ── */}
      {tab === 'shifts' && isOwner && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 rounded-xl bg-[var(--c-surface)] border border-[var(--c-border)] text-center">
              <p className="text-2xl font-black text-[var(--c-warning)] tabular-nums">{pendingShifts.length}</p>
              <p className="text-[10px] text-[var(--c-hint)]">К выплате</p>
            </div>
            <div className="p-3 rounded-xl bg-[var(--c-surface)] border border-[var(--c-border)] text-center">
              <p className="text-2xl font-black text-[var(--c-success)] tabular-nums">{paidShifts.length}</p>
              <p className="text-[10px] text-[var(--c-hint)]">Оплачено</p>
            </div>
          </div>

          {isOwner && (
            <div className="mb-4">
              <Button fullWidth onClick={() => openPayDrawer(null)} variant="secondary">
                <Pencil className="w-4 h-4 mr-2" />
                Ручная выплата
              </Button>
            </div>
          )}

          {pendingShifts.length > 0 && (
            <div>
              <h3 className="text-[11px] font-semibold text-[var(--c-hint)] uppercase tracking-wider mb-2">Невыплаченные смены</h3>
              <div className="space-y-2">
                {pendingShifts.map((s) => (
                  <div key={s.id} className="p-3 rounded-xl bg-[var(--c-surface)] border border-[var(--c-warning)]/30">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--c-text)]">
                          {(s.closer as Profile)?.nickname || '—'}
                        </p>
                        <p className="text-xs text-[var(--c-muted)]">
                          {fmtDate(s.closed_at!)} · Выручка {fmtCur(s.revenue)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <p className="text-base font-black text-[var(--c-warning)] tabular-nums">{fmtCur(s.salary)}</p>
                        <Button size="sm" onClick={() => openPayDrawer(s)}>Выдать</Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {pendingShifts.length === 0 && (
            <div className="text-center py-8">
              <Clock className="w-12 h-12 text-[var(--c-muted)] mx-auto mb-2" />
              <p className="text-sm text-[var(--c-muted)]">Все смены оплачены</p>
            </div>
          )}

          {paidShifts.length > 0 && (
            <div>
              <h3 className="text-[11px] font-semibold text-[var(--c-hint)] uppercase tracking-wider mb-2">Оплаченные смены</h3>
              <div className="space-y-2">
                {paidShifts.slice(0, 10).map((s) => (
                  <div key={s.id} className="flex items-center justify-between p-3 rounded-xl bg-[var(--c-surface)] border border-[var(--c-border)] opacity-70">
                    <div>
                      <p className="text-sm font-medium text-[var(--c-text)]">{(s.closer as Profile)?.nickname || '—'}</p>
                      <p className="text-xs text-[var(--c-muted)]">{fmtDate(s.closed_at!)} · {fmtCur(s.revenue)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-[var(--c-success)] tabular-nums">{fmtCur(s.salary)}</p>
                      <p className="text-[10px] text-[var(--c-success)]">Выдано</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── History tab ── */}
      {tab === 'history' && (
        <div className="space-y-4">
          {cancelError && (
            <div className="p-3 rounded-xl bg-[var(--c-danger-bg)] border border-[var(--c-danger-border)] text-[var(--c-danger)] text-sm flex justify-between items-center">
              <span>{cancelError}</span>
              <button onClick={() => setCancelError('')} className="text-[var(--c-danger)] hover:opacity-80">×</button>
            </div>
          )}
          <div className="flex items-center justify-between">
            <input
              type="month"
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-xl px-3 py-2 text-sm text-[var(--c-text)]"
            />
            {!isOwner && (
              <div className="text-right">
                <p className="text-lg font-black text-[var(--c-success)] tabular-nums">{fmtCur(periodTotal)}</p>
                <p className="text-[10px] text-[var(--c-hint)]">За период</p>
              </div>
            )}
          </div>

          {isOwner && (
            <>
            <Button fullWidth onClick={() => openPayDrawer(null)} variant="secondary" className="mb-2">
              <Pencil className="w-4 h-4 mr-2" />
              Ручная выплата
            </Button>
            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 rounded-xl bg-[var(--c-surface)] border border-[var(--c-border)] text-center">
                <p className="text-lg font-bold text-[var(--c-text)] tabular-nums">{fmtCur(periodTotal)}</p>
                <p className="text-[10px] text-[var(--c-hint)]">Всего</p>
              </div>
              <div className="p-3 rounded-xl bg-[var(--c-surface)] border border-[var(--c-border)] text-center">
                <p className="text-lg font-bold text-[var(--c-success)] tabular-nums">{fmtCur(cashTotal)}</p>
                <p className="text-[10px] text-[var(--c-hint)]">Наличные</p>
              </div>
              <div className="p-3 rounded-xl bg-[var(--c-surface)] border border-[var(--c-border)] text-center">
                <p className="text-lg font-bold text-[var(--c-info)] tabular-nums">{fmtCur(transferTotal)}</p>
                <p className="text-[10px] text-[var(--c-hint)]">Перевод</p>
              </div>
            </div>
            </>
          )}

          {payments.length === 0 ? (
            <div className="text-center py-8">
              <Banknote className="w-12 h-12 text-[var(--c-muted)] mx-auto mb-2" />
              <p className="text-sm text-[var(--c-muted)]">Нет выплат за период</p>
            </div>
          ) : (
            <div className="space-y-2">
              {payments.map((p) => (
                <div
                  key={p.id}
                  className="p-3 rounded-xl bg-[var(--c-surface)] border border-[var(--c-border)]"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        p.payment_method === 'cash' ? 'bg-[var(--c-success-bg)]' : 'bg-[var(--c-info-bg)]'
                      }`}>
                        {p.payment_method === 'cash' ? (
                          <Banknote className="w-4 h-4 text-[var(--c-success)]" />
                        ) : (
                          <ArrowRightLeft className="w-4 h-4 text-[var(--c-info)]" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[var(--c-text)]">{(p.profile as Profile)?.nickname || '—'}</p>
                        <p className="text-[10px] text-[var(--c-muted)]">
                          {p.payment_method === 'cash' ? 'Наличные' : 'Перевод'}
                          {p.shiftClosedAt && ` · Смена ${fmtDate(p.shiftClosedAt)}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <p className="text-sm font-bold text-[var(--c-success)] tabular-nums">{fmtCur(p.amount)}</p>
                        <p className="text-[10px] text-[var(--c-muted)]">{fmtDateTime(p.created_at)}</p>
                      </div>
                      {isOwner && (
                        <button
                          onClick={() => handleCancel(p)}
                          disabled={cancellingId === p.id}
                          className="p-2 rounded-lg text-[var(--c-danger)] hover:bg-[var(--c-danger-bg)] transition-colors disabled:opacity-50"
                          title="Отменить выдачу"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  {p.note && <p className="text-xs text-[var(--c-muted)] mt-1 pl-10">{p.note}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Reports tab (owner only) ── */}
      {tab === 'reports' && isOwner && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <input
              type="month"
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-xl px-3 py-2 text-sm text-[var(--c-text)]"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="p-3 rounded-xl bg-[var(--c-surface)] border border-[var(--c-border)] text-center">
              <p className="text-lg font-bold text-[var(--c-text)] tabular-nums">{fmtCur(periodTotal)}</p>
              <p className="text-[10px] text-[var(--c-hint)]">Всего</p>
            </div>
            <div className="p-3 rounded-xl bg-[var(--c-surface)] border border-[var(--c-border)] text-center">
              <p className="text-lg font-bold text-[var(--c-success)] tabular-nums">{fmtCur(cashTotal)}</p>
              <p className="text-[10px] text-[var(--c-hint)]">Наличные</p>
            </div>
            <div className="p-3 rounded-xl bg-[var(--c-surface)] border border-[var(--c-border)] text-center">
              <p className="text-lg font-bold text-[var(--c-info)] tabular-nums">{fmtCur(transferTotal)}</p>
              <p className="text-[10px] text-[var(--c-hint)]">Перевод</p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[var(--c-surface)] border border-[var(--c-border)]">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-[var(--c-accent)]" />
              <h3 className="text-[11px] font-semibold text-[var(--c-hint)] uppercase tracking-wider">По сотрудникам</h3>
            </div>
            {byEmployee.length === 0 ? (
              <p className="text-sm text-[var(--c-muted)] text-center py-4">Нет данных</p>
            ) : (
              <div className="space-y-2">
                {byEmployee.map((emp) => {
                  const pct = periodTotal > 0 ? (emp.total / periodTotal) * 100 : 0;
                  return (
                    <div key={emp.nickname}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-[var(--c-text)]">{emp.nickname}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-[var(--c-muted)]">{emp.count} выплат</span>
                          <span className="text-sm font-bold text-[var(--c-text)] tabular-nums">{fmtCur(emp.total)}</span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-[var(--c-bg)] overflow-hidden">
                        <div className="h-full rounded-full bg-[var(--c-accent)] transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex gap-3 mt-0.5 text-[10px] text-[var(--c-muted)]">
                        {emp.cash > 0 && <span>Наличные: {fmtCur(emp.cash)}</span>}
                        {emp.transfer > 0 && <span>Перевод: {fmtCur(emp.transfer)}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="p-3 rounded-xl bg-[var(--c-surface)] border border-[var(--c-border)]">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-[var(--c-accent)]" />
              <h3 className="text-[11px] font-semibold text-[var(--c-hint)] uppercase tracking-wider">Все выплаты</h3>
            </div>
            {payments.length === 0 ? (
              <p className="text-sm text-[var(--c-muted)] text-center py-4">Нет выплат</p>
            ) : (
              <div className="space-y-1.5">
                {payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-2 border-b border-[var(--c-border)] last:border-0">
                    <div>
                      <p className="text-xs font-medium text-[var(--c-text)]">{(p.profile as Profile)?.nickname || '—'}</p>
                      <p className="text-[10px] text-[var(--c-muted)]">
                        {fmtDateTime(p.created_at)}
                        {p.shiftClosedAt && ` · Смена ${fmtDate(p.shiftClosedAt)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        p.payment_method === 'cash'
                          ? 'bg-[var(--c-success-bg)] text-[var(--c-success)]'
                          : 'bg-[var(--c-info-bg)] text-[var(--c-info)]'
                      }`}>
                        {p.payment_method === 'cash' ? 'Нал' : 'Перевод'}
                      </span>
                      <span className="text-xs font-bold text-[var(--c-text)] tabular-nums">{fmtCur(p.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Pay drawer ── */}
      <Drawer open={showPay} onClose={() => { setShowPay(false); setError(''); }} title={payShift ? 'Выдать зарплату за смену' : 'Ручная выплата'} size="md">
        <div className="space-y-4">
          {payShift && (
            <div className="p-3 rounded-xl bg-[var(--c-accent)]/10 border border-[var(--c-border)]">
              <p className="text-xs text-[var(--c-hint)]">Смена</p>
              <p className="text-sm font-medium text-[var(--c-text)]">{fmtDate(payShift.closed_at!)}</p>
              <p className="text-xs text-[var(--c-muted)]">Выручка: {fmtCur(payShift.revenue)}</p>
              <p className="text-lg font-black text-[var(--c-accent)] mt-1">{fmtCur(payShift.salary)}</p>
            </div>
          )}

            <div>
              <label className="block text-[11px] font-semibold text-[var(--c-hint)] mb-1.5 uppercase tracking-wider">Кому</label>
              <select
                value={selectedRecipient?.id || ''}
                onChange={(e) => {
                  const p = staff.find((s) => s.id === e.target.value);
                  setSelectedRecipient(p || null);
                }}
                className="w-full px-4 py-3 rounded-xl bg-[var(--c-surface)] border border-[var(--c-border)] text-[var(--c-text)]"
              >
                <option value="">Выберите сотрудника</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.nickname} ({s.role === 'owner' ? 'Владелец' : 'Сотрудник'})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[var(--c-hint)] mb-1.5 uppercase tracking-wider">Способ выдачи</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setPaymentMethod('cash')}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border transition-all ${
                    paymentMethod === 'cash'
                      ? 'bg-[var(--c-success-bg)] border-[var(--c-success-border)] text-[var(--c-success)]'
                      : 'bg-[var(--c-surface)] border-[var(--c-border)] text-[var(--c-muted)]'
                  }`}
                >
                  <Banknote className="w-4 h-4" /> Наличные
                </button>
                <button
                  onClick={() => setPaymentMethod('transfer')}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border transition-all ${
                    paymentMethod === 'transfer'
                      ? 'bg-[var(--c-info-bg)] border-[var(--c-info-border)] text-[var(--c-info)]'
                      : 'bg-[var(--c-surface)] border-[var(--c-border)] text-[var(--c-muted)]'
                  }`}
                >
                  <ArrowRightLeft className="w-4 h-4" /> Перевод
                </button>
              </div>
              {paymentMethod === 'cash' && !activeShift && (
                <p className="text-xs text-[var(--c-warning)] mt-1">Смена закрыта. Невозможно выдать из кассы.</p>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[var(--c-hint)] mb-1.5 uppercase tracking-wider">Сумма (₽)</label>
              <input
                type="text"
                inputMode="numeric"
                value={manualAmount}
                onChange={(e) => setManualAmount(e.target.value.replace(/[^\d\s]/g, ''))}
                placeholder={payShift ? String(payShift.salary) : '0'}
                className="w-full px-4 py-3 rounded-xl bg-[var(--c-surface)] border border-[var(--c-border)] text-[var(--c-text)] text-sm tabular-nums"
              />
              {payShift && (
                <p className="text-[10px] text-[var(--c-muted)] mt-1">Рассчитано: {fmtCur(payShift.salary)}</p>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[var(--c-hint)] mb-1.5 uppercase tracking-wider">Примечание</label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Опционально"
                className="w-full px-4 py-3 rounded-xl bg-[var(--c-surface)] border border-[var(--c-border)] text-[var(--c-text)] text-sm"
              />
            </div>

            {error && <p className="text-sm text-[var(--c-danger)] bg-[var(--c-danger-bg)] rounded-lg px-3 py-2">{error}</p>}

            <Button fullWidth size="lg" onClick={handlePay} disabled={saving}>
              {saving ? 'Сохранение...' : `Выдать ${fmtCur(manualAmount.trim() ? parseFloat(manualAmount.replace(/\s/g, '')) || 0 : payShift?.salary ?? 0)}`}
            </Button>
          </div>
      </Drawer>
    </div>
  );
}
