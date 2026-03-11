import { memo, useMemo, useState, useEffect } from 'react';
import { useLayoutStore } from '@/store/layout';
import { ArrowLeft, Users, Crown, Search, Activity, UserPlus, Moon, ChevronRight, Star } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import type { PlayerStat } from '@/hooks/useAnalyticsData';
import { useAnalyticsStore } from '@/store/analytics';

interface Props {
  players: PlayerStat[];
  retentionRate: number;
  checks: { id: string; player_id: string; total_amount: number; closed_at: string; player: { nickname: string } | null }[];
}

const fmt = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n);
const fmtCur = (n: number) => fmt(n) + '₽';

const segmentConfig: Record<string, { label: string; icon: typeof Activity; variant: 'success' | 'warning' | 'danger' | 'default'; desc: string }> = {
  active: { label: 'Активные', icon: Activity, variant: 'success', desc: '3+ визитов' },
  new: { label: 'Новые', icon: UserPlus, variant: 'default', desc: 'Первые визиты' },
  sleeping: { label: 'Спящие', icon: Moon, variant: 'danger', desc: '>14 дней без визита' },
};

const tierLabels: Record<string, string> = {
  regular: 'Гость', resident: 'Резидент', student: 'Студент',
};

export const PlayersModule = memo(function PlayersModule({ players, retentionRate, checks }: Props) {
  const [segFilter, setSegFilter] = useState<'all' | 'active' | 'new' | 'sleeping'>('all');
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const addHideReason = useLayoutStore((s) => s.addHideReason);
  const removeHideReason = useLayoutStore((s) => s.removeHideReason);
  useEffect(() => {
    if (selectedPlayer) {
      addHideReason('dashboard-player-drilldown');
      return () => removeHideReason('dashboard-player-drilldown');
    }
  }, [selectedPlayer, addHideReason, removeHideReason]);
  const search = useAnalyticsStore((s) => s.search);
  const setSearch = useAnalyticsStore((s) => s.setSearch);

  const segments = useMemo(() => ({
    active: players.filter((p) => p.segment === 'active'),
    new: players.filter((p) => p.segment === 'new'),
    sleeping: players.filter((p) => p.segment === 'sleeping'),
  }), [players]);

  const filtered = useMemo(() => {
    let list = players;
    if (segFilter !== 'all') list = list.filter((p) => p.segment === segFilter);
    if (search) list = list.filter((p) => p.nickname.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [players, segFilter, search]);

  const totalLTV = players.reduce((s, p) => s + p.total, 0);

  const player = selectedPlayer ? players.find((p) => p.id === selectedPlayer) : null;

  if (player) {
    return <PlayerDrilldown player={player} checks={checks} onBack={() => setSelectedPlayer(null)} />;
  }

  return (
    <div className="space-y-4">
      {/* Retention & overview */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2.5 rounded-xl card text-center">
          <p className="text-lg font-black text-[var(--c-accent)] tabular-nums">{retentionRate}%</p>
          <p className="text-[9px] text-[var(--c-muted)]">Retention</p>
        </div>
        <div className="p-2.5 rounded-xl card text-center">
          <p className="text-lg font-black text-[var(--c-text)] tabular-nums">{players.length}</p>
          <p className="text-[9px] text-[var(--c-muted)]">Игроков</p>
        </div>
        <div className="p-2.5 rounded-xl card text-center">
          <p className="text-lg font-black text-[var(--c-success)] tabular-nums">{fmtCur(totalLTV)}</p>
          <p className="text-[9px] text-[var(--c-muted)]">Общий LTV</p>
        </div>
      </div>

      {/* Segment filters */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setSegFilter('all')}
          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all active:scale-95 ${
            segFilter === 'all' ? 'bg-[var(--c-accent)] text-[var(--c-accent-text)]' : 'bg-[var(--c-surface)] text-[var(--c-hint)]'
          }`}
        >
          Все ({players.length})
        </button>
        {(['active', 'new', 'sleeping'] as const).map((seg) => {
          const cfg = segmentConfig[seg];
          return (
            <button
              key={seg}
              onClick={() => setSegFilter(segFilter === seg ? 'all' : seg)}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all active:scale-95 flex items-center gap-1 ${
                segFilter === seg ? 'bg-[var(--c-accent)] text-[var(--c-accent-text)]' : 'bg-[var(--c-surface)] text-[var(--c-hint)]'
              }`}
            >
              <cfg.icon className="w-3 h-3" />
              {cfg.label} ({segments[seg].length})
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--c-hint)]" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск игрока..."
          className="w-full pl-8 pr-3 py-2 text-xs rounded-xl bg-[var(--c-surface)] border border-[var(--c-border)] text-[var(--c-text)] placeholder:text-[var(--c-muted)] focus:outline-none focus:ring-1 focus:ring-[rgba(var(--c-accent-rgb),0.3)]"
        />
      </div>

      {/* Player list */}
      {filtered.length === 0 ? (
        <div className="text-center py-10">
          <Users className="w-12 h-12 text-[var(--c-muted)] mx-auto mb-2" />
          <p className="text-sm text-[var(--c-hint)]">Нет данных</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((p, i) => {
            const seg = segmentConfig[p.segment];
            const maxTotal = filtered[0]?.total || 1;
            return (
              <button
                key={p.id}
                onClick={() => setSelectedPlayer(p.id)}
                className="w-full flex items-center gap-2.5 p-2.5 rounded-xl card-interactive text-left"
              >
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  i === 0 ? 'bg-[var(--c-warning-bg)] text-[var(--c-warning)]' : 'bg-[var(--c-surface)] text-[var(--c-hint)]'
                }`}>
                  {i === 0 ? <Crown className="w-3 h-3" /> : i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-[var(--c-text)] truncate">{p.nickname}</p>
                    <Badge variant={seg.variant} size="sm">{seg.label}</Badge>
                    {p.tier !== 'regular' && (
                      <span className="text-[9px] text-[var(--c-accent)] font-medium">{tierLabels[p.tier]}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-[var(--c-muted)]">{p.count} чек. · ср. {fmtCur(p.avgCheck)}</span>
                    <div className="flex-1 h-1 rounded-full bg-[var(--c-surface)] overflow-hidden">
                      <div className="h-full rounded-full bg-amber-500 transition-all duration-500" style={{ width: `${(p.total / maxTotal) * 100}%` }} />
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-[var(--c-text)] tabular-nums">{fmtCur(p.total)}</p>
                  {p.bonusBalance > 0 && (
                    <div className="flex items-center gap-0.5 justify-end">
                      <Star className="w-2.5 h-2.5 text-[var(--c-warning)]" />
                      <span className="text-[10px] text-[var(--c-warning)]">{fmt(p.bonusBalance)}</span>
                    </div>
                  )}
                </div>
                <ChevronRight className="w-3 h-3 text-[var(--c-muted)] shrink-0" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

function PlayerDrilldown({ player, checks, onBack }: {
  player: PlayerStat;
  checks: Props['checks'];
  onBack: () => void;
}) {
  const playerChecks = useMemo(() =>
    checks.filter((c) => c.player_id === player.id).sort((a, b) =>
      new Date(b.closed_at).getTime() - new Date(a.closed_at).getTime()),
  [checks, player.id]);

  const seg = segmentConfig[player.segment];

  return (
    <div className="space-y-4 animate-fade-in-up">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={onBack} className="w-9 h-9 rounded-xl bg-[var(--c-surface)] flex items-center justify-center active:scale-90 transition-transform shrink-0">
          <ArrowLeft className="w-4 h-4 text-[var(--c-text)]" />
        </button>
        <div>
          <h2 className="text-lg font-bold text-[var(--c-text)]">{player.nickname}</h2>
          <div className="flex items-center gap-2">
            <Badge variant={seg.variant} size="sm">{seg.label}</Badge>
            {player.tier !== 'regular' && <span className="text-[10px] text-[var(--c-accent)]">{tierLabels[player.tier]}</span>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'LTV', value: fmtCur(player.total), color: 'text-[var(--c-success)]' },
          { label: 'Ср. чек', value: fmtCur(player.avgCheck), color: 'text-[var(--c-warning)]' },
          { label: 'Визитов', value: `${player.count}`, color: 'text-[var(--c-info)]' },
          { label: 'Бонусы', value: fmt(player.bonusBalance), color: 'text-[var(--c-accent)]' },
        ].map((s) => (
          <div key={s.label} className="p-2.5 rounded-xl card text-center">
            <p className={`text-sm font-black tabular-nums ${s.color}`}>{s.value}</p>
            <p className="text-[9px] text-[var(--c-muted)]">{s.label}</p>
          </div>
        ))}
      </div>

      <div>
        <h3 className="text-[11px] font-semibold text-[var(--c-hint)] uppercase tracking-wider mb-2">История визитов</h3>
        <div className="space-y-1.5">
          {playerChecks.slice(0, 20).map((c) => (
            <div key={c.id} className="flex items-center justify-between p-2.5 rounded-xl card">
              <span className="text-xs text-[var(--c-hint)]">
                {new Date(c.closed_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="text-sm font-bold text-[var(--c-text)] tabular-nums">{fmtCur(c.total_amount)}</span>
            </div>
          ))}
          {playerChecks.length > 20 && (
            <p className="text-[10px] text-[var(--c-muted)] text-center pt-1">и ещё {playerChecks.length - 20}...</p>
          )}
        </div>
      </div>
    </div>
  );
}
