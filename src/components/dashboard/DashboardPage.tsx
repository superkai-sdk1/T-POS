import { useState, useMemo, useCallback, useEffect } from 'react';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';
import { AnalyticsFilter } from './AnalyticsFilter';
import { FinanceModule } from './FinanceModule';
import { ProductsModule } from './ProductsModule';
import { PlayersModule } from './PlayersModule';
import { AiReport } from './AiReport';
import { useAnalyticsData } from '@/hooks/useAnalyticsData';
import { useAnalyticsStore, getReportingDayStart } from '@/store/analytics';
import { supabase } from '@/lib/supabase';
import {
  BarChart3, Receipt, ShoppingBag, Users, Clock, Sparkles,
  ChevronDown, ChevronRight, ChevronLeft,
  Banknote, CreditCard, HandCoins, Star,
} from 'lucide-react';

type TabId = 'finance' | 'checks' | 'products' | 'players' | 'ai';

const REPORT_DAY_HOUR = 10;

const pmLabels: Record<string, string> = {
  cash: 'Наличные', card: 'Карта', debt: 'Долг', bonus: 'Бонусы', split: 'Разделённая',
};

interface DashboardPageProps {
  onNavigate?: (target: string) => void;
}

interface ReportDay {
  start: Date;
  end: Date;
  label: string;
  checkCount: number;
}

interface ReportDayCheckDetail {
  id: string;
  player_nickname: string;
  total_amount: number;
  payment_method: string | null;
  bonus_used: number;
  closed_at: string;
  items: { name: string; quantity: number; price: number }[];
}

interface ReportDayAnalytics {
  checks: ReportDayCheckDetail[];
  totalRevenue: number;
  totalChecks: number;
  avgCheck: number;
}

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const nav = (target: string) => onNavigate?.(target);
  const [tab, setTab] = useState<TabId>('finance');
  const data = useAnalyticsData();
  const { preset } = useAnalyticsStore();

  const tabs: { id: TabId; label: string; icon: typeof BarChart3 }[] = [
    { id: 'finance', label: 'Финансы', icon: BarChart3 },
    { id: 'checks', label: 'Чеки', icon: Receipt },
    { id: 'products', label: 'Товары', icon: ShoppingBag },
    { id: 'players', label: 'Игроки', icon: Users },
    { id: 'ai', label: 'ИИ', icon: Sparkles },
  ];

  const avgCheck = data.checks.length > 0 ? Math.round(data.revenue / data.checks.length) : 0;

  const aiContext = useMemo(() => ({
    revenue: data.revenue,
    prevRevenue: data.prevRevenue,
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
    topProducts: data.productStats.slice(0, 10).map((p) => ({
      name: p.name, revenue: p.revenue, qty: p.qty, abcGroup: p.abcGroup,
    })),
    topPlayers: data.playerStats.slice(0, 10).map((p) => ({
      nickname: p.nickname, total: p.total, count: p.count, segment: p.segment,
    })),
    paymentBreakdown: data.paymentBreakdown,
    period: preset,
  }), [data, avgCheck, preset]);

  if (data.isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="flex gap-1 p-0.5 rounded-lg bg-[var(--c-surface)]">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="flex-1 h-8 rounded-md bg-[var(--c-surface)]" />)}
        </div>
        <ListSkeleton rows={6} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tab switcher */}
      <div className="flex gap-1 p-0.5 rounded-lg bg-[var(--c-surface)] overflow-x-auto scrollbar-none">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[11px] font-semibold transition-all whitespace-nowrap min-w-0 ${
              tab === t.id
                ? 'bg-[var(--c-accent)] text-white shadow-sm'
                : 'text-[var(--c-hint)]'
            }`}
          >
            <t.icon className="w-3 h-3 shrink-0" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Global filter */}
      <AnalyticsFilter
        admins={data.admins}
        showSearch={tab === 'products' || tab === 'players'}
      />

      {/* Tab content */}
      {tab === 'finance' && (
        <FinanceModule
          revenue={data.revenue}
          prevRevenue={data.prevRevenue}
          netProfit={data.netProfit}
          prevNetProfit={data.prevNetProfit}
          marginPct={data.marginPct}
          totalExpenses={data.totalExpenses}
          prevTotalExpenses={data.prevTotalExpenses}
          cogs={data.cogs}
          periodExpenses={data.periodExpenses}
          supplyCostInPeriod={data.supplyCostInPeriod}
          paymentBreakdown={data.paymentBreakdown}
          debtors={data.debtors}
          totalDebt={data.totalDebt}
          checkCount={data.checks.length}
          prevCheckCount={data.prevChecks.length}
          avgCheck={avgCheck}
          delta={data.delta}
          onNavigate={nav}
        />
      )}

      {tab === 'checks' && (
        <ChecksTab
          allChecks={data.allChecks}
          checkPaymentsMap={data.checkPaymentsMap}
        />
      )}

      {tab === 'products' && (
        <ProductsModule
          products={data.productStats}
          allCheckItems={data.allCheckItems as any}
          checks={data.checks as any}
        />
      )}

      {tab === 'players' && (
        <PlayersModule
          players={data.playerStats}
          retentionRate={data.retentionRate}
          checks={data.checks as any}
        />
      )}

      {tab === 'ai' && (
        <AiReport context={aiContext} />
      )}
    </div>
  );
}

/* ── Checks tab (preserved from original) ── */

function ChecksTab({ allChecks, checkPaymentsMap }: {
  allChecks: { id: string; total_amount: number; payment_method: string | null; closed_at: string; player_id: string; player: { nickname: string } | null }[];
  checkPaymentsMap: Record<string, { method: string; amount: number }[]>;
}) {
  const [reportDays, setReportDays] = useState<ReportDay[]>([]);
  const [selectedDayIdx, setSelectedDayIdx] = useState(0);
  const [dayAnalytics, setDayAnalytics] = useState<ReportDayAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [expandedCheckId, setExpandedCheckId] = useState<string | null>(null);
  const [splitBreakdowns, setSplitBreakdowns] = useState<Record<string, { method: string; amount: number }[]>>({});

  useEffect(() => {
    const dayMap = new Map<number, { start: Date; count: number }>();
    for (const c of allChecks) {
      if (!c.closed_at) continue;
      const start = getReportingDayStart(new Date(c.closed_at));
      const key = start.getTime();
      const existing = dayMap.get(key);
      if (existing) existing.count++;
      else dayMap.set(key, { start, count: 1 });
    }
    const days: ReportDay[] = Array.from(dayMap.values())
      .sort((a, b) => b.start.getTime() - a.start.getTime())
      .map((d) => ({
        start: d.start,
        end: new Date(d.start.getTime() + 86400000),
        label: d.start.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
        checkCount: d.count,
      }));
    setReportDays(days);
    setSelectedDayIdx(0);
  }, [allChecks]);

  const loadDayAnalytics = useCallback(async (day: ReportDay) => {
    setAnalyticsLoading(true);
    setExpandedCheckId(null);
    const { data: checksData } = await supabase
      .from('checks')
      .select('*, player:profiles!checks_player_id_fkey(nickname)')
      .eq('status', 'closed')
      .gte('closed_at', day.start.toISOString())
      .lt('closed_at', day.end.toISOString())
      .order('closed_at', { ascending: false });

    const dayChecks: ReportDayCheckDetail[] = [];
    let totalRevenue = 0;

    for (const c of checksData || []) {
      const player = Array.isArray(c.player) ? c.player[0] : c.player;
      const nickname = player?.nickname || 'Неизвестный';
      const { data: items } = await supabase
        .from('check_items')
        .select('quantity, price_at_time, item:inventory(name, category)')
        .eq('check_id', c.id);
      const checkItems = (items || []).map((ci: Record<string, unknown>) => {
        const item = Array.isArray(ci.item) ? ci.item[0] : ci.item;
        return { name: (item as Record<string, string>)?.name || '?', quantity: ci.quantity as number, price: ci.price_at_time as number };
      });
      dayChecks.push({
        id: c.id, player_nickname: nickname, total_amount: c.total_amount,
        payment_method: c.payment_method, bonus_used: c.bonus_used || 0,
        closed_at: c.closed_at, items: checkItems,
      });
      totalRevenue += c.total_amount;
    }

    const totalChecks = dayChecks.length;
    const avgCheck = totalChecks > 0 ? Math.round(totalRevenue / totalChecks) : 0;
    setDayAnalytics({ checks: dayChecks, totalRevenue, totalChecks, avgCheck });
    setAnalyticsLoading(false);
  }, []);

  useEffect(() => {
    if (reportDays.length > 0) loadDayAnalytics(reportDays[selectedDayIdx]);
  }, [selectedDayIdx, reportDays, loadDayAnalytics]);

  useEffect(() => {
    if (!dayAnalytics) return;
    const mixedChecks = dayAnalytics.checks.filter((c) => c.payment_method === 'split' || c.payment_method === 'bonus');
    if (mixedChecks.length === 0) { setSplitBreakdowns({}); return; }
    (async () => {
      const ids = mixedChecks.map((c) => c.id);
      const { data } = await supabase.from('check_payments').select('*').in('check_id', ids);
      const map: Record<string, { method: string; amount: number }[]> = {};
      for (const p of data || []) { if (!map[p.check_id]) map[p.check_id] = []; map[p.check_id].push({ method: p.method, amount: p.amount }); }
      setSplitBreakdowns(map);
    })();
  }, [dayAnalytics]);

  const daySummary = useMemo(() => {
    if (!dayAnalytics) return null;
    let cash = 0, card = 0, debt = 0, bonus = 0;
    for (const c of dayAnalytics.checks) {
      const amt = c.total_amount || 0;
      if (c.payment_method === 'split' || c.payment_method === 'bonus') {
        const parts = splitBreakdowns[c.id] || [];
        if (parts.length > 0) { for (const p of parts) { if (p.method === 'cash') cash += p.amount; else if (p.method === 'card') card += p.amount; else if (p.method === 'debt') debt += p.amount; else if (p.method === 'bonus') bonus += p.amount; } }
        else if (c.payment_method === 'bonus') bonus += c.bonus_used || 0;
        else cash += amt;
      } else {
        bonus += c.bonus_used || 0;
        if (c.payment_method === 'cash') cash += amt; else if (c.payment_method === 'card') card += amt; else if (c.payment_method === 'debt') debt += amt;
      }
    }
    return { total: cash + card + debt + bonus, cash, card, debt, bonus };
  }, [dayAnalytics, splitBreakdowns]);

  const fmt = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n);
  const fmtCur = (n: number) => fmt(n) + '₽';
  const fmtTime = (d: string | null) => d ? new Date(d).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '-';

  const selectedDay = reportDays[selectedDayIdx] || null;

  if (reportDays.length === 0) return <p className="text-sm text-[var(--c-hint)] text-center py-12">Нет закрытых чеков</p>;

  return (
    <div className="space-y-4">
      {/* Day selector */}
      <div className="flex items-center gap-2">
        <button onClick={() => setSelectedDayIdx((i) => Math.min(i + 1, reportDays.length - 1))} disabled={selectedDayIdx >= reportDays.length - 1} className="w-9 h-9 rounded-xl bg-[var(--c-surface)] flex items-center justify-center disabled:opacity-20 active:scale-95 transition-all">
          <ChevronLeft className="w-4 h-4 text-[var(--c-text)]" />
        </button>
        <div className="flex-1 text-center">
          {selectedDay && (
            <>
              <p className="text-sm font-bold text-[var(--c-text)]">{selectedDay.label}</p>
              <p className="text-xs text-[var(--c-hint)]">{selectedDay.checkCount} чеков · {REPORT_DAY_HOUR}:00 — {REPORT_DAY_HOUR}:00</p>
            </>
          )}
        </div>
        <button onClick={() => setSelectedDayIdx((i) => Math.max(i - 1, 0))} disabled={selectedDayIdx <= 0} className="w-9 h-9 rounded-xl bg-[var(--c-surface)] flex items-center justify-center disabled:opacity-20 active:scale-95 transition-all">
          <ChevronRight className="w-4 h-4 text-[var(--c-text)]" />
        </button>
      </div>

      {analyticsLoading ? <ListSkeleton rows={4} /> : dayAnalytics ? (
        <>
          {/* Summary */}
          {daySummary && (
            <div className="p-4 rounded-2xl bg-gradient-to-br from-[rgba(var(--c-accent-rgb),0.12)] to-transparent border border-[var(--c-border)]">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-[var(--c-hint)]">Итого за смену</span>
                <span className="text-xl font-black text-[var(--c-text)]">{fmtCur(daySummary.total)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { label: 'Наличные', value: daySummary.cash, icon: Banknote, color: 'text-[var(--c-success)]' },
                  { label: 'Карта', value: daySummary.card, icon: CreditCard, color: 'text-[var(--c-info)]' },
                  { label: 'В долг', value: daySummary.debt, icon: HandCoins, color: 'text-[var(--c-danger)]' },
                  { label: 'Бонусы', value: daySummary.bonus, icon: Star, color: 'text-[var(--c-warning)]' },
                ] as const).filter((s) => s.value > 0).map((s) => (
                  <div key={s.label} className="flex items-center gap-2 p-2 rounded-lg bg-[var(--c-surface)]">
                    <s.icon className={`w-3.5 h-3.5 ${s.color} shrink-0`} />
                    <span className="text-xs text-[var(--c-hint)]">{s.label}</span>
                    <span className="ml-auto text-xs font-bold text-[var(--c-text)]">{fmtCur(s.value)}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-[var(--c-muted)] mt-2 text-center">{dayAnalytics.totalChecks} чеков · ср. {fmtCur(dayAnalytics.avgCheck)}</p>
            </div>
          )}

          {/* Check cards */}
          <div className="space-y-2">
            {dayAnalytics.checks.length === 0 ? (
              <p className="text-sm text-[var(--c-hint)] text-center py-8">Нет чеков за эту смену</p>
            ) : dayAnalytics.checks.map((c) => {
              const isExp = expandedCheckId === c.id;
              const origTotal = c.total_amount + (c.bonus_used || 0);
              return (
                <button key={c.id} onClick={() => setExpandedCheckId(isExp ? null : c.id)} className="w-full text-left p-2.5 rounded-xl card active:scale-[0.99] transition-transform">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="font-medium text-sm text-[var(--c-text)] truncate">{c.player_nickname}</span>
                      <span className="text-[10px] text-[var(--c-hint)]">{fmtTime(c.closed_at)}</span>
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
                      <span className="font-bold text-sm text-[var(--c-accent)]">{fmtCur(c.bonus_used > 0 ? origTotal : c.total_amount)}</span>
                      <ChevronDown className={`w-4 h-4 text-[var(--c-muted)] transition-transform ${isExp ? 'rotate-180' : ''}`} />
                    </div>
                  </div>
                  {isExp && (
                    <div className="mt-3 pt-3 border-t border-[var(--c-border)] space-y-1.5">
                      {c.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-xs">
                          <span className="text-[var(--c-hint)]">{item.name} × {item.quantity}</span>
                          <span className="text-[var(--c-hint)]">{fmtCur(item.quantity * item.price)}</span>
                        </div>
                      ))}
                      <div className="pt-2 border-t border-[var(--c-border)] space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-[var(--c-hint)]">Сумма</span>
                          <span className="font-semibold text-[var(--c-text)]">{fmtCur(origTotal)}</span>
                        </div>
                        {c.bonus_used > 0 && (
                          <>
                            <div className="flex justify-between text-xs">
                              <span className="text-[var(--c-warning)]">Бонусами</span>
                              <span className="font-semibold text-[var(--c-warning)]">-{fmtCur(c.bonus_used)}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-[var(--c-hint)]">К оплате</span>
                              <span className="font-semibold text-[var(--c-text)]">{fmtCur(c.total_amount)}</span>
                            </div>
                          </>
                        )}
                        {c.payment_method === 'split' && splitBreakdowns[c.id] ? (
                          <div className="space-y-0.5">
                            <span className="text-xs text-[var(--c-hint)]">Разделённая оплата:</span>
                            {splitBreakdowns[c.id].map((sp, si) => (
                              <div key={si} className="flex justify-between text-xs pl-2">
                                <span className="text-[var(--c-hint)]">{pmLabels[sp.method] || sp.method}</span>
                                <span className="text-[var(--c-text)]">{fmtCur(sp.amount)}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex justify-between text-xs">
                            <span className="text-[var(--c-hint)]">Способ оплаты</span>
                            <span className="text-[var(--c-text)]">{pmLabels[c.payment_method || ''] || c.payment_method || '-'}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
