import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useShiftStore } from '@/store/shift';
import { useSwipe } from '@/hooks/useSwipe';
import { Badge } from '@/components/ui/Badge';
import {
  TrendingUp, Users, AlertCircle, Clock, Receipt,
  Banknote, CreditCard, HandCoins, ShoppingBag,
  Crown, BarChart3, CalendarDays, Hash,
  ChevronDown, ChevronLeft, ChevronRight, Star,
} from 'lucide-react';
import type { Transaction, Profile, Shift } from '@/types';
import type { ShiftAnalytics as SA } from '@/store/shift';

interface ClosedCheck {
  id: string;
  total_amount: number;
  payment_method: string | null;
  closed_at: string;
  player_id: string;
  player: { nickname: string } | null;
}

interface CheckItemStat {
  item_id: string;
  quantity: number;
  price_at_time: number;
  item: { name: string; category: string } | null;
}

interface DailyRevenue {
  date: string;
  label: string;
  total: number;
  count: number;
}

type TabId = 'overview' | 'checks' | 'items' | 'players' | 'log';

const pmLabels: Record<string, string> = {
  cash: 'Наличные', card: 'Карта', debt: 'Долг', bonus: 'Бонусы', split: 'Разделённая',
};

export function DashboardPage() {
  const [tab, setTab] = useState<TabId>('overview');
  const [checks, setChecks] = useState<ClosedCheck[]>([]);
  const [checkItemStats, setCheckItemStats] = useState<CheckItemStat[]>([]);
  const [debtors, setDebtors] = useState<Profile[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txLimit, setTxLimit] = useState(50);
  const [isLoading, setIsLoading] = useState(true);

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [selectedShiftIdx, setSelectedShiftIdx] = useState(0);
  const [shiftAnalytics, setShiftAnalytics] = useState<SA | null>(null);
  const [shiftsLoading, setShiftsLoading] = useState(false);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [expandedCheckId, setExpandedCheckId] = useState<string | null>(null);
  const { getShiftAnalytics } = useShiftStore();

  useEffect(() => {
    loadAll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab === 'log') loadTransactions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, txLimit]);

  useEffect(() => {
    if (tab === 'checks' && shifts.length === 0) loadShifts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const loadShifts = useCallback(async () => {
    setShiftsLoading(true);
    const { data } = await supabase
      .from('shifts')
      .select('*')
      .eq('status', 'closed')
      .order('closed_at', { ascending: false })
      .limit(100);
    if (data && data.length > 0) {
      setShifts(data as Shift[]);
      setSelectedShiftIdx(0);
    }
    setShiftsLoading(false);
  }, []);

  useEffect(() => {
    if (shifts.length > 0 && tab === 'checks') {
      loadShiftAnalytics(shifts[selectedShiftIdx].id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedShiftIdx, shifts]);

  const loadShiftAnalytics = async (shiftId: string) => {
    setAnalyticsLoading(true);
    setExpandedCheckId(null);
    const data = await getShiftAnalytics(shiftId);
    setShiftAnalytics(data);
    setAnalyticsLoading(false);
  };

  const loadAll = async () => {
    setIsLoading(true);
    await Promise.all([loadChecks(), loadCheckItems(), loadDebtors()]);
    setIsLoading(false);
  };

  const loadChecks = async () => {
    const { data } = await supabase
      .from('checks')
      .select('id, total_amount, payment_method, closed_at, player_id, player:profiles!checks_player_id_fkey(nickname)')
      .eq('status', 'closed')
      .order('closed_at', { ascending: false });
    if (data) {
      setChecks(data.map((c) => ({
        ...c,
        player: Array.isArray(c.player) ? c.player[0] : c.player,
      })) as ClosedCheck[]);
    }
  };

  const loadCheckItems = async () => {
    const { data } = await supabase
      .from('check_items')
      .select('item_id, quantity, price_at_time, item:inventory(name, category)');
    if (data) {
      setCheckItemStats(data.map((ci) => ({
        ...ci,
        item: Array.isArray(ci.item) ? ci.item[0] : ci.item,
      })) as CheckItemStat[]);
    }
  };

  const loadDebtors = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .lt('balance', 0)
      .order('balance', { ascending: true });
    if (data) setDebtors(data as Profile[]);
  };

  const loadTransactions = async () => {
    const { data } = await supabase
      .from('transactions')
      .select('*, creator:profiles!transactions_created_by_fkey(nickname), player:profiles!transactions_player_id_fkey(nickname)')
      .order('created_at', { ascending: false })
      .limit(txLimit);
    if (data) {
      setTransactions(data.map((t) => ({
        ...t,
        creator: Array.isArray(t.creator) ? t.creator[0] : t.creator,
        player: Array.isArray(t.player) ? t.player[0] : t.player,
      })) as Transaction[]);
    }
  };

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(now.getTime() - 7 * 86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const stats = useMemo(() => {
    let today = 0, week = 0, month = 0, prevMonth = 0;
    let todayCount = 0, weekCount = 0, monthCount = 0;
    let cash = 0, card = 0, debt = 0;

    for (const c of checks) {
      const amt = c.total_amount || 0;
      const d = new Date(c.closed_at);

      if (d >= monthStart) {
        month += amt; monthCount++;
        if (d >= weekStart) { week += amt; weekCount++; }
        if (d >= todayStart) { today += amt; todayCount++; }
      } else if (d >= prevMonthStart) {
        prevMonth += amt;
      }

      if (c.payment_method === 'cash') cash += amt;
      else if (c.payment_method === 'card') card += amt;
      else if (c.payment_method === 'debt') debt += amt;
    }

    const avgCheck = monthCount > 0 ? Math.round(month / monthCount) : 0;
    const monthGrowth = prevMonth > 0 ? Math.round(((month - prevMonth) / prevMonth) * 100) : 0;
    const totalPayments = cash + card + debt;

    return {
      today, week, month, prevMonth, monthGrowth,
      todayCount, weekCount, monthCount,
      cash, card, debt, avgCheck, totalPayments,
    };
  }, [checks]);

  const dailyRevenue = useMemo((): DailyRevenue[] => {
    const days: Record<string, DailyRevenue> = {};
    const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      days[key] = {
        date: key,
        label: i === 0 ? 'Сег' : i === 1 ? 'Вч' : dayNames[d.getDay()],
        total: 0,
        count: 0,
      };
    }

    for (const c of checks) {
      if (!c.closed_at) continue;
      const key = c.closed_at.slice(0, 10);
      if (days[key]) {
        days[key].total += c.total_amount || 0;
        days[key].count++;
      }
    }

    return Object.values(days);
  }, [checks]);

  const topItems = useMemo(() => {
    const map: Record<string, { name: string; category: string; qty: number; revenue: number }> = {};
    for (const ci of checkItemStats) {
      if (!ci.item) continue;
      const key = ci.item_id;
      if (!map[key]) map[key] = { name: ci.item.name, category: ci.item.category, qty: 0, revenue: 0 };
      map[key].qty += ci.quantity;
      map[key].revenue += ci.quantity * ci.price_at_time;
    }
    return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 15);
  }, [checkItemStats]);

  const categoryBreakdown = useMemo(() => {
    const map: Record<string, { label: string; revenue: number; count: number }> = {};
    const labels: Record<string, string> = {
      drinks: 'Напитки', food: 'Еда', bar: 'Снеки', hookah: 'Кальяны', services: 'Услуги',
    };
    for (const ci of checkItemStats) {
      if (!ci.item) continue;
      const cat = ci.item.category;
      if (!map[cat]) map[cat] = { label: labels[cat] || cat, revenue: 0, count: 0 };
      map[cat].revenue += ci.quantity * ci.price_at_time;
      map[cat].count += ci.quantity;
    }
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [checkItemStats]);

  const topPlayers = useMemo(() => {
    const map: Record<string, { nickname: string; total: number; count: number }> = {};
    for (const c of checks) {
      if (!c.player_id) continue;
      const nick = c.player?.nickname || 'Неизвестный';
      if (!map[c.player_id]) map[c.player_id] = { nickname: nick, total: 0, count: 0 };
      map[c.player_id].total += c.total_amount || 0;
      map[c.player_id].count++;
    }
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 15);
  }, [checks]);

  const peakHours = useMemo(() => {
    const hours = new Array(24).fill(0);
    for (const c of checks) {
      if (!c.closed_at) continue;
      const h = new Date(c.closed_at).getHours();
      hours[h] += c.total_amount || 0;
    }
    const relevantHours = hours.map((val, h) => ({ hour: h, val })).filter((h) => h.val > 0);
    return relevantHours;
  }, [checks]);

  const fmt = (n: number) =>
    new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n);

  const fmtCur = (n: number) => fmt(n) + '₽';

  const maxDaily = Math.max(...dailyRevenue.map((d) => d.total), 1);
  const maxPeak = Math.max(...peakHours.map((h) => h.val), 1);

  const tabs: { id: TabId; label: string; icon: typeof BarChart3 }[] = [
    { id: 'overview', label: 'Обзор', icon: BarChart3 },
    { id: 'checks', label: 'Чеки', icon: Receipt },
    { id: 'items', label: 'Товары', icon: ShoppingBag },
    { id: 'players', label: 'Игроки', icon: Users },
    { id: 'log', label: 'Лог', icon: Clock },
  ];

  const tabIdx = tabs.findIndex((t) => t.id === tab);
  const tabSwipe = useSwipe({
    onSwipeLeft: () => { if (tabIdx < tabs.length - 1) setTab(tabs[tabIdx + 1].id); },
    onSwipeRight: () => { if (tabIdx > 0) setTab(tabs[tabIdx - 1].id); },
    threshold: 50,
  });

  const selectedShift = shifts[selectedShiftIdx] || null;

  const [splitBreakdowns, setSplitBreakdowns] = useState<Record<string, { method: string; amount: number }[]>>({});

  useEffect(() => {
    if (!shiftAnalytics) return;
    const splitChecks = shiftAnalytics.checks.filter((c) => c.payment_method === 'split');
    if (splitChecks.length === 0) { setSplitBreakdowns({}); return; }

    (async () => {
      const ids = splitChecks.map((c) => c.id);
      const { data } = await supabase.from('check_payments').select('*').in('check_id', ids);
      const map: Record<string, { method: string; amount: number }[]> = {};
      for (const p of data || []) {
        if (!map[p.check_id]) map[p.check_id] = [];
        map[p.check_id].push({ method: p.method, amount: p.amount });
      }
      setSplitBreakdowns(map);
    })();
  }, [shiftAnalytics]);

  const shiftSummary = useMemo(() => {
    if (!shiftAnalytics) return null;
    let cash = 0, card = 0, debt = 0, bonus = 0;
    for (const c of shiftAnalytics.checks) {
      const amt = c.total_amount || 0;
      bonus += c.bonus_used || 0;
      if (c.payment_method === 'split') {
        const parts = splitBreakdowns[c.id] || [];
        for (const p of parts) {
          if (p.method === 'cash') cash += p.amount;
          else if (p.method === 'card') card += p.amount;
          else if (p.method === 'debt') debt += p.amount;
          else if (p.method === 'bonus') bonus += p.amount;
        }
      } else if (c.payment_method === 'cash') cash += amt;
      else if (c.payment_method === 'card') card += amt;
      else if (c.payment_method === 'debt') debt += amt;
      else if (c.payment_method === 'bonus') cash += amt;
    }
    const total = cash + card + debt + bonus;
    return { total, cash, card, debt, bonus };
  }, [shiftAnalytics, splitBreakdowns]);

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  const fmtTime = (d: string | null) =>
    d ? new Date(d).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '-';

  if (isLoading) {
    return (
      <div className="text-center py-20">
        <div className="w-8 h-8 border-2 border-[var(--tg-theme-button-color,#6c5ce7)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-[var(--tg-theme-hint-color,#888)]">Загрузка аналитики...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5" {...tabSwipe}>
      {/* Tab switcher */}
      <div className="flex gap-1 p-0.5 rounded-lg bg-white/3 overflow-x-auto scrollbar-none">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[11px] font-semibold transition-all whitespace-nowrap min-w-0 ${
              tab === t.id
                ? 'bg-[var(--tg-theme-button-color,#6c5ce7)] text-white shadow-sm'
                : 'text-white/30'
            }`}
          >
            <t.icon className="w-3 h-3 shrink-0" />
            {t.label}
          </button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {tab === 'overview' && (
        <div className="space-y-5">
          <div className="p-4 rounded-xl bg-gradient-to-br from-[var(--tg-theme-button-color,#6c5ce7)]/12 to-purple-900/5 card">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[11px] text-white/35 font-semibold">Выручка за месяц</span>
              {stats.monthGrowth !== 0 && (
                <Badge variant={stats.monthGrowth > 0 ? 'success' : 'danger'} size="sm">
                  {stats.monthGrowth > 0 ? '+' : ''}{stats.monthGrowth}%
                </Badge>
              )}
            </div>
            <p className="text-2xl font-black text-[var(--tg-theme-text-color,#e0e0e0)] tabular-nums">{fmtCur(stats.month)}</p>
            <p className="text-[10px] text-white/20 mt-0.5">{stats.monthCount} чеков · средний {fmtCur(stats.avgCheck)}</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Сегодня', value: stats.today, sub: `${stats.todayCount} чек.`, icon: CalendarDays, color: 'text-emerald-400' },
              { label: 'Неделя', value: stats.week, sub: `${stats.weekCount} чек.`, icon: TrendingUp, color: 'text-blue-400' },
              { label: 'Ср. чек', value: stats.avgCheck, sub: 'за месяц', icon: Receipt, color: 'text-amber-400' },
              { label: 'Должники', value: debtors.reduce((s, d) => s + Math.abs(d.balance), 0), sub: `${debtors.length} чел.`, icon: AlertCircle, color: 'text-red-400' },
            ].map((s) => (
              <div key={s.label} className="p-2.5 rounded-xl card flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white/4 flex items-center justify-center shrink-0">
                  <s.icon className={`w-4 h-4 ${s.color}`} />
                </div>
                <div>
                  <p className="text-sm font-black text-[var(--tg-theme-text-color,#e0e0e0)] tabular-nums leading-tight">{fmtCur(s.value)}</p>
                  <p className="text-[9px] text-white/20">{s.sub}</p>
                </div>
              </div>
            ))}
          </div>

          <div>
            <h3 className="text-[11px] font-semibold text-white/30 uppercase tracking-wider mb-2">Выручка за 7 дней</h3>
            <div className="flex items-end gap-1 h-28">
              {dailyRevenue.map((day) => (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[9px] text-white/30 font-medium">
                    {day.total > 0 ? fmt(day.total) : ''}
                  </span>
                  <div className="w-full flex-1 flex items-end">
                    <div
                      className="w-full rounded-t-md bg-[var(--tg-theme-button-color,#6c5ce7)] transition-all duration-500 min-h-[2px]"
                      style={{ height: `${Math.max(2, (day.total / maxDaily) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-white/40 font-semibold">{day.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-[11px] font-semibold text-white/30 uppercase tracking-wider mb-2">Способы оплаты</h3>
            <div className="space-y-2.5">
              {[
                { label: 'Наличные', value: stats.cash, icon: Banknote, color: 'bg-emerald-500' },
                { label: 'Карта', value: stats.card, icon: CreditCard, color: 'bg-sky-500' },
                { label: 'В долг', value: stats.debt, icon: HandCoins, color: 'bg-red-500' },
              ].map((pm) => {
                const pct = stats.totalPayments > 0 ? (pm.value / stats.totalPayments) * 100 : 0;
                return (
                  <div key={pm.label} className="flex items-center gap-3">
                    <pm.icon className="w-4 h-4 text-white/40 shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-white/60">{pm.label}</span>
                        <span className="text-xs font-bold text-[var(--tg-theme-text-color,#e0e0e0)]">
                          {fmtCur(pm.value)} <span className="text-white/30 font-normal">({Math.round(pct)}%)</span>
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <div className={`h-full rounded-full ${pm.color} transition-all duration-700`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {peakHours.length > 0 && (
            <div>
              <h3 className="text-[11px] font-semibold text-white/30 uppercase tracking-wider mb-2">Популярные часы</h3>
              <div className="flex items-end gap-px h-20">
                {peakHours.map((h) => (
                  <div key={h.hour} className="flex-1 flex flex-col items-center gap-0.5">
                    <div className="w-full flex-1 flex items-end">
                      <div
                        className="w-full rounded-t-sm bg-amber-500/60 min-h-[2px]"
                        style={{ height: `${Math.max(2, (h.val / maxPeak) * 100)}%` }}
                      />
                    </div>
                    <span className="text-[8px] text-white/30">{h.hour}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {categoryBreakdown.length > 0 && (
            <div>
              <h3 className="text-[11px] font-semibold text-white/30 uppercase tracking-wider mb-2">По категориям</h3>
              <div className="space-y-2">
                {categoryBreakdown.map((cat, i) => {
                  const maxRev = categoryBreakdown[0]?.revenue || 1;
                  const colors = ['bg-violet-500', 'bg-blue-500', 'bg-orange-500', 'bg-emerald-500', 'bg-pink-500'];
                  return (
                    <div key={cat.label} className="flex items-center gap-3">
                      <span className="text-xs text-white/50 w-16 shrink-0">{cat.label}</span>
                      <div className="flex-1 h-5 rounded-md bg-white/5 overflow-hidden">
                        <div
                          className={`h-full rounded-md ${colors[i % colors.length]} flex items-center px-2 transition-all duration-700`}
                          style={{ width: `${(cat.revenue / maxRev) * 100}%` }}
                        >
                          <span className="text-[10px] font-bold text-white whitespace-nowrap">{fmtCur(cat.revenue)}</span>
                        </div>
                      </div>
                      <span className="text-[10px] text-white/30 w-10 text-right">{cat.count} шт</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-4 h-4 text-red-400" />
              <h3 className="text-sm font-semibold text-[var(--tg-theme-text-color,#e0e0e0)]">
                Должники ({debtors.length})
              </h3>
              <span className="ml-auto text-xs font-bold text-red-400">
                {fmtCur(debtors.reduce((s, d) => s + Math.abs(d.balance), 0))}
              </span>
            </div>
            {debtors.length === 0 ? (
              <p className="text-xs text-[var(--tg-theme-hint-color,#888)] py-4 text-center">Нет должников</p>
            ) : (
              <div className="space-y-1.5">
                {debtors.map((d) => (
                  <div key={d.id} className="flex items-center justify-between p-3 rounded-xl bg-red-500/5 border border-red-500/10">
                    <span className="font-medium text-sm text-[var(--tg-theme-text-color,#e0e0e0)]">{d.nickname}</span>
                    <span className="font-bold text-sm text-red-400">{fmtCur(d.balance)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* CHECKS TAB */}
      {tab === 'checks' && (
        <div className="space-y-4">
          {shiftsLoading ? (
            <div className="text-center py-12">
              <div className="w-6 h-6 border-2 border-[var(--tg-theme-button-color,#6c5ce7)] border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          ) : shifts.length === 0 ? (
            <p className="text-sm text-[var(--tg-theme-hint-color,#888)] text-center py-12">Нет закрытых смен</p>
          ) : (
            <>
              {/* Shift selector */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedShiftIdx((i) => Math.min(i + 1, shifts.length - 1))}
                  disabled={selectedShiftIdx >= shifts.length - 1}
                  className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center disabled:opacity-20 active:scale-95 transition-all"
                >
                  <ChevronLeft className="w-4 h-4 text-[var(--tg-theme-text-color,#e0e0e0)]" />
                </button>
                <div className="flex-1 text-center">
                  {selectedShift && (
                    <>
                      <p className="text-sm font-bold text-[var(--tg-theme-text-color,#e0e0e0)]">
                        {fmtDate(selectedShift.opened_at)}
                      </p>
                      <p className="text-xs text-[var(--tg-theme-hint-color,#888)]">
                        {fmtTime(selectedShift.opened_at)} — {fmtTime(selectedShift.closed_at)}
                      </p>
                    </>
                  )}
                </div>
                <button
                  onClick={() => setSelectedShiftIdx((i) => Math.max(i - 1, 0))}
                  disabled={selectedShiftIdx <= 0}
                  className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center disabled:opacity-20 active:scale-95 transition-all"
                >
                  <ChevronRight className="w-4 h-4 text-[var(--tg-theme-text-color,#e0e0e0)]" />
                </button>
              </div>

              {analyticsLoading ? (
                <div className="text-center py-10">
                  <div className="w-6 h-6 border-2 border-[var(--tg-theme-button-color,#6c5ce7)] border-t-transparent rounded-full animate-spin mx-auto" />
                </div>
              ) : shiftAnalytics ? (
                <>
                  {/* Summary bar */}
                  {shiftSummary && (
                    <div className="p-4 rounded-2xl bg-gradient-to-br from-[var(--tg-theme-button-color,#6c5ce7)]/15 to-emerald-500/5 border border-white/5">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs text-white/40">Итого за смену</span>
                        <span className="text-xl font-black text-[var(--tg-theme-text-color,#e0e0e0)]">
                          {fmtCur(shiftSummary.total)}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { label: 'Наличные', value: shiftSummary.cash, icon: Banknote, color: 'text-emerald-400' },
                          { label: 'Карта', value: shiftSummary.card, icon: CreditCard, color: 'text-blue-400' },
                          { label: 'В долг', value: shiftSummary.debt, icon: HandCoins, color: 'text-red-400' },
                          { label: 'Бонусы', value: shiftSummary.bonus, icon: Star, color: 'text-amber-400' },
                        ].filter((s) => s.value > 0).map((s) => (
                          <div key={s.label} className="flex items-center gap-2 p-2 rounded-lg bg-white/5">
                            <s.icon className={`w-3.5 h-3.5 ${s.color} shrink-0`} />
                            <span className="text-xs text-white/50">{s.label}</span>
                            <span className="ml-auto text-xs font-bold text-[var(--tg-theme-text-color,#e0e0e0)]">{fmtCur(s.value)}</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-white/25 mt-2 text-center">
                        {shiftAnalytics.totalChecks} чеков · ср. {fmtCur(shiftAnalytics.avgCheck)}
                      </p>
                    </div>
                  )}

                  {/* Check cards */}
                  <div className="space-y-2">
                    {shiftAnalytics.checks.length === 0 ? (
                      <p className="text-sm text-white/30 text-center py-8">Нет чеков за эту смену</p>
                    ) : (
                      shiftAnalytics.checks.map((c) => {
                        const isExpanded = expandedCheckId === c.id;
                        const originalTotal = c.total_amount + (c.bonus_used || 0);
                        return (
                          <button
                            key={c.id}
                            onClick={() => setExpandedCheckId(isExpanded ? null : c.id)}
                            className="w-full text-left p-2.5 rounded-xl card active:scale-[0.99] transition-transform"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="font-medium text-sm text-[var(--tg-theme-text-color,#e0e0e0)] truncate">
                                  {c.player_nickname}
                                </span>
                                <span className="text-[10px] text-white/30">{fmtTime(c.closed_at)}</span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {c.payment_method && (
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                                    c.payment_method === 'cash' ? 'bg-emerald-500/15 text-emerald-400' :
                                    c.payment_method === 'card' ? 'bg-blue-500/15 text-blue-400' :
                                    c.payment_method === 'debt' ? 'bg-red-500/15 text-red-400' :
                                    'bg-amber-500/15 text-amber-400'
                                  }`}>
                                    {pmLabels[c.payment_method] || c.payment_method}
                                  </span>
                                )}
                                <span className="font-bold text-sm text-[var(--tg-theme-button-color,#6c5ce7)]">
                                  {fmtCur(c.bonus_used > 0 ? originalTotal : c.total_amount)}
                                </span>
                                <ChevronDown className={`w-4 h-4 text-white/20 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="mt-3 pt-3 border-t border-white/5 space-y-1.5">
                                {c.items.map((item, idx) => (
                                  <div key={idx} className="flex justify-between text-xs">
                                    <span className="text-white/50">{item.name} × {item.quantity}</span>
                                    <span className="text-white/40">{fmtCur(item.quantity * item.price)}</span>
                                  </div>
                                ))}
                                <div className="pt-2 border-t border-white/5 space-y-1">
                                  <div className="flex justify-between text-xs">
                                    <span className="text-white/40">Сумма</span>
                                    <span className="font-semibold text-[var(--tg-theme-text-color,#e0e0e0)]">{fmtCur(originalTotal)}</span>
                                  </div>
                                  {c.bonus_used > 0 && (
                                    <>
                                      <div className="flex justify-between text-xs">
                                        <span className="text-amber-400/70">Оплачено бонусами</span>
                                        <span className="font-semibold text-amber-400">-{fmtCur(c.bonus_used)}</span>
                                      </div>
                                      <div className="flex justify-between text-xs">
                                        <span className="text-white/40">К оплате ({pmLabels[c.payment_method || ''] || ''})</span>
                                        <span className="font-semibold text-[var(--tg-theme-text-color,#e0e0e0)]">{fmtCur(c.total_amount)}</span>
                                      </div>
                                    </>
                                  )}
                                  {c.payment_method === 'split' && splitBreakdowns[c.id] ? (
                                    <div className="space-y-0.5">
                                      <span className="text-xs text-white/40">Разделённая оплата:</span>
                                      {splitBreakdowns[c.id].map((sp, si) => (
                                        <div key={si} className="flex justify-between text-xs pl-2">
                                          <span className="text-white/40">{pmLabels[sp.method] || sp.method}</span>
                                          <span className="text-[var(--tg-theme-text-color,#e0e0e0)]">{fmtCur(sp.amount)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="flex justify-between text-xs">
                                      <span className="text-white/40">Способ оплаты</span>
                                      <span className="text-[var(--tg-theme-text-color,#e0e0e0)]">{pmLabels[c.payment_method || ''] || c.payment_method || '-'}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </>
              ) : null}
            </>
          )}
        </div>
      )}

      {/* ITEMS TAB */}
      {tab === 'items' && (
        <div className="space-y-5">
          <h3 className="text-sm font-bold text-[var(--tg-theme-text-color,#e0e0e0)]">
            Топ товаров
          </h3>
          {topItems.length === 0 ? (
            <p className="text-sm text-[var(--tg-theme-hint-color,#888)] text-center py-10">Нет данных о продажах</p>
          ) : (
            <div className="space-y-2">
              {topItems.map((item, i) => {
                const maxRev = topItems[0]?.revenue || 1;
                return (
                  <div key={item.name} className="flex items-center gap-2.5 p-2.5 rounded-xl card">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      i === 0 ? 'bg-amber-500/20 text-amber-400' :
                      i === 1 ? 'bg-gray-400/20 text-gray-300' :
                      i === 2 ? 'bg-orange-700/20 text-orange-400' :
                      'bg-white/5 text-white/30'
                    }`}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--tg-theme-text-color,#e0e0e0)] truncate">{item.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[var(--tg-theme-button-color,#6c5ce7)] transition-all duration-500"
                            style={{ width: `${(item.revenue / maxRev) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-[var(--tg-theme-text-color,#e0e0e0)]">{fmtCur(item.revenue)}</p>
                      <p className="text-[10px] text-white/30">{item.qty} шт</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* PLAYERS TAB */}
      {tab === 'players' && (
        <div className="space-y-5">
          <h3 className="text-sm font-bold text-[var(--tg-theme-text-color,#e0e0e0)]">
            Топ игроков
          </h3>
          {topPlayers.length === 0 ? (
            <p className="text-sm text-[var(--tg-theme-hint-color,#888)] text-center py-10">Нет данных</p>
          ) : (
            <div className="space-y-2">
              {topPlayers.map((player, i) => {
                const maxTotal = topPlayers[0]?.total || 1;
                return (
                  <div key={player.nickname + i} className="flex items-center gap-2.5 p-2.5 rounded-xl card">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      i === 0 ? 'bg-amber-500/20 text-amber-400' :
                      i === 1 ? 'bg-gray-400/20 text-gray-300' :
                      i === 2 ? 'bg-orange-700/20 text-orange-400' :
                      'bg-white/5 text-white/30'
                    }`}>
                      {i === 0 ? <Crown className="w-3 h-3" /> : i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--tg-theme-text-color,#e0e0e0)] truncate">{player.nickname}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-amber-500 transition-all duration-500"
                            style={{ width: `${(player.total / maxTotal) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-[var(--tg-theme-text-color,#e0e0e0)]">{fmtCur(player.total)}</p>
                      <div className="flex items-center gap-1 justify-end">
                        <Hash className="w-2.5 h-2.5 text-white/20" />
                        <p className="text-[10px] text-white/30">{player.count} чек.</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* LOG TAB */}
      {tab === 'log' && (
        <div className="space-y-3">
          {transactions.length === 0 ? (
            <p className="text-sm text-[var(--tg-theme-hint-color,#888)] text-center py-10">Нет транзакций</p>
          ) : (
            <>
              {transactions.map((tx) => {
                const typeMap: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'default' }> = {
                  sale: { label: 'Продажа', variant: 'success' },
                  supply: { label: 'Поставка', variant: 'default' },
                  write_off: { label: 'Списание', variant: 'danger' },
                  revision: { label: 'Ревизия', variant: 'warning' },
                  bonus_accrual: { label: 'Бонус+', variant: 'success' },
                  bonus_spend: { label: 'Бонус−', variant: 'warning' },
                  cash_operation: { label: 'Касса', variant: 'default' },
                  debt_adjustment: { label: 'Долг', variant: 'warning' },
                };
                const meta = typeMap[tx.type] || { label: tx.type, variant: 'default' as const };
                return (
                  <div key={tx.id} className="flex items-start gap-2.5 p-2.5 rounded-xl card">
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[var(--tg-theme-text-color,#e0e0e0)] truncate">{tx.description}</p>
                      <p className="text-[10px] text-[var(--tg-theme-hint-color,#888)] mt-0.5">
                        {tx.creator?.nickname || '—'} · {new Date(tx.created_at).toLocaleString('ru-RU')}
                      </p>
                    </div>
                    <span className="font-bold text-sm text-[var(--tg-theme-text-color,#e0e0e0)] whitespace-nowrap">
                      {fmtCur(tx.amount)}
                    </span>
                  </div>
                );
              })}
              {transactions.length >= txLimit && (
                <button
                  onClick={() => setTxLimit((l) => l + 50)}
                  className="w-full py-2.5 text-sm text-[var(--tg-theme-link-color,#6c5ce7)] hover:bg-white/5 rounded-xl transition-colors font-medium"
                >
                  Загрузить ещё
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
