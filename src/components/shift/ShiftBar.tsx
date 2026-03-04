import { useState, useEffect, useCallback, useMemo } from 'react';
import { useShiftStore } from '@/store/shift';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Drawer } from '@/components/ui/Drawer';
import { PlayCircle, StopCircle, Clock, Banknote, Cake, X, AlertTriangle } from 'lucide-react';
import { hapticFeedback, hapticNotification } from '@/lib/telegram';
import { ShiftAnalytics } from './ShiftAnalytics';
import { supabase } from '@/lib/supabase';
import { useOnTableChange } from '@/hooks/useRealtimeSync';

export function ShiftBar() {
  const { activeShift, openShift, closeShift, getShiftAnalytics, birthdayNames, dismissBirthdays } = useShiftStore();
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

  const [openChecksCount, setOpenChecksCount] = useState(0);
  const [closeError, setCloseError] = useState('');

  const handleStartClose = async () => {
    if (!activeShift) return;
    hapticFeedback('medium');
    setIsClosing(true);
    setCloseError('');

    const { count } = await supabase
      .from('checks')
      .select('id', { count: 'exact', head: true })
      .eq('shift_id', activeShift.id)
      .eq('status', 'open');
    const openCount = count || 0;
    setOpenChecksCount(openCount);

    if (openCount > 0) {
      setIsClosing(false);
      setCloseError(`Невозможно закрыть смену: ${openCount} ${openCount === 1 ? 'открытый чек' : 'открытых чеков'}`);
      hapticNotification('error');
      return;
    }

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
      setCloseError('');
      setShowAnalytics(true);
    } else {
      setCloseError('Не удалось закрыть смену. Проверьте открытые чеки.');
      hapticNotification('error');
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

  const birthdayBanner = birthdayNames.length > 0 ? (
    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-pink-500/6 border border-pink-500/10 animate-fade-in mb-3">
      <Cake className="w-4 h-4 text-pink-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-bold text-pink-400">День рождения!</p>
        <p className="text-[10px] text-white/40 truncate">{birthdayNames.join(', ')}</p>
      </div>
      <button onClick={dismissBirthdays} className="w-6 h-6 rounded-md bg-white/5 flex items-center justify-center active:scale-90 transition-transform shrink-0">
        <X className="w-3 h-3 text-white/25" />
      </button>
    </div>
  ) : null;

  if (!activeShift) {
    return (
      <>
        {birthdayBanner}
        <button
          onClick={() => setShowOpen(true)}
          className="w-full flex items-center gap-2.5 p-3 rounded-xl bg-emerald-500/6 border border-emerald-500/10 active:scale-[0.98] transition-transform"
        >
          <div className="w-8 h-8 rounded-lg bg-emerald-500/12 flex items-center justify-center">
            <PlayCircle className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-left flex-1">
            <p className="font-semibold text-[13px] text-emerald-400">Открыть смену</p>
            <p className="text-[10px] text-white/25">Нажмите для начала работы</p>
          </div>
        </button>

        <Drawer open={showOpen} onClose={() => setShowOpen(false)} title="Открыть смену" size="sm">
          <div className="space-y-3">
            <Input
              type="number"
              label="Наличные в кассе"
              placeholder="Сумма на начало"
              value={cashStart}
              onChange={(e) => setCashStart(e.target.value)}
              compact
              min={0}
              autoFocus
            />
            <Button fullWidth onClick={handleOpen}>
              <PlayCircle className="w-4 h-4" />
              Открыть смену
            </Button>
          </div>
        </Drawer>
      </>
    );
  }

  return (
    <>
      {birthdayBanner}
      <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/8">
        <div className="relative shrink-0">
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-400 animate-ping opacity-50" />
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[11px] font-semibold text-emerald-400">Смена</span>
          <span className="text-[10px] text-white/25 flex items-center gap-0.5">
            <Clock className="w-2.5 h-2.5" />{shiftDuration()}
          </span>
          {cashInRegister !== null && (
            <>
              <span className="text-white/10">·</span>
              <span className="text-[10px] text-white/25 flex items-center gap-0.5">
                <Banknote className="w-2.5 h-2.5" />{fmtCur(cashInRegister)}
              </span>
            </>
          )}
        </div>
        <button
          onClick={handleStartClose}
          disabled={isClosing}
          className="px-2.5 py-1 rounded-lg bg-red-500/8 text-red-400 text-[11px] font-bold active:scale-90 transition-transform disabled:opacity-40 flex items-center gap-1"
        >
          {isClosing ? (
            <div className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <StopCircle className="w-3 h-3" />
          )}
          Закрыть
        </button>
      </div>

      {closeError && (
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-red-500/6 border border-red-500/10 animate-fade-in">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <p className="text-[11px] text-red-400 flex-1">{closeError}</p>
          <button onClick={() => setCloseError('')} className="w-5 h-5 rounded-md bg-white/5 flex items-center justify-center shrink-0">
            <X className="w-2.5 h-2.5 text-white/25" />
          </button>
        </div>
      )}

      <Drawer open={showClose} onClose={() => setShowClose(false)} title="Закрытие смены" size="md">
        <div className="space-y-3">
          {analytics && (
            <div className="space-y-2 stagger-children">
              <div className="grid grid-cols-3 gap-1.5">
                <div className="p-2.5 rounded-xl card text-center">
                  <p className="text-base font-black text-[var(--c-accent)] tabular-nums">{analytics.totalChecks}</p>
                  <p className="text-[9px] text-white/25 font-semibold">Чеков</p>
                </div>
                <div className="p-2.5 rounded-xl card text-center">
                  <p className="text-base font-black text-emerald-400 tabular-nums">{fmtCur(analytics.totalRevenue)}</p>
                  <p className="text-[9px] text-white/25 font-semibold">Выручка</p>
                </div>
                <div className="p-2.5 rounded-xl card text-center">
                  <p className="text-base font-black text-amber-400 tabular-nums">{fmtCur(analytics.avgCheck)}</p>
                  <p className="text-[9px] text-white/25 font-semibold">Ср. чек</p>
                </div>
              </div>

              {Object.keys(analytics.paymentBreakdown).length > 0 && (
                <div className="p-2.5 rounded-xl card space-y-1">
                  <p className="text-[10px] font-semibold text-white/25 uppercase tracking-wider mb-1">Оплата</p>
                  {Object.entries(analytics.paymentBreakdown).map(([method, val]) => (
                    <div key={method} className="flex justify-between text-[13px]">
                      <span className="text-white/35">{pmLabel(method)} ({val.count})</span>
                      <span className="font-bold text-[var(--c-text)] tabular-nums">{fmtCur(val.amount)}</span>
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
            compact
            min={0}
          />
          <Input
            label="Примечание"
            placeholder="Комментарий к смене"
            value={closeNote}
            onChange={(e) => setCloseNote(e.target.value)}
            compact
          />
          <Button fullWidth variant="danger" onClick={handleConfirmClose}>
            <StopCircle className="w-4 h-4" />
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
