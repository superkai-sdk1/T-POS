import { useEffect, useState, useCallback, useRef, lazy, Suspense } from 'react';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const fn = () => setIsMobile(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return isMobile;
}
import { useAuthStore } from '@/store/auth';
import { usePOSStore } from '@/store/pos';
import { useShiftStore } from '@/store/shift';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { initTelegramApp } from '@/lib/telegram';
import { LoginPage } from '@/components/auth/LoginPage';
import { Layout } from '@/components/Layout';
import { OpenChecks } from '@/components/pos/OpenChecks';
import { CheckView } from '@/components/pos/CheckView';
import { CheckCartBar } from '@/components/pos/CheckCartBar';
import { TabPanel } from '@/components/ui/TabPanel';

const InventoryPage = lazy(() => import('@/components/inventory/InventoryPage').then((m) => ({ default: m.InventoryPage })));
const ManagementPage = lazy(() => import('@/components/management/ManagementPage').then((m) => ({ default: m.ManagementPage })));
const DashboardPage = lazy(() => import('@/components/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const EventsPage = lazy(() => import('@/components/events/EventsPage').then((m) => ({ default: m.EventsPage })));

function TabFallback() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-8 w-40 rounded-lg bg-[var(--c-surface)]" />
      <div className="h-4 w-24 rounded bg-[var(--c-surface)]" />
      <div className="grid grid-cols-2 gap-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-[var(--c-surface)]" />
        ))}
      </div>
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-xl bg-[var(--c-surface)]" />
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
  const [prevTab, setPrevTab] = useState('pos');
  const [showCheckView, setShowCheckView] = useState(false);
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set(['pos']));
  const [tabKeys, setTabKeys] = useState<Record<string, number>>({});
  const tabOrder = ['pos', 'events', 'inventory', 'dashboard', 'management'];

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
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
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
  const isMobile = useIsMobile();

  // Resizable split: left panel width % (20-60), persisted
  const [splitLeftPercent, setSplitLeftPercent] = useState(() => {
    if (typeof window === 'undefined') return 30;
    const v = localStorage.getItem('tpos-split-left');
    const n = v ? Number(v) : 30;
    return Math.max(20, Math.min(60, n)) || 30;
  });
  const splitRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);

  const handleSplitResize = useCallback((e: MouseEvent | TouchEvent) => {
    const container = splitRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX : e.clientX;
    let pct = ((x - rect.left) / rect.width) * 100;
    pct = Math.max(20, Math.min(60, pct));
    setSplitLeftPercent(pct);
    localStorage.setItem('tpos-split-left', String(pct));
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    const onUp = () => setIsResizing(false);
    window.addEventListener('mousemove', handleSplitResize);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', handleSplitResize, { passive: true });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', handleSplitResize);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', handleSplitResize);
      window.removeEventListener('touchend', onUp);
    };
  }, [isResizing, handleSplitResize]);

  const handleTabChange = useCallback((tab: string) => {
    if (showCheckView) {
      setShowCheckView(false);
      setTimeout(() => leaveCheck(), 0);
    } else if (activeCheck && tab !== 'pos') {
      setTimeout(() => leaveCheck(), 0);
    }

    if (tab === activeTab) {
      if (tab === 'management') {
        setManagementScreen('menu');
      } else {
        setTabKeys((prev) => ({ ...prev, [tab]: (prev[tab] || 0) + 1 }));
        setManagementScreen(undefined);
      }
    } else {
      if (tab !== 'management') setManagementScreen(undefined);
      if (tab !== 'pos') setShowCheckView(false);
    }

    setPrevTab(activeTab);
    setActiveTab(tab);
    setVisitedTabs((prev) => new Set(prev).add(tab));
  }, [showCheckView, activeCheck, leaveCheck, activeTab]);

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
    <Layout activeTab={activeTab} onTabChange={handleTabChange} showCheckView={showCheckView}>
      <TabPanel id="pos" activeTab={activeTab} prevTab={prevTab} tabOrder={tabOrder}>
        {/* Mobile: swap between list and check view. CheckView only when isMobile to avoid duplicate menus. */}
        <div className="lg:hidden flex-1 flex flex-col min-h-0">
          {showCheckView && isMobile ? (
            <div className="flex-1 flex flex-col min-h-0 px-4 py-3">
              <CheckView onBack={() => setShowCheckView(false)} />
            </div>
          ) : isMobile ? (
            <OpenChecks onSelectCheck={() => setShowCheckView(true)} />
          ) : null}
        </div>
        {/* Desktop: split view — list left, check right. Resizable when split. */}
        <div
          ref={splitRef}
          className={[
            'hidden lg:flex flex-1 min-h-0 overflow-hidden lg:h-full gap-4',
            isResizing && 'select-none',
          ].filter(Boolean).join(' ')}
        >
          <div
            className="flex flex-col shrink-0 min-h-0 min-w-[280px] lg:pr-2 lg:gap-3"
            style={{
              width: showCheckView && !isMobile ? `${splitLeftPercent}%` : undefined,
              flex: showCheckView && !isMobile ? undefined : 1,
              overscrollBehaviorY: 'contain',
            }}
          >
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-none scroll-area">
              <OpenChecks onSelectCheck={() => setShowCheckView(true)} />
            </div>
          </div>
          {showCheckView && !isMobile && (
            <>
              <div
                role="separator"
                aria-orientation="vertical"
                className="shrink-0 w-2 flex items-center justify-center cursor-col-resize group touch-none"
                onMouseDown={() => setIsResizing(true)}
                onTouchStart={() => setIsResizing(true)}
              >
                <div className="w-0.5 h-8 rounded-full bg-[var(--c-border)] group-hover:bg-[var(--c-fg-muted)] transition-colors" />
              </div>
              <div className="flex-1 min-h-0 flex flex-col gap-4 overflow-hidden min-w-0 lg:h-full lg:pl-2">
                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-none scroll-area">
                  <CheckView onBack={() => setShowCheckView(false)} />
                </div>
                <div className="shrink-0 flex justify-center pt-2">
                  <CheckCartBar />
                </div>
              </div>
            </>
          )}
        </div>
      </TabPanel>

      {visitedTabs.has('inventory') && (
        <TabPanel id="inventory" activeTab={activeTab} prevTab={prevTab} tabOrder={tabOrder}>
          <Suspense fallback={<TabFallback />}>
            <InventoryPage key={tabKeys['inventory'] || 0} />
          </Suspense>
        </TabPanel>
      )}

      {visitedTabs.has('events') && (
        <TabPanel id="events" activeTab={activeTab} prevTab={prevTab} tabOrder={tabOrder}>
          <Suspense fallback={<TabFallback />}>
            <EventsPage key={tabKeys['events'] || 0} />
          </Suspense>
        </TabPanel>
      )}

      {visitedTabs.has('management') && (
        <TabPanel id="management" activeTab={activeTab} prevTab={prevTab} tabOrder={tabOrder}>
          <Suspense fallback={<TabFallback />}>
            <ManagementPage key={tabKeys['management'] || 0} initialScreen={managementScreen} isActive={activeTab === 'management'} />
          </Suspense>
        </TabPanel>
      )}

      {visitedTabs.has('dashboard') && (
        <TabPanel id="dashboard" activeTab={activeTab} prevTab={prevTab} tabOrder={tabOrder}>
          <Suspense fallback={<TabFallback />}>
            <DashboardPage key={tabKeys['dashboard'] || 0} onNavigate={handleDashboardNavigate} />
          </Suspense>
        </TabPanel>
      )}
    </Layout>
  );
}
