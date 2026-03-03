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

  const maxBonus = Math.min(playerInfo?.bonus_points || 0, total);

  return (
    <Drawer open={open} onClose={onClose} title="Оплата">
      <div className="space-y-5">
        {playerInfo && (
          <div className="p-3 rounded-xl bg-white/5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--tg-theme-hint-color,#888)]">Игрок</span>
              <span className="font-semibold text-[var(--tg-theme-text-color,#e0e0e0)]">{playerInfo.nickname}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--tg-theme-hint-color,#888)]">Баланс</span>
              <Badge variant={playerInfo.balance < 0 ? 'danger' : 'default'}>
                {playerInfo.balance}₽
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--tg-theme-hint-color,#888)]">Бонусы</span>
              <Badge variant="success">
                <Star className="w-3 h-3 mr-1" />
                {playerInfo.bonus_points}
              </Badge>
            </div>
          </div>
        )}

        <div className="text-center">
          <p className="text-sm text-[var(--tg-theme-hint-color,#888)]">К оплате</p>
          <p className="text-4xl font-bold text-[var(--tg-theme-text-color,#e0e0e0)]">
            {useBonusPartial ? Math.max(0, total - bonusAmount) : total}₽
          </p>
        </div>

        {maxBonus > 0 && (
          <div className="p-3 rounded-xl bg-emerald-500/10 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useBonusPartial}
                onChange={(e) => {
                  setUseBonusPartial(e.target.checked);
                  if (!e.target.checked) setBonusAmount(0);
                }}
                className="w-5 h-5 rounded bg-white/10 border-white/20"
              />
              <span className="text-sm text-emerald-400 font-medium">
                Списать бонусы (до {maxBonus})
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

        <div className="grid grid-cols-1 gap-3">
          <Button
            size="lg"
            fullWidth
            onClick={() => handlePay('cash')}
            disabled={isProcessing}
          >
            <Banknote className="w-5 h-5" />
            Наличные
          </Button>
          <Button
            size="lg"
            fullWidth
            variant="secondary"
            onClick={() => handlePay('card')}
            disabled={isProcessing}
          >
            <CreditCard className="w-5 h-5" />
            Карта
          </Button>
          {activeCheck?.player_id && (
            <Button
              size="lg"
              fullWidth
              variant="danger"
              onClick={() => handlePay('debt')}
              disabled={isProcessing}
            >
              <Clock className="w-5 h-5" />
              В долг
            </Button>
          )}
        </div>

        {activeCheck?.player_id && (
          <p className="text-xs text-center text-white/30">
            Бонусы будут начислены автоматически
          </p>
        )}
      </div>
    </Drawer>
  );
}
