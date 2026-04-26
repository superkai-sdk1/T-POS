import { create } from 'zustand';
import { select, selectOne, update, insert, deleteRows } from '@/lib/db';
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
      const orderResult = await insert('tablet_orders', {
        space_id: spaceId,
        profile_id: profileId,
        status: 'pending',
        comment: comment.trim() || null,
      });
      
      if (orderResult.error || !orderResult.data) throw new Error(orderResult.error || 'Failed to create order');

      const order = orderResult.data;

      const itemsToInsert = cart.map((c) => ({
        order_id: order.id,
        item_id: c.item.id,
        quantity: c.quantity,
      }));

      const itemsResult = await insert('tablet_order_items', itemsToInsert);

      if (itemsResult.error) throw new Error(itemsResult.error);

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
    const result = await select('tablet_orders', { space_id: spaceId, profile_id: profileId }, '*');
    if (result.error || !result.data) {
      console.error('[tablet] loadMyOrders error:', result.error);
      return;
    }
    
    const orders = result.data as any[];
    
    // Load items for each order
    for (const order of orders) {
      const itemsResult = await select('tablet_order_items', { order_id: order.id }, '*');
      if (!itemsResult.error && itemsResult.data) {
        (order as any).items = itemsResult.data;
      }
    }

    set({ myOrders: orders as TabletOrder[] });
  },

  loadCheckState: async (spaceId: string) => {
    const result = await select('checks', { space_id: spaceId, status: 'open' }, 'id, total_amount, status, created_at');
    
    if (result.error) {
      console.error('[tablet] loadCheckState error:', result.error);
    }

    const data = result.data?.[0];
    
    // Load space info for hourly rate
    let rentalAmount = 0;
    if (data) {
      const spaceResult = await select('spaces', { id: spaceId }, 'hourly_rate');
      if (!spaceResult.error && spaceResult.data?.[0]?.hourly_rate) {
        const hourlyRate = spaceResult.data[0].hourly_rate;
        const elapsedMs = Date.now() - new Date(data.created_at).getTime();
        const mins = Math.max(0, Math.floor(elapsedMs / 60000));
        const roundedMins = Math.ceil(mins / 30) * 30;
        rentalAmount = Math.round((hourlyRate / 60) * roundedMins);
      }
    }

    set({ 
      hasOpenCheck: !!data,
      currentCheckTotal: (data?.total_amount || 0) + rentalAmount,
      spaceRentalAmount: rentalAmount,
    });
  },

  loadCheckItems: async (spaceId: string) => {
    // Find the open check for this space
    const checkResult = await select('checks', { space_id: spaceId, status: 'open' }, 'id');
    
    if (checkResult.error || !checkResult.data || checkResult.data.length === 0) {
      set({ currentCheckItems: [] });
      return;
    }

    const check = checkResult.data[0];
    
    const itemsResult = await select('check_items', { check_id: check.id }, '*');
    
    if (itemsResult.error) {
      console.error('[tablet] loadCheckItems error:', itemsResult.error);
      set({ currentCheckItems: [] });
      return;
    }

    set({ currentCheckItems: (itemsResult.data || []) as CheckItem[] });
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

    // WebSocket subscriptions will be handled by a separate WebSocket client
    // For now, we rely on polling as a fallback

    return () => {
      clearInterval(pollInterval);
    };
  },

  callStaff: async (spaceId: string, profileId: string, type: 'waiter' | 'check' | 'payment') => {
    const cmts = {
      waiter: '[ВЫЗОВ] Подойдите к столику',
      check: '[СЧЁТ] Рассчитайте гостей',
      payment: '[ОПЛАТА] Гости хотят оплатить',
    };
    
    try {
      const result = await insert('tablet_orders', {
        space_id: spaceId,
        profile_id: profileId,
        status: 'pending',
        comment: cmts[type],
      });

      if (result.error) {
        console.error('[tablet] callStaff error:', result.error);
        return false;
      }

      hapticFeedback('light');
      return true;
    } catch (err: any) {
      console.error('[tablet] callStaff error:', err);
      return false;
    }
  },

  cancelOrder: async (orderId: string) => {
    try {
      const result = await update('tablet_orders', { id: orderId }, { status: 'cancelled' });
      
      if (result.error) {
        console.error('[tablet] cancelOrder error:', result.error);
        return false;
      }

      hapticFeedback('light');
      hapticNotification('warning');
      return true;
    } catch {
      hapticNotification('error');
      return false;
    }
  },
}));
