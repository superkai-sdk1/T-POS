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
      { id: 'events', label: 'События', icon: Calendar },
      { id: 'dashboard', label: 'Отчёты', icon: BarChart3 },
      { id: 'management', label: 'Меню', icon: Settings },
    ]
    : [
      { id: 'pos', label: 'Касса', icon: Receipt },
      { id: 'events', label: 'События', icon: Calendar },
      { id: 'inventory', label: 'Остатки', icon: Package },
      { id: 'dashboard', label: 'Отчёты', icon: BarChart3 },
    ],
    [isOwner]);

  return (
    <div className="h-full flex flex-col lg:flex-row overflow-hidden relative">
      {/* ── Desktop sidebar — glass rail ── */}
      <aside
        className="hidden lg:flex flex-col w-[72px] shrink-0 fixed top-0 left-0 h-full z-40 items-center"
        style={{
          paddingTop: 'var(--safe-top)',
          paddingBottom: 'var(--safe-bottom)',
          background: 'rgba(10, 14, 26, 0.75)',
          backdropFilter: 'blur(40px) saturate(1.5)',
          WebkitBackdropFilter: 'blur(40px) saturate(1.5)',
          borderRight: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        <div className="py-5">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(6, 182, 212, 0.15))', boxShadow: '0 0 20px rgba(139, 92, 246, 0.15)' }}>
            <img src="/icons/tpos.svg" alt="T-POS" className="w-7 h-7 drop-shadow-lg" />
          </div>
        </div>

        <nav className="flex-1 flex flex-col items-center gap-1.5 pt-2">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                title={tab.label}
                className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-200 tap relative ${isActive
                  ? 'text-white'
                  : 'text-[var(--c-hint)] hover:text-[var(--c-text)] hover:bg-[rgba(255,255,255,0.06)]'
                  }`}
                style={isActive ? {
                  background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(6, 182, 212, 0.1))',
                  boxShadow: '0 0 16px rgba(139, 92, 246, 0.15)',
                } : undefined}
              >
                {isActive && (
                  <div
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                    style={{
                      background: 'linear-gradient(180deg, #8b5cf6, #06b6d4)',
                      boxShadow: '0 0 8px rgba(139, 92, 246, 0.4)',
                    }}
                  />
                )}
                <tab.icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : ''}`} />
              </button>
            );
          })}
        </nav>

        <div className="pb-5 flex flex-col items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            title={user?.nickname}
            style={{
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(6, 182, 212, 0.1))',
              border: '1px solid rgba(139, 92, 246, 0.15)',
            }}
          >
            <span className="text-[11px] font-bold text-[var(--c-accent-light)]">
              {user?.nickname?.charAt(0).toUpperCase()}
            </span>
          </div>
          <button
            onClick={() => useAuthStore.getState().logout()}
            title="Выход"
            className="w-11 h-11 rounded-xl flex items-center justify-center text-[var(--c-hint)] hover:bg-[rgba(251,113,133,0.08)] hover:text-[var(--c-danger)] transition-all tap"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col lg:ml-[72px] overflow-hidden">
        {/* ── Mobile header — glass blur ── */}
        <header
          className="lg:hidden shrink-0 z-40"
          style={{
            paddingTop: `calc(var(--safe-top) + 0.4rem)`,
            background: 'rgba(10, 14, 26, 0.75)',
            backdropFilter: 'blur(40px) saturate(1.5)',
            WebkitBackdropFilter: 'blur(40px) saturate(1.5)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <div className="flex items-center justify-between px-4 py-2 max-w-3xl mx-auto">
            <div className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(6, 182, 212, 0.15))',
                  boxShadow: '0 0 12px rgba(139, 92, 246, 0.1)',
                }}
              >
                <img src="/icons/tpos.svg" alt="T-POS" className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-[13px] font-bold text-[var(--c-text)] leading-tight">{user?.nickname || 'T-POS'}</h1>
              </div>
            </div>
            <button
              onClick={() => useAuthStore.getState().logout()}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-all group active:scale-90"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              <LogOut className="w-3.5 h-3.5 text-[var(--c-hint)] group-hover:text-[var(--c-danger)] transition-colors" />
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 py-3 lg:px-5 lg:py-4 w-full overflow-y-auto overflow-x-hidden overscroll-none flex flex-col">
          {children}
        </main>

        {/* ── Mobile bottom nav — glass tab bar ── */}
        <nav
          className="lg:hidden shrink-0 z-40"
          style={{
            paddingBottom: 'max(var(--tg-safe-bottom), calc(env(safe-area-inset-bottom, 0px) * 0.5))',
            transform: 'translateZ(0)',
            background: 'rgba(10, 14, 26, 0.85)',
            backdropFilter: 'blur(40px) saturate(1.6)',
            WebkitBackdropFilter: 'blur(40px) saturate(1.6)',
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            boxShadow: '0 -4px 30px rgba(0, 0, 0, 0.3)',
          }}
        >
          <div className="flex max-w-3xl mx-auto" style={{ height: 'var(--nav-height)' }}>
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-all duration-200 active:scale-90 relative shrink-0 min-w-0`}
                >
                  {/* Active glow indicator */}
                  {isActive && (
                    <div
                      className="absolute -top-px left-1/2 -translate-x-1/2 h-[2px] rounded-full"
                      style={{
                        width: '28px',
                        background: 'linear-gradient(90deg, #8b5cf6, #06b6d4)',
                        boxShadow: '0 0 10px rgba(139, 92, 246, 0.5), 0 0 20px rgba(139, 92, 246, 0.2)',
                        animation: 'nav-indicator-glow 3s ease-in-out infinite',
                      }}
                    />
                  )}

                  {/* Icon with glow background */}
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200 ${isActive ? '' : ''
                      }`}
                    style={isActive ? {
                      background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(6, 182, 212, 0.08))',
                    } : undefined}
                  >
                    <tab.icon
                      className={`w-[20px] h-[20px] shrink-0 transition-all duration-200 ${isActive ? 'stroke-[2.5] text-white' : 'stroke-[1.5] text-[var(--c-hint)]'
                        }`}
                    />
                  </div>

                  <span
                    className={`text-[10px] font-semibold truncate w-full px-1 transition-all duration-200 ${isActive ? 'text-white opacity-100' : 'text-[var(--c-hint)] opacity-50'
                      }`}
                  >
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
