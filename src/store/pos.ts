import { create } from 'zustand';
import type { CartItem, Check, CheckItem, InventoryItem, PaymentMethod } from '@/types';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from './auth';
import { useShiftStore } from './shift';

interface POSState {
  openChecks: Check[];
  activeCheck: Check | null;
  checkItems: CheckItem[];
  cart: CartItem[];
  inventory: InventoryItem[];
  isLoading: boolean;

  loadInventory: () => Promise<void>;
  loadOpenChecks: () => Promise<void>;
  createCheck: (playerId: string | null) => Promise<Check | null>;
  updateCheckNote: (note: string) => Promise<void>;
  selectCheck: (check: Check) => Promise<void>;
  addToCart: (item: InventoryItem) => void;
  removeFromCart: (itemId: string) => void;
  updateCartQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  getCartTotal: () => number;
  saveCartToDb: () => Promise<void>;
  closeCheck: (method: PaymentMethod, bonusUsed?: number) => Promise<boolean>;
  cancelCheck: () => Promise<boolean>;
  leaveCheck: () => Promise<void>;
}

export const usePOSStore = create<POSState>((set, get) => ({
  openChecks: [],
  activeCheck: null,
  checkItems: [],
  cart: [],
  inventory: [],
  isLoading: false,

  loadInventory: async () => {
    const { data } = await supabase
      .from('inventory')
      .select('*')
      .eq('is_active', true)
      .order('category')
      .order('sort_order')
      .order('name');
    if (data) set({ inventory: data as InventoryItem[] });
  },

  loadOpenChecks: async () => {
    const { data } = await supabase
      .from('checks')
      .select('*, player:profiles!checks_player_id_fkey(*)')
      .eq('status', 'open')
      .order('created_at', { ascending: false });
    if (!data) return;

    const checks = data.map((c) => ({
      ...c,
      player: Array.isArray(c.player) ? c.player[0] : c.player,
    })) as Check[];

    const checksWithTotals = await Promise.all(
      checks.map(async (check) => {
        const { data: items } = await supabase
          .from('check_items')
          .select('quantity, price_at_time')
          .eq('check_id', check.id);
        const runningTotal = (items || []).reduce(
          (sum, ci) => sum + ci.quantity * ci.price_at_time,
          0
        );
        return { ...check, total_amount: runningTotal };
      })
    );

    set({ openChecks: checksWithTotals });
  },

  createCheck: async (playerId: string | null) => {
    const user = useAuthStore.getState().user;
    const shift = useShiftStore.getState().activeShift;
    const insert: Record<string, unknown> = {
      staff_id: user?.id,
      shift_id: shift?.id || null,
    };
    if (playerId) insert.player_id = playerId;

    const { data, error } = await supabase
      .from('checks')
      .insert(insert)
      .select('*, player:profiles!checks_player_id_fkey(*)')
      .single();
    if (error || !data) return null;
    const check = {
      ...data,
      player: Array.isArray(data.player) ? data.player[0] : data.player,
    } as Check;
    set({ activeCheck: check, cart: [], checkItems: [] });
    return check;
  },

  updateCheckNote: async (note: string) => {
    const { activeCheck } = get();
    if (!activeCheck) return;
    await supabase.from('checks').update({ note }).eq('id', activeCheck.id);
    set({ activeCheck: { ...activeCheck, note } });
  },

  selectCheck: async (check: Check) => {
    set({ activeCheck: check, isLoading: true, cart: [] });
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

    set({ checkItems: items, cart, isLoading: false });
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
    return get().cart.reduce((sum, c) => sum + c.item.price * c.quantity, 0);
  },

  saveCartToDb: async () => {
    const { activeCheck, cart } = get();
    if (!activeCheck) return;
    await supabase.from('check_items').delete().eq('check_id', activeCheck.id);
    const rows = cart.map((c) => ({
      check_id: activeCheck.id,
      item_id: c.item.id,
      quantity: c.quantity,
      price_at_time: c.item.price,
    }));
    if (rows.length > 0) {
      await supabase.from('check_items').insert(rows);
    }
  },

  cancelCheck: async () => {
    const { activeCheck } = get();
    if (!activeCheck) return false;
    await supabase.from('check_items').delete().eq('check_id', activeCheck.id);
    await supabase.from('checks').delete().eq('id', activeCheck.id);
    set({ activeCheck: null, cart: [], checkItems: [] });
    await get().loadOpenChecks();
    return true;
  },

  leaveCheck: async () => {
    await get().saveCartToDb();
    set({ activeCheck: null, cart: [], checkItems: [] });
    await get().loadOpenChecks();
  },

  closeCheck: async (method: PaymentMethod, bonusUsed = 0) => {
    const { activeCheck, cart } = get();
    if (!activeCheck) return false;
    const user = useAuthStore.getState().user;
    const total = get().getCartTotal();

    await get().saveCartToDb();

    const finalAmount = bonusUsed > 0 ? Math.max(0, total - bonusUsed) : total;

    await supabase
      .from('checks')
      .update({
        status: 'closed',
        total_amount: finalAmount,
        payment_method: method,
        bonus_used: bonusUsed,
        closed_at: new Date().toISOString(),
      })
      .eq('id', activeCheck.id);

    if (activeCheck.player_id) {
      if (method === 'debt') {
        const { data: player } = await supabase
          .from('profiles')
          .select('balance')
          .eq('id', activeCheck.player_id)
          .single();
        if (player) {
          await supabase
            .from('profiles')
            .update({ balance: player.balance - finalAmount })
            .eq('id', activeCheck.player_id);
        }
      }

      const { data: settingsRows } = await supabase.from('app_settings').select('*');
      const cfg: Record<string, string> = {};
      if (settingsRows) for (const r of settingsRows) cfg[r.key] = r.value;
      const bonusEnabled = cfg['bonus_enabled'] !== 'false';
      const bonusRate = Number(cfg['bonus_accrual_rate'] || '10');
      const bonusMin = Number(cfg['bonus_min_purchase'] || '0');
      const bonusOnDebt = cfg['bonus_accrual_on_debt'] === 'true';

      const shouldAccrue = bonusEnabled && total >= bonusMin && (method !== 'debt' || bonusOnDebt);
      const bonusAccrual = shouldAccrue ? Math.floor(total * bonusRate / 100) : 0;

      const { data: player } = await supabase
        .from('profiles')
        .select('bonus_points')
        .eq('id', activeCheck.player_id)
        .single();

      if (player) {
        const newPoints = Math.max(0, player.bonus_points - bonusUsed) + bonusAccrual;
        await supabase
          .from('profiles')
          .update({ bonus_points: newPoints })
          .eq('id', activeCheck.player_id);
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
      }
    }

    await supabase.from('transactions').insert({
      type: 'sale',
      amount: finalAmount,
      description: `Закрытие чека (${method})`,
      check_id: activeCheck.id,
      player_id: activeCheck.player_id || null,
      created_by: user?.id,
    });

    for (const c of cart) {
      const { data: fresh } = await supabase
        .from('inventory')
        .select('stock_quantity')
        .eq('id', c.item.id)
        .single();
      if (fresh && fresh.stock_quantity > 0) {
        await supabase
          .from('inventory')
          .update({ stock_quantity: Math.max(0, fresh.stock_quantity - c.quantity) })
          .eq('id', c.item.id);
      }
    }

    set({ activeCheck: null, cart: [], checkItems: [] });
    await get().loadOpenChecks();
    await get().loadInventory();
    return true;
  },
}));
