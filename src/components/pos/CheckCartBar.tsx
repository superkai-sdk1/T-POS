import { usePOSStore } from '@/store/pos';
import { CreditCard, Plus, UserPlus } from 'lucide-react';
import { hapticFeedback } from '@/lib/telegram';

const fmtCur = (n: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + '₽';

/** Inline cart summary bar for desktop split view — total + actions, not floating. */
export function CheckCartBar() {
  const cart = usePOSStore((s) => s.cart);
  const getCartTotal = usePOSStore((s) => s.getCartTotal);
  const total = getCartTotal();
  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);

  return (
    <div className="shrink-0 p-2 lg:p-0 lg:rounded-none lg:border-0 lg:bg-transparent flex items-center justify-between gap-3">
      <div className="flex gap-2">
        <button
          onClick={() => {
            hapticFeedback('light');
            window.dispatchEvent(new CustomEvent('tpos:open-menu'));
          }}
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-white/40 hover:text-white active:scale-90 transition-all"
        >
          <Plus className="w-5 h-5" />
        </button>
        <button
          onClick={() => {
            hapticFeedback('light');
            window.dispatchEvent(new CustomEvent('tpos:open-add-player'));
          }}
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-[#10b981] active:scale-90 transition-all"
          title="Добавить игрока"
        >
          <UserPlus className="w-5 h-5" />
        </button>
      </div>
      <div className="flex items-baseline gap-2">
        {cartCount > 0 && (
          <span className="text-xl font-black italic text-white tabular-nums">{fmtCur(total)}</span>
        )}
      </div>
      {cartCount > 0 && (
        <button
          onClick={() => {
            hapticFeedback('medium');
            window.dispatchEvent(new CustomEvent('tpos:open-payment'));
          }}
          className="flex-1 max-w-[140px] py-2.5 rounded-xl flex items-center justify-center gap-2 bg-gradient-to-br from-[#a78bfa] to-[#6d28d9] font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all text-white shadow-lg shadow-[#8b5cf6]/20"
        >
          <CreditCard className="w-4 h-4" /> Оплата
        </button>
      )}
    </div>
  );
}
