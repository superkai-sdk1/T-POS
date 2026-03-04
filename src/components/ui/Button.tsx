import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  children: ReactNode;
  fullWidth?: boolean;
  loading?: boolean;
}

const variantStyles = {
  primary:
    'bg-[var(--tg-theme-button-color,#6c5ce7)] text-[var(--tg-theme-button-text-color,#fff)] shadow-md shadow-[var(--tg-theme-button-color,#6c5ce7)]/15 hover:brightness-110',
  secondary:
    'bg-white/6 text-[var(--tg-theme-text-color,#e0e0e0)] hover:bg-white/10 border border-white/6',
  danger:
    'bg-red-500/12 text-red-400 hover:bg-red-500/20 border border-red-500/8',
  ghost:
    'text-[var(--tg-theme-link-color,#6c5ce7)] hover:bg-white/5',
};

const sizeStyles = {
  sm: 'px-3 py-1.5 text-xs rounded-xl gap-1.5',
  md: 'px-4 py-2.5 text-sm rounded-xl gap-2',
  lg: 'px-6 py-3 text-sm rounded-2xl gap-2',
  icon: 'w-10 h-10 rounded-xl',
};

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth,
  loading,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`
        font-semibold transition-all duration-150 flex items-center justify-center
        active:scale-[0.96]
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${fullWidth ? 'w-full' : ''}
        disabled:opacity-35 disabled:pointer-events-none disabled:shadow-none
        ${className}
      `}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        children
      )}
    </button>
  );
}
