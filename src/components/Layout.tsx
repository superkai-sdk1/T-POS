import { type ReactNode } from 'react';
import { useAuthStore } from '@/store/auth';
import { Receipt, Package, BarChart3, LogOut, Settings } from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function Layout({ children, activeTab, onTabChange }: LayoutProps) {
  const { user, logout, isOwner } = useAuthStore();

  const tabs = isOwner()
    ? [
        { id: 'pos', label: 'Касса', icon: Receipt },
        { id: 'dashboard', label: 'Отчёты', icon: BarChart3 },
        { id: 'management', label: 'Управление', icon: Settings },
      ]
    : [
        { id: 'pos', label: 'Касса', icon: Receipt },
        { id: 'inventory', label: 'Остатки', icon: Package },
        { id: 'dashboard', label: 'Отчёты', icon: BarChart3 },
      ];

  return (
    <div className="min-h-screen bg-[var(--tg-theme-bg-color,#0f0f23)] flex flex-col">
      <header
        className="sticky top-0 z-40 px-4 py-3 bg-[var(--tg-theme-secondary-bg-color,#1a1a2e)]/95 backdrop-blur-xl border-b border-white/5"
        style={{ paddingTop: `calc(var(--safe-top) + 0.75rem)` }}
      >
        <div className="flex items-center justify-between max-w-3xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--tg-theme-button-color,#6c5ce7)]/20 flex items-center justify-center">
              <span className="text-sm font-black text-[var(--tg-theme-button-color,#6c5ce7)]">T</span>
            </div>
            <div>
              <h1 className="text-base font-bold text-[var(--tg-theme-text-color,#e0e0e0)] leading-tight">T-POS</h1>
              <p className="text-[10px] text-[var(--tg-theme-hint-color,#888)] leading-tight">
                {user?.nickname}
                {isOwner() && <span className="text-[var(--tg-theme-button-color,#6c5ce7)] ml-1">owner</span>}
              </p>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center hover:bg-red-500/10 transition-colors group active:scale-95"
          >
            <LogOut className="w-4 h-4 text-[var(--tg-theme-hint-color,#888)] group-hover:text-red-400" />
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 py-4 max-w-3xl mx-auto w-full" style={{ paddingBottom: 'calc(4rem + var(--safe-bottom))' }}>
        {children}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[var(--tg-theme-secondary-bg-color,#1a1a2e)]/95 backdrop-blur-xl border-t border-white/5" style={{ paddingBottom: 'var(--safe-bottom)' }}>
        <div className="flex max-w-3xl mx-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`
                flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors active:scale-95
                ${activeTab === tab.id
                  ? 'text-[var(--tg-theme-button-color,#6c5ce7)]'
                  : 'text-[var(--tg-theme-hint-color,#888)]'
                }
              `}
            >
              <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? 'stroke-[2.5]' : ''}`} />
              <span className="text-[10px] font-semibold">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
