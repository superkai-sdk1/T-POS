import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { getTelegramWebApp, initTelegramApp } from '@/lib/telegram';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
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

export function WalletApp() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async (tgId: string) => {
    const { data, error: err } = await supabase
      .from('profiles')
      .select('id, nickname, bonus_points, balance, client_tier, photo_url, created_at')
      .eq('tg_id', tgId)
      .single();

    if (err || !data) {
      setError('Профиль не найден. Используй /start в боте для привязки.');
      setLoading(false);
      return;
    }

    setProfile(data as Profile);

    const { data: txData } = await supabase
      .from('transactions')
      .select('id, type, amount, description, created_at')
      .eq('player_id', data.id)
      .in('type', ['bonus_accrual', 'bonus_spend'])
      .order('created_at', { ascending: false })
      .limit(50);

    setTransactions((txData || []) as Transaction[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    initTelegramApp();

    const tg = getTelegramWebApp();
    const tgUser = tg?.initDataUnsafe?.user;

    if (tgUser) {
      loadProfile(String(tgUser.id));
    } else {
      setError('Откройте через Telegram');
      setLoading(false);
    }
  }, [loadProfile]);

  useEffect(() => {
    if (!profile) return;

    const channel = supabase
      .channel('wallet-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${profile.id}` },
        (payload) => {
          if (payload.new && typeof payload.new === 'object' && 'id' in payload.new) {
            setProfile(payload.new as Profile);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'transactions', filter: `player_id=eq.${profile.id}` },
        (payload) => {
          const tx = payload.new as Transaction;
          if (tx.type === 'bonus_accrual' || tx.type === 'bonus_spend') {
            setTransactions((prev) => [tx, ...prev]);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile?.id]);

  if (loading) return <LoadingSkeleton />;

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <p className="text-[var(--tg-theme-hint-color,#888)] text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="min-h-screen" style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}>
      <div className="px-4 pt-4 pb-8 space-y-5 max-w-md mx-auto">
        <WalletCard profile={profile} />
        <TransactionList transactions={transactions} />
      </div>
    </div>
  );
}

function WalletCard({ profile }: { profile: Profile }) {
  return (
    <div className="animate-fade-in-up" style={{ animationDelay: '0ms' }}>
      <div
        className="relative overflow-hidden rounded-2xl p-5 pb-6"
        style={{
          background: 'linear-gradient(135deg, #1a1a3e 0%, #0d0d2b 40%, #151538 100%)',
          boxShadow: '0 0 30px rgba(108, 92, 231, 0.15), 0 8px 32px rgba(0, 0, 0, 0.4)',
          animation: 'card-glow 4s ease-in-out infinite',
        }}
      >
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 w-40 h-40 rounded-full opacity-[0.07]"
          style={{ background: 'radial-gradient(circle, #6c5ce7, transparent 70%)', transform: 'translate(20%, -30%)' }}
        />
        <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full opacity-[0.05]"
          style={{ background: 'radial-gradient(circle, #a29bfe, transparent 70%)', transform: 'translate(-20%, 30%)' }}
        />
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 20px, rgba(255,255,255,0.05) 20px, rgba(255,255,255,0.05) 21px)' }}
        />

        {/* Header */}
        <div className="relative flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #6c5ce7, #a29bfe)' }}>
              <svg className="w-4.5 h-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.893 13.393l-1.135-1.135a2.252 2.252 0 01-.421-.585l-1.08-2.16a.414.414 0 00-.663-.107.827.827 0 01-.812.21l-1.273-.363a.89.89 0 00-.738 1.595l.587.39c.59.395.674 1.23.172 1.732l-.2.2c-.212.212-.33.498-.33.796v.41c0 .409-.11.809-.32 1.158l-1.315 2.191a2.11 2.11 0 01-1.81 1.025 1.055 1.055 0 01-1.055-1.055v-1.172c0-.92-.56-1.747-1.414-2.089l-.655-.261a2.25 2.25 0 01-1.383-2.46l.007-.042a2.25 2.25 0 01.29-.787l.09-.15a2.25 2.25 0 012.37-1.048l1.178.236a1.125 1.125 0 001.302-.795l.208-.73a1.125 1.125 0 00-.578-1.315l-.665-.332-.091.091a2.25 2.25 0 01-1.591.659h-.18a.94.94 0 00-.662.274" />
              </svg>
            </div>
            <div>
              <p className="text-[11px] font-semibold tracking-[0.15em] text-white/40 uppercase">TITAN</p>
              <p className="text-[13px] font-bold text-white/90 -mt-0.5">Wallet</p>
            </div>
          </div>
          <div className={`text-[10px] font-semibold uppercase tracking-wider ${tierColor[profile.client_tier] || 'text-white/50'}`}>
            {tierLabel[profile.client_tier] || profile.client_tier}
          </div>
        </div>

        {/* Balance */}
        <div className="relative mb-5">
          <p className="text-[10px] font-medium text-white/30 uppercase tracking-wider mb-1">Бонусный баланс</p>
          <div className="flex items-baseline gap-2">
            <p className="text-4xl font-bold text-white" style={{ fontFeatureSettings: "'tnum'" }}>
              {fmt(profile.bonus_points)}
            </p>
            <p className="text-lg font-medium text-white/30">баллов</p>
          </div>
        </div>

        {/* Footer info */}
        <div className="relative flex items-end justify-between">
          <div>
            <p className="text-[10px] text-white/25 uppercase tracking-wider mb-0.5">Владелец</p>
            <p className="text-sm font-semibold text-white/80">{profile.nickname}</p>
          </div>
          {profile.balance < 0 && (
            <div className="text-right">
              <p className="text-[10px] text-red-400/60 uppercase tracking-wider mb-0.5">Долг</p>
              <p className="text-sm font-bold text-red-400">{fmt(Math.abs(profile.balance))}₽</p>
            </div>
          )}
          {profile.balance >= 0 && (
            <div className="text-right">
              <p className="text-[10px] text-white/25 uppercase tracking-wider mb-0.5">Баланс</p>
              <p className="text-sm font-semibold text-white/60">{fmt(profile.balance)}₽</p>
            </div>
          )}
        </div>

        {/* Card chip */}
        <div className="absolute right-5 top-[52%] -translate-y-1/2 opacity-[0.06]">
          <svg width="60" height="60" viewBox="0 0 24 24" fill="currentColor" className="text-white">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1" fill="none"/>
          </svg>
        </div>
      </div>
    </div>
  );
}

function TransactionList({ transactions }: { transactions: Transaction[] }) {
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

  const grouped = groupByDate(transactions);

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-white/40 uppercase tracking-wider animate-fade-in-up" style={{ animationDelay: '100ms' }}>
        История
      </h2>
      {grouped.map(([date, txs], gi) => (
        <div key={date} className="animate-fade-in-up" style={{ animationDelay: `${150 + gi * 50}ms` }}>
          <p className="text-[10px] font-medium text-white/20 uppercase tracking-wider mb-2 px-1">{date}</p>
          <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
            {txs.map((tx, i) => (
              <div key={tx.id} className={`flex items-center gap-3 px-3.5 py-3 ${i > 0 ? 'border-t border-white/[0.04]' : ''}`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  tx.type === 'bonus_accrual' ? 'bg-emerald-500/10' : 'bg-amber-500/10'
                }`}>
                  {tx.type === 'bonus_accrual' ? (
                    <svg className="w-4.5 h-4.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  ) : (
                    <svg className="w-4.5 h-4.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-white/80 truncate">
                    {tx.type === 'bonus_accrual' ? 'Начисление' : 'Списание'}
                  </p>
                  {tx.description && (
                    <p className="text-[11px] text-white/25 truncate mt-0.5">{tx.description}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-bold ${tx.type === 'bonus_accrual' ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {tx.type === 'bonus_accrual' ? '+' : '-'}{fmt(tx.amount)}
                  </p>
                  <p className="text-[10px] text-white/15 mt-0.5">
                    {new Date(tx.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function groupByDate(transactions: Transaction[]): [string, Transaction[]][] {
  const map = new Map<string, Transaction[]>();
  const now = new Date();
  const today = now.toDateString();
  const yesterday = new Date(now.getTime() - 86400000).toDateString();

  for (const tx of transactions) {
    const d = new Date(tx.created_at);
    const ds = d.toDateString();
    let label: string;

    if (ds === today) label = 'Сегодня';
    else if (ds === yesterday) label = 'Вчера';
    else label = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(tx);
  }

  return Array.from(map.entries());
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
