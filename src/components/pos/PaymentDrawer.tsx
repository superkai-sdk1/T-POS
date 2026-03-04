import { useState, useEffect } from 'react';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { SwipeableRow } from '@/components/ui/SwipeableRow';
import { usePOSStore, type PaymentPortion } from '@/store/pos';
import { supabase } from '@/lib/supabase';
import { hapticFeedback, hapticNotification } from '@/lib/telegram';
import { Banknote, CreditCard, Clock, Star, Split, Plus } from 'lucide-react';
import type { PaymentMethod, Profile } from '@/types';

interface PaymentDrawerProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  spaceRental?: number;
}

const methodConfig: { method: PaymentMethod; label: string; icon: typeof Banknote; color: string; bg: string }[] = [
  { method: 'cash', label: 'Наличные', icon: Banknote, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/15' },
  { method: 'card', label: 'Карта', icon: CreditCard, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/15' },
  { method: 'bonus', label: 'Бонусы', icon: Star, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/15' },
  { method: 'debt', label: 'В долг', icon: Clock, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/15' },
];

export function PaymentDrawer({ open, onClose, onSuccess, spaceRental = 0 }: PaymentDrawerProps) {
  const { activeCheck, getCartTotal, closeCheck } = usePOSStore();
  const [isProcessing, setIsProcessing] = useState(false);
  const [playerInfo, setPlayerInfo] = useState<Profile | null>(null);
  const [splitMode, setSplitMode] = useState(false);
  const [splitPayments, setSplitPayments] = useState<PaymentPortion[]>([]);
  const [splitMethod, setSplitMethod] = useState<PaymentMethod>('cash');
  const [splitAmount, setSplitAmount] = useState('');

  const total = getCartTotal() + spaceRental;

  useEffect(() => {
    if (open && activeCheck?.player_id) {
      supabase
        .from('profiles')
        .select('*')
        .eq('id', activeCheck.player_id)
        .single()
        .then(({ data }) => {
          if (data) setPlayerInfo(data as Profile);
        });
    } else {
      setPlayerInfo(null);
    }
    if (!open) {
      setIsProcessing(false);
      setSplitMode(false);
      setSplitPayments([]);
      setSplitAmount('');
    }
  }, [open, activeCheck]);

  const maxBonus = Math.min(playerInfo?.bonus_points || 0, Math.floor(total * 0.5));

  const splitPaid = splitPayments.reduce((s, p) => s + p.amount, 0);
  const splitRemaining = Math.max(0, total - splitPaid);
  const splitBonusUsed = splitPayments.filter((p) => p.method === 'bonus').reduce((s, p) => s + p.amount, 0);
  const splitBonusAvailable = Math.max(0, maxBonus - splitBonusUsed);

  const handleSimplePay = async (method: PaymentMethod, bonusUsed = 0) => {
    setIsProcessing(true);
    const amount = bonusUsed > 0 ? Math.max(0, total - bonusUsed) : total;
    const payments: PaymentPortion[] = [];
    if (bonusUsed > 0) payments.push({ method: 'bonus', amount: bonusUsed });
    payments.push({ method, amount });
    const success = await closeCheck(payments, bonusUsed, spaceRental);
    setIsProcessing(false);
    if (success) {
      hapticNotification('success');
      onSuccess();
    }
  };

  const handleBonusPay = async () => {
    setIsProcessing(true);
    const remaining = total - maxBonus;
    const payments: PaymentPortion[] = [{ method: 'bonus', amount: maxBonus }];
    if (remaining > 0) payments.push({ method: 'cash', amount: remaining });
    const success = await closeCheck(payments, maxBonus, spaceRental);
    setIsProcessing(false);
    if (success) {
      hapticNotification('success');
      onSuccess();
    }
  };

  const addSplitPayment = () => {
    const amt = Number(splitAmount);
    if (!amt || amt <= 0 || amt > splitRemaining) return;

    if (splitMethod === 'bonus') {
      if (amt > splitBonusAvailable) return;
    }
    if (splitMethod === 'debt' && !activeCheck?.player_id) return;

    hapticFeedback('light');
    setSplitPayments([...splitPayments, { method: splitMethod, amount: amt }]);
    setSplitAmount('');
  };

  const addSplitRemainder = (method: PaymentMethod) => {
    if (splitRemaining <= 0) return;
    if (method === 'bonus' && splitRemaining > splitBonusAvailable) return;
    if (method === 'debt' && !activeCheck?.player_id) return;
    hapticFeedback('light');
    setSplitPayments([...splitPayments, { method, amount: splitRemaining }]);
  };

  const removeSplitPayment = (idx: number) => {
    hapticFeedback('light');
    setSplitPayments(splitPayments.filter((_, i) => i !== idx));
  };

  const handleSplitConfirm = async () => {
    if (splitRemaining > 0) return;
    setIsProcessing(true);
    const bonusUsed = splitPayments.filter((p) => p.method === 'bonus').reduce((s, p) => s + p.amount, 0);
    const success = await closeCheck(splitPayments, bonusUsed, spaceRental);
    setIsProcessing(false);
    if (success) {
      hapticNotification('success');
      onSuccess();
    }
  };

  const fmtCur = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + '₽';

  const getMethodConf = (m: PaymentMethod) => methodConfig.find((mc) => mc.method === m) || methodConfig[0];

  return (
    <Drawer open={open} onClose={onClose} title="Оплата">
      <div className="space-y-4">
        {/* Player info */}
        {playerInfo && (
          <div className="flex items-center gap-3 p-3 rounded-xl card">
            <div className="w-9 h-9 rounded-lg bg-[var(--c-accent)]/10 flex items-center justify-center">
              <span className="text-sm font-bold text-[var(--c-accent)]">
                {playerInfo.nickname?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1">
              <p className="text-[13px] font-semibold text-[var(--c-text)]">{playerInfo.nickname}</p>
              <div className="flex gap-1.5 mt-0.5">
                <Badge variant={playerInfo.balance < 0 ? 'danger' : 'default'} size="sm">{playerInfo.balance}₽</Badge>
                {playerInfo.bonus_points > 0 && (
                  <Badge variant="success" size="sm" icon={<Star className="w-2.5 h-2.5" />}>{playerInfo.bonus_points}</Badge>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Total */}
        <div className="text-center py-1">
          <p className="text-[10px] text-white/25 font-semibold uppercase tracking-wider mb-0.5">К оплате</p>
          <p className="text-4xl font-black text-[var(--c-text)] tabular-nums animate-count-up">
            {fmtCur(total)}
          </p>
        </div>

        {!splitMode ? (
          <>
            {/* Quick pay buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleSimplePay('cash')}
                disabled={isProcessing}
                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-emerald-500/6 border border-emerald-500/10 active:scale-[0.96] transition-transform disabled:opacity-30"
              >
                <Banknote className="w-6 h-6 text-emerald-400" />
                <span className="text-[13px] font-bold text-emerald-400">Наличные</span>
                <span className="text-[10px] text-emerald-400/40 tabular-nums">{fmtCur(total)}</span>
              </button>
              <button
                onClick={() => handleSimplePay('card')}
                disabled={isProcessing}
                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-blue-500/6 border border-blue-500/10 active:scale-[0.96] transition-transform disabled:opacity-30"
              >
                <CreditCard className="w-6 h-6 text-blue-400" />
                <span className="text-[13px] font-bold text-blue-400">Карта</span>
                <span className="text-[10px] text-blue-400/40 tabular-nums">{fmtCur(total)}</span>
              </button>
            </div>

            {activeCheck?.player_id && maxBonus > 0 && (
              <button
                onClick={handleBonusPay}
                disabled={isProcessing}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-amber-500/6 border border-amber-500/10 active:scale-[0.97] transition-transform disabled:opacity-30"
              >
                <Star className="w-5 h-5 text-amber-400" />
                <div className="flex-1 text-left">
                  <p className="text-[13px] font-semibold text-amber-400">Списать бонусы</p>
                  <p className="text-[10px] text-amber-400/40">-{fmtCur(maxBonus)}, остаток {fmtCur(total - maxBonus)} наличными</p>
                </div>
              </button>
            )}

            {activeCheck?.player_id && (
              <button
                onClick={() => handleSimplePay('debt')}
                disabled={isProcessing}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-red-500/6 border border-red-500/8 active:scale-[0.97] transition-transform disabled:opacity-30"
              >
                <Clock className="w-5 h-5 text-red-400" />
                <div className="flex-1 text-left">
                  <p className="text-[13px] font-semibold text-red-400">В долг</p>
                  <p className="text-[10px] text-red-400/40">{fmtCur(total)} на баланс</p>
                </div>
              </button>
            )}

            <button
              onClick={() => { hapticFeedback('light'); setSplitMode(true); }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/4 text-xs font-semibold text-white/30 active:scale-[0.98] transition-transform"
            >
              <Split className="w-3.5 h-3.5" />
              Разделить оплату
            </button>
          </>
        ) : (
          <>
            {/* Split progress */}
            <div className="p-3 rounded-xl card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-white/30 font-semibold uppercase tracking-wider">Осталось</span>
                <span className={`text-lg font-black tabular-nums ${splitRemaining === 0 ? 'text-emerald-400' : 'text-[var(--c-text)]'}`}>
                  {fmtCur(splitRemaining)}
                </span>
              </div>
              {/* Stacked bar */}
              <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden flex">
                {splitPayments.map((sp, idx) => {
                  const conf = getMethodConf(sp.method);
                  const pct = total > 0 ? (sp.amount / total) * 100 : 0;
                  return (
                    <div
                      key={idx}
                      className={`h-full transition-all duration-300 first:rounded-l-full last:rounded-r-full ${
                        sp.method === 'cash' ? 'bg-emerald-500' : sp.method === 'card' ? 'bg-blue-500' : sp.method === 'bonus' ? 'bg-amber-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  );
                })}
              </div>
            </div>

            {splitPayments.length > 0 && (
              <div className="space-y-1">
                {splitPayments.map((sp, idx) => {
                  const conf = getMethodConf(sp.method);
                  return (
                    <SwipeableRow key={idx} onDelete={() => removeSplitPayment(idx)}>
                      <div className={`flex items-center gap-2.5 p-2.5 rounded-xl border ${conf.bg}`}>
                        <conf.icon className={`w-4 h-4 shrink-0 ${conf.color}`} />
                        <span className={`flex-1 text-[13px] font-medium ${conf.color}`}>{conf.label}</span>
                        <span className={`font-bold text-[13px] tabular-nums ${conf.color}`}>{fmtCur(sp.amount)}</span>
                      </div>
                    </SwipeableRow>
                  );
                })}
              </div>
            )}

            {splitRemaining > 0 && (
              <div className="space-y-2.5">
                <div className="flex gap-1.5 flex-wrap">
                  {methodConfig
                    .filter((mc) => {
                      if (mc.method === 'debt' && !activeCheck?.player_id) return false;
                      if (mc.method === 'bonus' && (!activeCheck?.player_id || splitBonusAvailable <= 0)) return false;
                      return true;
                    })
                    .map((mc) => (
                    <button
                      key={mc.method}
                      onClick={() => setSplitMethod(mc.method)}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition-all active:scale-95 ${
                        splitMethod === mc.method
                          ? 'bg-[var(--c-accent)]/12 border-[var(--c-accent)]/20 text-[var(--c-accent)]'
                          : 'bg-white/4 border-white/6 text-white/30'
                      }`}
                    >
                      <mc.icon className="w-3 h-3" />
                      {mc.label}
                    </button>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Input
                    type="number"
                    compact
                    placeholder={`Макс ${fmtCur(splitMethod === 'bonus' ? Math.min(splitRemaining, splitBonusAvailable) : splitRemaining)}`}
                    value={splitAmount}
                    onChange={(e) => setSplitAmount(e.target.value)}
                    min={0}
                    max={splitMethod === 'bonus' ? Math.min(splitRemaining, splitBonusAvailable) : splitRemaining}
                    className="flex-1"
                  />
                  <Button size="sm" onClick={addSplitPayment} disabled={!splitAmount || Number(splitAmount) <= 0}>
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>

                <div className="flex gap-1">
                  {methodConfig
                    .filter((mc) => {
                      if (mc.method === 'debt' && !activeCheck?.player_id) return false;
                      if (mc.method === 'bonus' && (!activeCheck?.player_id || splitBonusAvailable < splitRemaining)) return false;
                      return true;
                    })
                    .map((mc) => (
                    <button
                      key={mc.method}
                      onClick={() => addSplitRemainder(mc.method)}
                      className="flex-1 py-1.5 rounded-lg bg-white/4 text-[10px] font-semibold text-white/20 active:scale-95 transition-transform"
                    >
                      Всё {mc.label.toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => { setSplitMode(false); setSplitPayments([]); setSplitAmount(''); }}
                className="flex-1 py-2.5 rounded-xl bg-white/5 text-[13px] font-semibold text-[var(--c-text)] active:scale-[0.97] transition-transform"
              >
                Назад
              </button>
              <Button
                className="flex-1"
                onClick={handleSplitConfirm}
                loading={isProcessing}
                disabled={isProcessing || splitRemaining > 0}
              >
                Подтвердить
              </Button>
            </div>
          </>
        )}

        {!splitMode && activeCheck?.player_id && (
          <p className="text-[10px] text-center text-white/15 font-medium">
            Бонусы будут начислены автоматически
          </p>
        )}
      </div>
    </Drawer>
  );
}
