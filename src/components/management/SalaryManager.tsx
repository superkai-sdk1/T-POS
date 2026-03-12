import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { useShiftStore } from '@/store/shift';
import { useOnTableChange } from '@/hooks/useRealtimeSync';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Drawer } from '@/components/ui/Drawer';
import { calcSalaryFromRevenue } from '@/lib/salary';
import { Banknote, Wallet, ArrowRightLeft, UserPlus } from 'lucide-react';
import { hapticFeedback, hapticNotification } from '@/lib/telegram';
import type { SalaryPayment, Profile, Shift } from '@/types';

const fmtCur = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + '₽';

interface ShiftWithRevenue extends Shift {
  revenue: number;
  salary: number;
  closer?: Profile;
}

export function SalaryManager() {
  const user = useAuthStore((s) => s.user);
  const isOwner = useAuthStore((s) => s.isOwner());
  const activeShift = useShiftStore((s) => s.activeShift);

  const [payments, setPayments] = useState<SalaryPayment[]>([]);
  const [shifts, setShifts] = useState<ShiftWithRevenue[]>([]);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showPay, setShowPay] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState<Profile | null>(null);
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer'>('cash');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
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
      .select('*, profile:profiles!salary_payments_profile_id_fkey(nickname), paidBy:profiles!salary_payments_paid_by_fkey(nickname)')
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: false });

    if (!isOwner && user) {
      q = q.eq('profile_id', user.id);
    }
    const { data } = await q;
    if (data) {
      setPayments(data.map((p) => ({
        ...p,
        profile: Array.isArray(p.profile) ? p.profile[0] : p.profile,
        paidBy: Array.isArray(p.paidBy) ? p.paidBy[0] : p.paidBy,
      })) as SalaryPayment[]);
    }
  }, [filterMonth, isOwner, user?.id]);

  const loadShifts = useCallback(async () => {
    const { data: shiftsData } = await supabase
      .from('shifts')
      .select('*, closer:profiles!shifts_closed_by_fkey(nickname)')
      .eq('status', 'closed')
      .order('closed_at', { ascending: false })
      .limit(50);
    if (!shiftsData) return;

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
      const totalRevenue = (checks || []).reduce((sum, c) => sum + (c.total_amount || 0), 0) -
        (refunds || []).reduce((sum, r) => sum + (r.total_amount || 0), 0);
      const salary = calcSalaryFromRevenue(totalRevenue);
      shiftsWithRevenue.push({
        ...s,
        closer: Array.isArray(s.closer) ? s.closer[0] : s.closer,
        revenue: totalRevenue,
        salary,
      });
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

  const handlePay = async () => {
    const amt = Math.round(Number(amount));
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
          note: `Зарплата: ${(selectedRecipient as Profile).nickname}`,
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
      shift_id: selectedShiftId || null,
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
    hapticNotification('success');
    setShowPay(false);
    setSelectedRecipient(null);
    setSelectedShiftId(null);
    setAmount('');
    setNote('');
    loadAll();
  };

  const myTotal = useMemo(() => {
    if (!user || isOwner) return 0;
    return payments.filter((p) => p.profile_id === user.id).reduce((s, p) => s + p.amount, 0);
  }, [payments, user?.id, isOwner]);

  const periodTotal = payments.reduce((s, p) => s + p.amount, 0);
  const cashTotal = payments.filter((p) => p.payment_method === 'cash').reduce((s, p) => s + p.amount, 0);
  const transferTotal = payments.filter((p) => p.payment_method === 'transfer').reduce((s, p) => s + p.amount, 0);

  const pendingShifts = useMemo(() => {
    const paidShiftIds = new Set(payments.filter((p) => p.shift_id).map((p) => p.shift_id));
    return shifts.filter((s) => !paidShiftIds.has(s.id));
  }, [shifts, payments]);

  if (isLoading) {
    return (
      <div className="space-y-3 py-4">
        {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-16 rounded-xl skeleton" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <input
          type="month"
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
          className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-xl px-3 py-2 text-sm text-[var(--c-text)]"
        />
      </div>

      {!isOwner && (
        <div className="p-4 rounded-xl bg-[var(--c-success-bg)] border border-[var(--c-success-border)] text-center">
          <p className="text-[11px] text-[var(--c-hint)] uppercase tracking-wider">Моя зарплата за период</p>
          <p className="text-2xl font-black text-[var(--c-success)] tabular-nums">{fmtCur(myTotal)}</p>
        </div>
      )}

      {isOwner && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 rounded-xl bg-[var(--c-surface)] border border-[var(--c-border)] text-center">
              <p className="text-lg font-bold text-[var(--c-text)] tabular-nums">{fmtCur(periodTotal)}</p>
              <p className="text-[10px] text-[var(--c-hint)]">Выдано за период</p>
            </div>
            <div className="p-3 rounded-xl bg-[var(--c-surface)] border border-[var(--c-border)] text-center">
              <p className="text-lg font-bold text-[var(--c-danger)] tabular-nums">{fmtCur(cashTotal)}</p>
              <p className="text-[10px] text-[var(--c-hint)]">Наличными</p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[var(--c-accent)]/10 border border-[var(--c-border)]">
            <h3 className="text-[11px] font-semibold text-[var(--c-hint)] uppercase tracking-wider mb-2">К расчёту по сменам</h3>
            {pendingShifts.length === 0 ? (
              <p className="text-sm text-[var(--c-muted)]">Нет смен с невыданной зарплатой</p>
            ) : (
              <div className="space-y-2">
                {pendingShifts.slice(0, 5).map((s) => (
                  <div key={s.id} className="flex items-center justify-between py-2 border-b border-[var(--c-border)] last:border-0">
                    <div>
                      <p className="text-sm font-medium text-[var(--c-text)]">
                        {(s.closer as Profile)?.nickname || '—'} · {new Date(s.closed_at!).toLocaleDateString('ru-RU')}
                      </p>
                      <p className="text-xs text-[var(--c-muted)]">Выручка {fmtCur(s.revenue)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-[var(--c-success)]">{fmtCur(s.salary)}</p>
                      <button
                        onClick={() => {
                          setSelectedRecipient((s.closer as Profile) || null);
                          setSelectedShiftId(s.id);
                          setAmount(String(s.salary));
                          setShowPay(true);
                        }}
                        className="text-[10px] text-[var(--c-accent)] font-medium"
                      >
                        Выдать
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Button fullWidth size="lg" onClick={() => { setShowPay(true); setSelectedRecipient(null); setSelectedShiftId(null); setAmount(''); }}>
            <UserPlus className="w-5 h-5" />
            Выдать зарплату
          </Button>
        </>
      )}

      <div>
        <h3 className="text-[11px] font-semibold text-[var(--c-hint)] uppercase tracking-wider mb-2">История выплат</h3>
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
                className="flex items-center justify-between p-3 rounded-xl bg-[var(--c-surface)] border border-[var(--c-border)]"
              >
                <div className="flex items-center gap-1.5">
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
                      {new Date(p.created_at).toLocaleString('ru-RU')} · {p.payment_method === 'cash' ? 'Наличные' : 'Перевод'}
                    </p>
                  </div>
                </div>
                <p className="text-sm font-bold text-[var(--c-success)]">{fmtCur(p.amount)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <Drawer open={showPay} onClose={() => { setShowPay(false); setError(''); setSelectedShiftId(null); }} title="Выдать зарплату" size="md">
        <div className="space-y-4">
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
          <Input
            label="Сумма (₽)"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            min={0}
          />
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
          <Input label="Примечание" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Опционально" />
          {error && <p className="text-sm text-[var(--c-danger)] bg-[var(--c-danger-bg)] rounded-lg px-3 py-2">{error}</p>}
          <Button fullWidth size="lg" onClick={handlePay} disabled={saving}>
            {saving ? 'Сохранение...' : 'Выдать зарплату'}
          </Button>
        </div>
      </Drawer>
    </div>
  );
}
