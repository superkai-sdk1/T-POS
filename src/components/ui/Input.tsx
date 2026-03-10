import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  compact?: boolean;
}

export function Input({ label, error, hint, compact, className = '', ...props }: InputProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-[11px] font-semibold text-[var(--c-hint)] mb-1.5 uppercase tracking-wider">
          {label}
        </label>
      )}
      <input
        className={`
          w-full ${compact ? 'px-3.5 py-2.5 text-sm min-h-[44px]' : 'px-4 py-3 min-h-[48px]'} rounded-xl
          text-[var(--c-text)] text-sm
          placeholder:text-[var(--c-muted)]
          bg-[var(--c-surface)] border border-[var(--c-border)]
          backdrop-blur-[12px]
          transition-all duration-200
          focus:border-[rgba(var(--c-accent-rgb),0.3)] focus:shadow-[var(--shadow-input-focus)] focus:bg-[var(--c-surface-hover)]
          focus:outline-none
          ${error ? 'border-[var(--c-danger-border)] ring-1 ring-[var(--c-danger-bg)]' : ''}
          ${className}
        `}
        {...props}
      />
      {error && <p className="mt-1 text-[11px] text-[var(--c-danger)] font-medium">{error}</p>}
      {hint && !error && <p className="mt-1 text-[11px] text-[var(--c-muted)]">{hint}</p>}
    </div>
  );
}
