import { usePOSStore } from '@/store/pos';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { hapticFeedback } from '@/lib/telegram';

export function Cart() {
  const cart = usePOSStore((s) => s.cart);
  const updateCartQuantity = usePOSStore((s) => s.updateCartQuantity);
  const removeFromCart = usePOSStore((s) => s.removeFromCart);
  const getCartTotal = usePOSStore((s) => s.getCartTotal);
  const total = getCartTotal();

  if (cart.length === 0) {
    return (
      <div className="text-center py-10">
        <p className="text-[var(--tg-theme-hint-color,#888)]">Корзина пуста</p>
        <p className="text-white/30 text-xs mt-1">Выберите товары из меню</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="space-y-2">
        {cart.map((cartItem) => (
          <div
            key={cartItem.item.id}
            className="flex items-center gap-3 p-3 rounded-xl bg-white/5"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--tg-theme-text-color,#e0e0e0)] truncate">
                {cartItem.item.name}
              </p>
              <p className="text-xs text-[var(--tg-theme-hint-color,#888)]">
                {cartItem.item.price}₽ × {cartItem.quantity}
              </p>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  hapticFeedback('light');
                  updateCartQuantity(cartItem.item.id, cartItem.quantity - 1);
                }}
                className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors active:scale-90"
              >
                <Minus className="w-4 h-4 text-white/70" />
              </button>
              <span className="w-8 text-center text-sm font-bold text-[var(--tg-theme-text-color,#e0e0e0)]">
                {cartItem.quantity}
              </span>
              <button
                onClick={() => {
                  hapticFeedback('light');
                  updateCartQuantity(cartItem.item.id, cartItem.quantity + 1);
                }}
                className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors active:scale-90"
              >
                <Plus className="w-4 h-4 text-white/70" />
              </button>
            </div>

            <p className="text-sm font-bold text-[var(--tg-theme-text-color,#e0e0e0)] min-w-[55px] text-right">
              {cartItem.item.price * cartItem.quantity}₽
            </p>

            <button
              onClick={() => {
                hapticFeedback('medium');
                removeFromCart(cartItem.item.id);
              }}
              className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center hover:bg-red-500/20 transition-colors active:scale-90"
            >
              <Trash2 className="w-4 h-4 text-red-400" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-white/10">
        <span className="text-[var(--tg-theme-hint-color,#888)] font-medium">Итого:</span>
        <span className="text-3xl font-bold text-[var(--tg-theme-text-color,#e0e0e0)]">
          {total}₽
        </span>
      </div>
    </div>
  );
}
