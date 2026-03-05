import { create } from 'zustand';
import type { CartItem, Check, CheckItem, CheckDiscount, InventoryItem, PaymentMethod, Space } from '@/types';
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
  isLoading: boolean;
  checksLoaded: boolean;
  inventoryLoaded: boolean;

  loadInventory: () => Promise<void>;
  loadOpenChecks: () => Promise<void>;
  createCheck: (playerId: string | null, spaceId?: string | null) => Promise<Check | null>;
  updateCheckNote: (note: string) => Promise<void>;
  selectCheck: (check: Check) => Promise<void>;
  addToCart: (item: InventoryItem) => void;
  removeFromCart: (itemId: string) => void;
  updateCartQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  getCartTotal: () => number;
  getDiscountTotal: () => number;
  applyDiscount: (discountId: string, discountName: string, discountType: 'percentage' | 'fixed', discountValue: number, target: 'check' | 'item', itemId?: string) => Promise<void>;
  removeDiscount: (checkDiscountId: string) => Promise<void>;
  saveCartToDb: () => Promise<boolean>;
  refreshActiveCheck: () => Promise<void>;
  closeCheck: (payments: PaymentPortion[], bonusUsed?: number, spaceRental?: number) => Promise<boolean>;
  cancelCheck: () => Promise<boolean>;
  leaveCheck: () => Promise<void>;
}

let _savingCart = false;
export function isSavingCart() { return _savingCart; }

let _lastCartFingerprint = '';
let _savePromise: Promise<void> | null = null;

export const usePOSStore = create<POSState>((set, get) => ({
  openChecks: [],
  activeCheck: null,
  checkItems: [],
  cart: [],
  inventory: [],
  appliedDiscounts: [],
  isLoading: false,
  checksLoaded: false,
  inventoryLoaded: false,

  loadInventory: async () => {
    const { data } = await supabase
      .from('inventory')
      .select('*')
      .eq('is_active', true)
      .order('category')
      .order('sort_order')
      .order('name');
    if (data) set({ inventory: data as InventoryItem[], inventoryLoaded: true });
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
      set({ openChecks: [], checksLoaded: true });
      return;
    }

    const checkIds = checks.map((c) => c.id);
    const { data: allItems } = await supabase
      .from('check_items')
      .select('check_id, quantity, price_at_time')
      .in('check_id', checkIds);

    const totalsMap = new Map<string, number>();
    for (const ci of allItems || []) {
      totalsMap.set(
        ci.check_id,
        (totalsMap.get(ci.check_id) || 0) + ci.quantity * ci.price_at_time,
      );
    }

    const { data: allDiscounts } = await supabase
      .from('check_discounts')
      .select('check_id, discount_amount')
      .in('check_id', checkIds);
    const discountsMap = new Map<string, number>();
    for (const d of allDiscounts || []) {
      discountsMap.set(d.check_id, (discountsMap.get(d.check_id) || 0) + d.discount_amount);
    }

    const checksWithTotals = checks.map((check) => ({
      ...check,
      total_amount: Math.max(0, (totalsMap.get(check.id) || 0) - (discountsMap.get(check.id) || 0)),
    }));

    const prev = get().openChecks;
    const changed =
      checksWithTotals.length !== prev.length ||
      checksWithTotals.some((c, i) =>
        c.id !== prev[i]?.id ||
        c.total_amount !== prev[i]?.total_amount ||
        c.note !== prev[i]?.note ||
        c.guest_names !== prev[i]?.guest_names ||
        c.player_id !== prev[i]?.player_id ||
        c.space_id !== prev[i]?.space_id ||
        c.status !== prev[i]?.status
      );

    if (changed) {
      set({ openChecks: checksWithTotals, checksLoaded: true });
    } else if (!get().checksLoaded) {
      set({ checksLoaded: true });
    }
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
    await supabase.from('checks').update({ note }).eq('id', activeCheck.id);
    set({ activeCheck: { ...activeCheck, note } });
  },

  selectCheck: async (check: Check) => {
    _lastCartFingerprint = '';
    set({ activeCheck: check, isLoading: true, cart: [], appliedDiscounts: [] });
    const { data } = await supabase
      .from('check_items')
      .select('*, item:inventory(*)')
      .eq('check_id', check.id);
    const items = (data || []).map((ci) => ({
      ...ci,
      item: Array.isArray(ci.item) ? ci.item[0] : ci.item,
    })) as CheckItem[];

    const cart: CartItem[] = items
      .filter((ci) => ci.item)
      .map((ci) => ({ item: ci.item!, quantity: ci.quantity }));

    const { data: discountsData } = await supabase
      .from('check_discounts')
      .select('*, discount:discounts(*)')
      .eq('check_id', check.id);
    const discounts = (discountsData || []).map((cd) => ({
      ...cd,
      discount: Array.isArray(cd.discount) ? cd.discount[0] : cd.discount,
    })) as CheckDiscount[];

    _lastCartFingerprint = cart.map((c) => `${c.item.id}:${c.quantity}`).sort().join('|');
    set({ checkItems: items, cart, appliedDiscounts: discounts, isLoading: false });
  },

  addToCart: (item: InventoryItem) => {
    const currentCart = get().cart;
    const idx = currentCart.findIndex((c) => c.item.id === item.id);
    let newCart: CartItem[];
    if (idx >= 0) {
      newCart = currentCart.map((c, i) =>
        i === idx ? { ...c, quantity: c.quantity + 1 } : c
      );
    } else {
      newCart = [...currentCart, { item, quantity: 1 }];
    }
    set({ cart: newCart });
  },

  removeFromCart: (itemId: string) => {
    set({ cart: get().cart.filter((c) => c.item.id !== itemId) });
  },

  updateCartQuantity: (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      get().removeFromCart(itemId);
      return;
    }
    set({
      cart: get().cart.map((c) =>
        c.item.id === itemId ? { ...c, quantity } : c
      ),
    });
  },

  clearCart: () => set({ cart: [] }),

  getCartTotal: () => {
    const subtotal = get().cart.reduce((sum, c) => sum + c.item.price * c.quantity, 0);
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
      const subtotal = cart.reduce((s, c) => s + c.item.price * c.quantity, 0);
      amount = discountType === 'percentage' ? Math.round(subtotal * discountValue / 100) : discountValue;
    } else if (itemId) {
      const ci = cart.find((c) => c.item.id === itemId);
      if (ci) {
        const itemTotal = ci.item.price * ci.quantity;
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

    if (!error && data) {
      const cd = {
        ...data,
        discount: Array.isArray(data.discount) ? data.discount[0] : data.discount,
      } as CheckDiscount;
      set({ appliedDiscounts: [...get().appliedDiscounts, cd] });
    }
  },

  removeDiscount: async (checkDiscountId: string) => {
    await supabase.from('check_discounts').delete().eq('id', checkDiscountId);
    set({ appliedDiscounts: get().appliedDiscounts.filter((d) => d.id !== checkDiscountId) });
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

    const normalizedItems = (items || []).map((ci: any) => ({
      ...ci,
      item: Array.isArray(ci.item) ? ci.item[0] : ci.item,
    }));
    const loadedItems = normalizedItems.filter((ci: any) => ci.item) as CheckItem[];
    const newCart: CartItem[] = loadedItems.map((ci) => ({ item: ci.item!, quantity: ci.quantity }));
    const oldFp = get().cart.map((c) => `${c.item.id}:${c.quantity}`).sort().join('|');
    const newFp = newCart.map((c) => `${c.item.id}:${c.quantity}`).sort().join('|');
    const cartChanged = oldFp !== newFp;

    if (!checkChanged && !cartChanged) return;

    const updates: Partial<ReturnType<typeof get>> = {};
    if (checkChanged) updates.activeCheck = updatedCheck;
    if (cartChanged) {
      updates.cart = newCart;
      updates.checkItems = loadedItems;
      _lastCartFingerprint = newFp;
    }
    set(updates as any);
  },

  saveCartToDb: async (): Promise<boolean> => {
    if (_savePromise) await _savePromise;

    const { activeCheck, cart } = get();
    if (!activeCheck) return true;

    const fp = cart.map((c) => `${c.item.id}:${c.quantity}`).sort().join('|');
    if (fp === _lastCartFingerprint) return true;

    let success = false;
    const doSave = async () => {
      _savingCart = true;
      try {
        const { data: existingCIs } = await supabase
          .from('check_items')
          .select('id, item_id')
          .eq('check_id', activeCheck.id);

        let savedMods: { item_id: string; modifier_id: string; price_at_time: number }[] = [];
        if (existingCIs && existingCIs.length > 0) {
          const ciIds = existingCIs.map((ci: any) => ci.id);
          const { data: mods } = await supabase
            .from('check_item_modifiers')
            .select('check_item_id, modifier_id, price_at_time')
            .in('check_item_id', ciIds);
          if (mods && mods.length > 0) {
            savedMods = mods.map((m: any) => {
              const ci = existingCIs.find((c: any) => c.id === m.check_item_id);
              return { item_id: ci?.item_id, modifier_id: m.modifier_id, price_at_time: m.price_at_time };
            });
          }
        }

        await supabase.from('check_items').delete().eq('check_id', activeCheck.id);
        if (cart.length > 0) {
          const rows = cart.map((c) => ({
            check_id: activeCheck.id,
            item_id: c.item.id,
            quantity: c.quantity,
            price_at_time: c.item.price,
          }));
          const { error, data: newCIs } = await supabase.from('check_items').insert(rows).select('id, item_id');
          if (error) {
            console.error('saveCartToDb insert failed:', error);
            return;
          }

          if (savedMods.length > 0 && newCIs && newCIs.length > 0) {
            const modRows: { check_item_id: string; modifier_id: string; price_at_time: number }[] = [];
            for (const sm of savedMods) {
              const newCI = newCIs.find((ci: any) => ci.item_id === sm.item_id);
              if (newCI) {
                modRows.push({ check_item_id: newCI.id, modifier_id: sm.modifier_id, price_at_time: sm.price_at_time });
              }
            }
            if (modRows.length > 0) {
              await supabase.from('check_item_modifiers').insert(modRows);
            }
          }
        }
        _lastCartFingerprint = fp;
        success = true;
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
    const { activeCheck } = get();
    if (!activeCheck) return false;
    _lastCartFingerprint = '';
    await supabase.from('check_discounts').delete().eq('check_id', activeCheck.id);
    await supabase.from('check_items').delete().eq('check_id', activeCheck.id);
    const { error } = await supabase.from('checks').delete().eq('id', activeCheck.id);
    if (error) {
      console.error('cancelCheck error:', error);
      return false;
    }
    set({ activeCheck: null, cart: [], checkItems: [], appliedDiscounts: [] });
    await get().loadOpenChecks();
    return true;
  },

  leaveCheck: async () => {
    await get().saveCartToDb();
    _lastCartFingerprint = '';
    set({ activeCheck: null, cart: [], checkItems: [], appliedDiscounts: [] });
    await get().loadOpenChecks();
  },

  closeCheck: async (payments: PaymentPortion[], bonusUsed = 0, spaceRental = 0) => {
    const { activeCheck, cart, appliedDiscounts } = get();
    if (!activeCheck) return false;
    const user = useAuthStore.getState().user;
    const total = get().getCartTotal() + spaceRental;
    const discountTotal = get().getDiscountTotal();

    const saved = await get().saveCartToDb();
    if (!saved) return false;

    const finalAmount = bonusUsed > 0 ? Math.max(0, total - bonusUsed) : total;

    const isSplit = payments.length > 1;
    const primaryMethod: PaymentMethod = isSplit ? 'split' : payments[0]?.method || 'cash';

    await supabase
      .from('checks')
      .update({
        status: 'closed',
        total_amount: finalAmount,
        payment_method: primaryMethod,
        bonus_used: bonusUsed,
        discount_total: discountTotal,
        closed_at: new Date().toISOString(),
      })
      .eq('id', activeCheck.id);

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

    const methodDesc = isSplit
      ? 'разд. оплата'
      : primaryMethod;

    await supabase.from('transactions').insert({
      type: 'sale',
      amount: finalAmount,
      description: `Закрытие чека (${methodDesc})`,
      check_id: activeCheck.id,
      player_id: activeCheck.player_id || null,
      created_by: user?.id,
    });

    const itemIds = cart.map((c) => c.item.id);
    const { data: freshItems } = await supabase
      .from('inventory')
      .select('id, stock_quantity')
      .in('id', itemIds);
    if (freshItems) {
      const stockMap = new Map(freshItems.map((i) => [i.id, i.stock_quantity as number]));
      await Promise.all(
        cart.map((c) => {
          const current = stockMap.get(c.item.id) ?? 0;
          if (current > 0) {
            return supabase
              .from('inventory')
              .update({ stock_quantity: Math.max(0, current - c.quantity) })
              .eq('id', c.item.id);
          }
          return Promise.resolve();
        }),
      );
    }

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
      .neq('status', 'cancelled');

    set({ activeCheck: null, cart: [], checkItems: [], appliedDiscounts: [] });
    await get().loadOpenChecks();
    await get().loadInventory();
    return true;
  },
}));

declare global {
  interface Window { __clearPOSState?: () => void; }
}
window.__clearPOSState = () => {
  usePOSStore.setState({ openChecks: [], activeCheck: null, cart: [], checkItems: [], appliedDiscounts: [] });
  useShiftStore.setState({ activeShift: null });
};
