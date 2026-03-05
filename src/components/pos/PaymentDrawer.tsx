import { useState, useEffect, useMemo } from 'react';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { SwipeableRow } from '@/components/ui/SwipeableRow';
import { usePOSStore, type PaymentPortion } from '@/store/pos';
import { supabase } from '@/lib/supabase';
import { hapticFeedback, hapticNotification } from '@/lib/telegram';
import { Banknote, CreditCard, Clock, Star, Split, Plus, Minus, ArrowLeft, Ticket } from 'lucide-react';
import type { PaymentMethod, Profile, Certificate } from '@/types';

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

type PayScreen = 'main' | 'bonus' | 'split' | 'certificate';

export function PaymentDrawer({ open, onClose, onSuccess, spaceRental = 0 }: PaymentDrawerProps) {
  const { activeCheck, getCartTotal, closeCheck } = usePOSStore();
  const [isProcessing, setIsProcessing] = useState(false);
  const [playerInfo, setPlayerInfo] = useState<Profile | null>(null);
  const [screen, setScreen] = useState<PayScreen>('main');
  const [bonusAmount, setBonusAmount] = useState(0);
  const [splitPayments, setSplitPayments] = useState<PaymentPortion[]>([]);
  const [splitMethod, setSplitMethod] = useState<PaymentMethod>('cash');
  const [splitAmount, setSplitAmount] = useState('');
  const [certCode, setCertCode] = useState('');
  const [certError, setCertError] = useState('');
  const [appliedCert, setAppliedCert] = useState<Certificate | null>(null);
  const [certLoading, setCertLoading] = useState(false);

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
      setScreen('main');
      setBonusAmount(0);
      setSplitPayments([]);
      setSplitAmount('');
      setCertCode('');
      setCertError('');
      setAppliedCert(null);
    }
  }, [open, activeCheck]);

  const maxBonus = Math.min(playerInfo?.bonus_points || 0, Math.floor(total * 0.5));
  const bonusRemainder = total - bonusAmount;

  const splitPaid = splitPayments.reduce((s, p) => s + p.amount, 0);
  const splitRemaining = Math.max(0, total - splitPaid);
  const splitBonusUsed = splitPayments.filter((p) => p.method === 'bonus').reduce((s, p) => s + p.amount, 0);
  const splitBonusAvailable = Math.max(0, maxBonus - splitBonusUsed);

  const bonusPresets = useMemo(() => {
    if (maxBonus <= 0) return [];
    const presets: number[] = [];
    const quarter = Math.floor(maxBonus * 0.25);
    const half = Math.floor(maxBonus * 0.5);
    if (quarter > 0 && quarter !== maxBonus) presets.push(quarter);
    if (half > 0 && half !== quarter && half !== maxBonus) presets.push(half);
    presets.push(maxBonus);
    return presets;
  }, [maxBonus]);

  const handleSimplePay = async (method: PaymentMethod) => {
    setIsProcessing(true);
    const payments: PaymentPortion[] = [{ method, amount: total }];
    const ok = await closeCheck(payments, 0, spaceRental);
    setIsProcessing(false);
    if (ok) { hapticNotification('success'); onSuccess(); }
  };

  const handleBonusConfirm = async (remainderMethod: PaymentMethod) => {
    if (bonusAmount <= 0) return;
    setIsProcessing(true);
    const payments: PaymentPortion[] = [{ method: 'bonus', amount: bonusAmount }];
    if (bonusRemainder > 0) payments.push({ method: remainderMethod, amount: bonusRemainder });
    const ok = await closeCheck(payments, bonusAmount, spaceRental);
    setIsProcessing(false);
    if (ok) { hapticNotification('success'); onSuccess(); }
  };

  const addSplitPayment = () => {
    const amt = Number(splitAmount);
    if (!amt || amt <= 0 || amt > splitRemaining) return;
    if (splitMethod === 'bonus' && amt > splitBonusAvailable) return;
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

  const handleSplitConfirm = async () => {
    if (splitRemaining > 0) return;
    setIsProcessing(true);
    const bu = splitPayments.filter((p) => p.method === 'bonus').reduce((s, p) => s + p.amount, 0);
    const ok = await closeCheck(splitPayments, bu, spaceRental);
    setIsProcessing(false);
    if (ok) { hapticNotification('success'); onSuccess(); }
  };

  const lookupCertificate = async () => {
    if (!certCode.trim()) return;
    setCertLoading(true);
    setCertError('');
    const { data, error } = await supabase
      .from('certificates')
      .select('*')
      .eq('code', certCode.trim().toUpperCase())
      .maybeSingle();
    setCertLoading(false);
    if (error || !data) { setCertError('Сертификат не найден'); return; }
    if (data.is_used) { setCertError('Сертификат уже использован'); return; }
    if ((data.balance || data.nominal) <= 0) { setCertError('Баланс сертификата 0'); return; }
    setAppliedCert(data as Certificate);
  };

  const handleCertPay = async (remainderMethod: PaymentMethod) => {
    if (!appliedCert || !activeCheck) return;
    setIsProcessing(true);
    const certBalance = appliedCert.balance ?? appliedCert.nominal;
    const certAmount = Math.min(certBalance, total);
    const remainder = total - certAmount;

    await supabase
      .from('certificates')
      .update({
        balance: certBalance - certAmount,
        is_used: certBalance - certAmount <= 0,
        used_by: activeCheck.player_id || null,
      })
      .eq('id', appliedCert.id);

    const payments: PaymentPortion[] = [{ method: 'cash' as PaymentMethod, amount: certAmount }];
    if (remainder > 0) payments.push({ method: remainderMethod, amount: remainder });
    const ok = await closeCheck(payments, 0, spaceRental);
    setIsProcessing(false);
    if (ok) { hapticNotification('success'); onSuccess(); }
  };

  const fmtCur = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + '₽';
  const getMethodConf = (m: PaymentMethod) => methodConfig.find((mc) => mc.method === m) || methodConfig[0];

  const openBonusScreen = () => {
    hapticFeedback('light');
    setBonusAmount(maxBonus);
    setScreen('bonus');
  };

  const adjustBonus = (delta: number) => {
    hapticFeedback('light');
    const step = Math.max(10, Math.round(maxBonus / 20) * 10) || 10;
    setBonusAmount((v) => Math.max(0, Math.min(maxBonus, v + delta * step)));
  };

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

        {/* ═══ MAIN SCREEN ═══ */}
        {screen === 'main' && (
          <>
            <div className={`grid gap-2 ${activeCheck?.player_id && maxBonus > 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <button
                onClick={() => handleSimplePay('cash')}
                disabled={isProcessing}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-emerald-500/6 border border-emerald-500/10 active:scale-[0.96] transition-transform disabled:opacity-30"
              >
                <Banknote className="w-6 h-6 text-emerald-400" />
                <span className="text-[12px] font-bold text-emerald-400">Наличные</span>
                <span className="text-[10px] text-emerald-400/40 tabular-nums">{fmtCur(total)}</span>
              </button>
              <button
                onClick={() => handleSimplePay('card')}
                disabled={isProcessing}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-blue-500/6 border border-blue-500/10 active:scale-[0.96] transition-transform disabled:opacity-30"
              >
                <CreditCard className="w-6 h-6 text-blue-400" />
                <span className="text-[12px] font-bold text-blue-400">Карта</span>
                <span className="text-[10px] text-blue-400/40 tabular-nums">{fmtCur(total)}</span>
              </button>
              {activeCheck?.player_id && maxBonus > 0 && (
                <button
                  onClick={openBonusScreen}
                  disabled={isProcessing}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-amber-500/6 border border-amber-500/10 active:scale-[0.96] transition-transform disabled:opacity-30"
                >
                  <Star className="w-6 h-6 text-amber-400" />
                  <span className="text-[12px] font-bold text-amber-400">Бонусы</span>
                  <span className="text-[10px] text-amber-400/40 tabular-nums">до {fmtCur(maxBonus)}</span>
                </button>
              )}
            </div>

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

            <div className="flex gap-2">
              <button
                onClick={() => { hapticFeedback('light'); setScreen('split'); setSplitPayments([]); setSplitAmount(''); }}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/4 text-xs font-semibold text-white/30 active:scale-[0.98] transition-transform"
              >
                <Split className="w-3.5 h-3.5" />
                Разделить
              </button>
              <button
                onClick={() => { hapticFeedback('light'); setScreen('certificate'); setCertCode(''); setCertError(''); setAppliedCert(null); }}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-violet-500/6 border border-violet-500/10 text-xs font-semibold text-violet-400/60 active:scale-[0.98] transition-transform"
              >
                <Ticket className="w-3.5 h-3.5" />
                Сертификат
              </button>
            </div>

            {activeCheck?.player_id && (
              <p className="text-[10px] text-center text-white/15 font-medium">
                Бонусы будут начислены автоматически
              </p>
            )}
          </>
        )}

        {/* ═══ BONUS SCREEN ═══ */}
        {screen === 'bonus' && (
          <>
            <button
              onClick={() => { setScreen('main'); setBonusAmount(0); }}
              className="flex items-center gap-1.5 text-[12px] font-medium text-white/40 active:text-white/60 -mt-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Назад к способам
            </button>

            <div className="p-4 rounded-xl bg-amber-500/6 border border-amber-500/12 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-amber-400/60 uppercase tracking-wider">Списать бонусы</span>
                <span className="text-[11px] text-amber-400/40">Доступно: {fmtCur(playerInfo?.bonus_points || 0)}</span>
              </div>

              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => adjustBonus(-1)}
                  disabled={bonusAmount <= 0}
                  className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center active:scale-90 transition-transform disabled:opacity-20"
                >
                  <Minus className="w-4 h-4 text-amber-400" />
                </button>
                <div className="text-center min-w-[100px]">
                  <input
                    type="number"
                    value={bonusAmount}
                    onChange={(e) => setBonusAmount(Math.max(0, Math.min(maxBonus, Number(e.target.value) || 0)))}
                    className="w-full text-center text-3xl font-black text-amber-400 bg-transparent outline-none tabular-nums"
                    min={0}
                    max={maxBonus}
                  />
                  <p className="text-[10px] text-amber-400/30 -mt-0.5">макс. 50% = {fmtCur(maxBonus)}</p>
                </div>
                <button
                  onClick={() => adjustBonus(1)}
                  disabled={bonusAmount >= maxBonus}
                  className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center active:scale-90 transition-transform disabled:opacity-20"
                >
                  <Plus className="w-4 h-4 text-amber-400" />
                </button>
              </div>

              <div className="flex gap-1.5 justify-center">
                {bonusPresets.map((p) => (
                  <button
                    key={p}
                    onClick={() => { hapticFeedback('light'); setBonusAmount(p); }}
                    className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all active:scale-95 ${
                      bonusAmount === p
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-white/5 text-white/25'
                    }`}
                  >
                    {fmtCur(p)}
                  </button>
                ))}
              </div>
            </div>

            {bonusAmount > 0 && bonusRemainder > 0 && (
              <div className="text-center">
                <p className="text-[11px] text-white/30">Остаток к оплате: <span className="font-bold text-[var(--c-text)]">{fmtCur(bonusRemainder)}</span></p>
              </div>
            )}

            {bonusAmount > 0 && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleBonusConfirm('cash')}
                  disabled={isProcessing}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-emerald-500/6 border border-emerald-500/10 active:scale-[0.96] transition-transform disabled:opacity-30"
                >
                  <Banknote className="w-5 h-5 text-emerald-400" />
                  <span className="text-[12px] font-bold text-emerald-400">
                    {bonusRemainder > 0 ? 'Остаток нал.' : 'Подтвердить'}
                  </span>
                  {bonusRemainder > 0 && <span className="text-[10px] text-emerald-400/40 tabular-nums">{fmtCur(bonusRemainder)}</span>}
                </button>
                <button
                  onClick={() => handleBonusConfirm('card')}
                  disabled={isProcessing}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-blue-500/6 border border-blue-500/10 active:scale-[0.96] transition-transform disabled:opacity-30"
                >
                  <CreditCard className="w-5 h-5 text-blue-400" />
                  <span className="text-[12px] font-bold text-blue-400">
                    {bonusRemainder > 0 ? 'Остаток карт.' : 'Подтвердить'}
                  </span>
                  {bonusRemainder > 0 && <span className="text-[10px] text-blue-400/40 tabular-nums">{fmtCur(bonusRemainder)}</span>}
                </button>
              </div>
            )}
          </>
        )}

        {/* ═══ CERTIFICATE SCREEN ═══ */}
        {screen === 'certificate' && (
          <>
            <button
              onClick={() => { setScreen('main'); setAppliedCert(null); setCertCode(''); setCertError(''); }}
              className="flex items-center gap-1.5 text-[12px] font-medium text-white/40 active:text-white/60 -mt-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Назад к способам
            </button>

            <div className="p-4 rounded-xl bg-violet-500/6 border border-violet-500/12 space-y-3">
              <div className="flex items-center gap-2">
                <Ticket className="w-5 h-5 text-violet-400" />
                <span className="text-[13px] font-semibold text-violet-400">Оплата сертификатом</span>
              </div>

              {!appliedCert ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      compact
                      placeholder="Введите код сертификата"
                      value={certCode}
                      onChange={(e) => { setCertCode(e.target.value.toUpperCase()); setCertError(''); }}
                      className="flex-1 uppercase"
                    />
                    <Button size="sm" onClick={lookupCertificate} loading={certLoading} disabled={!certCode.trim()}>
                      Найти
                    </Button>
                  </div>
                  {certError && (
                    <p className="text-[11px] text-red-400 font-medium">{certError}</p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-violet-400/60">Код</span>
                    <span className="text-[13px] font-bold text-violet-400">{appliedCert.code}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-violet-400/60">Номинал</span>
                    <span className="text-[13px] font-semibold text-white/70">{fmtCur(appliedCert.nominal)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-violet-400/60">Баланс</span>
                    <span className="text-[13px] font-bold text-emerald-400">{fmtCur(appliedCert.balance ?? appliedCert.nominal)}</span>
                  </div>
                  {(() => {
                    const certBal = appliedCert.balance ?? appliedCert.nominal;
                    const covers = certBal >= total;
                    const remainder = total - Math.min(certBal, total);
                    return (
                      <>
                        {covers ? (
                          <button
                            onClick={() => handleCertPay('cash')}
                            disabled={isProcessing}
                            className="w-full py-3 rounded-xl text-[13px] font-bold text-white active:scale-[0.97] transition-transform disabled:opacity-30"
                            style={{ background: 'linear-gradient(135deg, #6c5ce7, #7c6cf7)' }}
                          >
                            Оплатить {fmtCur(total)}
                          </button>
                        ) : (
                          <div className="space-y-2 pt-1">
                            <p className="text-[11px] text-center text-white/30">
                              Списать {fmtCur(certBal)}, остаток {fmtCur(remainder)}:
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={() => handleCertPay('cash')}
                                disabled={isProcessing}
                                className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-emerald-500/6 border border-emerald-500/10 active:scale-[0.96] transition-transform disabled:opacity-30"
                              >
                                <Banknote className="w-4 h-4 text-emerald-400" />
                                <span className="text-[11px] font-bold text-emerald-400">Наличные</span>
                              </button>
                              <button
                                onClick={() => handleCertPay('card')}
                                disabled={isProcessing}
                                className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-blue-500/6 border border-blue-500/10 active:scale-[0.96] transition-transform disabled:opacity-30"
                              >
                                <CreditCard className="w-4 h-4 text-blue-400" />
                                <span className="text-[11px] font-bold text-blue-400">Карта</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          </>
        )}

        {/* ═══ SPLIT SCREEN ═══ */}
        {screen === 'split' && (
          <>
            <button
              onClick={() => { setScreen('main'); setSplitPayments([]); setSplitAmount(''); }}
              className="flex items-center gap-1.5 text-[12px] font-medium text-white/40 active:text-white/60 -mt-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Назад к способам
            </button>

            <div className="p-3 rounded-xl card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-white/30 font-semibold uppercase tracking-wider">Осталось</span>
                <span className={`text-lg font-black tabular-nums ${splitRemaining === 0 ? 'text-emerald-400' : 'text-[var(--c-text)]'}`}>
                  {fmtCur(splitRemaining)}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden flex">
                {splitPayments.map((sp, idx) => {
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
                    <SwipeableRow key={idx} onDelete={() => { hapticFeedback('light'); setSplitPayments(splitPayments.filter((_, i) => i !== idx)); }}>
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
                      {mc.method === 'bonus' && <span className="text-[9px] opacity-60">до {fmtCur(splitBonusAvailable)}</span>}
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
      </div>
    </Drawer>
  );
}
