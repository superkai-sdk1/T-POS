import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { useShiftStore } from '@/store/shift';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Drawer } from '@/components/ui/Drawer';
import {
  Banknote, Plus, ArrowDownToLine, ArrowUpFromLine,
  Trash2, PlayCircle, StopCircle, Wallet,
} from 'lucide-react';
import { hapticFeedback, hapticNotification } from '@/lib/telegram';
import { useOnTableChange } from '@/hooks/useRealtimeSync';
import type { CashOperation, Shift } from '@/types';

interface LedgerEntry {
  id: string;
  type: 'shift_open' | 'shift_close' | 'inkassation' | 'deposit';
  amount: number;
  balanceAfter: number;
  date: string;
  note?: string;
  creator?: string;
}

export function InkassationPage() {
  const [operations, setOperations] = useState<CashOperation[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
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

  const cashTables = useMemo(() => ['cash_operations', 'shifts'], []);
  useOnTableChange(cashTables, () => { loadOperations(); loadShifts(); });

  useEffect(() => {
    Promise.all([loadOperations(), loadShifts()]).then(() => setIsLoading(false));
  }, [loadOperations, loadShifts]);

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
    hapticNotification('success');
    setShowDeleteConfirm(null);
    loadOperations();
  };

  const ledger = useMemo((): LedgerEntry[] => {
    const entries: { date: string; sortKey: number; entry: Omit<LedgerEntry, 'balanceAfter'> }[] = [];

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
      } else if (e.entry.type === 'inkassation') {
        balance -= e.entry.amount;
      } else if (e.entry.type === 'deposit') {
        balance += e.entry.amount;
      }
      result.push({ ...e.entry, balanceAfter: balance });
    }

    result.reverse();
    return result;
  }, [operations, shifts]);

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
    const { data: cashOps } = await supabase
      .from('cash_operations').select('type, amount').eq('shift_id', activeShift.id);
    let opsBalance = 0;
    for (const op of cashOps || []) {
      opsBalance += op.type === 'deposit' ? op.amount : -op.amount;
    }
    setLiveCashBalance(activeShift.cash_start + cashFromSales + opsBalance);
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
    return (
      <div className="text-center py-20">
        <div className="w-8 h-8 border-2 border-[var(--c-accent)] border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  const typeConfig: Record<string, { label: string; icon: typeof Banknote; color: string; bg: string; sign: string }> = {
    shift_open: { label: 'Открытие смены', icon: PlayCircle, color: 'text-blue-400', bg: 'bg-blue-500/15', sign: '' },
    shift_close: { label: 'Закрытие смены', icon: StopCircle, color: 'text-violet-400', bg: 'bg-violet-500/15', sign: '' },
    inkassation: { label: 'Инкассация', icon: ArrowUpFromLine, color: 'text-red-400', bg: 'bg-red-500/15', sign: '−' },
    deposit: { label: 'Внесение', icon: ArrowDownToLine, color: 'text-emerald-400', bg: 'bg-emerald-500/15', sign: '+' },
  };

  return (
    <div className="space-y-4">
      {/* Current cash balance */}
      <div className="p-4 rounded-2xl bg-gradient-to-br from-[var(--c-accent)]/12 to-emerald-500/5 border border-white/5 text-center">
        <div className="flex items-center justify-center gap-1.5 mb-1">
          <Wallet className="w-4 h-4 text-[var(--c-accent)]" />
          <span className="text-[11px] text-white/40 font-semibold uppercase tracking-wider">Наличные в кассе</span>
        </div>
        <p className="text-2xl font-black text-[var(--c-text)] tabular-nums">{fmtCur(currentCash)}</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/15 text-center">
          <p className="text-lg font-bold text-red-400">{fmtCur(totalInkassation)}</p>
          <p className="text-[10px] text-white/40">Изъято всего</p>
        </div>
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/15 text-center">
          <p className="text-lg font-bold text-emerald-400">{fmtCur(totalDeposit)}</p>
          <p className="text-[10px] text-white/40">Внесено всего</p>
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
          <Banknote className="w-16 h-16 text-white/5 mx-auto mb-4" />
          <p className="text-[var(--c-hint)]">Нет операций</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {ledger.map((entry) => {
            const cfg = typeConfig[entry.type];
            const Icon = cfg.icon;
            const isOp = entry.type === 'inkassation' || entry.type === 'deposit';
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
                    <span className="text-[10px] text-white/25">{formatDate(entry.date)} {formatTime(entry.date)}</span>
                    {entry.creator && <span className="text-[10px] text-white/25">· {entry.creator}</span>}
                    {entry.note && <span className="text-[10px] text-white/20 truncate">· {entry.note}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[12px] font-bold text-[var(--c-text)] tabular-nums">{fmtCur(entry.balanceAfter)}</p>
                  <p className="text-[8px] text-white/20">баланс</p>
                </div>
                {isOp && (
                  <button
                    onClick={() => {
                      const op = operations.find((o) => o.id === entry.id);
                      if (op) setShowDeleteConfirm(op);
                    }}
                    className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-500/10 transition-colors shrink-0"
                  >
                    <Trash2 className="w-3 h-3 text-white/15" />
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
                opType === 'inkassation' ? 'bg-red-500/20 text-red-400' : 'text-white/50'
              }`}
            >
              <ArrowUpFromLine className="w-4 h-4" />Изъять
            </button>
            <button
              onClick={() => setOpType('deposit')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                opType === 'deposit' ? 'bg-emerald-500/20 text-emerald-400' : 'text-white/50'
              }`}
            >
              <ArrowDownToLine className="w-4 h-4" />Внести
            </button>
          </div>

          {currentCash > 0 && (
            <div className="p-2.5 rounded-xl bg-white/3 text-center">
              <span className="text-[10px] text-white/30">Сейчас в кассе: </span>
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
            <p className="text-[10px] text-white/30 text-center">
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
              <p className="text-[13px] text-white/50">{showDeleteConfirm.type === 'inkassation' ? 'Инкассация' : 'Внесение'}</p>
              <p className="text-lg font-bold text-[var(--c-text)]">{fmtCur(showDeleteConfirm.amount)}</p>
              <p className="text-[10px] text-white/30 mt-1">{new Date(showDeleteConfirm.created_at).toLocaleString('ru-RU')}</p>
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
