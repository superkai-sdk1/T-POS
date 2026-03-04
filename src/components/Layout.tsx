import { useMemo, type ReactNode } from 'react';
import { useAuthStore } from '@/store/auth';
import { useSwipe } from '@/hooks/useSwipe';
import { Receipt, Package, BarChart3, LogOut, Settings, CalendarCheck } from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function Layout({ children, activeTab, onTabChange }: LayoutProps) {
  const { user, logout, isOwner } = useAuthStore();

  const tabs = useMemo(() => isOwner()
    ? [
        { id: 'pos', label: 'Касса', icon: Receipt },
        { id: 'bookings', label: 'Брони', icon: CalendarCheck },
        { id: 'dashboard', label: 'Отчёты', icon: BarChart3 },
        { id: 'management', label: 'Управление', icon: Settings },
      ]
    : [
        { id: 'pos', label: 'Касса', icon: Receipt },
        { id: 'inventory', label: 'Остатки', icon: Package },
        { id: 'dashboard', label: 'Отчёты', icon: BarChart3 },
      ],
  [isOwner]);

  const currentIdx = tabs.findIndex((t) => t.id === activeTab);

  const swipe = useSwipe({
    onSwipeLeft: () => {
      if (currentIdx < tabs.length - 1) onTabChange(tabs[currentIdx + 1].id);
    },
    onSwipeRight: () => {
      if (currentIdx > 0) onTabChange(tabs[currentIdx - 1].id);
    },
    threshold: 60,
  });

  return (
    <div className="min-h-screen bg-[var(--tg-theme-bg-color,#0f0f23)] flex flex-col lg:flex-row">
      {/* Desktop sidebar */}
      <aside
        className="hidden lg:flex flex-col w-64 shrink-0 fixed top-0 left-0 h-full z-40 bg-[var(--tg-theme-secondary-bg-color,#1a1a2e)] border-r border-white/5"
        style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}
      >
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[var(--tg-theme-button-color,#6c5ce7)] to-purple-600 flex items-center justify-center shadow-lg shadow-[var(--tg-theme-button-color,#6c5ce7)]/20">
            <span className="text-sm font-black text-white">T</span>
          </div>
          <div>
            <h1 className="text-base font-bold text-[var(--tg-theme-text-color,#e0e0e0)] leading-tight">T-POS</h1>
            <p className="text-[11px] text-[var(--tg-theme-hint-color,#888)] leading-tight">
              {user?.nickname}
              {isOwner() && <span className="text-[var(--tg-theme-button-color,#6c5ce7)] ml-1 font-semibold">owner</span>}
            </p>
          </div>
        </div>

        <nav className="flex-1 px-3 space-y-1 mt-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 active:scale-[0.98] ${
                activeTab === tab.id
                  ? 'bg-[var(--tg-theme-button-color,#6c5ce7)]/12 text-[var(--tg-theme-button-color,#6c5ce7)] shadow-sm'
                  : 'text-[var(--tg-theme-hint-color,#888)] hover:bg-white/5 hover:text-[var(--tg-theme-text-color,#e0e0e0)]'
              }`}
            >
              <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? 'stroke-[2.5]' : ''}`} />
              <span className="text-sm font-semibold">{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className="px-3 pb-4">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[var(--tg-theme-hint-color,#888)] hover:bg-red-500/10 hover:text-red-400 transition-all active:scale-[0.98]"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-sm font-semibold">Выход</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:ml-64">
        {/* Mobile header */}
        <header
          className="lg:hidden sticky top-0 z-40 px-4 py-2.5 glass-strong"
          style={{ paddingTop: `calc(var(--safe-top) + 0.5rem)` }}
        >
          <div className="flex items-center justify-between max-w-3xl mx-auto">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[var(--tg-theme-button-color,#6c5ce7)] to-purple-600 flex items-center justify-center">
                <span className="text-xs font-black text-white">T</span>
              </div>
              <div>
                <h1 className="text-sm font-bold text-[var(--tg-theme-text-color,#e0e0e0)] leading-tight">T-POS</h1>
                <p className="text-[10px] text-[var(--tg-theme-hint-color,#888)] leading-tight">
                  {user?.nickname}
                  {isOwner() && <span className="text-[var(--tg-theme-button-color,#6c5ce7)] ml-1 font-semibold">owner</span>}
                </p>
              </div>
            </div>
            <button
              onClick={logout}
              className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center hover:bg-red-500/10 transition-colors group active:scale-90"
            >
              <LogOut className="w-4 h-4 text-[var(--tg-theme-hint-color,#888)] group-hover:text-red-400 transition-colors" />
            </button>
          </div>
        </header>

        <main
          className="flex-1 px-4 py-3 lg:px-8 lg:py-6 max-w-5xl mx-auto w-full pb-mobile-nav"
          {...swipe}
        >
          <div key={activeTab} className="tab-content-enter">
            {children}
          </div>
        </main>

        {/* Mobile bottom nav */}
        <nav
          className="lg:hidden fixed bottom-0 left-0 right-0 z-40 glass-strong"
          style={{ paddingBottom: 'var(--safe-bottom)' }}
        >
          <div className="flex max-w-3xl mx-auto relative">
            {tabs.map((tab, idx) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-all duration-200 active:scale-90 relative ${
                    isActive
                      ? 'text-[var(--tg-theme-button-color,#6c5ce7)]'
                      : 'text-[var(--tg-theme-hint-color,#888)]'
                  }`}
                >
                  {isActive && (
                    <div className="absolute -top-px left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-[var(--tg-theme-button-color,#6c5ce7)]" />
                  )}
                  <tab.icon className={`w-5 h-5 transition-all duration-200 ${isActive ? 'stroke-[2.5]' : ''}`} />
                  <span className={`text-[10px] font-semibold transition-all duration-200 ${isActive ? 'opacity-100' : 'opacity-60'}`}>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
