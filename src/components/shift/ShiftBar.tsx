import { useState, useEffect, useCallback, useMemo } from 'react';
import { useShiftStore } from '@/store/shift';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Drawer } from '@/components/ui/Drawer';
import { PlayCircle, StopCircle, Clock, Banknote } from 'lucide-react';
import { hapticFeedback, hapticNotification } from '@/lib/telegram';
import { ShiftAnalytics } from './ShiftAnalytics';
import { supabase } from '@/lib/supabase';
import { useOnTableChange } from '@/hooks/useRealtimeSync';

export function ShiftBar() {
  const { activeShift, openShift, closeShift, getShiftAnalytics } = useShiftStore();
  const [showOpen, setShowOpen] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [cashStart, setCashStart] = useState('');
  const [cashEnd, setCashEnd] = useState('');
  const [closeNote, setCloseNote] = useState('');
  const [analytics, setAnalytics] = useState<Awaited<ReturnType<typeof getShiftAnalytics>>>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [cashInRegister, setCashInRegister] = useState<number | null>(null);

  const loadCashBalance = useCallback(async () => {
    if (!activeShift) { setCashInRegister(null); return; }

    const { data: cashChecks } = await supabase
      .from('checks')
      .select('total_amount')
      .eq('shift_id', activeShift.id)
      .eq('status', 'closed')
      .eq('payment_method', 'cash');
    const cashFromSales = (cashChecks || []).reduce((s, c) => s + (c.total_amount || 0), 0);

    const { data: cashOps } = await supabase
      .from('cash_operations')
      .select('type, amount')
      .eq('shift_id', activeShift.id);
    let opsBalance = 0;
    for (const op of cashOps || []) {
      opsBalance += op.type === 'deposit' ? op.amount : -op.amount;
    }

    setCashInRegister(activeShift.cash_start + cashFromSales + opsBalance);
  }, [activeShift]);

  const cashTables = useMemo(() => ['checks', 'cash_operations'], []);
  useOnTableChange(cashTables, loadCashBalance);

  useEffect(() => {
    loadCashBalance();
  }, [loadCashBalance]);

  const handleOpen = async () => {
    hapticFeedback('medium');
    const shift = await openShift(Number(cashStart) || 0);
    if (shift) {
      hapticNotification('success');
      setShowOpen(false);
      setCashStart('');
      loadCashBalance();
    }
  };

  const handleStartClose = async () => {
    if (!activeShift) return;
    hapticFeedback('medium');
    setIsClosing(true);
    const data = await getShiftAnalytics(activeShift.id);
    setAnalytics(data);
    setIsClosing(false);
    setShowClose(true);
  };

  const handleConfirmClose = async () => {
    hapticFeedback('heavy');
    const ok = await closeShift(Number(cashEnd) || 0, closeNote);
    if (ok) {
      hapticNotification('success');
      setShowClose(false);
      setCashEnd('');
      setCloseNote('');
      setShowAnalytics(true);
    }
  };

  const fmtCur = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + '₽';

  const shiftDuration = () => {
    if (!activeShift) return '';
    const ms = Date.now() - new Date(activeShift.opened_at).getTime();
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}ч ${m}м`;
  };

  if (!activeShift) {
    return (
      <>
        <button
          onClick={() => setShowOpen(true)}
          className="w-full flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 to-emerald-600/5 border border-emerald-500/15 hover:from-emerald-500/15 hover:to-emerald-600/10 transition-all active:scale-[0.98]"
        >
          <div className="w-11 h-11 rounded-xl bg-emerald-500/15 flex items-center justify-center">
            <PlayCircle className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="text-left flex-1">
            <p className="font-bold text-sm text-emerald-400">Смена не открыта</p>
            <p className="text-[11px] text-white/35">Нажмите чтобы открыть смену</p>
          </div>
        </button>

        <Drawer open={showOpen} onClose={() => setShowOpen(false)} title="Открыть смену">
          <div className="space-y-4">
            <Input
              type="number"
              label="Наличные в кассе"
              placeholder="Сумма на начало смены"
              value={cashStart}
              onChange={(e) => setCashStart(e.target.value)}
              min={0}
              autoFocus
            />
            <Button fullWidth size="lg" onClick={handleOpen}>
              <PlayCircle className="w-5 h-5" />
              Открыть смену
            </Button>
          </div>
        </Drawer>
      </>
    );
  }

  return (
    <>
      <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-500/8 to-emerald-600/4 border border-emerald-500/12">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping opacity-60" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-emerald-400">Смена открыта</span>
              <span className="text-[10px] text-white/30 flex items-center gap-0.5">
                <Clock className="w-3 h-3" />
                {shiftDuration()}
              </span>
            </div>
          </div>
          <button
            onClick={handleStartClose}
            disabled={isClosing}
            className="px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/10 text-red-400 text-xs font-bold hover:bg-red-500/20 transition-all active:scale-90 disabled:opacity-50 flex items-center gap-1.5"
          >
            {isClosing ? (
              <div className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <StopCircle className="w-3.5 h-3.5" />
            )}
            Закрыть
          </button>
        </div>
        {cashInRegister !== null && (
          <div className="flex items-center gap-2 mt-2 px-1">
            <Banknote className="w-3.5 h-3.5 text-emerald-400/50" />
            <span className="text-[11px] text-white/40">В кассе</span>
            <span className="text-sm font-black text-emerald-400 tabular-nums ml-auto">{fmtCur(cashInRegister)}</span>
          </div>
        )}
      </div>

      <Drawer
        open={showClose}
        onClose={() => setShowClose(false)}
        title="Закрытие смены"
      >
        <div className="space-y-4">
          {analytics && (
            <div className="space-y-3 stagger-children">
              <div className="grid grid-cols-3 gap-2">
                <div className="p-3 rounded-xl glass text-center">
                  <p className="text-lg font-black text-[var(--tg-theme-button-color,#6c5ce7)] tabular-nums">{analytics.totalChecks}</p>
                  <p className="text-[10px] text-white/35 font-medium">Чеков</p>
                </div>
                <div className="p-3 rounded-xl glass text-center">
                  <p className="text-lg font-black text-emerald-400 tabular-nums">{fmtCur(analytics.totalRevenue)}</p>
                  <p className="text-[10px] text-white/35 font-medium">Выручка</p>
                </div>
                <div className="p-3 rounded-xl glass text-center">
                  <p className="text-lg font-black text-amber-400 tabular-nums">{fmtCur(analytics.avgCheck)}</p>
                  <p className="text-[10px] text-white/35 font-medium">Ср. чек</p>
                </div>
              </div>

              {Object.keys(analytics.paymentBreakdown).length > 0 && (
                <div className="p-3 rounded-xl glass space-y-1.5">
                  <p className="text-xs font-bold text-white/40 mb-2">Способы оплаты</p>
                  {Object.entries(analytics.paymentBreakdown).map(([method, val]) => (
                    <div key={method} className="flex justify-between text-sm">
                      <span className="text-white/40">{pmLabel(method)} ({val.count})</span>
                      <span className="font-bold text-[var(--tg-theme-text-color,#e0e0e0)] tabular-nums">{fmtCur(val.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <Input
            type="number"
            label="Наличные в кассе (факт)"
            placeholder="Пересчитайте наличные"
            value={cashEnd}
            onChange={(e) => setCashEnd(e.target.value)}
            min={0}
          />
          <Input
            label="Примечание"
            placeholder="Комментарий к смене"
            value={closeNote}
            onChange={(e) => setCloseNote(e.target.value)}
          />
          <Button fullWidth size="lg" variant="danger" onClick={handleConfirmClose}>
            <StopCircle className="w-5 h-5" />
            Закрыть смену
          </Button>
        </div>
      </Drawer>

      {analytics && (
        <ShiftAnalytics
          open={showAnalytics}
          onClose={() => { setShowAnalytics(false); setAnalytics(null); }}
          analytics={analytics}
        />
      )}
    </>
  );
}

function pmLabel(m: string) {
  const map: Record<string, string> = { cash: 'Наличные', card: 'Карта', debt: 'Долг', bonus: 'Бонусы' };
  return map[m] || m;
}
