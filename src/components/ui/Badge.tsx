import type { ReactNode } from 'react';

interface BadgeProps {
  children: ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'accent';
  className?: string;
  pulse?: boolean;
}

const variants = {
  default: 'bg-white/8 text-white/60 border border-white/5',
  success: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/10',
  warning: 'bg-amber-500/15 text-amber-400 border border-amber-500/10',
  danger: 'bg-red-500/15 text-red-400 border border-red-500/10',
  accent: 'bg-[var(--tg-theme-button-color,#6c5ce7)]/15 text-[var(--tg-theme-button-color,#6c5ce7)] border border-[var(--tg-theme-button-color,#6c5ce7)]/10',
};

export function Badge({ children, variant = 'default', className = '', pulse }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-semibold ${variants[variant]} ${pulse ? 'animate-pulse' : ''} ${className}`}>
      {children}
    </span>
  );
}
