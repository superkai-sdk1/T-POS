import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAnalyticsStore } from '@/store/analytics';
import type { Profile, Supply, CashOperation } from '@/types';

interface ClosedCheck {
  id: string;
  total_amount: number;
  payment_method: string | null;
  closed_at: string;
  player_id: string;
  staff_id: string | null;
  player: { nickname: string } | null;
}

interface CheckItemStat {
  item_id: string;
  check_id: string;
  quantity: number;
  price_at_time: number;
  item: { name: string; category: string; price: number } | null;
}

export interface ProductStat {
  id: string;
  name: string;
  category: string;
  qty: number;
  revenue: number;
  cost: number;
  profit: number;
  abcGroup: 'A' | 'B' | 'C';
  buyers: Set<string>;
}

export interface PlayerStat {
  id: string;
  nickname: string;
  total: number;
  count: number;
  avgCheck: number;
  lastVisit: Date;
  firstVisit: Date;
  segment: 'new' | 'active' | 'sleeping';
  bonusBalance: number;
  tier: string;
}

export function useAnalyticsData() {
  const { range, prevRange, paymentFilter, adminFilter, search } = useAnalyticsStore();

  const [allChecks, setAllChecks] = useState<ClosedCheck[]>([]);
  const [allCheckItems, setAllCheckItems] = useState<CheckItemStat[]>([]);
  const [allRefunds, setAllRefunds] = useState<{ check_id: string; total_amount: number; created_at: string }[]>([]);
  const [allRefundItems, setAllRefundItems] = useState<{ item_id: string; quantity: number; check_id: string }[]>([]);
  const [debtors, setDebtors] = useState<Profile[]>([]);
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [cashOps, setCashOps] = useState<CashOperation[]>([]);
  const [opExpenses, setOpExpenses] = useState<{ amount: number; expense_date: string }[]>([]);
  const [itemCostMap, setItemCostMap] = useState<Record<string, number>>({});
  const [allPlayers, setAllPlayers] = useState<Profile[]>([]);
  const [admins, setAdmins] = useState<Pick<Profile, 'id' | 'nickname'>[]>([]);
  const [checkPaymentsMap, setCheckPaymentsMap] = useState<Record<string, { method: string; amount: number }[]>>({});
  const [salaryPayments, setSalaryPayments] = useState<{ amount: number; created_at: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    const [checksRes, itemsRes, debtorsRes, suppliesRes, cashRes, costsRes, expensesRes, playersRes, adminsRes, refundsRes, refundItemsRes, salaryRes] = await Promise.all([
      supabase.from('checks').select('id, total_amount, payment_method, closed_at, player_id, staff_id, player:profiles!checks_player_id_fkey(nickname)').eq('status', 'closed').order('closed_at', { ascending: false }),
      supabase.from('check_items').select('item_id, check_id, quantity, price_at_time, item:inventory(name, category, price)'),
      supabase.from('profiles').select('*').lt('balance', 0).order('balance', { ascending: true }),
      supabase.from('supplies').select('id, total_cost, created_at').order('created_at', { ascending: false }),
      supabase.from('cash_operations').select('id, type, amount, created_at').order('created_at', { ascending: false }),
      supabase.from('supply_items').select('item_id, cost_per_unit, quantity'),
      supabase.from('expenses').select('amount, expense_date').order('expense_date', { ascending: false }),
      supabase.from('profiles').select('*').eq('role', 'client').is('deleted_at', null),
      supabase.from('profiles').select('id, nickname').in('role', ['owner', 'staff']).is('deleted_at', null),
      supabase.from('refunds').select('check_id, total_amount, created_at').order('created_at', { ascending: false }),
      supabase.from('refund_items').select('item_id, quantity, refund:refunds!refund_items_refund_id_fkey(check_id)'),
      supabase.from('salary_payments').select('amount, created_at').order('created_at', { ascending: false }),
    ]);

    if (checksRes.data) {
      const mapped = checksRes.data.map((c: Record<string, unknown>) => ({
        ...c,
        player: Array.isArray(c.player) ? (c.player as Record<string, unknown>[])[0] : c.player,
      })) as ClosedCheck[];
      setAllChecks(mapped);

      const splitIds = mapped.filter((c) => c.payment_method === 'split' || c.payment_method === 'bonus').map((c) => c.id);
      if (splitIds.length > 0) {
        const { data: payments } = await supabase.from('check_payments').select('check_id, method, amount').in('check_id', splitIds);
        const map: Record<string, { method: string; amount: number }[]> = {};
        for (const p of payments || []) {
          if (!map[p.check_id]) map[p.check_id] = [];
          map[p.check_id].push({ method: p.method, amount: p.amount });
        }
        setCheckPaymentsMap(map);
      }
    }

    if (itemsRes.data) {
      setAllCheckItems(itemsRes.data.map((ci: Record<string, unknown>) => ({
        ...ci,
        item: Array.isArray(ci.item) ? (ci.item as Record<string, unknown>[])[0] : ci.item,
      })) as CheckItemStat[]);
    }

    if (debtorsRes.data) setDebtors(debtorsRes.data as Profile[]);
    if (suppliesRes.data) setSupplies(suppliesRes.data as Supply[]);
    if (cashRes.data) setCashOps(cashRes.data as CashOperation[]);
    if (expensesRes.data) setOpExpenses(expensesRes.data);
    if (playersRes.data) setAllPlayers(playersRes.data as Profile[]);
    if (adminsRes.data) setAdmins(adminsRes.data as Pick<Profile, 'id' | 'nickname'>[]);
    if (refundsRes.data) setAllRefunds(refundsRes.data as { check_id: string; total_amount: number; created_at: string }[]);
    if (salaryRes.data) setSalaryPayments(salaryRes.data as { amount: number; created_at: string }[]);
    if (refundItemsRes.data) {
      const items = (refundItemsRes.data as { item_id: string; quantity: number; refund: { check_id: string } | { check_id: string }[] }[]).flatMap((ri) => {
        const refund = Array.isArray(ri.refund) ? ri.refund[0] : ri.refund;
        if (!refund?.check_id) return [];
        return [{ item_id: ri.item_id, quantity: ri.quantity, check_id: refund.check_id }];
      });
      setAllRefundItems(items);
    }

    if (costsRes.data && costsRes.data.length > 0) {
      const agg: Record<string, { totalCost: number; totalQty: number }> = {};
      for (const si of costsRes.data) {
        if (!agg[si.item_id]) agg[si.item_id] = { totalCost: 0, totalQty: 0 };
        agg[si.item_id].totalCost += (si.cost_per_unit || 0) * (si.quantity || 0);
        agg[si.item_id].totalQty += si.quantity || 0;
      }
      const map: Record<string, number> = {};
      for (const [id, val] of Object.entries(agg)) {
        map[id] = val.totalQty > 0 ? val.totalCost / val.totalQty : 0;
      }
      setItemCostMap(map);
    }

    setIsLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const checks = useMemo(() => {
    let filtered = allChecks.filter((c) => {
      const d = new Date(c.closed_at);
      return d >= range.start && d < range.end;
    });
    if (paymentFilter) filtered = filtered.filter((c) => c.payment_method === paymentFilter);
    if (adminFilter) filtered = filtered.filter((c) => c.staff_id === adminFilter);
    return filtered;
  }, [allChecks, range, paymentFilter, adminFilter]);

  const prevChecks = useMemo(() => {
    let filtered = allChecks.filter((c) => {
      const d = new Date(c.closed_at);
      return d >= prevRange.start && d < prevRange.end;
    });
    if (paymentFilter) filtered = filtered.filter((c) => c.payment_method === paymentFilter);
    if (adminFilter) filtered = filtered.filter((c) => c.staff_id === adminFilter);
    return filtered;
  }, [allChecks, prevRange, paymentFilter, adminFilter]);

  const checkIds = useMemo(() => new Set(checks.map((c) => c.id)), [checks]);
  const prevCheckIds = useMemo(() => new Set(prevChecks.map((c) => c.id)), [prevChecks]);

  const refunds = useMemo(() => allRefunds.filter((r) => checkIds.has(r.check_id)), [allRefunds, checkIds]);
  const prevRefunds = useMemo(() => allRefunds.filter((r) => prevCheckIds.has(r.check_id)), [allRefunds, prevCheckIds]);
  const totalRefunded = useMemo(() => refunds.reduce((s, r) => s + (r.total_amount || 0), 0), [refunds]);
  const prevTotalRefunded = useMemo(() => prevRefunds.reduce((s, r) => s + (r.total_amount || 0), 0), [prevRefunds]);

  const checkItems = useMemo(() => allCheckItems.filter((ci) => checkIds.has(ci.check_id)), [allCheckItems, checkIds]);
  const prevCheckItems = useMemo(() => allCheckItems.filter((ci) => prevCheckIds.has(ci.check_id)), [allCheckItems, prevCheckIds]);

  const refundItemsInPeriod = useMemo(() => allRefundItems.filter((ri) => checkIds.has(ri.check_id)), [allRefundItems, checkIds]);
  const prevRefundItemsInPeriod = useMemo(() => allRefundItems.filter((ri) => prevCheckIds.has(ri.check_id)), [allRefundItems, prevCheckIds]);

  const revenue = useMemo(() => checks.reduce((s, c) => s + (c.total_amount || 0), 0) - totalRefunded, [checks, totalRefunded]);
  const prevRevenue = useMemo(() => prevChecks.reduce((s, c) => s + (c.total_amount || 0), 0) - prevTotalRefunded, [prevChecks, prevTotalRefunded]);

  const refundsByCheckId = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of refunds) {
      map.set(r.check_id, (map.get(r.check_id) || 0) + (r.total_amount || 0));
    }
    return map;
  }, [refunds]);

  const paymentBreakdown = useMemo(() => {
    const b = { cash: 0, card: 0, debt: 0, bonus: 0, deposit: 0 };
    for (const c of checks) {
      const amt = c.total_amount || 0;
      const refAmt = refundsByCheckId.get(c.id) || 0;
      const effectiveAmt = amt - refAmt;
      if (c.payment_method === 'split' || c.payment_method === 'bonus') {
        const parts = checkPaymentsMap[c.id] || [];
        if (parts.length > 0) {
          const partsTotal = parts.reduce((s, p) => s + p.amount, 0);
          for (const p of parts) {
            if (p.method in b) {
              const ratio = partsTotal > 0 ? p.amount / partsTotal : 0;
              b[p.method as keyof typeof b] += p.amount - Math.round(refAmt * ratio);
            }
          }
        } else if (c.payment_method !== 'bonus') {
          b.cash += effectiveAmt;
        }
      } else if (c.payment_method && c.payment_method in b) {
        b[c.payment_method as keyof typeof b] += effectiveAmt;
      }
    }
    return b;
  }, [checks, checkPaymentsMap, refundsByCheckId]);

  const cogs = useMemo(() => {
    let total = 0;
    for (const ci of checkItems) {
      const cost = itemCostMap[ci.item_id];
      if (cost) total += ci.quantity * cost;
    }
    for (const ri of refundItemsInPeriod) {
      const cost = itemCostMap[ri.item_id];
      if (cost) total -= ri.quantity * cost;
    }
    return Math.round(total);
  }, [checkItems, refundItemsInPeriod, itemCostMap]);

  const prevCogs = useMemo(() => {
    let total = 0;
    for (const ci of prevCheckItems) {
      const cost = itemCostMap[ci.item_id];
      if (cost) total += ci.quantity * cost;
    }
    for (const ri of prevRefundItemsInPeriod) {
      const cost = itemCostMap[ri.item_id];
      if (cost) total -= ri.quantity * cost;
    }
    return Math.round(total);
  }, [prevCheckItems, prevRefundItemsInPeriod, itemCostMap]);

  const periodExpenses = useMemo(() => {
    let opex = 0;
    for (const e of opExpenses) {
      const d = new Date(e.expense_date + 'T00:00:00');
      if (d >= range.start && d < range.end) opex += Number(e.amount);
    }
    return Math.round(opex);
  }, [opExpenses, range]);

  const prevPeriodExpenses = useMemo(() => {
    let opex = 0;
    for (const e of opExpenses) {
      const d = new Date(e.expense_date + 'T00:00:00');
      if (d >= prevRange.start && d < prevRange.end) opex += Number(e.amount);
    }
    return Math.round(opex);
  }, [opExpenses, prevRange]);

  const totalExpenses = cogs + periodExpenses;
  const prevTotalExpenses = prevCogs + prevPeriodExpenses;
  const netProfit = revenue - totalExpenses;
  const prevNetProfit = prevRevenue - prevTotalExpenses;
  const marginPct = revenue > 0 ? Math.round((netProfit / revenue) * 100) : 0;

  const delta = useCallback((current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / Math.abs(previous)) * 100);
  }, []);

  const productStats = useMemo((): ProductStat[] => {
    const map: Record<string, ProductStat> = {};
    const checkPlayerMap = new Map(checks.map((c) => [c.id, c.player_id]));

    for (const ci of checkItems) {
      if (!ci.item) continue;
      if (!map[ci.item_id]) {
        map[ci.item_id] = {
          id: ci.item_id, name: ci.item.name, category: ci.item.category,
          qty: 0, revenue: 0, cost: 0, profit: 0, abcGroup: 'C', buyers: new Set(),
        };
      }
      const s = map[ci.item_id];
      s.qty += ci.quantity;
      s.revenue += ci.quantity * ci.price_at_time;
      s.cost += ci.quantity * (itemCostMap[ci.item_id] || 0);
      const pid = checkPlayerMap.get(ci.check_id);
      if (pid) s.buyers.add(pid);
    }

    const products = Object.values(map);
    products.forEach((p) => { p.profit = p.revenue - p.cost; });
    products.sort((a, b) => b.revenue - a.revenue);

    let cumulative = 0;
    const totalRev = products.reduce((s, p) => s + p.revenue, 0);
    for (const p of products) {
      cumulative += p.revenue;
      const pct = totalRev > 0 ? (cumulative / totalRev) * 100 : 100;
      p.abcGroup = pct <= 80 ? 'A' : pct <= 95 ? 'B' : 'C';
    }

    if (search) {
      const q = search.toLowerCase();
      return products.filter((p) => p.name.toLowerCase().includes(q));
    }
    return products;
  }, [checkItems, checks, itemCostMap, search]);

  const playerStats = useMemo((): PlayerStat[] => {
    const map: Record<string, PlayerStat> = {};
    const now = new Date();

    for (const c of checks) {
      if (!c.player_id) continue;
      const nick = c.player?.nickname || 'Гость';
      if (!map[c.player_id]) {
        const profile = allPlayers.find((p) => p.id === c.player_id);
        map[c.player_id] = {
          id: c.player_id, nickname: nick, total: 0, count: 0,
          avgCheck: 0, lastVisit: new Date(c.closed_at), firstVisit: new Date(c.closed_at),
          segment: 'new', bonusBalance: profile?.bonus_points || 0, tier: profile?.client_tier || 'regular',
        };
      }
      const s = map[c.player_id];
      s.total += c.total_amount || 0;
      s.count++;
      const d = new Date(c.closed_at);
      if (d > s.lastVisit) s.lastVisit = d;
      if (d < s.firstVisit) s.firstVisit = d;
    }

    const players = Object.values(map);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000);
    for (const p of players) {
      p.avgCheck = p.count > 0 ? Math.round(p.total / p.count) : 0;
      if (p.count >= 3) p.segment = 'active';
      else if (p.lastVisit < fourteenDaysAgo) p.segment = 'sleeping';
      else p.segment = 'new';
    }
    players.sort((a, b) => b.total - a.total);

    if (search) {
      const q = search.toLowerCase();
      return players.filter((p) => p.nickname.toLowerCase().includes(q));
    }
    return players;
  }, [checks, allPlayers, search]);

  const retentionRate = useMemo(() => {
    const prevPlayerIds = new Set(prevChecks.map((c) => c.player_id).filter(Boolean));
    const currentPlayerIds = new Set(checks.map((c) => c.player_id).filter(Boolean));
    if (prevPlayerIds.size === 0) return 0;
    let returned = 0;
    for (const id of prevPlayerIds) { if (currentPlayerIds.has(id)) returned++; }
    return Math.round((returned / prevPlayerIds.size) * 100);
  }, [checks, prevChecks]);

  const totalDebt = useMemo(() => debtors.reduce((s, d) => s + Math.abs(d.balance), 0), [debtors]);

  const supplyCostInPeriod = useMemo(() => {
    return supplies.filter((s) => {
      const d = new Date(s.created_at);
      return d >= range.start && d < range.end;
    }).reduce((sum, s) => sum + (s.total_cost || 0), 0);
  }, [supplies, range]);

  const salaryPaidInPeriod = useMemo(() => {
    return salaryPayments
      .filter((p) => {
        const d = new Date(p.created_at);
        return d >= range.start && d < range.end;
      })
      .reduce((sum, p) => sum + (p.amount || 0), 0);
  }, [salaryPayments, range]);

  return {
    isLoading, checks, prevChecks, checkItems, prevCheckItems,
    revenue, prevRevenue, paymentBreakdown, checkPaymentsMap,
    cogs, prevCogs, periodExpenses, prevPeriodExpenses,
    totalExpenses, prevTotalExpenses, netProfit, prevNetProfit, marginPct,
    delta, productStats, playerStats, retentionRate,
    debtors, totalDebt, supplies, cashOps, opExpenses, supplyCostInPeriod, salaryPaidInPeriod,
    admins, allPlayers, allChecks, allCheckItems, itemCostMap,
    reload: loadAll,
  };
}
