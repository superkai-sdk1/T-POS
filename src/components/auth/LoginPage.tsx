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
        className="h-full flex items-center justify-center p-4 relative overflow-hidden"
        style={{
          paddingTop: 'var(--safe-top)',
          paddingBottom: 'var(--safe-bottom)',
          backgroundColor: 'var(--c-bg)',
          background: 'linear-gradient(135deg, #0a0e1a 0%, #0f172a 40%, #1a1040 100%)',
        }}
      >
        {/* ── Animated Gradient Orbs ── */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div
            className="absolute top-[-15%] left-[-10%] w-[50%] h-[50%] rounded-full animate-orb-float"
            style={{ background: 'radial-gradient(circle, rgba(139, 92, 246, 0.12) 0%, transparent 70%)', filter: 'blur(40px)' }}
          />
          <div
            className="absolute bottom-[-10%] right-[-10%] w-[45%] h-[45%] rounded-full animate-orb-float"
            style={{ background: 'radial-gradient(circle, rgba(6, 182, 212, 0.08) 0%, transparent 70%)', filter: 'blur(40px)', animationDelay: '-4s' }}
          />
          <div
            className="absolute top-[30%] right-[10%] w-[25%] h-[25%] rounded-full animate-orb-float"
            style={{ background: 'radial-gradient(circle, rgba(139, 92, 246, 0.06) 0%, transparent 70%)', filter: 'blur(30px)', animationDelay: '-2s' }}
          />
        </div>

        <div className="w-full max-w-sm animate-fade-in-up relative z-10">
          {/* ── Glass Login Card ── */}
          <div
            className="p-6 space-y-5 rounded-3xl"
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              backdropFilter: 'blur(30px) saturate(1.4)',
              WebkitBackdropFilter: 'blur(30px) saturate(1.4)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              boxShadow: '0 8px 40px rgba(0,0,0,0.3), 0 0 60px rgba(139, 92, 246, 0.06), inset 0 1px 0 rgba(255,255,255,0.05)',
            }}
          >
            <div className="text-center">
              <div className="w-20 h-20 rounded-3xl mx-auto mb-4 flex items-center justify-center" style={{
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(6, 182, 212, 0.1))',
                boxShadow: '0 0 30px rgba(139, 92, 246, 0.12)',
                border: '1px solid rgba(139, 92, 246, 0.15)',
              }}>
                <img src="/icons/tpos.svg" alt="T-POS" className="w-12 h-auto drop-shadow-lg" />
              </div>
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
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
                <span className="text-[10px] text-[var(--c-hint)]">или</span>
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
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
                <p
                  className="text-[13px] text-[var(--c-danger)] text-center rounded-xl px-3 py-1.5 animate-fade-in"
                  style={{ background: 'rgba(251,113,133,0.08)', border: '1px solid rgba(251,113,133,0.15)' }}
                >
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
                className="w-full text-center text-[12px] text-[var(--c-accent-light)] hover:underline pt-1"
              >
                <KeyRound className="w-3.5 h-3.5 inline mr-1" />
                Быстрый вход по PIN
              </button>
            )}

            {rememberedUserId && (
              <div className="flex flex-col items-center gap-1.5">
                <button
                  onClick={() => setShowFullLogin(false)}
                  className="text-[13px] text-[var(--c-accent-light)] hover:underline"
                >
                  Войти по PIN-коду
                </button>
                <button
                  onClick={handleSwitchUser}
                  className="text-[10px] text-[var(--c-hint)]"
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
      className="h-full flex flex-col items-center justify-center p-4 relative overflow-hidden"
      style={{
        paddingTop: 'var(--safe-top)',
        paddingBottom: 'var(--safe-bottom)',
        backgroundColor: 'var(--c-bg)',
        background: 'linear-gradient(135deg, #0a0e1a 0%, #0f172a 40%, #1a1040 100%)',
      }}
    >
      {/* ── Animated Gradient Orbs ── */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div
          className="absolute top-[-15%] left-[-10%] w-[50%] h-[50%] rounded-full animate-orb-float"
          style={{ background: 'radial-gradient(circle, rgba(139, 92, 246, 0.12) 0%, transparent 70%)', filter: 'blur(40px)' }}
        />
        <div
          className="absolute bottom-[-10%] right-[-10%] w-[45%] h-[45%] rounded-full animate-orb-float"
          style={{ background: 'radial-gradient(circle, rgba(6, 182, 212, 0.08) 0%, transparent 70%)', filter: 'blur(40px)', animationDelay: '-4s' }}
        />
      </div>

      <div className="w-full max-w-md animate-fade-in-up relative z-10">
        {/* ── Logo ── */}
        <div className="text-center mb-6">
          <div className="w-20 h-20 rounded-3xl mx-auto mb-4 flex items-center justify-center" style={{
            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(6, 182, 212, 0.1))',
            boxShadow: '0 0 30px rgba(139, 92, 246, 0.12)',
            border: '1px solid rgba(139, 92, 246, 0.15)',
          }}>
            <img src="/icons/tpos.svg" alt="T-POS" className="w-12 h-auto drop-shadow-lg" />
          </div>
          <p className="text-[10px] text-[var(--c-hint)] mt-0.5">Выберите профиль для входа</p>
        </div>

        {/* ── Profile Tiles — Glass Grid ── */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {staffWithPin.map((s) => {
            const isOwnerUser = s.role === 'owner';
            return (
              <button
                key={s.id}
                onClick={() => handleSelectUser(s.id, s.nickname)}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl active:scale-[0.96] transition-all duration-200"
                style={{
                  background: 'rgba(255, 255, 255, 0.04)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.04)',
                }}
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{
                    background: isOwnerUser
                      ? 'linear-gradient(135deg, rgba(251, 191, 36, 0.15), rgba(251, 191, 36, 0.05))'
                      : 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(6, 182, 212, 0.08))',
                    boxShadow: isOwnerUser
                      ? '0 0 12px rgba(251, 191, 36, 0.1)'
                      : '0 0 12px rgba(139, 92, 246, 0.1)',
                  }}
                >
                  {isOwnerUser ? (
                    <Crown className="w-5 h-5 text-[var(--c-warning)]" />
                  ) : (
                    <User className="w-5 h-5 text-[var(--c-accent-light)]" />
                  )}
                </div>
                <div className="text-center">
                  <p className="font-semibold text-[13px] text-[var(--c-text)]">{s.nickname}</p>
                  <p className="text-[9px] text-[var(--c-muted)] mt-0.5">
                    {isOwnerUser ? 'Владелец' : 'Сотрудник'}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-5 text-center">
          <button
            onClick={() => setShowFullLogin(true)}
            className="text-[12px] text-[var(--c-hint)] hover:text-[var(--c-accent-light)] transition-colors"
          >
            <LogIn className="w-3.5 h-3.5 inline mr-1" />
            Войти по логину и паролю
          </button>
        </div>
      </div>
    </div>
  );
}
