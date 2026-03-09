import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { usePOSStore, isSavingCart } from '@/store/pos';
import { useShiftStore } from '@/store/shift';

function emitTableChange(table: string) {
  window.dispatchEvent(new CustomEvent('rt:change', { detail: table }));
}

export function useRealtimeSync() {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    const debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {};

    const debounced = (key: string, fn: () => void, ms = 500) => {
      if (debounceTimers[key]) clearTimeout(debounceTimers[key]);
      debounceTimers[key] = setTimeout(fn, ms);
    };

    const channel = supabase
      .channel('tpos-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'checks' },
        (payload: any) => {
          if (payload.eventType === 'DELETE') {
            usePOSStore.getState().deleteCheckLocal(payload.old.id);
          } else {
            usePOSStore.getState().refreshCheckById(payload.new.id);
          }
          emitTableChange('checks');
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'check_items' },
        (payload: any) => {
          if (isSavingCart()) return;
          const checkId = payload.new ? payload.new.check_id : payload.old.check_id;
          if (checkId) usePOSStore.getState().refreshCheckById(checkId);
          emitTableChange('check_items');
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'check_discounts' },
        (payload: any) => {
          const checkId = payload.new ? payload.new.check_id : payload.old.check_id;
          if (checkId) usePOSStore.getState().refreshCheckById(checkId);
          emitTableChange('check_discounts');
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory' },
        () => debounced('inventory', () => {
          usePOSStore.getState().loadInventory();
          emitTableChange('inventory');
        }),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shifts' },
        () => debounced('shifts', () => {
          useShiftStore.getState().loadActiveShift();
          emitTableChange('shifts');
        }),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cash_operations' },
        () => debounced('cash_ops', () => {
          emitTableChange('cash_operations');
        }),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => debounced('profiles', () => {
          emitTableChange('profiles');
        }),
      )
      .subscribe();

    channelRef.current = channel;

    // Aggressive reconnection on app resume
    const handleReconnect = () => {
      console.log('[T-POS] Reconnecting realtime channel');
      if (channelRef.current) {
        channelRef.current.unsubscribe();
      }
      setTimeout(() => {
        usePOSStore.getState().loadOpenChecks(); // Refresh everything once on reconnect
        const freshChannel = supabase
          .channel('tpos-realtime-' + Date.now())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'checks' },
            (payload: any) => {
              if (payload.eventType === 'DELETE') usePOSStore.getState().deleteCheckLocal(payload.old.id);
              else usePOSStore.getState().refreshCheckById(payload.new.id);
            }
          )
          .on('postgres_changes', { event: '*', schema: 'public', table: 'check_items' },
            (payload: any) => {
              const checkId = payload.new ? payload.new.check_id : payload.old.check_id;
              if (checkId) usePOSStore.getState().refreshCheckById(checkId);
            }
          )
          .subscribe();
        channelRef.current = freshChannel;
      }, 300);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleReconnect();
      }
    };

    window.addEventListener('tpos:reconnect', handleReconnect);
    window.addEventListener('online', handleReconnect);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      Object.values(debounceTimers).forEach(clearTimeout);
      window.removeEventListener('tpos:reconnect', handleReconnect);
      window.removeEventListener('online', handleReconnect);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      channel.unsubscribe();
    };
  }, []);
}

export function useOnTableChange(tables: string[], callback: () => void) {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    const handler = (e: Event) => {
      const table = (e as CustomEvent).detail;
      if (tables.includes(table)) cbRef.current();
    };
    window.addEventListener('rt:change', handler);
    return () => window.removeEventListener('rt:change', handler);
  }, [tables]);
}
