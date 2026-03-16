import type { ButtonHTMLAttributes } from 'react';

interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: string;
  description?: string;
}

export function Switch({ checked, onCheckedChange, label, description, className = '', disabled, ...props }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={`flex items-center justify-between gap-4 p-4 rounded-2xl card-interactive text-left w-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--c-accent)]/20 ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
      {...props}
    >
      {(label || description) && (
        <div className="flex-1 min-w-0">
          {label && <p className="text-sm font-medium text-[var(--c-text)]">{label}</p>}
          {description && <p className="text-xs text-[var(--c-hint)] mt-1">{description}</p>}
        </div>
      )}
      <div
        className={`relative shrink-0 w-12 h-7 rounded-full transition-colors duration-200 ${
          checked ? 'bg-[var(--c-accent)]' : 'bg-[var(--c-surface)] border border-[var(--c-border)]'
        }`}
      >
        <div
          className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-200 ${
            checked ? 'left-6' : 'left-1'
          }`}
        />
      </div>
    </button>
  );
}
