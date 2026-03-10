import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SwipeableRow } from '@/components/ui/SwipeableRow';
import { usePOSStore, type PaymentPortion } from '@/store/pos';
import { supabase } from '@/lib/supabase';
import { hapticFeedback, hapticNotification } from '@/lib/telegram';
import { Banknote, CreditCard, Clock, Star, Split, Plus, Minus, ArrowLeft, Ticket, X } from 'lucide-react';
import type { PaymentMethod, Profile, Certificate } from '@/types';

interface PaymentDrawerProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  spaceRental?: number;
}

const methodConfig: { method: PaymentMethod; label: string; icon: typeof Banknote; color: string; bg: string }[] = [
  { method: 'cash', label: 'Наличные', icon: Banknote, color: 'text-[var(--c-success)]', bg: 'bg-[var(--c-success-bg)] border-[var(--c-success-border)]' },
  { method: 'card', label: 'Карта', icon: CreditCard, color: 'text-[var(--c-info)]', bg: 'bg-[var(--c-info-bg)] border-[var(--c-info-border)]' },
  { method: 'bonus', label: 'Бонусы', icon: Star, color: 'text-[var(--c-warning)]', bg: 'bg-[var(--c-warning-bg)] border-[var(--c-warning-border)]' },
  { method: 'debt', label: 'В долг', icon: Clock, color: 'text-[var(--c-danger)]', bg: 'bg-[var(--c-danger-bg)] border-[var(--c-danger-border)]' },
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

  const activePlayerId = activeCheck?.player_id;
  useEffect(() => {
    if (open && activePlayerId) {
      supabase
        .from('profiles')
        .select('*')
        .eq('id', activePlayerId)
        .single()
        .then(({ data }) => {
          if (data) setPlayerInfo(data as Profile);
        }, () => setPlayerInfo(null));
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
  }, [open, activePlayerId]);

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
    if (isProcessing) return;
    setIsProcessing(true);
    const payments: PaymentPortion[] = [{ method, amount: total }];
    const ok = await closeCheck(payments, 0, spaceRental);
    setIsProcessing(false);
    if (ok) { hapticNotification('success'); onSuccess(); }
    else { hapticNotification('error'); }
  };

  const handleBonusConfirm = async (remainderMethod: PaymentMethod) => {
    if (bonusAmount <= 0 || isProcessing) return;
    setIsProcessing(true);
    const payments: PaymentPortion[] = [{ method: 'bonus', amount: bonusAmount }];
    if (bonusRemainder > 0) payments.push({ method: remainderMethod, amount: bonusRemainder });
    const ok = await closeCheck(payments, bonusAmount, spaceRental);
    setIsProcessing(false);
    if (ok) { hapticNotification('success'); onSuccess(); }
    else { hapticNotification('error'); }
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
    if (splitRemaining > 0 || isProcessing) return;
    setIsProcessing(true);
    const bu = splitPayments.filter((p) => p.method === 'bonus').reduce((s, p) => s + p.amount, 0);
    const ok = await closeCheck(splitPayments, bu, spaceRental);
    setIsProcessing(false);
    if (ok) { hapticNotification('success'); onSuccess(); }
    else { hapticNotification('error'); }
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
    if ((data.balance ?? data.nominal) <= 0) { setCertError('Баланс сертификата 0'); return; }
    setAppliedCert(data as Certificate);
  };

  const handleCertPay = async (remainderMethod: PaymentMethod) => {
    if (!appliedCert || !activeCheck || isProcessing) return;
    setIsProcessing(true);
    const certBalance = appliedCert.balance ?? appliedCert.nominal;
    const certAmount = Math.min(certBalance, total);
    const remainder = total - certAmount;

    const payments: PaymentPortion[] = [{ method: 'cash' as PaymentMethod, amount: certAmount }];
    if (remainder > 0) payments.push({ method: remainderMethod, amount: remainder });
    const ok = await closeCheck(payments, 0, spaceRental);
    if (ok) {
      const { error: updErr } = await supabase
        .from('certificates')
        .update({
          balance: certBalance - certAmount,
          is_used: certBalance - certAmount <= 0,
          used_by: activeCheck.player_id || null,
        })
        .eq('id', appliedCert.id);
      if (updErr) {
        console.error('Certificate update error:', updErr);
        hapticNotification('error');
      } else {
        hapticNotification('success');
        onSuccess();
      }
    } else {
      hapticNotification('error');
    }
    setIsProcessing(false);
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center px-4 pb-6 sm:items-center animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xl" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-[#0e0e12]/80 backdrop-blur-3xl border border-white/10 rounded-[3rem] p-7 shadow-[0_0_100px_rgba(0,0,0,0.8)] overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#8b5cf6] blur-[80px] opacity-20 pointer-events-none" />

        <div className="flex justify-between items-center mb-6 relative z-10">
          <h2 className="text-3xl font-black italic tracking-tighter uppercase text-white">Оплата</h2>
          <button onClick={onClose} className="p-3 bg-white/5 rounded-full border border-white/10 text-white/40 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-6 relative z-10">
          {playerInfo && (
            <div className="bg-white/5 border border-white/10 rounded-3xl p-4 flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500/20 to-purple-500/10 rounded-2xl flex items-center justify-center text-purple-400 font-black border border-purple-500/20 shadow-inner">
                {playerInfo.nickname?.charAt(0).toUpperCase()}
              </div>
              <div>
                <h4 className="font-bold text-white">{playerInfo.nickname}</h4>
                <div className="flex gap-2 mt-1">
                  <span className={`px-2 py-0.5 rounded-lg text-[9px] font-bold border uppercase tracking-tighter ${playerInfo.balance < 0 ? 'bg-[#f43f5e]/10 text-[#f43f5e] border-[#f43f5e]/20' : 'bg-white/5 text-white/40 border-white/5'}`}>
                    {playerInfo.balance} ₽
                  </span>
                  {playerInfo.bonus_points > 0 && (
                    <span className="px-2 py-0.5 bg-[#10b981]/10 rounded-lg text-[9px] font-bold text-[#10b981] border border-[#10b981]/20 uppercase flex items-center gap-1">
                      <Star size={8} fill="currentColor" /> {playerInfo.bonus_points} бонусов
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="text-center">
            <p className="text-[10px] text-white/30 font-bold uppercase tracking-[0.3em] mb-2">Итоговая сумма</p>
            <h3 className="text-5xl font-black italic tracking-tighter text-white drop-shadow-[0_10px_20px_rgba(255,255,255,0.1)] tabular-nums">
              {fmtCur(total)}
            </h3>
          </div>

          {screen === 'main' && (
            <>
              <div className={`grid gap-3 ${activeCheck?.player_id && maxBonus > 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <button
                  onClick={() => handleSimplePay('cash')}
                  disabled={isProcessing}
                  className="flex flex-col items-center gap-3 p-5 bg-[#10b981]/5 border border-[#10b981]/20 rounded-[2rem] hover:bg-[#10b981]/10 transition-all group shadow-lg active:scale-[0.96] disabled:opacity-30"
                >
                  <div className="p-3 bg-[#10b981]/10 rounded-2xl text-[#10b981] group-hover:scale-110 transition-transform">
                    <Banknote size={24} />
                  </div>
                  <span className="text-[10px] font-black uppercase text-[#10b981] tracking-widest">Наличные</span>
                </button>
                <button
                  onClick={() => handleSimplePay('card')}
                  disabled={isProcessing}
                  className="flex flex-col items-center gap-3 p-5 bg-[#3b82f6]/5 border border-[#3b82f6]/20 rounded-[2rem] hover:bg-[#3b82f6]/10 transition-all group shadow-lg active:scale-[0.96] disabled:opacity-30"
                >
                  <div className="p-3 bg-[#3b82f6]/10 rounded-2xl text-[#3b82f6] group-hover:scale-110 transition-transform">
                    <CreditCard size={24} />
                  </div>
                  <span className="text-[10px] font-black uppercase text-[#3b82f6] tracking-widest">Карта</span>
                </button>
                {activeCheck?.player_id && maxBonus > 0 && (
                  <button
                    onClick={openBonusScreen}
                    disabled={isProcessing}
                    className="flex flex-col items-center gap-3 p-5 bg-[#f59e0b]/5 border border-[#f59e0b]/20 rounded-[2rem] hover:bg-[#f59e0b]/10 transition-all group shadow-lg active:scale-[0.96] disabled:opacity-30"
                  >
                    <div className="p-3 bg-[#f59e0b]/10 rounded-2xl text-[#f59e0b] group-hover:scale-110 transition-transform">
                      <Star size={24} />
                    </div>
                    <span className="text-[10px] font-black uppercase text-[#f59e0b] tracking-widest">Бонусы</span>
                  </button>
                )}
              </div>

              {activeCheck?.player_id && (
                <button
                  onClick={() => handleSimplePay('debt')}
                  disabled={isProcessing}
                  className="w-full flex items-center justify-between p-5 bg-[#f43f5e]/5 border border-[#f43f5e]/10 rounded-2xl group hover:bg-[#f43f5e]/10 transition-all active:scale-[0.97] disabled:opacity-30"
                >
                  <div className="flex items-center gap-3 text-[#f43f5e]">
                    <Clock size={20} />
                    <span className="font-bold uppercase text-[11px] tracking-widest">Записать в долг</span>
                  </div>
                  <span className="text-[10px] font-bold text-white/30 tracking-widest uppercase">{fmtCur(total)} на баланс</span>
                </button>
              )}

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => { hapticFeedback('light'); setScreen('split'); setSplitPayments([]); setSplitAmount(''); }}
                  className="flex items-center justify-center gap-2 py-4 bg-white/5 border border-white/5 rounded-2xl text-white/60 hover:text-white transition-all uppercase font-black text-[10px] tracking-widest active:scale-[0.98]"
                >
                  <Split size={14} /> Разделить
                </button>
                <button
                  onClick={() => { hapticFeedback('light'); setScreen('certificate'); setCertCode(''); setCertError(''); setAppliedCert(null); }}
                  className="flex items-center justify-center gap-2 py-4 bg-white/5 border border-white/5 rounded-2xl text-white/60 hover:text-white transition-all uppercase font-black text-[10px] tracking-widest active:scale-[0.98]"
                >
                  <Ticket size={14} /> Сертификат
                </button>
              </div>

              <p className="text-center text-[9px] font-bold text-white/20 uppercase tracking-widest">
                Транзакция защищена{activeCheck?.player_id ? ' · Бонусы начислятся автоматически' : ''}
              </p>
            </>
          )}

          {screen === 'bonus' && (
            <>
              <button
                onClick={() => { setScreen('main'); setBonusAmount(0); }}
                className="flex items-center gap-1.5 text-[12px] font-medium text-white/40 hover:text-white/60 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Назад к способам
              </button>

              <div className="p-5 rounded-[2rem] bg-[#f59e0b]/5 border border-[#f59e0b]/20 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-white/40 uppercase tracking-widest">Списать бонусы</span>
                  <span className="text-[11px] text-white/30">Доступно: {fmtCur(playerInfo?.bonus_points || 0)}</span>
                </div>

                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => adjustBonus(-1)}
                    disabled={bonusAmount <= 0}
                    className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center active:scale-90 transition-transform disabled:opacity-20"
                  >
                    <Minus className="w-4 h-4 text-[#f59e0b]" />
                  </button>
                  <div className="text-center min-w-[100px]">
                    <input
                      type="number"
                      value={bonusAmount}
                      onChange={(e) => setBonusAmount(Math.max(0, Math.min(maxBonus, Number(e.target.value) || 0)))}
                      className="w-full text-center text-3xl font-black italic text-[#f59e0b] bg-transparent outline-none tabular-nums"
                      min={0}
                      max={maxBonus}
                    />
                    <p className="text-[10px] text-white/25 -mt-0.5">макс. 50% = {fmtCur(maxBonus)}</p>
                  </div>
                  <button
                    onClick={() => adjustBonus(1)}
                    disabled={bonusAmount >= maxBonus}
                    className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center active:scale-90 transition-transform disabled:opacity-20"
                  >
                    <Plus className="w-4 h-4 text-[#f59e0b]" />
                  </button>
                </div>

                <div className="flex gap-1.5 justify-center">
                  {bonusPresets.map((p) => (
                    <button
                      key={p}
                      onClick={() => { hapticFeedback('light'); setBonusAmount(p); }}
                      className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all active:scale-95 ${
                        bonusAmount === p
                          ? 'bg-[#f59e0b]/15 text-[#f59e0b] border border-[#f59e0b]/30'
                          : 'bg-white/5 text-white/30 border border-white/5'
                      }`}
                    >
                      {fmtCur(p)}
                    </button>
                  ))}
                </div>
              </div>

              {bonusAmount > 0 && bonusRemainder > 0 && (
                <div className="text-center">
                  <p className="text-[11px] text-white/40">Остаток к оплате: <span className="font-bold text-white">{fmtCur(bonusRemainder)}</span></p>
                </div>
              )}

              {bonusAmount > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleBonusConfirm('cash')}
                    disabled={isProcessing}
                    className="flex flex-col items-center gap-2 p-4 bg-[#10b981]/5 border border-[#10b981]/20 rounded-[2rem] active:scale-[0.96] transition-all disabled:opacity-30"
                  >
                    <Banknote className="w-5 h-5 text-[#10b981]" />
                    <span className="text-[10px] font-black uppercase text-[#10b981] tracking-widest">
                      {bonusRemainder > 0 ? 'Остаток нал.' : 'Подтвердить'}
                    </span>
                    {bonusRemainder > 0 && <span className="text-[10px] text-white/30 tabular-nums">{fmtCur(bonusRemainder)}</span>}
                  </button>
                  <button
                    onClick={() => handleBonusConfirm('card')}
                    disabled={isProcessing}
                    className="flex flex-col items-center gap-2 p-4 bg-[#3b82f6]/5 border border-[#3b82f6]/20 rounded-[2rem] active:scale-[0.96] transition-all disabled:opacity-30"
                  >
                    <CreditCard className="w-5 h-5 text-[#3b82f6]" />
                    <span className="text-[10px] font-black uppercase text-[#3b82f6] tracking-widest">
                      {bonusRemainder > 0 ? 'Остаток карт.' : 'Подтвердить'}
                    </span>
                    {bonusRemainder > 0 && <span className="text-[10px] text-white/30 tabular-nums">{fmtCur(bonusRemainder)}</span>}
                  </button>
                </div>
              )}
            </>
          )}

          {screen === 'certificate' && (
            <>
              <button
                onClick={() => { setScreen('main'); setAppliedCert(null); setCertCode(''); setCertError(''); }}
                className="flex items-center gap-1.5 text-[12px] font-medium text-white/40 hover:text-white/60 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Назад к способам
              </button>

              <div className="p-5 rounded-[2rem] bg-[#8b5cf6]/5 border border-[#8b5cf6]/20 space-y-4">
                <div className="flex items-center gap-2">
                  <Ticket className="w-5 h-5 text-[#8b5cf6]" />
                  <span className="text-[13px] font-bold text-[#8b5cf6]">Оплата сертификатом</span>
                </div>

                {!appliedCert ? (
                  <div className="space-y-3">
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
                      <p className="text-[11px] text-[#f43f5e] font-medium">{certError}</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-white/30">Код</span>
                      <span className="text-[13px] font-bold text-[#8b5cf6]">{appliedCert.code}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-white/30">Номинал</span>
                      <span className="text-[13px] font-semibold text-white">{fmtCur(appliedCert.nominal)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-white/30">Баланс</span>
                      <span className="text-[13px] font-bold text-[#10b981]">{fmtCur(appliedCert.balance ?? appliedCert.nominal)}</span>
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
                              className="w-full py-3.5 rounded-2xl text-[13px] font-black uppercase tracking-widest text-white active:scale-[0.97] transition-transform disabled:opacity-30 bg-gradient-to-br from-[#a78bfa] to-[#6d28d9] shadow-xl shadow-[#8b5cf6]/30"
                            >
                              Оплатить {fmtCur(total)}
                            </button>
                          ) : (
                            <div className="space-y-3 pt-1">
                              <p className="text-[11px] text-center text-white/30">
                                Списать {fmtCur(certBal)}, остаток {fmtCur(remainder)}:
                              </p>
                              <div className="grid grid-cols-2 gap-3">
                                <button
                                  onClick={() => handleCertPay('cash')}
                                  disabled={isProcessing}
                                  className="flex flex-col items-center gap-2 p-3 bg-[#10b981]/5 border border-[#10b981]/20 rounded-[2rem] active:scale-[0.96] transition-all disabled:opacity-30"
                                >
                                  <Banknote className="w-5 h-5 text-[#10b981]" />
                                  <span className="text-[10px] font-black uppercase text-[#10b981] tracking-widest">Наличные</span>
                                </button>
                                <button
                                  onClick={() => handleCertPay('card')}
                                  disabled={isProcessing}
                                  className="flex flex-col items-center gap-2 p-3 bg-[#3b82f6]/5 border border-[#3b82f6]/20 rounded-[2rem] active:scale-[0.96] transition-all disabled:opacity-30"
                                >
                                  <CreditCard className="w-5 h-5 text-[#3b82f6]" />
                                  <span className="text-[10px] font-black uppercase text-[#3b82f6] tracking-widest">Карта</span>
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

          {screen === 'split' && (
            <>
              <button
                onClick={() => { setScreen('main'); setSplitPayments([]); setSplitAmount(''); }}
                className="flex items-center gap-1.5 text-[12px] font-medium text-white/40 hover:text-white/60 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Назад к способам
              </button>

              <div className="p-4 rounded-[2rem] bg-white/5 border border-white/10">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] text-white/30 font-bold uppercase tracking-widest">Осталось</span>
                  <span className={`text-lg font-black italic tabular-nums ${splitRemaining === 0 ? 'text-[#10b981]' : 'text-white'}`}>
                    {fmtCur(splitRemaining)}
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-black/40 overflow-hidden flex">
                  {splitPayments.map((sp, idx) => {
                    const pct = total > 0 ? (sp.amount / total) * 100 : 0;
                    return (
                      <div
                        key={idx}
                        className={`h-full transition-all duration-300 first:rounded-l-full last:rounded-r-full ${
                          sp.method === 'cash' ? 'bg-[#10b981]' : sp.method === 'card' ? 'bg-[#3b82f6]' : sp.method === 'bonus' ? 'bg-[#f59e0b]' : 'bg-[#f43f5e]'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    );
                  })}
                </div>
              </div>

              {splitPayments.length > 0 && (
                <div className="space-y-2">
                  {splitPayments.map((sp, idx) => {
                    const conf = getMethodConf(sp.method);
                    return (
                      <SwipeableRow key={idx} onDelete={() => { hapticFeedback('light'); setSplitPayments(splitPayments.filter((_, i) => i !== idx)); }}>
                        <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10">
                          <conf.icon className={`w-4 h-4 shrink-0 ${conf.color}`} />
                          <span className={`flex-1 text-[13px] font-bold ${conf.color}`}>{conf.label}</span>
                          <span className={`font-black text-[13px] tabular-nums ${conf.color}`}>{fmtCur(sp.amount)}</span>
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
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all active:scale-95 ${
                          splitMethod === mc.method
                            ? 'bg-[#8b5cf6]/10 border-[#8b5cf6]/30 text-[#8b5cf6]'
                            : 'bg-white/5 border-white/10 text-white/40'
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

                  <div className="flex gap-2">
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
                        className="flex-1 py-2 rounded-xl bg-white/5 border border-white/5 text-[10px] font-bold text-white/40 active:scale-95 transition-transform uppercase tracking-widest"
                      >
                        Всё {mc.label.toLowerCase()}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={handleSplitConfirm}
                disabled={isProcessing || splitRemaining > 0}
                className="w-full py-3.5 rounded-2xl text-[13px] font-black uppercase tracking-widest text-white active:scale-[0.97] transition-transform disabled:opacity-30 bg-gradient-to-br from-[#a78bfa] to-[#6d28d9] shadow-xl shadow-[#8b5cf6]/30"
              >
                {isProcessing ? 'Обработка...' : 'Подтвердить'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
