import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { getTelegramWebApp, hapticFeedback, hapticNotification } from '@/lib/telegram';
import type { InventoryItem, TabletOrder, TabletOrderItem } from '@/types';

interface CartItem {
  item: InventoryItem;
  quantity: number;
}

interface TabletState {
  cart: CartItem[];
  isSubmitting: boolean;
  error: string | null;
  comment: string;
  addComment: (text: string) => void;
  addToCart: (item: InventoryItem) => void;
  removeFromCart: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  submitOrder: (spaceId: string, profileId: string) => Promise<boolean>;
}

export const useTabletStore = create<TabletState>((set, get) => ({
  cart: [],
  isSubmitting: false,
  error: null,
  comment: '',

  addComment: (text: string) => set({ comment: text }),

  addToCart: (item: InventoryItem) => {
    hapticFeedback('light');
    set((state) => {
      const existing = state.cart.find((c) => c.item.id === item.id);
      if (existing) {
        return {
          cart: state.cart.map((c) =>
            c.item.id === item.id ? { ...c, quantity: c.quantity + 1 } : c
          ),
        };
      }
      return { cart: [...state.cart, { item, quantity: 1 }] };
    });
  },

  removeFromCart: (itemId: string) => {
    hapticFeedback('medium');
    set((state) => ({
      cart: state.cart.filter((c) => c.item.id !== itemId),
    }));
  },

  updateQuantity: (itemId: string, quantity: number) => {
    hapticFeedback('light');
    if (quantity <= 0) {
      get().removeFromCart(itemId);
      return;
    }
    set((state) => ({
      cart: state.cart.map((c) =>
        c.item.id === itemId ? { ...c, quantity } : c
      ),
    }));
  },

  clearCart: () => set({ cart: [], comment: '' }),

  submitOrder: async (spaceId: string, profileId: string) => {
    const { cart, comment } = get();
    if (cart.length === 0) return false;

    set({ isSubmitting: true, error: null });

    try {
      // 1. Create order
      const { data: order, error: orderError } = await supabase
        .from('tablet_orders')
        .insert({
          space_id: spaceId,
          profile_id: profileId,
          status: 'pending',
          comment: comment.trim() || null,
        })
        .select()
        .single();

      if (orderError || !order) throw new Error(orderError?.message || 'Failed to create order');

      // 2. Insert items
      const itemsToInsert = cart.map((c) => ({
        order_id: order.id,
        item_id: c.item.id,
        quantity: c.quantity,
      }));

      const { error: itemsError } = await supabase
        .from('tablet_order_items')
        .insert(itemsToInsert);

      if (itemsError) throw new Error(itemsError.message);

      // Success
      set({ cart: [], comment: '', isSubmitting: false });
      hapticNotification('success');
      return true;

    } catch (err: any) {
      console.error('Error submitting tablet order:', err);
      set({ error: err.message, isSubmitting: false });
      hapticNotification('error');
      return false;
    }
  },
}));
