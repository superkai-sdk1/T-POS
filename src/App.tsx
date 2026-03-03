import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/store/auth';
import { usePOSStore } from '@/store/pos';
import { useShiftStore } from '@/store/shift';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { initTelegramApp } from '@/lib/telegram';
import { LoginPage } from '@/components/auth/LoginPage';
import { Layout } from '@/components/Layout';
import { OpenChecks } from '@/components/pos/OpenChecks';
import { CheckView } from '@/components/pos/CheckView';
import { InventoryPage } from '@/components/inventory/InventoryPage';
import { ManagementPage } from '@/components/management/ManagementPage';
import { DashboardPage } from '@/components/dashboard/DashboardPage';

export default function App() {
  const user = useAuthStore((s) => s.user);
  const loadInventory = usePOSStore((s) => s.loadInventory);
  const loadActiveShift = useShiftStore((s) => s.loadActiveShift);
  const leaveCheck = usePOSStore((s) => s.leaveCheck);
  const activeCheck = usePOSStore((s) => s.activeCheck);
  const [activeTab, setActiveTab] = useState('pos');
  const [showCheckView, setShowCheckView] = useState(false);

  useRealtimeSync();

  useEffect(() => {
    initTelegramApp();
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      const state = usePOSStore.getState();
      if (state.activeCheck && state.cart.length > 0) {
        state.saveCartToDb();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') handleBeforeUnload();
    });
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  useEffect(() => {
    if (user) {
      loadInventory();
      loadActiveShift();
    }
  }, [user, loadInventory, loadActiveShift]);

  const handleTabChange = useCallback(async (tab: string) => {
    if (showCheckView && activeCheck) {
      await leaveCheck();
    }
    setActiveTab(tab);
    setShowCheckView(false);
  }, [showCheckView, activeCheck, leaveCheck]);

  const needsPinSetup = useAuthStore((s) => s.needsPinSetup);

  if (!user || needsPinSetup) {
    return <LoginPage />;
  }

  return (
    <Layout activeTab={activeTab} onTabChange={handleTabChange}>
      {activeTab === 'pos' && (
        showCheckView ? (
          <CheckView onBack={() => setShowCheckView(false)} />
        ) : (
          <OpenChecks onSelectCheck={() => setShowCheckView(true)} />
        )
      )}
      {activeTab === 'inventory' && <InventoryPage />}
      {activeTab === 'management' && <ManagementPage />}
      {activeTab === 'dashboard' && <DashboardPage />}
    </Layout>
  );
}
