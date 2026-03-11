import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { useShiftStore } from '@/store/shift';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Drawer } from '@/components/ui/Drawer';
import { ListSkeleton } from '@/components/ui/Skeleton';
import {
  Banknote, Plus, ArrowDownToLine, ArrowUpFromLine,
  Trash2, PlayCircle, StopCircle, Wallet, RotateCcw,
} from 'lucide-react';
import { hapticNotification } from '@/lib/telegram';
import { useOnTableChange } from '@/hooks/useRealtimeSync';
import type { CashOperation, Shift } from '@/types';

interface LedgerEntry {
  id: string;
  type: 'shift_open' | 'shift_close' | 'inkassation' | 'deposit' | 'refund';
  amount: number;
  balanceAfter: number;
  date: string;
  note?: string;
  creator?: string;
}

interface RefundWithCheck {
  id: string;
  total_amount: number;
  created_at: string;
  created_by: string | null;
  check_id: string;
  check: { shift_id: string | null; payment_method: string | null; total_amount: number } | null;
}

export function InkassationPage() {
  const [operations, setOperations] = useState<CashOperation[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [refunds, setRefunds] = useState<RefundWithCheck[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [opType, setOpType] = useState<'inkassation' | 'deposit'>('inkassation');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<CashOperation | null>(null);

  const user = useAuthStore((s) => s.user);
  const activeShift = useShiftStore((s) => s.activeShift);

  const loadOperations = useCallback(async () => {
    const { data } = await supabase
      .from('cash_operations')
      .select('*, creator:profiles!cash_operations_created_by_fkey(nickname)')
      .order('created_at', { ascending: false })
      .limit(100);
    if (data) {
      setOperations(data.map((r) => ({
        ...r,
        creator: Array.isArray(r.creator) ? r.creator[0] : r.creator,
      })) as CashOperation[]);
    }
  }, []);

  const loadShifts = useCallback(async () => {
    const { data } = await supabase
      .from('shifts')
      .select('*, opener:profiles!shifts_opened_by_fkey(nickname)')
      .eq('status', 'closed')
      .order('closed_at', { ascending: false })
      .limit(50);
    if (data) {
      setShifts(data.map((s) => ({
        ...s,
        opener: Array.isArray(s.opener) ? s.opener[0] : s.opener,
      })) as Shift[]);
    }
  }, []);

  const [refundCheckPayments, setRefundCheckPayments] = useState<Record<string, { method: string; amount: number }[]>>({});

  const loadRefunds = useCallback(async () => {
    const { data } = await supabase
      .from('refunds')
      .select('id, total_amount, created_at, created_by, check_id, check:checks!refunds_check_id_fkey(shift_id, payment_method, total_amount)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (data) {
      const mapped = data.map((r) => ({
        ...r,
        check: Array.isArray(r.check) ? r.check[0] : r.check,
      })) as RefundWithCheck[];
      setRefunds(mapped);
      const splitCheckIds = mapped.filter((r) => r.check?.payment_method === 'split').map((r) => r.check_id);
      if (splitCheckIds.length > 0) {
        const { data: payments } = await supabase
          .from('check_payments')
          .select('check_id, method, amount')
          .in('check_id', splitCheckIds);
        const map: Record<string, { method: string; amount: number }[]> = {};
        for (const p of payments || []) {
          if (!map[p.check_id]) map[p.check_id] = [];
          map[p.check_id].push({ method: p.method, amount: p.amount });
        }
        setRefundCheckPayments(map);
      } else {
        setRefundCheckPayments({});
      }
    }
  }, []);

  const cashTables = useMemo(() => ['cash_operations', 'shifts', 'refunds'], []);
  useOnTableChange(cashTables, () => { loadOperations(); loadShifts(); loadRefunds(); });

  useEffect(() => {
    Promise.all([loadOperations(), loadShifts(), loadRefunds()]).then(() => setIsLoading(false));
  }, [loadOperations, loadShifts, loadRefunds]);

  const handleCreate = async () => {
    const val = Math.abs(Number(amount));
    if (val <= 0) return;

    await supabase.from('cash_operations').insert({
      shift_id: activeShift?.id || null,
      type: opType,
      amount: val,
      note: note || null,
      created_by: user?.id,
    });

    await supabase.from('transactions').insert({
      type: 'cash_operation',
      amount: opType === 'inkassation' ? -val : val,
      description: opType === 'inkassation'
        ? `Инкассация: ${val}₽${note ? ' — ' + note : ''}`
        : `Внесение наличных: ${val}₽${note ? ' — ' + note : ''}`,
      created_by: user?.id,
    });

    hapticNotification('success');
    setShowCreate(false);
    setAmount('');
    setNote('');
    loadOperations();
  };

  const handleDelete = async (op: CashOperation) => {
    await supabase.from('cash_operations').delete().eq('id', op.id);
    const reverseAmount = op.type === 'inkassation' ? op.amount : -op.amount;
    await supabase.from('transactions').insert({
      type: 'cash_operation',
      amount: reverseAmount,
      description: `Отмена: ${op.type === 'inkassation' ? 'Инкассация' : 'Внесение'} ${op.amount}₽${op.note ? ' — ' + op.note : ''}`,
      created_by: user?.id,
    });
    hapticNotification('success');
    setShowDeleteConfirm(null);
    loadOperations();
  };

  const ledger = useMemo((): LedgerEntry[] => {
    const entries: { date: string; sortKey: number; entry: Omit<LedgerEntry, 'balanceAfter'> }[] = [];
    const shiftMap = new Map(shifts.map((s) => [s.id, s]));

    for (const s of shifts) {
      entries.push({
        date: s.opened_at,
        sortKey: new Date(s.opened_at).getTime(),
        entry: {
          id: `so-${s.id}`,
          type: 'shift_open',
          amount: s.cash_start,
          date: s.opened_at,
          creator: (s as Shift & { opener?: { nickname: string } }).opener?.nickname,
        },
      });
      if (s.closed_at && s.cash_end != null) {
        entries.push({
          date: s.closed_at,
          sortKey: new Date(s.closed_at).getTime(),
          entry: {
            id: `sc-${s.id}`,
            type: 'shift_close',
            amount: s.cash_end,
            date: s.closed_at,
            creator: (s as Shift & { opener?: { nickname: string } }).opener?.nickname,
          },
        });
      }
    }

    for (const r of refunds) {
      const check = r.check;
      const shift = check?.shift_id ? shiftMap.get(check.shift_id) : null;
      if (!shift || !check || !shift.closed_at) continue;
      if (new Date(r.created_at) <= new Date(shift.closed_at)) continue;

      let cashAmount = 0;
      if (check.payment_method === 'cash') {
        cashAmount = r.total_amount || 0;
      } else if (check.payment_method === 'split') {
        const parts = refundCheckPayments[r.check_id] || [];
        const cashPart = parts.filter((p) => p.method === 'cash').reduce((s, p) => s + p.amount, 0);
        const origTotal = check.total_amount || 1;
        cashAmount = Math.round((cashPart / origTotal) * (r.total_amount || 0));
      }
      if (cashAmount <= 0) continue;

      entries.push({
        date: r.created_at,
        sortKey: new Date(r.created_at).getTime(),
        entry: {
          id: `ref-${r.id}`,
          type: 'refund',
          amount: cashAmount,
          date: r.created_at,
          note: 'Возврат наличными',
        },
      });
    }

    for (const op of operations) {
      entries.push({
        date: op.created_at,
        sortKey: new Date(op.created_at).getTime(),
        entry: {
          id: op.id,
          type: op.type as 'inkassation' | 'deposit',
          amount: op.amount,
          date: op.created_at,
          note: op.note || undefined,
          creator: op.creator?.nickname,
        },
      });
    }

    entries.sort((a, b) => a.sortKey - b.sortKey);

    let balance = 0;
    const result: LedgerEntry[] = [];
    for (const e of entries) {
      if (e.entry.type === 'shift_open') {
        balance = e.entry.amount;
      } else if (e.entry.type === 'shift_close') {
        balance = e.entry.amount;
      } else if (e.entry.type === 'inkassation' || e.entry.type === 'refund') {
        balance -= e.entry.amount;
      } else if (e.entry.type === 'deposit') {
        balance += e.entry.amount;
      }
      result.push({ ...e.entry, balanceAfter: balance });
    }

    result.reverse();
    return result;
  }, [operations, shifts, refunds, refundCheckPayments]);

  const [liveCashBalance, setLiveCashBalance] = useState<number | null>(null);

  const loadLiveCash = useCallback(async () => {
    if (!activeShift) { setLiveCashBalance(null); return; }
    const { data: shiftChecks } = await supabase
      .from('checks')
      .select('id, total_amount, payment_method')
      .eq('shift_id', activeShift.id)
      .eq('status', 'closed');
    let cashFromSales = 0;
    const checkIds = (shiftChecks || []).map((c) => c.id);
    for (const c of shiftChecks || []) {
      if (c.payment_method === 'cash') cashFromSales += c.total_amount || 0;
    }
    if (checkIds.length > 0) {
      const { data: splitPayments } = await supabase
        .from('check_payments').select('check_id, method, amount')
        .in('check_id', checkIds).eq('method', 'cash');
      for (const p of splitPayments || []) {
        const chk = shiftChecks?.find((c) => c.id === p.check_id);
        if (chk && chk.payment_method !== 'cash') cashFromSales += p.amount || 0;
      }
    }
    let cashRefunded = 0;
    const { data: refundData } = await supabase
      .from('refunds')
      .select('total_amount, check_id')
      .eq('shift_id', activeShift.id);
    for (const r of refundData || []) {
      const origCheck = shiftChecks?.find((c) => c.id === r.check_id);
      if (origCheck?.payment_method === 'cash') {
        cashRefunded += r.total_amount || 0;
      } else if (origCheck?.payment_method === 'split') {
        const splitPayments = checkIds.length > 0 ? (await supabase
          .from('check_payments').select('method, amount')
          .eq('check_id', r.check_id).eq('method', 'cash')).data : [];
        const cashPart = (splitPayments || []).reduce((s, p) => s + (p.amount || 0), 0);
        const origTotal = origCheck.total_amount || 1;
        cashRefunded += Math.round((cashPart / origTotal) * (r.total_amount || 0));
      }
    }
    const { data: cashOps } = await supabase
      .from('cash_operations').select('type, amount').eq('shift_id', activeShift.id);
    let opsBalance = 0;
    for (const op of cashOps || []) {
      opsBalance += op.type === 'deposit' ? op.amount : -op.amount;
    }
    setLiveCashBalance(activeShift.cash_start + cashFromSales + opsBalance - cashRefunded);
  }, [activeShift]);

  useEffect(() => { loadLiveCash(); }, [loadLiveCash]);
  useOnTableChange(useMemo(() => ['checks', 'cash_operations'], []), loadLiveCash);

  const currentCash = liveCashBalance ?? (ledger.length > 0 ? ledger[0].balanceAfter : 0);

  const totalInkassation = operations
    .filter((o) => o.type === 'inkassation')
    .reduce((s, o) => s + o.amount, 0);
  const totalDeposit = operations
    .filter((o) => o.type === 'deposit')
    .reduce((s, o) => s + o.amount, 0);

  const fmtCur = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + '₽';
  const formatDate = (d: string) => new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  const formatTime = (d: string) => new Date(d).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  if (isLoading) {
    return <ListSkeleton rows={4} />;
  }

  const typeConfig: Record<string, { label: string; icon: typeof Banknote; color: string; bg: string; sign: string }> = {
    shift_open: { label: 'Открытие смены', icon: PlayCircle, color: 'text-[var(--c-info)]', bg: 'bg-[var(--c-info-bg)]', sign: '' },
    shift_close: { label: 'Закрытие смены', icon: StopCircle, color: 'text-[var(--c-accent)]', bg: 'bg-[rgba(var(--c-accent-rgb),0.1)]', sign: '' },
    inkassation: { label: 'Инкассация', icon: ArrowUpFromLine, color: 'text-[var(--c-danger)]', bg: 'bg-[var(--c-danger-bg)]', sign: '−' },
    deposit: { label: 'Внесение', icon: ArrowDownToLine, color: 'text-[var(--c-success)]', bg: 'bg-[var(--c-success-bg)]', sign: '+' },
    refund: { label: 'Возврат', icon: RotateCcw, color: 'text-[var(--c-warning)]', bg: 'bg-[var(--c-warning-bg)]', sign: '−' },
  };

  return (
    <div className="space-y-4">
      {/* Current cash balance */}
      <div className="p-4 rounded-2xl bg-gradient-to-br from-[var(--c-accent)]/12 to-[var(--c-success-bg)] border border-[var(--c-border)] text-center">
        <div className="flex items-center justify-center gap-1.5 mb-1">
          <Wallet className="w-4 h-4 text-[var(--c-accent)]" />
          <span className="text-[11px] text-[var(--c-hint)] font-semibold uppercase tracking-wider">Наличные в кассе</span>
        </div>
        <p className="text-2xl font-black text-[var(--c-text)] tabular-nums">{fmtCur(currentCash)}</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-3 rounded-xl bg-[var(--c-danger-bg)] border border-[var(--c-danger-border)] text-center">
          <p className="text-lg font-bold text-[var(--c-danger)]">{fmtCur(totalInkassation)}</p>
          <p className="text-[10px] text-[var(--c-hint)]">Изъято всего</p>
        </div>
        <div className="p-3 rounded-xl bg-[var(--c-success-bg)] border border-[var(--c-success-border)] text-center">
          <p className="text-lg font-bold text-[var(--c-success)]">{fmtCur(totalDeposit)}</p>
          <p className="text-[10px] text-[var(--c-hint)]">Внесено всего</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--c-hint)]">Журнал движения наличных</p>
        <Button size="lg" onClick={() => setShowCreate(true)}>
          <Plus className="w-5 h-5" />
          Новая
        </Button>
      </div>

      {ledger.length === 0 ? (
        <div className="text-center py-16">
          <Banknote className="w-16 h-16 text-[var(--c-muted)] mx-auto mb-4" />
          <p className="text-[var(--c-hint)]">Нет операций</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {ledger.map((entry) => {
            const cfg = typeConfig[entry.type];
            const Icon = cfg.icon;
            const isOp = entry.type === 'inkassation' || entry.type === 'deposit' || entry.type === 'refund';
            return (
              <div
                key={entry.id}
                className="flex items-center gap-2.5 p-2.5 rounded-xl card"
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${cfg.bg}`}>
                  <Icon className={`w-4 h-4 ${cfg.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[12px] text-[var(--c-text)]">{cfg.label}</span>
                    {isOp && (
                      <span className={`text-[11px] font-bold ${cfg.color}`}>
                        {cfg.sign}{fmtCur(entry.amount)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-[var(--c-muted)]">{formatDate(entry.date)} {formatTime(entry.date)}</span>
                    {entry.creator && <span className="text-[10px] text-[var(--c-muted)]">· {entry.creator}</span>}
                    {entry.note && <span className="text-[10px] text-[var(--c-muted)] truncate">· {entry.note}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[12px] font-bold text-[var(--c-text)] tabular-nums">{fmtCur(entry.balanceAfter)}</p>
                  <p className="text-[8px] text-[var(--c-muted)]">баланс</p>
                </div>
                {isOp && (
                  <button
                    onClick={() => {
                      const op = operations.find((o) => o.id === entry.id);
                      if (op) setShowDeleteConfirm(op);
                    }}
                    className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--c-danger-bg)] transition-colors shrink-0"
                  >
                    <Trash2 className="w-3 h-3 text-[var(--c-muted)]" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create drawer */}
      <Drawer open={showCreate} onClose={() => setShowCreate(false)} title="Операция с наличными" size="md">
        <div className="space-y-4">
          <div className="flex gap-1 p-1 card rounded-xl">
            <button
              onClick={() => setOpType('inkassation')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                opType === 'inkassation' ? 'bg-[var(--c-danger-bg)] text-[var(--c-danger)]' : 'text-[var(--c-hint)]'
              }`}
            >
              <ArrowUpFromLine className="w-4 h-4" />Изъять
            </button>
            <button
              onClick={() => setOpType('deposit')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                opType === 'deposit' ? 'bg-[var(--c-success-bg)] text-[var(--c-success)]' : 'text-[var(--c-hint)]'
              }`}
            >
              <ArrowDownToLine className="w-4 h-4" />Внести
            </button>
          </div>

          {currentCash > 0 && (
            <div className="p-2.5 rounded-xl bg-[var(--c-surface)] text-center">
              <span className="text-[10px] text-[var(--c-hint)]">Сейчас в кассе: </span>
              <span className="text-[12px] font-bold text-[var(--c-text)] tabular-nums">{fmtCur(currentCash)}</span>
            </div>
          )}

          <Input
            label="Сумма"
            type="number"
            placeholder="0₽"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min={0}
            autoFocus
          />

          <Input
            label="Примечание"
            placeholder="Комментарий (необязательно)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          {activeShift && (
            <p className="text-[10px] text-[var(--c-hint)] text-center">
              Привязка к текущей смене
            </p>
          )}

          <Button
            fullWidth size="lg"
            onClick={handleCreate}
            disabled={!amount || Number(amount) <= 0}
            variant={opType === 'inkassation' ? 'danger' : 'primary'}
          >
            {opType === 'inkassation'
              ? <><ArrowUpFromLine className="w-5 h-5" />Забрать {amount || 0}₽</>
              : <><ArrowDownToLine className="w-5 h-5" />Внести {amount || 0}₽</>
            }
          </Button>
        </div>
      </Drawer>

      {/* Delete confirm */}
      <Drawer
        open={!!showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(null)}
        title="Удалить операцию?"
        size="sm"
      >
        {showDeleteConfirm && (
          <div className="space-y-4">
            <div className="p-2.5 rounded-xl card text-center">
              <p className="text-[13px] text-[var(--c-hint)]">{showDeleteConfirm.type === 'inkassation' ? 'Инкассация' : 'Внесение'}</p>
              <p className="text-lg font-bold text-[var(--c-text)]">{fmtCur(showDeleteConfirm.amount)}</p>
              <p className="text-[10px] text-[var(--c-hint)] mt-1">{new Date(showDeleteConfirm.created_at).toLocaleString('ru-RU')}</p>
            </div>
            <div className="flex gap-2">
              <Button fullWidth variant="secondary" onClick={() => setShowDeleteConfirm(null)}>Отмена</Button>
              <Button fullWidth variant="danger" onClick={() => handleDelete(showDeleteConfirm)}>Удалить</Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
