import { useMemo, type ReactNode } from 'react';
import { useAuthStore } from '@/store/auth';
import { Receipt, Package, BarChart3, LogOut, Settings, Calendar } from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function Layout({ children, activeTab, onTabChange }: LayoutProps) {
  const user = useAuthStore((s) => s.user);
  const isOwner = useAuthStore((s) => s.isOwner);

  const tabs = useMemo(() => isOwner()
    ? [
      { id: 'pos', label: 'Касса', icon: Receipt },
      { id: 'events', label: 'Мероприятия', icon: Calendar },
      { id: 'dashboard', label: 'Отчёты', icon: BarChart3 },
      { id: 'management', label: 'Управление', icon: Settings },
    ]
    : [
      { id: 'pos', label: 'Касса', icon: Receipt },
      { id: 'events', label: 'Мероприятия', icon: Calendar },
      { id: 'inventory', label: 'Остатки', icon: Package },
      { id: 'dashboard', label: 'Отчёты', icon: BarChart3 },
    ],
    [isOwner]);

  return (
    <div className="h-full bg-[var(--c-bg)] flex flex-col lg:flex-row overflow-hidden">
      {/* Desktop sidebar — compact icon rail */}
      <aside
        className="hidden lg:flex flex-col w-[68px] shrink-0 fixed top-0 left-0 h-full z-40 border-r border-[var(--c-border)] items-center"
        style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)', background: 'linear-gradient(180deg, var(--c-bg2) 0%, var(--c-bg) 100%)' }}
      >
        <div className="py-4">
          <img src="/icons/tpos.svg" alt="T-POS" className="w-10 h-10 rounded-xl drop-shadow-lg" />
        </div>

        <nav className="flex-1 flex flex-col items-center gap-1 pt-2">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                title={tab.label}
                className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-150 tap relative ${isActive
                  ? 'bg-[var(--c-accent)]/12 text-[var(--c-accent)]'
                  : 'text-[var(--c-hint)] hover:bg-[var(--c-surface)] hover:text-[var(--c-text)]'
                  }`}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[var(--c-accent)]" style={{ willChange: 'transform' }} />
                )}
                <tab.icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : ''}`} />
              </button>
            );
          })}
        </nav>

        <div className="pb-4 flex flex-col items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[var(--c-accent)]/10 flex items-center justify-center" title={user?.nickname}>
            <span className="text-[10px] font-bold text-[var(--c-accent)]">
              {user?.nickname?.charAt(0).toUpperCase()}
            </span>
          </div>
          <button
            onClick={() => useAuthStore.getState().logout()}
            title="Выход"
            className="w-11 h-11 rounded-xl flex items-center justify-center text-[var(--c-hint)] hover:bg-[var(--c-danger-bg)] hover:text-[var(--c-danger)] transition-all tap"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:ml-[68px] overflow-hidden">
        {/* Mobile header */}
        <header
          className="lg:hidden shrink-0 z-40 px-4 py-2 glass-strong"
          style={{ paddingTop: `calc(var(--safe-top) + 0.4rem)` }}
        >
          <div className="flex items-center justify-between max-w-3xl mx-auto">
            <div className="flex items-center gap-2">
              <img src="/icons/tpos.svg" alt="T-POS" className="w-7 h-7 rounded-lg" />
              <div>
                <h1 className="text-[13px] font-bold text-[var(--c-text)] leading-tight">{user?.nickname || 'T-POS'}</h1>
              </div>
            </div>
            <button
              onClick={() => useAuthStore.getState().logout()}
              className="w-8 h-8 rounded-lg bg-[var(--c-surface)] flex items-center justify-center hover:bg-[var(--c-danger-bg)] transition-colors group active:scale-90"
            >
              <LogOut className="w-3.5 h-3.5 text-[var(--c-hint)] group-hover:text-[var(--c-danger)] transition-colors" />
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 py-3 lg:px-5 lg:py-4 w-full overflow-y-auto overflow-x-hidden overscroll-none flex flex-col">
          {children}
        </main>

        {/* Mobile bottom nav — part of flex, not fixed */}
        <nav
          className="lg:hidden shrink-0 z-40 glass-strong"
          style={{ paddingBottom: 'max(var(--tg-safe-bottom), calc(env(safe-area-inset-bottom, 0px) * 0.5))', transform: 'translateZ(0)' }}
        >
          <div className="flex max-w-3xl mx-auto" style={{ height: 'var(--nav-height)' }}>
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-all duration-150 active:scale-90 relative shrink-0 min-w-0 ${isActive
                    ? 'text-[var(--c-accent)]'
                    : 'text-[var(--c-hint)]'
                    }`}
                >
                  {isActive && (
                    <div className="absolute -top-px left-1/2 -translate-x-1/2 h-[2px] rounded-full bg-[var(--c-accent)] transition-all duration-150" style={{ width: '24px', willChange: 'transform' }} />
                  )}
                  <tab.icon className={`w-[22px] h-[22px] shrink-0 transition-all duration-150 ${isActive ? 'stroke-[2.5]' : 'stroke-[1.5]'}`} />
                  <span className={`text-[10px] font-semibold truncate w-full px-1 transition-all duration-150 ${isActive ? 'opacity-100' : 'opacity-50'}`}>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
