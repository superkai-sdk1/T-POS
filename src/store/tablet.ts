import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { getTelegramWebApp, hapticFeedback, hapticNotification } from '@/lib/telegram';
import type { InventoryItem, TabletOrder, TabletOrderItem, CheckItem } from '@/types';

interface CartItem {
  item: InventoryItem;
  quantity: number;
}

interface TabletState {
  cart: CartItem[];
  isSubmitting: boolean;
  error: string | null;
  comment: string;
  orderSentMessage: string | null; // "Заказ отправлен" notification

  // Check state
  hasOpenCheck: boolean;
  currentCheckTotal: number | null;
  currentCheckItems: CheckItem[];
  spaceRentalAmount: number;
  
  // Orders
  myOrders: TabletOrder[];

  // Actions
  addComment: (text: string) => void;
  addToCart: (item: InventoryItem) => void;
  removeFromCart: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  submitOrder: (spaceId: string, profileId: string) => Promise<boolean>;
  dismissOrderSent: () => void;
  
  loadMyOrders: (spaceId: string, profileId: string) => Promise<void>;
  subscribeToSpace: (spaceId: string, profileId: string) => () => void;
  loadCheckState: (spaceId: string) => Promise<void>;
  loadCheckItems: (spaceId: string) => Promise<void>;
  callStaff: (spaceId: string, profileId: string, type: 'waiter' | 'check' | 'payment') => Promise<boolean>;
  cancelOrder: (orderId: string) => Promise<boolean>;
}

export const useTabletStore = create<TabletState>((set, get) => ({
  cart: [],
  myOrders: [],
  hasOpenCheck: false,
  currentCheckTotal: null,
  currentCheckItems: [],
  spaceRentalAmount: 0,
  isSubmitting: false,
  error: null,
  comment: '',
  orderSentMessage: null,

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

  dismissOrderSent: () => set({ orderSentMessage: null }),

  submitOrder: async (spaceId: string, profileId: string) => {
    const { cart, comment } = get();
    if (cart.length === 0) return false;

    set({ isSubmitting: true, error: null });

    try {
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

      const itemsToInsert = cart.map((c) => ({
        order_id: order.id,
        item_id: c.item.id,
        quantity: c.quantity,
      }));

      const { error: itemsError } = await supabase
        .from('tablet_order_items')
        .insert(itemsToInsert);

      if (itemsError) throw new Error(itemsError.message);

      set({ 
        cart: [], 
        comment: '', 
        isSubmitting: false,
        orderSentMessage: 'Заказ отправлен! Пожалуйста, ожидайте подтверждения.',
      });
      hapticNotification('success');

      // Auto-dismiss after 5 seconds
      setTimeout(() => {
        if (get().orderSentMessage) set({ orderSentMessage: null });
      }, 5000);

      return true;
    } catch (err: any) {
      console.error('Error submitting tablet order:', err);
      set({ error: err.message, isSubmitting: false });
      hapticNotification('error');
      return false;
    }
  },

  loadMyOrders: async (spaceId: string, profileId: string) => {
    const { data } = await supabase
      .from('tablet_orders')
      .select(`
        *,
        items:tablet_order_items(
          *,
          item:inventory(name, price)
        )
      `)
      .eq('space_id', spaceId)
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false });

    if (data) {
      set({ myOrders: data as TabletOrder[] });
    }
  },

  loadCheckState: async (spaceId: string) => {
    const { data, error } = await supabase
      .from('checks')
      .select('id, total_amount, status, created_at, space:spaces!checks_space_id_fkey(hourly_rate)')
      .eq('space_id', spaceId)
      .eq('status', 'open')
      .maybeSingle();

    if (error) {
      console.error('[tablet] loadCheckState error:', error);
    }

    // Calculate current rental if space has hourly_rate
    let rentalAmount = 0;
    if (data && (data as any).space?.hourly_rate) {
      const hourlyRate = (data as any).space.hourly_rate;
      const elapsedMs = Date.now() - new Date(data.created_at).getTime();
      const mins = Math.max(0, Math.floor(elapsedMs / 60000));
      const roundedMins = Math.ceil(mins / 30) * 30;
      rentalAmount = Math.round((hourlyRate / 60) * roundedMins);
    }

    set({ 
      hasOpenCheck: !!data,
      currentCheckTotal: (data?.total_amount || 0) + rentalAmount,
      spaceRentalAmount: rentalAmount,
    });
  },

  loadCheckItems: async (spaceId: string) => {
    // Find the open check for this space
    const { data: check } = await supabase
      .from('checks')
      .select('id')
      .eq('space_id', spaceId)
      .eq('status', 'open')
      .maybeSingle();

    if (!check) {
      set({ currentCheckItems: [] });
      return;
    }

    const { data: items } = await supabase
      .from('check_items')
      .select('*, item:inventory(name, price, image_url)')
      .eq('check_id', check.id)
      .order('created_at', { ascending: true });

    set({ currentCheckItems: (items || []) as CheckItem[] });
  },

  subscribeToSpace: (spaceId: string, profileId: string) => {
    // Initial load
    get().loadMyOrders(spaceId, profileId);
    get().loadCheckState(spaceId);

    // Track previous check state for polling-based detection
    let prevHadCheck = get().hasOpenCheck;

    // Poll for check state + orders every 8s — with close detection fallback
    const pollInterval = setInterval(async () => {
      const prevState = get().hasOpenCheck;
      await get().loadCheckState(spaceId);
      const newState = get().hasOpenCheck;

      // Detect check closure via polling (if Realtime didn't fire)
      if (prevState && !newState) {
        console.log('[tablet] Poll detected check closed — clearing history');
        set({ myOrders: [], currentCheckItems: [], cart: [], comment: '' });
      }

      // Only reload orders if check is open
      if (newState) {
        get().loadMyOrders(spaceId, profileId);
      }
    }, 8000);

    // Subscribe to tablet_orders changes for this profile
    const ordersChannel = supabase.channel('my-tablet-orders')
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'tablet_orders',
          filter: `profile_id=eq.${profileId}`
        },
        (payload: any) => {
          const prevOrder = get().myOrders.find(o => o.id === payload.new?.id);
          get().loadMyOrders(spaceId, profileId);
          get().loadCheckState(spaceId);

          if (payload.eventType === 'UPDATE' && prevOrder && prevOrder.status !== payload.new.status) {
            if (payload.new.status === 'accepted') {
              hapticNotification('success');
            } else if (payload.new.status === 'rejected') {
              hapticNotification('error');
            }
          }
        }
      )
      .subscribe();

    // Subscribe to checks changes for this space (detect check open/close/delete)
    const checksChannel = supabase.channel('tablet-check-watch')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'checks',
          filter: `space_id=eq.${spaceId}`
        },
        (payload: any) => {
          console.log('[tablet] checks realtime event:', payload.eventType, payload.new?.status);
          // If check was closed, clear order history for this tablet
          if (payload.eventType === 'UPDATE' && payload.new?.status === 'closed') {
            set({ myOrders: [], currentCheckItems: [], cart: [], comment: '' });
            get().loadCheckState(spaceId);
          }
          // If check was deleted, same thing
          if (payload.eventType === 'DELETE') {
            set({ myOrders: [], currentCheckItems: [], cart: [], comment: '' });
            get().loadCheckState(spaceId);
          }
          // If check was opened, reload state
          if (payload.eventType === 'INSERT') {
            get().loadCheckState(spaceId);
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(pollInterval);
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(checksChannel);
    };
  },

  callStaff: async (spaceId: string, profileId: string, type: 'waiter' | 'check' | 'payment') => {
    const cmts = {
      waiter: '[ВЫЗОВ] Подойдите к столику',
      check: '[СЧЁТ] Рассчитайте гостей',
      payment: '[ОПЛАТА] Гости хотят оплатить',
    };
    
    try {
      const { error } = await supabase
        .from('tablet_orders')
        .insert({
          space_id: spaceId,
          profile_id: profileId,
          status: 'pending',
          comment: cmts[type],
        });

      if (error) throw error;
      hapticNotification('success');
      return true;
    } catch {
      hapticNotification('error');
      return false;
    }
  },

  cancelOrder: async (orderId: string) => {
    try {
      const { error } = await supabase
        .from('tablet_orders')
        .update({ status: 'cancelled' })
        .eq('id', orderId)
        .eq('status', 'pending');

      if (error) throw error;
      set((state) => ({
        myOrders: state.myOrders.filter((o) => o.id !== orderId),
      }));
      hapticNotification('warning');
      return true;
    } catch {
      hapticNotification('error');
      return false;
    }
  },
}));
