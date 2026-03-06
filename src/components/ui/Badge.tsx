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
  default: 'bg-[var(--c-surface)] text-[var(--c-hint)] border border-[var(--c-border)]',
  success: 'bg-[var(--c-success-bg)] text-[var(--c-success)] border border-[var(--c-success-border)]',
  warning: 'bg-[var(--c-warning-bg)] text-[var(--c-warning)] border border-[var(--c-warning-border)]',
  danger: 'bg-[var(--c-danger-bg)] text-[var(--c-danger)] border border-[var(--c-danger-border)]',
  accent: 'bg-[rgba(var(--c-accent-rgb),0.1)] text-[var(--c-accent)] border border-[rgba(var(--c-accent-rgb),0.15)]',
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
