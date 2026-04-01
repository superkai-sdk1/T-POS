import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { hapticFeedback, hapticNotification } from '@/lib/telegram';
import { usePOSStore } from '@/store/pos';
import { useShiftStore } from '@/store/shift';
import type { TabletOrder, TabletOrderItem } from '@/types';

// Web Audio API context for playing sound
let audioCtx: AudioContext | null = null;

function playNotificationSound() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Resume context if suspended (browser auto-play policy)
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    // Nice ding sound
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
    osc.frequency.exponentialRampToValueAtTime(1760, audioCtx.currentTime + 0.1); // Up to A6

    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);

    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.5);
  } catch (e) {
    console.warn('Audio playback failed', e);
  }
}

interface AdminTabletState {
  pendingOrders: TabletOrder[];
  hasUnread: boolean;
  isLoading: boolean;
  loadPendingOrders: () => Promise<void>;
  subscribeToOrders: () => () => void;
  acceptOrder: (orderId: string, authorId: string) => Promise<boolean>;
  rejectOrder: (orderId: string, processorId: string) => Promise<boolean>;
  openOrderSpaceCheck: (spaceId: string, adminId: string) => Promise<string | null>;
  markAsRead: () => void;
}

export const useAdminTabletStore = create<AdminTabletState>((set, get) => ({
  pendingOrders: [],
  hasUnread: false,
  isLoading: true,

  loadPendingOrders: async () => {
    set({ isLoading: true });
    const { data, error } = await supabase
      .from('tablet_orders')
      .select(`
        *,
        space:spaces!tablet_orders_space_id_fkey(id, name),
        profile:profiles!tablet_orders_profile_id_fkey(id, nickname, photo_url),
        items:tablet_order_items(
          *,
          item:inventory(*)
        )
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[tablet-admin] loadPendingOrders error:', error);
      // Fallback: load without joins
      const { data: fallback } = await supabase
        .from('tablet_orders')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (fallback) {
        set({ pendingOrders: fallback as TabletOrder[] });
      }
    } else if (data) {
      set({ pendingOrders: data as TabletOrder[] });
    }
    set({ isLoading: false });
  },

  subscribeToOrders: () => {
    get().loadPendingOrders();

    const channel = supabase.channel('admin-tablet-orders')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tablet_orders' },
        () => {
          // New order!
          get().loadPendingOrders();
          set({ hasUnread: true });
          playNotificationSound();
          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
          hapticNotification('success');
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tablet_orders' },
        () => {
          // Status changed (accepted/rejected by someone else)
          get().loadPendingOrders();
        }
      )
      .subscribe();

    // Polling fallback every 10s in case Realtime isn't working
    const prevCount = { value: get().pendingOrders.length };
    const pollInterval = setInterval(async () => {
      await get().loadPendingOrders();
      const newCount = get().pendingOrders.length;
      if (newCount > prevCount.value) {
        set({ hasUnread: true });
        playNotificationSound();
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        hapticNotification('success');
      }
      prevCount.value = newCount;
    }, 10000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  },

  acceptOrder: async (orderId: string, adminId: string) => {
    const order = get().pendingOrders.find(o => o.id === orderId);
    if (!order) return false;

    // 1. Check if there's an open check for this space
    const openChecks = usePOSStore.getState().openChecks;
    const targetCheck = openChecks.find(c => c.space_id === order.space_id);

    if (!targetCheck) {
      // Must open a check first! We will return false and handle it in UI
      return false;
    }

    try {
      if (order.items && order.items.length > 0) {
        const checkItemsData = order.items.map(oi => ({
          check_id: targetCheck.id,
          item_id: oi.item_id,
          quantity: oi.quantity,
          price_at_time: oi.item!.price, // current price at time of acceptance
        }));

        const { error: itemsErr } = await supabase.from('check_items').insert(checkItemsData);
        if (itemsErr) throw itemsErr;
      }

      // 3. Update order status
      const { error: updErr } = await supabase
        .from('tablet_orders')
        .update({ status: 'accepted', processed_by: adminId })
        .eq('id', orderId);

      if (updErr) throw updErr;

      // 4. Reload pos checks to reflect new items
      await usePOSStore.getState().loadOpenChecks();
      get().loadPendingOrders();
      hapticNotification('success');
      return true;
    } catch (e: any) {
      console.error('Error accepting order:', e);
      hapticNotification('error');
      return false;
    }
  },

  rejectOrder: async (orderId: string, adminId: string) => {
    try {
      const { error } = await supabase
        .from('tablet_orders')
        .update({ status: 'rejected', processed_by: adminId })
        .eq('id', orderId);

      if (error) throw error;
      
      get().loadPendingOrders();
      hapticNotification('warning');
      return true;
    } catch (e) {
      console.error(e);
      hapticNotification('error');
      return false;
    }
  },

  openOrderSpaceCheck: async (spaceId: string, adminId: string) => {
    try {
      const activeShift = useShiftStore.getState().activeShift;
      if (!activeShift) {
        console.error('[tablet-admin] No active shift — cannot create check');
        return null;
      }
      // Create new empty check for the space
      const { data, error } = await supabase.from('checks').insert({
        staff_id: adminId,
        shift_id: activeShift.id,
        space_id: spaceId,
        status: 'open',
      }).select('id').single();

      if (error || !data) throw error;
      await usePOSStore.getState().loadOpenChecks();
      return data.id as string;
    } catch (e) {
      console.error(e);
      return null;
    }
  },

  markAsRead: () => set({ hasUnread: false }),
}));
