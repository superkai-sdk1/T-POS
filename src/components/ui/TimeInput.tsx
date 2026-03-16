import { useState } from 'react';
import { Clock } from 'lucide-react';

interface TimeInputProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function TimeInput({ label, value, onChange, className = '' }: TimeInputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label className="block text-xs font-semibold text-[var(--c-hint)] mb-2 uppercase tracking-wider">
          {label}
        </label>
      )}
      <div
        className={`flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[var(--c-surface)] border transition-all duration-200 min-h-[44px] ${
          focused
            ? 'border-[var(--c-accent)]/30 ring-2 ring-[var(--c-accent)]/20 bg-[var(--c-surface-hover)]'
            : 'border-[var(--c-border)]'
        }`}
      >
        <Clock className="w-5 h-5 text-[var(--c-muted)] shrink-0" />
        <input
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="flex-1 bg-transparent text-[var(--c-text)] font-medium focus:outline-none tabular-nums appearance-none text-sm cursor-pointer"
          style={{ colorScheme: 'dark' }}
        />
      </div>
    </div>
  );
}
