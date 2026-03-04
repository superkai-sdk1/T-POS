import { useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { getTelegramWebApp } from '@/lib/telegram';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PinPad } from './PinPad';
import { MessageCircle, LogIn } from 'lucide-react';

export function LoginPage() {
  const {
    login, loginWithTelegram, loginWithPin, setupPin, skipPinSetup,
    rememberedUserId, rememberedNickname, needsPinSetup,
    isLoading, error, forgetUser,
  } = useAuthStore();

  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [showFullLogin, setShowFullLogin] = useState(false);
  const hasTelegram = !!getTelegramWebApp()?.initDataUnsafe?.user;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(nickname, password);
  };

  const handleSwitchUser = () => {
    forgetUser();
    setShowFullLogin(false);
    setNickname('');
    setPassword('');
  };

  if (needsPinSetup) {
    return (
      <PinPad
        title="Создайте PIN-код"
        subtitle="4 цифры для быстрого входа"
        confirmMode
        onComplete={async (pin) => {
          await setupPin(pin);
        }}
        onBack={skipPinSetup}
      />
    );
  }

  if (rememberedUserId && !showFullLogin) {
    return (
      <PinPad
        title={rememberedNickname || 'Вход'}
        subtitle="Введите PIN-код"
        onComplete={async (pin) => {
          await loginWithPin(pin);
        }}
        onBack={() => setShowFullLogin(true)}
        error={error}
        isLoading={isLoading}
      />
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 bg-[var(--c-bg)] relative overflow-hidden"
      style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}
    >
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full opacity-[0.04]"
          style={{ background: 'radial-gradient(circle, #6c5ce7, transparent 70%)' }} />
        <div className="absolute bottom-[-15%] right-[-10%] w-[50%] h-[50%] rounded-full opacity-[0.03]"
          style={{ background: 'radial-gradient(circle, #a29bfe, transparent 70%)' }} />
      </div>

      <div className="w-full max-w-sm animate-fade-in-up relative z-10">
        <div className="card p-6 space-y-5" style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.25), 0 0 80px rgba(108,92,231,0.06)' }}>
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-3 shadow-lg"
              style={{ background: 'linear-gradient(135deg, #6c5ce7, #a29bfe)', boxShadow: '0 4px 20px rgba(108,92,231,0.3)' }}>
              <span className="text-xl font-black text-white tracking-tight">T</span>
            </div>
            <h1 className="text-2xl font-bold text-[var(--c-text)]">
              T-POS
            </h1>
            <p className="text-[10px] text-[var(--c-hint)] mt-0.5">
              Клуб спортивной мафии «Титан»
            </p>
          </div>

          {hasTelegram && (
            <Button
              variant="primary"
              fullWidth
              size="lg"
              onClick={() => loginWithTelegram()}
              disabled={isLoading}
            >
              <MessageCircle className="w-5 h-5" />
              Войти через Telegram
            </Button>
          )}

          {hasTelegram && (
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-white/6" />
              <span className="text-[10px] text-white/30">или</span>
              <div className="flex-1 h-px bg-white/6" />
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <Input
              label="Никнейм"
              compact
              placeholder="Введите никнейм"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              autoComplete="username"
            />
            <Input
              label="Пароль"
              compact
              type="password"
              placeholder="Введите пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />

            {error && (
              <p className="text-[13px] text-red-400 text-center bg-red-500/10 rounded-xl px-3 py-1.5 animate-fade-in">
                {error}
              </p>
            )}

            <Button type="submit" variant="primary" fullWidth size="lg" disabled={isLoading || !nickname || !password}>
              <LogIn className="w-5 h-5" />
              {isLoading ? 'Вход...' : 'Войти'}
            </Button>
          </form>

          {rememberedUserId && (
            <div className="flex flex-col items-center gap-1.5 pt-1">
              <button
                onClick={() => setShowFullLogin(false)}
                className="text-[13px] text-[var(--c-accent)] hover:underline"
              >
                Войти по PIN-коду
              </button>
              <button
                onClick={handleSwitchUser}
                className="text-[10px] text-white/30 hover:text-white/50"
              >
                Сменить пользователя
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
