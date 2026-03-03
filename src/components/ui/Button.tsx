import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
  fullWidth?: boolean;
}

const variantStyles = {
  primary: 'bg-[var(--tg-theme-button-color,#6c5ce7)] text-[var(--tg-theme-button-text-color,#fff)] hover:brightness-110 active:scale-[0.97]',
  secondary: 'bg-white/10 text-[var(--tg-theme-text-color,#e0e0e0)] hover:bg-white/20 active:scale-[0.97]',
  danger: 'bg-red-500/20 text-red-400 hover:bg-red-500/30 active:scale-[0.97]',
  ghost: 'text-[var(--tg-theme-link-color,#6c5ce7)] hover:bg-white/5 active:scale-[0.97]',
};

const sizeStyles = {
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-4 py-2.5 text-base rounded-xl',
  lg: 'px-6 py-3.5 text-lg rounded-xl',
};

export function Button({ variant = 'primary', size = 'md', fullWidth, children, className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`
        font-semibold transition-all duration-150 flex items-center justify-center gap-2
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${fullWidth ? 'w-full' : ''}
        disabled:opacity-40 disabled:pointer-events-none
        ${className}
      `}
      {...props}
    >
      {children}
    </button>
  );
}
