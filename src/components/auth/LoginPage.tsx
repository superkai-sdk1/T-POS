import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/auth';
import { getTelegramWebApp } from '@/lib/telegram';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PinPad } from './PinPad';
import { MessageCircle, LogIn, KeyRound, Crown, User } from 'lucide-react';

export function LoginPage() {
  const {
    login, loginWithTelegram, loginWithPin, loginWithPinForUser, setupPin, skipPinSetup,
    loadStaffUsers, staffUsers,
    rememberedUserId, rememberedNickname, needsPinSetup,
    isLoading, error, forgetUser,
  } = useAuthStore();

  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [showFullLogin, setShowFullLogin] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUserName, setSelectedUserName] = useState('');
  const hasTelegram = !!getTelegramWebApp()?.initDataUnsafe?.user;

  useEffect(() => {
    loadStaffUsers();
  }, [loadStaffUsers]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(nickname, password);
  };

  const handleSwitchUser = () => {
    forgetUser();
    setShowFullLogin(false);
    setSelectedUserId(null);
    setNickname('');
    setPassword('');
  };

  const handleSelectUser = (userId: string, name: string) => {
    setSelectedUserId(userId);
    setSelectedUserName(name);
    useAuthStore.setState({ error: null });
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

  if (selectedUserId) {
    return (
      <PinPad
        title={selectedUserName}
        subtitle="Введите PIN-код"
        onComplete={async (pin) => {
          const ok = await loginWithPinForUser(selectedUserId, pin);
          if (!ok) {
            // keep on pin screen with error
          }
        }}
        onBack={() => { setSelectedUserId(null); useAuthStore.setState({ error: null }); }}
        error={error}
        isLoading={isLoading}
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

  const staffWithPin = staffUsers.filter((s) => s.hasPin);

  if (showFullLogin || staffWithPin.length === 0) {
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

            {staffWithPin.length > 0 && (
              <button
                onClick={() => setShowFullLogin(false)}
                className="w-full text-center text-[12px] text-[var(--c-accent)] hover:underline pt-1"
              >
                <KeyRound className="w-3.5 h-3.5 inline mr-1" />
                Быстрый вход по PIN
              </button>
            )}

            {rememberedUserId && (
              <div className="flex flex-col items-center gap-1.5">
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

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 bg-[var(--c-bg)] relative overflow-hidden"
      style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}
    >
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full opacity-[0.04]"
          style={{ background: 'radial-gradient(circle, #6c5ce7, transparent 70%)' }} />
        <div className="absolute bottom-[-15%] right-[-10%] w-[50%] h-[50%] rounded-full opacity-[0.03]"
          style={{ background: 'radial-gradient(circle, #a29bfe, transparent 70%)' }} />
      </div>

      <div className="w-full max-w-md animate-fade-in-up relative z-10">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-3 shadow-lg"
            style={{ background: 'linear-gradient(135deg, #6c5ce7, #a29bfe)', boxShadow: '0 4px 20px rgba(108,92,231,0.3)' }}>
            <span className="text-xl font-black text-white tracking-tight">T</span>
          </div>
          <h1 className="text-2xl font-bold text-[var(--c-text)]">T-POS</h1>
          <p className="text-[10px] text-[var(--c-hint)] mt-0.5">Выберите профиль для входа</p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {staffWithPin.map((s) => {
            const isOwner = s.role === 'owner';
            return (
              <button
                key={s.id}
                onClick={() => handleSelectUser(s.id, s.nickname)}
                className="flex flex-col items-center gap-2 p-4 rounded-xl card-interactive active:scale-[0.96] transition-transform"
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  isOwner ? 'bg-amber-500/12' : 'bg-[var(--c-accent)]/10'
                }`}>
                  {isOwner ? (
                    <Crown className="w-5 h-5 text-amber-400" />
                  ) : (
                    <User className="w-5 h-5 text-[var(--c-accent)]" />
                  )}
                </div>
                <div className="text-center">
                  <p className="font-semibold text-[13px] text-[var(--c-text)]">{s.nickname}</p>
                  <p className="text-[9px] text-white/20 mt-0.5">
                    {isOwner ? 'Владелец' : 'Сотрудник'}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-4 text-center">
          <button
            onClick={() => setShowFullLogin(true)}
            className="text-[12px] text-white/30 hover:text-white/50 transition-colors"
          >
            <LogIn className="w-3.5 h-3.5 inline mr-1" />
            Войти по логину и паролю
          </button>
        </div>
      </div>
    </div>
  );
}
