import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { usePOSStore } from '@/store/pos';
import { PaymentDrawer } from './PaymentDrawer';
import { Badge } from '@/components/ui/Badge';
import { Drawer } from '@/components/ui/Drawer';
import { SwipeableRow } from '@/components/ui/SwipeableRow';
import {
  ArrowLeft, CreditCard, Plus, Zap, Minus, X,
  Coffee, UtensilsCrossed, Cookie, Wind, Ticket, ShoppingBag,
  MessageSquare,
} from 'lucide-react';
import { hapticFeedback } from '@/lib/telegram';
import type { ItemCategory, InventoryItem } from '@/types';

interface CheckViewProps {
  onBack: () => void;
}

const categoryConfig: { key: ItemCategory; label: string; icon: typeof Coffee; color: string }[] = [
  { key: 'services', label: 'Услуги', icon: Ticket, color: 'from-violet-600/30 to-purple-600/10 border-violet-500/25' },
  { key: 'drinks', label: 'Напитки', icon: Coffee, color: 'from-blue-600/30 to-cyan-600/10 border-blue-500/25' },
  { key: 'food', label: 'Еда', icon: UtensilsCrossed, color: 'from-orange-600/30 to-amber-600/10 border-orange-500/25' },
  { key: 'bar', label: 'Снеки', icon: Cookie, color: 'from-emerald-600/30 to-green-600/10 border-emerald-500/25' },
  { key: 'hookah', label: 'Кальяны', icon: Wind, color: 'from-pink-600/30 to-rose-600/10 border-pink-500/25' },
];

export function CheckView({ onBack }: CheckViewProps) {
  const { activeCheck, cart, addToCart, updateCartQuantity, removeFromCart, inventory, leaveCheck, cancelCheck, getCartTotal, updateCheckNote, saveCartToDb } = usePOSStore();
  const [showPayment, setShowPayment] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [menuCategory, setMenuCategory] = useState<ItemCategory | null>(null);
  const [note, setNote] = useState(activeCheck?.note || '');
  const [showNote, setShowNote] = useState(false);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cartSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingNoteRef = useRef<string | null>(null);

  useEffect(() => {
    setNote(activeCheck?.note || '');
  }, [activeCheck?.id, activeCheck?.note]);

  const debouncedSaveCart = useCallback(() => {
    if (cartSaveTimer.current) clearTimeout(cartSaveTimer.current);
    cartSaveTimer.current = setTimeout(() => {
      saveCartToDb();
    }, 1500);
  }, [saveCartToDb]);

  useEffect(() => {
    if (activeCheck && cart.length > 0) {
      debouncedSaveCart();
    }
    return () => {
      if (cartSaveTimer.current) clearTimeout(cartSaveTimer.current);
    };
  }, [cart, activeCheck, debouncedSaveCart]);

  useEffect(() => {
    return () => {
      if (noteTimer.current) clearTimeout(noteTimer.current);
      if (cartSaveTimer.current) clearTimeout(cartSaveTimer.current);
      if (pendingNoteRef.current !== null) {
        updateCheckNote(pendingNoteRef.current);
      }
      saveCartToDb();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNoteChange = (val: string) => {
    setNote(val);
    pendingNoteRef.current = val;
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => {
      updateCheckNote(val);
      pendingNoteRef.current = null;
    }, 800);
  };

  const total = getCartTotal();
  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);

  const filteredItems = useMemo(() => {
    if (!menuCategory) return [];
    return inventory.filter((i) => i.category === menuCategory);
  }, [inventory, menuCategory]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of inventory) {
      counts[item.category] = (counts[item.category] || 0) + 1;
    }
    return counts;
  }, [inventory]);

  if (!activeCheck) return null;

  const handleAdd = (item: InventoryItem) => {
    hapticFeedback('light');
    addToCart(item);
  };

  const handleBack = async () => {
    if (noteTimer.current) clearTimeout(noteTimer.current);
    if (pendingNoteRef.current !== null) {
      await updateCheckNote(pendingNoteRef.current);
      pendingNoteRef.current = null;
    }
    if (cartSaveTimer.current) clearTimeout(cartSaveTimer.current);
    await leaveCheck();
    onBack();
  };

  const handleCancel = async () => {
    const ok = await cancelCheck();
    if (ok) {
      hapticFeedback('medium');
      setShowCancelConfirm(false);
      onBack();
    }
  };

  const gameEvening = inventory.find((i) => i.name === 'Игровой вечер Резидент');

  const openMenu = () => {
    setMenuCategory(null);
    setShowMenu(true);
  };

  const fmtCur = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + '₽';

  return (
    <div className="flex flex-col min-h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-4">
        <button
          onClick={handleBack}
          className="w-10 h-10 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center hover:bg-white/10 transition-all active:scale-90 shrink-0"
        >
          <ArrowLeft className="w-5 h-5 text-[var(--tg-theme-text-color,#e0e0e0)]" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-[var(--tg-theme-text-color,#e0e0e0)] truncate leading-tight">
            {activeCheck.player?.nickname || 'Без клиента'}
          </h2>
          <p className="text-[11px] text-[var(--tg-theme-hint-color,#888)]">
            {new Date(activeCheck.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
            {cartCount > 0 && <> · {cartCount} поз.</>}
          </p>
        </div>
        <button
          onClick={() => setShowNote(!showNote)}
          className={`w-9 h-9 rounded-xl flex items-center justify-center active:scale-90 transition-all shrink-0 ${
            note ? 'bg-amber-500/12 border border-amber-500/25' : 'bg-white/5 border border-white/5'
          }`}
        >
          <MessageSquare className={`w-4 h-4 ${note ? 'text-amber-400' : 'text-white/30'}`} />
        </button>
        <button
          onClick={() => setShowCancelConfirm(true)}
          className="w-9 h-9 rounded-xl bg-red-500/8 border border-red-500/10 flex items-center justify-center active:scale-90 transition-all shrink-0"
        >
          <X className="w-4 h-4 text-red-400" />
        </button>
        {gameEvening && (
          <button
            onClick={() => { hapticFeedback('medium'); addToCart(gameEvening); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-600/15 border border-violet-500/25 text-violet-300 text-xs font-semibold active:scale-95 transition-all shrink-0"
          >
            <Zap className="w-3.5 h-3.5" />
            Резидент
          </button>
        )}
      </div>

      {/* Note */}
      {showNote && (
        <div className="mb-3 animate-fade-in-up">
          <textarea
            value={note}
            onChange={(e) => handleNoteChange(e.target.value)}
            placeholder="Комментарий к чеку..."
            rows={2}
            className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/8 text-sm text-[var(--tg-theme-text-color,#e0e0e0)] placeholder:text-white/20 focus:border-[var(--tg-theme-button-color,#6c5ce7)]/40 focus:outline-none resize-none transition-all"
          />
        </div>
      )}

      {/* Cart */}
      <div className="flex-1 pb-28">
        {cart.length === 0 ? (
          <div className="text-center py-16 animate-fade-in">
            <div className="w-20 h-20 rounded-3xl bg-white/3 flex items-center justify-center mx-auto mb-4">
              <ShoppingBag className="w-10 h-10 text-white/8" />
            </div>
            <p className="text-[var(--tg-theme-hint-color,#888)] font-medium">Чек пока пуст</p>
            <p className="text-sm text-white/20 mt-1 mb-6">Добавьте позиции из меню</p>
            <button
              onClick={openMenu}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-[var(--tg-theme-button-color,#6c5ce7)] text-white font-semibold active:scale-95 transition-all shadow-lg shadow-[var(--tg-theme-button-color,#6c5ce7)]/20"
            >
              <Plus className="w-5 h-5" />
              Открыть меню
            </button>
          </div>
        ) : (
          <div className="space-y-1.5 stagger-children">
            {cart.map((ci) => (
              <SwipeableRow
                key={ci.item.id}
                onDelete={() => { hapticFeedback('medium'); removeFromCart(ci.item.id); }}
              >
                <div className="flex items-center gap-3 p-3 bg-[var(--tg-theme-bg-color,#0f0f23)] rounded-xl glass">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--tg-theme-text-color,#e0e0e0)] truncate leading-tight">
                      {ci.item.name}
                    </p>
                    <p className="text-[11px] text-[var(--tg-theme-hint-color,#888)] mt-0.5">
                      {fmtCur(ci.item.price)}
                    </p>
                  </div>

                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => { hapticFeedback('light'); updateCartQuantity(ci.item.id, ci.quantity - 1); }}
                      className="w-8 h-8 rounded-lg bg-white/8 flex items-center justify-center active:scale-85 transition-transform"
                    >
                      <Minus className="w-3.5 h-3.5 text-white/60" />
                    </button>
                    <span className="w-8 text-center text-sm font-bold text-[var(--tg-theme-text-color,#e0e0e0)] tabular-nums">
                      {ci.quantity}
                    </span>
                    <button
                      onClick={() => { hapticFeedback('light'); updateCartQuantity(ci.item.id, ci.quantity + 1); }}
                      className="w-8 h-8 rounded-lg bg-white/8 flex items-center justify-center active:scale-85 transition-transform"
                    >
                      <Plus className="w-3.5 h-3.5 text-white/60" />
                    </button>
                  </div>

                  <p className="text-sm font-bold text-[var(--tg-theme-text-color,#e0e0e0)] min-w-[50px] text-right tabular-nums">
                    {fmtCur(ci.item.price * ci.quantity)}
                  </p>
                </div>
              </SwipeableRow>
            ))}

            {/* Total */}
            <div className="flex items-center justify-between pt-3 mt-1 border-t border-white/8">
              <span className="text-[var(--tg-theme-hint-color,#888)] font-semibold text-sm">Итого</span>
              <span className="text-2xl font-black text-[var(--tg-theme-text-color,#e0e0e0)] tabular-nums animate-count-up">
                {fmtCur(total)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="fixed left-0 right-0 lg:left-64 z-30 px-4 pb-3 bottom-bar-pos">
        <div className="max-w-5xl mx-auto flex gap-2">
          <button
            onClick={openMenu}
            className="flex items-center gap-2 px-4 py-3 rounded-2xl glass hover:bg-white/10 transition-all active:scale-[0.97] flex-1 font-semibold text-[var(--tg-theme-text-color,#e0e0e0)]"
          >
            <Plus className="w-5 h-5 text-white/50" />
            Добавить
          </button>
          {cartCount > 0 && (
            <button
              onClick={() => { hapticFeedback('medium'); setShowPayment(true); }}
              className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-[var(--tg-theme-button-color,#6c5ce7)] text-white font-bold active:scale-[0.97] transition-all shadow-lg shadow-[var(--tg-theme-button-color,#6c5ce7)]/25 animate-pop-in"
            >
              <CreditCard className="w-5 h-5" />
              <span className="tabular-nums">{fmtCur(total)}</span>
            </button>
          )}
        </div>
      </div>

      {/* Menu */}
      <Drawer
        open={showMenu}
        onClose={() => { setShowMenu(false); setMenuCategory(null); }}
        title={menuCategory ? categoryConfig.find((c) => c.key === menuCategory)?.label || 'Меню' : 'Меню'}
      >
        {menuCategory === null ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 stagger-children">
            {categoryConfig.map((cat) => {
              const count = categoryCounts[cat.key] || 0;
              if (count === 0) return null;
              return (
                <button
                  key={cat.key}
                  onClick={() => { hapticFeedback('light'); setMenuCategory(cat.key); }}
                  className={`p-4 rounded-2xl bg-gradient-to-br ${cat.color} border text-left transition-all active:scale-[0.95] flex flex-col gap-3`}
                >
                  <cat.icon className="w-6 h-6 text-white/70" />
                  <div>
                    <p className="font-bold text-sm text-[var(--tg-theme-text-color,#e0e0e0)]">{cat.label}</p>
                    <p className="text-[11px] text-white/35">{count} поз.</p>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={() => setMenuCategory(null)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-xs font-medium text-[var(--tg-theme-hint-color,#888)]"
              >
                <ArrowLeft className="w-3 h-3" />
                Назад
              </button>
              <div className="flex gap-1.5 ml-auto overflow-x-auto scrollbar-none">
                {categoryConfig.filter((c) => c.key !== menuCategory && (categoryCounts[c.key] || 0) > 0).map((cat) => (
                  <button
                    key={cat.key}
                    onClick={() => setMenuCategory(cat.key)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors shrink-0 text-xs text-white/50"
                  >
                    <cat.icon className="w-3 h-3" />
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 max-h-[55vh] overflow-y-auto stagger-children">
              {filteredItems.sort((a, b) => a.sort_order - b.sort_order).map((item) => {
                const isCritical = item.stock_quantity <= item.min_threshold && item.min_threshold > 0;
                const inCart = cart.find((c) => c.item.id === item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => handleAdd(item)}
                    className={`relative rounded-2xl text-left transition-all active:scale-[0.95] overflow-hidden ${
                      isCritical
                        ? 'bg-red-500/8 border border-red-500/20'
                        : 'glass hover:bg-white/8'
                    }`}
                  >
                    {inCart && (
                      <div className="absolute top-1.5 right-1.5 z-10 w-6 h-6 rounded-full bg-[var(--tg-theme-button-color,#6c5ce7)] flex items-center justify-center text-xs font-bold text-white shadow-lg animate-pop-in">
                        {inCart.quantity}
                      </div>
                    )}
                    {item.image_url ? (
                      <div className="w-full aspect-[4/3] bg-white/3">
                        <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                      </div>
                    ) : null}
                    <div className="p-3">
                      <p className="font-medium text-sm text-[var(--tg-theme-text-color,#e0e0e0)] leading-tight">
                        {item.name}
                      </p>
                      <p className="text-base font-black text-[var(--tg-theme-button-color,#6c5ce7)] mt-1 tabular-nums">
                        {fmtCur(item.price)}
                      </p>
                      {item.min_threshold > 0 && (
                        <div className="mt-1.5">
                          <Badge variant={isCritical ? 'danger' : 'default'}>
                            Ост: {item.stock_quantity}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </Drawer>

      {/* Payment */}
      <PaymentDrawer
        open={showPayment}
        onClose={() => setShowPayment(false)}
        onSuccess={() => {
          setShowPayment(false);
          onBack();
        }}
      />

      {/* Cancel confirmation */}
      <Drawer
        open={showCancelConfirm}
        onClose={() => setShowCancelConfirm(false)}
        title="Отменить чек?"
      >
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-red-500/8 border border-red-500/15 text-center">
            <p className="text-sm text-red-400 font-semibold">
              Чек будет полностью удалён
            </p>
            {cart.length > 0 && (
              <p className="text-xs text-white/35 mt-1">
                {cart.length} позиций на сумму {fmtCur(total)} будут потеряны
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowCancelConfirm(false)}
              className="flex-1 py-3 rounded-xl bg-white/5 text-sm font-semibold text-[var(--tg-theme-text-color,#e0e0e0)] active:scale-[0.97] transition-all"
            >
              Нет
            </button>
            <button
              onClick={handleCancel}
              className="flex-1 py-3 rounded-xl bg-red-500/15 text-sm font-semibold text-red-400 active:scale-[0.97] transition-all border border-red-500/10"
            >
              Да, отменить
            </button>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
