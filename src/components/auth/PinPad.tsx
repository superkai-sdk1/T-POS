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
      className="min-h-screen flex flex-col items-center justify-center p-4 bg-[var(--tg-theme-bg-color,#0f0f23)]"
      style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}
    >
      {onBack && (
        <button
          onClick={onBack}
          className="absolute p-2 rounded-xl text-white/40 hover:text-white/70 hover:bg-white/5 transition-all duration-150"
          style={{ top: 'calc(var(--safe-top) + 1rem)', left: '1rem' }}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      )}

      <div className="flex flex-col items-center w-full max-w-xs animate-fade-in">
        <div className="card p-6 w-full flex flex-col items-center gap-5">
          <div className="text-center">
            <h1 className="text-xl font-bold text-[var(--tg-theme-text-color,#e0e0e0)]">
              {displayTitle}
            </h1>
            {displaySubtitle && (
              <p className="text-[10px] text-[var(--tg-theme-hint-color,#888)] mt-0.5">{displaySubtitle}</p>
            )}
          </div>

          <div className={`flex gap-3 ${shake ? 'animate-shake' : ''}`}>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full transition-all duration-150 ${
                  pin.length > i
                    ? 'bg-[var(--tg-theme-button-color,#6c5ce7)] scale-110'
                    : 'bg-white/15'
                }`}
              />
            ))}
          </div>

          {displayError && (
            <p className="text-[13px] text-red-400 bg-red-500/10 rounded-xl px-3 py-1.5 text-center animate-fade-in w-full">
              {displayError}
            </p>
          )}

          <div className="grid grid-cols-3 gap-2.5 w-full">
            {keys.map((key, i) => {
              if (key === '') return <div key={i} />;
              if (key === 'del') {
                return (
                  <button
                    key={i}
                    onClick={handleDelete}
                    disabled={pin.length === 0 || isLoading}
                    className="w-14 h-14 rounded-xl flex items-center justify-center text-white/40 hover:bg-white/5 active:bg-white/10 transition-all duration-150 active:scale-90 disabled:opacity-30"
                  >
                    <Delete className="w-5 h-5" />
                  </button>
                );
              }
              return (
                <button
                  key={i}
                  onClick={() => handleDigit(key)}
                  disabled={isLoading}
                  className="w-14 h-14 rounded-xl bg-white/5 hover:bg-white/10 active:bg-white/15 text-xl font-semibold text-[var(--tg-theme-text-color,#e0e0e0)] transition-all duration-150 active:scale-90 disabled:opacity-50"
                >
                  {key}
                </button>
              );
            })}
          </div>

          {isLoading && (
            <div className="flex items-center gap-2 text-[var(--tg-theme-hint-color,#888)]">
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              <span className="text-[13px]">Проверка...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
