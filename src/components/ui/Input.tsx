import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function Input({ label, error, hint, size = 'md', className = '', ...props }: InputProps) {
  const sizeStyles = {
    sm: 'px-3 py-2 text-xs min-h-[36px]',
    md: 'px-4 py-2.5 text-sm min-h-[44px]',
    lg: 'px-5 py-3 text-base min-h-[48px]',
  };

  return (
    <div className="w-full">
      {label && (
        <label className="block text-xs font-semibold text-[var(--c-hint)] mb-2 uppercase tracking-wider">
          {label}
        </label>
      )}
      <input
        className={`
          w-full ${sizeStyles[size]} rounded-xl
          text-[var(--c-text)]
          placeholder:text-[var(--c-muted)]
          bg-[var(--c-surface)] border border-[var(--c-border)]
          backdrop-blur-[12px]
          transition-all duration-200
          will-change-colors
          backface-hidden
          cursor-text
          focus:border-[rgba(var(--c-accent-rgb),0.3)] focus:shadow-[var(--shadow-input-focus)] focus:bg-[var(--c-surface-hover)]
          focus:outline-none focus:ring-2 focus:ring-[var(--c-accent)]/20
          ${error ? 'border-[var(--c-danger-border)] ring-1 ring-[var(--c-danger-bg)]' : ''}
          ${className}
        `}
        {...props}
      />
      {error && <p className="mt-1.5 text-xs text-[var(--c-danger)] font-medium">{error}</p>}
      {hint && !error && <p className="mt-1.5 text-xs text-[var(--c-muted)]">{hint}</p>}
    </div>
  );
}
