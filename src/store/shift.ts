import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Shift, ShiftCheckDetail } from '@/types';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from './auth';
import { notifyShiftOpen, notifyShiftClose, notifyBirthday, type CloseReportCheck, type CloseReportRefund } from '@/lib/notifications';

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
  refundsByCheckId: Map<string, number>;
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
          if (op.type === 'deposit') opsBalance += op.amount;
          else opsBalance -= op.amount;
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

        notifyShiftOpen(user.nickname, cashStart);

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
          notifyBirthday(names);
        }

        return shift;
      },

      closeShift: async (cashEnd: number, note?: string) => {
        const { activeShift } = get();
        if (!activeShift) return false;

        const { count, error: countError } = await supabase
          .from('checks')
          .select('id', { count: 'exact', head: true })
          .eq('shift_id', activeShift.id)
          .eq('status', 'open');
        if (countError) return false;
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
          .select('id, total_amount, payment_method, player:profiles!checks_player_id_fkey(nickname)')
          .eq('shift_id', activeShift.id)
          .eq('status', 'closed')
          .order('closed_at');

        const checkById = new Map<string, CloseReportCheck>();
        const checks: CloseReportCheck[] = (closedChecks || []).map((c) => {
          const player = Array.isArray(c.player) ? c.player[0] : c.player;
          const check: CloseReportCheck = {
            playerNickname: (player as { nickname: string } | null)?.nickname || 'Гость',
            totalAmount: c.total_amount as number,
            paymentMethod: c.payment_method as string | null,
          };
          checkById.set(c.id, check);
          return check;
        });

        // Fetch split payment details for split-paid checks
        const splitCheckIds = (closedChecks || [])
          .filter((c) => c.payment_method === 'split')
          .map((c) => c.id);
        if (splitCheckIds.length > 0) {
          const { data: splitPaymentsData } = await supabase
            .from('check_payments')
            .select('check_id, method, amount')
            .in('check_id', splitCheckIds);
          if (splitPaymentsData) {
            const paymentsByCheck = new Map<string, { method: string; amount: number }[]>();
            for (const sp of splitPaymentsData) {
              const list = paymentsByCheck.get(sp.check_id) || [];
              list.push({ method: sp.method, amount: sp.amount });
              paymentsByCheck.set(sp.check_id, list);
            }
            for (const [checkId, payments] of paymentsByCheck) {
              const check = checkById.get(checkId);
              if (check) {
                check.splitPayments = payments;
              }
            }
          }
        }

        // Fetch refund details
        const { data: shiftRefunds } = await supabase
          .from('refunds')
          .select('total_amount, refund_type, check_id, created_by, creator:profiles!refunds_created_by_fkey(nickname)')
          .eq('shift_id', activeShift.id);
        const totalRefunded = (shiftRefunds || []).reduce((s, r) => s + (r.total_amount || 0), 0);

        // Build refund entries with player nicknames
        const refunds: CloseReportRefund[] = [];
        if (shiftRefunds && shiftRefunds.length > 0) {
          const refundCheckIds = [...new Set(shiftRefunds.map((r) => r.check_id))];
          const { data: refundChecks } = await supabase
            .from('checks')
            .select('id, player:profiles!checks_player_id_fkey(nickname), guest_names')
            .in('id', refundCheckIds);
          const checkMap = new Map(
            (refundChecks || []).map((c) => {
              const p = Array.isArray(c.player) ? c.player[0] : c.player;
              return [c.id, (p as { nickname: string } | null)?.nickname || c.guest_names || 'Гость'];
            })
          );
          for (const r of shiftRefunds) {
            const creator = Array.isArray(r.creator) ? r.creator[0] : r.creator;
            refunds.push({
              playerNickname: checkMap.get(r.check_id) || 'Гость',
              amount: r.total_amount,
              refundType: r.refund_type as 'full' | 'partial',
              creatorNickname: (creator as { nickname: string } | null)?.nickname,
            });
          }
        }

        const totalRevenue = checks.reduce((s, c) => s + c.totalAmount, 0) - totalRefunded;

        notifyShiftClose({
          staffClose: user?.nickname || '?',
          openedAt: activeShift.opened_at,
          closedAt,
          cashEnd,
          totalRevenue,
          totalRefunded,
          checks,
          refunds,
        });

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

        const checkIds = (checksData || []).map((c) => c.id);
        const { data: allItemsData } = checkIds.length > 0
          ? await supabase
            .from('check_items')
            .select('check_id, item_id, quantity, price_at_time, item:inventory(name, category)')
            .in('check_id', checkIds)
          : { data: [] };

        const itemsByCheckId = new Map<string, typeof allItemsData>();
        for (const ci of allItemsData || []) {
          const list = itemsByCheckId.get(ci.check_id) || [];
          list.push(ci);
          itemsByCheckId.set(ci.check_id, list);
        }

        for (const c of checksData || []) {
          const player = Array.isArray(c.player) ? c.player[0] : c.player;
          const nickname = player?.nickname || 'Неизвестный';

          const items = itemsByCheckId.get(c.id) || [];

          const checkItems = items.map((ci: Record<string, unknown>) => {
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
            certificate_used: c.certificate_used || 0,
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

        const { data: refundsData } = await supabase
          .from('refunds')
          .select('id, total_amount, check_id')
          .eq('shift_id', shiftId);

        const refundsByCheckId = new Map<string, number>();
        let totalRefunded = 0;
        for (const r of refundsData || []) {
          totalRefunded += r.total_amount || 0;
          refundsByCheckId.set(r.check_id, (refundsByCheckId.get(r.check_id) || 0) + (r.total_amount || 0));
          const origCheck = (checksData || []).find((c) => c.id === r.check_id);
          if (origCheck) {
            const pm = origCheck.payment_method || 'unknown';
            if (paymentBreakdown[pm]) {
              paymentBreakdown[pm].amount -= r.total_amount || 0;
            }
          }
        }

        const refundIds = (refundsData || []).map((r) => r.id);
        const refundQtyByCheckItem = new Map<string, number>();
        if (refundIds.length > 0) {
          const { data: refundItemsData } = await supabase
            .from('refund_items')
            .select('item_id, quantity, refund:refunds!refund_items_refund_id_fkey(check_id)')
            .in('refund_id', refundIds);
          for (const ri of refundItemsData || []) {
            const refund = Array.isArray(ri.refund) ? ri.refund[0] : ri.refund;
            if (!refund?.check_id) continue;
            const key = `${refund.check_id}:${ri.item_id}`;
            refundQtyByCheckItem.set(key, (refundQtyByCheckItem.get(key) || 0) + (ri.quantity || 0));
          }
        }

        for (const [itemKey, item] of itemMap) {
          for (const c of checksData || []) {
            const items = itemsByCheckId.get(c.id) || [];
            for (const ci of items) {
              const ciItemId = (ci as { item_id?: string }).item_id;
              if (ciItemId !== itemKey) continue;
              const refQty = refundQtyByCheckItem.get(`${c.id}:${ciItemId}`) || 0;
              if (refQty > 0) {
                const price = (ci as { price_at_time?: number }).price_at_time ?? (ci as { price?: number }).price ?? 0;
                item.quantity -= refQty;
                item.revenue -= refQty * price;
              }
            }
          }
        }

        for (const [nickname, pe] of playerMap) {
          for (const c of checksData || []) {
            const player = Array.isArray(c.player) ? c.player[0] : c.player;
            if (player?.nickname !== nickname) continue;
            const refAmt = refundsByCheckId.get(c.id) || 0;
            if (refAmt > 0) {
              pe.total -= refAmt;
              if (pe.total < 0) pe.total = 0;
              if ((c.total_amount || 0) - refAmt <= 0) {
                pe.checks--;
                if (pe.checks < 0) pe.checks = 0;
              }
            }
          }
        }

        const itemsSoldFiltered = Array.from(itemMap.values()).filter((i) => i.quantity > 0);
        const playerBreakdownFiltered = Array.from(playerMap.values()).filter((p) => p.total > 0);

        totalRevenue -= totalRefunded;

        const totalChecks = checks.length;
        const avgCheck = totalChecks > 0 ? Math.round(totalRevenue / totalChecks) : 0;

        return {
          shift,
          checks,
          totalRevenue,
          totalRefunded,
          totalChecks,
          avgCheck,
          paymentBreakdown,
          itemsSold: itemsSoldFiltered.sort((a, b) => b.revenue - a.revenue),
          playerBreakdown: playerBreakdownFiltered.sort((a, b) => b.total - a.total),
          refundsByCheckId,
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
