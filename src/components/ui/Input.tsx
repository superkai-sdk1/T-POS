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
        <label className="block text-[11px] font-semibold text-[var(--tg-theme-hint-color,#888)] mb-1 uppercase tracking-wider">
          {label}
        </label>
      )}
      <input
        className={`
          w-full ${compact ? 'px-3 py-2 text-sm' : 'px-3.5 py-2.5'} rounded-xl
          bg-white/5 border border-white/8
          text-[var(--tg-theme-text-color,#e0e0e0)] text-sm
          placeholder:text-white/20
          focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-button-color,#6c5ce7)]/30 focus:border-[var(--tg-theme-button-color,#6c5ce7)]/25 focus:bg-white/7
          transition-all duration-150
          ${error ? 'border-red-500/40 ring-1 ring-red-500/20' : ''}
          ${className}
        `}
        {...props}
      />
      {error && <p className="mt-1 text-[11px] text-red-400 font-medium">{error}</p>}
      {hint && !error && <p className="mt-1 text-[11px] text-white/25">{hint}</p>}
    </div>
  );
}
