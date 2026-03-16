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
  default: 'bg-white/6 text-[var(--c-hint)] border border-white/12 backdrop-blur-sm',
  success: 'bg-[rgba(52,211,153,0.08)] text-[var(--c-success)] border border-[rgba(52,211,153,0.18)] backdrop-blur-sm',
  warning: 'bg-[rgba(251,191,36,0.08)] text-[var(--c-warning)] border border-[rgba(251,191,36,0.18)] backdrop-blur-sm',
  danger: 'bg-[rgba(251,113,133,0.08)] text-[var(--c-danger)] border border-[rgba(251,113,133,0.18)] backdrop-blur-sm',
  accent: 'bg-[rgba(139,92,246,0.08)] text-[var(--c-accent-light)] border border-[rgba(139,92,246,0.18)] backdrop-blur-sm',
};

const sizes = {
  sm: 'px-2 py-1 text-xs rounded-lg gap-1',
  md: 'px-3 py-1.5 text-sm rounded-lg gap-1.5',
};

export function Badge({ children, variant = 'default', size = 'md', className = '', pulse, icon }: BadgeProps) {
  return (
    <span className={`inline-flex items-center font-semibold leading-tight ${variants[variant]} ${sizes[size]} ${pulse ? 'animate-pulse' : ''} ${className}`}>
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </span>
  );
}
