import { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { useAuthStore } from '@/store/auth';
import { usePOSStore } from '@/store/pos';
import { useShiftStore } from '@/store/shift';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { initTelegramApp } from '@/lib/telegram';
import { LoginPage } from '@/components/auth/LoginPage';
import { Layout } from '@/components/Layout';
import { OpenChecks } from '@/components/pos/OpenChecks';
import { CheckView } from '@/components/pos/CheckView';
import { TabPanel } from '@/components/ui/TabPanel';

const InventoryPage = lazy(() => import('@/components/inventory/InventoryPage').then((m) => ({ default: m.InventoryPage })));
const ManagementPage = lazy(() => import('@/components/management/ManagementPage').then((m) => ({ default: m.ManagementPage })));
const DashboardPage = lazy(() => import('@/components/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const SchedulePage = lazy(() => import('@/components/schedule/SchedulePage').then((m) => ({ default: m.SchedulePage })));

function TabFallback() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-8 w-40 rounded-lg bg-white/5" />
      <div className="h-4 w-24 rounded bg-white/3" />
      <div className="grid grid-cols-2 gap-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-white/3" />
        ))}
      </div>
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-xl bg-white/3" />
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const user = useAuthStore((s) => s.user);
  const loadInventory = usePOSStore((s) => s.loadInventory);
  const loadOpenChecks = usePOSStore((s) => s.loadOpenChecks);
  const loadActiveShift = useShiftStore((s) => s.loadActiveShift);
  const leaveCheck = usePOSStore((s) => s.leaveCheck);
  const activeCheck = usePOSStore((s) => s.activeCheck);
  const [activeTab, setActiveTab] = useState('pos');
  const [showCheckView, setShowCheckView] = useState(false);
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set(['pos']));

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
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') handleBeforeUnload();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const refreshProfile = useAuthStore((s) => s.refreshProfile);

  useEffect(() => {
    if (user) {
      loadInventory();
      loadOpenChecks();
      loadActiveShift();
      refreshProfile();
    }
  }, [user, loadInventory, loadOpenChecks, loadActiveShift, refreshProfile]);

  const [managementScreen, setManagementScreen] = useState<string | undefined>();

  const handleTabChange = useCallback(async (tab: string) => {
    if (showCheckView && activeCheck) {
      await leaveCheck();
    }
    setActiveTab(tab);
    setShowCheckView(false);
    setVisitedTabs((prev) => new Set(prev).add(tab));
    if (tab !== 'management') setManagementScreen(undefined);
  }, [showCheckView, activeCheck, leaveCheck]);

  const handleDashboardNavigate = useCallback((target: string) => {
    if (target.startsWith('management:')) {
      const screen = target.split(':')[1];
      setManagementScreen(screen);
      setActiveTab('management');
      setVisitedTabs((prev) => new Set(prev).add('management'));
    }
  }, []);

  const needsPinSetup = useAuthStore((s) => s.needsPinSetup);

  if (!user || needsPinSetup) {
    return <LoginPage />;
  }

  return (
    <Layout activeTab={activeTab} onTabChange={handleTabChange}>
      <TabPanel id="pos" activeTab={activeTab}>
        {/* Mobile: swap between list and check view */}
        <div className="lg:hidden">
          {showCheckView ? (
            <CheckView onBack={() => setShowCheckView(false)} />
          ) : (
            <OpenChecks onSelectCheck={() => setShowCheckView(true)} />
          )}
        </div>
        {/* Desktop: split view — list left, check right */}
        <div className="hidden lg:flex gap-4 h-[calc(100vh-2rem)]">
          <div className={`shrink-0 overflow-y-auto pr-1 ${showCheckView ? 'w-[340px]' : 'flex-1'}`}>
            <OpenChecks onSelectCheck={() => setShowCheckView(true)} />
          </div>
          {showCheckView && (
            <div className="flex-1 overflow-y-auto border-l border-white/5 pl-4">
              <CheckView onBack={() => setShowCheckView(false)} />
            </div>
          )}
        </div>
      </TabPanel>

      {visitedTabs.has('inventory') && (
        <TabPanel id="inventory" activeTab={activeTab}>
          <Suspense fallback={<TabFallback />}>
            <InventoryPage />
          </Suspense>
        </TabPanel>
      )}

      {visitedTabs.has('schedule') && (
        <TabPanel id="schedule" activeTab={activeTab}>
          <Suspense fallback={<TabFallback />}>
            <SchedulePage onOpenCheck={() => { setActiveTab('pos'); setShowCheckView(true); }} />
          </Suspense>
        </TabPanel>
      )}

      {visitedTabs.has('management') && (
        <TabPanel id="management" activeTab={activeTab}>
          <Suspense fallback={<TabFallback />}>
            <ManagementPage initialScreen={managementScreen} />
          </Suspense>
        </TabPanel>
      )}

      {visitedTabs.has('dashboard') && (
        <TabPanel id="dashboard" activeTab={activeTab}>
          <Suspense fallback={<TabFallback />}>
            <DashboardPage onNavigate={handleDashboardNavigate} />
          </Suspense>
        </TabPanel>
      )}
    </Layout>
  );
}
