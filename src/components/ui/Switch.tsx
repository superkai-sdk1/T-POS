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
      className={`flex items-center justify-between gap-3 p-3 rounded-xl card-interactive text-left w-full ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
      {...props}
    >
      {(label || description) && (
        <div className="flex-1 min-w-0">
          {label && <p className="text-[13px] font-medium text-[var(--c-text)]">{label}</p>}
          {description && <p className="text-xs text-[var(--c-hint)] mt-0.5">{description}</p>}
        </div>
      )}
      <div
        className={`relative shrink-0 w-11 h-6 rounded-full transition-colors duration-200 ${
          checked ? 'bg-[var(--c-accent)]' : 'bg-[var(--c-surface)] border border-[var(--c-border)]'
        }`}
      >
        <div
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-200 ${
            checked ? 'left-6' : 'left-0.5'
          }`}
        />
      </div>
    </button>
  );
}
