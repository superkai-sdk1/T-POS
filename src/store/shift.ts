import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Shift, ShiftCheckDetail } from '@/types';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from './auth';
import { sendToOwners, buildShiftOpenReport, buildShiftCloseReport, buildBirthdayReport, type CloseReportCheck } from '@/lib/bot';

interface ShiftState {
  activeShift: Shift | null;
  birthdayNames: string[];
  cashInRegister: number | null;
  isLoading: boolean;

  loadActiveShift: () => Promise<void>;
  loadCashBalance: () => Promise<void>;
  openShift: (cashStart: number) => Promise<Shift | null>;
  closeShift: (cashEnd: number, note?: string) => Promise<boolean>;
  getShiftAnalytics: (shiftId: string) => Promise<ShiftAnalytics | null>;
  dismissBirthdays: () => void;
  upsertShiftLocal: (shift: Shift) => void;
}

export interface ShiftAnalytics {
  shift: Shift;
  checks: ShiftCheckDetail[];
  totalRevenue: number;
  totalChecks: number;
  avgCheck: number;
  paymentBreakdown: Record<string, { count: number; amount: number }>;
  itemsSold: { name: string; category: string; quantity: number; revenue: number }[];
  playerBreakdown: { nickname: string; checks: number; total: number }[];
}

export const useShiftStore = create<ShiftState>()(
  persist(
    (set, get) => ({
      activeShift: null,
      cashInRegister: null,
      birthdayNames: [],
      isLoading: false,

      loadActiveShift: async () => {
        set({ isLoading: true });
        const { data } = await supabase
          .from('shifts')
          .select('*')
          .eq('status', 'open')
          .order('opened_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const activeShift = data ? (data as Shift) : null;
        set({ activeShift, isLoading: false });
        if (activeShift) {
          get().loadCashBalance();
        }
      },

      loadCashBalance: async () => {
        const { activeShift } = get();
        if (!activeShift) {
          set({ cashInRegister: null });
          return;
        }

        const { data: shiftChecks } = await supabase
          .from('checks')
          .select('id, total_amount, payment_method')
          .eq('shift_id', activeShift.id)
          .eq('status', 'closed');

        let cashFromSales = 0;
        const checkIds = (shiftChecks || []).map((c) => c.id);

        for (const c of shiftChecks || []) {
          if (c.payment_method === 'cash') {
            cashFromSales += c.total_amount || 0;
          }
        }

        if (checkIds.length > 0) {
          const { data: splitPayments } = await supabase
            .from('check_payments')
            .select('check_id, method, amount')
            .in('check_id', checkIds)
            .eq('method', 'cash');
          for (const p of splitPayments || []) {
            const check = shiftChecks?.find((c) => c.id === p.check_id);
            if (check && check.payment_method !== 'cash') {
              cashFromSales += p.amount || 0;
            }
          }
        }

        const { data: cashOps } = await supabase
          .from('cash_operations')
          .select('type, amount')
          .eq('shift_id', activeShift.id);
        let opsBalance = 0;
        for (const op of cashOps || []) {
          opsBalance += op.type === 'deposit' ? op.amount : -op.amount;
        }

        let cashRefunded = 0;
        const { data: refundData } = await supabase
          .from('refunds')
          .select('total_amount, check_id')
          .eq('shift_id', activeShift.id);
        if (refundData && refundData.length > 0) {
          const refundCheckIds = refundData.map((r) => r.check_id);
          const { data: refChecks } = await supabase
            .from('checks')
            .select('id, total_amount, payment_method')
            .in('id', refundCheckIds);
          const refCheckMap = new Map((refChecks || []).map((c) => [c.id, c]));

          for (const r of refundData) {
            const origCheck = refCheckMap.get(r.check_id);
            if (!origCheck) continue;
            if (origCheck.payment_method === 'cash') {
              cashRefunded += r.total_amount || 0;
            } else if (origCheck.payment_method === 'split') {
              const { data: cp } = await supabase
                .from('check_payments')
                .select('method, amount')
                .eq('check_id', r.check_id);
              const cashPortion = (cp || []).filter((p) => p.method === 'cash').reduce((s, p) => s + p.amount, 0);
              const origTotal = origCheck.total_amount || 1;
              cashRefunded += Math.round((cashPortion / origTotal) * (r.total_amount || 0));
            }
          }
        }

        set({ cashInRegister: activeShift.cash_start + cashFromSales + opsBalance - cashRefunded });
      },


      openShift: async (cashStart: number) => {
        const user = useAuthStore.getState().user;
        if (!user) return null;

        const { data, error } = await supabase
          .from('shifts')
          .insert({ opened_by: user.id, cash_start: cashStart })
          .select()
          .single();

        if (error || !data) return null;
        const shift = data as Shift;
        set({ activeShift: shift });

        sendToOwners(buildShiftOpenReport(user.nickname, cashStart));

        const now = new Date();
        const month = now.getMonth() + 1;
        const day = now.getDate();
        const pad = (n: number) => String(n).padStart(2, '0');
        const { data: bdayProfiles } = await supabase
          .from('profiles')
          .select('nickname, birthday')
          .not('birthday', 'is', null);
        const names: string[] = [];
        if (bdayProfiles) {
          for (const p of bdayProfiles) {
            if (p.birthday && p.birthday.includes(`-${pad(month)}-${pad(day)}`)) {
              names.push(p.nickname);
            }
          }
        }
        if (names.length > 0) {
          set({ birthdayNames: names });
          sendToOwners(buildBirthdayReport(names));
        }

        return shift;
      },

      closeShift: async (cashEnd: number, note?: string) => {
        const { activeShift } = get();
        if (!activeShift) return false;

        const { count } = await supabase
          .from('checks')
          .select('id', { count: 'exact', head: true })
          .eq('shift_id', activeShift.id)
          .eq('status', 'open');
        if (count && count > 0) return false;

        const user = useAuthStore.getState().user;
        const closedAt = new Date().toISOString();

        const { error } = await supabase
          .from('shifts')
          .update({
            status: 'closed',
            closed_by: user?.id || null,
            cash_end: cashEnd,
            note: note || null,
            closed_at: closedAt,
          })
          .eq('id', activeShift.id);

        if (error) return false;

        const { data: closedChecks } = await supabase
          .from('checks')
          .select('total_amount, payment_method, player:profiles!checks_player_id_fkey(nickname)')
          .eq('shift_id', activeShift.id)
          .eq('status', 'closed')
          .order('closed_at');

        const checks: CloseReportCheck[] = (closedChecks || []).map((c) => {
          const player = Array.isArray(c.player) ? c.player[0] : c.player;
          return {
            playerNickname: (player as { nickname: string } | null)?.nickname || 'Гость',
            totalAmount: c.total_amount as number,
            paymentMethod: c.payment_method as string | null,
          };
        });
        const totalRevenue = checks.reduce((s, c) => s + c.totalAmount, 0);

        sendToOwners(buildShiftCloseReport({
          staffClose: user?.nickname || '?',
          openedAt: activeShift.opened_at,
          closedAt,
          cashEnd,
          totalRevenue,
          checks,
        }));

        set({ activeShift: null });
        return true;
      },

      dismissBirthdays: () => set({ birthdayNames: [] }),

      getShiftAnalytics: async (shiftId: string) => {
        const { data: shiftData } = await supabase
          .from('shifts')
          .select('*')
          .eq('id', shiftId)
          .single();
        if (!shiftData) return null;
        const shift = shiftData as Shift;

        const { data: checksData } = await supabase
          .from('checks')
          .select('*, player:profiles!checks_player_id_fkey(nickname)')
          .eq('shift_id', shiftId)
          .eq('status', 'closed')
          .order('closed_at', { ascending: false });

        const checks: ShiftCheckDetail[] = [];
        const paymentBreakdown: Record<string, { count: number; amount: number }> = {};
        const itemMap = new Map<string, { name: string; category: string; quantity: number; revenue: number }>();
        const playerMap = new Map<string, { nickname: string; checks: number; total: number }>();

        let totalRevenue = 0;

        for (const c of checksData || []) {
          const player = Array.isArray(c.player) ? c.player[0] : c.player;
          const nickname = player?.nickname || 'Неизвестный';

          const { data: items } = await supabase
            .from('check_items')
            .select('item_id, quantity, price_at_time, item:inventory(name, category)')
            .eq('check_id', c.id);

          const checkItems = (items || []).map((ci: Record<string, unknown>) => {
            const item = Array.isArray(ci.item) ? ci.item[0] : ci.item;
            return {
              item_id: ci.item_id as string,
              name: (item as Record<string, string>)?.name || '?',
              category: (item as Record<string, string>)?.category || '',
              quantity: ci.quantity as number,
              price: ci.price_at_time as number,
            };
          });

          checks.push({
            id: c.id,
            player_nickname: nickname,
            total_amount: c.total_amount,
            payment_method: c.payment_method,
            bonus_used: c.bonus_used || 0,
            closed_at: c.closed_at,
            items: checkItems.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price })),
          });

          totalRevenue += c.total_amount;

          const pm = c.payment_method || 'unknown';
          if (!paymentBreakdown[pm]) paymentBreakdown[pm] = { count: 0, amount: 0 };
          paymentBreakdown[pm].count++;
          paymentBreakdown[pm].amount += c.total_amount;

          for (const ci of checkItems) {
            const key = ci.item_id || ci.name;
            const existing = itemMap.get(key);
            if (existing) {
              existing.quantity += ci.quantity;
              existing.revenue += ci.quantity * ci.price;
            } else {
              itemMap.set(key, { name: ci.name, category: ci.category, quantity: ci.quantity, revenue: ci.quantity * ci.price });
            }
          }

          const pe = playerMap.get(nickname);
          if (pe) {
            pe.checks++;
            pe.total += c.total_amount;
          } else {
            playerMap.set(nickname, { nickname, checks: 1, total: c.total_amount });
          }
        }

        const totalChecks = checks.length;
        const avgCheck = totalChecks > 0 ? Math.round(totalRevenue / totalChecks) : 0;

        return {
          shift,
          checks,
          totalRevenue,
          totalChecks,
          avgCheck,
          paymentBreakdown,
          itemsSold: Array.from(itemMap.values()).sort((a, b) => b.revenue - a.revenue),
          playerBreakdown: Array.from(playerMap.values()).sort((a, b) => b.total - a.total),
        };
      },
      upsertShiftLocal: (shift: Shift) => {
        const current = get().activeShift;
        if (shift.status === 'open') {
          set({ activeShift: shift });
        } else if (current && current.id === shift.id && shift.status === 'closed') {
          set({ activeShift: null });
        }
      },
    }),
    {
      name: 'tpos-shift',
      partialize: (state) => ({ activeShift: state.activeShift }),
    }
  )
);
