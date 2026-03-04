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
  default: 'bg-white/7 text-white/60 border border-white/5',
  success: 'bg-emerald-500/12 text-emerald-400 border border-emerald-500/8',
  warning: 'bg-amber-500/12 text-amber-400 border border-amber-500/8',
  danger: 'bg-red-500/12 text-red-400 border border-red-500/8',
  accent: 'bg-[var(--c-accent)]/12 text-[var(--c-accent)] border border-[var(--c-accent)]/8',
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
