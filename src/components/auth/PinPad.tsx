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
      className="min-h-dvh min-h-[100dvh] flex flex-col items-center justify-center p-3 sm:p-4 relative overflow-y-auto"
      style={{
        paddingTop: 'calc(var(--safe-top) + 0.5rem)',
        paddingBottom: 'calc(var(--safe-bottom) + 0.5rem)',
        backgroundColor: 'var(--c-bg)',
        background: 'linear-gradient(135deg, #0a0e1a 0%, #0f172a 40%, #1a1040 100%)',
      }}
    >
      {/* ── Animated Background Orbs ── */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div
          className="absolute top-[5%] left-1/2 -translate-x-1/2 w-[200px] sm:w-[300px] h-[200px] sm:h-[300px] rounded-full animate-orb-float"
          style={{ background: 'radial-gradient(circle, rgba(139, 92, 246, 0.1) 0%, transparent 70%)', filter: 'blur(40px)' }}
        />
        <div
          className="absolute bottom-[10%] left-[20%] w-[120px] sm:w-[200px] h-[120px] sm:h-[200px] rounded-full animate-orb-float"
          style={{ background: 'radial-gradient(circle, rgba(6, 182, 212, 0.06) 0%, transparent 70%)', filter: 'blur(30px)', animationDelay: '-3s' }}
        />
      </div>

      {/* ── Back Button ── */}
      {onBack && (
        <button
          onClick={onBack}
          className="absolute p-2.5 sm:p-3 rounded-xl sm:rounded-2xl transition-all duration-200 z-10 active:scale-90 min-w-[44px] min-h-[44px] cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--c-accent)]/20"
          style={{
            top: 'calc(var(--safe-top) + 0.5rem)',
            left: '0.75rem',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
          }}
        >
          <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 text-[var(--c-hint)]" />
        </button>
      )}

      <div className="flex flex-col items-center w-full max-w-[280px] sm:max-w-xs animate-fade-in relative z-10">
        {/* ── Logo ── */}
        <div
          className="w-12 h-12 sm:w-14 sm:h-14 lg:w-16 lg:h-16 rounded-xl sm:rounded-2xl flex items-center justify-center mb-3 sm:mb-4"
          style={{
            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(6, 182, 212, 0.1))',
            boxShadow: '0 0 24px rgba(139, 92, 246, 0.12)',
            border: '1px solid rgba(139, 92, 246, 0.15)',
          }}
        >
          <img src="/icons/tpos.svg" alt="T-POS" className="w-7 h-auto sm:w-8 lg:w-10" />
        </div>

        {/* ── Glass Card ── */}
        <div
          className="p-4 sm:p-5 lg:p-6 w-full flex flex-col items-center gap-3 sm:gap-4 rounded-xl sm:rounded-2xl lg:rounded-3xl"
          style={{
            background: 'rgba(255, 255, 255, 0.04)',
            backdropFilter: 'blur(30px) saturate(1.4)',
            WebkitBackdropFilter: 'blur(30px) saturate(1.4)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        >
          {/* ── Title ── */}
          <div className="text-center">
            <h1 className="text-base sm:text-lg lg:text-xl font-bold text-[var(--c-text)]">
              {displayTitle}
            </h1>
            {displaySubtitle && (
              <p className="text-xs sm:text-sm text-[var(--c-hint)] mt-0.5 sm:mt-1">{displaySubtitle}</p>
            )}
          </div>

          {/* ── PIN Dots with Glow ── */}
          <div className={`flex gap-2 sm:gap-3 lg:gap-4 ${shake ? 'animate-shake' : ''}`}>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`w-3 h-3 sm:w-4 sm:h-4 rounded-full transition-all duration-200 ${pin.length > i ? 'scale-110' : ''
                  }`}
                style={pin.length > i ? {
                  background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)',
                  boxShadow: '0 0 12px rgba(139, 92, 246, 0.5), 0 0 24px rgba(139, 92, 246, 0.2)',
                } : {
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              />
            ))}
          </div>

          {/* ── Error ── */}
          {displayError && (
            <p
              className="text-[11px] sm:text-[13px] text-[var(--c-danger)] rounded-lg sm:rounded-xl px-2 sm:px-3 py-1 sm:py-1.5 text-center animate-fade-in w-full"
              style={{ background: 'rgba(251,113,133,0.08)', border: '1px solid rgba(251,113,133,0.15)' }}
            >
              {displayError}
            </p>
          )}

          {/* ── Keypad ── */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 w-full">
            {keys.map((key, i) => {
              if (key === '') return <div key={i} />;
              if (key === 'del') {
                return (
              <button
                key={i}
                onClick={handleDelete}
                disabled={pin.length === 0 || isLoading}
                className="aspect-square rounded-xl sm:rounded-2xl flex items-center justify-center transition-all duration-200 active:scale-90 disabled:opacity-30"
                style={{
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                }}
              >
                <Delete className="w-4 h-4 sm:w-5 sm:h-5 text-[var(--c-hint)]" />
              </button>
                );
              }
              return (
                <button
                  key={i}
                  onClick={() => handleDigit(key)}
                  disabled={isLoading}
                  className="aspect-square rounded-xl sm:rounded-2xl text-lg sm:text-xl font-semibold text-[var(--c-text)] transition-all duration-200 active:scale-90 disabled:opacity-50"
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                  }}
                >
                  {key}
                </button>
              );
            })}
          </div>

          {/* ── Loading Spinner ── */}
          {isLoading && (
            <div className="flex items-center gap-1.5 sm:gap-2 text-[var(--c-hint)]">
              <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 border-2 border-[var(--c-accent)] border-t-transparent rounded-full animate-spin" />
              <span className="text-[11px] sm:text-[13px]">Проверка...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
