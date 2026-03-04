import { useState, useEffect } from 'react';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { SwipeableRow } from '@/components/ui/SwipeableRow';
import { usePOSStore, type PaymentPortion } from '@/store/pos';
import { supabase } from '@/lib/supabase';
import { hapticFeedback, hapticNotification } from '@/lib/telegram';
import { Banknote, CreditCard, Clock, Star, Split, Plus, Trash2 } from 'lucide-react';
import type { PaymentMethod, Profile } from '@/types';

interface PaymentDrawerProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  spaceRental?: number;
}

const methodConfig: { method: PaymentMethod; label: string; icon: typeof Banknote; color: string }[] = [
  { method: 'cash', label: 'Наличные', icon: Banknote, color: 'bg-emerald-500/12 text-emerald-400 border-emerald-500/20' },
  { method: 'card', label: 'Карта', icon: CreditCard, color: 'bg-blue-500/12 text-blue-400 border-blue-500/20' },
  { method: 'bonus', label: 'Бонусы', icon: Star, color: 'bg-amber-500/12 text-amber-400 border-amber-500/20' },
  { method: 'debt', label: 'В долг', icon: Clock, color: 'bg-red-500/12 text-red-400 border-red-500/20' },
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
      <div className="space-y-5">
        {playerInfo && (
          <div className="p-3.5 rounded-2xl glass space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--tg-theme-hint-color,#888)] font-medium">Игрок</span>
              <span className="font-bold text-sm text-[var(--tg-theme-text-color,#e0e0e0)]">{playerInfo.nickname}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--tg-theme-hint-color,#888)] font-medium">Баланс</span>
              <Badge variant={playerInfo.balance < 0 ? 'danger' : 'default'}>{playerInfo.balance}₽</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--tg-theme-hint-color,#888)] font-medium">Бонусы</span>
              <Badge variant="success"><Star className="w-3 h-3 mr-1" />{playerInfo.bonus_points}</Badge>
            </div>
          </div>
        )}

        <div className="text-center py-2">
          <p className="text-xs text-[var(--tg-theme-hint-color,#888)] font-medium mb-1">К оплате</p>
          <p className="text-4xl font-black text-[var(--tg-theme-text-color,#e0e0e0)] tabular-nums animate-count-up">
            {fmtCur(total)}
          </p>
        </div>

        {!splitMode ? (
          <>
            <div className="space-y-2.5">
              <Button size="lg" fullWidth onClick={() => handleSimplePay('cash')} loading={isProcessing} disabled={isProcessing}>
                <Banknote className="w-5 h-5" />Наличные
              </Button>
              <Button size="lg" fullWidth variant="secondary" onClick={() => handleSimplePay('card')} loading={isProcessing} disabled={isProcessing}>
                <CreditCard className="w-5 h-5" />Карта
              </Button>
              {activeCheck?.player_id && maxBonus > 0 && (
                <Button
                  size="lg" fullWidth variant="secondary" onClick={handleBonusPay}
                  loading={isProcessing} disabled={isProcessing}
                  className="!bg-amber-500/10 !border-amber-500/20 !text-amber-400 hover:!bg-amber-500/20"
                >
                  <Star className="w-5 h-5" />
                  Бонусы -{fmtCur(maxBonus)} (ост. {fmtCur(total - maxBonus)})
                </Button>
              )}
              {activeCheck?.player_id && (
                <Button size="lg" fullWidth variant="danger" onClick={() => handleSimplePay('debt')} loading={isProcessing} disabled={isProcessing}>
                  <Clock className="w-5 h-5" />В долг
                </Button>
              )}
            </div>

            <button
              onClick={() => { hapticFeedback('light'); setSplitMode(true); }}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white/5 border border-white/5 text-sm font-semibold text-[var(--tg-theme-hint-color,#888)] hover:bg-white/8 transition-all active:scale-[0.98]"
            >
              <Split className="w-4 h-4" />
              Разделить оплату
            </button>
          </>
        ) : (
          <>
            {/* Split mode */}
            <div className="p-3 rounded-2xl bg-gradient-to-br from-violet-500/8 to-pink-500/5 border border-white/8">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-white/40 font-medium">Осталось</span>
                <span className={`text-xl font-black tabular-nums ${splitRemaining === 0 ? 'text-emerald-400' : 'text-[var(--tg-theme-text-color,#e0e0e0)]'}`}>
                  {fmtCur(splitRemaining)}
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--tg-theme-button-color,#6c5ce7)] transition-all duration-300"
                  style={{ width: `${total > 0 ? ((splitPaid / total) * 100) : 0}%` }}
                />
              </div>
            </div>

            {splitPayments.length > 0 && (
              <div className="space-y-1.5">
                {splitPayments.map((sp, idx) => {
                  const conf = getMethodConf(sp.method);
                  return (
                    <SwipeableRow key={idx} onDelete={() => removeSplitPayment(idx)}>
                      <div className={`flex items-center gap-3 p-3 rounded-xl border ${conf.color}`}>
                        <conf.icon className="w-4 h-4 shrink-0" />
                        <span className="flex-1 text-sm font-medium">{conf.label}</span>
                        <span className="font-bold text-sm tabular-nums">{fmtCur(sp.amount)}</span>
                      </div>
                    </SwipeableRow>
                  );
                })}
              </div>
            )}

            {splitRemaining > 0 && (
              <div className="space-y-3">
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
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all active:scale-95 ${
                        splitMethod === mc.method
                          ? 'bg-[var(--tg-theme-button-color,#6c5ce7)]/15 border-[var(--tg-theme-button-color,#6c5ce7)]/30 text-[var(--tg-theme-button-color,#6c5ce7)]'
                          : 'bg-white/5 border-white/8 text-white/40'
                      }`}
                    >
                      <mc.icon className="w-3.5 h-3.5" />
                      {mc.label}
                    </button>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder={`Сумма (макс ${fmtCur(splitMethod === 'bonus' ? Math.min(splitRemaining, splitBonusAvailable) : splitRemaining)})`}
                    value={splitAmount}
                    onChange={(e) => setSplitAmount(e.target.value)}
                    min={0}
                    max={splitMethod === 'bonus' ? Math.min(splitRemaining, splitBonusAvailable) : splitRemaining}
                    className="flex-1"
                  />
                  <Button onClick={addSplitPayment} disabled={!splitAmount || Number(splitAmount) <= 0}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>

                <div className="flex gap-1.5">
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
                      className="flex-1 py-2 rounded-lg bg-white/5 text-[10px] font-semibold text-white/30 hover:bg-white/8 transition-all active:scale-95"
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
                className="flex-1 py-3 rounded-xl bg-white/5 text-sm font-semibold text-[var(--tg-theme-text-color,#e0e0e0)] active:scale-[0.97] transition-all"
              >
                Назад
              </button>
              <Button
                size="lg"
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
          <p className="text-[11px] text-center text-white/25 font-medium">
            Бонусы будут начислены автоматически
          </p>
        )}
      </div>
    </Drawer>
  );
}
