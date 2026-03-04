import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { usePOSStore } from '@/store/pos';
import { PaymentDrawer } from './PaymentDrawer';
import { Badge } from '@/components/ui/Badge';
import { Drawer } from '@/components/ui/Drawer';
import { SwipeableRow } from '@/components/ui/SwipeableRow';
import {
  ArrowLeft, CreditCard, Plus, Zap, Minus, X,
  ShoppingBag,
  MessageSquare, Percent, Trash2, Timer, Search,
} from 'lucide-react';
import { hapticFeedback } from '@/lib/telegram';
import { supabase } from '@/lib/supabase';
import { useMenuCategories, getIconComponent, getCategoryColor } from '@/hooks/useMenuCategories';
import type { InventoryItem, Discount } from '@/types';

interface CheckViewProps {
  onBack: () => void;
}

export function CheckView({ onBack }: CheckViewProps) {
  const { activeCheck, cart, addToCart, updateCartQuantity, removeFromCart, inventory, leaveCheck, cancelCheck, getCartTotal, getDiscountTotal, updateCheckNote, saveCartToDb, appliedDiscounts, applyDiscount, removeDiscount } = usePOSStore();
  const [showPayment, setShowPayment] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showDiscounts, setShowDiscounts] = useState(false);
  const [discountsList, setDiscountsList] = useState<Discount[]>([]);
  const [menuCategory, setMenuCategory] = useState<string | null>(null);
  const [menuSearch, setMenuSearch] = useState('');
  const { categories: menuCategories } = useMenuCategories();
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

  const [rentalAmount, setRentalAmount] = useState(0);
  const [rentalMinutes, setRentalMinutes] = useState(0);

  useEffect(() => {
    if (!activeCheck?.space || !activeCheck.space.hourly_rate) return;
    const rate = activeCheck.space.hourly_rate;

    const tick = () => {
      const elapsed = (Date.now() - new Date(activeCheck.created_at).getTime()) / 60000;
      const rounded = Math.max(1, Math.ceil(elapsed / 30)) * 30;
      setRentalMinutes(Math.round(elapsed));
      setRentalAmount(Math.round((rounded / 60) * rate));
    };
    tick();
    const iv = setInterval(tick, 15000);
    return () => clearInterval(iv);
  }, [activeCheck?.space, activeCheck?.created_at]);

  const cartSubtotal = cart.reduce((s, c) => s + c.item.price * c.quantity, 0);
  const spaceRental = activeCheck?.space?.hourly_rate ? rentalAmount : 0;
  const total = getCartTotal() + spaceRental;
  const discountTotal = getDiscountTotal();
  const subtotal = cartSubtotal + spaceRental;
  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);

  const loadDiscountsList = useCallback(async () => {
    const { data } = await supabase.from('discounts').select('*').eq('is_active', true).order('name');
    if (data) setDiscountsList(data as Discount[]);
  }, []);

  const handleApplyDiscount = async (d: Discount) => {
    hapticFeedback('medium');
    await applyDiscount(d.id, d.name, d.type, d.value, 'check');
  };

  const handleApplyItemDiscount = async (d: Discount, itemId: string) => {
    hapticFeedback('medium');
    await applyDiscount(d.id, d.name, d.type, d.value, 'item', itemId);
  };

  const filteredItems = useMemo(() => {
    let items = inventory;
    if (menuCategory) items = items.filter((i) => i.category === menuCategory);
    if (menuSearch) {
      const q = menuSearch.toLowerCase();
      items = items.filter((i) => i.name.toLowerCase().includes(q));
    }
    return items.sort((a, b) => a.sort_order - b.sort_order);
  }, [inventory, menuCategory, menuSearch]);

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
    setMenuSearch('');
    setShowMenu(true);
  };

  const fmtCur = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + '₽';

  return (
    <div className="flex flex-col min-h-[calc(100vh-8rem)]">
      {/* Sticky header */}
      <div className="sticky top-0 z-20 -mx-4 px-4 py-2 bg-[var(--tg-theme-bg-color,#0f0f23)]/95 backdrop-blur-sm border-b border-white/5 mb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={handleBack}
            className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center active:scale-90 transition-transform shrink-0"
          >
            <ArrowLeft className="w-4 h-4 text-[var(--tg-theme-text-color,#e0e0e0)]" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-[13px] font-bold text-[var(--tg-theme-text-color,#e0e0e0)] truncate leading-tight">
              {activeCheck.space ? activeCheck.space.name : activeCheck.player?.nickname || 'Без клиента'}
            </h2>
            <p className="text-[10px] text-[var(--tg-theme-hint-color,#888)] leading-tight">
              {activeCheck.space && activeCheck.player && <>{activeCheck.player.nickname} · </>}
              {new Date(activeCheck.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
              {cartCount > 0 && <> · {cartCount} поз.</>}
            </p>
          </div>
          {total > 0 && (
            <span className="text-base font-black text-[var(--tg-theme-text-color,#e0e0e0)] tabular-nums shrink-0">
              {fmtCur(total)}
            </span>
          )}
          <div className="flex gap-1 shrink-0">
            <button
              onClick={() => { loadDiscountsList(); setShowDiscounts(true); }}
              className={`w-8 h-8 rounded-lg flex items-center justify-center active:scale-90 transition-transform ${
                appliedDiscounts.length > 0 ? 'bg-pink-500/10' : 'bg-white/5'
              }`}
            >
              <Percent className={`w-3.5 h-3.5 ${appliedDiscounts.length > 0 ? 'text-pink-400' : 'text-white/25'}`} />
            </button>
            <button
              onClick={() => setShowNote(!showNote)}
              className={`w-8 h-8 rounded-lg flex items-center justify-center active:scale-90 transition-transform ${
                note ? 'bg-amber-500/10' : 'bg-white/5'
              }`}
            >
              <MessageSquare className={`w-3.5 h-3.5 ${note ? 'text-amber-400' : 'text-white/25'}`} />
            </button>
            <button
              onClick={() => setShowCancelConfirm(true)}
              className="w-8 h-8 rounded-lg bg-red-500/8 flex items-center justify-center active:scale-90 transition-transform"
            >
              <X className="w-3.5 h-3.5 text-red-400" />
            </button>
          </div>
        </div>

        {/* Rental mini-bar */}
        {activeCheck.space && activeCheck.space.hourly_rate != null && (
          <div className="flex items-center justify-between mt-1.5 px-1">
            <div className="flex items-center gap-1.5 text-indigo-400/70">
              <Timer className="w-3 h-3" />
              <span className="text-[11px] tabular-nums">{Math.floor(rentalMinutes / 60)}ч {String(rentalMinutes % 60).padStart(2, '0')}м</span>
              <span className="text-white/15">·</span>
              <span className="text-[11px]">{activeCheck.space.hourly_rate}₽/ч</span>
            </div>
            <span className="text-[11px] font-bold text-indigo-400 tabular-nums">{fmtCur(rentalAmount)}</span>
          </div>
        )}
      </div>

      {/* Note */}
      {showNote && (
        <div className="mb-3 animate-fade-in">
          <textarea
            value={note}
            onChange={(e) => handleNoteChange(e.target.value)}
            placeholder="Комментарий к чеку..."
            rows={2}
            className="w-full px-3 py-2 rounded-xl bg-white/4 border border-white/6 text-sm text-[var(--tg-theme-text-color,#e0e0e0)] placeholder:text-white/15 focus:border-[var(--tg-theme-button-color,#6c5ce7)]/30 focus:outline-none resize-none transition-all"
          />
        </div>
      )}

      {/* Quick add */}
      {gameEvening && (
        <button
          onClick={() => { hapticFeedback('medium'); addToCart(gameEvening); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600/10 border border-violet-500/15 text-violet-300 text-xs font-semibold active:scale-95 transition-all mb-3 w-fit"
        >
          <Zap className="w-3 h-3" />
          Резидент
        </button>
      )}

      {/* Cart */}
      <div className="flex-1 pb-24">
        {cart.length === 0 ? (
          <div className="text-center py-16 animate-fade-in">
            <div className="w-16 h-16 rounded-2xl bg-white/3 flex items-center justify-center mx-auto mb-3">
              <ShoppingBag className="w-8 h-8 text-white/6" />
            </div>
            <p className="text-[var(--tg-theme-hint-color,#888)] text-sm font-medium">Чек пока пуст</p>
            <p className="text-xs text-white/15 mt-1 mb-5">Добавьте позиции из меню</p>
            <button
              onClick={openMenu}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--tg-theme-button-color,#6c5ce7)] text-white text-sm font-semibold active:scale-95 transition-transform shadow-lg shadow-[var(--tg-theme-button-color,#6c5ce7)]/15"
            >
              <Plus className="w-4 h-4" />
              Открыть меню
            </button>
          </div>
        ) : (
          <div className="space-y-1 stagger-children">
            {cart.map((ci) => (
              <SwipeableRow
                key={ci.item.id}
                onDelete={() => { hapticFeedback('medium'); removeFromCart(ci.item.id); }}
              >
                <div className="flex items-center gap-2.5 py-2 px-1 bg-[var(--tg-theme-bg-color,#0f0f23)]">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-[var(--tg-theme-text-color,#e0e0e0)] truncate leading-tight">
                      {ci.item.name}
                    </p>
                    <p className="text-[11px] text-white/25 mt-0.5 tabular-nums">{fmtCur(ci.item.price)}</p>
                  </div>

                  <div className="flex items-center gap-px bg-white/4 rounded-lg">
                    <button
                      onClick={() => { hapticFeedback('light'); updateCartQuantity(ci.item.id, ci.quantity - 1); }}
                      className="w-7 h-7 flex items-center justify-center active:bg-white/10 rounded-l-lg transition-colors"
                    >
                      <Minus className="w-3 h-3 text-white/50" />
                    </button>
                    <span className="w-6 text-center text-xs font-bold text-[var(--tg-theme-text-color,#e0e0e0)] tabular-nums">
                      {ci.quantity}
                    </span>
                    <button
                      onClick={() => { hapticFeedback('light'); updateCartQuantity(ci.item.id, ci.quantity + 1); }}
                      className="w-7 h-7 flex items-center justify-center active:bg-white/10 rounded-r-lg transition-colors"
                    >
                      <Plus className="w-3 h-3 text-white/50" />
                    </button>
                  </div>

                  <p className="text-[13px] font-bold text-[var(--tg-theme-text-color,#e0e0e0)] min-w-[48px] text-right tabular-nums">
                    {fmtCur(ci.item.price * ci.quantity)}
                  </p>
                </div>
              </SwipeableRow>
            ))}

            {appliedDiscounts.length > 0 && (
              <div className="space-y-0.5 mt-1">
                {appliedDiscounts.map((ad) => (
                  <div key={ad.id} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-pink-500/5">
                    <Percent className="w-3 h-3 text-pink-400/60 shrink-0" />
                    <span className="flex-1 text-[11px] text-pink-400/80 font-medium truncate">
                      {ad.discount?.name || 'Скидка'} ({ad.target === 'check' ? 'чек' : 'поз.'})
                    </span>
                    <span className="text-[11px] font-bold text-pink-400 tabular-nums">-{fmtCur(ad.discount_amount)}</span>
                    <button
                      onClick={() => { hapticFeedback('light'); removeDiscount(ad.id); }}
                      className="w-5 h-5 rounded flex items-center justify-center active:scale-90 transition-transform"
                    >
                      <Trash2 className="w-3 h-3 text-pink-400/50" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-3 mt-1 border-t border-white/5 space-y-0.5">
              {discountTotal > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-white/30">Подытог</span>
                  <span className="text-xs text-white/30 tabular-nums">{fmtCur(subtotal)}</span>
                </div>
              )}
              {discountTotal > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-pink-400/70">Скидка</span>
                  <span className="text-xs font-bold text-pink-400 tabular-nums">-{fmtCur(discountTotal)}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="fixed left-0 right-0 lg:left-60 z-30 px-4 pb-3 bottom-bar-pos">
        <div className="max-w-5xl mx-auto flex gap-2 items-center">
          <button
            onClick={openMenu}
            className="w-10 h-10 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center active:scale-90 transition-transform shrink-0"
          >
            <Plus className="w-5 h-5 text-white/40" />
          </button>
          <div className="flex-1 min-w-0">
            {cartCount > 0 && (
              <p className="text-xl font-black text-[var(--tg-theme-text-color,#e0e0e0)] tabular-nums leading-none">
                {fmtCur(total)}
              </p>
            )}
          </div>
          {cartCount > 0 && (
            <button
              onClick={() => { hapticFeedback('medium'); setShowPayment(true); }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--tg-theme-button-color,#6c5ce7)] text-white font-bold text-sm active:scale-[0.96] transition-transform shadow-lg shadow-[var(--tg-theme-button-color,#6c5ce7)]/20 animate-pop-in"
            >
              <CreditCard className="w-4 h-4" />
              Оплата
            </button>
          )}
        </div>
      </div>

      {/* Menu */}
      <Drawer
        open={showMenu}
        onClose={() => { setShowMenu(false); setMenuCategory(null); setMenuSearch(''); }}
        title="Меню"
      >
        {/* Search bar */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
          <input
            placeholder="Поиск..."
            value={menuSearch}
            onChange={(e) => setMenuSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/5 border border-white/6 text-sm text-[var(--tg-theme-text-color,#e0e0e0)] placeholder:text-white/15 focus:outline-none focus:border-[var(--tg-theme-button-color,#6c5ce7)]/25 transition-colors"
          />
        </div>

        {/* Category horizontal scroll */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none mb-3 -mx-1 px-1">
          <button
            onClick={() => setMenuCategory(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all active:scale-95 shrink-0 ${
              !menuCategory ? 'bg-[var(--tg-theme-button-color,#6c5ce7)]/15 text-[var(--tg-theme-button-color,#6c5ce7)]' : 'bg-white/5 text-white/35'
            }`}
          >
            Все
          </button>
          {menuCategories.filter((c) => (categoryCounts[c.slug] || 0) > 0).map((cat) => {
            const CatIcon = getIconComponent(cat.icon_name);
            return (
              <button
                key={cat.id}
                onClick={() => setMenuCategory(cat.slug)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all active:scale-95 shrink-0 ${
                  menuCategory === cat.slug ? 'bg-[var(--tg-theme-button-color,#6c5ce7)]/15 text-[var(--tg-theme-button-color,#6c5ce7)]' : 'bg-white/5 text-white/35'
                }`}
              >
                <CatIcon className="w-3 h-3" />
                {cat.name}
              </button>
            );
          })}
        </div>

        {/* Items grid */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 max-h-[55vh] overflow-y-auto stagger-children">
          {filteredItems.map((item) => {
            const isCritical = item.stock_quantity <= item.min_threshold && item.min_threshold > 0;
            const inCart = cart.find((c) => c.item.id === item.id);
            return (
              <button
                key={item.id}
                onClick={() => handleAdd(item)}
                className={`relative rounded-xl text-left transition-transform active:scale-[0.96] overflow-hidden ${
                  isCritical ? 'bg-red-500/6 border border-red-500/15' : 'card'
                }`}
              >
                {inCart && (
                  <div className="absolute top-1.5 right-1.5 z-10 w-5 h-5 rounded-full bg-[var(--tg-theme-button-color,#6c5ce7)] flex items-center justify-center text-[10px] font-bold text-white shadow animate-pop-in">
                    {inCart.quantity}
                  </div>
                )}
                {item.image_url && (
                  <div className="w-full aspect-[4/3] bg-white/3">
                    <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                )}
                <div className="p-2.5">
                  <p className="font-medium text-[12px] text-[var(--tg-theme-text-color,#e0e0e0)] leading-tight line-clamp-2">
                    {item.name}
                  </p>
                  <p className="text-sm font-black text-[var(--tg-theme-button-color,#6c5ce7)] mt-1 tabular-nums">
                    {fmtCur(item.price)}
                  </p>
                  {item.min_threshold > 0 && (
                    <div className="mt-1">
                      <Badge variant={isCritical ? 'danger' : 'default'} size="sm">
                        Ост: {item.stock_quantity}
                      </Badge>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </Drawer>

      <PaymentDrawer
        open={showPayment}
        onClose={() => setShowPayment(false)}
        onSuccess={() => {
          setShowPayment(false);
          onBack();
        }}
        spaceRental={spaceRental}
      />

      {/* Discounts */}
      <Drawer
        open={showDiscounts}
        onClose={() => setShowDiscounts(false)}
        title="Применить скидку"
        size="md"
      >
        <div className="space-y-3">
          {discountsList.length === 0 ? (
            <p className="text-xs text-[var(--tg-theme-hint-color,#888)] text-center py-6">Нет активных скидок</p>
          ) : (
            <>
              <p className="text-[10px] text-white/25 font-semibold uppercase tracking-wider">На весь чек</p>
              <div className="space-y-1">
                {discountsList.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => { handleApplyDiscount(d); setShowDiscounts(false); }}
                    className="w-full flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-white/5 transition-colors active:scale-[0.98]"
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${d.type === 'percentage' ? 'bg-violet-500/12' : 'bg-emerald-500/12'}`}>
                      <Percent className={`w-3.5 h-3.5 ${d.type === 'percentage' ? 'text-violet-400' : 'text-emerald-400'}`} />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-[13px] font-medium text-[var(--tg-theme-text-color,#e0e0e0)]">{d.name}</p>
                      <p className="text-[11px] text-white/25">
                        {d.type === 'percentage' ? `-${d.value}%` : `-${d.value}₽`}
                        {d.type === 'percentage' && subtotal > 0 && (
                          <> ≈ -{fmtCur(Math.round(subtotal * d.value / 100))}</>
                        )}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
              {cart.length > 0 && (
                <>
                  <p className="text-[10px] text-white/25 font-semibold uppercase tracking-wider pt-2">На позицию</p>
                  <div className="space-y-1 max-h-[30vh] overflow-y-auto">
                    {cart.map((ci) => (
                      <div key={ci.item.id} className="p-2 rounded-xl bg-white/3">
                        <p className="text-[11px] font-medium text-[var(--tg-theme-text-color,#e0e0e0)] mb-1.5">{ci.item.name} ({fmtCur(ci.item.price * ci.quantity)})</p>
                        <div className="flex gap-1 flex-wrap">
                          {discountsList.map((d) => (
                            <button
                              key={d.id}
                              onClick={() => { handleApplyItemDiscount(d, ci.item.id); setShowDiscounts(false); }}
                              className="px-2 py-1 rounded-md bg-white/5 text-[10px] font-medium text-white/40 active:scale-95 transition-transform"
                            >
                              {d.name} ({d.type === 'percentage' ? `-${d.value}%` : `-${d.value}₽`})
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </Drawer>

      {/* Cancel confirmation */}
      <Drawer open={showCancelConfirm} onClose={() => setShowCancelConfirm(false)} title="Отменить чек?" size="sm">
        <div className="space-y-3">
          <div className="p-3 rounded-xl bg-red-500/6 border border-red-500/10 text-center">
            <p className="text-[13px] text-red-400 font-semibold">Чек будет полностью удалён</p>
            {cart.length > 0 && (
              <p className="text-[11px] text-white/25 mt-1">
                {cart.length} позиций на сумму {fmtCur(total)} будут потеряны
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowCancelConfirm(false)}
              className="flex-1 py-2.5 rounded-xl bg-white/5 text-[13px] font-semibold text-[var(--tg-theme-text-color,#e0e0e0)] active:scale-[0.97] transition-transform"
            >
              Нет
            </button>
            <button
              onClick={handleCancel}
              className="flex-1 py-2.5 rounded-xl bg-red-500/12 text-[13px] font-semibold text-red-400 active:scale-[0.97] transition-transform border border-red-500/8"
            >
              Да, отменить
            </button>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
