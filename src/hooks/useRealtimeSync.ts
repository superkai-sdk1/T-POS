import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { usePOSStore } from '@/store/pos';
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
          emitTableChange('checks');
        }),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'check_items' },
        () => debounced('check_items', () => {
          usePOSStore.getState().loadOpenChecks();
          emitTableChange('check_items');
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
      .subscribe();

    channelRef.current = channel;

    return () => {
      Object.values(debounceTimers).forEach(clearTimeout);
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
