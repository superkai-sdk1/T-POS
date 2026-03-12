import { useState, useCallback, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAnalyticsStore, type ReportMode } from '@/store/analytics';
import { useShiftStore } from '@/store/shift';
import { useAnalyticsData } from '@/hooks/useAnalyticsData';
import { useAuthStore } from '@/store/auth';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { CheckDetailDrawer, type CheckDetail } from './CheckDetailDrawer';
import { AiReport } from './AiReport';
import {
  BarChart3, Receipt, ShoppingBag, Users, Sparkles,
  ChevronLeft, ChevronRight, CalendarDays, Layers,
  Crown, Search, Filter, X,
} from 'lucide-react';
import type { Shift } from '@/types';

type TabId = 'overview' | 'checks' | 'tops' | 'ai';

const pmLabels: Record<string, string> = {
  cash: 'Наличные', card: 'Карта', debt: 'Долг', bonus: 'Бонусы', deposit: 'Депозит', split: 'Разделённая',
};

const fmt = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n);
const fmtCur = (n: number) => fmt(n) + '₽';

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

  const data = useAnalyticsData();
  const getShiftAnalytics = useShiftStore((s) => s.getShiftAnalytics);

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [shiftAnalytics, setShiftAnalytics] = useState<Awaited<ReturnType<typeof getShiftAnalytics>>>(null);
  const [shiftLoading, setShiftLoading] = useState(false);

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

  const openCheckDetail = useCallback(async (checkId: string) => {
    const checks = reportMode === 'shift' && shiftAnalytics
      ? shiftAnalytics.checks
      : data.checks;
    const c = checks.find((ch) => ch.id === checkId);
    if (!c) return;

    let items: { name: string; quantity: number; price: number }[] = [];
    if ('items' in c && Array.isArray(c.items)) {
      items = c.items;
    } else {
      const { data: ci } = await supabase
        .from('check_items')
        .select('quantity, price_at_time, item:inventory(name)')
        .eq('check_id', checkId);
      items = (ci || []).map((row: Record<string, unknown>) => {
        const item = Array.isArray(row.item) ? row.item[0] : row.item;
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
      total_amount: c.total_amount,
      payment_method: c.payment_method,
      bonus_used: (c as { bonus_used?: number }).bonus_used || 0,
      closed_at: c.closed_at,
      items,
      payments: payments.length > 0 ? payments : undefined,
    });
    setCheckDetailOpen(true);
  }, [reportMode, shiftAnalytics, data.checks]);

  const currentRevenue = reportMode === 'shift' && shiftAnalytics
    ? shiftAnalytics.totalRevenue
    : data.revenue;
  const currentChecks = reportMode === 'shift' && shiftAnalytics
    ? shiftAnalytics.checks
    : data.checks;
  const currentPaymentBreakdown = reportMode === 'shift' && shiftAnalytics
    ? shiftAnalytics.paymentBreakdown
    : { cash: data.paymentBreakdown.cash, card: data.paymentBreakdown.card, debt: data.paymentBreakdown.debt, bonus: data.paymentBreakdown.bonus, deposit: data.paymentBreakdown.deposit };
  const currentItemsSold = reportMode === 'shift' && shiftAnalytics
    ? shiftAnalytics.itemsSold || []
    : data.productStats.map((p) => ({ name: p.name, category: p.category, quantity: p.qty, revenue: p.revenue }));
  const currentPlayerBreakdown = reportMode === 'shift' && shiftAnalytics
    ? shiftAnalytics.playerBreakdown || []
    : data.playerStats.map((p) => ({ nickname: p.nickname, checks: p.count, total: p.total }));

  const shiftIdx = useMemo(() => shifts.findIndex((s) => s.id === selectedShiftId), [shifts, selectedShiftId]);
  const selectedShift = shiftIdx >= 0 ? shifts[shiftIdx] : null;

  const authUser = useAuthStore((s) => s.user);
  const preset = useAnalyticsStore((s) => s.preset);
  const avgCheck = currentChecks.length > 0 ? Math.round(currentRevenue / currentChecks.length) : 0;
  const revenueDelta = data.prevRevenue > 0 ? Math.round(((data.revenue - data.prevRevenue) / Math.abs(data.prevRevenue)) * 100) : (data.revenue > 0 ? 100 : 0);
  const playerSegments = useMemo(() => {
    const segs = { new: 0, active: 0, sleeping: 0 };
    for (const p of data.playerStats) segs[p.segment]++;
    return segs;
  }, [data.playerStats]);

  const aiContext = useMemo(() => ({
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
  }), [data, avgCheck, preset, revenueDelta, playerSegments]);

  const isLoading = data.isLoading || (reportMode === 'shift' && shiftLoading);

  if (reportMode === 'shift' && shifts.length === 0 && !isLoading) {
    return (
      <div className="text-center py-16">
        <Layers className="w-16 h-16 text-[var(--c-muted)] mx-auto mb-4" />
        <p className="text-sm text-[var(--c-hint)]">Нет закрытых смен</p>
        <p className="text-[11px] text-[var(--c-muted)] mt-1">Закрытые смены появятся здесь</p>
        <button
          onClick={() => setReportMode('period')}
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

  return (
    <div className="space-y-4">
      {/* Mode switcher */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1 p-1 rounded-xl bg-[var(--c-surface)]">
          <button
            onClick={() => setReportMode('period')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              reportMode === 'period' ? 'bg-[var(--c-accent)] text-[var(--c-accent-text)]' : 'text-[var(--c-hint)]'
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            Период
          </button>
          <button
            onClick={() => setReportMode('shift')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              reportMode === 'shift' ? 'bg-[var(--c-accent)] text-[var(--c-accent-text)]' : 'text-[var(--c-hint)]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Смена
          </button>
        </div>

        {reportMode === 'shift' && selectedShift && (
          <div className="flex-1 flex items-center gap-2">
            <button
              onClick={() => shiftIdx < shifts.length - 1 && setSelectedShiftId(shifts[shiftIdx + 1]?.id ?? null)}
              disabled={shiftIdx >= shifts.length - 1}
              className="w-9 h-9 rounded-xl bg-[var(--c-surface)] flex items-center justify-center disabled:opacity-30 active:scale-95"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex-1 text-center min-w-0">
              <p className="text-sm font-bold text-[var(--c-text)] truncate">
                {new Date(selectedShift.opened_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                {selectedShift.closed_at && ` — ${new Date(selectedShift.closed_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`}
              </p>
              <p className="text-[10px] text-[var(--c-hint)]">{shifts.length} смен</p>
            </div>
            <button
              onClick={() => shiftIdx > 0 && setSelectedShiftId(shifts[shiftIdx - 1]?.id ?? null)}
              disabled={shiftIdx <= 0}
              className="w-9 h-9 rounded-xl bg-[var(--c-surface)] flex items-center justify-center disabled:opacity-30 active:scale-95"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {reportMode === 'period' && (
        <ReportsFilters admins={data.admins} />
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-[var(--c-surface)] overflow-x-auto scrollbar-none">
        {[
          { id: 'overview' as TabId, label: 'Обзор', icon: BarChart3 },
          { id: 'checks' as TabId, label: 'Чеки', icon: Receipt },
          { id: 'tops' as TabId, label: 'Топы', icon: Crown },
          { id: 'ai' as TabId, label: 'ИИ', icon: Sparkles },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 min-w-0 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
              tab === t.id ? 'bg-[var(--c-accent)] text-[var(--c-accent-text)]' : 'text-[var(--c-hint)]'
            }`}
          >
            <t.icon className="w-3.5 h-3.5 shrink-0" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <OverviewTab
          revenue={currentRevenue}
          revenueDelta={reportMode === 'period' ? revenueDelta : undefined}
          checks={currentChecks}
          paymentBreakdown={currentPaymentBreakdown}
          avgCheck={avgCheck}
          debtorsCount={reportMode === 'period' ? data.debtors.length : undefined}
          totalDebt={reportMode === 'period' ? data.totalDebt : undefined}
          onCheckClick={openCheckDetail}
          onNavigate={nav}
          onShowAllChecks={() => setTab('checks')}
        />
      )}

      {tab === 'checks' && (
        <ChecksTab
          checks={currentChecks}
          paymentBreakdown={currentPaymentBreakdown}
          onCheckClick={openCheckDetail}
          checkPaymentsMap={data.checkPaymentsMap}
        />
      )}

      {tab === 'tops' && (
        <TopsTab
          products={data.productStats}
          players={data.playerStats}
          itemsSold={currentItemsSold}
          playerBreakdown={currentPlayerBreakdown}
          reportMode={reportMode}
          onCheckClick={openCheckDetail}
          checks={data.checks}
          allCheckItems={data.allCheckItems}
        />
      )}

      {tab === 'ai' && (
        <AiReport context={aiContext} userName={authUser?.nickname || 'Пользователь'} />
      )}

      <CheckDetailDrawer check={checkDetail} open={checkDetailOpen} onClose={() => setCheckDetailOpen(false)} />
    </div>
  );
}

function ReportsFilters({ admins }: { admins: Pick<{ id: string; nickname: string }, 'id' | 'nickname'>[] }) {
  const { preset, setPreset, paymentFilter, setPaymentFilter, adminFilter, setAdminFilter, search, setSearch } = useAnalyticsStore();
  const [expanded, setExpanded] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const setCustomRange = useAnalyticsStore((s) => s.setCustomRange);

  const PRESETS = [
    { id: 'today' as const, label: 'Сегодня' },
    { id: 'yesterday' as const, label: 'Вчера' },
    { id: 'week' as const, label: 'Неделя' },
    { id: 'month' as const, label: 'Месяц' },
    { id: 'quarter' as const, label: 'Квартал' },
  ];
  const PM_OPTIONS = [
    { id: 'cash' as const, label: 'Наличные' },
    { id: 'card' as const, label: 'Карта' },
    { id: 'debt' as const, label: 'Долг' },
    { id: 'bonus' as const, label: 'Бонусы' },
  ];
  const hasFilters = paymentFilter !== null || adminFilter !== null;

  const applyCustomRange = () => {
    if (dateFrom && dateTo) {
      const start = new Date(dateFrom + 'T00:00:00');
      const end = new Date(dateTo + 'T23:59:59');
      if (start <= end) {
        setCustomRange(start, end);
        setShowDatePicker(false);
      }
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex gap-1 overflow-x-auto scrollbar-none flex-1">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => { setShowDatePicker(false); setPreset(p.id); }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all active:scale-95 ${
                preset === p.id && !showDatePicker ? 'bg-[var(--c-accent)] text-[var(--c-accent-text)]' : 'bg-[var(--c-surface)] text-[var(--c-hint)]'
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setShowDatePicker(!showDatePicker)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 ${
              showDatePicker || preset === 'custom' ? 'bg-[var(--c-accent)] text-[var(--c-accent-text)]' : 'bg-[var(--c-surface)] text-[var(--c-hint)]'
            }`}
          >
            <CalendarDays className="w-3 h-3" />
            Период
          </button>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${hasFilters ? 'bg-[var(--c-accent)]/10 text-[var(--c-accent)]' : 'bg-[var(--c-surface)] text-[var(--c-hint)]'}`}
        >
          <Filter className="w-4 h-4" />
        </button>
      </div>

      {showDatePicker && (
        <div className="p-3 rounded-xl card space-y-2 animate-fade-in-up">
          <div className="flex gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="flex-1 px-2 py-1.5 text-xs rounded-lg bg-[var(--c-surface)] border border-[var(--c-border)]"
            />
            <span className="text-xs text-[var(--c-hint)] self-center">—</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="flex-1 px-2 py-1.5 text-xs rounded-lg bg-[var(--c-surface)] border border-[var(--c-border)]"
            />
          </div>
          <button
            onClick={applyCustomRange}
            disabled={!dateFrom || !dateTo}
            className="w-full py-1.5 rounded-lg text-xs font-semibold bg-[var(--c-accent)] text-[var(--c-accent-text)] disabled:opacity-30"
          >
            Применить
          </button>
        </div>
      )}

      {expanded && (
        <div className="p-3 rounded-xl card space-y-3 animate-fade-in-up">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--c-hint)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск..."
              className="w-full pl-8 pr-3 py-2 text-xs rounded-xl bg-[var(--c-surface)] border border-[var(--c-border)]"
            />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-[var(--c-hint)] uppercase mb-1.5">Оплата</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setPaymentFilter(null)}
                className={`px-2 py-1 rounded-md text-[11px] ${!paymentFilter ? 'bg-[var(--c-accent)] text-[var(--c-accent-text)]' : 'bg-[var(--c-surface)] text-[var(--c-hint)]'}`}
              >
                Все
              </button>
              {PM_OPTIONS.map((pm) => (
                <button
                  key={pm.id}
                  onClick={() => setPaymentFilter(paymentFilter === pm.id ? null : pm.id)}
                  className={`px-2 py-1 rounded-md text-[11px] ${paymentFilter === pm.id ? 'bg-[var(--c-accent)] text-[var(--c-accent-text)]' : 'bg-[var(--c-surface)] text-[var(--c-hint)]'}`}
                >
                  {pm.label}
                </button>
              ))}
            </div>
          </div>
          {admins.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-[var(--c-hint)] uppercase mb-1.5">Администратор</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setAdminFilter(null)}
                  className={`px-2 py-1 rounded-md text-[11px] ${!adminFilter ? 'bg-[var(--c-accent)] text-[var(--c-accent-text)]' : 'bg-[var(--c-surface)] text-[var(--c-hint)]'}`}
                >
                  Все
                </button>
                {admins.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setAdminFilter(adminFilter === a.id ? null : a.id)}
                    className={`px-2 py-1 rounded-md text-[11px] ${adminFilter === a.id ? 'bg-[var(--c-accent)] text-[var(--c-accent-text)]' : 'bg-[var(--c-surface)] text-[var(--c-hint)]'}`}
                  >
                    {a.nickname}
                  </button>
                ))}
              </div>
            </div>
          )}
          {hasFilters && (
            <button
              onClick={() => { setPaymentFilter(null); setAdminFilter(null); }}
              className="flex items-center gap-1 text-[11px] text-[var(--c-danger)] font-medium"
            >
              <X className="w-3 h-3" /> Сбросить
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function OverviewTab({
  revenue,
  revenueDelta,
  checks,
  paymentBreakdown,
  avgCheck,
  debtorsCount,
  totalDebt,
  onCheckClick,
  onNavigate,
  onShowAllChecks,
}: {
  revenue: number;
  revenueDelta?: number;
  checks: { id: string; player_nickname?: string; total_amount: number; payment_method: string | null; closed_at: string; player?: { nickname: string } | null }[];
  paymentBreakdown: Record<string, { count?: number; amount: number }>;
  avgCheck: number;
  debtorsCount?: number;
  totalDebt?: number;
  onCheckClick: (id: string) => void;
  onNavigate: (t: string) => void;
  onShowAllChecks: () => void;
}) {
  const totalPayments = Object.values(paymentBreakdown).reduce((s, p) => s + (typeof p.amount === 'number' ? p.amount : 0), 0);

  return (
    <div className="space-y-4">
      <div className="w-full p-4 rounded-2xl bg-gradient-to-br from-[rgba(var(--c-accent-rgb),0.12)] to-transparent border border-[var(--c-border)]">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[var(--c-hint)] font-semibold uppercase">Выручка</span>
          {revenueDelta !== undefined && revenueDelta !== 0 && (
            <span className={`text-[11px] font-bold ${revenueDelta > 0 ? 'text-[var(--c-success)]' : 'text-[var(--c-danger)]'}`}>
              {revenueDelta > 0 ? '↑' : '↓'}{Math.abs(revenueDelta)}%
            </span>
          )}
        </div>
        <p className="text-2xl font-black text-[var(--c-text)] tabular-nums mt-0.5">{fmtCur(revenue)}</p>
        <p className="text-[10px] text-[var(--c-muted)] mt-1">{checks.length} чеков · ср. {fmtCur(avgCheck)}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'Чеков', value: checks.length, onClick: () => {} },
          { label: 'Ср. чек', value: fmtCur(avgCheck), onClick: () => {} },
        ].map((s) => (
          <div key={s.label} className="p-3 rounded-xl card text-center">
            <p className="text-lg font-black text-[var(--c-text)] tabular-nums">{s.value}</p>
            <p className="text-[9px] text-[var(--c-muted)]">{s.label}</p>
          </div>
        ))}
      </div>

      {debtorsCount !== undefined && debtorsCount > 0 && (
        <button
          onClick={() => onNavigate('management:debtors')}
          className="w-full flex items-center justify-between p-3 rounded-xl card-interactive border-l-4 border-l-[var(--c-danger)]"
        >
          <span className="text-sm font-medium text-[var(--c-text)]">Должники</span>
          <span className="text-sm font-bold text-[var(--c-danger)] tabular-nums">{fmtCur(totalDebt || 0)}</span>
        </button>
      )}

      <div>
        <p className="text-[10px] font-semibold text-[var(--c-hint)] uppercase tracking-wider mb-2">Платежи</p>
        <div className="space-y-2">
          {([
            { key: 'cash', label: 'Наличные', color: 'bg-emerald-500' },
            { key: 'card', label: 'Карта', color: 'bg-sky-500' },
            { key: 'debt', label: 'Долг', color: 'bg-red-500' },
            { key: 'bonus', label: 'Бонусы', color: 'bg-amber-500' },
            { key: 'deposit', label: 'Депозит', color: 'bg-cyan-500' },
          ] as const).filter((pm) => (paymentBreakdown[pm.key]?.amount ?? 0) > 0).map((pm) => {
            const amt = paymentBreakdown[pm.key]?.amount ?? 0;
            const pct = totalPayments > 0 ? (amt / totalPayments) * 100 : 0;
            return (
              <button
                key={pm.key}
                onClick={() => onNavigate('management:cash')}
                className="w-full flex items-center gap-3 p-2 rounded-xl card-interactive text-left"
              >
                <span className="text-xs text-[var(--c-hint)] w-16 shrink-0">{pm.label}</span>
                <div className="flex-1 h-1.5 rounded-full bg-[var(--c-surface)] overflow-hidden">
                  <div className={`h-full rounded-full ${pm.color} transition-all`} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs font-bold text-[var(--c-text)] w-20 text-right tabular-nums">{fmtCur(amt)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="text-[10px] font-semibold text-[var(--c-hint)] uppercase tracking-wider mb-2">Последние чеки</p>
        <div className="space-y-1.5">
          {checks.slice(0, 5).map((c) => (
            <button
              key={c.id}
              onClick={() => onCheckClick(c.id)}
              className="w-full flex items-center justify-between p-2.5 rounded-xl card-interactive text-left"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium text-sm text-[var(--c-text)] truncate">
                  {(c as { player_nickname?: string }).player_nickname || (c as { player?: { nickname: string } }).player?.nickname || 'Гость'}
                </span>
                <span className="text-[10px] text-[var(--c-hint)] shrink-0">
                  {new Date(c.closed_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <span className="font-bold text-sm text-[var(--c-accent)] tabular-nums shrink-0">{fmtCur(c.total_amount)}</span>
            </button>
          ))}
          {checks.length > 5 && (
            <button
              onClick={onShowAllChecks}
              className="w-full py-2 text-center text-xs text-[var(--c-accent)] font-medium active:opacity-80"
            >
              Все чеки ({checks.length}) →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ChecksTab({
  checks,
  paymentBreakdown,
  onCheckClick,
  checkPaymentsMap,
}: {
  checks: { id: string; player_nickname?: string; total_amount: number; payment_method: string | null; bonus_used?: number; closed_at: string; player?: { nickname: string } | null }[];
  paymentBreakdown: Record<string, { count?: number; amount: number }>;
  onCheckClick: (id: string) => void;
  checkPaymentsMap: Record<string, { method: string; amount: number }[]>;
}) {
  const fmtTime = (d: string) => new Date(d).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  if (checks.length === 0) {
    return (
      <div className="text-center py-16">
        <Receipt className="w-16 h-16 text-[var(--c-muted)] mx-auto mb-4" />
        <p className="text-sm text-[var(--c-hint)]">Нет чеков за выбранный период</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {checks.map((c) => {
        const nick = (c as { player_nickname?: string }).player_nickname || (c as { player?: { nickname: string } }).player?.nickname || 'Гость';
        const origTotal = c.total_amount + (c.bonus_used || 0);
        return (
          <button
            key={c.id}
            onClick={() => onCheckClick(c.id)}
            className="w-full flex items-center justify-between p-3 rounded-xl card-interactive text-left active:scale-[0.99]"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="font-medium text-sm text-[var(--c-text)] truncate">{nick}</span>
              <span className="text-[10px] text-[var(--c-hint)] shrink-0">{fmtTime(c.closed_at)}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {c.payment_method && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  c.payment_method === 'cash' ? 'bg-[var(--c-success-bg)] text-[var(--c-success)]' :
                  c.payment_method === 'card' ? 'bg-[var(--c-info-bg)] text-[var(--c-info)]' :
                  c.payment_method === 'debt' ? 'bg-[var(--c-danger-bg)] text-[var(--c-danger)]' :
                  'bg-[var(--c-warning-bg)] text-[var(--c-warning)]'
                }`}>
                  {pmLabels[c.payment_method] || c.payment_method}
                </span>
              )}
              <span className="font-bold text-sm text-[var(--c-accent)] tabular-nums">{fmtCur(c.bonus_used ? origTotal : c.total_amount)}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function TopsTab({
  products,
  players,
  itemsSold,
  playerBreakdown,
  reportMode,
  onCheckClick,
  checks,
  allCheckItems,
}: {
  products: { id: string; name: string; category: string; revenue: number; qty: number; abcGroup: string }[];
  players: { id: string; nickname: string; total: number; count: number; avgCheck: number; segment: string }[];
  itemsSold: { name: string; category: string; quantity: number; revenue: number }[];
  playerBreakdown: { nickname: string; checks: number; total: number }[];
  reportMode: ReportMode;
  onCheckClick: (id: string) => void;
  checks: { id: string; player_id: string; total_amount: number; closed_at: string }[];
  allCheckItems: { item_id: string; check_id: string; quantity: number; price_at_time: number; item: { name: string; category: string } | null }[];
}) {
  const [topFilter, setTopFilter] = useState<'products' | 'players'>('products');
  const [sortBy, setSortBy] = useState<'revenue' | 'qty'>('revenue');

  const displayProducts = reportMode === 'shift' ? itemsSold : products;
  const displayPlayers = reportMode === 'shift' ? playerBreakdown : players;

  const sortedProducts = useMemo(() => {
    type P = { name: string; category: string; revenue: number; qty: number };
    const list: P[] = displayProducts.map((p) => ({
      name: (p as { name: string }).name,
      category: (p as { category: string }).category || '',
      revenue: ((p as { revenue?: number }).revenue) ?? 0,
      qty: ((p as { qty?: number }).qty) ?? ((p as { quantity?: number }).quantity) ?? 0,
    }));
    return sortBy === 'revenue'
      ? list.sort((a, b) => b.revenue - a.revenue)
      : list.sort((a, b) => b.qty - a.qty);
  }, [displayProducts, sortBy]);

  const categoryLabels: Record<string, string> = {
    drinks: 'Напитки', food: 'Еда', bar: 'Снеки', hookah: 'Кальяны', services: 'Услуги',
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-1 p-1 rounded-xl bg-[var(--c-surface)]">
        <button
          onClick={() => setTopFilter('products')}
          className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
            topFilter === 'products' ? 'bg-[var(--c-accent)] text-[var(--c-accent-text)]' : 'text-[var(--c-hint)]'
          }`}
        >
          <ShoppingBag className="w-3.5 h-3.5" />
          Товары
        </button>
        <button
          onClick={() => setTopFilter('players')}
          className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
            topFilter === 'players' ? 'bg-[var(--c-accent)] text-[var(--c-accent-text)]' : 'text-[var(--c-hint)]'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          Клиенты
        </button>
      </div>

      {topFilter === 'products' && (
        <>
          <div className="flex gap-1">
            <button
              onClick={() => setSortBy('revenue')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium ${sortBy === 'revenue' ? 'bg-[var(--c-accent)] text-[var(--c-accent-text)]' : 'bg-[var(--c-surface)] text-[var(--c-hint)]'}`}
            >
              По выручке
            </button>
            <button
              onClick={() => setSortBy('qty')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium ${sortBy === 'qty' ? 'bg-[var(--c-accent)] text-[var(--c-accent-text)]' : 'bg-[var(--c-surface)] text-[var(--c-hint)]'}`}
            >
              По кол-ву
            </button>
          </div>
          <div className="space-y-1.5">
            {sortedProducts.slice(0, 10).map((p, i) => (
              <div
                key={String(p.name) + i}
                className="flex items-center gap-2.5 p-2.5 rounded-xl card"
              >
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  i === 0 ? 'bg-[var(--c-warning-bg)] text-[var(--c-warning)]' : 'bg-[var(--c-surface)] text-[var(--c-hint)]'
                }`}>
                  {i === 0 ? <Crown className="w-3 h-3" /> : i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--c-text)] truncate">{p.name}</p>
                  <p className="text-[10px] text-[var(--c-muted)]">{categoryLabels[p.category] || p.category}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-[var(--c-text)] tabular-nums">{fmtCur(p.revenue)}</p>
                  <p className="text-[10px] text-[var(--c-hint)]">{p.qty} шт</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {topFilter === 'players' && (
        <div className="space-y-1.5">
          {displayPlayers.slice(0, 10).map((p, i) => (
            <div key={p.nickname + i} className="flex items-center gap-2.5 p-2.5 rounded-xl card">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                i === 0 ? 'bg-[var(--c-warning-bg)] text-[var(--c-warning)]' : 'bg-[var(--c-surface)] text-[var(--c-hint)]'
              }`}>
                {i === 0 ? <Crown className="w-3 h-3" /> : i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--c-text)] truncate">{p.nickname}</p>
                <p className="text-[10px] text-[var(--c-muted)]">{p.checks || (p as { count?: number }).count || 0} чеков</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-[var(--c-text)] tabular-nums">{fmtCur(p.total)}</p>
                {'avgCheck' in p && p.avgCheck > 0 && (
                  <p className="text-[10px] text-[var(--c-hint)]">ср. {fmtCur(p.avgCheck)}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
