import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useShiftStore } from '@/store/shift';
import type { ShiftAnalytics as SA } from '@/store/shift';
import type { Shift } from '@/types';
import { ShiftAnalytics } from './ShiftAnalytics';
import { Clock, Calendar, ChevronRight, Truck } from 'lucide-react';
import { ListSkeleton } from '@/components/ui/Skeleton';

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

  const shiftDuration = (s: Shift) => {
    if (!s.closed_at) return '';
    const ms = new Date(s.closed_at).getTime() - new Date(s.opened_at).getTime();
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}ч ${m}м`;
  };

  if (isLoading) {
    return <ListSkeleton rows={3} />;
  }

  return (
    <>
      {shifts.length === 0 ? (
        <div className="text-center py-16">
          <Calendar className="w-16 h-16 text-[var(--c-muted)] mx-auto mb-4" />
          <p className="text-[var(--c-hint)]">Нет закрытых смен</p>
        </div>
      ) : (
        <div className="space-y-2">
          {shifts.map((s) => (
            <button
              key={s.id}
              onClick={() => openAnalytics(s)}
              className="w-full text-left p-4 rounded-2xl bg-[var(--c-surface)] hover:bg-[var(--c-surface-hover)] border border-[var(--c-border)] transition-all active:scale-[0.98]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-xl bg-[var(--c-accent)]/15 flex items-center justify-center shrink-0">
                    <Truck className="w-5 h-5 text-[var(--c-accent)]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-[var(--c-text)]">
                        {fmtDate(s.opened_at)}
                      </span>
                      <span className="text-xs text-[var(--c-hint)]">
                        {fmtTime(s.opened_at)} — {s.closed_at ? fmtTime(s.closed_at) : '...'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[var(--c-hint)]">
                      <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" />{shiftDuration(s)}</span>
                      {s.note && <span className="truncate">· {s.note}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <ChevronRight className="w-4 h-4 text-[var(--c-muted)]" />
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
