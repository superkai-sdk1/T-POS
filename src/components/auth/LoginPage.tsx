import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/store/auth';
import { getTelegramWebApp } from '@/lib/telegram';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PinPad } from './PinPad';
import { Delete, LogIn, Crown, User, ShieldCheck } from 'lucide-react';
import { hapticFeedback, hapticNotification } from '@/lib/telegram';

export function LoginPage() {
  const {
    login,
    loginWithTelegram,
    loginByPinOnly,
    setupPin,
    skipPinSetup,
    loadStaffUsers,
    staffUsers,
    needsPinSetup,
    isLoading,
    error,
    forgetUser,
  } = useAuthStore();

  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [showFullLogin, setShowFullLogin] = useState(false);
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');

  const hasTelegram = !!getTelegramWebApp()?.initDataUnsafe?.user;
  const staffWithPin = staffUsers.filter((s) => s.hasPin);

  useEffect(() => {
    loadStaffUsers();
  }, [loadStaffUsers]);

  useEffect(() => {
    if (pin.length === 4) {
      const attempt = async () => {
        const ok = await loginByPinOnly(pin);
        if (!ok) {
          setPinError(true);
          hapticNotification('error');
          setTimeout(() => {
            setPin('');
            setPinError(false);
          }, 500);
        }
      };
      attempt();
    }
  }, [pin, loginByPinOnly]);

  const handleKeyPress = useCallback((num: string) => {
    if (isLoading || pin.length >= 4) return;
    hapticFeedback('light');
    useAuthStore.setState({ error: null });
    setPin((p) => p + num);
    setPinError(false);
  }, [isLoading, pin.length]);

  const handleDelete = useCallback(() => {
    if (isLoading) return;
    hapticFeedback('light');
    setPin((p) => p.slice(0, -1));
    setPinError(false);
  }, [isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(nickname, password);
  };

  const handleSwitchToFullLogin = () => {
    setShowFullLogin(true);
    setPin('');
    setPinError(false);
    useAuthStore.setState({ error: null });
  };

  // Настройка PIN после первого входа по паролю
  if (needsPinSetup) {
    return (
      <PinPad
        title="Создайте PIN-код"
        subtitle="4 цифры для быстрого входа"
        confirmMode
        onComplete={async (p) => await setupPin(p)}
        onBack={skipPinSetup}
      />
    );
  }

  // Полный вход по логину и паролю (только по явному выбору пользователя)
  if (showFullLogin) {
    return (
      <div
        className="min-h-dvh min-h-[100dvh] flex flex-col items-center justify-center p-3 sm:p-4 lg:p-6 relative overflow-y-auto"
        style={{
          paddingTop: 'calc(var(--safe-top) + 0.5rem)',
          paddingBottom: 'calc(var(--safe-bottom) + 0.5rem)',
          backgroundColor: '#0b0e14',
          background: 'linear-gradient(135deg, #0a0e1a 0%, #0f172a 40%, #1a1040 100%)',
        }}
      >
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/10 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 blur-[120px] rounded-full pointer-events-none" />

        <div className="w-full max-w-sm relative z-10">
          <div className="mb-4 sm:mb-6 lg:mb-8 flex flex-col items-center">
            <div className="w-14 h-14 sm:w-16 sm:h-16 lg:w-20 lg:h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl sm:rounded-2xl lg:rounded-[28px] flex items-center justify-center shadow-xl shadow-indigo-600/30 border border-white/10 mb-2 sm:mb-3">
              <img src="/icons/tpos.svg" alt="T-POS" className="w-8 h-auto sm:w-10 lg:w-12 drop-shadow-lg" />
            </div>
            <h2 className="text-slate-500 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.3em] sm:tracking-[0.4em]">T-POS SYSTEM</h2>
          </div>

          <div
            className="p-4 sm:p-5 lg:p-6 space-y-3 sm:space-y-4 rounded-xl sm:rounded-2xl lg:rounded-3xl"
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              backdropFilter: 'blur(30px)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              boxShadow: '0 8px 40px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
            }}
          >
            <p className="text-[9px] sm:text-[10px] text-slate-500 text-center">Клуб спортивной мафии «Титан»</p>

            {hasTelegram && (
              <>
                <Button variant="primary" fullWidth size="sm" onClick={() => loginWithTelegram()} disabled={isLoading}>
                  Войти через Telegram
                </Button>
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-[9px] sm:text-[10px] text-slate-500">или</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>
              </>
            )}

            <form onSubmit={handleSubmit} className="space-y-2 sm:space-y-3">
              <Input
                label="Никнейм"
                compact
                placeholder="Введите никнейм"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
              />
              <Input
                label="Пароль"
                compact
                type="password"
                placeholder="Введите пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {error && (
                <p className="text-[13px] text-red-400 text-center rounded-xl px-3 py-1.5 bg-red-500/10 border border-red-500/20">
                  {error}
                </p>
              )}
              <Button type="submit" variant="primary" fullWidth size="sm" disabled={isLoading || !nickname || !password}>
                <LogIn className="w-4 h-4 sm:w-5 sm:h-5" />
                {isLoading ? 'Вход...' : 'Войти'}
              </Button>
            </form>

            {staffWithPin.length > 0 && (
              <button
                onClick={() => setShowFullLogin(false)}
                className="w-full text-center text-[11px] sm:text-[12px] text-indigo-400 hover:text-indigo-300 transition-colors py-1"
              >
                Быстрый вход по PIN
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // PIN-first экран входа
  return (
    <div
      className="min-h-dvh min-h-[100dvh] flex flex-col items-center justify-center p-3 sm:p-4 lg:p-6 overflow-y-auto text-slate-200"
      style={{
        paddingTop: 'calc(var(--safe-top) + 0.5rem)',
        paddingBottom: 'calc(var(--safe-bottom) + 0.5rem)',
        backgroundColor: '#0b0e14',
      }}
    >
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="mb-4 sm:mb-6 lg:mb-8 relative z-10 flex flex-col items-center">
        <div className="w-14 h-14 sm:w-16 sm:h-16 lg:w-20 lg:h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl sm:rounded-2xl lg:rounded-[28px] flex items-center justify-center shadow-xl shadow-indigo-600/30 border border-white/10 mb-2 sm:mb-3">
          <img src="/icons/tpos.svg" alt="T-POS" className="w-8 h-auto sm:w-10 lg:w-12 drop-shadow-lg" />
        </div>
        <h2 className="text-slate-500 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.3em] sm:tracking-[0.4em]">T-POS SYSTEM</h2>
      </div>

      <div className="w-full max-w-sm flex flex-col items-center relative z-10">
        <div className="mb-4 sm:mb-6 lg:mb-8 text-center min-h-[4rem] flex flex-col items-center justify-center">
          {isLoading ? (
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-6 h-6 sm:w-8 sm:h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-slate-500 text-xs sm:text-sm font-medium">Вход...</p>
            </div>
          ) : (
            <>
              <h1 className="text-lg sm:text-xl lg:text-2xl font-black text-white mb-1 sm:mb-2">Добро пожаловать</h1>
              <p className="text-slate-500 text-xs sm:text-sm font-medium">Введите ваш PIN-код</p>
            </>
          )}
        </div>

        {/* Индикаторы PIN */}
        <div className="flex gap-2 sm:gap-3 lg:gap-4 mb-4 sm:mb-6 lg:mb-8">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`w-3 h-3 sm:w-4 sm:h-4 rounded-full border-2 transition-all duration-300 ${
                pinError
                  ? 'border-red-500 bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]'
                  : pin.length > i
                    ? 'border-indigo-500 bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.5)] scale-110'
                    : 'border-slate-800 bg-transparent'
              }`}
            />
          ))}
        </div>

        {/* Клавиатура */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 lg:gap-4 w-full max-w-[280px] sm:max-w-[320px] mx-auto px-2 sm:px-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
            <PinKey key={num} value={num} onClick={() => handleKeyPress(String(num))} disabled={isLoading} />
          ))}
          <div className="flex items-center justify-center">
            <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-14 lg:h-14 flex items-center justify-center text-slate-600">
              <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7" />
            </div>
          </div>
          <PinKey value={0} onClick={() => handleKeyPress('0')} disabled={isLoading} />
          <button
            onClick={handleDelete}
            disabled={isLoading}
            className="w-full aspect-square rounded-xl sm:rounded-2xl bg-slate-900/40 border border-slate-800/50 flex items-center justify-center text-slate-400 hover:bg-slate-800 hover:text-white active:scale-90 transition-all shadow-lg disabled:opacity-50"
          >
            <Delete className="w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7" />
          </button>
        </div>

        <div className="mt-6 sm:mt-8 lg:mt-10 flex flex-col items-center gap-3 sm:gap-4">
          <button
            onClick={handleSwitchToFullLogin}
            className="flex items-center gap-1.5 sm:gap-2 text-slate-500 hover:text-indigo-400 transition-colors text-xs sm:text-sm font-bold uppercase tracking-wider"
          >
            <LogIn className="w-4 h-4 sm:w-5 sm:h-5" />
            Вход по логину и паролю
          </button>
          <p className="text-slate-700 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest">Клуб спортивной мафии «Титан»</p>
        </div>
      </div>
    </div>
  );
}

function PinKey({
  value,
  onClick,
  disabled,
}: {
  value: number;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full aspect-square rounded-xl sm:rounded-2xl bg-slate-900/40 border border-slate-800/50 flex items-center justify-center text-xl sm:text-2xl font-black text-white hover:bg-indigo-600/10 hover:border-indigo-500/30 active:scale-90 transition-all shadow-lg hover:shadow-indigo-500/5 disabled:opacity-50"
    >
      {value}
    </button>
  );
}
