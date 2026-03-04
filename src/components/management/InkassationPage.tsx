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
  CalendarDays, User, Trash2,
} from 'lucide-react';
import { hapticFeedback, hapticNotification } from '@/lib/telegram';
import { useOnTableChange } from '@/hooks/useRealtimeSync';
import type { CashOperation } from '@/types';

export function InkassationPage() {
  const [operations, setOperations] = useState<CashOperation[]>([]);
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

  const cashOperationsTables = useMemo(() => ['cash_operations'], []);
  useOnTableChange(cashOperationsTables, loadOperations);

  useEffect(() => {
    loadOperations().then(() => setIsLoading(false));
  }, [loadOperations]);

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

  const totalInkassation = operations
    .filter((o) => o.type === 'inkassation')
    .reduce((s, o) => s + o.amount, 0);
  const totalDeposit = operations
    .filter((o) => o.type === 'deposit')
    .reduce((s, o) => s + o.amount, 0);

  const formatDate = (d: string) => new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  const formatTime = (d: string) => new Date(d).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  if (isLoading) {
    return (
      <div className="text-center py-20">
        <div className="w-8 h-8 border-2 border-[var(--c-accent)] border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/15 text-center">
          <p className="text-lg font-bold text-red-400">{new Intl.NumberFormat('ru-RU').format(totalInkassation)}₽</p>
          <p className="text-[10px] text-white/40">Инкассировано</p>
        </div>
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/15 text-center">
          <p className="text-lg font-bold text-emerald-400">{new Intl.NumberFormat('ru-RU').format(totalDeposit)}₽</p>
          <p className="text-[10px] text-white/40">Внесено</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--c-hint)]">{operations.length} операций</p>
        <Button size="lg" onClick={() => setShowCreate(true)}>
          <Plus className="w-5 h-5" />
          Новая
        </Button>
      </div>

      {operations.length === 0 ? (
        <div className="text-center py-16">
          <Banknote className="w-16 h-16 text-white/5 mx-auto mb-4" />
          <p className="text-[var(--c-hint)]">Нет операций</p>
        </div>
      ) : (
        <div className="space-y-2">
          {operations.map((op) => (
            <div
              key={op.id}
              className="flex items-center gap-3 p-2.5 rounded-xl card"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                op.type === 'inkassation' ? 'bg-red-500/15' : 'bg-emerald-500/15'
              }`}>
                {op.type === 'inkassation'
                  ? <ArrowUpFromLine className="w-5 h-5 text-red-400" />
                  : <ArrowDownToLine className="w-5 h-5 text-emerald-400" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[13px] text-[var(--c-text)]">
                    {op.type === 'inkassation' ? 'Инкассация' : 'Внесение'}
                  </span>
                  <Badge variant={op.type === 'inkassation' ? 'danger' : 'success'} size="sm">
                    {op.type === 'inkassation' ? '-' : '+'}{new Intl.NumberFormat('ru-RU').format(op.amount)}₽
                  </Badge>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-white/30">{formatDate(op.created_at)} {formatTime(op.created_at)}</span>
                  {op.creator && <span className="text-[10px] text-white/30">· {op.creator.nickname}</span>}
                  {op.note && <span className="text-[10px] text-white/25 truncate">· {op.note}</span>}
                </div>
              </div>
              <button
                onClick={() => setShowDeleteConfirm(op)}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5 text-white/20 hover:text-red-400" />
              </button>
            </div>
          ))}
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
              <ArrowUpFromLine className="w-4 h-4" />Инкассация
            </button>
            <button
              onClick={() => setOpType('deposit')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                opType === 'deposit' ? 'bg-emerald-500/20 text-emerald-400' : 'text-white/50'
              }`}
            >
              <ArrowDownToLine className="w-4 h-4" />Внесение
            </button>
          </div>

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
              <p className="text-lg font-bold text-[var(--c-text)]">{new Intl.NumberFormat('ru-RU').format(showDeleteConfirm.amount)}₽</p>
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
