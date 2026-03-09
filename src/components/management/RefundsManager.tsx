import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { useShiftStore } from '@/store/shift';
import { usePOSStore } from '@/store/pos';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Input';
import { useOnTableChange } from '@/hooks/useRealtimeSync';
import {
  RotateCcw, Receipt, ChevronRight, Check as CheckIcon,
  Minus, Plus, AlertTriangle, Package, ArrowLeft,
} from 'lucide-react';
import type { Refund, Check, CheckItem } from '@/types';
import { hapticFeedback, hapticNotification } from '@/lib/telegram';
import { useMemo } from 'react';

interface CheckWithItems extends Check {
  checkItems: (CheckItem & { item?: { name: string; category: string } })[];
}

export function RefundsManager() {
  const user = useAuthStore((s) => s.user);
  const activeShift = useShiftStore((s) => s.activeShift);
  const loadInventory = usePOSStore((s) => s.loadInventory);
  const loadOpenChecks = usePOSStore((s) => s.loadOpenChecks);

  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [closedChecks, setClosedChecks] = useState<CheckWithItems[]>([]);
  const [loading, setLoading] = useState(true);

  const [screen, setScreen] = useState<'list' | 'selectCheck' | 'refundForm'>('list');
  const [selectedCheck, setSelectedCheck] = useState<CheckWithItems | null>(null);
  const [refundType, setRefundType] = useState<'full' | 'partial'>('full');
  const [itemSelections, setItemSelections] = useState<Record<string, number>>({});
  const [refundNote, setRefundNote] = useState('');
  const [processing, setProcessing] = useState(false);
  const [detailRefund, setDetailRefund] = useState<Refund | null>(null);
  const [detailItems, setDetailItems] = useState<{ name: string; quantity: number; price: number }[]>([]);
  const [bonusRate, setBonusRate] = useState(10);

  const loadRefunds = useCallback(async () => {
    const { data } = await supabase
      .from('refunds')
      .select('*, creator:profiles!refunds_created_by_fkey(nickname)')
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) {
      setRefunds(data.map((r) => ({
        ...r,
        creator: Array.isArray(r.creator) ? r.creator[0] : r.creator,
      })) as Refund[]);
    }
    setLoading(false);
  }, []);

  const loadClosedChecks = useCallback(async () => {
    if (!activeShift) { setClosedChecks([]); return; }
    const { data: checks } = await supabase
      .from('checks')
      .select('*, player:profiles!checks_player_id_fkey(nickname)')
      .eq('shift_id', activeShift.id)
      .eq('status', 'closed')
      .order('closed_at', { ascending: false });
    if (!checks) return;

    const checkIds = checks.map((c) => c.id);
    if (checkIds.length === 0) { setClosedChecks([]); return; }

    const { data: allItems } = await supabase
      .from('check_items')
      .select('*, item:inventory(name, category)')
      .in('check_id', checkIds);

    const itemsMap = new Map<string, typeof allItems>();
    for (const ci of allItems || []) {
      const arr = itemsMap.get(ci.check_id) || [];
      arr.push(ci);
      itemsMap.set(ci.check_id, arr);
    }

    const existingRefunds = await supabase
      .from('refunds')
      .select('check_id, refund_type')
      .in('check_id', checkIds);
    const fullyRefunded = new Set(
      (existingRefunds.data || [])
        .filter((r) => r.refund_type === 'full')
        .map((r) => r.check_id)
    );

    const result: CheckWithItems[] = checks
      .filter((c) => !fullyRefunded.has(c.id))
      .map((c) => ({
        ...c,
        player: Array.isArray(c.player) ? c.player[0] : c.player,
        checkItems: (itemsMap.get(c.id) || []).map((ci) => ({
          ...ci,
          item: Array.isArray(ci.item) ? ci.item[0] : ci.item,
        })),
      })) as CheckWithItems[];

    setClosedChecks(result);
  }, [activeShift]);

  const tables = useMemo(() => ['refunds', 'checks'], []);
  useOnTableChange(tables, () => { loadRefunds(); loadClosedChecks(); });

  useEffect(() => { loadRefunds(); }, [loadRefunds]);
  useEffect(() => { loadClosedChecks(); }, [loadClosedChecks]);

  const handleSelectCheck = async (check: CheckWithItems) => {
    hapticFeedback('light');
    setSelectedCheck(check);
    setRefundType('full');
    const sel: Record<string, number> = {};
    for (const ci of check.checkItems) {
      sel[ci.id] = ci.quantity;
    }
    setItemSelections(sel);
    setRefundNote('');
    const { data: settingsRows } = await supabase.from('app_settings').select('*');
    if (settingsRows) {
      const rateRow = settingsRows.find((r: { key: string }) => r.key === 'bonus_accrual_rate');
      if (rateRow) setBonusRate(Number(rateRow.value) || 10);
    }
    setScreen('refundForm');
  };

  const toggleRefundType = (type: 'full' | 'partial') => {
    hapticFeedback('light');
    setRefundType(type);
    if (type === 'full' && selectedCheck) {
      const sel: Record<string, number> = {};
      for (const ci of selectedCheck.checkItems) {
        sel[ci.id] = ci.quantity;
      }
      setItemSelections(sel);
    }
  };

  const updateItemQty = (ciId: string, delta: number) => {
    hapticFeedback('light');
    const ci = selectedCheck?.checkItems.find((c) => c.id === ciId);
    if (!ci) return;
    const current = itemSelections[ciId] || 0;
    const next = Math.max(0, Math.min(ci.quantity, current + delta));
    setItemSelections((prev) => ({ ...prev, [ciId]: next }));
  };

  const refundTotal = useMemo(() => {
    if (!selectedCheck) return 0;
    return selectedCheck.checkItems.reduce((sum, ci) => {
      const qty = itemSelections[ci.id] || 0;
      return sum + qty * ci.price_at_time;
    }, 0);
  }, [selectedCheck, itemSelections]);

  const hasSelectedItems = Object.values(itemSelections).some((q) => q > 0);

  const processRefund = async () => {
    if (!selectedCheck || !user || processing) return;
    if (!hasSelectedItems) return;
    setProcessing(true);
    hapticFeedback('heavy');

    try {
      const check = selectedCheck;
      const isFullRefund = refundType === 'full' || refundTotal >= check.total_amount;
      const actualType = isFullRefund ? 'full' : 'partial';

      const bonusUsedOnCheck = check.bonus_used || 0;
      const checkTotalBeforeBonus = check.total_amount + bonusUsedOnCheck;
      const refundPct = checkTotalBeforeBonus > 0 ? refundTotal / checkTotalBeforeBonus : 0;

      const { data: settingsRows } = await supabase.from('app_settings').select('*');
      const cfg: Record<string, string> = {};
      if (settingsRows) for (const r of settingsRows) cfg[r.key] = r.value;
      const freshBonusRate = Number(cfg['bonus_accrual_rate'] || '10');
      setBonusRate(freshBonusRate);

      const originalBonusAccrual = Math.floor(checkTotalBeforeBonus * freshBonusRate / 100);
      const bonusToDeduct = isFullRefund
        ? originalBonusAccrual
        : Math.floor(originalBonusAccrual * refundPct);

      const bonusToReturn = isFullRefund
        ? bonusUsedOnCheck
        : Math.floor(bonusUsedOnCheck * refundPct);

      const { data: refundRow, error: refundError } = await supabase
        .from('refunds')
        .insert({
          check_id: check.id,
          shift_id: activeShift?.id || null,
          refund_type: actualType,
          total_amount: refundTotal,
          bonus_deducted: bonusToDeduct,
          bonus_returned: bonusToReturn,
          note: refundNote || null,
          created_by: user.id,
        })
        .select()
        .single();

      if (refundError || !refundRow) throw new Error('Failed to create refund');

      const refundItemRows = check.checkItems
        .filter((ci) => (itemSelections[ci.id] || 0) > 0)
        .map((ci) => ({
          refund_id: refundRow.id,
          item_id: ci.item_id,
          quantity: itemSelections[ci.id],
          price_at_time: ci.price_at_time,
        }));

      if (refundItemRows.length > 0) {
        await supabase.from('refund_items').insert(refundItemRows);
      }

      const qtyByItemId = new Map<string, number>();
      for (const ri of refundItemRows) {
        qtyByItemId.set(ri.item_id, (qtyByItemId.get(ri.item_id) || 0) + ri.quantity);
      }
      const uniqueItemIds = [...qtyByItemId.keys()];
      if (uniqueItemIds.length > 0) {
        const { data: freshItems } = await supabase
          .from('inventory')
          .select('id, stock_quantity')
          .in('id', uniqueItemIds);
        if (freshItems) {
          const stockMap = new Map(freshItems.map((i) => [i.id, i.stock_quantity as number]));
          await Promise.all(
            uniqueItemIds.map((itemId) => {
              const current = stockMap.get(itemId) ?? 0;
              const returnQty = qtyByItemId.get(itemId) ?? 0;
              return supabase
                .from('inventory')
                .update({ stock_quantity: current + returnQty })
                .eq('id', itemId);
            })
          );
        }
      }

      if (check.player_id && (bonusToDeduct > 0 || bonusToReturn > 0)) {
        const { data: player } = await supabase
          .from('profiles')
          .select('bonus_points')
          .eq('id', check.player_id)
          .single();
        if (player) {
          const newPoints = Math.max(0, player.bonus_points - bonusToDeduct + bonusToReturn);
          await supabase
            .from('profiles')
            .update({ bonus_points: newPoints })
            .eq('id', check.player_id);
        }

        if (bonusToDeduct > 0) {
          await supabase.from('transactions').insert({
            type: 'refund',
            amount: bonusToDeduct,
            description: `Списание бонусов при возврате (${actualType === 'full' ? 'полный' : 'частичный'})`,
            check_id: check.id,
            player_id: check.player_id,
            created_by: user.id,
          });
        }
        if (bonusToReturn > 0) {
          await supabase.from('transactions').insert({
            type: 'refund',
            amount: bonusToReturn,
            description: `Возврат использованных бонусов`,
            check_id: check.id,
            player_id: check.player_id,
            created_by: user.id,
          });
        }
      }

      await supabase.from('transactions').insert({
        type: 'refund',
        amount: -refundTotal,
        description: `Возврат по чеку (${actualType === 'full' ? 'полный' : 'частичный'}): ${refundTotal}₽`,
        check_id: check.id,
        player_id: check.player_id || null,
        created_by: user.id,
      });

      hapticNotification('success');
      setScreen('list');
      setSelectedCheck(null);
      await loadRefunds();
      await loadClosedChecks();
      loadInventory();
      loadOpenChecks();
    } catch (err) {
      console.error('Refund error:', err);
      hapticNotification('error');
    } finally {
      setProcessing(false);
    }
  };

  const openDetail = async (refund: Refund) => {
    hapticFeedback('light');
    setDetailRefund(refund);
    const { data: items } = await supabase
      .from('refund_items')
      .select('*, item:inventory(name)')
      .eq('refund_id', refund.id);
    setDetailItems((items || []).map((i) => ({
      name: (Array.isArray(i.item) ? i.item[0] : i.item)?.name || '?',
      quantity: i.quantity,
      price: i.price_at_time,
    })));
  };

  const fmtCur = (n: number) =>
    new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + '₽';

  const fmtDate = (d: string) =>
    new Date(d).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  if (screen === 'selectCheck') {
    return (
      <div className="space-y-3">
        <button
          onClick={() => setScreen('list')}
          className="flex items-center gap-1.5 text-[11px] text-[var(--c-hint)] font-semibold active:scale-95 transition-transform"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Назад к возвратам
        </button>

        {!activeShift ? (
          <div className="p-6 text-center card">
            <AlertTriangle className="w-8 h-8 text-[var(--c-warning)] mx-auto mb-2" />
            <p className="text-sm text-[var(--c-hint)]">Нет активной смены</p>
            <p className="text-[10px] text-[var(--c-muted)] mt-1">Возвраты возможны только в рамках текущей смены</p>
          </div>
        ) : closedChecks.length === 0 ? (
          <div className="p-6 text-center card">
            <Receipt className="w-8 h-8 text-[var(--c-muted)] mx-auto mb-2" />
            <p className="text-sm text-[var(--c-hint)]">Нет закрытых чеков в этой смене</p>
          </div>
        ) : (
          <div className="space-y-1 stagger-children">
            <p className="text-[10px] font-semibold text-[var(--c-muted)] uppercase tracking-wider">
              Чеки текущей смены ({closedChecks.length})
            </p>
            {closedChecks.map((check) => (
              <button
                key={check.id}
                onClick={() => handleSelectCheck(check)}
                className="w-full flex items-center gap-2.5 p-3 rounded-xl card-interactive"
              >
                <div className="w-9 h-9 rounded-lg bg-[var(--c-surface)] flex items-center justify-center shrink-0">
                  <Receipt className="w-4 h-4 text-[var(--c-hint)]" />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="font-semibold text-[13px] text-[var(--c-text)] truncate">
                    {check.player?.nickname || check.guest_names || 'Гость'}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-[var(--c-muted)]">
                      {check.checkItems.length} поз.
                    </span>
                    <span className="text-[var(--c-muted)]">·</span>
                    <span className="text-[10px] text-[var(--c-muted)]">
                      {check.closed_at ? fmtDate(check.closed_at) : ''}
                    </span>
                  </div>
                </div>
                <span className="text-sm font-bold text-[var(--c-text)] tabular-nums shrink-0">
                  {fmtCur(check.total_amount)}
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-[var(--c-muted)] shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (screen === 'refundForm' && selectedCheck) {
    return (
      <div className="space-y-3">
        <button
          onClick={() => { setScreen('selectCheck'); setSelectedCheck(null); }}
          className="flex items-center gap-1.5 text-[11px] text-[var(--c-hint)] font-semibold active:scale-95 transition-transform"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Назад к выбору чека
        </button>

        <div className="p-3 rounded-xl card space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-sm text-[var(--c-text)]">
                {selectedCheck.player?.nickname || selectedCheck.guest_names || 'Гость'}
              </p>
              <p className="text-[10px] text-[var(--c-muted)]">
                Чек на {fmtCur(selectedCheck.total_amount)}
                {selectedCheck.bonus_used > 0 && ` (бонусов: ${fmtCur(selectedCheck.bonus_used)})`}
              </p>
            </div>
            <Badge variant={selectedCheck.payment_method === 'cash' ? 'success' : 'accent'}>
              {selectedCheck.payment_method || '?'}
            </Badge>
          </div>
        </div>

        <div className="flex gap-1.5">
          <button
            onClick={() => toggleRefundType('full')}
            className={`flex-1 p-2.5 rounded-xl text-center text-[12px] font-bold transition-all ${
              refundType === 'full'
                ? 'bg-[var(--c-danger-bg)] border border-[var(--c-danger-border)] text-[var(--c-danger)]'
                : 'card text-[var(--c-hint)]'
            }`}
          >
            Полный возврат
          </button>
          <button
            onClick={() => toggleRefundType('partial')}
            className={`flex-1 p-2.5 rounded-xl text-center text-[12px] font-bold transition-all ${
              refundType === 'partial'
                ? 'bg-[var(--c-warning-bg)] border border-[var(--c-warning-border)] text-[var(--c-warning)]'
                : 'card text-[var(--c-hint)]'
            }`}
          >
            Частичный возврат
          </button>
        </div>

        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-[var(--c-muted)] uppercase tracking-wider">
            Позиции для возврата
          </p>
          {selectedCheck.checkItems.map((ci) => {
            const qty = itemSelections[ci.id] || 0;
            const isPartial = refundType === 'partial';
            return (
              <div
                key={ci.id}
                className={`flex items-center gap-2 p-2.5 rounded-xl transition-all ${
                  qty > 0 ? 'bg-[var(--c-danger-bg)] border border-[var(--c-danger-border)]' : 'card'
                }`}
              >
                <div className="w-7 h-7 rounded-lg bg-[var(--c-surface)] flex items-center justify-center shrink-0">
                  <Package className="w-3.5 h-3.5 text-[var(--c-muted)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-[var(--c-text)] truncate">
                    {ci.item?.name || '?'}
                  </p>
                  <p className="text-[10px] text-[var(--c-muted)]">
                    {fmtCur(ci.price_at_time)} × {ci.quantity}
                  </p>
                </div>

                {isPartial ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => updateItemQty(ci.id, -1)}
                      className="w-7 h-7 rounded-lg bg-[var(--c-surface)] flex items-center justify-center active:scale-90 transition-transform"
                    >
                      <Minus className="w-3 h-3 text-[var(--c-hint)]" />
                    </button>
                    <span className={`w-6 text-center text-[13px] font-bold tabular-nums ${
                      qty > 0 ? 'text-[var(--c-danger)]' : 'text-[var(--c-muted)]'
                    }`}>
                      {qty}
                    </span>
                    <button
                      onClick={() => updateItemQty(ci.id, 1)}
                      className="w-7 h-7 rounded-lg bg-[var(--c-surface)] flex items-center justify-center active:scale-90 transition-transform"
                    >
                      <Plus className="w-3 h-3 text-[var(--c-hint)]" />
                    </button>
                  </div>
                ) : (
                  <div className="shrink-0">
                    <CheckIcon className="w-4 h-4 text-[var(--c-danger)]" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <Input
          label="Причина возврата"
          placeholder="Необязательно"
          value={refundNote}
          onChange={(e) => setRefundNote(e.target.value)}
          compact
        />

        <div className="p-3 rounded-xl bg-[var(--c-danger-bg)] border border-[var(--c-danger-border)] space-y-1">
          <div className="flex justify-between text-[12px]">
            <span className="text-[var(--c-hint)]">Сумма возврата</span>
            <span className="font-bold text-[var(--c-danger)] tabular-nums">{fmtCur(refundTotal)}</span>
          </div>
          {selectedCheck.player_id && (
            <>
              {(() => {
                const bUsed = selectedCheck.bonus_used || 0;
                const totalBeforeBonus = selectedCheck.total_amount + bUsed;
                const pct = totalBeforeBonus > 0 ? refundTotal / totalBeforeBonus : 0;
                const isFullPct = refundTotal >= selectedCheck.total_amount;
                const originalAccrual = Math.floor(totalBeforeBonus * bonusRate / 100);
                const bonusDeduct = isFullPct ? originalAccrual : Math.floor(originalAccrual * pct);
                const bonusReturn = isFullPct ? bUsed : Math.floor(bUsed * pct);
                return (
                  <>
                    {bonusDeduct > 0 && (
                      <div className="flex justify-between text-[11px]">
                        <span className="text-[var(--c-muted)]">Списание начисленных бонусов</span>
                        <span className="text-[var(--c-warning)] font-semibold tabular-nums">−{bonusDeduct}</span>
                      </div>
                    )}
                    {bonusReturn > 0 && (
                      <div className="flex justify-between text-[11px]">
                        <span className="text-[var(--c-muted)]">Возврат использованных бонусов</span>
                        <span className="text-[var(--c-success)] font-semibold tabular-nums">+{bonusReturn}</span>
                      </div>
                    )}
                  </>
                );
              })()}
            </>
          )}
        </div>

        <Button
          fullWidth
          variant="danger"
          onClick={processRefund}
          loading={processing}
          disabled={!hasSelectedItems || processing}
        >
          <RotateCcw className="w-4 h-4" />
          {refundType === 'full' ? 'Полный возврат' : 'Частичный возврат'} — {fmtCur(refundTotal)}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={() => { loadClosedChecks(); setScreen('selectCheck'); }}
          disabled={!activeShift}
        >
          <RotateCcw className="w-3.5 h-3.5" /> Новый возврат
        </Button>
        {!activeShift && (
          <span className="text-[10px] text-[var(--c-warning)]">Нужна открытая смена</span>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1,2,3].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-[var(--c-surface)] animate-pulse" />
          ))}
        </div>
      ) : refunds.length === 0 ? (
        <div className="p-8 text-center card">
          <RotateCcw className="w-8 h-8 text-[var(--c-muted)] mx-auto mb-2" />
          <p className="text-sm text-[var(--c-hint)]">Возвратов пока нет</p>
        </div>
      ) : (
        <div className="space-y-1 stagger-children">
          {refunds.map((r) => (
            <button
              key={r.id}
              onClick={() => openDetail(r)}
              className="w-full flex items-center gap-2.5 p-3 rounded-xl card-interactive"
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                r.refund_type === 'full' ? 'bg-[var(--c-danger-bg)]' : 'bg-[var(--c-warning-bg)]'
              }`}>
                <RotateCcw className={`w-4 h-4 ${
                  r.refund_type === 'full' ? 'text-[var(--c-danger)]' : 'text-[var(--c-warning)]'
                }`} />
              </div>
              <div className="flex-1 text-left min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="font-semibold text-[13px] text-[var(--c-text)]">
                    {fmtCur(r.total_amount)}
                  </p>
                  <Badge size="sm" variant={r.refund_type === 'full' ? 'danger' : 'warning'}>
                    {r.refund_type === 'full' ? 'Полный' : 'Частичный'}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] text-[var(--c-muted)]">{r.creator?.nickname || '?'}</span>
                  <span className="text-[var(--c-muted)]">·</span>
                  <span className="text-[10px] text-[var(--c-muted)]">{fmtDate(r.created_at)}</span>
                </div>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-[var(--c-muted)] shrink-0" />
            </button>
          ))}
        </div>
      )}

      <Drawer
        open={!!detailRefund}
        onClose={() => { setDetailRefund(null); setDetailItems([]); }}
        title="Детали возврата"
        size="sm"
      >
        {detailRefund && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-xl card text-center">
                <p className="text-base font-black text-[var(--c-danger)] tabular-nums">
                  {fmtCur(detailRefund.total_amount)}
                </p>
                <p className="text-[9px] text-[var(--c-muted)]">Сумма</p>
              </div>
              <div className="p-2.5 rounded-xl card text-center">
                <Badge variant={detailRefund.refund_type === 'full' ? 'danger' : 'warning'}>
                  {detailRefund.refund_type === 'full' ? 'Полный' : 'Частичный'}
                </Badge>
                <p className="text-[9px] text-[var(--c-muted)] mt-1">Тип</p>
              </div>
            </div>

            {(detailRefund.bonus_deducted > 0 || detailRefund.bonus_returned > 0) && (
              <div className="p-2.5 rounded-xl bg-[var(--c-warning-bg)] border border-[var(--c-warning-border)] space-y-1">
                {detailRefund.bonus_deducted > 0 && (
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[var(--c-hint)]">Бонусов списано</span>
                    <span className="text-[var(--c-danger)] font-semibold">−{detailRefund.bonus_deducted}</span>
                  </div>
                )}
                {detailRefund.bonus_returned > 0 && (
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[var(--c-hint)]">Бонусов возвращено</span>
                    <span className="text-[var(--c-success)] font-semibold">+{detailRefund.bonus_returned}</span>
                  </div>
                )}
              </div>
            )}

            {detailItems.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-[var(--c-muted)] uppercase tracking-wider">Позиции</p>
                {detailItems.map((item, i) => (
                  <div key={i} className="flex justify-between p-2 rounded-lg card text-[12px]">
                    <span className="text-[var(--c-hint)]">{item.name} × {item.quantity}</span>
                    <span className="font-bold text-[var(--c-text)] tabular-nums">{fmtCur(item.price * item.quantity)}</span>
                  </div>
                ))}
              </div>
            )}

            {detailRefund.note && (
              <div className="p-2.5 rounded-xl card">
                <p className="text-[10px] text-[var(--c-muted)] mb-0.5">Причина</p>
                <p className="text-[12px] text-[var(--c-hint)]">{detailRefund.note}</p>
              </div>
            )}

            <div className="text-[10px] text-[var(--c-muted)] text-center">
              {detailRefund.creator?.nickname} · {fmtDate(detailRefund.created_at)}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
