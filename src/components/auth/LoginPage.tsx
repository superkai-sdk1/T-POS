import { useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { getTelegramWebApp } from '@/lib/telegram';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PinPad } from './PinPad';
import { Shield, MessageCircle, LogIn } from 'lucide-react';

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
      className="min-h-screen flex items-center justify-center p-4 bg-[var(--tg-theme-bg-color,#0f0f23)]"
      style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}
    >
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-[var(--tg-theme-button-color,#6c5ce7)]/20 mb-4">
            <Shield className="w-10 h-10 text-[var(--tg-theme-button-color,#6c5ce7)]" />
          </div>
          <h1 className="text-3xl font-bold text-[var(--tg-theme-text-color,#e0e0e0)]">
            T-POS
          </h1>
          <p className="text-[var(--tg-theme-hint-color,#888)] mt-1">
            Клуб спортивной мафии «Титан»
          </p>
        </div>

        {hasTelegram && (
          <Button
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
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-white/30">или</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Никнейм"
            placeholder="Введите никнейм"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            autoComplete="username"
          />
          <Input
            label="Пароль"
            type="password"
            placeholder="Введите пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />

          {error && (
            <p className="text-sm text-red-400 text-center bg-red-500/10 rounded-xl px-4 py-2">
              {error}
            </p>
          )}

          <Button type="submit" fullWidth size="lg" disabled={isLoading || !nickname || !password}>
            <LogIn className="w-5 h-5" />
            {isLoading ? 'Вход...' : 'Войти'}
          </Button>
        </form>

        {rememberedUserId && (
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => setShowFullLogin(false)}
              className="text-sm text-[var(--tg-theme-button-color,#6c5ce7)] hover:underline"
            >
              Войти по PIN-коду
            </button>
            <button
              onClick={handleSwitchUser}
              className="text-xs text-white/30 hover:text-white/50"
            >
              Сменить пользователя
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
