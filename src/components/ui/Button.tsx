import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { hapticFeedback } from '@/lib/telegram';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  children: ReactNode;
  fullWidth?: boolean;
  loading?: boolean;
}

const variantStyles = {
  primary:
    'text-white [background:linear-gradient(135deg,#8b5cf6,#06b6d4)] [box-shadow:0_4px_20px_rgba(139,92,246,0.3),0_0_40px_rgba(139,92,246,0.08)] hover:brightness-110 border border-[rgba(255,255,255,0.1)]',
  secondary:
    'text-[var(--c-text)] border border-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.15)] [background:rgba(255,255,255,0.05)] [backdrop-filter:blur(12px)] [-webkit-backdrop-filter:blur(12px)] hover:bg-[rgba(255,255,255,0.08)]',
  danger:
    'text-[var(--c-danger)] border border-[var(--c-danger-border)] [background:rgba(251,113,133,0.06)] [backdrop-filter:blur(12px)] [-webkit-backdrop-filter:blur(12px)] hover:bg-[rgba(251,113,133,0.12)] [box-shadow:0_0_16px_rgba(251,113,133,0.08)]',
  ghost:
    'text-[var(--c-accent-light)] hover:bg-[rgba(255,255,255,0.05)]',
};

const sizeStyles = {
  sm: 'px-4 py-2.5 text-[13px] rounded-xl gap-1.5 min-h-[44px]',
  md: 'px-5 py-3 text-sm rounded-xl gap-2 min-h-[48px]',
  lg: 'px-6 py-3.5 text-[15px] rounded-2xl gap-2 min-h-[52px]',
  icon: 'w-11 h-11 rounded-xl',
};

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth,
  loading,
  children,
  className = '',
  disabled,
  onClick,
  ...props
}: ButtonProps) {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    hapticFeedback('light');
    onClick?.(e);
  };

  return (
    <button
      {...props}
      onClick={handleClick}
      className={`
        font-semibold transition-all duration-150 flex items-center justify-center
        active:scale-[0.96]
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${fullWidth ? 'w-full' : ''}
        disabled:opacity-30 disabled:pointer-events-none disabled:shadow-none
        ${className}
      `}
      disabled={disabled || loading}
    >
      {loading ? (
        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        children
      )}
    </button>
  );
}
