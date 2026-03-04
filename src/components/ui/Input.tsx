import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Input({ label, error, hint, className = '', ...props }: InputProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-xs font-semibold text-[var(--tg-theme-hint-color,#888)] mb-1.5 uppercase tracking-wide">
          {label}
        </label>
      )}
      <input
        className={`
          w-full px-4 py-3 rounded-xl
          bg-white/5 border border-white/8
          text-[var(--tg-theme-text-color,#e0e0e0)]
          placeholder:text-white/25
          focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-button-color,#6c5ce7)]/40 focus:border-[var(--tg-theme-button-color,#6c5ce7)]/30 focus:bg-white/8
          transition-all duration-200
          ${error ? 'border-red-500/40 ring-1 ring-red-500/20' : ''}
          ${className}
        `}
        {...props}
      />
      {error && <p className="mt-1.5 text-xs text-red-400 font-medium">{error}</p>}
      {hint && !error && <p className="mt-1.5 text-xs text-white/30">{hint}</p>}
    </div>
  );
}
