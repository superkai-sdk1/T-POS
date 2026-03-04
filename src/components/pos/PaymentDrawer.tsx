import { useState, useEffect } from 'react';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { usePOSStore } from '@/store/pos';
import { supabase } from '@/lib/supabase';
import { hapticNotification } from '@/lib/telegram';
import { Banknote, CreditCard, Clock, Star } from 'lucide-react';
import type { PaymentMethod, Profile } from '@/types';

interface PaymentDrawerProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function PaymentDrawer({ open, onClose, onSuccess }: PaymentDrawerProps) {
  const { activeCheck, getCartTotal, closeCheck } = usePOSStore();
  const [isProcessing, setIsProcessing] = useState(false);
  const [bonusAmount, setBonusAmount] = useState(0);
  const [playerInfo, setPlayerInfo] = useState<Profile | null>(null);
  const [useBonusPartial, setUseBonusPartial] = useState(false);
  const total = getCartTotal();

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
      setBonusAmount(0);
      setUseBonusPartial(false);
      setIsProcessing(false);
    }
  }, [open, activeCheck]);

  const handlePay = async (method: PaymentMethod) => {
    setIsProcessing(true);
    const finalBonusUsed = useBonusPartial ? bonusAmount : 0;
    const success = await closeCheck(method, finalBonusUsed);
    setIsProcessing(false);
    if (success) {
      hapticNotification('success');
      onSuccess();
    }
  };

  const handlePayBonus = async () => {
    setIsProcessing(true);
    const success = await closeCheck('bonus', maxBonus);
    setIsProcessing(false);
    if (success) {
      hapticNotification('success');
      onSuccess();
    }
  };

  const maxBonus = Math.min(playerInfo?.bonus_points || 0, Math.floor(total * 0.5));
  const displayTotal = useBonusPartial ? Math.max(0, total - bonusAmount) : total;

  const fmtCur = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + '₽';

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
              <Badge variant={playerInfo.balance < 0 ? 'danger' : 'default'}>
                {playerInfo.balance}₽
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--tg-theme-hint-color,#888)] font-medium">Бонусы</span>
              <Badge variant="success">
                <Star className="w-3 h-3 mr-1" />
                {playerInfo.bonus_points}
              </Badge>
            </div>
          </div>
        )}

        <div className="text-center py-2">
          <p className="text-xs text-[var(--tg-theme-hint-color,#888)] font-medium mb-1">К оплате</p>
          <p className="text-4xl font-black text-[var(--tg-theme-text-color,#e0e0e0)] tabular-nums animate-count-up">
            {fmtCur(displayTotal)}
          </p>
          {useBonusPartial && bonusAmount > 0 && (
            <p className="text-xs text-emerald-400 mt-1 font-semibold animate-fade-in">
              -{fmtCur(bonusAmount)} бонусами
            </p>
          )}
        </div>

        {maxBonus > 0 && (
          <div className="p-3.5 rounded-2xl bg-emerald-500/6 border border-emerald-500/12 space-y-3">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <div className={`w-5 h-5 rounded-md border-2 transition-all flex items-center justify-center ${
                useBonusPartial ? 'bg-emerald-500 border-emerald-500' : 'border-white/20 bg-white/5'
              }`}>
                {useBonusPartial && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <input
                type="checkbox"
                checked={useBonusPartial}
                onChange={(e) => {
                  setUseBonusPartial(e.target.checked);
                  if (!e.target.checked) setBonusAmount(0);
                }}
                className="hidden"
              />
              <span className="text-sm text-emerald-400 font-semibold">
                Списать бонусы (макс {maxBonus}, до 50%)
              </span>
            </label>
            {useBonusPartial && (
              <Input
                type="number"
                min={0}
                max={maxBonus}
                value={bonusAmount}
                onChange={(e) => setBonusAmount(Math.min(Number(e.target.value), maxBonus))}
                placeholder={`Макс: ${maxBonus}`}
              />
            )}
          </div>
        )}

        <div className="space-y-2.5">
          <Button
            size="lg"
            fullWidth
            onClick={() => handlePay('cash')}
            loading={isProcessing}
            disabled={isProcessing}
          >
            <Banknote className="w-5 h-5" />
            Наличные {useBonusPartial && bonusAmount > 0 ? fmtCur(displayTotal) : ''}
          </Button>
          <Button
            size="lg"
            fullWidth
            variant="secondary"
            onClick={() => handlePay('card')}
            loading={isProcessing}
            disabled={isProcessing}
          >
            <CreditCard className="w-5 h-5" />
            Карта {useBonusPartial && bonusAmount > 0 ? fmtCur(displayTotal) : ''}
          </Button>
          {activeCheck?.player_id && maxBonus > 0 && (
            <Button
              size="lg"
              fullWidth
              variant="secondary"
              onClick={handlePayBonus}
              loading={isProcessing}
              disabled={isProcessing}
              className="!bg-amber-500/10 !border-amber-500/20 !text-amber-400 hover:!bg-amber-500/20"
            >
              <Star className="w-5 h-5" />
              Бонусы -{fmtCur(maxBonus)} (ост. {fmtCur(total - maxBonus)})
            </Button>
          )}
          {activeCheck?.player_id && (
            <Button
              size="lg"
              fullWidth
              variant="danger"
              onClick={() => handlePay('debt')}
              loading={isProcessing}
              disabled={isProcessing}
            >
              <Clock className="w-5 h-5" />
              В долг
            </Button>
          )}
        </div>

        {activeCheck?.player_id && (
          <p className="text-[11px] text-center text-white/25 font-medium">
            Бонусы будут начислены автоматически
          </p>
        )}
      </div>
    </Drawer>
  );
}
