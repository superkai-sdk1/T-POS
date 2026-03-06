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
        <label className="block text-[11px] font-semibold text-[var(--c-hint)] mb-1 uppercase tracking-wider">
          {label}
        </label>
      )}
      <input
        className={`
          w-full ${compact ? 'px-3 py-2 text-sm' : 'px-3.5 py-2.5'} rounded-xl
          bg-[var(--c-surface)] border border-[var(--c-border-strong)]
          text-[var(--c-text)] text-sm
          placeholder:text-[var(--c-muted)]
          focus:outline-none focus:ring-2 focus:ring-[rgba(var(--c-accent-rgb),0.3)] focus:border-[rgba(var(--c-accent-rgb),0.25)] focus:bg-[var(--c-surface-hover)]
          transition-all duration-150
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
