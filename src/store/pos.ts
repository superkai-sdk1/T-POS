import { create } from 'zustand';
import type { CartItem, Check, CheckItem, CheckDiscount, InventoryItem, PaymentMethod, Modifier, MenuCategory, Discount } from '@/types';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from './auth';
import { useShiftStore } from './shift';

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
  isLoading: boolean;
  checksLoaded: boolean;
  inventoryLoaded: boolean;
  categoriesLoaded: boolean;

  loadInventory: () => Promise<void>;
  loadMenuCategories: () => Promise<void>;
  loadOpenChecks: () => Promise<void>;
  createCheck: (playerId: string | null, spaceId?: string | null) => Promise<Check | null>;
  updateCheckNote: (note: string) => Promise<void>;
  selectCheck: (check: Check) => Promise<void>;
  addToCart: (item: InventoryItem, modifiers?: { id: string; name: string; price: number }[]) => void;
  removeFromCart: (itemId: string, modifierKey?: string) => void;
  updateCartQuantity: (itemId: string, quantity: number, modifierKey?: string) => void;
  clearCart: () => void;
  getCartTotal: () => number;
  getDiscountTotal: () => number;
  applyDiscount: (discountId: string, discountName: string, discountType: 'percentage' | 'fixed', discountValue: number, target: 'check' | 'item', itemId?: string) => Promise<void>;
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

const _cancellingCheckIds = new Set<string>();
export function isCancellingCheck(checkId: string) { return _cancellingCheckIds.has(checkId); }

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
  isLoading: false,
  checksLoaded: false,
  inventoryLoaded: false,
  categoriesLoaded: false,

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
      .select('*')
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
      set({
        inventory: invData as InventoryItem[],
        productModifiers: modMap,
        inventoryLoaded: true
      });
    }
  },

  loadOpenChecks: async () => {
    const { data } = await supabase
      .from('checks')
      .select('*, player:profiles!checks_player_id_fkey(*), space:spaces!checks_space_id_fkey(*)')
      .eq('status', 'open')
      .order('created_at', { ascending: false });
    if (!data) return;

    const checks = data.map((c) => ({
      ...c,
      player: Array.isArray(c.player) ? c.player[0] : c.player,
      space: Array.isArray(c.space) ? c.space[0] : c.space,
    })) as Check[];

    if (checks.length === 0) {
      set({ openChecks: [], openCheckCarts: {}, openCheckItems: {}, openCheckDiscounts: {}, checksLoaded: true });
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
      const rowTotal = (ci.item.price + modTotal) * ci.quantity;
      totalsMap.set(ci.check_id, (totalsMap.get(ci.check_id) || 0) + rowTotal);

      newCartsMap[ci.check_id].push({
        item: ci.item,
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
      checksLoaded: true
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
      .select('*, player:profiles!checks_player_id_fkey(*), space:spaces!checks_space_id_fkey(*)')
      .single();
    if (error || !data) return null;
    const check = {
      ...data,
      player: Array.isArray(data.player) ? data.player[0] : data.player,
      space: Array.isArray(data.space) ? data.space[0] : data.space,
    } as Check;
    _lastCartFingerprint = '';
    set({ activeCheck: check, cart: [], checkItems: [], appliedDiscounts: [] });
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

  applyDiscount: async (discountId, discountName, discountType, discountValue, target, itemId) => {
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
      const ci = cart.find((c) => c?.item?.id === itemId);
      if (ci) {
        const modPrice = (ci.modifiers || []).reduce((ms, m) => ms + m.price, 0);
        const itemTotal = (ci.item.price + modPrice) * ci.quantity;
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
      .select('*, player:profiles!checks_player_id_fkey(*), space:spaces!checks_space_id_fkey(*)')
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

    const newCart: CartItem[] = loadedItems.filter((ci) => ci.item).map((ci) => ({
      item: ci.item as InventoryItem,
      quantity: ci.quantity,
      modifiers: modMap[ci.id] || undefined,
    }));

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
              console.error('saveCartToDb upsert error:', upErr);
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
              console.error('saveCartToDb insert error:', insErr);
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
        console.error('saveCartToDb error:', err);
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
    const prevFp = _lastCartFingerprint;
    _lastCartFingerprint = '';
    _cancellingCheckIds.add(checkId);
    set({ activeCheck: null, cart: [], checkItems: [], appliedDiscounts: [] });
    get().deleteCheckLocal(checkId);
    const { error: discErr } = await supabase.from('check_discounts').delete().eq('check_id', checkId);
    const { error: itemsErr } = await supabase.from('check_items').delete().eq('check_id', checkId);
    if (discErr || itemsErr) {
      console.error('cancelCheck cleanup error:', discErr || itemsErr);
      _cancellingCheckIds.delete(checkId);
      _lastCartFingerprint = prevFp;
      set({ activeCheck, cart, checkItems, appliedDiscounts });
      await get().loadOpenChecks();
      return false;
    }
    const { error } = await supabase.from('checks').delete().eq('id', checkId);
    if (error) {
      console.error('cancelCheck error:', error);
      _cancellingCheckIds.delete(checkId);
      _lastCartFingerprint = prevFp;
      set({ activeCheck, cart, checkItems, appliedDiscounts });
      await get().loadOpenChecks();
      return false;
    }
    _cancellingCheckIds.delete(checkId);
    await get().loadOpenChecks();
    return true;
  },

  leaveCheck: async () => {
    get().saveCartToDb(); // Fire and forget
    _lastCartFingerprint = '';
    set({ activeCheck: null, cart: [], checkItems: [], appliedDiscounts: [] });
    get().loadOpenChecks(); // Fire and forget background reload
  },

  closeCheck: async (payments: PaymentPortion[], bonusUsed = 0, spaceRental = 0, certificateUsed = 0, certificateId: string | null = null) => {
    const { activeCheck, cart } = get();
    if (!activeCheck) return false;
    const user = useAuthStore.getState().user;
    const total = get().getCartTotal() + spaceRental;
    const discountTotal = get().getDiscountTotal();

    const saved = await get().saveCartToDb();
    if (!saved) return false;

    const finalAmount = Math.max(0, total - bonusUsed - certificateUsed);

    const isSplit = payments.length > 1;
    const primaryMethod: PaymentMethod = isSplit ? 'split' : payments[0]?.method || 'cash';

    const { error: closeErr } = await supabase
      .from('checks')
      .update({
        status: 'closed',
        total_amount: finalAmount,
        payment_method: payments.length > 0 ? primaryMethod : 'cash',
        bonus_used: bonusUsed,
        certificate_used: certificateUsed,
        certificate_id: certificateId,
        discount_total: discountTotal,
        closed_at: new Date().toISOString(),
      })
      .eq('id', activeCheck.id);

    if (closeErr) {
      console.error('closeCheck update error:', closeErr);
      return false;
    }

    set((state) => ({
      openChecks: state.openChecks.filter(c => c.id !== activeCheck.id),
      activeCheck: null,
      cart: [],
      checkItems: [],
      appliedDiscounts: []
    }));

    if (payments.length > 0) {
      const paymentRows = payments.map((p) => ({
        check_id: activeCheck.id,
        method: p.method,
        amount: p.amount,
      }));
      await supabase.from('check_payments').insert(paymentRows);
    }

    if (activeCheck.player_id) {
      const debtAmount = payments
        .filter((p) => p.method === 'debt')
        .reduce((s, p) => s + p.amount, 0);

      const { data: settingsRows } = await supabase.from('app_settings').select('*');
      const cfg: Record<string, string> = {};
      if (settingsRows) for (const r of settingsRows) cfg[r.key] = r.value;
      const bonusEnabled = cfg['bonus_enabled'] !== 'false';
      const bonusRate = Number(cfg['bonus_accrual_rate'] || '10');
      const bonusMin = Number(cfg['bonus_min_purchase'] || '0');
      const bonusOnDebt = cfg['bonus_accrual_on_debt'] === 'true';

      const hasNonDebt = payments.some((p) => p.method !== 'debt');
      const shouldAccrue = bonusEnabled && total >= bonusMin && (hasNonDebt || bonusOnDebt);
      const bonusAccrual = shouldAccrue ? Math.floor(total * bonusRate / 100) : 0;

      const { data: player } = await supabase
        .from('profiles')
        .select('balance, bonus_points')
        .eq('id', activeCheck.player_id)
        .single();

      if (player) {
        const updates: Record<string, number> = {};
        if (debtAmount > 0) {
          updates.balance = player.balance - debtAmount;
        }
        const newPoints = Math.max(0, player.bonus_points - bonusUsed) + bonusAccrual;
        if (bonusUsed > 0 || bonusAccrual > 0) {
          updates.bonus_points = newPoints;
        }
        if (Object.keys(updates).length > 0) {
          await supabase
            .from('profiles')
            .update(updates)
            .eq('id', activeCheck.player_id);
        }
      }

      if (bonusUsed > 0) {
        await supabase.from('transactions').insert({
          type: 'bonus_spend',
          amount: bonusUsed,
          description: `Списание бонусов по чеку`,
          check_id: activeCheck.id,
          player_id: activeCheck.player_id,
          created_by: user?.id,
        });
        if (player) {
          await supabase.from('bonus_history').insert({
            profile_id: activeCheck.player_id,
            amount: -bonusUsed,
            balance_after: Math.max(0, player.bonus_points - bonusUsed),
            reason: 'Списание по чеку',
          });
        }
      }
      if (bonusAccrual > 0) {
        await supabase.from('transactions').insert({
          type: 'bonus_accrual',
          amount: bonusAccrual,
          description: `Начисление бонусов (${bonusRate}% от ${total}₽)`,
          check_id: activeCheck.id,
          player_id: activeCheck.player_id,
          created_by: user?.id,
        });
        if (player) {
          const newPts = Math.max(0, player.bonus_points - bonusUsed) + bonusAccrual;
          await supabase.from('bonus_history').insert({
            profile_id: activeCheck.player_id,
            amount: bonusAccrual,
            balance_after: newPts,
            reason: `Начисление ${bonusRate}% от ${total}₽`,
          });
        }
      }
    }

    const methodDesc = certificateUsed > 0
      ? (payments.length > 0 ? `сертификат + ${isSplit ? 'разд. оплата' : primaryMethod}` : 'сертификат')
      : (isSplit ? 'разд. оплата' : primaryMethod);

    await supabase.from('transactions').insert({
      type: 'sale',
      amount: finalAmount,
      description: `Закрытие чека (${methodDesc})`,
      check_id: activeCheck.id,
      player_id: activeCheck.player_id || null,
      created_by: user?.id,
    });

    if (certificateUsed > 0) {
      await supabase.from('transactions').insert({
        type: 'sale',
        amount: 0,
        description: `Оплата сертификатом: ${certificateUsed}₽${certificateId ? ` (${certificateId.slice(0, 8)})` : ''}`,
        check_id: activeCheck.id,
        player_id: activeCheck.player_id || null,
        created_by: user?.id,
      });
    }

    const qtyByItemId = new Map<string, number>();
    for (const c of cart.filter((x) => x?.item)) {
      qtyByItemId.set(c.item.id, (qtyByItemId.get(c.item.id) || 0) + c.quantity);
    }
    await Promise.all(
      [...qtyByItemId.entries()].map(([itemId, soldQty]) =>
        supabase.rpc('decrement_stock', { p_item_id: itemId, p_qty: soldQty })
      ),
    );

    if (activeCheck.space_id) {
      await supabase
        .from('bookings')
        .update({ status: 'completed' })
        .eq('check_id', activeCheck.id)
        .eq('status', 'active');
    }

    await supabase
      .from('events')
      .update({ status: 'completed' })
      .eq('check_id', activeCheck.id)
      .neq('status', 'completed');

    await get().loadOpenChecks();
    await get().loadInventory();
    return true;
  },

  refreshCheckById: async (checkId: string) => {
    if (_cancellingCheckIds.has(checkId)) return;

    const { data: checkData } = await supabase
      .from('checks')
      .select('*, player:profiles!checks_player_id_fkey(*), space:spaces!checks_space_id_fkey(*)')
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

    const cart: CartItem[] = items.map(ci => ({
      item: ci.item!,
      quantity: ci.quantity,
      modifiers: modMap[ci.id],
    }));

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
