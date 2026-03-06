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
    'text-[var(--c-accent-text)] shadow-md hover:brightness-110 [background:linear-gradient(135deg,var(--c-accent),var(--c-accent-light))] [box-shadow:0_4px_16px_rgba(var(--c-accent-rgb),0.25)]',
  secondary:
    'bg-[var(--c-surface)] text-[var(--c-text)] hover:bg-[var(--c-surface-hover)] border border-[var(--c-border)]',
  danger:
    'bg-[var(--c-danger-bg)] text-[var(--c-danger)] hover:brightness-125 border border-[var(--c-danger-border)]',
  ghost:
    'text-[var(--c-accent)] hover:bg-[var(--c-surface)]',
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
