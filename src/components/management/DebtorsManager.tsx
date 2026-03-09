import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Drawer } from '@/components/ui/Drawer';
import { AlertTriangle, TrendingDown, TrendingUp, User, Wallet } from 'lucide-react';
import { hapticNotification } from '@/lib/telegram';
import { useOnTableChange } from '@/hooks/useRealtimeSync';
import type { Profile } from '@/types';

export function DebtorsManager() {
  const [debtors, setDebtors] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [showAdjust, setShowAdjust] = useState(false);
  const [amount, setAmount] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const user = useAuthStore((s) => s.user);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .lt('balance', 0)
      .order('balance', { ascending: true });
    if (data) setDebtors(data as Profile[]);
    setIsLoading(false);
  }, []);

  const profilesTables = useMemo(() => ['profiles'], []);
  useOnTableChange(profilesTables, load);

  useEffect(() => {
    load();
  }, [load]);

  const totalDebt = debtors.reduce((s, d) => s + d.balance, 0);

  const openAdjust = (p: Profile) => {
    setSelected(p);
    setAmount('');
    setAdjustNote('');
    setShowAdjust(true);
  };

  const handleRepay = async () => {
    if (!selected || !amount) return;
    const val = Math.abs(Number(amount));
    if (!Number.isFinite(val) || val <= 0) return;

    const { data: fresh } = await supabase.from('profiles').select('balance').eq('id', selected.id).single();
    const currentBalance = fresh?.balance ?? selected.balance;
    const newBalance = currentBalance + val;
    await supabase
      .from('profiles')
      .update({ balance: newBalance })
      .eq('id', selected.id);

    await supabase.from('transactions').insert({
      type: 'debt_adjustment',
      amount: val,
      description: `Погашение долга${adjustNote ? ': ' + adjustNote : ''} (было ${currentBalance}₽, стало ${newBalance}₽)`,
      player_id: selected.id,
      created_by: user?.id,
    });

    hapticNotification('success');
    setShowAdjust(false);
    load();
  };

  const handleIncrease = async () => {
    if (!selected || !amount) return;
    const val = Math.abs(Number(amount));
    if (!Number.isFinite(val) || val <= 0) return;

    const { data: fresh } = await supabase.from('profiles').select('balance').eq('id', selected.id).single();
    const currentBalance = fresh?.balance ?? selected.balance;
    const newBalance = currentBalance - val;
    await supabase
      .from('profiles')
      .update({ balance: newBalance })
      .eq('id', selected.id);

    await supabase.from('transactions').insert({
      type: 'debt_adjustment',
      amount: -val,
      description: `Увеличение долга${adjustNote ? ': ' + adjustNote : ''} (было ${currentBalance}₽, стало ${newBalance}₽)`,
      player_id: selected.id,
      created_by: user?.id,
    });

    hapticNotification('warning');
    setShowAdjust(false);
    load();
  };

  const fmtCur = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + '₽';

  if (isLoading) {
    return (
      <div className="space-y-3 py-4">
        {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl skeleton" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="p-3 rounded-xl bg-[var(--c-danger-bg)] border border-[var(--c-border)]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-[var(--c-hint)]">Общий долг</p>
            <p className="text-lg font-black text-[var(--c-danger)]">{fmtCur(totalDebt)}</p>
          </div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-[var(--c-danger)]" />
            <span className="text-[13px] text-[var(--c-hint)]">{debtors.length} чел.</span>
          </div>
        </div>
      </div>

      {debtors.length === 0 ? (
        <div className="text-center py-12">
          <Wallet className="w-16 h-16 text-[var(--c-muted)] mx-auto mb-4" />
          <p className="text-[var(--c-hint)]">Нет должников</p>
        </div>
      ) : (
        <div className="space-y-2">
          {debtors.map((d) => (
            <button
              key={d.id}
              onClick={() => openAdjust(d)}
              className="w-full flex items-center gap-3 p-2.5 rounded-xl card-interactive"
            >
              <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
                <User className="w-5 h-5 text-red-400" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="font-semibold text-[13px] text-[var(--c-text)] truncate">{d.nickname}</p>
                {d.is_resident && <span className="text-[10px] text-[var(--c-success)]">Резидент</span>}
              </div>
              <span className="text-lg font-bold text-[var(--c-danger)] shrink-0">{fmtCur(d.balance)}</span>
            </button>
          ))}
        </div>
      )}

      {/* Adjust debt drawer */}
      <Drawer
        open={showAdjust}
        onClose={() => setShowAdjust(false)}
        title={selected ? selected.nickname : 'Должник'}
        size="md"
      >
        {selected && (
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-[var(--c-danger-bg)] border border-[var(--c-border)] text-center">
              <p className="text-xs text-[var(--c-hint)] mb-1">Текущий долг</p>
              <p className="text-lg font-black text-[var(--c-danger)]">{fmtCur(selected.balance)}</p>
            </div>

            <Input
              type="number"
              label="Сумма"
              placeholder="Введите сумму"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={1}
              autoFocus
            />

            <Input
              label="Примечание"
              placeholder="Причина (необязательно)"
              value={adjustNote}
              onChange={(e) => setAdjustNote(e.target.value)}
            />

            {Number(amount) > 0 && (
              <div className="p-2.5 rounded-xl card space-y-1.5">
                <div className="flex justify-between text-[13px]">
                  <span className="text-[var(--c-hint)]">При погашении</span>
                  <span className={`font-semibold ${selected.balance + Number(amount) >= 0 ? 'text-[var(--c-success)]' : 'text-[var(--c-warning)]'}`}>
                    {fmtCur(selected.balance + Number(amount))}
                  </span>
                </div>
                <div className="flex justify-between text-[13px]">
                  <span className="text-[var(--c-hint)]">При увеличении</span>
                  <span className="font-semibold text-[var(--c-danger)]">
                    {fmtCur(selected.balance - Number(amount))}
                  </span>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                fullWidth
                onClick={handleRepay}
                disabled={!amount || Number(amount) <= 0}
              >
                <TrendingUp className="w-4 h-4" />
                Погасить
              </Button>
              <Button
                fullWidth
                variant="danger"
                onClick={handleIncrease}
                disabled={!amount || Number(amount) <= 0}
              >
                <TrendingDown className="w-4 h-4" />
                Увеличить
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
