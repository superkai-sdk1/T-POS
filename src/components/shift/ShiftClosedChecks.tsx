import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useShiftStore } from '@/store/shift';
import type { Check } from '@/types';
import { Receipt, User, DoorOpen, Home, Building2, Warehouse } from 'lucide-react';
import { ListSkeleton } from '@/components/ui/Skeleton';

const spaceIconMap: Record<string, typeof Home> = {
  cabin_small: Home,
  cabin_big: Building2,
  hall: Warehouse,
};

const fmtCur = (n: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + '₽';

export function ShiftClosedChecks() {
  const activeShift = useShiftStore((s) => s.activeShift);
  const [checks, setChecks] = useState<Check[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeShift?.id) {
      setChecks([]);
      setIsLoading(false);
      return;
    }
    const { data } = await supabase
      .from('checks')
      .select('*, player:profiles!checks_player_id_fkey(*), space:spaces!checks_space_id_fkey(*)')
      .eq('shift_id', activeShift.id)
      .eq('status', 'closed')
      .order('closed_at', { ascending: false })
      .limit(100);
    if (data) {
      setChecks(
        data.map((c) => ({
          ...c,
          player: Array.isArray(c.player) ? c.player[0] : c.player,
          space: Array.isArray(c.space) ? c.space[0] : c.space,
        })) as Check[],
      );
    } else {
      setChecks([]);
    }
    setIsLoading(false);
  }, [activeShift?.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!activeShift) {
    return (
      <div className="text-center py-16">
        <Receipt className="w-16 h-16 text-[var(--c-muted)] mx-auto mb-4" />
        <p className="text-[var(--c-hint)]">Смена не открыта</p>
        <p className="text-[11px] text-[var(--c-muted)] mt-1">
          Откройте смену, чтобы видеть закрытые чеки
        </p>
      </div>
    );
  }

  if (isLoading) {
    return <ListSkeleton rows={4} />;
  }

  if (checks.length === 0) {
    return (
      <div className="text-center py-16">
        <Receipt className="w-16 h-16 text-[var(--c-muted)] mx-auto mb-4" />
        <p className="text-[var(--c-hint)]">Пока нет закрытых чеков</p>
        <p className="text-[11px] text-[var(--c-muted)] mt-1">
          Закрытые чеки этой смены появятся здесь
        </p>
      </div>
    );
  }

  const fmtDate = (d: string) =>
    new Date(d).toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div className="space-y-2">
      {checks.map((check) => {
        const hasSpace = !!check.space;
        const displayName = hasSpace
          ? check.space!.name
          : (() => {
              const names: string[] = [];
              if (check.player?.nickname) names.push(check.player.nickname);
              if (check.guest_names)
                names.push(...check.guest_names.split(', ').filter(Boolean));
              return names.length > 0 ? names.join(', ') : 'Без клиента';
            })();
        const Icon = hasSpace
          ? spaceIconMap[check.space!.type] || DoorOpen
          : User;

        return (
          <div
            key={check.id}
            className="p-4 rounded-2xl bg-[var(--c-surface)] border border-[var(--c-border)]"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-10 h-10 rounded-xl bg-[var(--c-accent)]/15 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-[var(--c-accent)]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-[var(--c-text)] truncate">
                    {displayName}
                  </p>
                  <p className="text-[11px] text-[var(--c-hint)] mt-0.5">
                    {check.closed_at ? fmtDate(check.closed_at) : '—'}
                  </p>
                </div>
              </div>
              <div className="font-black italic tabular-nums text-[var(--c-accent)] shrink-0">
                {fmtCur(check.total_amount || 0)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
