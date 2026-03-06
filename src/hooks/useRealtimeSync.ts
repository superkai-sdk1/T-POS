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
        () => debounced('checks', () => {
          usePOSStore.getState().loadOpenChecks();
          const active = usePOSStore.getState().activeCheck;
          if (active) usePOSStore.getState().refreshActiveCheck();
          emitTableChange('checks');
        }),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'check_items' },
        () => debounced('check_items', () => {
          if (isSavingCart()) return;
          usePOSStore.getState().loadOpenChecks();
          const active = usePOSStore.getState().activeCheck;
          if (active) usePOSStore.getState().refreshActiveCheck();
          emitTableChange('check_items');
        }),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'check_discounts' },
        () => debounced('check_discounts', () => {
          const active = usePOSStore.getState().activeCheck;
          if (active) usePOSStore.getState().refreshActiveCheck();
          emitTableChange('check_discounts');
        }),
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
        { event: '*', schema: 'public', table: 'bookings' },
        () => debounced('bookings', () => {
          emitTableChange('bookings');
        }),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => debounced('profiles', () => {
          emitTableChange('profiles');
        }),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events' },
        () => debounced('events', () => {
          emitTableChange('events');
        }),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'discounts' },
        () => debounced('discounts', () => {
          emitTableChange('discounts');
        }),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'supplies' },
        () => debounced('supplies', () => {
          emitTableChange('supplies');
        }),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'revisions' },
        () => debounced('revisions', () => {
          emitTableChange('revisions');
        }),
      )
      .subscribe();

    channelRef.current = channel;

    // Re-subscribe after app resume from screen lock
    const handleReconnect = () => {
      console.log('[T-POS] Reconnecting realtime channel');
      if (channelRef.current) {
        channelRef.current.unsubscribe();
      }
      // Small delay to let the old channel clean up
      setTimeout(() => {
        const freshChannel = supabase
          .channel('tpos-realtime-' + Date.now())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'checks' },
            () => debounced('checks', () => {
              usePOSStore.getState().loadOpenChecks();
              const active = usePOSStore.getState().activeCheck;
              if (active) usePOSStore.getState().refreshActiveCheck();
              emitTableChange('checks');
            }),
          )
          .on('postgres_changes', { event: '*', schema: 'public', table: 'check_items' },
            () => debounced('check_items', () => {
              if (isSavingCart()) return;
              usePOSStore.getState().loadOpenChecks();
              const active = usePOSStore.getState().activeCheck;
              if (active) usePOSStore.getState().refreshActiveCheck();
              emitTableChange('check_items');
            }),
          )
          .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' },
            () => debounced('inventory', () => { usePOSStore.getState().loadInventory(); emitTableChange('inventory'); }),
          )
          .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' },
            () => debounced('shifts', () => { useShiftStore.getState().loadActiveShift(); emitTableChange('shifts'); }),
          )
          .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' },
            () => debounced('profiles', () => { emitTableChange('profiles'); }),
          )
          .subscribe();
        channelRef.current = freshChannel;
      }, 500);
    };
    window.addEventListener('tpos:reconnect', handleReconnect);

    return () => {
      Object.values(debounceTimers).forEach(clearTimeout);
      window.removeEventListener('tpos:reconnect', handleReconnect);
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
