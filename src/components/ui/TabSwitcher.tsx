import type { ReactNode } from 'react';

interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
}

interface TabSwitcherProps {
  tabs: Tab[];
  activeId: string;
  onChange: (id: string) => void;
  /** Optional: accent color for active tab - 'accent' | 'indigo' | 'danger' | 'cyan' */
  variant?: 'accent' | 'indigo' | 'danger' | 'cyan' | 'warning';
}

const variantStyles = {
  accent: 'bg-[rgba(139,92,246,0.2)] text-white',
  indigo: 'bg-indigo-500/20 text-white',
  danger: 'bg-red-500/20 text-white',
  cyan: 'bg-cyan-500/20 text-white',
  warning: 'bg-amber-500/20 text-white',
};

export function TabSwitcher({ tabs, activeId, onChange, variant = 'accent' }: TabSwitcherProps) {
  return (
    <div className="flex justify-center w-full">
      <div className="inline-flex p-1 rounded-full bg-white/[0.05] border border-white/[0.08]" style={{ backfaceVisibility: 'hidden' }}>
        {tabs.map((tab) => {
          const isActive = activeId === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`
                flex items-center justify-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold
                min-h-[44px] min-w-[44px]
                transition-all duration-200 ease-[var(--ease-out-expo)]
                active:scale-[0.96]
                will-change-colors
                backface-hidden
                cursor-pointer
                focus:outline-none focus:ring-2 focus:ring-[var(--c-accent)]/20
                ${isActive
                  ? variantStyles[variant]
                  : 'text-[var(--c-muted)] hover:text-[var(--c-hint)] hover:bg-white/[0.04]'
                }
              `}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
