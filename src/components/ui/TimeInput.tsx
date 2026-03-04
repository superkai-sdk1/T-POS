import { useState, useRef, useCallback } from 'react';
import { Clock } from 'lucide-react';

interface TimeInputProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function TimeInput({ label, value, onChange, className = '' }: TimeInputProps) {
  const [focused, setFocused] = useState(false);
  const hRef = useRef<HTMLInputElement>(null);
  const mRef = useRef<HTMLInputElement>(null);

  const [h, m] = value ? value.split(':') : ['', ''];

  const handleH = useCallback((raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 2);
    const num = Number(digits);
    const clamped = num > 23 ? '23' : digits;
    onChange(`${clamped.padStart(2, '0')}:${m || '00'}`);
    if (digits.length === 2 || num > 2) mRef.current?.focus();
  }, [m, onChange]);

  const handleM = useCallback((raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 2);
    const num = Number(digits);
    const clamped = num > 59 ? '59' : digits;
    onChange(`${h || '00'}:${clamped.padStart(2, '0')}`);
  }, [h, onChange]);

  const handleMKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !m) {
      hRef.current?.focus();
    }
  }, [m]);

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <label className="block text-xs font-semibold text-[var(--tg-theme-hint-color,#888)] mb-1.5 uppercase tracking-wide">
          {label}
        </label>
      )}
      <div
        className={`flex items-center gap-0.5 px-4 py-3 rounded-xl bg-white/5 border transition-all duration-200 ${
          focused
            ? 'border-[var(--tg-theme-button-color,#6c5ce7)]/30 ring-2 ring-[var(--tg-theme-button-color,#6c5ce7)]/40 bg-white/8'
            : 'border-white/8'
        }`}
      >
        <Clock className="w-4 h-4 text-white/25 shrink-0 mr-1.5" />
        <input
          ref={hRef}
          type="text"
          inputMode="numeric"
          maxLength={2}
          placeholder="00"
          value={h || ''}
          onChange={(e) => handleH(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="w-7 bg-transparent text-center text-[var(--tg-theme-text-color,#e0e0e0)] font-medium placeholder:text-white/20 focus:outline-none tabular-nums"
        />
        <span className="text-white/30 font-bold">:</span>
        <input
          ref={mRef}
          type="text"
          inputMode="numeric"
          maxLength={2}
          placeholder="00"
          value={m || ''}
          onChange={(e) => handleM(e.target.value)}
          onKeyDown={handleMKey}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="w-7 bg-transparent text-center text-[var(--tg-theme-text-color,#e0e0e0)] font-medium placeholder:text-white/20 focus:outline-none tabular-nums"
        />
      </div>
    </div>
  );
}
