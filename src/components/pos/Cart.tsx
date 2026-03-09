import { usePOSStore } from '@/store/pos';
import { Minus, Plus } from 'lucide-react';
import { hapticFeedback } from '@/lib/telegram';
import { CartSwipeableRow } from '@/components/ui/CartSwipeableRow';

const fmtCur = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + '₽';

export function Cart() {
  const cart = usePOSStore((s) => s.cart);
  const updateCartQuantity = usePOSStore((s) => s.updateCartQuantity);
  const removeFromCart = usePOSStore((s) => s.removeFromCart);
  const appliedDiscounts = usePOSStore((s) => s.appliedDiscounts);
  const getCartTotal = usePOSStore((s) => s.getCartTotal);
  const total = getCartTotal();
  void appliedDiscounts;

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
        {cart.map((cartItem) => {
          const modKey = (cartItem.modifiers || []).map((m) => m.id).sort().join(',');
          const cartKey = cartItem.item.id + (modKey ? ':' + modKey : '');
          const modPrice = (cartItem.modifiers || []).reduce((s, m) => s + m.price, 0);
          const unitPrice = cartItem.item.price + modPrice;
          return (
          <CartSwipeableRow
            key={cartKey}
            quantity={cartItem.quantity}
            onIncrement={() => updateCartQuantity(cartItem.item.id, cartItem.quantity + 1, modKey)}
            onDecrement={() => updateCartQuantity(cartItem.item.id, Math.max(1, cartItem.quantity - 1), modKey)}
            onRemove={() => removeFromCart(cartItem.item.id, modKey)}
          >
            <div className="flex items-center gap-3 p-3 bg-[var(--c-surface)]">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--c-text)] truncate">
                  {cartItem.item.name}
                </p>
                <p className="text-xs text-[var(--c-hint)]">
                  {fmtCur(unitPrice)} × {cartItem.quantity}
                </p>
                {cartItem.modifiers && cartItem.modifiers.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {cartItem.modifiers.map((m, idx) => (
                      <span key={idx} className="text-[10px] px-1.5 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400">
                        {m.name}{m.price > 0 ? ` +${m.price}₽` : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => {
                    hapticFeedback('light');
                    updateCartQuantity(cartItem.item.id, cartItem.quantity - 1, modKey);
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
                    updateCartQuantity(cartItem.item.id, cartItem.quantity + 1, modKey);
                  }}
                  className="w-9 h-9 rounded-lg bg-[var(--c-bg)] flex items-center justify-center hover:bg-[var(--c-surface-hover)] transition-colors active:scale-90 shrink-0"
                >
                  <Plus className="w-4 h-4 text-[var(--c-text)]" />
                </button>
              </div>

              <p className="text-sm font-bold text-[var(--c-text)] min-w-[55px] text-right shrink-0 tabular-nums">
                {fmtCur(unitPrice * cartItem.quantity)}
              </p>
            </div>
          </CartSwipeableRow>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-[var(--c-border)]">
        <span className="text-[var(--c-hint)] font-medium">Итого:</span>
        <span className="text-3xl font-bold text-[var(--c-text)]">
          {fmtCur(total)}
        </span>
      </div>
    </div>
  );
}
