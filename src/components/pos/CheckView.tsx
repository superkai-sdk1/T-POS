import { useState, useMemo, useEffect, useRef, useCallback, memo, startTransition } from 'react';
import { createPortal } from 'react-dom';
import { usePOSStore } from '@/store/pos';
import { PaymentDrawer } from './PaymentDrawer';
import { Badge } from '@/components/ui/Badge';
import { Drawer } from '@/components/ui/Drawer';
import { CartSwipeableRow } from '@/components/ui/CartSwipeableRow';
import {
  ArrowLeft, CreditCard, Plus, Minus, X,
  ShoppingBag,
  MessageSquare, Percent, Trash2, Timer, Search,
  UserPlus, User, Star, GraduationCap, Gamepad2,
  Sparkles, SlidersHorizontal,
} from 'lucide-react';
import { hapticFeedback } from '@/lib/telegram';
import { supabase } from '@/lib/supabase';
import { useMenuCategories, getIconComponent, getCategoryColorConfig } from '@/hooks/useMenuCategories';
import { useSwipeBack } from '@/hooks/useSwipeBack';
import { useHideNav } from '@/store/layout';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import type { InventoryItem, Discount, Profile, VisitTariff, ClientTier, Modifier, ClientDiscountRule } from '@/types';

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

const MenuSheetItem = memo(function MenuSheetItem({
  item,
  inCartQty,
  categoryName,
  iconName,
  colors,
  onAdd,
  onDecrease,
}: {
  item: InventoryItem;
  inCartQty: number;
  categoryName: string;
  iconName?: string;
  colors: ReturnType<typeof getCategoryColorConfig>;
  onAdd: (item: InventoryItem) => void;
  onDecrease: (item: InventoryItem) => void;
}) {
  const CatIcon = getIconComponent(iconName || '');
  return (
    <div
      className={`group relative border transition-all duration-500 rounded-xl lg:rounded-2xl p-3 lg:p-4 flex flex-col text-left min-h-[88px] overflow-hidden ${
        inCartQty > 0
          ? `${colors.bgActive} border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.3)] ring-1 ring-white/10`
          : `${colors.bg} border-white/5 hover:bg-white/[0.08]`
      }`}
    >
      <div className="absolute inset-0 pointer-events-none opacity-[0.1] overflow-hidden">
        <div className="absolute left-1/2 top-1/2 w-[180%] grid gap-[1px]" style={{ gridTemplateColumns: 'repeat(8, 1fr)', gridTemplateRows: 'repeat(8, 1fr)', aspectRatio: '1', transform: 'translate(-50%, -50%) rotate(-45deg)' }}>
          {Array.from({ length: 64 }).map((_, i) => (
            <CatIcon key={i} className="w-6 h-6 text-white place-self-center" strokeWidth={1.5} />
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onAdd(item)}
        className="relative z-10 flex-1 flex flex-col min-w-0 min-h-0 active:scale-[0.98] transition-transform"
      >
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex items-center gap-1 min-w-0">
            <div className={`w-1.5 h-1.5 lg:w-1 h-1 rounded-full shrink-0 ${colors.active} shadow-[0_0_6px_rgba(255,255,255,0.1)]`} />
            <span className={`text-[8px] lg:text-[7px] font-black uppercase tracking-[0.15em] truncate ${colors.text}`}>
              {categoryName}
            </span>
          </div>
          {inCartQty > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); onDecrease(item); }}
              className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/10 border border-white/10 hover:bg-white/20 active:scale-90 transition-all"
            >
              <Minus className="w-3.5 h-3.5 text-white/70" />
              <span className="text-xs font-black text-white tabular-nums">{inCartQty}</span>
            </button>
          )}
        </div>
        <h3 className="text-[15px] lg:text-base font-black uppercase tracking-tighter text-white/90 line-clamp-2 leading-snug mb-auto text-left w-full">
          {item.name}
        </h3>
        <div className="flex justify-end mt-1">
          <span className="text-base lg:text-lg font-black text-white tracking-tighter tabular-nums">{fmtCur(item.price)}</span>
        </div>
      </button>
    </div>
  );
});

const TopSheetItem = memo(function TopSheetItem({
  item,
  inCartQty,
  iconName,
  colors,
  onAdd,
  onDecrease,
}: {
  item: InventoryItem;
  inCartQty: number;
  iconName?: string;
  colors: ReturnType<typeof getCategoryColorConfig>;
  onAdd: (item: InventoryItem) => void;
  onDecrease: (item: InventoryItem) => void;
}) {
  const CatIcon = getIconComponent(iconName || '');
  return (
    <div
      className={`relative border transition-all duration-300 rounded-xl p-2 lg:p-2.5 flex flex-col text-left min-h-[72px] overflow-hidden ${
        inCartQty > 0
          ? `${colors.bgActive} border-white/15 ring-1 ring-white/10`
          : `${colors.bg} border-white/5 hover:bg-white/[0.08]`
      }`}
    >
      <div className="absolute inset-0 pointer-events-none opacity-[0.1] overflow-hidden">
        <div className="absolute left-1/2 top-1/2 w-[180%] grid gap-[1px]" style={{ gridTemplateColumns: 'repeat(8, 1fr)', gridTemplateRows: 'repeat(8, 1fr)', aspectRatio: '1', transform: 'translate(-50%, -50%) rotate(-45deg)' }}>
          {Array.from({ length: 64 }).map((_, i) => (
            <CatIcon key={i} className="w-5 h-5 text-white place-self-center" strokeWidth={1.5} />
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onAdd(item)}
        className="relative z-10 flex-1 flex flex-col min-w-0 min-h-0 text-left active:scale-[0.96]"
      >
        <div className="flex items-start justify-between gap-1 mb-0.5">
          <span className="flex-1 min-w-0" />
          {inCartQty > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); onDecrease(item); }}
              className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/10 border border-white/10 hover:bg-white/20 active:scale-90 transition-all"
            >
              <Minus className="w-3 h-3 text-white/70" />
              <span className="text-[10px] font-black text-white tabular-nums">{inCartQty}</span>
            </button>
          )}
        </div>
        <h3 className="text-[13px] lg:text-sm font-black uppercase tracking-tighter leading-tight text-white/90 line-clamp-2 mb-auto text-left w-full">
          {item.name}
        </h3>
        <div className="flex justify-end mt-0.5">
          <span className="text-[13px] lg:text-sm font-black text-white tabular-nums">{fmtCur(item.price)}</span>
        </div>
      </button>
    </div>
  );
});

const CartItemRow = memo(function CartItemRow({
  ci,
  onRemove,
  onUpdateQty,
  onModifiersClick,
  hasModifiers,
}: {
  ci: { item: InventoryItem; quantity: number; modifiers?: { id: string; name: string; price: number }[] };
  onRemove: (id: string, modifierKey?: string) => void;
  onUpdateQty: (id: string, qty: number, modifierKey?: string) => void;
  onModifiersClick?: () => void;
  hasModifiers?: boolean;
}) {
  if (!ci?.item) return null;
  const modPrice = (ci.modifiers || []).reduce((s, m) => s + m.price, 0);
  const unitPrice = ci.item.price + modPrice;
  const modKey = (ci.modifiers || []).map((m) => m.id).sort().join(',');
  return (
    <CartSwipeableRow
      quantity={ci.quantity}
      onIncrement={() => onUpdateQty(ci.item.id, ci.quantity + 1, modKey)}
      onDecrement={() => onUpdateQty(ci.item.id, Math.max(1, ci.quantity - 1), modKey)}
      onRemove={() => onRemove(ci.item.id, modKey)}
    >
      <div className="flex items-center justify-between p-4 bg-white/5 backdrop-blur-lg rounded-[1.5rem] border border-white/5 hover:border-white/15 transition-all shadow-lg">
        <div
          className={`flex-1 min-w-0 flex items-start gap-2 ${hasModifiers ? 'cursor-pointer' : ''}`}
          onClick={hasModifiers && onModifiersClick ? () => { hapticFeedback('light'); onModifiersClick(); } : undefined}
          onTouchStart={hasModifiers && onModifiersClick ? (e) => e.stopPropagation() : undefined}
          role={hasModifiers && onModifiersClick ? 'button' : undefined}
          tabIndex={hasModifiers && onModifiersClick ? 0 : undefined}
          onKeyDown={hasModifiers && onModifiersClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onModifiersClick(); } } : undefined}
        >
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm tracking-tight text-white truncate">
              {ci.item.name}
            </p>
          <p className="text-[10px] text-white/30 font-bold mt-0.5 uppercase tracking-widest">{fmtCur(ci.item.price)}</p>
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
          {hasModifiers && (
            <SlidersHorizontal className="w-4 h-4 text-indigo-400/70 shrink-0 mt-0.5" />
          )}
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Mobile: compact quantity badge */}
          {ci.quantity > 1 && (
            <span className="lg:hidden text-xs font-black text-white/50">x{ci.quantity}</span>
          )}
          {/* Desktop: full +/- controls */}
          <div className="hidden lg:flex items-center bg-black/40 rounded-2xl border border-white/5 p-0.5">
            <button
              onClick={() => { hapticFeedback('light'); onUpdateQty(ci.item.id, ci.quantity - 1, modKey); }}
              className="p-2 hover:text-[#8b5cf6] transition-colors"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="w-7 text-center font-black italic text-sm text-white">{ci.quantity}</span>
            <button
              onClick={() => { hapticFeedback('light'); onUpdateQty(ci.item.id, ci.quantity + 1, modKey); }}
              className="p-2 hover:text-[#8b5cf6] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          <span className="text-right font-black italic text-base lg:text-lg text-white/90 tabular-nums">
            {fmtCur(unitPrice * ci.quantity)}
          </span>
        </div>
      </div>
    </CartSwipeableRow>
  );
});

interface CheckViewProps {
  onBack: () => void;
}

export function CheckView({ onBack }: CheckViewProps) {
  const { activeCheck, cart, addToCart, updateCartQuantity, updateCartModifiers, removeFromCart, inventory, leaveCheck, cancelCheck, getCartTotal, getDiscountTotal, updateCheckNote, saveCartToDb, appliedDiscounts, applyDiscount, removeDiscount, productModifiers } = usePOSStore();
  const hideNav = useHideNav();

  const [showPayment, setShowPayment] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [menuDragY, setMenuDragY] = useState(0);
  const menuSwipeStartY = useRef(0);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
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
  const [editingCartItem, setEditingCartItem] = useState<{ item: InventoryItem; quantity: number; modifiers?: { id: string; name: string; price: number }[] } | null>(null);
  const [modifierCounts, setModifierCounts] = useState<Record<string, number>>({});
  const [clientDiscountRules, setClientDiscountRules] = useState<ClientDiscountRule[]>([]);

  useEffect(() => {
    const onOpenPayment = () => setShowPayment(true);
    const onOpenMenu = () => setShowMenu(true);
    const onOpenAddPlayer = () => { setShowAddPlayer(true); setPlayerSearch(''); setPlayerResults([]); };
    window.addEventListener('tpos:open-payment', onOpenPayment);
    window.addEventListener('tpos:open-menu', onOpenMenu);
    window.addEventListener('tpos:open-add-player', onOpenAddPlayer);
    return () => {
      window.removeEventListener('tpos:open-payment', onOpenPayment);
      window.removeEventListener('tpos:open-menu', onOpenMenu);
      window.removeEventListener('tpos:open-add-player', onOpenAddPlayer);
    };
  }, []);

  const handleBack = useCallback(async () => {
    if (noteTimer.current) clearTimeout(noteTimer.current);
    if (pendingNoteRef.current !== null) {
      await updateCheckNote(pendingNoteRef.current);
      pendingNoteRef.current = null;
    }
    if (cartSaveTimer.current) clearTimeout(cartSaveTimer.current);
    onBack();
    setTimeout(() => leaveCheck(), 0);
  }, [updateCheckNote, leaveCheck, onBack]);

  const { swipeIndicatorStyle, overlayStyle } = useSwipeBack({
    onBack: handleBack,
  });

  useEffect(() => {
    setNote(activeCheck?.note || '');
  }, [activeCheck?.id, activeCheck?.note]);

  // Close view when activeCheck disappears (e.g. cancelled or deleted remotely)
  useEffect(() => {
    if (!activeCheck) onBack();
  }, [activeCheck, onBack]);

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
  }, [cart, activeCheckId, debouncedSaveCart]);

  useEffect(() => {
    return () => {
      if (noteTimer.current) clearTimeout(noteTimer.current);
      if (cartSaveTimer.current) clearTimeout(cartSaveTimer.current);
      if (playerSearchTimer.current) clearTimeout(playerSearchTimer.current);
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
  const [billedMinutes, setBilledMinutes] = useState(0);

  useEffect(() => {
    if (!activeCheck?.space || !activeCheck.space.hourly_rate) return;
    const rate = activeCheck.space.hourly_rate;

    const tick = () => {
      const elapsed = (Date.now() - new Date(activeCheck.created_at).getTime()) / 60000;
      const rounded = Math.max(1, Math.ceil(elapsed / 30)) * 30;
      setRentalMinutes(Math.round(elapsed));
      setBilledMinutes(rounded);
      setRentalAmount(Math.round((rounded / 60) * rate));
    };
    tick();
    const iv = setInterval(tick, 15000);
    return () => clearInterval(iv);
  }, [activeCheck?.space, activeCheck?.created_at]);

  const cartSubtotal = cart.reduce((s, c) => {
    if (!c?.item) return s;
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
    const [discRes, rulesRes] = await Promise.all([
      supabase.from('discounts').select('*').eq('is_active', true).order('name'),
      supabase.from('client_discount_rules').select('*, discount:discounts(*)'),
    ]);
    if (discRes.data) {
      const all = discRes.data as Discount[];
      setDiscountsList(all);
      setQuantityDiscounts(all.filter((d) => d.min_quantity != null && d.min_quantity > 0));
    }
    if (rulesRes.data) {
      setClientDiscountRules(rulesRes.data.map((r) => ({
        ...r,
        discount: Array.isArray(r.discount) ? r.discount[0] : r.discount,
      })) as ClientDiscountRule[]);
    }
  }, []);

  useEffect(() => { loadDiscountsList(); }, [loadDiscountsList]);

  // Auto-apply / remove client-specific discounts when cart or check client changes
  useEffect(() => {
    if (!activeCheck || clientDiscountRules.length === 0 || autoApplyingRef.current) return;
    const playerId = activeCheck.player_id;
    if (!playerId) return;

    const run = async () => {
      autoApplyingRef.current = true;
      try {
        const currentDiscounts = usePOSStore.getState().appliedDiscounts;

        for (const rule of clientDiscountRules) {
          const discount = rule.discount as Discount | undefined;
          if (!discount?.is_active) continue;

          const hasItem = cart.some((c) => c?.item?.id === rule.item_id);
          const alreadyApplied = currentDiscounts.find(
            (ad) => ad.client_rule_id === rule.id
          );

          if (hasItem && playerId === rule.profile_id && !alreadyApplied) {
            await applyDiscount(discount.id, discount.name, discount.type, discount.value, 'item', rule.item_id, rule.id);
          } else if ((!hasItem || playerId !== rule.profile_id) && alreadyApplied) {
            await removeDiscount(alreadyApplied.id);
          }
        }
      } finally {
        autoApplyingRef.current = false;
      }
    };

    const timer = setTimeout(run, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, activeCheck?.player_id, clientDiscountRules, activeCheck?.id]);

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
            const ci = cart.find((c) => c?.item?.id === qd.item_id);
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
      items = items.filter((i) =>
        i.name.toLowerCase().includes(q) ||
        (i.search_tags || []).some((t) => t.toLowerCase().includes(q)),
      );
    }
    return items.sort((a, b) => a.sort_order - b.sort_order);
  }, [inventory, menuCategory, menuSearch]);

  const topItems = useMemo(() => filteredItems.filter((i) => i.is_top), [filteredItems]);
  const regularItems = useMemo(() => filteredItems.filter((i) => !i.is_top), [filteredItems]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of inventory) {
      counts[item.category] = (counts[item.category] || 0) + 1;
    }
    return counts;
  }, [inventory]);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

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
      if (!mountedRef.current) return;
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
    usePOSStore.setState((s) => ({
      activeCheck: s.activeCheck ? { ...s.activeCheck, guest_names: newGuestNames } : null,
    }));

    setShowPlayerTariff(false);
    setSelectedPlayer(null);
    setPlayerSearch('');
    setPlayerResults([]);

    supabase.from('checks').update({ guest_names: newGuestNames }).eq('id', activeCheck.id);
    saveCartToDb();
  };

  const handleAdd = (item: InventoryItem) => {
    hapticFeedback('light');
    addToCart(item);
  };

  const handleDecrease = useCallback((item: InventoryItem) => {
    const ci = cart.find((c) => c?.item?.id === item.id);
    if (!ci) return;
    hapticFeedback('light');
    const modKey = (ci.modifiers || []).map((m) => m.id).sort().join(',');
    if (ci.quantity <= 1) {
      removeFromCart(ci.item.id, modKey);
    } else {
      updateCartQuantity(ci.item.id, ci.quantity - 1, modKey);
    }
  }, [cart, removeFromCart, updateCartQuantity]);

  const openModifiersForCartItem = useCallback((ci: { item: InventoryItem; quantity: number; modifiers?: { id: string; name: string; price: number }[] }) => {
    const mods = productModifiers[ci.item.id] || [];
    if (mods.length === 0) return;
    const counts: Record<string, number> = {};
    (ci.modifiers || []).forEach((m) => { counts[m.id] = (counts[m.id] || 0) + 1; });
    setEditingCartItem(ci);
    setModifierCounts(counts);
    setShowModifiers(true);
  }, [productModifiers]);

  const applyModifiersFromCart = useCallback(() => {
    if (!editingCartItem) return;
    const availableMods = productModifiers[editingCartItem.item.id] || [];
    const newModifiers: { id: string; name: string; price: number }[] = [];
    Object.entries(modifierCounts).forEach(([modId, count]) => {
      const mod = availableMods.find((m) => m.id === modId);
      if (mod && count > 0) {
        for (let i = 0; i < count; i++) newModifiers.push({ id: mod.id, name: mod.name, price: mod.price });
      }
    });
    const oldModKey = (editingCartItem.modifiers || []).map((m) => m.id).sort().join(',');
    updateCartModifiers(editingCartItem.item.id, oldModKey, newModifiers);
    setShowModifiers(false);
    setEditingCartItem(null);
  }, [editingCartItem, modifierCounts, productModifiers, updateCartModifiers]);

  const handleCancel = useCallback(async () => {
    setShowCancelConfirm(false);
    setIsDismissing(true);
    hapticFeedback('medium');
    setTimeout(async () => {
      await cancelCheck();
      onBack();
      setTimeout(() => leaveCheck(), 0);
    }, 350);
  }, [cancelCheck, leaveCheck, onBack]);

  const isDraggingHandleRef = useRef(false);
  const menuDragYRef = useRef(0);

  const openMenu = () => {
    setMenuCategory(null);
    setMenuSearch('');
    setMenuDragY(0);
    isDraggingHandleRef.current = false;
    menuDragYRef.current = 0;
    setShowMenu(true);
  };

  const closeMenu = useCallback(() => {
    setShowMenu(false);
    setMenuCategory(null);
    setMenuSearch('');
    setMenuDragY(0);
    isDraggingHandleRef.current = false;
    menuDragYRef.current = 0;
  }, []);

  const handleMenuSwipeStart = useCallback((e: React.TouchEvent) => {
    isDraggingHandleRef.current = true;
    menuSwipeStartY.current = e.touches[0].clientY;
  }, []);

  const handleMenuSwipeMove = useCallback((e: React.TouchEvent) => {
    if (!isDraggingHandleRef.current) return;
    const dy = e.touches[0].clientY - menuSwipeStartY.current;
    const val = Math.max(0, dy);
    menuDragYRef.current = val;
    setMenuDragY(val);
  }, []);

  const handleMenuSwipeEnd = useCallback(() => {
    isDraggingHandleRef.current = false;
    const y = menuDragYRef.current;
    if (y > 80) closeMenu();
    else setMenuDragY(0);
    menuDragYRef.current = 0;
  }, [closeMenu]);

  if (!activeCheck) {
    return isDismissing ? <div className="flex-1 opacity-0" /> : null;
  }

  return (
    <div
      className={`flex flex-col flex-1 min-h-0 px-1 lg:px-4 transition-all duration-300 ease-[var(--ease-out-expo)] ${isDismissing ? 'opacity-0 scale-95 translate-y-4' : ''}`}
    >
      {swipeIndicatorStyle && <div style={swipeIndicatorStyle} />}
      {overlayStyle && <div style={overlayStyle} />}
      {/* Glass header */}
      <div className="sticky top-0 z-20 -mx-1 lg:mx-0 px-1 lg:px-4 py-2 lg:py-3 mb-3 lg:mb-4" style={{ transform: 'translateZ(0)' }}>
        <div className="flex items-center justify-between bg-white/5 backdrop-blur-xl p-3 lg:p-4 rounded-[2rem] border border-white/10 shadow-xl">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={handleBack}
              className="p-2 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 transition-colors shrink-0 active:scale-90"
            >
              <ArrowLeft className="w-4.5 h-4.5 text-white" />
            </button>
            {activeCheck.player?.photo_url ? (
              <div className="w-9 h-9 rounded-xl overflow-hidden shrink-0 border border-white/10">
                <img src={activeCheck.player.photo_url} alt="" className="w-full h-full object-cover" />
              </div>
            ) : activeCheck.player ? (
              <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-white/60">{activeCheck.player.nickname?.charAt(0).toUpperCase()}</span>
              </div>
            ) : null}
            <div className="min-w-0">
              <h2 className="text-[14px] font-black italic uppercase leading-none truncate text-white">
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
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] text-white/40 font-bold uppercase tracking-widest">
                  {new Date(activeCheck.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                  {cartCount > 0 && <> · {cartCount} поз.</>}
                </span>
                {activeCheck.player && activeCheck.player.bonus_points > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-400/80">
                    <Star className="w-2.5 h-2.5" />{activeCheck.player.bonus_points}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <button
              onClick={() => { loadDiscountsList(); setShowDiscounts(true); }}
              className={`p-2.5 rounded-2xl border transition-colors active:scale-90 ${appliedDiscounts.length > 0 ? 'bg-pink-500/10 border-pink-500/20 text-pink-400' : 'bg-white/5 border-white/10 text-white/40'}`}
            >
              <Percent className="w-[18px] h-[18px]" />
            </button>
            <button
              onClick={() => setShowNote(!showNote)}
              className={`p-2.5 rounded-2xl border transition-colors active:scale-90 ${note ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-white/5 border-white/10 text-white/40'}`}
            >
              <MessageSquare className="w-[18px] h-[18px]" />
            </button>
            <button
              onClick={() => setShowCancelConfirm(true)}
              className="p-2.5 bg-[#f43f5e]/10 rounded-2xl border border-[#f43f5e]/20 text-[#f43f5e] active:scale-90 transition-colors"
            >
              <X className="w-[18px] h-[18px]" />
            </button>
          </div>
        </div>

        {activeCheck.space && activeCheck.space.hourly_rate != null && (
          <div className="flex items-center justify-between mt-2 px-4">
            <div className="flex items-center gap-1.5 text-indigo-400/70">
              <Timer className="w-3 h-3" />
              <span className="text-[11px] tabular-nums">{Math.floor(rentalMinutes / 60)}ч {String(rentalMinutes % 60).padStart(2, '0')}м</span>
              <span className="text-white/20">·</span>
              <span className="text-[11px] text-white/40">тариф {Math.floor(billedMinutes / 60)}ч {String(billedMinutes % 60).padStart(2, '0')}м</span>
              <span className="text-white/20">·</span>
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
            className="w-full px-3 py-2 rounded-xl bg-[var(--c-surface)] border border-[var(--c-border)] text-sm text-[var(--c-text)] placeholder:text-[var(--c-muted)] focus:border-[var(--c-accent)]/30 focus:outline-none resize-none transition-all"
          />
        </div>
      )}

      {/* Cart (pb-24 под плавающую нав на мобиле; убираем когда нав скрыт) */}
      <div className={`flex-1 min-h-0 space-y-3 lg:space-y-4 ${hideNav ? 'pb-0' : 'pb-24 lg:pb-0'}`}>
        {cart.length === 0 ? (
          <div className="text-center py-16 animate-fade-in">
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-3">
              <ShoppingBag className="w-8 h-8 text-white/20" />
            </div>
            <p className="text-white/50 text-sm font-bold">Чек пока пуст</p>
            <p className="text-xs text-white/25 mt-1 mb-5">Добавьте позиции из меню</p>
            <button
              onClick={openMenu}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-white text-sm font-black uppercase tracking-widest active:scale-95 transition-transform bg-gradient-to-br from-[#a78bfa] to-[#6d28d9] shadow-xl shadow-[#8b5cf6]/30"
            >
              <Plus className="w-4 h-4" />
              Меню
            </button>
          </div>
        ) : (
          <div className="space-y-3 stagger-children">
            {cart.filter((ci) => ci?.item).map((ci, cartIdx) => {
              const cartKey = ci.item.id + ((ci.modifiers || []).map((m) => m.id).sort().join(','));
              const hasMods = (productModifiers[ci.item.id]?.length ?? 0) > 0;
              return (
                <CartItemRow
                  key={cartKey || cartIdx}
                  ci={ci}
                  onRemove={removeFromCart}
                  onUpdateQty={updateCartQuantity}
                  onModifiersClick={hasMods ? () => openModifiersForCartItem(ci) : undefined}
                  hasModifiers={hasMods}
                />
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

            <div className="pt-3 mt-1 border-t border-[var(--c-border)] space-y-0.5">
              {discountTotal > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[var(--c-hint)]">Подытог</span>
                  <span className="text-xs text-[var(--c-hint)] tabular-nums">{fmtCur(subtotal)}</span>
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

      {/* Menu sheet — portaled to body to avoid parent transform affecting fixed position */}
      {showMenu && typeof document !== 'undefined' && createPortal(
        <>
          <div
            className="fixed inset-0 bg-black/90 backdrop-blur-[12px] z-[61] transition-opacity duration-300"
            style={{ opacity: menuDragY > 0 ? Math.max(0, 1 - menuDragY / 200) : 1 }}
            onClick={closeMenu}
          />
          <div
            className="fixed bottom-0 left-0 right-0 w-full max-w-4xl mx-auto z-[62]"
            style={{
              transform: `translateY(${menuDragY}px)`,
              transition: menuDragY > 0 ? 'none' : 'transform 0.5s cubic-bezier(0.16,1,0.3,1)',
            }}
          >
            <div className="bg-[#0d0d12] border-t border-white/5 rounded-t-[2rem] lg:rounded-t-[1.5rem] shadow-2xl flex flex-col h-[92dvh] sm:h-[95dvh] lg:h-[90dvh] max-h-[98vh] overflow-hidden">
              <div
                className="shrink-0 cursor-grab active:cursor-grabbing touch-none select-none"
                onTouchStart={handleMenuSwipeStart}
                onTouchMove={handleMenuSwipeMove}
                onTouchEnd={handleMenuSwipeEnd}
              >
                <div className="w-full flex justify-center pt-2 pb-0.5">
                  <div className="w-10 h-0.5 lg:w-8 bg-white/5 rounded-full" />
                </div>
                <div className="px-4 sm:px-6 lg:px-6 py-1.5 lg:py-1.5 flex items-center justify-between">
                  <h2 className="text-base sm:text-lg lg:text-xl font-black uppercase italic tracking-tighter text-white/90">
                    МЕНЮ
                  </h2>
                  <button
                    onClick={closeMenu}
                    className="w-8 h-8 lg:w-9 lg:h-9 bg-white/5 hover:bg-white/10 rounded-xl flex items-center justify-center transition-all group"
                  >
                    <X className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-white/30 group-hover:text-white" />
                  </button>
                </div>
              </div>
              <div className="px-4 sm:px-6 lg:px-6 py-1 shrink-0">
                <div className="relative group bg-white/[0.03] border border-white/5 focus-within:border-white/20 rounded-xl lg:rounded-2xl flex items-center px-3 transition-all">
                  <Search className="w-3.5 h-3.5 text-white/10 group-focus-within:text-white/40 shrink-0" />
                  <input
                    type="text"
                    placeholder="ПОИСК..."
                    value={menuSearch}
                    onChange={(e) => startTransition(() => setMenuSearch(e.target.value))}
                    className="w-full bg-transparent py-2.5 lg:py-2 px-2 text-sm text-white outline-none placeholder:text-white/20 font-bold uppercase tracking-widest"
                  />
                </div>
              </div>
              <div className="px-4 sm:px-6 lg:px-6 my-1.5 lg:my-2 shrink-0">
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                  <button
                    onClick={() => setMenuCategory(null)}
                    className={`flex flex-col items-center justify-center gap-1 min-w-[72px] lg:min-w-[64px] p-2.5 lg:p-2 rounded-xl transition-all duration-300 border shrink-0 ${
                      !menuCategory
                        ? 'bg-slate-500 border-transparent shadow-xl shadow-slate-500/20 scale-105 z-10'
                        : 'bg-white/[0.02] border-white/5 text-white/20 hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className={`p-1.5 lg:p-2 rounded-lg transition-all ${!menuCategory ? 'bg-white/20 shadow-inner' : 'bg-white/5'}`}>
                      <ShoppingBag className={`w-5 h-5 lg:w-4 lg:h-4 ${!menuCategory ? 'text-white' : 'text-slate-400'}`} />
                    </div>
                    <span className={`text-[9px] lg:text-[8px] font-black uppercase tracking-[0.12em] ${!menuCategory ? 'text-white' : 'text-white/30'}`}>
                      Все
                    </span>
                  </button>
                  {menuCategories.filter((c) => (categoryCounts[c.slug] || 0) > 0).map((cat) => {
                    const CatIcon = getIconComponent(cat.icon_name);
                    const colors = getCategoryColorConfig(cat.color);
                    const isActive = menuCategory === cat.slug;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => setMenuCategory(cat.slug)}
                        className={`flex flex-col items-center justify-center gap-1 min-w-[72px] lg:min-w-[64px] p-2.5 lg:p-2 rounded-xl transition-all duration-300 border shrink-0 ${
                          isActive ? `${colors.active} border-transparent shadow-xl ${colors.glow} scale-105 z-10` : 'bg-white/[0.02] border-white/5 text-white/20 hover:bg-white/[0.04]'
                        }`}
                      >
                        <div className={`p-1.5 lg:p-2 rounded-lg transition-all ${isActive ? 'bg-white/20 shadow-inner' : 'bg-white/5'}`}>
                          <CatIcon className={`w-5 h-5 lg:w-4 lg:h-4 ${isActive ? 'text-white' : colors.text}`} />
                        </div>
                        <span className={`text-[9px] lg:text-[8px] font-black uppercase tracking-[0.12em] ${isActive ? 'text-white' : 'text-white/30'}`}>
                          {cat.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="px-4 sm:px-6 lg:px-6 pb-24 lg:pb-6 overflow-y-auto flex-1 min-h-0">
                {topItems.length > 0 && !menuSearch && (
                  <>
                    <div className="grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-1.5 lg:gap-2 mb-3">
                      {topItems.map((item) => {
                        const inCartQty = cart.filter((c) => c?.item?.id === item.id).reduce((s, c) => s + c.quantity, 0);
                        const cat = menuCategories.find((c) => c.slug === item.category);
                        const colors = getCategoryColorConfig(cat?.color);
                        return (
                          <TopSheetItem
                            key={item.id}
                            item={item}
                            inCartQty={inCartQty}
                            iconName={cat?.icon_name}
                            colors={colors}
                            onAdd={handleAdd}
                            onDecrease={handleDecrease}
                          />
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="h-px flex-1 bg-white/5" />
                      <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/15">Все позиции</span>
                      <div className="h-px flex-1 bg-white/5" />
                    </div>
                  </>
                )}
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 lg:gap-3">
                  {(menuSearch ? filteredItems : regularItems).map((item) => {
                    const inCartQty = cart.filter((c) => c?.item?.id === item.id).reduce((s, c) => s + c.quantity, 0);
                    const cat = menuCategories.find((c) => c.slug === item.category);
                    const colors = getCategoryColorConfig(cat?.color);
                    return (
                      <MenuSheetItem
                        key={item.id}
                        item={item}
                        inCartQty={inCartQty}
                        categoryName={cat?.name || item.category}
                        iconName={cat?.icon_name}
                        colors={colors}
                        onAdd={handleAdd}
                        onDecrease={handleDecrease}
                      />
                    );
                  })}
                </div>
                {filteredItems.length === 0 && (
                  <div className="text-center py-20 opacity-30 flex flex-col items-center gap-4">
                    <Sparkles className="w-10 h-10" />
                    <span className="uppercase tracking-[0.3em] text-[10px] font-black">Ничего не найдено</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>,
        document.body
      )}

      {/* Modifiers panel — выдвигающаяся панель при нажатии на позицию в чеке */}
      <Drawer
        open={showModifiers}
        onClose={() => { setShowModifiers(false); setEditingCartItem(null); }}
        title={editingCartItem ? `Модификаторы: ${editingCartItem.item.name}` : 'Модификаторы'}
        size="sm"
      >
        {editingCartItem && (
          <div className="space-y-3">
            {(productModifiers[editingCartItem.item.id] || []).map((mod) => {
              const count = modifierCounts[mod.id] ?? 0;
              return (
                <div
                  key={mod.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[13px] text-white">{mod.name}</p>
                    {mod.price > 0 && (
                      <p className="text-[11px] text-white/50 mt-0.5">+{fmtCur(mod.price)}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => {
                        hapticFeedback('light');
                        setModifierCounts((prev) => ({ ...prev, [mod.id]: Math.max(0, (prev[mod.id] ?? 0) - 1) }));
                      }}
                      disabled={count <= 0}
                      className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/10 border border-white/10 disabled:opacity-30 disabled:pointer-events-none active:scale-90"
                    >
                      <Minus className="w-4 h-4 text-white" />
                    </button>
                    <span className="w-8 text-center font-black text-sm text-white tabular-nums">{count}</span>
                    <button
                      onClick={() => {
                        hapticFeedback('light');
                        setModifierCounts((prev) => ({ ...prev, [mod.id]: (prev[mod.id] ?? 0) + 1 }));
                      }}
                      className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/10 border border-white/10 active:scale-90"
                    >
                      <Plus className="w-4 h-4 text-white" />
                    </button>
                  </div>
                </div>
              );
            })}
            <Button onClick={applyModifiersFromCart} className="w-full mt-4">
              Применить
            </Button>
          </div>
        )}
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
            const manualDiscounts = discountsList.filter((d) => !d.min_quantity && !d.is_auto);
            const qtyDiscounts = discountsList.filter((d) => d.min_quantity && d.min_quantity > 0);

            return manualDiscounts.length === 0 && qtyDiscounts.length === 0 ? (
              <p className="text-xs text-[var(--c-hint)] text-center py-6">Нет активных скидок</p>
            ) : (
              <>
                {manualDiscounts.length > 0 && (
                  <>
                    <p className="text-[10px] text-[var(--c-muted)] font-semibold uppercase tracking-wider">На весь чек</p>
                    <div className="space-y-1">
                      {manualDiscounts.map((d) => (
                        <button
                          key={d.id}
                          onClick={() => { handleApplyDiscount(d); setShowDiscounts(false); }}
                          className="w-full flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-[var(--c-surface)] transition-colors active:scale-[0.98]"
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${d.type === 'percentage' ? 'bg-violet-500/12' : 'bg-[var(--c-success-bg)]'}`}>
                            <Percent className={`w-3.5 h-3.5 ${d.type === 'percentage' ? 'text-violet-400' : 'text-[var(--c-success)]'}`} />
                          </div>
                          <div className="flex-1 text-left">
                            <p className="text-[13px] font-medium text-[var(--c-text)]">{d.name}</p>
                            <p className="text-[11px] text-[var(--c-muted)]">
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
                        <p className="text-[10px] text-[var(--c-muted)] font-semibold uppercase tracking-wider pt-2">На позицию</p>
                        <div className="space-y-1 max-h-[30vh] overflow-y-auto">
                          {cart.filter((ci) => ci?.item).map((ci, idx) => (
                            <div key={ci.item.id + ':' + idx} className="p-2 rounded-xl bg-[var(--c-surface)]">
                              <p className="text-[11px] font-medium text-[var(--c-text)] mb-1.5">{ci.item.name} ({fmtCur((ci.item.price + (ci.modifiers || []).reduce((s, m) => s + m.price, 0)) * ci.quantity)})</p>
                              <div className="flex gap-1 flex-wrap">
                                {manualDiscounts.map((d) => (
                                  <button
                                    key={d.id}
                                    onClick={() => { handleApplyItemDiscount(d, ci.item.id); setShowDiscounts(false); }}
                                    className="px-2 py-1 rounded-md bg-[var(--c-surface)] text-[10px] font-medium text-[var(--c-hint)] active:scale-95 transition-transform"
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
                            className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all ${isApplied ? 'bg-[var(--c-success-bg)] border-[var(--c-success-border)]' : 'bg-[var(--c-surface)] border-[var(--c-border)]'
                              }`}
                          >
                            <div className="w-8 h-8 rounded-lg bg-[var(--c-warning-bg)] flex items-center justify-center">
                              <Percent className="w-3.5 h-3.5 text-[var(--c-warning)]" />
                            </div>
                            <div className="flex-1 text-left min-w-0">
                              <p className="text-[13px] font-medium text-[var(--c-text)] truncate">{d.name}</p>
                              <p className="text-[10px] text-[var(--c-muted)]">
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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--c-muted)]" />
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
                className="w-full flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-[var(--c-surface)] transition-colors active:scale-[0.98]"
              >
                <div className="w-8 h-8 rounded-lg bg-[var(--c-accent)]/10 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-[var(--c-accent)]">
                    {player.nickname?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="text-left flex-1 min-w-0">
                  <p className="font-semibold text-[13px] text-[var(--c-text)] truncate">{player.nickname}</p>
                  <div className="flex gap-1 mt-0.5">
                    {player.client_tier === 'resident' && <span className="text-[10px] text-[var(--c-success)] font-medium">Резидент</span>}
                    {player.client_tier === 'student' && <span className="text-[10px] text-[var(--c-info)] font-medium">Студент</span>}
                  </div>
                </div>
                <span className="text-xs text-[var(--c-muted)] tabular-nums shrink-0">
                  {VISIT_ITEMS[tierToTariff(player.client_tier)].price}₽
                </span>
              </button>
            ))}
            {playerSearch.length > 0 && !isPlayerSearching && playerResults.length === 0 && (
              <p className="text-xs text-center text-[var(--c-hint)] py-6">Никого не найдено</p>
            )}
            {playerSearch.length === 0 && (
              <p className="text-xs text-center text-[var(--c-muted)] py-6">Введите ник игрока</p>
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
                {selectedPlayer.client_tier === 'resident' && <span className="text-[10px] text-[var(--c-success)]">Резидент</span>}
                {selectedPlayer.client_tier === 'student' && <span className="text-[10px] text-[var(--c-info)]">Студент</span>}
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
                    className={`relative flex flex-col items-center gap-1 p-3 rounded-xl border transition-all active:scale-[0.97] ${isSelected
                      ? 'bg-[var(--c-accent)]/10 border-[var(--c-accent)]/30'
                      : 'card border-[var(--c-border)]'
                      }`}
                  >
                    {isDefault && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                        <Star className="w-2.5 h-2.5 text-white fill-white" />
                      </div>
                    )}
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${key === 'resident' ? 'bg-[var(--c-success-bg)]' :
                      key === 'student' ? 'bg-[var(--c-info-bg)]' :
                        key === 'single_game' ? 'bg-[var(--c-warning-bg)]' :
                          'bg-[var(--c-surface-hover)]'
                      }`}>
                      {key === 'resident' ? <Star className="w-4 h-4 text-[var(--c-success)]" /> :
                        key === 'student' ? <GraduationCap className="w-4 h-4 text-[var(--c-info)]" /> :
                          key === 'single_game' ? <Gamepad2 className="w-4 h-4 text-[var(--c-warning)]" /> :
                            <User className="w-4 h-4 text-[var(--c-hint)]" />}
                    </div>
                    <span className={`text-xs font-semibold ${isSelected ? 'text-[var(--c-accent)]' : 'text-[var(--c-text)]'
                      }`}>
                      {info.label}
                    </span>
                    <span className={`text-sm font-black tabular-nums ${isSelected ? 'text-[var(--c-accent)]' : 'text-[var(--c-hint)]'
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
          <div className="p-3 rounded-xl bg-[var(--c-danger-bg)] border border-[var(--c-border)] text-center">
            <p className="text-[13px] text-[var(--c-danger)] font-semibold">Чек будет полностью удалён</p>
            {cart.length > 0 && (
              <p className="text-[11px] text-[var(--c-muted)] mt-1">
                {cart.length} позиций на сумму {fmtCur(total)} будут потеряны
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowCancelConfirm(false)}
              className="flex-1 py-2.5 rounded-xl bg-[var(--c-surface)] text-[13px] font-semibold text-[var(--c-text)] active:scale-[0.97] transition-transform"
            >
              Нет
            </button>
            <button
              onClick={handleCancel}
              className="flex-1 py-2.5 rounded-xl bg-[var(--c-danger-bg)] text-[13px] font-semibold text-[var(--c-danger)] active:scale-[0.97] transition-transform border border-[var(--c-border)]"
            >
              Да, отменить
            </button>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
