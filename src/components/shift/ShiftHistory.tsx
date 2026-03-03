import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useShiftStore } from '@/store/shift';
import type { ShiftAnalytics as SA } from '@/store/shift';
import type { Shift } from '@/types';
import { ShiftAnalytics } from './ShiftAnalytics';
import { Clock, Calendar, ChevronRight, Truck } from 'lucide-react';

export function ShiftHistory() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAnalytics, setSelectedAnalytics] = useState<SA | null>(null);
  const { getShiftAnalytics } = useShiftStore();

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('shifts')
      .select('*')
      .eq('status', 'closed')
      .order('closed_at', { ascending: false })
      .limit(50);
    if (data) setShifts(data as Shift[]);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openAnalytics = async (shift: Shift) => {
    const data = await getShiftAnalytics(shift.id);
    if (data) setSelectedAnalytics(data);
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  const fmtTime = (d: string) => new Date(d).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const fmtCur = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + '₽';

  const shiftDuration = (s: Shift) => {
    if (!s.closed_at) return '';
    const ms = new Date(s.closed_at).getTime() - new Date(s.opened_at).getTime();
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}ч ${m}м`;
  };

  if (isLoading) {
    return (
      <div className="text-center py-20">
        <div className="w-8 h-8 border-2 border-[var(--tg-theme-button-color,#6c5ce7)] border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  return (
    <>
      {shifts.length === 0 ? (
        <div className="text-center py-16">
          <Calendar className="w-16 h-16 text-white/5 mx-auto mb-4" />
          <p className="text-[var(--tg-theme-hint-color,#888)]">Нет закрытых смен</p>
        </div>
      ) : (
        <div className="space-y-2">
          {shifts.map((s) => (
            <button
              key={s.id}
              onClick={() => openAnalytics(s)}
              className="w-full text-left p-4 rounded-2xl bg-white/5 hover:bg-white/8 border border-white/5 transition-all active:scale-[0.98]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-xl bg-[var(--tg-theme-button-color,#6c5ce7)]/15 flex items-center justify-center shrink-0">
                    <Truck className="w-5 h-5 text-[var(--tg-theme-button-color,#6c5ce7)]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-[var(--tg-theme-text-color,#e0e0e0)]">
                        {fmtDate(s.opened_at)}
                      </span>
                      <span className="text-xs text-[var(--tg-theme-hint-color,#888)]">
                        {fmtTime(s.opened_at)} — {s.closed_at ? fmtTime(s.closed_at) : '...'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-white/30">
                      <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" />{shiftDuration(s)}</span>
                      {s.note && <span className="truncate">· {s.note}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <ChevronRight className="w-4 h-4 text-white/20" />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {selectedAnalytics && (
        <ShiftAnalytics
          open={!!selectedAnalytics}
          onClose={() => setSelectedAnalytics(null)}
          analytics={selectedAnalytics}
        />
      )}
    </>
  );
}
