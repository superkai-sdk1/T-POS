import { create } from 'zustand';
import type { CartItem, Check, CheckItem, CheckDiscount, InventoryItem, PaymentMethod, Modifier, MenuCategory, Discount, Event } from '@/types';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from './auth';
import { useShiftStore } from './shift';
import { notifyPayment } from '@/lib/notifications';

export interface PaymentPortion {
  method: PaymentMethod;
  amount: number;
}

interface POSState {
  openChecks: Check[];
  activeCheck: Check | null;
  checkItems: CheckItem[];
  cart: CartItem[];
  inventory: InventoryItem[];
  appliedDiscounts: CheckDiscount[];
  openCheckCarts: Record<string, CartItem[]>;
  openCheckItems: Record<string, CheckItem[]>;
  openCheckDiscounts: Record<string, CheckDiscount[]>;
  productModifiers: Record<string, Modifier[]>;
  menuCategories: MenuCategory[];
  recentlyDeletedCheck: Check | null;
  isLoading: boolean;
  checksLoaded: boolean;
  inventoryLoaded: boolean;
  categoriesLoaded: boolean;
  spaceRentalAmount: number;
  setSpaceRentalAmount: (amount: number) => void;

  loadInventory: () => Promise<void>;
  loadMenuCategories: () => Promise<void>;
  loadOpenChecks: () => Promise<void>;
  createCheck: (playerId: string | null, spaceId?: string | null) => Promise<Check | null>;
  updateCheckNote: (note: string) => Promise<void>;
  selectCheck: (check: Check) => Promise<void>;
  addToCart: (item: InventoryItem, modifiers?: { id: string; name: string; price: number }[]) => void;
  removeFromCart: (itemId: string, modifierKey?: string) => void;
  updateCartModifiers: (itemId: string, oldModKey: string, newModifiers: { id: string; name: string; price: number }[]) => void;
  updateCartQuantity: (itemId: string, quantity: number, modifierKey?: string) => void;
  clearCart: () => void;
  getCartTotal: () => number;
  getDiscountTotal: () => number;
  applyDiscount: (discountId: string, discountName: string, discountType: 'percentage' | 'fixed', discountValue: number, target: 'check' | 'item', itemId?: string, clientRuleId?: string) => Promise<void>;
  removeDiscount: (checkDiscountId: string) => Promise<void>;
  saveCartToDb: () => Promise<boolean>;
  refreshActiveCheck: () => Promise<void>;
  closeCheck: (payments: PaymentPortion[], bonusUsed?: number, spaceRental?: number, certificateUsed?: number, certificateId?: string | null) => Promise<boolean>;
  cancelCheck: () => Promise<boolean>;
  leaveCheck: () => Promise<void>;
  refreshCheckById: (checkId: string) => Promise<void>;

  // Local state updates for Realtime Sync
  upsertCheckLocal: (check: Check) => void;
  deleteCheckLocal: (checkId: string) => void;
  upsertCheckItemLocal: (item: CheckItem, modifiers?: { id: string; name: string; price: number }[]) => void;
  deleteCheckItemLocal: (checkId: string, itemId: string) => void;
  upsertInventoryLocal: (item: InventoryItem) => void;
  upsertCategoryLocal: (category: MenuCategory) => void;
}

let _savingCart = false;
export function isSavingCart() { return _savingCart; }

let _activeCheckId: string | null = null;
export function getActiveCheckId() { return _activeCheckId; }
export function isActiveCheck(checkId: string) { return _activeCheckId === checkId; }

const _cancellingCheckIds = new Set<string>();
export function isCancellingCheck(checkId: string) { return _cancellingCheckIds.has(checkId); }

const _closingCheckIds = new Set<string>();
export function isClosingCheck(checkId: string) { return _closingCheckIds.has(checkId); }

const _recentlyRemovedCheckIds = new Set<string>();
function markCheckRemoved(checkId: string) {
  _recentlyRemovedCheckIds.add(checkId);
  setTimeout(() => _recentlyRemovedCheckIds.delete(checkId), 5000);
}
export function isRecentlyRemoved(checkId: string) { return _recentlyRemovedCheckIds.has(checkId); }

let _lastCartFingerprint = '';
let _savePromise: Promise<void> | null = null;

export const usePOSStore = create<POSState>((set, get) => ({
  openChecks: [],
  activeCheck: null,
  checkItems: [],
  cart: [],
  inventory: [],
  appliedDiscounts: [],
  openCheckCarts: {},
  openCheckItems: {},
  openCheckDiscounts: {},
  productModifiers: {},
  menuCategories: [],
  recentlyDeletedCheck: null,
  isLoading: false,
  checksLoaded: false,
  inventoryLoaded: false,
  categoriesLoaded: false,
  spaceRentalAmount: 0,
  setSpaceRentalAmount: (amount: number) => set({ spaceRentalAmount: amount }),

  loadMenuCategories: async () => {
    if (get().categoriesLoaded) return;
    const { data } = await supabase
      .from('menu_categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');
    if (data) set({ menuCategories: data, categoriesLoaded: true });
  },

  loadInventory: async () => {
    const { data: invData } = await supabase
      .from('inventory')
      .select('*, linked_space:spaces!inventory_linked_space_id_fkey(id, name, type, hourly_rate, is_active)')
      .eq('is_active', true)
      .order('category')
      .order('sort_order')
      .order('name');

    const { data: modData } = await supabase
      .from('product_modifiers')
      .select('product_id, modifier:modifiers(*)');

    const modMap: Record<string, Modifier[]> = {};
    for (const row of modData || []) {
      const pid = row.product_id;
      const mod = Array.isArray(row.modifier) ? row.modifier[0] : row.modifier;
      if (mod && mod.is_active) {
        if (!modMap[pid]) modMap[pid] = [];
        modMap[pid].push(mod as Modifier);
      }
    }

    if (invData) {
      const items = (invData as any[]).map((item) => ({
        ...item,
        linked_space: Array.isArray(item.linked_space) ? item.linked_space[0] || null : item.linked_space || null,
      })) as InventoryItem[];
      set({
        inventory: items,
        productModifiers: modMap,
        inventoryLoaded: true
      });
    }
  },

  loadOpenChecks: async () => {
    const isInitialLoad = !get().checksLoaded;
    if (isInitialLoad) {
      set({ isLoading: true });
    }
    const { data } = await supabase
      .from('checks')
      .select(`
        id, player_id, staff_id, shift_id, status, total_amount, payment_method,
        bonus_used, discount_total, certificate_used, certificate_id,
        space_id, space_start_at, space_end_at, guest_names, note, created_at, closed_at,
        player:profiles!checks_player_id_fkey(id, nickname, photo_url, bonus_points, balance, client_tier, tg_id, tg_username, role, is_resident, phone, birthday, search_tags, created_at, updated_at, deleted_at, permissions),
        space:spaces!checks_space_id_fkey(id, name, type, hourly_rate, is_active),
        event:events!events_check_id_fkey(id, type, location, date, start_time, end_time, payment_type, fixed_amount, status, comment, check_id, created_at)
      `)
      .eq('status', 'open')
      .order('created_at', { ascending: false });
    if (!data) {
      if (isInitialLoad) {
        set({ isLoading: false, checksLoaded: true });
      }
      return;
    }

    const checks = data.map((c) => ({
      ...c,
      player: Array.isArray(c.player) ? c.player[0] : c.player,
      space: Array.isArray(c.space) ? c.space[0] : c.space,
      event: Array.isArray((c as any).event) ? (c as any).event[0] : (c as any).event,
    })) as Check[];

    if (checks.length === 0) {
      set({ openChecks: [], openCheckCarts: {}, openCheckItems: {}, openCheckDiscounts: {}, checksLoaded: true, isLoading: false });
      return;
    }

    const checkIds = checks.map((c) => c.id);

    const { data: allItems } = await supabase
      .from('check_items')
      .select('*, item:inventory(*)')
      .in('check_id', checkIds);

    const parsedItems = (allItems || []).map((ci) => ({
      ...ci,
      item: Array.isArray(ci.item) ? ci.item[0] : ci.item,
    })) as CheckItem[];

    const checkItemIds = parsedItems.map((ci) => ci.id);
    let allModifiers: { check_item_id: string; modifier_id: string; price_at_time: number; modifier: { name: string }[] | { name: string } | null }[] = [];
    if (checkItemIds.length > 0) {
      const { data: modRows } = await supabase
        .from('check_item_modifiers')
        .select('check_item_id, modifier_id, price_at_time, modifier:modifiers(name)')
        .in('check_item_id', checkItemIds);
      allModifiers = (modRows || []) as typeof allModifiers;
    }

    const { data: allDiscounts } = await supabase
      .from('check_discounts')
      .select('*, discount:discounts(*)')
      .in('check_id', checkIds);

    const parsedDiscounts = (allDiscounts || []).map((cd) => ({
      ...cd,
      discount: Array.isArray(cd.discount) ? cd.discount[0] : cd.discount,
    })) as CheckDiscount[];

    const newItemsMap: Record<string, CheckItem[]> = {};
    const newCartsMap: Record<string, CartItem[]> = {};
    const newDiscountsMap: Record<string, CheckDiscount[]> = {};
    const totalsMap = new Map<string, number>();
    const discountsTotalMap = new Map<string, number>();

    for (const checkId of checkIds) {
      newItemsMap[checkId] = [];
      newCartsMap[checkId] = [];
      newDiscountsMap[checkId] = [];
      totalsMap.set(checkId, 0);
      discountsTotalMap.set(checkId, 0);
    }

    const modMap: Record<string, { id: string; name: string; price: number }[]> = {};
    for (const row of allModifiers) {
      if (!modMap[row.check_item_id]) modMap[row.check_item_id] = [];
      const mod = Array.isArray(row.modifier) ? row.modifier[0] : row.modifier;
      modMap[row.check_item_id].push({
        id: row.modifier_id,
        name: mod?.name || '?',
        price: row.price_at_time || 0,
      });
    }

    for (const ci of parsedItems) {
      if (!ci.item) continue;
      newItemsMap[ci.check_id].push(ci);

      const mods = modMap[ci.id];
      const modTotal = (mods || []).reduce((s, m) => s + m.price, 0);
      const unitPrice = ci.price_at_time || (ci.item.price + modTotal);
      const rowTotal = unitPrice * ci.quantity;
      totalsMap.set(ci.check_id, (totalsMap.get(ci.check_id) || 0) + rowTotal);

      newCartsMap[ci.check_id].push({
        item: { ...ci.item, price: unitPrice - modTotal },
        quantity: ci.quantity,
        modifiers: mods,
      });
    }

    for (const cd of parsedDiscounts) {
      newDiscountsMap[cd.check_id].push(cd);
      discountsTotalMap.set(cd.check_id, (discountsTotalMap.get(cd.check_id) || 0) + cd.discount_amount);
    }

    const checksWithTotals = checks.map((check) => ({
      ...check,
      total_amount: Math.max(0, (totalsMap.get(check.id) || 0) - (discountsTotalMap.get(check.id) || 0)),
    }));

    set({
      openChecks: checksWithTotals,
      openCheckItems: newItemsMap,
      openCheckCarts: newCartsMap,
      openCheckDiscounts: newDiscountsMap,
      checksLoaded: true,
      ...(isInitialLoad ? { isLoading: false } : {})
    });
  },

  createCheck: async (playerId: string | null, spaceId?: string | null) => {
    const user = useAuthStore.getState().user;
    const shift = useShiftStore.getState().activeShift;
    if (!shift) return null;
    const insert: Record<string, unknown> = {
      staff_id: user?.id,
      shift_id: shift.id,
    };
    if (playerId) insert.player_id = playerId;
    if (spaceId) insert.space_id = spaceId;

    const { data, error } = await supabase
      .from('checks')
      .insert(insert)
      .select(`
        id, player_id, staff_id, shift_id, status, total_amount, payment_method,
        bonus_used, discount_total, certificate_used, certificate_id,
        space_id, space_start_at, space_end_at, guest_names, note, created_at, closed_at,
        player:profiles!checks_player_id_fkey(id, nickname, photo_url, bonus_points, balance, client_tier, tg_id, tg_username, role, is_resident, phone, birthday, search_tags, created_at, updated_at, deleted_at, permissions),
        space:spaces!checks_space_id_fkey(id, name, type, hourly_rate, is_active)
      `)
      .single();
    if (error || !data) return null;
    const check = {
      ...data,
      player: Array.isArray(data.player) ? data.player[0] : data.player,
      space: Array.isArray(data.space) ? data.space[0] : data.space,
    } as Check;
    _lastCartFingerprint = '';
    set((state) => ({
      activeCheck: check,
      cart: [],
      checkItems: [],
      appliedDiscounts: [],
      openChecks: [check, ...state.openChecks],
      openCheckCarts: { ...state.openCheckCarts, [check.id]: [] },
      openCheckItems: { ...state.openCheckItems, [check.id]: [] },
      openCheckDiscounts: { ...state.openCheckDiscounts, [check.id]: [] },
    }));
    return check;
  },

  updateCheckNote: async (note: string) => {
    const { activeCheck } = get();
    if (!activeCheck) return;
    const prev = activeCheck.note;
    set({ activeCheck: { ...activeCheck, note } });
    const { error } = await supabase.from('checks').update({ note }).eq('id', activeCheck.id);
    if (error) {
      const current = get().activeCheck;
      if (current?.id === activeCheck.id) {
        set({ activeCheck: { ...current, note: prev } });
      }
    }
  },

  selectCheck: async (check: Check) => {
    _lastCartFingerprint = '';
    _activeCheckId = check.id;

    const cart = get().openCheckCarts[check.id] || [];
    const items = get().openCheckItems[check.id] || [];
    const discounts = get().openCheckDiscounts[check.id] || [];

    _lastCartFingerprint = cart.filter((c) => c?.item).map((c) => {
      const mids = (c.modifiers || []).map((m) => m.id).sort().join('+');
      return `${c.item.id}:${c.quantity}:${mids}`;
    }).sort().join('|');

    set({
      activeCheck: check,
      checkItems: items,
      cart,
      appliedDiscounts: discounts,
      isLoading: false
    });
  },

  addToCart: (item: InventoryItem, modifiers?: { id: string; name: string; price: number }[]) => {
    const currentCart = get().cart;
    const modKey = modifiers && modifiers.length > 0
      ? modifiers.map((m) => m.id).sort().join(',')
      : '';
    const idx = currentCart.findIndex((c) => {
      if (!c?.item || c.item.id !== item.id) return false;
      const cKey = (c.modifiers || []).map((m) => m.id).sort().join(',');
      return cKey === modKey;
    });
    let newCart: CartItem[];
    if (idx >= 0) {
      newCart = currentCart.map((c, i) =>
        i === idx ? { ...c, quantity: c.quantity + 1 } : c
      );
    } else {
      newCart = [...currentCart, { item, quantity: 1, modifiers: modifiers || undefined }];
    }
    set({ cart: newCart });
  },

  removeFromCart: (itemId: string, modifierKey?: string) => {
    const key = modifierKey ?? '';
    set({
      cart: get().cart.filter((c) => {
        if (!c?.item) return false;
        if (c.item.id !== itemId) return true;
        const cKey = (c.modifiers || []).map((m) => m.id).sort().join(',');
        return cKey !== key;
      }),
    });
  },

  updateCartModifiers: (itemId: string, oldModKey: string, newModifiers: { id: string; name: string; price: number }[]) => {
    const cart = get().cart;
    const ci = cart.find((c) => {
      if (!c?.item || c.item.id !== itemId) return false;
      const cKey = (c.modifiers || []).map((m) => m.id).sort().join(',');
      return cKey === oldModKey;
    });
    if (!ci) return;
    const newCart = cart.filter((c) => {
      if (!c?.item || c.item.id !== itemId) return true;
      const cKey = (c.modifiers || []).map((m) => m.id).sort().join(',');
      return cKey !== oldModKey;
    });
    set({
      cart: [...newCart, { item: ci.item, quantity: ci.quantity, modifiers: newModifiers.length > 0 ? newModifiers : undefined }],
    });
  },

  updateCartQuantity: (itemId: string, quantity: number, modifierKey?: string) => {
    if (quantity <= 0) {
      get().removeFromCart(itemId, modifierKey);
      return;
    }
    const key = modifierKey ?? '';
    set({
      cart: get().cart.map((c) => {
        if (!c?.item || c.item.id !== itemId) return c;
        const cKey = (c.modifiers || []).map((m) => m.id).sort().join(',');
        return cKey === key ? { ...c, quantity } : c;
      }),
    });
  },

  clearCart: () => set({ cart: [] }),

  getCartTotal: () => {
    const subtotal = get().cart.reduce((sum, c) => {
      if (!c?.item) return sum;
      const modPrice = (c.modifiers || []).reduce((ms, m) => ms + m.price, 0);
      return sum + (c.item.price + modPrice) * c.quantity;
    }, 0);
    const discountTotal = get().getDiscountTotal();
    return Math.max(0, subtotal - discountTotal);
  },

  getDiscountTotal: () => {
    return get().appliedDiscounts.reduce((sum, d) => sum + d.discount_amount, 0);
  },

  applyDiscount: async (discountId, discountName, discountType, discountValue, target, itemId, clientRuleId) => {
    const { activeCheck, cart } = get();
    if (!activeCheck) return;

    let amount = 0;
    if (target === 'check') {
      const subtotal = cart.reduce((s, c) => {
        if (!c?.item) return s;
        const modPrice = (c.modifiers || []).reduce((ms, m) => ms + m.price, 0);
        return s + (c.item.price + modPrice) * c.quantity;
      }, 0);
      amount = discountType === 'percentage' ? Math.round(subtotal * discountValue / 100) : discountValue;
    } else if (itemId) {
      const matchingCis = cart.filter((c) => c?.item?.id === itemId);
      const itemTotal = matchingCis.reduce((sum, ci) => {
        const modPrice = (ci.modifiers || []).reduce((ms, m) => ms + m.price, 0);
        return sum + (ci.item.price + modPrice) * ci.quantity;
      }, 0);
      if (itemTotal > 0) {
        amount = discountType === 'percentage' ? Math.round(itemTotal * discountValue / 100) : discountValue;
      }
    }

    let checkItemId: string | null = null;
    if (target === 'item' && itemId) {
      await get().saveCartToDb();
      const { data: ciRow } = await supabase
        .from('check_items')
        .select('id')
        .eq('check_id', activeCheck.id)
        .eq('item_id', itemId)
        .limit(1)
        .maybeSingle();
      if (ciRow) checkItemId = ciRow.id;
    }

    const tempId = crypto.randomUUID();
    const optimistic = {
      id: tempId,
      check_id: activeCheck.id,
      discount_id: discountId,
      target,
      item_id: checkItemId,
      discount_amount: amount,
      client_rule_id: clientRuleId ?? null,
      discount: { id: discountId, name: discountName, type: discountType, value: discountValue } as Discount,
    } as CheckDiscount;

    const prev = get().appliedDiscounts;
    set({ appliedDiscounts: [...prev, optimistic] });

    const { data, error } = await supabase
      .from('check_discounts')
      .insert({
        check_id: activeCheck.id,
        discount_id: discountId,
        target,
        item_id: checkItemId,
        discount_amount: amount,
        ...(clientRuleId && { client_rule_id: clientRuleId }),
      })
      .select('*, discount:discounts(*)')
      .single();

    if (error) {
      set({ appliedDiscounts: prev });
    } else if (data) {
      const cd = {
        ...data,
        discount: Array.isArray(data.discount) ? data.discount[0] : data.discount,
      } as CheckDiscount;
      // Заменяем оптимистичную запись (tempId) на серверную
      set({ appliedDiscounts: get().appliedDiscounts.map((d) => d.id === tempId ? cd : d) });
    }
  },

  removeDiscount: async (checkDiscountId: string) => {
    const prev = get().appliedDiscounts;
    set({ appliedDiscounts: prev.filter((d) => d.id !== checkDiscountId) });
    const { error } = await supabase.from('check_discounts').delete().eq('id', checkDiscountId);
    if (error) set({ appliedDiscounts: prev });
  },

  refreshActiveCheck: async () => {
    const { activeCheck } = get();
    if (!activeCheck) return;

    const { data: checkData } = await supabase
      .from('checks')
      .select(`
        id, player_id, staff_id, shift_id, status, total_amount, payment_method,
        bonus_used, discount_total, certificate_used, certificate_id,
        space_id, space_start_at, space_end_at, guest_names, note, created_at, closed_at,
        player:profiles!checks_player_id_fkey(id, nickname, photo_url, bonus_points, balance, client_tier, tg_id, tg_username, role, is_resident, phone, birthday, search_tags, created_at, updated_at, deleted_at, permissions),
        space:spaces!checks_space_id_fkey(id, name, type, hourly_rate, is_active),
        event:events!events_check_id_fkey(id, type, location, date, start_time, end_time, payment_type, fixed_amount, status, comment, check_id, created_at)
      `)
      .eq('id', activeCheck.id)
      .single();

    if (!checkData) {
      set({ activeCheck: null, cart: [], checkItems: [], appliedDiscounts: [] });
      return;
    }

    if (checkData.status === 'closed') {
      set({ activeCheck: null, cart: [], checkItems: [], appliedDiscounts: [] });
      return;
    }

    const updatedCheck = {
      ...checkData,
      player: Array.isArray(checkData.player) ? checkData.player[0] : checkData.player,
      space: Array.isArray(checkData.space) ? checkData.space[0] : checkData.space,
      event: Array.isArray((checkData as any).event) ? (checkData as any).event[0] : (checkData as any).event,
    } as Check;

    const { data: items } = await supabase
      .from('check_items')
      .select('*, item:inventory(*)')
      .eq('check_id', activeCheck.id);

    const prev = get().activeCheck;
    const checkChanged = !(
      prev &&
      prev.id === updatedCheck.id &&
      prev.note === updatedCheck.note &&
      prev.guest_names === updatedCheck.guest_names &&
      prev.player_id === updatedCheck.player_id &&
      prev.space_id === updatedCheck.space_id &&
      prev.status === updatedCheck.status
    );

    const normalizedItems = (items || []).map((ci: Record<string, unknown>) => ({
      ...ci,
      item: Array.isArray(ci.item) ? ci.item[0] : ci.item,
    }));
    const loadedItems = normalizedItems.filter((ci: Record<string, unknown>) => ci.item) as CheckItem[];

    const modMap: Record<string, { id: string; name: string; price: number }[]> = {};
    if (loadedItems.length > 0) {
      const ciIds = loadedItems.map((ci) => ci.id);
      const { data: cimRows } = await supabase
        .from('check_item_modifiers')
        .select('check_item_id, modifier_id, price_at_time, modifier:modifiers(name)')
        .in('check_item_id', ciIds);
      if (cimRows) {
        for (const row of cimRows) {
          if (!modMap[row.check_item_id]) modMap[row.check_item_id] = [];
          const mod = Array.isArray(row.modifier) ? row.modifier[0] : row.modifier;
          modMap[row.check_item_id].push({
            id: row.modifier_id,
            name: (mod as { name: string } | null)?.name || '?',
            price: row.price_at_time || 0,
          });
        }
      }
    }

    const newCart: CartItem[] = loadedItems.filter((ci) => ci.item).map((ci) => {
      const mods = modMap[ci.id] || undefined;
      const modTotal = (mods || []).reduce((s, m) => s + m.price, 0);
      const effectivePrice = ci.price_at_time ? ci.price_at_time - modTotal : (ci.item as InventoryItem).price;
      return {
        item: { ...(ci.item as InventoryItem), price: effectivePrice },
        quantity: ci.quantity,
        modifiers: mods,
      };
    });

    const mkFp = (c: CartItem[]) => c.filter((ci) => ci?.item).map((ci) => {
      const mids = (ci.modifiers || []).map((m) => m.id).sort().join('+');
      return `${ci.item.id}:${ci.quantity}:${mids}`;
    }).sort().join('|');
    const oldFp = mkFp(get().cart);
    const newFp = mkFp(newCart);
    const cartChanged = oldFp !== newFp;

    if (!checkChanged && !cartChanged) return;

    const updates: Partial<ReturnType<typeof get>> = {};
    if (checkChanged) updates.activeCheck = updatedCheck;
    if (cartChanged) {
      updates.cart = newCart;
      updates.checkItems = loadedItems;
      _lastCartFingerprint = newFp;
    }
    set(updates as Partial<POSState>);
  },

  saveCartToDb: async (): Promise<boolean> => {
    if (_savePromise) await _savePromise;

    const { activeCheck, cart } = get();
    if (!activeCheck) return true;

    const modKey = cart.filter((c) => c?.item).map((c) => {
      const mids = (c.modifiers || []).map((m) => m.id).sort().join('+');
      return `${c.item.id}:${c.quantity}:${mids}`;
    }).sort().join('|');
    if (modKey === _lastCartFingerprint) return true;

    let success = true;
    const doSave = async () => {
      _savingCart = true;
      try {
        // 1. Fetch current DB state for this check's items and their modifiers
        const { data: dbItems } = await supabase
          .from('check_items')
          .select('id, item_id, quantity, price_at_time')
          .eq('check_id', activeCheck.id);

        const dbItemsArray = dbItems || [];
        const dbItemIds = dbItemsArray.map(i => i.id);

        const { data: dbModifiers } = dbItemIds.length > 0
          ? await supabase.from('check_item_modifiers').select('*').in('check_item_id', dbItemIds)
          : { data: [] };

        const dbModifierMap: Record<string, string> = {}; // check_item_id -> sorted modifier IDs
        (dbModifiers || []).forEach(m => {
          if (!dbModifierMap[m.check_item_id]) dbModifierMap[m.check_item_id] = '';
          dbModifierMap[m.check_item_id] += (dbModifierMap[m.check_item_id] ? ',' : '') + m.modifier_id;
        });
        Object.keys(dbModifierMap).forEach(k => {
          dbModifierMap[k] = dbModifierMap[k].split(',').sort().join(',');
        });

        // 2. Diff local cart with DB items
        interface UpsertItem {
          id?: string;
          check_id: string;
          item_id: string;
          quantity: number;
          price_at_time: number;
          _temp_modifiers?: { id: string; name: string; price: number }[];
        }

        const itemsToDelete: string[] = [];
        const itemsToUpsert: UpsertItem[] = [];

        const cartWithKeys = cart.filter((c) => c?.item).map(c => ({
          ...c,
          key: (c.modifiers || []).map(m => m.id).sort().join(',')
        }));

        const matchedDbIds = new Set<string>();

        for (const cartItem of cartWithKeys) {
          const modPrice = (cartItem.modifiers || []).reduce((s, m) => s + m.price, 0);
          const unitPrice = cartItem.item.price + modPrice;

          const existing = dbItemsArray.find(dbi =>
            dbi.item_id === cartItem.item.id &&
            (dbModifierMap[dbi.id] || '') === cartItem.key &&
            !matchedDbIds.has(dbi.id)
          );

          if (existing) {
            matchedDbIds.add(existing.id);
            if (existing.quantity !== cartItem.quantity) {
              itemsToUpsert.push({
                id: existing.id,
                check_id: activeCheck.id,
                item_id: cartItem.item.id,
                quantity: cartItem.quantity,
                price_at_time: unitPrice
              });
            }
          } else {
            itemsToUpsert.push({
              check_id: activeCheck.id,
              item_id: cartItem.item.id,
              quantity: cartItem.quantity,
              price_at_time: unitPrice,
              _temp_modifiers: cartItem.modifiers
            });
          }
        }

        dbItemsArray.forEach(dbi => {
          if (!matchedDbIds.has(dbi.id)) itemsToDelete.push(dbi.id);
        });

        // 3. Execution
        if (itemsToDelete.length > 0) {
          await supabase.from('check_items').delete().in('id', itemsToDelete);
        }

        if (itemsToUpsert.length > 0) {
          // Separate existing (update) and new (insert) items for reliable modifier mapping
          const existingItems = itemsToUpsert.filter(i => i.id);
          const newItems = itemsToUpsert.filter(i => !i.id);

          // Upsert existing items (quantity changes only)
          if (existingItems.length > 0) {
            const { error: upErr } = await supabase
              .from('check_items')
              .upsert(existingItems.map(({ _temp_modifiers, ...rest }) => { void _temp_modifiers; return rest; }));
            if (upErr) {
              success = false;
            }
          }

          // Insert new items one-by-one to reliably get IDs for modifier mapping
          const newModifiers: { check_item_id: string; modifier_id: string; price_at_time: number }[] = [];
          for (const newItem of newItems) {
            const { _temp_modifiers: tempMods, ...insertData } = newItem;
            const { data: saved, error: insErr } = await supabase
              .from('check_items')
              .insert(insertData)
              .select()
              .single();

            if (insErr || !saved) {
              success = false;
              continue;
            }

            if (tempMods && tempMods.length > 0) {
              for (const m of tempMods) {
                newModifiers.push({
                  check_item_id: saved.id,
                  modifier_id: m.id,
                  price_at_time: m.price,
                });
              }
            }
          }

          if (newModifiers.length > 0) {
            await supabase.from('check_item_modifiers').insert(newModifiers);
          }
        }

        _lastCartFingerprint = modKey;
      } catch (err) {
        console.error('[POS] saveCartToDb failed:', err);
        success = false;
      } finally {
        setTimeout(() => { _savingCart = false; }, 600);
        _savePromise = null;
      }
    };

    _savePromise = doSave();
    await _savePromise;
    return success;
  },

  cancelCheck: async () => {
    const { activeCheck, cart, checkItems, appliedDiscounts } = get();
    if (!activeCheck) return false;
    const checkId = activeCheck.id;
    const deletedCheck = { ...activeCheck };
    const prevFp = _lastCartFingerprint;
    _lastCartFingerprint = '';
    _activeCheckId = null;
    _cancellingCheckIds.add(checkId);
    markCheckRemoved(checkId);
    set({ activeCheck: null, cart: [], checkItems: [], appliedDiscounts: [], recentlyDeletedCheck: deletedCheck });
    get().deleteCheckLocal(checkId);
    // Помечаем связанное мероприятие как отменённое, чтобы оно попало в историю
    await supabase
      .from('events')
      .update({ status: 'cancelled' })
      .eq('check_id', checkId)
      .neq('status', 'completed');
    const { error: discErr } = await supabase.from('check_discounts').delete().eq('check_id', checkId);
    const { error: itemsErr } = await supabase.from('check_items').delete().eq('check_id', checkId);
    if (discErr || itemsErr) {
      _cancellingCheckIds.delete(checkId);
      _lastCartFingerprint = prevFp;
      set({ activeCheck, cart, checkItems, appliedDiscounts, recentlyDeletedCheck: null });
      await get().loadOpenChecks();
      return false;
    }
    const { error } = await supabase.from('checks').delete().eq('id', checkId);
    if (error) {
      _cancellingCheckIds.delete(checkId);
      _lastCartFingerprint = prevFp;
      set({ activeCheck, cart, checkItems, appliedDiscounts, recentlyDeletedCheck: null });
      await get().loadOpenChecks();
      return false;
    }
    _cancellingCheckIds.delete(checkId);
    return true;
  },

  leaveCheck: async () => {
    const { activeCheck, cart, checkItems, appliedDiscounts } = get();
    get().saveCartToDb();
    _lastCartFingerprint = '';
    _activeCheckId = null;

    if (activeCheck) {
      const subtotal = cart.reduce((sum, c) => {
        if (!c?.item) return sum;
        const modPrice = (c.modifiers || []).reduce((ms, m) => ms + m.price, 0);
        return sum + (c.item.price + modPrice) * c.quantity;
      }, 0);
      const discountTotal = appliedDiscounts.reduce((sum, d) => sum + d.discount_amount, 0);
      // total_amount stores only cart items minus discounts (space rental and event amounts
      // are calculated separately at display time in CheckTile / CheckPaymentPanel)
      const total = Math.max(0, subtotal - discountTotal);
      const checkId = activeCheck.id;
      set((state) => ({
        activeCheck: null,
        cart: [],
        checkItems: [],
        appliedDiscounts: [],
        spaceRentalAmount: 0,
        openChecks: state.openChecks.map((c) =>
          c.id === checkId ? { ...c, total_amount: total } : c
        ),
        openCheckCarts: { ...state.openCheckCarts, [checkId]: cart },
        openCheckItems: { ...state.openCheckItems, [checkId]: checkItems },
        openCheckDiscounts: { ...state.openCheckDiscounts, [checkId]: appliedDiscounts },
      }));
    } else {
      set({ activeCheck: null, cart: [], checkItems: [], appliedDiscounts: [], spaceRentalAmount: 0 });
    }
  },

  closeCheck: async (payments: PaymentPortion[], bonusUsed = 0, spaceRental = 0, certificateUsed = 0, certificateId: string | null = null) => {
    const { activeCheck, cart } = get();
    if (!activeCheck) return false;
    const checkId = activeCheck.id;
    const user = useAuthStore.getState().user;

    const cartTotal = get().getCartTotal();

    let eventAmount = 0;
    const { data: ev } = await supabase
      .from('events')
      .select('id, fixed_amount')
      .eq('check_id', checkId)
      .maybeSingle();
    if (ev) {
      eventAmount = (ev as { fixed_amount: number | null }).fixed_amount || 0;
    }

    const total = cartTotal + spaceRental + eventAmount;
    const discountTotal = get().getDiscountTotal();

    const saved = await get().saveCartToDb();
    if (!saved) return false;

    const finalAmount = Math.max(0, total - bonusUsed - certificateUsed);

    const isSplit = payments.length > 1;
    const primaryMethod: PaymentMethod = isSplit ? 'split' : payments[0]?.method || 'cash';

    _closingCheckIds.add(checkId);
    _activeCheckId = null;
    markCheckRemoved(checkId);

    set((state) => {
      const { [checkId]: _carts, ...restCarts } = state.openCheckCarts;
      const { [checkId]: _items, ...restItems } = state.openCheckItems;
      const { [checkId]: _discs, ...restDiscs } = state.openCheckDiscounts;
      void _carts; void _items; void _discs;
      return {
        openChecks: state.openChecks.filter(c => c.id !== checkId),
        openCheckCarts: restCarts,
        openCheckItems: restItems,
        openCheckDiscounts: restDiscs,
        activeCheck: null,
        cart: [],
        checkItems: [],
        appliedDiscounts: [],
        recentlyDeletedCheck: { ...activeCheck },
      };
    });

    // --- Atomic close via server-side SQL function ---
    const cartItems = cart
      .filter((x) => x?.item)
      .reduce((acc, c) => {
        const existing = acc.find((a: { item_id: string }) => a.item_id === c.item.id);
        if (existing) {
          existing.quantity += c.quantity;
        } else {
          acc.push({ item_id: c.item.id, quantity: c.quantity });
        }
        return acc;
      }, [] as { item_id: string; quantity: number }[]);

    const { data: rpcResult, error: rpcErr } = await supabase.rpc('close_check', {
      p_check_id: checkId,
      p_payments: JSON.stringify(payments.map((p) => ({ method: p.method, amount: p.amount }))),
      p_bonus_used: bonusUsed,
      p_space_rental: spaceRental,
      p_certificate_used: certificateUsed,
      p_certificate_id: certificateId,
      p_discount_total: discountTotal,
      p_closed_by: user?.id || null,
      p_cart_items: JSON.stringify(cartItems),
    });

    if (rpcErr || rpcResult?.error) {
      console.error('closeCheck RPC error:', rpcErr || rpcResult?.error);
      console.error('closeCheck RPC params:', {
        p_check_id: checkId,
        p_payments: payments,
        p_bonus_used: bonusUsed,
        p_space_rental: spaceRental,
        p_certificate_used: certificateUsed,
        p_discount_total: discountTotal,
        p_closed_by: user?.id,
        p_cart_items: cartItems,
      });
      _closingCheckIds.delete(checkId);
      await get().loadOpenChecks();
      return false;
    }

    // Notifications (fire-and-forget, outside transaction)
    if (payments.length > 0) {
      const playerNick = (activeCheck.player as { nickname?: string })?.nickname || 'Гость';
      const paymentMap: Record<string, 'payment_cash' | 'payment_card' | 'payment_deposit' | 'payment_debt'> = {
        cash: 'payment_cash',
        card: 'payment_card',
        deposit: 'payment_deposit',
        debt: 'payment_debt',
      };
      for (const p of payments) {
        const notifType = paymentMap[p.method];
        if (notifType && p.amount > 0) {
          notifyPayment(notifType, p.amount, playerNick, checkId);
        }
      }
    }

    _closingCheckIds.delete(checkId);
    get().loadInventory();
    return true;
  },

  refreshCheckById: async (checkId: string) => {
    if (_cancellingCheckIds.has(checkId) || _closingCheckIds.has(checkId) || _recentlyRemovedCheckIds.has(checkId)) return;

    const { data: checkData } = await supabase
      .from('checks')
      .select(`
        id, player_id, staff_id, shift_id, status, total_amount, payment_method,
        bonus_used, discount_total, certificate_used, certificate_id,
        space_id, space_start_at, space_end_at, guest_names, note, created_at, closed_at,
        player:profiles!checks_player_id_fkey(id, nickname, photo_url, bonus_points, balance, client_tier, tg_id, tg_username, role, is_resident, phone, birthday, search_tags, created_at, updated_at, deleted_at, permissions),
        space:spaces!checks_space_id_fkey(id, name, type, hourly_rate, is_active),
        event:events!events_check_id_fkey(id, type, location, date, start_time, end_time, payment_type, fixed_amount, status, comment, check_id, created_at)
      `)
      .eq('id', checkId)
      .single();

    if (_cancellingCheckIds.has(checkId)) return;

    if (!checkData || checkData.status === 'closed') {
      get().deleteCheckLocal(checkId);
      return;
    }

    const { data: itemsData } = await supabase
      .from('check_items')
      .select('*, item:inventory(*)')
      .eq('check_id', checkId);

    const check = {
      ...checkData,
      player: Array.isArray(checkData.player) ? checkData.player[0] : checkData.player,
      space: Array.isArray(checkData.space) ? checkData.space[0] : checkData.space,
      event: Array.isArray((checkData as any).event) ? (checkData as any).event[0] : (checkData as any).event,
    } as Check;

    const items = (itemsData || []).map(ci => ({
      ...ci,
      item: Array.isArray(ci.item) ? ci.item[0] : ci.item,
    })) as CheckItem[];

    // Fetch modifiers
    const modMap: Record<string, { id: string; name: string; price: number }[]> = {};
    const ciIds = items.map(i => i.id);
    if (ciIds.length > 0) {
      const { data: cimRows } = await supabase
        .from('check_item_modifiers')
        .select('check_item_id, modifier_id, price_at_time, modifier:modifiers(name)')
        .in('check_item_id', ciIds);
      (cimRows || []).forEach(row => {
        if (!modMap[row.check_item_id]) modMap[row.check_item_id] = [];
        const mod = Array.isArray(row.modifier) ? row.modifier[0] : row.modifier;
        modMap[row.check_item_id].push({
          id: row.modifier_id,
          name: (mod as { name: string } | null)?.name || '?',
          price: row.price_at_time || 0,
        });
      });
    }

    const cart: CartItem[] = items.map(ci => {
      const mods = modMap[ci.id];
      const modTotal = (mods || []).reduce((s, m) => s + m.price, 0);
      const effectivePrice = ci.price_at_time ? ci.price_at_time - modTotal : ci.item!.price;
      return {
        item: { ...ci.item!, price: effectivePrice },
        quantity: ci.quantity,
        modifiers: mods,
      };
    });

    set(state => {
      const newChecks = state.openChecks.map(c => c.id === checkId ? check : c);
      if (!newChecks.find(c => c.id === checkId)) newChecks.unshift(check);

      const updates: Partial<POSState> = {
        openChecks: newChecks,
        openCheckItems: { ...state.openCheckItems, [checkId]: items },
        openCheckCarts: { ...state.openCheckCarts, [checkId]: cart },
      };

      if (state.activeCheck?.id === checkId) {
        updates.activeCheck = check;
        updates.checkItems = items;
        updates.cart = cart;
      }

      return updates as Partial<POSState>;
    });
  },

  upsertCheckLocal: (check: Check) => {
    set((state) => {
      const idx = state.openChecks.findIndex((c) => c.id === check.id);
      const newChecks = [...state.openChecks];
      if (idx >= 0) {
        newChecks[idx] = { ...newChecks[idx], ...check };
      } else {
        newChecks.unshift(check);
      }

      const updates: Partial<POSState> = { openChecks: newChecks };
      if (state.activeCheck?.id === check.id) {
        updates.activeCheck = { ...state.activeCheck, ...check };
      }
      return updates as Partial<POSState>;
    });
  },

  deleteCheckLocal: (checkId: string) => {
    const state = get();
    if (!state.openChecks.some((c) => c.id === checkId) && state.activeCheck?.id !== checkId) return;
    set((state) => {
      const { [checkId]: _carts, ...restCarts } = state.openCheckCarts;
      const { [checkId]: _items, ...restItems } = state.openCheckItems;
      const { [checkId]: _discs, ...restDiscs } = state.openCheckDiscounts;
      void _carts; void _items; void _discs;
      return {
        openChecks: state.openChecks.filter((c) => c.id !== checkId),
        openCheckCarts: restCarts,
        openCheckItems: restItems,
        openCheckDiscounts: restDiscs,
        activeCheck: state.activeCheck?.id === checkId ? null : state.activeCheck,
        cart: state.activeCheck?.id === checkId ? [] : state.cart,
        checkItems: state.activeCheck?.id === checkId ? [] : state.checkItems,
        appliedDiscounts: state.activeCheck?.id === checkId ? [] : state.appliedDiscounts,
      };
    });
  },

  upsertInventoryLocal: (item: InventoryItem) => {
    set((state) => {
      const current = state.inventory;
      const exists = current.find(i => i.id === item.id);
      if (exists) {
        return {
          inventory: current.map(i => i.id === item.id ? item : i)
        };
      } else {
        return {
          inventory: [...current, item].sort((a, b) => a.category.localeCompare(b.category) || a.sort_order - b.sort_order || a.name.localeCompare(b.name))
        };
      }
    });
  },

  upsertCategoryLocal: (category: MenuCategory) => {
    set((state) => {
      const current = state.menuCategories;
      const exists = current.find(c => c.id === category.id);
      if (exists) {
        return {
          menuCategories: current.map(c => c.id === category.id ? category : c)
        };
      } else {
        return {
          menuCategories: [...current, category].sort((a, b) => a.sort_order - b.sort_order)
        };
      }
    });
  },

  upsertCheckItemLocal: (item: CheckItem, modifiers?: { id: string; name: string; price: number }[]) => {
    set((state) => {
      const checkId = item.check_id;
      const currentItems = state.openCheckItems[checkId] || [];
      const itemIdx = currentItems.findIndex((ci) => ci.id === item.id);

      const newItems = [...currentItems];
      if (itemIdx >= 0) {
        newItems[itemIdx] = item;
      } else {
        newItems.push(item);
      }

      const newItemsMap = { ...state.openCheckItems, [checkId]: newItems };

      const prevCart = state.openCheckCarts[checkId] || [];
      const newCart: CartItem[] = newItems.filter((ci) => ci.item).map(ci => {
        if (ci.id === item.id && modifiers !== undefined) {
          return { item: ci.item as InventoryItem, quantity: ci.quantity, modifiers };
        }
        const existing = prevCart.find(pc => pc.item?.id === ci.item_id);
        return { item: ci.item as InventoryItem, quantity: ci.quantity, modifiers: existing?.modifiers || [] };
      });

      const newCartsMap = { ...state.openCheckCarts, [checkId]: newCart };

      const updates: Partial<POSState> = {
        openCheckItems: newItemsMap,
        openCheckCarts: newCartsMap,
      };

      if (state.activeCheck?.id === checkId) {
        updates.checkItems = newItems;
        updates.cart = newCart;
      }

      return updates as Partial<POSState>;
    });
  },

  deleteCheckItemLocal: (checkId: string, checkItemId: string) => {
    set((state) => {
      const currentItems = state.openCheckItems[checkId] || [];
      const removedItem = currentItems.find(ci => ci.id === checkItemId);
      const newItems = currentItems.filter(ci => ci.id !== checkItemId);
      const newItemsMap = { ...state.openCheckItems, [checkId]: newItems };

      const currentCart = state.openCheckCarts[checkId] || [];
      let removed = false;
      const removedModKey = removedItem
        ? (currentCart.find(c => c.item?.id === removedItem.item_id)?.modifiers || []).map(m => m.id).sort().join(',')
        : '';
      const newCart = currentCart.filter((cartItem) => {
        if (!removed && removedItem && cartItem.item?.id === removedItem.item_id) {
          const cartModKey = (cartItem.modifiers || []).map(m => m.id).sort().join(',');
          if (cartModKey === removedModKey) {
            removed = true;
            return false;
          }
        }
        return true;
      });
      const newCartsMap = { ...state.openCheckCarts, [checkId]: newCart };

      const updates: Partial<POSState> = {
        openCheckItems: newItemsMap,
        openCheckCarts: newCartsMap,
      };

      if (state.activeCheck?.id === checkId) {
        updates.checkItems = newItems;
        updates.cart = newCart;
      }

      return updates as Partial<POSState>;
    });
  },
}));

declare global {
  interface Window { __clearPOSState?: () => void; }
}
window.__clearPOSState = () => {
  usePOSStore.setState({ openChecks: [], activeCheck: null, cart: [], checkItems: [], appliedDiscounts: [] });
  useShiftStore.setState({ activeShift: null });
};
