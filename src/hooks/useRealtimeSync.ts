import { useEffect, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { usePOSStore } from '@/store/pos';
import { useShiftStore } from '@/store/shift';
import { useAuthStore } from '@/store/auth';
import type { AdminNotificationType, TypeSetting } from '@/lib/notifications';

let _userPwaTypes: Record<string, TypeSetting> = {};

async function loadUserPwaSettings() {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) { _userPwaTypes = {}; return; }
  const { data } = await supabase
    .from('user_notification_settings')
    .select('types')
    .eq('user_id', userId)
    .maybeSingle();
  _userPwaTypes = (data?.types as Record<string, TypeSetting>) || {};
}

function shouldShowPwa(type: string): boolean {
  const t = _userPwaTypes[type as AdminNotificationType];
  if (!t?.enabled) return false;
  return t.channel === 'pwa' || t.channel === 'both';
}

function emitTableChange(table: string) {
  window.dispatchEvent(new CustomEvent('rt:change', { detail: table }));
}

let _lastNotificationId: string | null = null;

async function pollChecks() {
  try {
    await usePOSStore.getState().loadOpenChecks();
    emitTableChange('checks');
    emitTableChange('check_items');
    emitTableChange('check_discounts');
  } catch { /* ignore */ }
}

async function pollInventory() {
  try {
    await usePOSStore.getState().loadInventory();
    emitTableChange('inventory');
    emitTableChange('menu_categories');
  } catch { /* ignore */ }
}

async function pollNotifications() {
  try {
    const { data } = await supabase
      .from('notifications')
      .select('id,type,title,body,meta')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data || data.id === _lastNotificationId) return;
    _lastNotificationId = data.id;

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && shouldShowPwa(String(data.type))) {
      const title = String(data.title || 'T-POS');
      const body = data.body != null ? String(data.body) : '';
      const meta = (data.meta || {}) as Record<string, unknown>;
      try {
        const n = new Notification(title, { body, tag: `tpos-${data.id}` });
        n.onclick = () => {
          n.close();
          window.focus();
          const supplyId = meta.supplyId as string | undefined;
          const revisionId = meta.revisionId as string | undefined;
          if (supplyId || revisionId) {
            window.dispatchEvent(new CustomEvent('tpos:notification-click', { detail: { type: data.type, supplyId, revisionId } }));
          }
        };
      } catch { /* ignore */ }
    }
    emitTableChange('notifications');
  } catch { /* ignore */ }
}

export function useRealtimeSync() {
  const lastReloadRef = useRef<number>(0);
  const RELOAD_THROTTLE_MS = 30_000;

  useEffect(() => {
    loadUserPwaSettings();
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail === 'user_notification_settings') loadUserPwaSettings();
    };
    window.addEventListener('rt:change', handler);
    return () => window.removeEventListener('rt:change', handler);
  }, []);

  useEffect(() => {
    // Initial load
    pollChecks();
    pollInventory();

    const checksTimer = setInterval(pollChecks, 5_000);
    const inventoryTimer = setInterval(pollInventory, 15_000);
    const notifTimer = setInterval(pollNotifications, 10_000);

    const doReload = () => {
      const now = Date.now();
      if (now - lastReloadRef.current < RELOAD_THROTTLE_MS) return;
      lastReloadRef.current = now;
      pollChecks();
      pollInventory();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') doReload();
    };

    window.addEventListener('tpos:reconnect', doReload);
    window.addEventListener('online', doReload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(checksTimer);
      clearInterval(inventoryTimer);
      clearInterval(notifTimer);
      window.removeEventListener('tpos:reconnect', doReload);
      window.removeEventListener('online', doReload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
}

export function useOnTableChange(tables: string[], callback: () => void) {
  const cbRef = useRef(callback);

  useEffect(() => {
    cbRef.current = callback;
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tablesKey = useMemo(() => tables.slice().sort().join(','), [tables.join(',')]);

  useEffect(() => {
    const tableList = tablesKey.split(',');
    const handler = (e: Event) => {
      const table = (e as CustomEvent).detail;
      if (tableList.includes(table)) cbRef.current();
    };
    window.addEventListener('rt:change', handler);
    return () => window.removeEventListener('rt:change', handler);
  }, [tablesKey]);
}
