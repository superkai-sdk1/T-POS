import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
  fullWidth?: boolean;
  loading?: boolean;
}

const variantStyles = {
  primary: 'bg-[var(--tg-theme-button-color,#6c5ce7)] text-[var(--tg-theme-button-text-color,#fff)] shadow-lg shadow-[var(--tg-theme-button-color,#6c5ce7)]/20 hover:brightness-110 active:scale-[0.97]',
  secondary: 'bg-white/8 text-[var(--tg-theme-text-color,#e0e0e0)] hover:bg-white/14 active:scale-[0.97] border border-white/5',
  danger: 'bg-red-500/15 text-red-400 hover:bg-red-500/25 active:scale-[0.97] border border-red-500/10',
  ghost: 'text-[var(--tg-theme-link-color,#6c5ce7)] hover:bg-white/5 active:scale-[0.97]',
};

const sizeStyles = {
  sm: 'px-3 py-1.5 text-sm rounded-xl gap-1.5',
  md: 'px-4 py-2.5 text-sm rounded-xl gap-2',
  lg: 'px-6 py-3.5 text-base rounded-2xl gap-2',
};

export function Button({ variant = 'primary', size = 'md', fullWidth, loading, children, className = '', disabled, ...props }: ButtonProps) {
  return (
    <button
      className={`
        font-semibold transition-all duration-200 flex items-center justify-center
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${fullWidth ? 'w-full' : ''}
        disabled:opacity-40 disabled:pointer-events-none disabled:shadow-none
        ${className}
      `}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        children
      )}
    </button>
  );
}
