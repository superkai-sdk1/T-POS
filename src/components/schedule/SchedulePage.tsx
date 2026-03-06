import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Drawer } from '@/components/ui/Drawer';
import {
  Plus, DoorOpen, Calendar, Clock, User, X, Check,
  Home, Building2, Warehouse, MapPin, Edit2, CalendarPlus,
} from 'lucide-react';
import { TimeInput } from '@/components/ui/TimeInput';
import { hapticFeedback, hapticNotification } from '@/lib/telegram';
import { useOnTableChange } from '@/hooks/useRealtimeSync';
import { useAuthStore } from '@/store/auth';
import { usePOSStore } from '@/store/pos';
import type { Space, Booking, BookingStatus, OffsiteEvent, EventStatus, Profile } from '@/types';

type ScheduleItem =
  | { kind: 'booking'; data: Booking; time: number }
  | { kind: 'event'; data: OffsiteEvent; time: number };

type NewType = 'booking' | 'event';

const bookingStatusLabels: Record<BookingStatus, string> = {
  booked: 'Бронь',
  active: 'Активно',
  completed: 'Готово',
  cancelled: 'Отмена',
};
const bookingStatusVariants: Record<BookingStatus, 'default' | 'success' | 'warning' | 'danger'> = {
  booked: 'warning',
  active: 'success',
  completed: 'default',
  cancelled: 'danger',
};
const eventStatusLabels: Record<EventStatus, string> = {
  planned: 'План',
  completed: 'Готово',
  cancelled: 'Отмена',
};
const eventStatusVariants: Record<EventStatus, 'warning' | 'success' | 'danger'> = {
  planned: 'warning',
  completed: 'success',
  cancelled: 'danger',
};

const spaceIconMap: Record<string, typeof Home> = {
  cabin_small: Home,
  cabin_big: Building2,
  hall: Warehouse,
};

interface SchedulePageProps {
  onOpenCheck?: () => void;
}

export function SchedulePage({ onOpenCheck }: SchedulePageProps) {
  const user = useAuthStore((s) => s.user);
  const createCheck = usePOSStore((s) => s.createCheck);
  const selectCheck = usePOSStore((s) => s.selectCheck);

  const [spaces, setSpaces] = useState<Space[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [events, setEvents] = useState<OffsiteEvent[]>([]);

  const [showNew, setShowNew] = useState(false);
  const [newType, setNewType] = useState<NewType>('booking');

  const [selectedSpace, setSelectedSpace] = useState<Space | null>(null);
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [rentalAmount, setRentalAmount] = useState('');
  const [bookingNote, setBookingNote] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [clients, setClients] = useState<Profile[]>([]);
  const [selectedClient, setSelectedClient] = useState<Profile | null>(null);

  const [evName, setEvName] = useState('');
  const [evLocation, setEvLocation] = useState('');
  const [evAmount, setEvAmount] = useState('');
  const [evNote, setEvNote] = useState('');

  const [saving, setSaving] = useState(false);

  const [showEventDetail, setShowEventDetail] = useState<OffsiteEvent | null>(null);
  const [editingEvent, setEditingEvent] = useState<OffsiteEvent | null>(null);
  const [checkTotals, setCheckTotals] = useState<Record<string, { total: number; method: string | null; status: string }>>({});

  const load = useCallback(async () => {
    const { data: sp } = await supabase.from('spaces').select('*').eq('is_active', true).order('type');
    if (sp) setSpaces(sp as Space[]);

    const { data: bk } = await supabase
      .from('bookings')
      .select('*, space:spaces(*), client:profiles!bookings_client_id_fkey(nickname, photo_url)')
      .order('start_time', { ascending: true })
      .limit(200);
    if (bk) setBookings(bk.map((b) => ({
      ...b,
      space: Array.isArray(b.space) ? b.space[0] : b.space,
      client: Array.isArray(b.client) ? b.client[0] : b.client,
    })) as Booking[]);

    const { data: ev } = await supabase
      .from('events')
      .select('*')
      .order('start_time', { ascending: true })
      .limit(200);
    if (ev) setEvents(ev as OffsiteEvent[]);

    const checkIds = [
      ...(bk || []).filter((b) => b.check_id).map((b) => b.check_id as string),
      ...(ev || []).filter((e) => e.check_id).map((e) => e.check_id as string),
    ];
    if (checkIds.length > 0) {
      const { data: checks } = await supabase
        .from('checks')
        .select('id, total_amount, payment_method, status')
        .in('id', checkIds);
      if (checks) {
        const map: Record<string, { total: number; method: string | null; status: string }> = {};
        for (const c of checks) map[c.id] = { total: c.total_amount, method: c.payment_method, status: c.status };
        setCheckTotals(map);
      }
    }
  }, []);

  const scheduleTables = useMemo(() => ['bookings', 'events'], []);
  useOnTableChange(scheduleTables, load);

  useEffect(() => { load(); }, [load]);

  const schedule = useMemo(() => {
    const items: ScheduleItem[] = [];
    for (const b of bookings) {
      if (b.status === 'completed' || b.status === 'cancelled') continue;
      items.push({ kind: 'booking', data: b, time: new Date(b.start_time).getTime() });
    }
    for (const e of events) {
      if (e.status === 'completed' || e.status === 'cancelled') continue;
      items.push({ kind: 'event', data: e, time: new Date(e.start_time).getTime() });
    }
    items.sort((a, b) => a.time - b.time);
    return items;
  }, [bookings, events]);

  const pastItems = useMemo(() => {
    const items: ScheduleItem[] = [];
    for (const b of bookings) {
      if (b.status !== 'completed' && b.status !== 'cancelled') continue;
      items.push({ kind: 'booking', data: b, time: new Date(b.start_time).getTime() });
    }
    for (const e of events) {
      if (e.status !== 'completed' && e.status !== 'cancelled') continue;
      items.push({ kind: 'event', data: e, time: new Date(e.start_time).getTime() });
    }
    items.sort((a, b) => b.time - a.time);
    return items;
  }, [bookings, events]);

  const [tab, setTab] = useState<'upcoming' | 'history'>('upcoming');
  const displayItems = tab === 'upcoming' ? schedule : pastItems;

  const todayBookings = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return bookings.filter((b) => b.start_time.slice(0, 10) === today && (b.status === 'booked' || b.status === 'active'));
  }, [bookings]);

  const calcAmount = useCallback(() => {
    if (!selectedSpace || !startTime) return;
    if (selectedSpace.hourly_rate === null) return;
    if (endTime) {
      const [sh, sm] = startTime.split(':').map(Number);
      const [eh, em] = endTime.split(':').map(Number);
      const hours = (eh * 60 + em - sh * 60 - sm) / 60;
      if (hours > 0) {
        setRentalAmount(String(Math.round(selectedSpace.hourly_rate * hours)));
      }
    }
  }, [selectedSpace, startTime, endTime]);
  useEffect(() => { calcAmount(); }, [calcAmount]);

  const searchClients = useCallback(async (q: string) => {
    setClientSearch(q);
    if (q.length < 1) { setClients([]); return; }
    const { data } = await supabase.from('profiles').select('*').ilike('nickname', `%${q}%`).limit(10);
    if (data) setClients(data as Profile[]);
  }, []);

  const resetForm = () => {
    setSelectedSpace(null);
    setStartDate(new Date().toISOString().slice(0, 10));
    setStartTime('');
    setEndTime('');
    setRentalAmount('');
    setBookingNote('');
    setClientSearch('');
    setClients([]);
    setSelectedClient(null);
    setEvName('');
    setEvLocation('');
    setEvAmount('');
    setEvNote('');
    setEditingEvent(null);
  };

  const openNewBooking = (space?: Space) => {
    resetForm();
    setNewType('booking');
    if (space) setSelectedSpace(space);
    setShowNew(true);
  };

  const openNewEvent = () => {
    resetForm();
    setNewType('event');
    setShowNew(true);
  };

  const openEditEvent = (e: OffsiteEvent) => {
    setEditingEvent(e);
    setEvName(e.name);
    setEvLocation(e.location);
    setStartDate(e.start_time.slice(0, 10));
    setStartTime(new Date(e.start_time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));
    setEndTime(new Date(e.end_time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));
    setEvAmount(String(e.amount));
    setEvNote(e.note || '');
    setNewType('event');
    setShowNew(true);
    setShowEventDetail(null);
  };

  const handleSaveBooking = async () => {
    if (!selectedSpace || !startDate || !startTime) return;
    setSaving(true);
    const startISO = new Date(`${startDate}T${startTime}`).toISOString();
    const endISO = endTime
      ? new Date(`${startDate}T${endTime}`).toISOString()
      : new Date(`${startDate}T${startTime}`).toISOString();
    await supabase.from('bookings').insert({
      space_id: selectedSpace.id,
      client_id: selectedClient?.id || null,
      start_time: startISO,
      end_time: endISO,
      rental_amount: Number(rentalAmount) || 0,
      note: bookingNote || null,
      created_by: user?.id,
    });
    setSaving(false);
    hapticNotification('success');
    setShowNew(false);
    load();
  };

  const handleSaveEvent = async () => {
    if (!evName.trim() || !evLocation.trim() || !startDate || !startTime || !endTime) return;
    setSaving(true);
    const startISO = new Date(`${startDate}T${startTime}`).toISOString();
    const endISO = new Date(`${startDate}T${endTime}`).toISOString();
    const payload = {
      name: evName.trim(),
      location: evLocation.trim(),
      start_time: startISO,
      end_time: endISO,
      amount: Number(evAmount) || 0,
      note: evNote || null,
    };
    if (editingEvent) {
      await supabase.from('events').update(payload).eq('id', editingEvent.id);
    } else {
      await supabase.from('events').insert({ ...payload, created_by: user?.id });
    }
    setSaving(false);
    hapticNotification('success');
    setShowNew(false);
    load();
  };

  const updateBookingStatus = async (id: string, status: BookingStatus) => {
    hapticFeedback('medium');
    await supabase.from('bookings').update({ status }).eq('id', id);
    load();
  };

  const startBooking = async (booking: Booking) => {
    hapticFeedback('medium');

    await usePOSStore.getState().loadOpenChecks();
    const existingChecks = usePOSStore.getState().openChecks;
    let checkToOpen = existingChecks.find((c) => c.space_id === booking.space_id && c.status === 'open');

    if (checkToOpen) {
      await selectCheck(checkToOpen);
    } else {
      const check = await createCheck(booking.client_id || null, booking.space_id);
      if (!check) {
        hapticNotification('error');
        load();
        return;
      }
      checkToOpen = check;
    }

    await supabase.from('bookings').update({
      status: 'active' as BookingStatus,
      check_id: checkToOpen.id,
    }).eq('id', booking.id);

    hapticNotification('success');
    load();
    onOpenCheck?.();
  };

  const startEvent = async (event: OffsiteEvent) => {
    hapticFeedback('medium');

    const check = await createCheck(null);
    if (!check) {
      hapticNotification('error');
      return;
    }

    await supabase.from('events').update({
      status: 'completed' as EventStatus,
      check_id: check.id,
    }).eq('id', event.id);

    hapticNotification('success');
    setShowEventDetail(null);
    load();
    onOpenCheck?.();
  };

  const updateEventStatus = async (id: string, status: EventStatus) => {
    hapticFeedback('medium');
    await supabase.from('events').update({ status }).eq('id', id);
    setShowEventDetail(null);
    load();
  };

  const fmtCur = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + '₽';
  const fmtTime = (d: string) => new Date(d).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  const fmtDateFull = (d: string) => new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });

  const isToday = (d: string) => new Date(d).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
  const isTomorrow = (d: string) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return new Date(d).toISOString().slice(0, 10) === tomorrow.toISOString().slice(0, 10);
  };
  const dateLabel = (d: string) => {
    if (isToday(d)) return 'Сегодня';
    if (isTomorrow(d)) return 'Завтра';
    return fmtDate(d);
  };

  const groupedItems = useMemo(() => {
    const groups: { label: string; items: ScheduleItem[] }[] = [];
    let currentLabel = '';
    for (const item of displayItems) {
      const d = item.kind === 'booking' ? item.data.start_time : item.data.start_time;
      const label = dateLabel(d);
      if (label !== currentLabel) {
        currentLabel = label;
        groups.push({ label, items: [item] });
      } else {
        groups[groups.length - 1].items.push(item);
      }
    }
    return groups;
  }, [displayItems]);

  return (
    <div className="space-y-4">
      {/* Space status cards */}
      <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1">
        {spaces.map((s) => {
          const active = todayBookings.filter((b) => b.space_id === s.id);
          const isBusy = active.length > 0;
          const busyClient = isBusy ? (active[0].client as { nickname: string } | null)?.nickname : null;
          const Icon = spaceIconMap[s.type] || DoorOpen;
          return (
            <button
              key={s.id}
              onClick={() => openNewBooking(s)}
              className={`flex-shrink-0 w-[100px] p-2.5 rounded-xl text-center transition-transform active:scale-[0.96] border ${
                isBusy ? 'bg-[var(--c-warning-bg)] border-[var(--c-border)]' : 'bg-[var(--c-surface)] border-[var(--c-border)]'
              }`}
            >
              <div className="flex items-center justify-center gap-1 mb-1">
                <Icon className="w-4 h-4 text-indigo-400" />
                <div className={`w-1.5 h-1.5 rounded-full ${isBusy ? 'bg-[var(--c-warning)]' : 'bg-[var(--c-success)]'}`} />
              </div>
              <p className="text-[11px] font-bold text-[var(--c-text)] leading-tight truncate">{s.name}</p>
              {isBusy && busyClient ? (
                <p className="text-[9px] text-[var(--c-hint)] truncate mt-0.5">{busyClient}</p>
              ) : (
                <p className="text-[9px] text-[var(--c-muted)] mt-0.5">{s.hourly_rate ? `${s.hourly_rate}₽/ч` : 'Своя цена'}</p>
              )}
            </button>
          );
        })}
        <button
          onClick={openNewEvent}
          className="flex-shrink-0 w-[100px] p-2.5 rounded-xl text-center transition-transform active:scale-[0.96] border bg-teal-500/4 border-teal-500/8"
        >
          <MapPin className="w-4 h-4 text-teal-400 mx-auto mb-1" />
          <p className="text-[11px] font-bold text-[var(--c-text)] leading-tight">Выезд</p>
          <p className="text-[9px] text-[var(--c-muted)] mt-0.5">Мероприятие</p>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-0.5 rounded-lg bg-[var(--c-surface)]">
        {(['upcoming', 'history'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all ${
              tab === t ? 'bg-[var(--c-accent)] text-white shadow-sm' : 'text-[var(--c-hint)]'
            }`}
          >
            {t === 'upcoming' ? `Ближайшие (${schedule.length})` : `История (${pastItems.length})`}
          </button>
        ))}
      </div>

      {/* Grouped list */}
      {displayItems.length === 0 ? (
        <div className="text-center py-14 animate-fade-in">
          <Calendar className="w-10 h-10 text-[var(--c-muted)] mx-auto mb-2" />
          <p className="text-[13px] text-[var(--c-hint)] font-medium">
            {tab === 'upcoming' ? 'Нет предстоящих' : 'Нет истории'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {groupedItems.map((group) => (
            <div key={group.label}>
              <p className="text-[10px] font-semibold text-[var(--c-muted)] uppercase tracking-wider mb-1.5 px-1">{group.label}</p>
              <div className="space-y-1.5">
                {group.items.map((item) => {
                  if (item.kind === 'booking') {
                    const b = item.data;
                    const Icon = spaceIconMap[b.space?.type || ''] || DoorOpen;
                    return (
                      <div key={`b-${b.id}`} className="flex rounded-xl overflow-hidden">
                        <div className="w-[3px] bg-indigo-500/40 shrink-0" />
                        <div className="flex-1 p-3 card ml-0 rounded-l-none space-y-1.5" style={{ borderLeft: 'none', borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <div className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
                                <Icon className="w-3.5 h-3.5 text-indigo-400" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-[13px] font-semibold text-[var(--c-text)] truncate leading-tight">
                                  {b.space?.name || 'Бронь'}
                                </p>
                                <p className="text-[10px] text-[var(--c-muted)]">
                                  {fmtTime(b.start_time)}{b.end_time && b.end_time !== b.start_time ? ` — ${fmtTime(b.end_time)}` : ' — ...'}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Badge variant={bookingStatusVariants[b.status]} size="sm">{bookingStatusLabels[b.status]}</Badge>
                              <span className="text-[13px] font-bold tabular-nums text-[var(--c-text)]">
                                {b.check_id && checkTotals[b.check_id]?.status === 'closed'
                                  ? fmtCur(checkTotals[b.check_id].total)
                                  : fmtCur(b.rental_amount)}
                              </span>
                            </div>
                          </div>
                          {b.client && (
                            <div className="flex items-center gap-1 text-[10px] text-[var(--c-hint)]">
                              <User className="w-3 h-3" />
                              {(b.client as { nickname: string }).nickname}
                            </div>
                          )}
                          {b.check_id && checkTotals[b.check_id]?.status === 'closed' && (
                            <div className="flex items-center gap-1 text-[10px] text-emerald-400/50">
                              <Check className="w-3 h-3" />Чек закрыт
                            </div>
                          )}
                          {(b.status === 'booked' || b.status === 'active') && (
                            <div className="flex gap-1 pt-0.5">
                              {b.status === 'booked' && (
                                <button onClick={() => startBooking(b)} className="flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--c-success-bg)] text-[10px] font-semibold text-[var(--c-success)] active:scale-95 transition-transform">
                                  <Check className="w-2.5 h-2.5" />Начать
                                </button>
                              )}
                              <button onClick={() => updateBookingStatus(b.id, 'completed')} className="flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--c-info-bg)] text-[10px] font-semibold text-[var(--c-info)] active:scale-95 transition-transform">
                                <Check className="w-2.5 h-2.5" />Готово
                              </button>
                              <button onClick={() => updateBookingStatus(b.id, 'cancelled')} className="flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--c-danger-bg)] text-[10px] font-semibold text-[var(--c-danger)] active:scale-95 transition-transform">
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  } else {
                    const e = item.data;
                    return (
                      <button
                        key={`e-${e.id}`}
                        onClick={() => setShowEventDetail(e)}
                        className="w-full flex rounded-xl overflow-hidden text-left active:scale-[0.99] transition-transform"
                      >
                        <div className="w-[3px] bg-teal-500/40 shrink-0" />
                        <div className="flex-1 p-3 card ml-0 rounded-l-none" style={{ borderLeft: 'none', borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <div className="w-7 h-7 rounded-lg bg-teal-500/10 flex items-center justify-center shrink-0">
                                <MapPin className="w-3.5 h-3.5 text-teal-400" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-[13px] font-semibold text-[var(--c-text)] truncate leading-tight">{e.name}</p>
                                <p className="text-[10px] text-[var(--c-muted)]">{fmtTime(e.start_time)} — {fmtTime(e.end_time)} · {e.location}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Badge variant={eventStatusVariants[e.status]} size="sm">{eventStatusLabels[e.status]}</Badge>
                              <span className="text-[13px] font-bold tabular-nums text-[var(--c-text)]">
                                {e.check_id && checkTotals[e.check_id]?.status === 'closed'
                                  ? fmtCur(checkTotals[e.check_id].total)
                                  : fmtCur(e.amount)}
                              </span>
                            </div>
                          </div>
                          {e.check_id && checkTotals[e.check_id]?.status === 'closed' && (
                            <div className="flex items-center gap-1 text-[10px] text-[var(--c-success)] mt-1">
                              <Check className="w-3 h-3" />Чек закрыт
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  }
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Event detail */}
      <Drawer
        open={!!showEventDetail}
        onClose={() => setShowEventDetail(null)}
        title={showEventDetail?.name || 'Выезд'}
        size="md"
      >
        {showEventDetail && (
          <div className="space-y-3">
            <div className="space-y-2">
              {[
                { label: 'Место', value: showEventDetail.location },
                { label: 'Дата', value: fmtDateFull(showEventDetail.start_time) },
                { label: 'Время', value: `${fmtTime(showEventDetail.start_time)} — ${fmtTime(showEventDetail.end_time)}` },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between text-[13px]">
                  <span className="text-[var(--c-hint)]">{label}</span>
                  <span className="text-[var(--c-text)] font-medium">{value}</span>
                </div>
              ))}
              <div className="flex justify-between text-[13px]">
                <span className="text-[var(--c-hint)]">Сумма</span>
                <span className="font-bold text-[var(--c-accent)]">{fmtCur(showEventDetail.amount)}</span>
              </div>
              {showEventDetail.note && (
                <div className="flex justify-between text-[13px]">
                  <span className="text-[var(--c-hint)]">Примечание</span>
                  <span className="text-[var(--c-text)] text-right max-w-[60%]">{showEventDetail.note}</span>
                </div>
              )}
              <div className="flex justify-between items-center text-[13px]">
                <span className="text-[var(--c-hint)]">Статус</span>
                <Badge variant={eventStatusVariants[showEventDetail.status]} size="sm">{eventStatusLabels[showEventDetail.status]}</Badge>
              </div>
            </div>

            {showEventDetail.status === 'planned' && (
              <div className="space-y-2 pt-1">
                <Button fullWidth onClick={() => startEvent(showEventDetail)}>
                  <Check className="w-4 h-4" />Начать и открыть в кассе
                </Button>
                <div className="flex gap-2">
                  <Button fullWidth variant="secondary" onClick={() => openEditEvent(showEventDetail)}>
                    <Edit2 className="w-4 h-4" />Изменить
                  </Button>
                  <Button variant="danger" onClick={() => updateEventStatus(showEventDetail.id, 'cancelled')}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            {showEventDetail.check_id && checkTotals[showEventDetail.check_id] && (
              <div className="p-2.5 rounded-xl card">
                <p className="text-[10px] text-[var(--c-muted)] mb-1">Привязанный чек</p>
                {checkTotals[showEventDetail.check_id].status === 'closed' ? (
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-[var(--c-success)] font-semibold">Закрыт</span>
                    <span className="text-[13px] font-bold text-[var(--c-success)]">{fmtCur(checkTotals[showEventDetail.check_id].total)}</span>
                  </div>
                ) : (
                  <p className="text-[13px] text-[var(--c-warning)] font-semibold">Открыт в кассе</p>
                )}
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* Create/edit form */}
      <Drawer
        open={showNew}
        onClose={() => setShowNew(false)}
        title={newType === 'booking' ? (editingEvent ? 'Редактировать' : 'Новое бронирование') : (editingEvent ? 'Редактировать выезд' : 'Новый выезд')}
      >
        <div className="space-y-3">
          {!editingEvent && (
            <div className="flex gap-1 p-0.5 rounded-lg bg-[var(--c-surface)]">
              <button
                onClick={() => setNewType('booking')}
                className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[11px] font-semibold transition-all ${
                  newType === 'booking' ? 'bg-indigo-500/15 text-indigo-300' : 'text-[var(--c-hint)]'
                }`}
              >
                <DoorOpen className="w-3 h-3" />Бронь
              </button>
              <button
                onClick={() => setNewType('event')}
                className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[11px] font-semibold transition-all ${
                  newType === 'event' ? 'bg-teal-500/15 text-teal-300' : 'text-[var(--c-hint)]'
                }`}
              >
                <MapPin className="w-3 h-3" />Выезд
              </button>
            </div>
          )}

          {newType === 'booking' && (
            <>
              {!selectedSpace && (
                <div>
                  <p className="text-[10px] font-semibold text-[var(--c-muted)] uppercase tracking-wider mb-1.5">Пространство</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {spaces.map((s) => {
                      const Icon = spaceIconMap[s.type] || DoorOpen;
                      return (
                        <button
                          key={s.id}
                          onClick={() => setSelectedSpace(s)}
                          className="p-2.5 rounded-xl card-interactive text-center"
                        >
                          <Icon className="w-4 h-4 text-indigo-400 mx-auto mb-1" />
                          <p className="text-[11px] font-medium text-[var(--c-text)]">{s.name}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {selectedSpace && (
                <>
                  <div className="flex items-center gap-2 p-2.5 rounded-xl card">
                    {(() => { const Icon = spaceIconMap[selectedSpace.type] || DoorOpen; return <Icon className="w-4 h-4 text-indigo-400 shrink-0" />; })()}
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-[var(--c-text)]">{selectedSpace.name}</p>
                      <p className="text-[10px] text-[var(--c-muted)]">
                        {selectedSpace.hourly_rate ? `${selectedSpace.hourly_rate}₽/ч` : 'Ручной ввод'}
                      </p>
                    </div>
                    <button onClick={() => setSelectedSpace(null)} className="w-6 h-6 rounded-md bg-[var(--c-surface)] flex items-center justify-center active:scale-90">
                      <X className="w-3 h-3 text-[var(--c-muted)]" />
                    </button>
                  </div>

                  <Input compact type="date" label="Дата" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  <TimeInput label="Время начала" value={startTime} onChange={setStartTime} />
                  <p className="text-[11px] text-[var(--c-muted)] -mt-1 px-1">
                    Конечное время рассчитается при закрытии чека
                  </p>
                  <Input
                    compact
                    type="number"
                    label="Предварительная сумма"
                    placeholder={selectedSpace.hourly_rate ? `${selectedSpace.hourly_rate}₽/ч` : 'Сумма'}
                    value={rentalAmount}
                    onChange={(e) => setRentalAmount(e.target.value)}
                    min={0}
                  />

                  <div>
                    <p className="text-[10px] font-semibold text-[var(--c-muted)] uppercase tracking-wider mb-1.5">Клиент</p>
                    {selectedClient ? (
                      <div className="flex items-center gap-2 p-2 rounded-xl card">
                        <User className="w-3.5 h-3.5 text-[var(--c-accent)]" />
                        <span className="text-[13px] font-medium text-[var(--c-text)]">{selectedClient.nickname}</span>
                        <button onClick={() => setSelectedClient(null)} className="ml-auto w-5 h-5 rounded bg-[var(--c-surface)] flex items-center justify-center active:scale-90">
                          <X className="w-3 h-3 text-[var(--c-muted)]" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <Input compact placeholder="Поиск по нику" value={clientSearch} onChange={(e) => searchClients(e.target.value)} />
                        {clients.length > 0 && (
                          <div className="space-y-0.5 mt-1 max-h-28 overflow-y-auto">
                            {clients.map((c) => (
                              <button key={c.id} onClick={() => { setSelectedClient(c); setClients([]); setClientSearch(''); }}
                                className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-[var(--c-surface-hover)] text-[13px] text-[var(--c-text)] transition-colors active:scale-[0.98]"
                              >
                                <User className="w-3.5 h-3.5 text-[var(--c-muted)]" />
                                {c.nickname}
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <Input compact label="Примечание" placeholder="Комментарий" value={bookingNote} onChange={(e) => setBookingNote(e.target.value)} />

                  <Button fullWidth onClick={handleSaveBooking} loading={saving} disabled={saving || !startTime}>
                    <CalendarPlus className="w-4 h-4" />
                    Забронировать
                  </Button>
                </>
              )}
            </>
          )}

          {newType === 'event' && (
            <>
              <Input compact label="Название" placeholder="Мероприятие" value={evName} onChange={(e) => setEvName(e.target.value)} autoFocus />
              <Input compact label="Место" placeholder="Адрес" value={evLocation} onChange={(e) => setEvLocation(e.target.value)} />
              <Input compact type="date" label="Дата" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <TimeInput label="Начало" value={startTime} onChange={setStartTime} />
                <TimeInput label="Конец" value={endTime} onChange={setEndTime} />
              </div>
              <Input compact type="number" label="Сумма (₽)" placeholder="0" value={evAmount} onChange={(e) => setEvAmount(e.target.value)} min={0} />
              <Input compact label="Примечание" placeholder="Доп. информация" value={evNote} onChange={(e) => setEvNote(e.target.value)} />
              <Button fullWidth onClick={handleSaveEvent} loading={saving} disabled={saving || !evName.trim() || !evLocation.trim()}>
                <CalendarPlus className="w-4 h-4" />
                {editingEvent ? 'Сохранить' : 'Создать выезд'}
              </Button>
            </>
          )}
        </div>
      </Drawer>
    </div>
  );
}
