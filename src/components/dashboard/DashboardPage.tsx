import { useState, useMemo, useCallback, useEffect } from 'react';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { TabSwitcher } from '@/components/ui/TabSwitcher';
import { AnalyticsFilter } from './AnalyticsFilter';
import { FinanceModule } from './FinanceModule';
import { ProductsModule } from './ProductsModule';
import { PlayersModule } from './PlayersModule';
import { AiReport } from './AiReport';
import { useAnalyticsData } from '@/hooks/useAnalyticsData';
import { useAnalyticsStore, getReportingDayStart } from '@/store/analytics';
import { useAuthStore } from '@/store/auth';
import { supabase } from '@/lib/supabase';
import {
  BarChart3, ShoppingBag, Users, Sparkles,
  ChevronDown, ChevronRight, ChevronLeft,
  Banknote, CreditCard, HandCoins, Star, RotateCcw,
} from 'lucide-react';

import { REPORT_DAY_HOUR } from '@/lib/report-config';

type TabId = 'finance' | 'checks' | 'products' | 'players' | 'ai';

const pmLabels: Record<string, string> = {
  cash: 'Наличные', card: 'Карта', debt: 'Долг', bonus: 'Бонусы', deposit: 'Депозит', split: 'Разделённая',
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
  refundsByCheckId: Map<string, number>;
}

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const nav = (target: string) => onNavigate?.(target);
  const [tab, setTab] = useState<TabId>('finance');
  const [analyticsSubTab, setAnalyticsSubTab] = useState<'products' | 'players'>('products');
  const data = useAnalyticsData();
  const preset = useAnalyticsStore((s) => s.preset);
  const authUser = useAuthStore((s) => s.user);

  const tabs: { id: TabId; label: string; icon: typeof BarChart3 }[] = [
    { id: 'finance', label: 'Обзор', icon: BarChart3 },
    { id: 'products', label: 'Аналитика', icon: ShoppingBag },
    { id: 'ai', label: 'ИИ', icon: Sparkles },
  ];

  const avgCheck = data.checks.length > 0 ? Math.round(data.revenue / data.checks.length) : 0;

  const revenueDelta = data.prevRevenue > 0
    ? Math.round(((data.revenue - data.prevRevenue) / Math.abs(data.prevRevenue)) * 100)
    : (data.revenue > 0 ? 100 : 0);

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
    topProducts: data.productStats.slice(0, 10).map((p) => ({
      name: p.name, revenue: p.revenue, qty: p.qty, abcGroup: p.abcGroup,
    })),
    topPlayers: data.playerStats.slice(0, 10).map((p) => ({
      nickname: p.nickname, total: p.total, count: p.count, segment: p.segment,
    })),
    paymentBreakdown: data.paymentBreakdown,
    period: preset,
  }), [data, avgCheck, preset, revenueDelta, playerSegments]);

  if (data.isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="flex gap-1 p-0.5 rounded-lg bg-[var(--c-surface)]">
          {[1, 2, 3].map((i) => <div key={i} className="flex-1 h-10 rounded-md bg-[var(--c-surface)]" />)}
        </div>
        <ListSkeleton rows={6} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tab switcher — 3 large tabs */}
      <TabSwitcher
        tabs={tabs.map((t) => ({ id: t.id, label: t.label, icon: <t.icon className="w-4 h-4 shrink-0" /> }))}
        activeId={tab}
        onChange={(id) => setTab(id as TabId)}
      />

      {/* Global filter — shown for non-AI tabs */}
      {tab !== 'ai' && (
        <AnalyticsFilter
          admins={data.admins}
          showSearch={tab === 'products'}
        />
      )}

      {/* Tab content */}
      {tab === 'finance' && (
        <>
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
            salaryPaidInPeriod={data.salaryPaidInPeriod}
            paymentBreakdown={data.paymentBreakdown}
            debtors={data.debtors}
            totalDebt={data.totalDebt}
            checkCount={data.checks.length}
            prevCheckCount={data.prevChecks.length}
            avgCheck={avgCheck}
            delta={data.delta}
            onNavigate={nav}
          />
          <div className="mt-4">
            <ChecksTab
              allChecks={data.allChecks}
            />
          </div>
        </>
      )}

      {tab === 'products' && (
        <>
          {/* Sub-toggle: products / players */}
          <TabSwitcher
            tabs={[
              { id: 'products', label: 'Товары', icon: <ShoppingBag className="w-3.5 h-3.5" /> },
              { id: 'players', label: 'Игроки', icon: <Users className="w-3.5 h-3.5" /> },
            ]}
            activeId={analyticsSubTab}
            onChange={(id) => setAnalyticsSubTab(id as 'products' | 'players')}
          />
          {analyticsSubTab === 'products' ? (
            <ProductsModule
              products={data.productStats}
              allCheckItems={data.allCheckItems as Parameters<typeof ProductsModule>[0]['allCheckItems']}
              checks={data.checks as Parameters<typeof ProductsModule>[0]['checks']}
              refundQtyByCheckItem={data.refundQtyByCheckItem}
            />
          ) : (
            <PlayersModule
              players={data.playerStats}
              retentionRate={data.retentionRate}
              checks={data.checks as Parameters<typeof PlayersModule>[0]['checks']}
              allCheckItems={data.allCheckItems as Parameters<typeof PlayersModule>[0]['allCheckItems']}
            />
          )}
        </>
      )}

      {tab === 'ai' && (
        <AiReport context={aiContext} userName={authUser?.nickname || 'Пользователь'} userTgId={authUser?.tg_id ?? null} />
      )}
    </div>
  );
}

/* ── Checks tab (preserved from original) ── */

function ChecksTab({ allChecks }: {
  allChecks: { id: string; total_amount: number; payment_method: string | null; closed_at: string; player_id: string; player: { nickname: string } | null }[];
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

    const refundsByCheckId = new Map<string, number>();
    const checkIdsList = dayChecks.map((c) => c.id);
    if (checkIdsList.length > 0) {
      const { data: refundsData } = await supabase
        .from('refunds')
        .select('total_amount, check_id')
        .in('check_id', checkIdsList);
      for (const r of refundsData || []) {
        totalRevenue -= r.total_amount || 0;
        refundsByCheckId.set(r.check_id, (refundsByCheckId.get(r.check_id) || 0) + (r.total_amount || 0));
      }
    }

    const totalChecks = dayChecks.length;
    const avgCheck = totalChecks > 0 ? Math.round(totalRevenue / totalChecks) : 0;
    setDayAnalytics({ checks: dayChecks, totalRevenue, totalChecks, avgCheck, refundsByCheckId });
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
        <button onClick={() => setSelectedDayIdx((i) => Math.min(i + 1, reportDays.length - 1))} disabled={selectedDayIdx >= reportDays.length - 1} className="min-w-[44px] min-h-[44px] rounded-xl bg-[var(--c-surface)] flex items-center justify-center disabled:opacity-20 active:scale-95 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--c-accent)]/20">
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
        <button onClick={() => setSelectedDayIdx((i) => Math.max(i - 1, 0))} disabled={selectedDayIdx <= 0} className="min-w-[44px] min-h-[44px] rounded-xl bg-[var(--c-surface)] flex items-center justify-center disabled:opacity-20 active:scale-95 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--c-accent)]/20">
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
                  <div key={s.label} className="flex items-center gap-2 p-2 rounded-lg bg-[var(--c-surface)] cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--c-accent)]/20">
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
              const refundAmt = dayAnalytics.refundsByCheckId?.get(c.id) ?? 0;
              const hasRefund = refundAmt > 0;
              const displayTotal = hasRefund ? origTotal - refundAmt : (c.bonus_used > 0 ? origTotal : c.total_amount);
              return (
                <button key={c.id} onClick={() => setExpandedCheckId(isExp ? null : c.id)} className="w-full text-left p-2.5 rounded-xl card active:scale-[0.99] transition-transform cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--c-accent)]/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="font-medium text-sm text-[var(--c-text)] truncate">{c.player_nickname}</span>
                      {hasRefund && (
                        <span className="flex items-center gap-0.5 shrink-0 text-xs px-1.5 py-0.5 rounded-md bg-[var(--c-warning-bg)] text-[var(--c-warning)] font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--c-accent)]/20">
                          <RotateCcw className="w-3 h-3" /> Возврат
                        </span>
                      )}
                      <span className="text-[10px] text-[var(--c-hint)]">{fmtTime(c.closed_at)}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {c.payment_method && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--c-accent)]/20 ${c.payment_method === 'cash' ? 'bg-[var(--c-success-bg)] text-[var(--c-success)]' :
                          c.payment_method === 'card' ? 'bg-[var(--c-info-bg)] text-[var(--c-info)]' :
                            c.payment_method === 'debt' ? 'bg-[var(--c-danger-bg)] text-[var(--c-danger)]' :
                              'bg-[var(--c-warning-bg)] text-[var(--c-warning)]'
                          }`}>
                          {pmLabels[c.payment_method] || c.payment_method}
                        </span>
                      )}
                      <span className="font-bold text-sm text-[var(--c-accent)]">{fmtCur(displayTotal)}</span>
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
                        {hasRefund && (
                          <div className="flex justify-between text-xs">
                            <span className="text-[var(--c-warning)]">Возврат</span>
                            <span className="font-semibold text-[var(--c-warning)]">−{fmtCur(refundAmt)}</span>
                          </div>
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
