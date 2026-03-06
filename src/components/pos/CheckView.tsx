import { useState, useMemo, useEffect, useRef, useCallback, memo, startTransition } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { usePOSStore } from '@/store/pos';
import { PaymentDrawer } from './PaymentDrawer';
import { Badge } from '@/components/ui/Badge';
import { Drawer } from '@/components/ui/Drawer';
import { SwipeableRow } from '@/components/ui/SwipeableRow';
import {
  ArrowLeft, CreditCard, Plus, Minus, X,
  ShoppingBag,
  MessageSquare, Percent, Trash2, Timer, Search,
  UserPlus, User, Star, GraduationCap, Gamepad2,
} from 'lucide-react';
import { hapticFeedback } from '@/lib/telegram';
import { supabase } from '@/lib/supabase';
import { useMenuCategories, getIconComponent, getCategoryColor } from '@/hooks/useMenuCategories';
import { useSwipeBack } from '@/hooks/useSwipeBack';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import type { InventoryItem, Discount, Profile, VisitTariff, ClientTier, Modifier } from '@/types';

const VISIT_ITEMS: Record<VisitTariff, { label: string; price: number; dbName: string }> = {
  regular: { label: 'Гость', price: 700, dbName: 'Игровой вечер Гость' },
  resident: { label: 'Резидент', price: 500, dbName: 'Игровой вечер Резидент' },
  student: { label: 'Студент', price: 300, dbName: 'Игровой вечер Студент' },
  single_game: { label: 'Одна игра', price: 150, dbName: 'Игровой вечер Одна игра' },
};

function tierToTariff(tier: ClientTier | undefined): VisitTariff {
  if (tier === 'resident') return 'resident';
  if (tier === 'student') return 'student';
  return 'regular';
}

const fmtCur = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + '₽';

const MenuItem = memo(function MenuItem({
  item,
  inCartQty,
  onAdd,
}: {
  item: InventoryItem;
  inCartQty: number;
  onAdd: (item: InventoryItem) => void;
}) {
  const isCritical = item.stock_quantity <= item.min_threshold && item.min_threshold > 0;
  return (
    <button
      onClick={() => onAdd(item)}
      className={`relative rounded-xl text-left transition-transform active:scale-[0.96] overflow-hidden ${
        isCritical ? 'bg-red-500/6 border border-red-500/15' : 'card'
      }`}
    >
      {inCartQty > 0 && (
        <div className="absolute top-1.5 right-1.5 z-10 w-5 h-5 rounded-full bg-[var(--c-accent)] flex items-center justify-center text-[10px] font-bold text-white shadow animate-pop-in">
          {inCartQty}
        </div>
      )}
      {item.image_url && (
        <div className="w-full aspect-[4/3] bg-white/3">
          <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
        </div>
      )}
      <div className="p-2.5">
        <p className="font-medium text-[12px] text-[var(--c-text)] leading-tight line-clamp-2">
          {item.name}
        </p>
        <p className="text-sm font-black text-[var(--c-accent)] mt-1 tabular-nums">
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
});

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

  // Add player flow
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [playerSearch, setPlayerSearch] = useState('');
  const [playerResults, setPlayerResults] = useState<Profile[]>([]);
  const [isPlayerSearching, setIsPlayerSearching] = useState(false);
  const [showPlayerTariff, setShowPlayerTariff] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Profile | null>(null);
  const [selectedTariff, setSelectedTariff] = useState<VisitTariff>('regular');
  const playerSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cartSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingNoteRef = useRef<string | null>(null);

  const [showModifiers, setShowModifiers] = useState(false);
  const [modifierItem, setModifierItem] = useState<InventoryItem | null>(null);
  const [availableModifiers, setAvailableModifiers] = useState<Modifier[]>([]);
  const [selectedModifierIds, setSelectedModifierIds] = useState<string[]>([]);
  const modifierCacheRef = useRef<Map<string, Modifier[]>>(new Map());

  const handleBack = useCallback(async () => {
    if (noteTimer.current) clearTimeout(noteTimer.current);
    if (pendingNoteRef.current !== null) {
      await updateCheckNote(pendingNoteRef.current);
      pendingNoteRef.current = null;
    }
    if (cartSaveTimer.current) clearTimeout(cartSaveTimer.current);
    await leaveCheck();
    onBack();
  }, [updateCheckNote, leaveCheck, onBack]);

  const { swipeBackHandlers, swipeIndicatorStyle, overlayStyle } = useSwipeBack({
    onBack: handleBack,
  });

  useEffect(() => {
    setNote(activeCheck?.note || '');
  }, [activeCheck?.id, activeCheck?.note]);

  const debouncedSaveCart = useCallback(() => {
    if (cartSaveTimer.current) clearTimeout(cartSaveTimer.current);
    cartSaveTimer.current = setTimeout(() => {
      saveCartToDb();
    }, 1500);
  }, [saveCartToDb]);

  const activeCheckId = activeCheck?.id;
  useEffect(() => {
    if (activeCheckId && cart.length > 0) {
      debouncedSaveCart();
    }
    return () => {
      if (cartSaveTimer.current) clearTimeout(cartSaveTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, activeCheckId, debouncedSaveCart]);

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

  const cartSubtotal = cart.reduce((s, c) => {
    const modPrice = (c.modifiers || []).reduce((ms, m) => ms + m.price, 0);
    return s + (c.item.price + modPrice) * c.quantity;
  }, 0);
  const spaceRental = activeCheck?.space?.hourly_rate ? rentalAmount : 0;
  const total = getCartTotal() + spaceRental;
  const discountTotal = getDiscountTotal();
  const subtotal = cartSubtotal + spaceRental;
  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);


  const [quantityDiscounts, setQuantityDiscounts] = useState<Discount[]>([]);
  const autoApplyingRef = useRef(false);

  const loadDiscountsList = useCallback(async () => {
    const { data } = await supabase.from('discounts').select('*').eq('is_active', true).order('name');
    if (data) {
      const all = data as Discount[];
      setDiscountsList(all);
      setQuantityDiscounts(all.filter((d) => d.min_quantity != null && d.min_quantity > 0));
    }
  }, []);

  useEffect(() => { loadDiscountsList(); }, [loadDiscountsList]);

  // Auto-apply / remove quantity-based discounts when cart changes
  useEffect(() => {
    if (!activeCheck || quantityDiscounts.length === 0 || autoApplyingRef.current) return;

    const run = async () => {
      autoApplyingRef.current = true;
      try {
        const currentDiscounts = usePOSStore.getState().appliedDiscounts;

        for (const qd of quantityDiscounts) {
          const minQty = qd.min_quantity!;
          const alreadyApplied = currentDiscounts.find((ad) => ad.discount_id === qd.id);

          if (qd.item_id) {
            const ci = cart.find((c) => c.item.id === qd.item_id);
            const qty = ci?.quantity || 0;
            if (qty >= minQty && !alreadyApplied) {
              await applyDiscount(qd.id, qd.name, qd.type, qd.value, 'item', qd.item_id);
            } else if (qty < minQty && alreadyApplied) {
              await removeDiscount(alreadyApplied.id);
            }
          } else {
            const anyMatch = cart.some((c) => c.quantity >= minQty);
            if (anyMatch && !alreadyApplied) {
              await applyDiscount(qd.id, qd.name, qd.type, qd.value, 'check');
            } else if (!anyMatch && alreadyApplied) {
              await removeDiscount(alreadyApplied.id);
            }
          }
        }
      } finally {
        autoApplyingRef.current = false;
      }
    };

    const timer = setTimeout(run, 300);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, quantityDiscounts, activeCheck?.id]);

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

  const menuGridRef = useRef<HTMLDivElement>(null);
  const menuVirtualizer = useVirtualizer({
    count: Math.ceil(filteredItems.length / 2),
    getScrollElement: () => menuGridRef.current,
    estimateSize: () => 140,
    overscan: 3,
  });

  const searchPlayersForAdd = useCallback((query: string) => {
    setPlayerSearch(query);
    if (playerSearchTimer.current) clearTimeout(playerSearchTimer.current);
    if (query.length < 1) { setPlayerResults([]); setIsPlayerSearching(false); return; }
    setIsPlayerSearching(true);
    playerSearchTimer.current = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .ilike('nickname', `%${query}%`)
        .is('deleted_at', null)
        .limit(20);
      setPlayerResults((data as Profile[]) || []);
      setIsPlayerSearching(false);
    }, 300);
  }, []);

  const handlePlayerForTariff = (player: Profile) => {
    hapticFeedback('light');
    setSelectedPlayer(player);
    setSelectedTariff(tierToTariff(player.client_tier));
    setShowAddPlayer(false);
    setShowPlayerTariff(true);
  };

  const handleConfirmAddPlayer = async () => {
    if (!activeCheck || !selectedPlayer) return;
    hapticFeedback('medium');
    const info = VISIT_ITEMS[selectedTariff];
    const visitItem = inventory.find((i) => i.name === info.dbName);
    if (visitItem) addToCart(visitItem);

    const currentGuests = activeCheck.guest_names ? activeCheck.guest_names.split(', ') : [];
    if (!currentGuests.includes(selectedPlayer.nickname)) {
      currentGuests.push(selectedPlayer.nickname);
    }
    const newGuestNames = currentGuests.join(', ');
    await supabase.from('checks').update({ guest_names: newGuestNames }).eq('id', activeCheck.id);
    usePOSStore.setState((s) => ({
      activeCheck: s.activeCheck ? { ...s.activeCheck, guest_names: newGuestNames } : null,
    }));

    await saveCartToDb();

    setShowPlayerTariff(false);
    setSelectedPlayer(null);
    setPlayerSearch('');
    setPlayerResults([]);
  };

  if (!activeCheck) return null;

  const handleAdd = async (item: InventoryItem) => {
    hapticFeedback('light');

    let mods = modifierCacheRef.current.get(item.id);
    if (mods === undefined) {
      const { data: links } = await supabase
        .from('product_modifiers')
        .select('modifier_id, modifier:modifiers(*)')
        .eq('product_id', item.id);
      mods = (links || [])
        .map((l: any) => l.modifier as Modifier)
        .filter((m: Modifier) => m && m.is_active);
      modifierCacheRef.current.set(item.id, mods);
    }

    if (mods.length > 0) {
      setModifierItem(item);
      setAvailableModifiers(mods);
      setSelectedModifierIds([]);
      setShowModifiers(true);
    } else {
      addToCart(item);
    }
  };

  const confirmModifiers = () => {
    if (!modifierItem) return;
    const mods = selectedModifierIds.length > 0
      ? selectedModifierIds.map((mid) => {
          const mod = availableModifiers.find((m) => m.id === mid);
          return { id: mid, name: mod?.name || '?', price: mod?.price || 0 };
        })
      : undefined;
    addToCart(modifierItem, mods);
    setShowModifiers(false);
    setModifierItem(null);
  };

  const handleCancel = async () => {
    const ok = await cancelCheck();
    if (ok) {
      hapticFeedback('medium');
      setShowCancelConfirm(false);
      onBack();
    }
  };

  const openMenu = () => {
    setMenuCategory(null);
    setMenuSearch('');
    setShowMenu(true);
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-8rem)]" {...swipeBackHandlers}>
      {swipeIndicatorStyle && <div style={swipeIndicatorStyle} />}
      {overlayStyle && <div style={overlayStyle} />}
      {/* Sticky header */}
      <div className="sticky top-0 z-20 -mx-4 px-4 py-2 bg-[var(--c-bg)]/95 backdrop-blur-sm border-b border-white/5 mb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={handleBack}
            className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center active:scale-90 transition-transform shrink-0"
          >
            <ArrowLeft className="w-4 h-4 text-[var(--c-text)]" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-[13px] font-bold text-[var(--c-text)] truncate leading-tight">
              {activeCheck.space
                ? activeCheck.space.name
                : (() => {
                    const names: string[] = [];
                    if (activeCheck.player?.nickname) names.push(activeCheck.player.nickname);
                    if (activeCheck.guest_names) names.push(...activeCheck.guest_names.split(', '));
                    return names.length > 0 ? names.join(', ') : 'Без клиента';
                  })()
              }
            </h2>
            <p className="text-[10px] text-[var(--c-hint)] leading-tight">
              {activeCheck.space && activeCheck.player && <>{activeCheck.player.nickname}{activeCheck.guest_names ? `, ${activeCheck.guest_names}` : ''} · </>}
              {new Date(activeCheck.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
              {cartCount > 0 && <> · {cartCount} поз.</>}
            </p>
          </div>
          {total > 0 && (
            <span className="text-base font-black text-[var(--c-text)] tabular-nums shrink-0">
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
            className="w-full px-3 py-2 rounded-xl bg-white/4 border border-white/6 text-sm text-[var(--c-text)] placeholder:text-white/15 focus:border-[var(--c-accent)]/30 focus:outline-none resize-none transition-all"
          />
        </div>
      )}

      {/* Cart */}
      <div className="flex-1 pb-24">
        {cart.length === 0 ? (
          <div className="text-center py-16 animate-fade-in">
            <div className="w-16 h-16 rounded-2xl bg-white/3 flex items-center justify-center mx-auto mb-3">
              <ShoppingBag className="w-8 h-8 text-white/6" />
            </div>
            <p className="text-[var(--c-hint)] text-sm font-medium">Чек пока пуст</p>
            <p className="text-xs text-white/15 mt-1 mb-5">Добавьте позиции из меню</p>
            <button
              onClick={openMenu}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold active:scale-95 transition-transform"
              style={{ background: 'linear-gradient(135deg, #6c5ce7, #7c6cf7)', boxShadow: '0 4px 20px rgba(108,92,231,0.3)' }}
            >
              <Plus className="w-4 h-4" />
              Открыть меню
            </button>
          </div>
        ) : (
          <div className="space-y-1 stagger-children">
            {cart.map((ci, cartIdx) => {
              const modPrice = (ci.modifiers || []).reduce((s, m) => s + m.price, 0);
              const unitPrice = ci.item.price + modPrice;
              const cartKey = ci.item.id + ((ci.modifiers || []).map((m) => m.id).sort().join(','));
              return (
              <SwipeableRow
                key={cartKey || cartIdx}
                onDelete={() => { hapticFeedback('medium'); removeFromCart(ci.item.id); }}
              >
                <div className="flex items-center gap-2.5 py-2 px-1 bg-[var(--c-bg)]">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-[var(--c-text)] truncate leading-tight">
                      {ci.item.name}
                    </p>
                    <p className="text-[11px] text-white/25 mt-0.5 tabular-nums">{fmtCur(ci.item.price)}</p>
                    {ci.modifiers && ci.modifiers.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {ci.modifiers.map((m, idx) => (
                          <span key={idx} className="text-[10px] px-1.5 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400">
                            {m.name}{m.price > 0 ? ` +${m.price}₽` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-px bg-white/4 rounded-lg">
                    <button
                      onClick={() => { hapticFeedback('light'); updateCartQuantity(ci.item.id, ci.quantity - 1); }}
                      className="w-7 h-7 flex items-center justify-center active:bg-white/10 rounded-l-lg transition-colors"
                    >
                      <Minus className="w-3 h-3 text-white/50" />
                    </button>
                    <span className="w-6 text-center text-xs font-bold text-[var(--c-text)] tabular-nums">
                      {ci.quantity}
                    </span>
                    <button
                      onClick={() => { hapticFeedback('light'); updateCartQuantity(ci.item.id, ci.quantity + 1); }}
                      className="w-7 h-7 flex items-center justify-center active:bg-white/10 rounded-r-lg transition-colors"
                    >
                      <Plus className="w-3 h-3 text-white/50" />
                    </button>
                  </div>

                  <p className="text-[13px] font-bold text-[var(--c-text)] min-w-[48px] text-right tabular-nums">
                    {fmtCur(unitPrice * ci.quantity)}
                  </p>
                </div>
              </SwipeableRow>
              );
            })}

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
          <button
            onClick={() => { setShowAddPlayer(true); setPlayerSearch(''); setPlayerResults([]); }}
            className="w-10 h-10 rounded-xl bg-emerald-500/8 border border-emerald-500/10 flex items-center justify-center active:scale-90 transition-transform shrink-0"
            title="Добавить игрока"
          >
            <UserPlus className="w-4.5 h-4.5 text-emerald-400/70" />
          </button>
          <div className="flex-1 min-w-0">
            {cartCount > 0 && (
              <p className="text-xl font-black text-[var(--c-text)] tabular-nums leading-none">
                {fmtCur(total)}
              </p>
            )}
          </div>
          {cartCount > 0 && (
            <button
              onClick={() => { hapticFeedback('medium'); setShowPayment(true); }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white font-bold text-sm active:scale-[0.96] transition-transform animate-pop-in"
              style={{ background: 'linear-gradient(135deg, #6c5ce7, #7c6cf7)', boxShadow: '0 4px 20px rgba(108,92,231,0.3)' }}
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
            onChange={(e) => startTransition(() => setMenuSearch(e.target.value))}
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/5 border border-white/6 text-sm text-[var(--c-text)] placeholder:text-white/15 focus:outline-none focus:border-[var(--c-accent)]/25 transition-colors"
          />
        </div>

        {/* Category horizontal scroll */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none mb-3 -mx-1 px-1">
          <button
            onClick={() => setMenuCategory(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all active:scale-95 shrink-0 ${
              !menuCategory ? 'bg-[var(--c-accent)]/15 text-[var(--c-accent)]' : 'bg-white/5 text-white/35'
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
                  menuCategory === cat.slug ? 'bg-[var(--c-accent)]/15 text-[var(--c-accent)]' : 'bg-white/5 text-white/35'
                }`}
              >
                <CatIcon className="w-3 h-3" />
                {cat.name}
              </button>
            );
          })}
        </div>

        {/* Items grid */}
        <div ref={menuGridRef} className="max-h-[55vh] overflow-y-auto">
          <div style={{ height: `${menuVirtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
            {menuVirtualizer.getVirtualItems().map((virtualRow) => {
              const startIdx = virtualRow.index * 2;
              const rowItems = filteredItems.slice(startIdx, startIdx + 2);
              return (
                <div
                  key={virtualRow.index}
                  className="grid grid-cols-2 lg:grid-cols-3 gap-2"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {rowItems.map((item) => {
                    const inCart = cart.find((c) => c.item.id === item.id);
                    return <MenuItem key={item.id} item={item} inCartQty={inCart?.quantity || 0} onAdd={handleAdd} />;
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </Drawer>

      {/* Modifiers selection */}
      <Drawer
        open={showModifiers}
        onClose={() => { setShowModifiers(false); setModifierItem(null); }}
        title={modifierItem ? `Модификаторы: ${modifierItem.name}` : 'Модификаторы'}
        size="sm"
      >
        <div className="space-y-3">
          {availableModifiers.map((mod) => {
            const isSelected = selectedModifierIds.includes(mod.id);
            return (
              <button
                key={mod.id}
                onClick={() => {
                  hapticFeedback('light');
                  setSelectedModifierIds((prev) =>
                    isSelected ? prev.filter((id) => id !== mod.id) : [...prev, mod.id]
                  );
                }}
                className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all active:scale-[0.97] ${
                  isSelected ? 'bg-[var(--c-accent)]/10 border border-[var(--c-accent)]/20' : 'card'
                }`}
              >
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                  isSelected ? 'bg-[var(--c-accent)]' : 'border border-white/15'
                }`}>
                  {isSelected && <Plus className="w-3 h-3 text-white rotate-45" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[13px] text-[var(--c-text)]">{mod.name}</p>
                </div>
                {mod.price > 0 && (
                  <span className="text-sm font-bold text-[var(--c-accent)] tabular-nums shrink-0">+{fmtCur(mod.price)}</span>
                )}
              </button>
            );
          })}

          <div className="flex gap-2 pt-2">
            <Button
              variant="ghost"
              onClick={() => { addToCart(modifierItem!); setShowModifiers(false); setModifierItem(null); }}
              className="flex-1"
            >
              Без добавок
            </Button>
            <Button onClick={confirmModifiers} className="flex-1">
              Добавить{selectedModifierIds.length > 0 ? ` (${selectedModifierIds.length})` : ''}
            </Button>
          </div>
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
          {(() => {
            const manualDiscounts = discountsList.filter((d) => !d.min_quantity);
            const qtyDiscounts = discountsList.filter((d) => d.min_quantity && d.min_quantity > 0);

            return manualDiscounts.length === 0 && qtyDiscounts.length === 0 ? (
              <p className="text-xs text-[var(--c-hint)] text-center py-6">Нет активных скидок</p>
            ) : (
              <>
                {manualDiscounts.length > 0 && (
                  <>
                    <p className="text-[10px] text-white/25 font-semibold uppercase tracking-wider">На весь чек</p>
                    <div className="space-y-1">
                      {manualDiscounts.map((d) => (
                        <button
                          key={d.id}
                          onClick={() => { handleApplyDiscount(d); setShowDiscounts(false); }}
                          className="w-full flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-white/5 transition-colors active:scale-[0.98]"
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${d.type === 'percentage' ? 'bg-violet-500/12' : 'bg-emerald-500/12'}`}>
                            <Percent className={`w-3.5 h-3.5 ${d.type === 'percentage' ? 'text-violet-400' : 'text-emerald-400'}`} />
                          </div>
                          <div className="flex-1 text-left">
                            <p className="text-[13px] font-medium text-[var(--c-text)]">{d.name}</p>
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
                              <p className="text-[11px] font-medium text-[var(--c-text)] mb-1.5">{ci.item.name} ({fmtCur(ci.item.price * ci.quantity)})</p>
                              <div className="flex gap-1 flex-wrap">
                                {manualDiscounts.map((d) => (
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
                {qtyDiscounts.length > 0 && (
                  <>
                    <p className="text-[10px] text-amber-400/50 font-semibold uppercase tracking-wider pt-2">Авто-скидки по количеству</p>
                    <div className="space-y-1">
                      {qtyDiscounts.map((d) => {
                        const isApplied = appliedDiscounts.some((ad) => ad.discount_id === d.id);
                        return (
                          <div
                            key={d.id}
                            className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all ${
                              isApplied ? 'bg-emerald-500/8 border-emerald-500/15' : 'bg-white/2 border-white/5'
                            }`}
                          >
                            <div className="w-8 h-8 rounded-lg bg-amber-500/12 flex items-center justify-center">
                              <Percent className="w-3.5 h-3.5 text-amber-400" />
                            </div>
                            <div className="flex-1 text-left min-w-0">
                              <p className="text-[13px] font-medium text-[var(--c-text)] truncate">{d.name}</p>
                              <p className="text-[10px] text-white/25">
                                от {d.min_quantity} шт · {d.type === 'percentage' ? `-${d.value}%` : `-${d.value}₽`}
                              </p>
                            </div>
                            <Badge variant={isApplied ? 'success' : 'default'} size="sm">
                              {isApplied ? 'Активна' : 'Ожидает'}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            );
          })()}
        </div>
      </Drawer>

      {/* Add player search */}
      <Drawer
        open={showAddPlayer}
        onClose={() => { setShowAddPlayer(false); setPlayerSearch(''); setPlayerResults([]); }}
        title="Добавить игрока"
        size="md"
      >
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
            <Input
              placeholder="Поиск по нику..."
              value={playerSearch}
              onChange={(e) => searchPlayersForAdd(e.target.value)}
              className="pl-9"
              compact
              autoFocus
            />
          </div>

          {isPlayerSearching && (
            <div className="flex justify-center py-3">
              <div className="w-5 h-5 border-2 border-[var(--c-accent)] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          <div className="space-y-1 max-h-[40vh] overflow-y-auto">
            {playerResults.map((player) => (
              <button
                key={player.id}
                onClick={() => handlePlayerForTariff(player)}
                className="w-full flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-white/5 transition-colors active:scale-[0.98]"
              >
                <div className="w-8 h-8 rounded-lg bg-[var(--c-accent)]/10 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-[var(--c-accent)]">
                    {player.nickname?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="text-left flex-1 min-w-0">
                  <p className="font-semibold text-[13px] text-[var(--c-text)] truncate">{player.nickname}</p>
                  <div className="flex gap-1 mt-0.5">
                    {player.client_tier === 'resident' && <span className="text-[10px] text-emerald-400 font-medium">Резидент</span>}
                    {player.client_tier === 'student' && <span className="text-[10px] text-blue-400 font-medium">Студент</span>}
                  </div>
                </div>
                <span className="text-xs text-white/20 tabular-nums shrink-0">
                  {VISIT_ITEMS[tierToTariff(player.client_tier)].price}₽
                </span>
              </button>
            ))}
            {playerSearch.length > 0 && !isPlayerSearching && playerResults.length === 0 && (
              <p className="text-xs text-center text-[var(--c-hint)] py-6">Никого не найдено</p>
            )}
            {playerSearch.length === 0 && (
              <p className="text-xs text-center text-white/20 py-6">Введите ник игрока</p>
            )}
          </div>
        </div>
      </Drawer>

      {/* Player tariff selection */}
      <Drawer
        open={showPlayerTariff}
        onClose={() => { setShowPlayerTariff(false); setSelectedPlayer(null); }}
        title="Тариф игрока"
        size="sm"
      >
        {selectedPlayer && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-xl card">
              <div className="w-10 h-10 rounded-xl bg-[var(--c-accent)]/10 flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-[var(--c-accent)]">
                  {selectedPlayer.nickname?.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-[var(--c-text)] truncate">{selectedPlayer.nickname}</p>
                {selectedPlayer.client_tier === 'resident' && <span className="text-[10px] text-emerald-400">Резидент</span>}
                {selectedPlayer.client_tier === 'student' && <span className="text-[10px] text-blue-400">Студент</span>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(VISIT_ITEMS) as [VisitTariff, typeof VISIT_ITEMS['regular']][]).map(([key, info]) => {
                const isSelected = selectedTariff === key;
                const isDefault = tierToTariff(selectedPlayer.client_tier) === key;
                return (
                  <button
                    key={key}
                    onClick={() => { setSelectedTariff(key); hapticFeedback('light'); }}
                    className={`relative flex flex-col items-center gap-1 p-3 rounded-xl border transition-all active:scale-[0.97] ${
                      isSelected
                        ? 'bg-[var(--c-accent)]/10 border-[var(--c-accent)]/30'
                        : 'card border-white/6'
                    }`}
                  >
                    {isDefault && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                        <Star className="w-2.5 h-2.5 text-white fill-white" />
                      </div>
                    )}
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      key === 'resident' ? 'bg-emerald-500/12' :
                      key === 'student' ? 'bg-blue-500/12' :
                      key === 'single_game' ? 'bg-amber-500/12' :
                      'bg-white/6'
                    }`}>
                      {key === 'resident' ? <Star className="w-4 h-4 text-emerald-400" /> :
                       key === 'student' ? <GraduationCap className="w-4 h-4 text-blue-400" /> :
                       key === 'single_game' ? <Gamepad2 className="w-4 h-4 text-amber-400" /> :
                       <User className="w-4 h-4 text-white/40" />}
                    </div>
                    <span className={`text-xs font-semibold ${
                      isSelected ? 'text-[var(--c-accent)]' : 'text-[var(--c-text)]'
                    }`}>
                      {info.label}
                    </span>
                    <span className={`text-sm font-black tabular-nums ${
                      isSelected ? 'text-[var(--c-accent)]' : 'text-white/50'
                    }`}>
                      {info.price}₽
                    </span>
                  </button>
                );
              })}
            </div>

            <Button fullWidth size="lg" onClick={handleConfirmAddPlayer}>
              <UserPlus className="w-4 h-4" />
              Добавить · {VISIT_ITEMS[selectedTariff].price}₽
            </Button>
          </div>
        )}
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
              className="flex-1 py-2.5 rounded-xl bg-white/5 text-[13px] font-semibold text-[var(--c-text)] active:scale-[0.97] transition-transform"
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
