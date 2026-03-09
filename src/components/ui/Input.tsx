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
          transition-all duration-200
          ${error ? 'border-[var(--c-danger-border)] ring-1 ring-[var(--c-danger-bg)]' : ''}
          ${className}
        `}
        style={{
          background: 'rgba(255, 255, 255, 0.04)',
          border: error ? undefined : '1px solid rgba(255, 255, 255, 0.08)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
        onFocus={(e) => {
          e.target.style.borderColor = 'rgba(139, 92, 246, 0.3)';
          e.target.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.12), 0 0 16px rgba(139, 92, 246, 0.06)';
          e.target.style.background = 'rgba(255, 255, 255, 0.06)';
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          e.target.style.borderColor = 'rgba(255, 255, 255, 0.08)';
          e.target.style.boxShadow = 'none';
          e.target.style.background = 'rgba(255, 255, 255, 0.04)';
          props.onBlur?.(e);
        }}
        {...props}
      />
      {error && <p className="mt-1 text-[11px] text-[var(--c-danger)] font-medium">{error}</p>}
      {hint && !error && <p className="mt-1 text-[11px] text-[var(--c-muted)]">{hint}</p>}
    </div>
  );
}
