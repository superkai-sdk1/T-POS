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
      className="h-full flex flex-col items-center justify-center p-4 relative overflow-hidden"
      style={{
        paddingTop: 'var(--safe-top)',
        paddingBottom: 'var(--safe-bottom)',
        backgroundColor: 'var(--c-bg)',
        background: 'linear-gradient(135deg, #0a0e1a 0%, #0f172a 40%, #1a1040 100%)',
      }}
    >
      {/* ── Animated Background Orbs ── */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div
          className="absolute top-[5%] left-1/2 -translate-x-1/2 w-[300px] h-[300px] rounded-full animate-orb-float"
          style={{ background: 'radial-gradient(circle, rgba(139, 92, 246, 0.1) 0%, transparent 70%)', filter: 'blur(40px)' }}
        />
        <div
          className="absolute bottom-[10%] left-[20%] w-[200px] h-[200px] rounded-full animate-orb-float"
          style={{ background: 'radial-gradient(circle, rgba(6, 182, 212, 0.06) 0%, transparent 70%)', filter: 'blur(30px)', animationDelay: '-3s' }}
        />
      </div>

      {/* ── Back Button ── */}
      {onBack && (
        <button
          onClick={onBack}
          className="absolute p-2.5 rounded-xl transition-all duration-200 z-10 active:scale-90"
          style={{
            top: 'calc(var(--safe-top) + 1rem)',
            left: '1rem',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <ArrowLeft className="w-5 h-5 text-[var(--c-hint)]" />
        </button>
      )}

      <div className="flex flex-col items-center w-full max-w-xs animate-fade-in relative z-10">
        {/* ── Logo ── */}
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
          style={{
            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(6, 182, 212, 0.1))',
            boxShadow: '0 0 24px rgba(139, 92, 246, 0.12)',
            border: '1px solid rgba(139, 92, 246, 0.15)',
          }}
        >
          <img src="/icons/tpos.svg" alt="T-POS" className="w-10 h-auto" />
        </div>

        {/* ── Glass Card ── */}
        <div
          className="p-6 w-full flex flex-col items-center gap-5 rounded-3xl"
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
            <h1 className="text-xl font-bold text-[var(--c-text)]">
              {displayTitle}
            </h1>
            {displaySubtitle && (
              <p className="text-[11px] text-[var(--c-hint)] mt-1">{displaySubtitle}</p>
            )}
          </div>

          {/* ── PIN Dots with Glow ── */}
          <div className={`flex gap-4 ${shake ? 'animate-shake' : ''}`}>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full transition-all duration-200 ${pin.length > i ? 'scale-110' : ''
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
              className="text-[13px] text-[var(--c-danger)] rounded-xl px-3 py-1.5 text-center animate-fade-in w-full"
              style={{ background: 'rgba(251,113,133,0.08)', border: '1px solid rgba(251,113,133,0.15)' }}
            >
              {displayError}
            </p>
          )}

          {/* ── Keypad ── */}
          <div className="grid grid-cols-3 gap-3 w-full">
            {keys.map((key, i) => {
              if (key === '') return <div key={i} />;
              if (key === 'del') {
                return (
                  <button
                    key={i}
                    onClick={handleDelete}
                    disabled={pin.length === 0 || isLoading}
                    className="aspect-square rounded-2xl flex items-center justify-center transition-all duration-200 active:scale-90 disabled:opacity-30"
                    style={{
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                    }}
                  >
                    <Delete className="w-5 h-5 text-[var(--c-hint)]" />
                  </button>
                );
              }
              return (
                <button
                  key={i}
                  onClick={() => handleDigit(key)}
                  disabled={isLoading}
                  className="aspect-square rounded-2xl text-xl font-semibold text-[var(--c-text)] transition-all duration-200 active:scale-90 disabled:opacity-50"
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
            <div className="flex items-center gap-2 text-[var(--c-hint)]">
              <div className="w-4 h-4 border-2 border-[var(--c-accent)] border-t-transparent rounded-full animate-spin" />
              <span className="text-[13px]">Проверка...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
