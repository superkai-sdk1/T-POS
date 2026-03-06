import { usePOSStore } from '@/store/pos';
import { Minus, Plus } from 'lucide-react';
import { hapticFeedback } from '@/lib/telegram';
import { CartSwipeableRow } from '@/components/ui/CartSwipeableRow';

const fmtCur = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + '₽';

export function Cart() {
  const cart = usePOSStore((s) => s.cart);
  const updateCartQuantity = usePOSStore((s) => s.updateCartQuantity);
  const removeFromCart = usePOSStore((s) => s.removeFromCart);
  const getCartTotal = usePOSStore((s) => s.getCartTotal);
  const total = getCartTotal();

  if (cart.length === 0) {
    return (
      <div className="text-center py-10">
        <p className="text-[var(--c-hint)]">Корзина пуста</p>
        <p className="text-[var(--c-hint)] text-xs mt-1">Выберите товары из меню</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="space-y-2">
        {cart.map((cartItem) => (
          <CartSwipeableRow
            key={cartItem.item.id}
            quantity={cartItem.quantity}
            onIncrement={() => updateCartQuantity(cartItem.item.id, cartItem.quantity + 1)}
            onDecrement={() => updateCartQuantity(cartItem.item.id, Math.max(1, cartItem.quantity - 1))}
            onRemove={() => removeFromCart(cartItem.item.id)}
          >
            <div className="flex items-center gap-3 p-3 bg-[var(--c-surface)]">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--c-text)] truncate">
                  {cartItem.item.name}
                </p>
                <p className="text-xs text-[var(--c-hint)]">
                  {fmtCur(cartItem.item.price)} × {cartItem.quantity}
                </p>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => {
                    hapticFeedback('light');
                    updateCartQuantity(cartItem.item.id, cartItem.quantity - 1);
                  }}
                  className="w-9 h-9 rounded-lg bg-[var(--c-bg)] flex items-center justify-center hover:bg-[var(--c-surface-hover)] transition-colors active:scale-90 shrink-0"
                >
                  <Minus className="w-4 h-4 text-[var(--c-text)]" />
                </button>
                <span className="w-8 text-center text-sm font-bold text-[var(--c-text)] shrink-0">
                  {cartItem.quantity}
                </span>
                <button
                  onClick={() => {
                    hapticFeedback('light');
                    updateCartQuantity(cartItem.item.id, cartItem.quantity + 1);
                  }}
                  className="w-9 h-9 rounded-lg bg-[var(--c-bg)] flex items-center justify-center hover:bg-[var(--c-surface-hover)] transition-colors active:scale-90 shrink-0"
                >
                  <Plus className="w-4 h-4 text-[var(--c-text)]" />
                </button>
              </div>

              <p className="text-sm font-bold text-[var(--c-text)] min-w-[55px] text-right shrink-0 tabular-nums">
                {fmtCur(cartItem.item.price * cartItem.quantity)}
              </p>
            </div>
          </CartSwipeableRow>
        ))}
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-[var(--c-border)]">
        <span className="text-[var(--c-hint)] font-medium">Итого:</span>
        <span className="text-3xl font-bold text-[var(--c-text)]">
          {total}₽
        </span>
      </div>
    </div>
  );
}
