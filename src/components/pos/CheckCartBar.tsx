import { useEffect, useState } from 'react';
import { usePOSStore } from '@/store/pos';
import { supabase } from '@/lib/supabase';
import { CreditCard, Plus } from 'lucide-react';
import { hapticFeedback } from '@/lib/telegram';

const fmtCur = (n: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + '₽';

/** Inline cart summary bar for desktop split view — total + actions, not floating. */
export function CheckCartBar() {
  const cart = usePOSStore((s) => s.cart);
  const getCartTotal = usePOSStore((s) => s.getCartTotal);
  const activeCheck = usePOSStore((s) => s.activeCheck);
  const spaceRentalAmount = usePOSStore((s) => s.spaceRentalAmount);
  const [hasEvent, setHasEvent] = useState(false);
  const [eventAmount, setEventAmount] = useState(0);

  const total = getCartTotal() + (hasEvent ? eventAmount : 0) + spaceRentalAmount;
  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);
  const hasRental = spaceRentalAmount > 0;

  useEffect(() => {
    let cancelled = false;
    const loadEvent = async () => {
      if (!activeCheck?.id) {
        if (!cancelled) {
          setHasEvent(false);
          setEventAmount(0);
        }
        return;
      }
      const { data, error } = await supabase
        .from('events')
        .select('id, fixed_amount')
        .eq('check_id', activeCheck.id)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setHasEvent(false);
        setEventAmount(0);
      } else {
        setHasEvent(true);
        setEventAmount((data as { fixed_amount: number | null }).fixed_amount || 0);
      }
    };
    loadEvent();
    return () => {
      cancelled = true;
    };
  }, [activeCheck?.id]);

  return (
    <div className="shrink-0 p-4 rounded-2xl border border-white/12 bg-white/6 backdrop-blur-xl flex items-center justify-between gap-3 w-full max-w-md mx-auto">
      <div className="flex items-baseline gap-3">
        {(cartCount > 0 || (hasEvent && eventAmount > 0) || hasRental) && (
          <span className="text-xl font-black italic text-white tabular-nums">{fmtCur(total)}</span>
        )}
      </div>
      {(cartCount > 0 || (hasEvent && eventAmount > 0) || hasRental) && (
        <button
          onClick={() => {
            hapticFeedback('medium');
            window.dispatchEvent(new CustomEvent('tpos:open-payment'));
          }}
          className="flex-1 max-w-[140px] py-2.5 rounded-xl flex items-center justify-center gap-3 bg-gradient-to-br from-[#a78bfa] to-[#6d28d9] font-black uppercase text-xs tracking-widest active:scale-95 transition-all text-white shadow-lg shadow-[#8b5cf6]/20 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--c-accent)]/20"
        >
          <CreditCard className="w-4 h-4" /> Оплата
        </button>
      )}
    </div>
  );
}
