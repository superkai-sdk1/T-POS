import { useMemo, type ReactNode } from 'react';
import { useAuthStore } from '@/store/auth';
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
        { id: 'schedule', label: 'Расписание', icon: CalendarCheck },
        { id: 'dashboard', label: 'Отчёты', icon: BarChart3 },
        { id: 'management', label: 'Управление', icon: Settings },
      ]
    : [
        { id: 'pos', label: 'Касса', icon: Receipt },
        { id: 'inventory', label: 'Остатки', icon: Package },
        { id: 'dashboard', label: 'Отчёты', icon: BarChart3 },
      ],
  [isOwner]);

  return (
    <div className="min-h-screen bg-[var(--c-bg)] flex flex-col lg:flex-row">
      {/* Desktop sidebar */}
      <aside
        className="hidden lg:flex flex-col w-60 shrink-0 fixed top-0 left-0 h-full z-40 border-r border-white/5"
        style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)', background: 'linear-gradient(180deg, var(--c-bg2) 0%, var(--c-bg) 100%)' }}
      >
        <div className="flex items-center gap-3 px-4 py-4">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-lg"
            style={{ background: 'linear-gradient(135deg, #6c5ce7, #a29bfe)', boxShadow: '0 4px 16px rgba(108,92,231,0.25)' }}>
            <span className="text-xs font-black text-white">T</span>
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-[var(--c-text)] leading-tight">T-POS</h1>
            <p className="text-[10px] text-[var(--c-hint)] leading-tight truncate">
              {user?.nickname}
              {isOwner() && <span className="text-[var(--c-accent)] ml-1 font-semibold">owner</span>}
            </p>
          </div>
        </div>

        <p className="px-5 mt-3 mb-1.5 text-[10px] uppercase tracking-widest text-white/20 font-semibold">Навигация</p>

        <nav className="flex-1 px-2.5 space-y-0.5">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 tap relative ${
                  isActive
                    ? 'bg-[var(--c-accent)]/10 text-[var(--c-accent)]'
                    : 'text-[var(--c-hint)] hover:bg-white/4 hover:text-[var(--c-text)]'
                }`}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[var(--c-accent)]" />
                )}
                <tab.icon className={`w-[18px] h-[18px] ${isActive ? 'stroke-[2.5]' : ''}`} />
                <span className="text-[13px] font-semibold">{tab.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="px-2.5 pb-4">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[var(--c-hint)] hover:bg-red-500/8 hover:text-red-400 transition-all tap"
          >
            <LogOut className="w-[18px] h-[18px]" />
            <span className="text-[13px] font-semibold">Выход</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:ml-60">
        {/* Mobile header */}
        <header
          className="lg:hidden sticky top-0 z-40 px-4 py-2 glass-strong"
          style={{ paddingTop: `calc(var(--safe-top) + 0.4rem)` }}
        >
          <div className="flex items-center justify-between max-w-3xl mx-auto">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #6c5ce7, #a29bfe)' }}>
                <span className="text-[10px] font-black text-white">T</span>
              </div>
              <div>
                <h1 className="text-[13px] font-bold text-[var(--c-text)] leading-tight">{user?.nickname || 'T-POS'}</h1>
              </div>
            </div>
            <button
              onClick={logout}
              className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center hover:bg-red-500/10 transition-colors group active:scale-90"
            >
              <LogOut className="w-3.5 h-3.5 text-[var(--c-hint)] group-hover:text-red-400 transition-colors" />
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 py-3 lg:px-6 lg:py-5 max-w-5xl mx-auto w-full pb-mobile-nav">
          {children}
        </main>

        {/* Mobile bottom nav */}
        <nav
          className="lg:hidden fixed bottom-0 left-0 right-0 z-40 glass-strong"
          style={{ paddingBottom: 'var(--safe-bottom)' }}
        >
          <div className="flex max-w-3xl mx-auto">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`flex-1 flex flex-col items-center gap-1 py-2 transition-all duration-150 active:scale-90 relative ${
                    isActive
                      ? 'text-[var(--c-accent)]'
                      : 'text-[var(--c-hint)]'
                  }`}
                >
                  {isActive && (
                    <div className="absolute -top-px left-1/2 -translate-x-1/2 h-[2px] rounded-full bg-[var(--c-accent)] transition-all duration-200" style={{ width: '24px' }} />
                  )}
                  <tab.icon className={`w-[22px] h-[22px] transition-all duration-150 ${isActive ? 'stroke-[2.5]' : 'stroke-[1.5]'}`} />
                  <span className={`text-[10px] font-semibold transition-all duration-150 ${isActive ? 'opacity-100' : 'opacity-50'}`}>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
