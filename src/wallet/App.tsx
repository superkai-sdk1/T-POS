import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { getTelegramWebApp, initTelegramApp } from '@/lib/telegram';
import { ClientAvatar } from '@/components/ui/ClientAvatar';

const supabaseUrl = import.meta.env.PROD
  ? `${window.location.origin}/sb`
  : (import.meta.env.VITE_SUPABASE_URL as string);

const supabase = createClient(
  supabaseUrl,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string
);

interface Profile {
  id: string;
  nickname: string;
  bonus_points: number;
  balance: number;
  client_tier: string;
  photo_url: string | null;
  created_at: string;
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  description: string | null;
  created_at: string;
}

interface NicknameOption {
  id: string;
  nickname: string;
  client_tier: string;
}

const fmt = (n: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n);

const tierLabel: Record<string, string> = {
  regular: 'Гость',
  resident: 'Резидент',
  student: 'Студент',
};

const tierColor: Record<string, string> = {
  regular: 'text-white/50',
  resident: 'text-emerald-400',
  student: 'text-violet-400',
};

type AppScreen = 'loading' | 'wallet' | 'picker' | 'pending' | 'error';

export function WalletApp() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [screen, setScreen] = useState<AppScreen>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  const [nicknames, setNicknames] = useState<NicknameOption[]>([]);
  const [nicknameSearch, setNicknameSearch] = useState('');
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const [selectedNickname, setSelectedNickname] = useState('');

  const tgIdRef = useRef('');
  const tgUsernameRef = useRef('');
  const tgFirstNameRef = useRef('');

  const WELCOME_BONUS = 1000;

  const grantWelcomeBonus = useCallback(async (p: Profile) => {
    // Only for new clients created less than 24 hours ago
    const hoursSinceCreation = (Date.now() - new Date(p.created_at).getTime()) / 3_600_000;
    if (hoursSinceCreation > 24) return;

    const { data: existing } = await supabase
      .from('bonus_history')
      .select('id')
      .eq('profile_id', p.id)
      .eq('reason', 'Приветственный бонус')
      .limit(1)
      .maybeSingle();
    if (existing) return;

    const newBalance = (p.bonus_points || 0) + WELCOME_BONUS;
    await supabase.from('profiles').update({ bonus_points: newBalance }).eq('id', p.id);
    await supabase.from('bonus_history').insert({
      profile_id: p.id,
      amount: WELCOME_BONUS,
      balance_after: newBalance,
      reason: 'Приветственный бонус',
    });
    await supabase.from('transactions').insert({
      type: 'bonus_accrual',
      amount: WELCOME_BONUS,
      description: 'Приветственный бонус за первый вход',
      player_id: p.id,
    });
    setProfile({ ...p, bonus_points: newBalance });
  }, []);

  const loadTransactions = useCallback(async (profileId: string) => {
    const { data } = await supabase
      .from('transactions')
      .select('id, type, amount, description, created_at')
      .eq('player_id', profileId)
      .in('type', ['bonus_accrual', 'bonus_spend'])
      .order('created_at', { ascending: false })
      .limit(50);
    setTransactions((data || []) as Transaction[]);
  }, []);

  const loadProfile = useCallback(async (tgId: string, tgUsername?: string) => {
    // Check for linkProfile URL parameter (from QR deep link via bot)
    const urlParams = new URLSearchParams(window.location.search);
    const linkProfileId = urlParams.get('linkProfile');

    const { data: byId } = await supabase
      .from('profiles')
      .select('id, nickname, bonus_points, balance, client_tier, photo_url, created_at')
      .eq('tg_id', tgId)
      .single();

    if (byId) {
      setProfile(byId as Profile);
      await grantWelcomeBonus(byId as Profile);
      await loadTransactions(byId.id);
      setScreen('wallet');
      return;
    }

    // Auto-link via QR deep link parameter
    if (linkProfileId) {
      const { data: target } = await supabase
        .from('profiles')
        .select('id, nickname, bonus_points, balance, client_tier, photo_url, created_at')
        .eq('id', linkProfileId)
        .single();

      if (target) {
        await supabase.from('profiles').update({
          tg_id: tgId,
          ...(tgUsername ? { tg_username: tgUsername.replace(/^@/, '').toLowerCase() } : {}),
        }).eq('id', target.id);
        setProfile(target as Profile);
        await grantWelcomeBonus(target as Profile);
        await loadTransactions(target.id);
        setScreen('wallet');
        return;
      }
    }

    if (tgUsername) {
      const clean = tgUsername.replace(/^@/, '').toLowerCase();
      const { data: byUsername } = await supabase
        .from('profiles')
        .select('id, nickname, bonus_points, balance, client_tier, photo_url, created_at')
        .ilike('tg_username', clean)
        .single();
      if (byUsername) {
        await supabase.from('profiles').update({ tg_id: tgId }).eq('id', byUsername.id);
        setProfile(byUsername as Profile);
        await grantWelcomeBonus(byUsername as Profile);
        await loadTransactions(byUsername.id);
        setScreen('wallet');
        return;
      }
    }

    const { data: pending } = await supabase
      .from('tg_link_requests')
      .select('id, profile_id, status')
      .eq('tg_id', tgId)
      .eq('status', 'pending')
      .maybeSingle();

    if (pending) {
      setPendingRequestId(pending.id);
      const { data: p } = await supabase
        .from('profiles')
        .select('nickname')
        .eq('id', pending.profile_id)
        .single();
      setSelectedNickname(p?.nickname || '');
      setScreen('pending');
      return;
    }

    const { data: clients } = await supabase
      .from('profiles')
      .select('id, nickname, client_tier')
      .eq('role', 'client')
      .is('tg_id', null)
      .order('nickname');
    setNicknames((clients || []) as NicknameOption[]);
    setScreen('picker');
  }, [loadTransactions]);

  useEffect(() => {
    initTelegramApp();
    const tg = getTelegramWebApp();
    const tgUser = tg?.initDataUnsafe?.user;

    if (tgUser) {
      tgIdRef.current = String(tgUser.id);
      tgUsernameRef.current = tgUser.username || '';
      tgFirstNameRef.current = tgUser.first_name || '';
      loadProfile(tgIdRef.current, tgUser.username);
    } else {
      setErrorMsg('Откройте через Telegram');
      setScreen('error');
    }
  }, [loadProfile]);

  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel('wallet-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${profile.id}` },
        (payload) => {
          if (payload.new && typeof payload.new === 'object' && 'id' in payload.new) {
            setProfile(payload.new as Profile);
          }
        })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions', filter: `player_id=eq.${profile.id}` },
        (payload) => {
          const tx = payload.new as Transaction;
          if (tx.type === 'bonus_accrual' || tx.type === 'bonus_spend') {
            setTransactions((prev) => [tx, ...prev]);
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.id]);

  useEffect(() => {
    if (screen !== 'pending' || !pendingRequestId) return;
    const channel = supabase
      .channel('link-request-watch')
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'tg_link_requests',
        filter: `id=eq.${pendingRequestId}`,
      }, (payload) => {
        const updated = payload.new as { status: string };
        if (updated.status === 'approved') {
          loadProfile(tgIdRef.current, tgUsernameRef.current);
        } else if (updated.status === 'rejected') {
          setPendingRequestId(null);
          setScreen('picker');
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [screen, pendingRequestId, loadProfile]);

  const handleSelectNickname = async (option: NicknameOption) => {
    const { data, error } = await supabase
      .from('tg_link_requests')
      .insert({
        tg_id: tgIdRef.current,
        tg_username: tgUsernameRef.current || null,
        tg_first_name: tgFirstNameRef.current || null,
        profile_id: option.id,
      })
      .select('id')
      .single();

    if (error) {
      setErrorMsg('Ошибка отправки заявки');
      setScreen('error');
      return;
    }
    setPendingRequestId(data.id);
    setSelectedNickname(option.nickname);
    setScreen('pending');
  };

  if (screen === 'loading') return <LoadingSkeleton />;

  if (screen === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <p className="text-white/40 text-sm">{errorMsg}</p>
        </div>
      </div>
    );
  }

  if (screen === 'pending') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6"
        style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}>
        <div className="text-center space-y-4 max-w-sm animate-fade-in-up">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
            style={{ background: 'linear-gradient(135deg, rgba(108,92,231,0.15), rgba(162,155,254,0.08))', border: '1px solid rgba(108,92,231,0.2)' }}>
            <svg className="w-8 h-8 text-[#6c5ce7] animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-lg font-bold text-white/90">Ожидание подтверждения</p>
            <p className="text-sm text-white/40 mt-1">
              Вы выбрали профиль <span className="text-[#a29bfe] font-semibold">{selectedNickname}</span>
            </p>
          </div>
          <div className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-[13px] text-white/50 leading-relaxed">
              Заявка отправлена администратору клуба. Как только он подтвердит — карта откроется автоматически.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 pt-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#6c5ce7] animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-1.5 h-1.5 rounded-full bg-[#6c5ce7] animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-1.5 h-1.5 rounded-full bg-[#6c5ce7] animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'picker') {
    const filtered = nicknameSearch
      ? nicknames.filter((n) => n.nickname.toLowerCase().includes(nicknameSearch.toLowerCase()))
      : nicknames;

    return (
      <div className="min-h-screen" style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}>
        <div className="px-4 pt-4 pb-8 space-y-4 max-w-md mx-auto">
          <div className="text-center animate-fade-in-up">
            <img src="/icons/wallet.svg" alt="TITAN Wallet" className="w-24 h-auto mx-auto mb-3 drop-shadow-lg" />
            <p className="text-lg font-bold text-white/90">Привязка профиля</p>
            <p className="text-[13px] text-white/40 mt-1">Выберите свой никнейм в клубе «Титан»</p>
          </div>

          <div className="relative animate-fade-in-up" style={{ animationDelay: '50ms' }}>
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              placeholder="Поиск по никнейму..."
              className="w-full pl-10 pr-4 py-3 rounded-xl text-[14px] text-white/90 placeholder:text-white/25"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
              value={nicknameSearch}
              onChange={(e) => setNicknameSearch(e.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-1.5 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
            {filtered.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-white/30">
                  {nicknames.length === 0 ? 'Нет доступных профилей' : 'Ничего не найдено'}
                </p>
              </div>
            ) : (
              filtered.map((option) => (
                <button
                  key={option.id}
                  onClick={() => handleSelectNickname(option)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-all active:scale-[0.98]"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(108,92,231,0.12)' }}>
                    <span className="text-sm font-bold text-[#a29bfe]">
                      {option.nickname.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-white/85 truncate">{option.nickname}</p>
                    <p className={`text-[11px] font-medium ${tierColor[option.client_tier] || 'text-white/40'}`}>
                      {tierLabel[option.client_tier] || 'Гость'}
                    </p>
                  </div>
                  <svg className="w-4 h-4 text-white/15 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
              ))
            )}
          </div>

          <p className="text-[11px] text-white/20 text-center pt-2">
            Нет вашего никнейма? Попросите администратора добавить вас.
          </p>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div
      className="min-h-screen flex flex-col items-center"
      style={{
        paddingTop: 'var(--safe-top)',
        paddingBottom: 'var(--safe-bottom)',
        background: '#0A051E',
      }}
    >
      <div
        className="fixed inset-0 pointer-events-none -z-10"
        style={{
          background: 'radial-gradient(circle at 50% 30%, #7D54ED 0%, transparent 60%)',
          opacity: 0.15,
          filter: 'blur(120px)',
        }}
      />
      <div className="w-full max-w-[380px] px-6 pt-8 pb-8 flex flex-col gap-8">
        <WalletCard profile={profile} />
        <TransactionList transactions={transactions} />
      </div>
    </div>
  );
}

function WalletCard({ profile }: { profile: Profile }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const shimmerRef = useRef<HTMLDivElement>(null);
  const rotRef = useRef({ rotX: 0, rotY: 0, targetX: 0, targetY: 0 });
  const dragRef = useRef({ isDragging: false, startX: 0, startY: 0 });
  const idleRef = useRef(0);
  const lastInteractionRef = useRef(Date.now());
  const sensorRef = useRef(false);
  const RESET_DELAY = 5000;

  useEffect(() => {
    const container = containerRef.current;
    const card = cardRef.current;
    const shimmer = shimmerRef.current;
    if (!container || !card || !shimmer) return;

    const onPointerDown = (e: PointerEvent) => {
      dragRef.current = { isDragging: true, startX: e.clientX, startY: e.clientY };
      lastInteractionRef.current = Date.now();
      sensorRef.current = false;
      container.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragRef.current.isDragging) return;
      lastInteractionRef.current = Date.now();
      const { startX, startY } = dragRef.current;
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      rotRef.current.targetY += deltaX * 0.2;
      rotRef.current.targetX -= deltaY * 0.2;
      rotRef.current.targetX = Math.max(-40, Math.min(40, rotRef.current.targetX));
      rotRef.current.targetY = Math.max(-45, Math.min(45, rotRef.current.targetY));
      dragRef.current.startX = e.clientX;
      dragRef.current.startY = e.clientY;
    };

    const onPointerUp = () => {
      dragRef.current.isDragging = false;
      lastInteractionRef.current = Date.now();
    };

    const onDeviceOrientation = (e: DeviceOrientationEvent) => {
      if (dragRef.current.isDragging) return;
      if (e.beta != null && e.gamma != null) {
        sensorRef.current = true;
        lastInteractionRef.current = Date.now();
        rotRef.current.targetX = Math.max(-35, Math.min(35, (e.beta - 45) * 0.4));
        rotRef.current.targetY = Math.max(-45, Math.min(45, e.gamma * 0.4));
      }
    };

    let rafId: number;
    const animate = () => {
      const r = rotRef.current;
      idleRef.current += 0.02;
      const now = Date.now();
      const idle = !dragRef.current.isDragging && !sensorRef.current;

      if (idle) {
        if (now - lastInteractionRef.current > RESET_DELAY) {
          r.targetX *= 0.95;
          r.targetY *= 0.95;
        }
        const idleX = Math.sin(idleRef.current) * 2.5;
        const idleY = Math.cos(idleRef.current * 0.8) * 3.5;
        r.rotX += (r.targetX + idleX - r.rotX) * 0.1;
        r.rotY += (r.targetY + idleY - r.rotY) * 0.1;
      } else {
        r.rotX += (r.targetX - r.rotX) * 0.15;
        r.rotY += (r.targetY - r.rotY) * 0.15;
      }

      card.style.transform = `rotateX(${r.rotX}deg) rotateY(${r.rotY}deg)`;
      const shimX = 50 + r.rotY * 1.5;
      const shimY = 50 - r.rotX * 1.5;
      shimmer.style.setProperty('--shimmer-x', `${shimX}%`);
      shimmer.style.setProperty('--shimmer-y', `${shimY}%`);
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);

    container.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('deviceorientation', onDeviceOrientation);

    return () => {
      cancelAnimationFrame(rafId);
      container.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('deviceorientation', onDeviceOrientation);
    };
  }, []);

  return (
    <>
      <div className="animate-fade-in-up" style={{ animationDelay: '0ms' }}>
        <div
          ref={containerRef}
          className="w-full touch-none select-none"
          style={{ perspective: '2000px' }}
        >
          <div
            ref={cardRef}
            className="relative overflow-hidden rounded-[42px] p-8 flex flex-col"
            style={{
              aspectRatio: '1.586 / 1',
              background: 'linear-gradient(-45deg, #221562, #7D54ED, #4F359B, #0A051E, #221562)',
              backgroundSize: '400% 400%',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              backdropFilter: 'blur(30px)',
              boxShadow: '0 0 50px rgba(125, 84, 237, 0.25), inset 0 0 30px rgba(125, 84, 237, 0.1)',
              animation: 'gradientFlow 15s ease-in-out infinite, neonPulse 3s infinite alternate ease-in-out',
              transformStyle: 'preserve-3d',
            }}
          >
            {/* Noise overlay */}
            <div
              className="absolute inset-0 pointer-events-none z-[2] rounded-[42px] opacity-[0.05] mix-blend-overlay"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
              }}
            />
            {/* Light lenses */}
            <div
              className="absolute w-[180px] h-[180px] rounded-full opacity-40 blur-[50px] pointer-events-none z-[1]"
              style={{
                background: 'radial-gradient(circle, #7D54ED 0%, transparent 70%)',
                top: -60,
                left: -60,
                animation: 'floatLens 10s infinite alternate ease-in-out',
              }}
            />
            <div
              className="absolute w-[180px] h-[180px] rounded-full opacity-40 blur-[50px] pointer-events-none z-[1]"
              style={{
                background: 'radial-gradient(circle, #38bdf8 0%, transparent 70%)',
                bottom: -60,
                right: -60,
                animation: 'floatLens 14s infinite alternate ease-in-out',
                animationDelay: '-3s',
              }}
            />
            {/* Dynamic shimmer */}
            <div
              ref={shimmerRef}
              className="absolute inset-0 pointer-events-none z-[5] rounded-[42px]"
              style={{
                background: 'radial-gradient(circle at var(--shimmer-x, 50%) var(--shimmer-y, 50%), rgba(255,255,255,0.15) 0%, transparent 45%)',
              }}
            />

            <div className="flex justify-between items-center mb-8 relative z-10">
              <span className="font-black text-xl tracking-[6px] text-white">TITAN</span>
              <div
                className="px-4 py-1.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider text-white"
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                }}
              >
                {tierLabel[profile.client_tier] || 'Гость'}
              </div>
            </div>

            <div className="flex flex-col mb-auto relative z-10">
              <div
                className="text-[3.2rem] font-extrabold leading-none tracking-[0.02em] text-white"
                style={{ fontFeatureSettings: "'tnum'", textShadow: '0 10px 20px rgba(0,0,0,0.4)' }}
              >
                {fmt(profile.bonus_points)}
              </div>
              <span className="text-[10px] uppercase tracking-[4px] opacity-40 mt-1 font-bold">Resident Points</span>
            </div>

            <div className="flex justify-between items-end relative z-10">
              <div>
                <div className="text-[9px] uppercase tracking-widest opacity-30 mb-1">Holder</div>
                <div className="text-sm font-bold uppercase tracking-widest text-white/90">{profile.nickname}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function TransactionList({ transactions }: { transactions: Transaction[] }) {
  const [expanded, setExpanded] = useState(false);
  const displayLimit = 5;
  const displayTx = expanded ? transactions : transactions.slice(0, displayLimit);
  const hasMore = transactions.length > displayLimit;

  if (transactions.length === 0) {
    return (
      <div className="animate-fade-in-up text-center py-8" style={{ animationDelay: '100ms' }}>
        <div className="w-14 h-14 rounded-2xl bg-white/[0.03] flex items-center justify-center mx-auto mb-3">
          <svg className="w-7 h-7 text-white/10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-xs text-white/20">Пока нет операций с бонусами</p>
      </div>
    );
  }

  const formatDate = (createdAt: string) => {
    const d = new Date(createdAt);
    const now = new Date();
    const today = now.toDateString();
    const yesterday = new Date(now.getTime() - 86400000).toDateString();
    const ds = d.toDateString();
    const day = ds === today ? 'Сегодня' : ds === yesterday ? 'Вчера' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    return `${day}, ${time}`;
  };

  return (
    <div className="flex flex-col gap-4 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
      <h3 className="text-[10px] font-extrabold uppercase tracking-[3px] text-white/40 pl-3">
        Последние действия
      </h3>
      <div className="flex flex-col gap-4">
        {displayTx.map((tx, i) => (
          <div
            key={tx.id}
            className="flex justify-between items-center py-5 px-5 rounded-[28px] backdrop-blur-[15px]"
            style={{
              background: 'rgba(34, 21, 98, 0.4)',
              border: '1px solid rgba(125, 84, 237, 0.1)',
              animationDelay: `${150 + i * 50}ms`,
            }}
          >
            <div className="flex items-center gap-4">
              <div
                className="w-11 h-11 rounded-[18px] flex items-center justify-center shrink-0"
                style={{ background: 'rgba(255, 255, 255, 0.03)' }}
              >
                {tx.type === 'bonus_accrual' ? (
                  <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path d="M12 5v14M5 12l7 7 7-7" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-[#7D54ED]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                )}
              </div>
              <div>
                <div className="text-sm font-semibold text-white">
                  {tx.type === 'bonus_accrual' ? 'Пополнение' : tx.description || 'Оплата услуг'}
                </div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">{formatDate(tx.created_at)}</div>
              </div>
            </div>
            <div className={`font-bold ${tx.type === 'bonus_accrual' ? 'text-emerald-400' : 'text-white'}`}>
              {tx.type === 'bonus_accrual' ? '+' : '-'}{fmt(tx.amount)}
            </div>
          </div>
        ))}
      </div>
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="w-full py-5 text-[10px] font-bold uppercase tracking-[4px] text-slate-500 hover:text-white transition-all border border-white/10 rounded-[28px] hover:bg-white/5"
        >
          {expanded ? 'Свернуть' : 'Весь список'}
        </button>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="px-4 pt-6 space-y-5 max-w-md mx-auto">
      <div className="rounded-2xl h-52 skeleton-pulse" />
      <div className="space-y-3">
        <div className="h-4 w-20 rounded skeleton-pulse" />
        <div className="rounded-xl h-16 skeleton-pulse" />
        <div className="rounded-xl h-16 skeleton-pulse" />
        <div className="rounded-xl h-16 skeleton-pulse" />
      </div>
    </div>
  );
}
