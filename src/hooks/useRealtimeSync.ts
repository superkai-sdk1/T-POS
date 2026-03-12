import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { usePOSStore, isSavingCart, isCancellingCheck, isClosingCheck, isRecentlyRemoved } from '@/store/pos';
import { useShiftStore } from '@/store/shift';
import { useAuthStore } from '@/store/auth';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

type PgPayload = RealtimePostgresChangesPayload<Record<string, unknown>>;

function emitTableChange(table: string) {
  window.dispatchEvent(new CustomEvent('rt:change', { detail: table }));
}

export function useRealtimeSync() {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel('tpos-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'checks' },
        (payload: PgPayload) => {
          const id = payload.eventType === 'DELETE'
            ? (payload.old as Record<string, string>).id
            : (payload.new as Record<string, string>).id;
          if (isCancellingCheck(id) || isClosingCheck(id) || isRecentlyRemoved(id)) return;
          if (payload.eventType === 'DELETE') {
            usePOSStore.getState().deleteCheckLocal(id);
          } else {
            usePOSStore.getState().refreshCheckById(id);
          }
          emitTableChange('checks');
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'check_items' },
        (payload: PgPayload) => {
          if (isSavingCart()) return;
          const rec = (payload.new ?? payload.old) as Record<string, string> | undefined;
          const checkId = rec?.check_id;
          if (checkId && !isCancellingCheck(checkId) && !isClosingCheck(checkId) && !isRecentlyRemoved(checkId)) usePOSStore.getState().refreshCheckById(checkId);
          emitTableChange('check_items');
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'check_discounts' },
        (payload: PgPayload) => {
          const rec = (payload.new ?? payload.old) as Record<string, string> | undefined;
          const checkId = rec?.check_id;
          if (checkId && !isCancellingCheck(checkId) && !isClosingCheck(checkId) && !isRecentlyRemoved(checkId)) usePOSStore.getState().refreshCheckById(checkId);
          emitTableChange('check_discounts');
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory' },
        (payload: PgPayload) => {
          if (payload.eventType === 'DELETE') {
            usePOSStore.getState().loadInventory();
          } else {
            usePOSStore.getState().upsertInventoryLocal(payload.new as unknown as Parameters<ReturnType<typeof usePOSStore.getState>['upsertInventoryLocal']>[0]);
          }
          emitTableChange('inventory');
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'menu_categories' },
        (payload: PgPayload) => {
          if (payload.eventType !== 'DELETE') {
            usePOSStore.getState().upsertCategoryLocal(payload.new as unknown as Parameters<ReturnType<typeof usePOSStore.getState>['upsertCategoryLocal']>[0]);
          }
          emitTableChange('menu_categories');
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shifts' },
        (payload: PgPayload) => {
          if (payload.eventType !== 'DELETE') {
            useShiftStore.getState().upsertShiftLocal(payload.new as unknown as Parameters<ReturnType<typeof useShiftStore.getState>['upsertShiftLocal']>[0]);
          }
          emitTableChange('shifts');
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        (payload: PgPayload) => {
          if (payload.eventType !== 'DELETE') {
            const rec = payload.new as Record<string, unknown>;
            useAuthStore.getState().upsertProfileLocal(rec as unknown as Parameters<ReturnType<typeof useAuthStore.getState>['upsertProfileLocal']>[0]);
            if (rec.role === 'staff' || rec.role === 'owner') {
              useAuthStore.getState().upsertStaffLocal({
                id: rec.id as string,
                nickname: rec.nickname as string,
                role: rec.role as string,
                hasPin: !!rec.pin
              });
            }
          }
          emitTableChange('profiles');
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'client_discount_rules' },
        () => emitTableChange('client_discount_rules'),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload: PgPayload) => {
          const row = payload.new as Record<string, unknown> | undefined;
          if (row && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            const title = String(row.title || 'T-POS');
            const body = row.body != null ? String(row.body) : '';
            try {
              new Notification(title, { body, tag: `tpos-${row.id}` });
            } catch {
              // ignore
            }
          }
          emitTableChange('notifications');
        },
      )
      .subscribe();

    channelRef.current = channel;

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const handleReconnect = () => {
      console.log('[T-POS] Reconnecting realtime channel');
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
      reconnectTimer = setTimeout(() => {
        usePOSStore.getState().loadOpenChecks();
        usePOSStore.getState().loadInventory();
        const freshChannel = supabase
          .channel('tpos-realtime-' + Date.now())
          .on('postgres_changes', { event: '*', schema: 'public', table: 'checks' },
            (payload: PgPayload) => {
              const id = payload.eventType === 'DELETE'
                ? (payload.old as Record<string, string>).id
                : (payload.new as Record<string, string>).id;
              if (isCancellingCheck(id) || isClosingCheck(id) || isRecentlyRemoved(id)) return;
              if (payload.eventType === 'DELETE') usePOSStore.getState().deleteCheckLocal(id);
              else usePOSStore.getState().refreshCheckById(id);
              emitTableChange('checks');
            }
          )
          .on('postgres_changes', { event: '*', schema: 'public', table: 'check_items' },
            (payload: PgPayload) => {
              if (isSavingCart()) return;
              const rec = (payload.new ?? payload.old) as Record<string, string> | undefined;
              const checkId = rec?.check_id;
              if (checkId && !isCancellingCheck(checkId) && !isClosingCheck(checkId) && !isRecentlyRemoved(checkId)) usePOSStore.getState().refreshCheckById(checkId);
              emitTableChange('check_items');
            }
          )
          .on('postgres_changes', { event: '*', schema: 'public', table: 'check_discounts' },
            (payload: PgPayload) => {
              const rec = (payload.new ?? payload.old) as Record<string, string> | undefined;
              const checkId = rec?.check_id;
              if (checkId && !isCancellingCheck(checkId) && !isClosingCheck(checkId) && !isRecentlyRemoved(checkId)) usePOSStore.getState().refreshCheckById(checkId);
              emitTableChange('check_discounts');
            }
          )
          .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' },
            (payload: PgPayload) => {
              if (payload.eventType === 'DELETE') {
                usePOSStore.getState().loadInventory();
              } else {
                usePOSStore.getState().upsertInventoryLocal(payload.new as unknown as Parameters<ReturnType<typeof usePOSStore.getState>['upsertInventoryLocal']>[0]);
              }
              emitTableChange('inventory');
            }
          )
          .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_categories' },
            (payload: PgPayload) => {
              if (payload.eventType !== 'DELETE') {
                usePOSStore.getState().upsertCategoryLocal(payload.new as unknown as Parameters<ReturnType<typeof usePOSStore.getState>['upsertCategoryLocal']>[0]);
              }
              emitTableChange('menu_categories');
            }
          )
          .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' },
            (payload: PgPayload) => {
              if (payload.eventType !== 'DELETE') {
                useShiftStore.getState().upsertShiftLocal(payload.new as unknown as Parameters<ReturnType<typeof useShiftStore.getState>['upsertShiftLocal']>[0]);
              }
              emitTableChange('shifts');
            }
          )
          .on('postgres_changes', { event: '*', schema: 'public', table: 'client_discount_rules' },
            () => emitTableChange('client_discount_rules'),
          )
          .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' },
            (payload: PgPayload) => {
              if (payload.eventType !== 'DELETE') {
                const rec = payload.new as Record<string, unknown>;
                useAuthStore.getState().upsertProfileLocal(rec as unknown as Parameters<ReturnType<typeof useAuthStore.getState>['upsertProfileLocal']>[0]);
                if (rec.role === 'staff' || rec.role === 'owner') {
                  useAuthStore.getState().upsertStaffLocal({
                    id: rec.id as string,
                    nickname: rec.nickname as string,
                    role: rec.role as string,
                    hasPin: !!rec.pin
                  });
                }
              }
              emitTableChange('profiles');
            }
          )
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' },
            (payload: PgPayload) => {
              const row = payload.new as Record<string, unknown> | undefined;
              if (row && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                const title = String(row.title || 'T-POS');
                const body = row.body != null ? String(row.body) : '';
                try {
                  new Notification(title, { body, tag: `tpos-${row.id}` });
                } catch {
                  // ignore
                }
              }
              emitTableChange('notifications');
            },
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
      window.removeEventListener('tpos:reconnect', handleReconnect);
      window.removeEventListener('online', handleReconnect);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (channelRef.current) {
        channelRef.current.unsubscribe();
      } else {
        channel.unsubscribe();
      }
    };
  }, []);
}

export function useOnTableChange(tables: string[], callback: () => void) {
  const cbRef = useRef(callback);

  useEffect(() => {
    cbRef.current = callback;
  });

  useEffect(() => {
    const handler = (e: Event) => {
      const table = (e as CustomEvent).detail;
      if (tables.includes(table)) cbRef.current();
    };
    window.addEventListener('rt:change', handler);
    return () => window.removeEventListener('rt:change', handler);
  }, [tables]);
}
