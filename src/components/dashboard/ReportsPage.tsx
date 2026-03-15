import { useState, useCallback, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAnalyticsStore, type ReportMode, type PeriodPreset } from '@/store/analytics';
import { useShiftStore } from '@/store/shift';
import { useAnalyticsData } from '@/hooks/useAnalyticsData';
import { useAuthStore } from '@/store/auth';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { CheckDetailDrawer, type CheckDetail } from './CheckDetailDrawer';
import { AiReport } from './AiReport';
import {
  TrendingUp, Receipt, Users, Zap, ChevronLeft, ChevronRight,
  Search, Filter, CalendarDays, Layers, ArrowUpRight, X,
  Target, BarChart3, Activity, Clock, PieChart, Wallet, Star,
  Banknote, CreditCard,
} from 'lucide-react';
import { PlayersModule, type CheckWithShift } from './PlayersModule';
import type { Shift } from '@/types';
import { EVENING_TYPE_LABELS } from '@/types';
import { hapticFeedback } from '@/lib/telegram';

type TabId = 'overview' | 'checks' | 'players' | 'ai';

const PRESET_LABELS: Record<PeriodPreset, string> = {
  today: 'Сегодня',
  yesterday: 'Вчера',
  week: 'Неделя',
  month: 'Месяц',
  quarter: 'Квартал',
  custom: 'Период',
};

const pmLabels: Record<string, string> = {
  cash: 'Наличные', card: 'Карта', debt: 'Долг', bonus: 'Бонусы', deposit: 'Депозит', split: 'Разделённая',
};

const pmConfig: Record<string, { label: string; color: string; icon: typeof Banknote }> = {
  cash: { label: 'Наличные', color: 'text-emerald-400', icon: Banknote },
  card: { label: 'Карта', color: 'text-blue-400', icon: CreditCard },
  debt: { label: 'Долг', color: 'text-rose-400', icon: Wallet },
  bonus: { label: 'Бонусы', color: 'text-amber-400', icon: Star },
  deposit: { label: 'Депозит', color: 'text-amber-400', icon: PieChart },
};

const fmt = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n);
const fmtCur = (n: number) => fmt(n) + ' ₽';

interface ReportsPageProps {
  onNavigate?: (target: string) => void;
}

export function ReportsPage({ onNavigate }: ReportsPageProps) {
  const nav = (t: string) => onNavigate?.(t);
  const [tab, setTab] = useState<TabId>('overview');
  const [checkDetail, setCheckDetail] = useState<CheckDetail | null>(null);
  const [checkDetailOpen, setCheckDetailOpen] = useState(false);

  const reportMode = useAnalyticsStore((s) => s.reportMode);
  const setReportMode = useAnalyticsStore((s) => s.setReportMode);
  const selectedShiftId = useAnalyticsStore((s) => s.selectedShiftId);
  const setSelectedShiftId = useAnalyticsStore((s) => s.setSelectedShiftId);
  const preset = useAnalyticsStore((s) => s.preset);
  const setPreset = useAnalyticsStore((s) => s.setPreset);
  const setCustomRange = useAnalyticsStore((s) => s.setCustomRange);

  const data = useAnalyticsData();
  const getShiftAnalytics = useShiftStore((s) => s.getShiftAnalytics);

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [shiftAnalytics, setShiftAnalytics] = useState<Awaited<ReturnType<typeof getShiftAnalytics>>>(null);
  const [shiftLoading, setShiftLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const authUser = useAuthStore((s) => s.user);

  const loadShifts = useCallback(async () => {
    const { data: d } = await supabase
      .from('shifts')
      .select('*, opener:profiles!shifts_opened_by_fkey(nickname)')
      .eq('status', 'closed')
      .order('closed_at', { ascending: false })
      .limit(50);
    if (d) setShifts(d.map((s) => ({ ...s, opener: Array.isArray(s.opener) ? s.opener[0] : s.opener })) as Shift[]);
  }, []);

  useEffect(() => { loadShifts(); }, [loadShifts]);

  useEffect(() => {
    if (reportMode === 'shift' && selectedShiftId) {
      setShiftLoading(true);
      getShiftAnalytics(selectedShiftId).then((a) => {
        setShiftAnalytics(a);
        setShiftLoading(false);
      });
    } else {
      setShiftAnalytics(null);
    }
  }, [reportMode, selectedShiftId, getShiftAnalytics]);

  useEffect(() => {
    if (reportMode === 'shift' && shifts.length > 0 && !selectedShiftId) {
      setSelectedShiftId(shifts[0].id);
    }
  }, [reportMode, shifts, selectedShiftId, setSelectedShiftId]);

  const refundsByCheckIdForDetail = reportMode === 'shift' && shiftAnalytics ? shiftAnalytics.refundsByCheckId : data.refundsByCheckId;
  const openCheckDetail = useCallback(async (checkId: string) => {
    hapticFeedback('light');
    const checks = reportMode === 'shift' && shiftAnalytics ? shiftAnalytics.checks : data.checks;
    const c = checks.find((ch) => ch.id === checkId);
    if (!c) return;

    const refundAmount = refundsByCheckIdForDetail?.get(checkId) ?? 0;

    let items: { name: string; quantity: number; price: number }[] = [];
    if ('items' in c && Array.isArray(c.items)) {
      items = c.items;
    } else {
      const { data: ci } = await supabase
        .from('check_items')
        .select('quantity, price_at_time, item:inventory(name)')
        .eq('check_id', checkId);
      items = (ci || []).map((row: Record<string, unknown>) => {
        const item = Array.isArray(row.item) ? (row.item as Record<string, unknown>[])[0] : row.item;
        return {
          name: (item as { name?: string })?.name || '?',
          quantity: row.quantity as number,
          price: row.price_at_time as number,
        };
      });
    }

    let payments: { method: string; amount: number }[] = [];
    if (c.payment_method === 'split' || c.payment_method === 'bonus') {
      const { data: pm } = await supabase.from('check_payments').select('method, amount').eq('check_id', checkId);
      payments = pm || [];
    }

    const nick = 'player_nickname' in c ? c.player_nickname : (c as { player?: { nickname: string } }).player?.nickname;

    setCheckDetail({
      id: c.id,
      player_nickname: nick || 'Гость',
      total_amount: refundAmount > 0 ? c.total_amount - refundAmount : c.total_amount,
      payment_method: c.payment_method,
      bonus_used: (c as { bonus_used?: number }).bonus_used || 0,
      closed_at: c.closed_at ?? '',
      items,
      payments: payments.length > 0 ? payments : undefined,
      refund_amount: refundAmount > 0 ? refundAmount : undefined,
    });
    setCheckDetailOpen(true);
  }, [reportMode, shiftAnalytics, data.checks, refundsByCheckIdForDetail]);

  const currentRevenue = reportMode === 'shift' && shiftAnalytics ? shiftAnalytics.totalRevenue : data.revenue;
  const currentChecks = useMemo(() => {
    const list = reportMode === 'shift' && shiftAnalytics ? shiftAnalytics.checks : data.checks;
    return list.map((c) => ({ ...c, closed_at: c.closed_at ?? '' }));
  }, [reportMode, shiftAnalytics, data.checks]);

  const currentChecksWithShift = useMemo((): CheckWithShift[] => {
    const list = reportMode === 'shift' && shiftAnalytics ? shiftAnalytics.checks : data.checks;
    return list.map((c) => {
      const base = { ...c, closed_at: c.closed_at ?? '' };
      if (reportMode === 'shift' && shiftAnalytics) {
        const sc = c as { player_nickname?: string; player_id?: string; shift?: { evening_type: string | null } };
        return {
          ...base,
          player_id: sc.player_id ?? '',
          player: { nickname: sc.player_nickname || 'Гость' },
          shift: sc.shift ?? (shiftAnalytics.shift ? { evening_type: shiftAnalytics.shift.evening_type } : null),
        } as CheckWithShift;
      }
      return base as CheckWithShift;
    });
  }, [reportMode, shiftAnalytics, data.checks]);

  const playersForModule = useMemo(() => {
    if (reportMode === 'shift' && shiftAnalytics) {
      const eveningType = shiftAnalytics.shift?.evening_type || 'no_event';
      return shiftAnalytics.playerBreakdown.map((p) => {
        const profile = data.allPlayers.find((pl) => pl.nickname === p.nickname);
        return {
          id: profile?.id || p.nickname,
          nickname: p.nickname,
          photo_url: profile?.photo_url || null,
          total: p.total,
          count: p.checks,
          avgCheck: p.checks > 0 ? Math.round(p.total / p.checks) : 0,
          lastVisit: new Date(),
          firstVisit: new Date(),
          segment: 'active' as const,
          bonusBalance: profile?.bonus_points || 0,
          tier: profile?.client_tier || 'regular',
          eveningTypeCounts: { [eveningType]: p.checks },
        };
      });
    }
    return data.playerStats;
  }, [reportMode, shiftAnalytics, data.playerStats, data.allPlayers]);

  const currentPaymentBreakdown = useMemo((): Record<string, { count?: number; amount: number }> => {
    if (reportMode === 'shift' && shiftAnalytics) return shiftAnalytics.paymentBreakdown;
    const pb = data.paymentBreakdown;
    return {
      cash: { amount: pb.cash },
      card: { amount: pb.card },
      debt: { amount: pb.debt },
      bonus: { amount: pb.bonus },
      deposit: { amount: pb.deposit },
    };
  }, [reportMode, shiftAnalytics, data.paymentBreakdown]);

  const currentItemsSold = reportMode === 'shift' && shiftAnalytics
    ? shiftAnalytics.itemsSold || []
    : data.productStats.map((p) => ({ name: p.name, category: p.category, quantity: p.qty, revenue: p.revenue }));
  const currentPlayerBreakdown = reportMode === 'shift' && shiftAnalytics
    ? shiftAnalytics.playerBreakdown || []
    : data.playerStats.map((p) => ({ nickname: p.nickname, checks: p.count, total: p.total }));

  const shiftIdx = useMemo(() => shifts.findIndex((s) => s.id === selectedShiftId), [shifts, selectedShiftId]);
  const selectedShift = shiftIdx >= 0 ? shifts[shiftIdx] : null;

  const avgCheck = currentChecks.length > 0 ? Math.round(currentRevenue / currentChecks.length) : 0;
  const revenueDelta = data.prevRevenue > 0 ? Math.round(((data.revenue - data.prevRevenue) / Math.abs(data.prevRevenue)) * 100) : (data.revenue > 0 ? 100 : 0);
  const playerSegments = useMemo(() => {
    const segs = { new: 0, active: 0, sleeping: 0 };
    for (const p of data.playerStats) segs[p.segment]++;
    return segs;
  }, [data.playerStats]);

  const totalLTV = playersForModule.reduce((s, p) => s + p.total, 0);

  const forecastRevenue = useMemo(() => {
    if (reportMode === 'shift' || preset === 'custom') return null;
    const { range } = useAnalyticsStore.getState();
    const now = new Date();
    const totalMs = range.end.getTime() - range.start.getTime();
    const elapsedMs = Math.min(now.getTime() - range.start.getTime(), totalMs);
    if (elapsedMs <= 0 || totalMs <= 0) return null;
    const ratio = totalMs / elapsedMs;
    return Math.round(currentRevenue * ratio);
  }, [reportMode, preset, currentRevenue]);

  const netProfit = reportMode === 'shift' && shiftAnalytics
    ? shiftAnalytics.totalRevenue
    : data.netProfit;

  const aiContext = useMemo(() => {
    if (reportMode === 'shift' && shiftAnalytics) {
      const pb = shiftAnalytics.paymentBreakdown || {};
      const paymentBreakdown = {
        cash: pb.cash?.amount ?? 0,
        card: pb.card?.amount ?? 0,
        debt: pb.debt?.amount ?? 0,
        bonus: pb.bonus?.amount ?? 0,
      };
      return {
        revenue: shiftAnalytics.totalRevenue,
        prevRevenue: 0,
        revenueDelta: 0,
        netProfit: shiftAnalytics.totalRevenue,
        marginPct: 100,
        totalExpenses: 0,
        cogs: 0,
        periodExpenses: 0,
        checkCount: shiftAnalytics.totalChecks,
        avgCheck: shiftAnalytics.avgCheck,
        totalDebt: data.totalDebt,
        debtorsCount: data.debtors.length,
        retentionRate: 0,
        playerSegments: { new: 0, active: shiftAnalytics.playerBreakdown?.length ?? 0, sleeping: 0 },
        topProducts: (shiftAnalytics.itemsSold || []).slice(0, 10).map((p) => ({ name: p.name, revenue: p.revenue, qty: p.quantity, abcGroup: 'A' as const })),
        topPlayers: (shiftAnalytics.playerBreakdown || []).slice(0, 10).map((p) => ({ nickname: p.nickname, total: p.total, count: p.checks, segment: 'active' })),
        paymentBreakdown,
        period: 'shift',
      };
    }
    return {
      revenue: data.revenue,
      prevRevenue: data.prevRevenue,
      revenueDelta,
      netProfit: data.netProfit,
      marginPct: data.marginPct,
      totalExpenses: data.totalExpenses,
      cogs: data.cogs,
      periodExpenses: data.periodExpenses,
      checkCount: data.checks.length,
      avgCheck,
      totalDebt: data.totalDebt,
      debtorsCount: data.debtors.length,
      retentionRate: data.retentionRate,
      playerSegments,
      topProducts: data.productStats.slice(0, 10).map((p) => ({ name: p.name, revenue: p.revenue, qty: p.qty, abcGroup: p.abcGroup })),
      topPlayers: data.playerStats.slice(0, 10).map((p) => ({ nickname: p.nickname, total: p.total, count: p.count, segment: p.segment })),
      paymentBreakdown: data.paymentBreakdown,
      period: preset,
    };
  }, [reportMode, shiftAnalytics, data, avgCheck, preset, revenueDelta, playerSegments]);

  const isLoading = data.isLoading || (reportMode === 'shift' && shiftLoading);

  const applyCustomRange = () => {
    if (dateFrom && dateTo) {
      const start = new Date(dateFrom + 'T00:00:00');
      const end = new Date(dateTo + 'T23:59:59');
      if (start <= end) {
        setCustomRange(start, end);
        setShowFilters(false);
      }
    }
  };

  if (reportMode === 'shift' && shifts.length === 0 && !isLoading) {
    return (
      <div className="text-center py-16">
        <Layers className="w-16 h-16 text-[var(--c-muted)] mx-auto mb-4" />
        <p className="text-sm text-[var(--c-hint)]">Нет закрытых смен</p>
        <button
          onClick={() => { hapticFeedback('light'); setReportMode('period'); }}
          className="mt-4 px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--c-accent)] text-[var(--c-accent-text)]"
        >
          Перейти к отчёту по периоду
        </button>
      </div>
    );
  }

  if (isLoading && !shiftAnalytics && reportMode === 'shift') {
    return <ListSkeleton rows={8} />;
  }

  const activeTimeframeLabel = reportMode === 'shift'
    ? (selectedShift?.evening_type ? EVENING_TYPE_LABELS[selectedShift.evening_type] : 'Без вечера')
    : PRESET_LABELS[preset];

  return (
    <div className="min-h-full -mx-4 -mt-4 sm:-mx-5 sm:-mt-5 lg:-mx-0 lg:-mt-0">
      {/* Background mesh (subtle) */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-indigo-600/10 blur-[130px] rounded-full" />
        <div className="absolute bottom-[5%] right-[-5%] w-[40%] h-[40%] bg-rose-600/8 blur-[110px] rounded-full" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-[var(--c-bg)]/80 border-b border-white/5 px-4 sm:px-5 pt-4 pb-4">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[var(--c-text)] flex items-center gap-2">
              Отчёты <span className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.6)]" />
            </h1>
            <p className="text-[9px] uppercase tracking-[0.2em] text-[var(--c-muted)] font-bold">Analytics</p>
          </div>
          <button
            onClick={() => { hapticFeedback('light'); setReportMode(reportMode === 'period' ? 'shift' : 'period'); }}
            className="w-11 h-11 flex items-center justify-center bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all active:scale-90 tap"
          >
            <Layers className="w-4 h-4 text-[var(--c-muted)]" />
          </button>
        </div>

        {/* Time filter / Shift selector */}
        {reportMode === 'period' ? (
          <div className="flex gap-2 overflow-x-auto scrollbar-none py-1">
            {(['today', 'yesterday', 'week', 'month', 'quarter'] as const).map((p) => (
              <button
                key={p}
                onClick={() => { hapticFeedback('light'); setPreset(p); setShowFilters(false); }}
                className={`px-4 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all shrink-0 border ${
                  preset === p ? 'bg-white/15 border-white/20 text-[var(--c-text)] shadow-lg backdrop-blur-xl' : 'bg-white/5 border-transparent text-[var(--c-muted)] hover:text-[var(--c-hint)]'
                }`}
              >
                {PRESET_LABELS[p]}
              </button>
            ))}
            <button
              onClick={() => { hapticFeedback('light'); setShowFilters(!showFilters); }}
              className={`px-3 py-2.5 rounded-2xl shrink-0 border transition-all ${showFilters ? 'bg-white/15 border-white/20' : 'bg-white/5 border-white/10'}`}
            >
              <Filter className="w-4 h-4 text-[var(--c-muted)]" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => { hapticFeedback('light'); shiftIdx < shifts.length - 1 && setSelectedShiftId(shifts[shiftIdx + 1]?.id ?? null); }}
              disabled={shiftIdx >= shifts.length - 1}
              className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center disabled:opacity-30 active:scale-95"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex-1 text-center min-w-0">
              <p className="text-sm font-bold text-[var(--c-text)] truncate">
                {selectedShift ? (selectedShift.evening_type ? EVENING_TYPE_LABELS[selectedShift.evening_type] : 'Без вечера') : '—'}
              </p>
              <p className="text-[10px] text-[var(--c-muted)]">
                {selectedShift ? new Date(selectedShift.opened_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : ''}
              </p>
            </div>
            <button
              onClick={() => { hapticFeedback('light'); shiftIdx > 0 && setSelectedShiftId(shifts[shiftIdx - 1]?.id ?? null); }}
              disabled={shiftIdx <= 0}
              className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center disabled:opacity-30 active:scale-95"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {showFilters && reportMode === 'period' && (
          <div className="mt-3 p-3 rounded-2xl bg-white/5 border border-white/10 space-y-2 animate-fade-in">
            <div className="flex gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="flex-1 px-3 py-2 text-xs rounded-xl bg-black/30 border border-white/10"
              />
              <span className="text-xs text-[var(--c-muted)] self-center">—</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="flex-1 px-3 py-2 text-xs rounded-xl bg-black/30 border border-white/10"
              />
            </div>
            <button
              onClick={applyCustomRange}
              disabled={!dateFrom || !dateTo}
              className="w-full py-2 rounded-xl text-xs font-bold bg-[var(--c-accent)] text-[var(--c-accent-text)] disabled:opacity-30"
            >
              Применить
            </button>
          </div>
        )}

        {/* Nav tabs */}
        <div className="flex items-center gap-1 bg-black/40 p-1.5 rounded-2xl border border-white/5 mt-4 overflow-x-auto scrollbar-none">
          {[
            { id: 'overview' as TabId, label: 'Обзор', icon: TrendingUp },
            { id: 'checks' as TabId, label: 'Чеки', icon: Receipt },
            { id: 'players' as TabId, label: 'Игроки', icon: Users },
            { id: 'ai' as TabId, label: 'ИИ Анализ', icon: Zap },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => { hapticFeedback('light'); setTab(t.id); }}
              className={`px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest flex items-center gap-2 transition-all shrink-0 ${
                tab === t.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-[var(--c-muted)] hover:text-[var(--c-hint)]'
              }`}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="px-4 sm:px-5 py-6 max-w-2xl mx-auto relative z-10">
        {tab === 'overview' && (
          <OverviewTab
            revenue={currentRevenue}
            revenueDelta={reportMode === 'period' ? revenueDelta : undefined}
            activeTimeframe={activeTimeframeLabel}
            checks={currentChecks}
            paymentBreakdown={currentPaymentBreakdown}
            avgCheck={avgCheck}
            totalDebt={reportMode === 'period' ? data.totalDebt : undefined}
            totalLTV={totalLTV}
            forecastRevenue={forecastRevenue}
            netProfit={netProfit}
            onCheckClick={openCheckDetail}
            onNavigate={nav}
            onShowAllChecks={() => setTab('checks')}
            refundsByCheckId={reportMode === 'shift' && shiftAnalytics ? shiftAnalytics.refundsByCheckId : data.refundsByCheckId}
          />
        )}

        {tab === 'checks' && (
          <ChecksTab
            checks={currentChecks}
            paymentBreakdown={currentPaymentBreakdown}
            onCheckClick={openCheckDetail}
            refundsByCheckId={reportMode === 'shift' && shiftAnalytics ? shiftAnalytics.refundsByCheckId : data.refundsByCheckId}
          />
        )}

        {tab === 'players' && (
          <PlayersModule
            players={playersForModule}
            retentionRate={reportMode === 'shift' ? 0 : data.retentionRate}
            checks={currentChecksWithShift}
            allCheckItems={reportMode === 'shift' && shiftAnalytics
              ? shiftAnalytics.checks.flatMap((c) => (c.items || []).map((it) => ({
                  check_id: c.id,
                  item_id: '',
                  quantity: it.quantity,
                  price_at_time: it.price,
                  item: { name: it.name },
                })))
              : data.allCheckItems}
          />
        )}

        {tab === 'ai' && (
          <AiReport context={aiContext} userName={authUser?.nickname || 'Пользователь'} userTgId={authUser?.tg_id ?? null} />
        )}
      </main>

      <CheckDetailDrawer check={checkDetail} open={checkDetailOpen} onClose={() => setCheckDetailOpen(false)} />
    </div>
  );
}

function getStatusStyle(status: string) {
  switch (status) {
    case 'debt': return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    case 'card': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    case 'cash': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
  }
}

function OverviewTab({
  revenue,
  revenueDelta,
  activeTimeframe,
  checks,
  paymentBreakdown,
  avgCheck,
  totalDebt,
  totalLTV,
  forecastRevenue,
  netProfit,
  onCheckClick,
  onNavigate,
  onShowAllChecks,
  refundsByCheckId,
}: {
  revenue: number;
  revenueDelta?: number;
  activeTimeframe: string;
  checks: { id: string; player_nickname?: string; total_amount: number; payment_method: string | null; closed_at: string; player?: { nickname: string } | null }[];
  paymentBreakdown: Record<string, { count?: number; amount: number }>;
  avgCheck: number;
  totalDebt?: number;
  totalLTV?: number;
  forecastRevenue?: number | null;
  netProfit?: number;
  onCheckClick: (id: string) => void;
  onNavigate: (t: string) => void;
  onShowAllChecks: () => void;
  refundsByCheckId?: Map<string, number>;
}) {
  const payments = [
    { key: 'cash', ...pmConfig.cash },
    { key: 'card', ...pmConfig.card },
    { key: 'debt', ...pmConfig.debt },
    { key: 'deposit', ...pmConfig.deposit },
  ].filter((p) => (paymentBreakdown[p.key]?.amount ?? 0) > 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Revenue hero */}
      <div className="relative">
        <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-violet-600 rounded-[2.5rem] blur opacity-20" />
        <div className="relative p-6 sm:p-7 bg-white/5 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] overflow-hidden">
          <div className="flex justify-between items-start mb-6">
            <div>
              <p className="text-[var(--c-muted)] text-[10px] font-black uppercase tracking-widest mb-1">Выручка за {activeTimeframe}</p>
              <h2 className="text-4xl sm:text-5xl font-black text-[var(--c-text)] tracking-tighter tabular-nums">{fmtCur(revenue)}</h2>
            </div>
            {revenueDelta !== undefined && revenueDelta !== 0 && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-2xl">
                <div className="text-emerald-400 font-black text-sm flex items-center gap-1">
                  <ArrowUpRight size={14} /> {revenueDelta > 0 ? '+' : ''}{revenueDelta}%
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-6 mb-6">
            {forecastRevenue != null && (
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-[var(--c-muted)]">
                  <Target size={10} className="text-indigo-400" />
                  <span className="text-[9px] font-black uppercase tracking-wider">Прогноз</span>
                </div>
                <p className="text-sm font-bold text-[var(--c-text)]">~{fmtCur(forecastRevenue)}</p>
              </div>
            )}
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-[var(--c-muted)]">
                <BarChart3 size={10} className="text-violet-400" />
                <span className="text-[9px] font-black uppercase tracking-wider">Чистая</span>
              </div>
              <p className="text-sm font-bold text-[var(--c-text)]">{fmtCur(netProfit ?? revenue)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-black/30 p-3 rounded-2xl border border-white/5 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Receipt size={14} className="text-[var(--c-muted)]" />
                <span className="text-[var(--c-muted)] text-[10px] font-black uppercase tracking-widest">Чеков</span>
              </div>
              <span className="text-sm font-bold text-[var(--c-text)]">{checks.length}</span>
            </div>
            <div className="bg-black/30 p-3 rounded-2xl border border-white/5 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Activity size={14} className="text-[var(--c-muted)]" />
                <span className="text-[var(--c-muted)] text-[10px] font-black uppercase tracking-widest">Средний</span>
              </div>
              <span className="text-sm font-bold text-[var(--c-text)]">{fmtCur(avgCheck)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Debt & LTV */}
      <div className="flex gap-3">
        {(totalDebt ?? 0) > 0 && (
          <button
            onClick={() => onNavigate('management:debtors')}
            className="flex-1 p-5 bg-rose-500/5 backdrop-blur-xl border border-rose-500/10 rounded-3xl flex flex-col justify-center text-left tap"
          >
            <p className="text-[var(--c-muted)] text-[9px] font-black uppercase mb-1 tracking-wider">Общий долг</p>
            <p className="text-xl font-black text-rose-500 tabular-nums">{fmtCur(totalDebt ?? 0)}</p>
          </button>
        )}
        <div className="flex-1 p-5 bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl flex flex-col justify-center">
          <p className="text-[var(--c-muted)] text-[9px] font-black uppercase mb-1 tracking-wider">Всего LTV</p>
          <p className="text-xl font-black text-indigo-400 tabular-nums">{fmtCur(totalLTV ?? 0)}</p>
        </div>
      </div>

      {/* Payment methods */}
      <section className="space-y-3">
        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--c-muted)] flex items-center gap-2 px-2">
          <PieChart size={14} className="text-indigo-400" /> Способы оплаты
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {payments.map((p) => {
            const amt = paymentBreakdown[p.key]?.amount ?? 0;
            const Icon = p.icon;
            return (
              <div key={p.key} className="p-4 bg-white/[0.03] backdrop-blur-md border border-white/5 rounded-2xl flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <div className={`p-1.5 rounded-lg bg-white/5 ${p.color}`}>
                    <Icon size={14} />
                  </div>
                  <span className={`text-sm font-black tabular-nums ${p.color}`}>{fmtCur(amt)}</span>
                </div>
                <p className="text-[10px] font-bold text-[var(--c-muted)] uppercase tracking-widest">{p.label}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Recent checks */}
      <section className="space-y-4">
        <div className="flex justify-between items-end px-2">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--c-muted)] flex items-center gap-2">
            <Clock size={14} className="text-indigo-400" /> Последние операции
          </h3>
          <button onClick={onShowAllChecks} className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest hover:underline tap">
            Смотреть все
          </button>
        </div>
        <div className="space-y-2">
          {checks.slice(0, 5).map((c) => {
            const refundAmt = refundsByCheckId?.get(c.id) ?? 0;
            const nick = (c as { player_nickname?: string }).player_nickname || (c as { player?: { nickname: string } }).player?.nickname || 'Гость';
            const pm = c.payment_method || 'cash';
            const statusLabel = pmLabels[pm] || pm;
            return (
              <button
                key={c.id}
                onClick={() => onCheckClick(c.id)}
                className="w-full p-4 bg-white/[0.02] hover:bg-white/[0.05] backdrop-blur-md border border-white/5 rounded-2xl flex justify-between items-center transition-all tap"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center ${pm === 'debt' ? 'text-rose-400' : 'text-[var(--c-muted)]'}`}>
                    <Receipt size={18} />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-[var(--c-text)]">{nick}</p>
                    <p className="text-[9px] text-[var(--c-muted)] font-bold uppercase tracking-wider">
                      {new Date(c.closed_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} • {statusLabel}
                    </p>
                  </div>
                </div>
                <p className="text-base font-black text-[var(--c-text)] tabular-nums">{fmtCur(refundAmt > 0 ? c.total_amount - refundAmt : c.total_amount)}</p>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ChecksTab({
  checks,
  paymentBreakdown,
  onCheckClick,
  refundsByCheckId,
}: {
  checks: { id: string; player_nickname?: string; total_amount: number; payment_method: string | null; closed_at: string; player?: { nickname: string } | null }[];
  paymentBreakdown: Record<string, { count?: number; amount: number }>;
  onCheckClick: (id: string) => void;
  refundsByCheckId?: Map<string, number>;
}) {
  const [search, setSearch] = useState('');
  const searchLower = search.toLowerCase().trim();
  const filtered = useMemo(() => {
    if (!searchLower) return checks;
    return checks.filter((c) => {
      const nick = (c as { player_nickname?: string }).player_nickname || (c as { player?: { nickname: string } }).player?.nickname || '';
      return nick.toLowerCase().includes(searchLower);
    });
  }, [checks, searchLower]);

  if (checks.length === 0) {
    return (
      <div className="text-center py-16">
        <Receipt className="w-16 h-16 text-[var(--c-muted)] mx-auto mb-4" />
        <p className="text-sm text-[var(--c-hint)]">Нет чеков за выбранный период</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="relative">
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-[var(--c-muted)]" size={18} />
        <input
          type="text"
          placeholder="Поиск чека..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-white/[0.03] border border-white/10 rounded-3xl py-4 pl-14 pr-6 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/30"
        />
      </div>
      <div className="space-y-2">
        {filtered.map((c) => {
          const nick = (c as { player_nickname?: string }).player_nickname || (c as { player?: { nickname: string } }).player?.nickname || 'Гость';
          const refundAmt = refundsByCheckId?.get(c.id) ?? 0;
          const displayTotal = refundAmt > 0 ? c.total_amount - refundAmt : c.total_amount;
          const pm = c.payment_method || 'cash';
          const statusLabel = pmLabels[pm] || pm;
          return (
            <button
              key={c.id}
              onClick={() => onCheckClick(c.id)}
              className="w-full p-4 bg-white/[0.02] backdrop-blur-md border border-white/5 rounded-2xl transition-all flex items-center justify-between tap"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg border ${getStatusStyle(pm)}`}>
                  <Receipt size={16} />
                </div>
                <div className="text-left">
                  <p className="font-bold text-[var(--c-text)] text-sm">{nick}</p>
                  <p className="text-[10px] text-[var(--c-muted)] font-bold uppercase tracking-tighter">
                    {new Date(c.closed_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}, {new Date(c.closed_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-base font-black text-[var(--c-text)] tabular-nums">{fmtCur(displayTotal)}</p>
                <span className="text-[8px] text-[var(--c-muted)] font-black uppercase tracking-widest">{statusLabel}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
