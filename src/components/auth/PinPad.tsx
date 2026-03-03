import { useState, useCallback, useEffect } from 'react';
import { Delete, ArrowLeft } from 'lucide-react';
import { hapticFeedback, hapticNotification } from '@/lib/telegram';

interface PinPadProps {
  title: string;
  subtitle?: string;
  onComplete: (pin: string) => void;
  onBack?: () => void;
  error?: string | null;
  isLoading?: boolean;
  /** If true, requires user to enter PIN twice to confirm */
  confirmMode?: boolean;
}

export function PinPad({ title, subtitle, onComplete, onBack, error, isLoading, confirmMode }: PinPadProps) {
  const [pin, setPin] = useState('');
  const [firstPin, setFirstPin] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState('');
  const [shake, setShake] = useState(false);

  const isConfirming = confirmMode && firstPin !== null;
  const displayError = confirmError || error;

  useEffect(() => {
    if (displayError) {
      setShake(true);
      hapticNotification('error');
      const t = setTimeout(() => setShake(false), 500);
      return () => clearTimeout(t);
    }
  }, [displayError]);

  const handleDigit = useCallback((digit: string) => {
    if (isLoading) return;
    hapticFeedback('light');
    setConfirmError('');

    setPin((prev) => {
      const next = prev + digit;
      if (next.length === 4) {
        setTimeout(() => {
          if (confirmMode) {
            if (firstPin === null) {
              setFirstPin(next);
              setPin('');
            } else {
              if (next === firstPin) {
                onComplete(next);
              } else {
                setConfirmError('PIN-коды не совпадают');
                setFirstPin(null);
                setPin('');
                hapticNotification('error');
              }
            }
          } else {
            onComplete(next);
            setPin('');
          }
        }, 150);
      }
      return next.length <= 4 ? next : prev;
    });
  }, [isLoading, confirmMode, firstPin, onComplete]);

  const handleDelete = useCallback(() => {
    if (isLoading) return;
    hapticFeedback('light');
    setPin((prev) => prev.slice(0, -1));
    setConfirmError('');
  }, [isLoading]);

  const displayTitle = isConfirming ? 'Повторите PIN-код' : title;
  const displaySubtitle = isConfirming ? 'Введите PIN-код ещё раз' : subtitle;

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6 bg-[var(--tg-theme-bg-color,#0f0f23)]"
      style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}
    >
      {onBack && (
        <button
          onClick={onBack}
          className="absolute top-4 left-4 p-2 rounded-xl text-white/40 hover:text-white/70 hover:bg-white/5 transition-all"
          style={{ top: 'calc(var(--safe-top) + 1rem)' }}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      )}

      <div className="flex flex-col items-center gap-8 w-full max-w-xs">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[var(--tg-theme-text-color,#e0e0e0)]">
            {displayTitle}
          </h1>
          {displaySubtitle && (
            <p className="text-sm text-[var(--tg-theme-hint-color,#888)] mt-1">{displaySubtitle}</p>
          )}
        </div>

        <div className={`flex gap-4 ${shake ? 'animate-shake' : ''}`}>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full transition-all duration-200 ${
                pin.length > i
                  ? 'bg-[var(--tg-theme-button-color,#6c5ce7)] scale-110'
                  : 'bg-white/15'
              }`}
            />
          ))}
        </div>

        {displayError && (
          <p className="text-sm text-red-400 bg-red-500/10 rounded-xl px-4 py-2 text-center animate-fade-in">
            {displayError}
          </p>
        )}

        <div className="grid grid-cols-3 gap-3 w-full">
          {keys.map((key, i) => {
            if (key === '') return <div key={i} />;
            if (key === 'del') {
              return (
                <button
                  key={i}
                  onClick={handleDelete}
                  disabled={pin.length === 0 || isLoading}
                  className="h-16 rounded-2xl flex items-center justify-center text-white/40 hover:bg-white/5 active:bg-white/10 transition-all active:scale-95 disabled:opacity-30"
                >
                  <Delete className="w-6 h-6" />
                </button>
              );
            }
            return (
              <button
                key={i}
                onClick={() => handleDigit(key)}
                disabled={isLoading}
                className="h-16 rounded-2xl bg-white/5 hover:bg-white/10 active:bg-white/15 text-2xl font-semibold text-[var(--tg-theme-text-color,#e0e0e0)] transition-all active:scale-95 disabled:opacity-50"
              >
                {key}
              </button>
            );
          })}
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 text-[var(--tg-theme-hint-color,#888)]">
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Проверка...</span>
          </div>
        )}
      </div>
    </div>
  );
}
