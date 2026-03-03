import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className = '', ...props }: InputProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-[var(--tg-theme-hint-color,#888)] mb-1">
          {label}
        </label>
      )}
      <input
        className={`
          w-full px-4 py-3 rounded-xl
          bg-white/5 border border-white/10
          text-[var(--tg-theme-text-color,#e0e0e0)]
          placeholder:text-white/30
          focus:outline-none focus:ring-2 focus:ring-[var(--tg-theme-button-color,#6c5ce7)]/50 focus:border-transparent
          transition-all
          ${error ? 'border-red-500/50 ring-red-500/20' : ''}
          ${className}
        `}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
