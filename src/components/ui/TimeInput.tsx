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
        <label className="block text-xs font-semibold text-[var(--c-hint)] mb-1.5 uppercase tracking-wide">
          {label}
        </label>
      )}
      <div
        className={`flex items-center gap-2 px-4 py-3 rounded-xl bg-white/5 border transition-all duration-200 ${
          focused
            ? 'border-[var(--c-accent)]/30 ring-2 ring-[var(--c-accent)]/40 bg-white/8'
            : 'border-white/8'
        }`}
      >
        <Clock className="w-4 h-4 text-white/25 shrink-0" />
        <input
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="flex-1 bg-transparent text-[var(--c-text)] font-medium focus:outline-none tabular-nums appearance-none"
          style={{ colorScheme: 'dark' }}
        />
      </div>
    </div>
  );
}
