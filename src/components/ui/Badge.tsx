import type { ReactNode } from 'react';

interface BadgeProps {
  children: ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'accent';
  size?: 'sm' | 'md';
  className?: string;
  pulse?: boolean;
  icon?: ReactNode;
}

const variants = {
  default: 'bg-[rgba(255,255,255,0.06)] text-[var(--c-hint)] border border-[rgba(255,255,255,0.08)] [backdrop-filter:blur(8px)] [-webkit-backdrop-filter:blur(8px)]',
  success: 'bg-[rgba(52,211,153,0.1)] text-[var(--c-success)] border border-[rgba(52,211,153,0.15)] [backdrop-filter:blur(8px)] [-webkit-backdrop-filter:blur(8px)]',
  warning: 'bg-[rgba(251,191,36,0.1)] text-[var(--c-warning)] border border-[rgba(251,191,36,0.15)] [backdrop-filter:blur(8px)] [-webkit-backdrop-filter:blur(8px)]',
  danger: 'bg-[rgba(251,113,133,0.1)] text-[var(--c-danger)] border border-[rgba(251,113,133,0.15)] [backdrop-filter:blur(8px)] [-webkit-backdrop-filter:blur(8px)]',
  accent: 'bg-[rgba(139,92,246,0.1)] text-[var(--c-accent-light)] border border-[rgba(139,92,246,0.15)] [backdrop-filter:blur(8px)] [-webkit-backdrop-filter:blur(8px)]',
};

const sizes = {
  sm: 'px-1.5 py-px text-[10px] rounded-md gap-0.5',
  md: 'px-2 py-0.5 text-[11px] rounded-lg gap-1',
};

export function Badge({ children, variant = 'default', size = 'md', className = '', pulse, icon }: BadgeProps) {
  return (
    <span className={`inline-flex items-center font-semibold leading-tight ${variants[variant]} ${sizes[size]} ${pulse ? 'animate-pulse' : ''} ${className}`}>
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </span>
  );
}
