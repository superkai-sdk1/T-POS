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
import { useAuthStore } from '@/store/auth';
import { usePOSStore } from '@/store/pos';
import type { Space, Booking, BookingStatus, OffsiteEvent, EventStatus, Profile } from '@/types';

type ScheduleItem =
  | { kind: 'booking'; data: Booking; time: number }
  | { kind: 'event'; data: OffsiteEvent; time: number };

type NewType = 'booking' | 'event';

const bookingStatusLabels: Record<BookingStatus, string> = {
  booked: 'Забронировано',
  active: 'Активно',
  completed: 'Завершено',
  cancelled: 'Отменено',
};
const bookingStatusVariants: Record<BookingStatus, 'default' | 'success' | 'warning' | 'danger'> = {
  booked: 'warning',
  active: 'success',
  completed: 'default',
  cancelled: 'danger',
};
const eventStatusLabels: Record<EventStatus, string> = {
  planned: 'Запланировано',
  completed: 'Завершено',
  cancelled: 'Отменено',
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

  // Booking form
  const [selectedSpace, setSelectedSpace] = useState<Space | null>(null);
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [rentalAmount, setRentalAmount] = useState('');
  const [bookingNote, setBookingNote] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [clients, setClients] = useState<Profile[]>([]);
  const [selectedClient, setSelectedClient] = useState<Profile | null>(null);

  // Event form
  const [evName, setEvName] = useState('');
  const [evLocation, setEvLocation] = useState('');
  const [evAmount, setEvAmount] = useState('');
  const [evNote, setEvNote] = useState('');

  const [saving, setSaving] = useState(false);

  // Event detail/edit
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

  useEffect(() => { load(); }, [load]);

  const schedule = useMemo(() => {
    const now = Date.now();
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

  // Auto-calc rental
  const calcAmount = useCallback(() => {
    if (!selectedSpace || !startTime || !endTime) return;
    if (selectedSpace.hourly_rate === null) return;
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const hours = (eh * 60 + em - sh * 60 - sm) / 60;
    if (hours > 0) {
      setRentalAmount(String(Math.round(selectedSpace.hourly_rate * hours)));
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
    if (!selectedSpace || !startDate || !startTime || !endTime) return;
    setSaving(true);
    const startISO = new Date(`${startDate}T${startTime}`).toISOString();
    const endISO = new Date(`${startDate}T${endTime}`).toISOString();
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

  return (
    <div className="space-y-4">
      {/* Quick actions: spaces + event */}
      <div className="grid grid-cols-4 gap-2">
        {spaces.map((s) => {
          const active = todayBookings.filter((b) => b.space_id === s.id);
          const isBusy = active.length > 0;
          const Icon = spaceIconMap[s.type] || DoorOpen;
          return (
            <button
              key={s.id}
              onClick={() => openNewBooking(s)}
              className={`p-3 rounded-2xl text-center transition-all active:scale-[0.96] border ${
                isBusy
                  ? 'bg-amber-500/8 border-amber-500/15'
                  : 'bg-white/5 border-white/5 hover:bg-white/8'
              }`}
            >
              <Icon className="w-5 h-5 text-indigo-400 mx-auto mb-1" />
              <p className="text-[11px] font-bold text-[var(--tg-theme-text-color,#e0e0e0)] leading-tight">{s.name}</p>
              <p className="text-[10px] text-white/30 mt-0.5">
                {s.hourly_rate ? `${s.hourly_rate}₽/ч` : 'Своя цена'}
              </p>
              {isBusy && <Badge variant="warning" className="mt-1.5">Занято</Badge>}
            </button>
          );
        })}
        <button
          onClick={openNewEvent}
          className="p-3 rounded-2xl text-center transition-all active:scale-[0.96] border bg-teal-500/6 border-teal-500/12 hover:bg-teal-500/10"
        >
          <MapPin className="w-5 h-5 text-teal-400 mx-auto mb-1" />
          <p className="text-[11px] font-bold text-[var(--tg-theme-text-color,#e0e0e0)] leading-tight">Выезд</p>
          <p className="text-[10px] text-white/30 mt-0.5">Мероприятие</p>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-white/4 border border-white/5">
        {(['upcoming', 'history'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              tab === t ? 'bg-[var(--tg-theme-button-color,#6c5ce7)] text-white' : 'text-white/40'
            }`}
          >
            {t === 'upcoming' ? `Ближайшие (${schedule.length})` : `История (${pastItems.length})`}
          </button>
        ))}
      </div>

      {/* Unified list */}
      {displayItems.length === 0 ? (
        <div className="text-center py-12">
          <Calendar className="w-10 h-10 text-white/8 mx-auto mb-3" />
          <p className="text-sm text-[var(--tg-theme-hint-color,#888)]">
            {tab === 'upcoming' ? 'Нет предстоящих событий' : 'Нет истории'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayItems.map((item) => {
            if (item.kind === 'booking') {
              const b = item.data;
              const Icon = spaceIconMap[b.space?.type || ''] || DoorOpen;
              return (
                <div key={`b-${b.id}`} className="p-3.5 rounded-2xl glass space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-indigo-500/12 flex items-center justify-center shrink-0">
                        <Icon className="w-4.5 h-4.5 text-indigo-400" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[var(--tg-theme-text-color,#e0e0e0)]">
                          {b.space?.name || 'Бронь'}
                        </p>
                        <p className="text-[10px] text-white/30">
                          {dateLabel(b.start_time)} · {fmtTime(b.start_time)} — {fmtTime(b.end_time)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={bookingStatusVariants[b.status]}>{bookingStatusLabels[b.status]}</Badge>
                      {b.check_id && checkTotals[b.check_id]?.status === 'closed' ? (
                        <span className="font-bold text-sm text-emerald-400 tabular-nums">{fmtCur(checkTotals[b.check_id].total)}</span>
                      ) : (
                        <span className="font-bold text-sm text-[var(--tg-theme-button-color,#6c5ce7)] tabular-nums">{fmtCur(b.rental_amount)}</span>
                      )}
                    </div>
                  </div>
                  {b.client && (
                    <div className="flex items-center gap-1.5 text-xs text-white/40">
                      <User className="w-3 h-3" />
                      {(b.client as { nickname: string }).nickname}
                    </div>
                  )}
                  {b.note && <p className="text-xs text-white/25">{b.note}</p>}
                  {b.check_id && checkTotals[b.check_id]?.status === 'closed' && (
                    <div className="flex items-center gap-1.5 text-[10px] text-emerald-400/60 pt-0.5">
                      <Check className="w-3 h-3" />
                      Чек закрыт · {fmtCur(checkTotals[b.check_id].total)}
                    </div>
                  )}
                  {b.check_id && checkTotals[b.check_id]?.status === 'open' && (
                    <div className="flex items-center gap-1.5 text-[10px] text-amber-400/60 pt-0.5">
                      <Clock className="w-3 h-3" />
                      Чек открыт в кассе
                    </div>
                  )}
                  {(b.status === 'booked' || b.status === 'active') && (
                    <div className="flex gap-1.5 pt-1">
                      {b.status === 'booked' && (
                        <button onClick={() => startBooking(b)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-[10px] font-semibold text-emerald-400 active:scale-95 transition-all">
                          <Check className="w-3 h-3" />Начать
                        </button>
                      )}
                      <button onClick={() => updateBookingStatus(b.id, 'completed')} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-500/10 text-[10px] font-semibold text-blue-400 active:scale-95 transition-all">
                        <Check className="w-3 h-3" />Завершить
                      </button>
                      <button onClick={() => updateBookingStatus(b.id, 'cancelled')} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/10 text-[10px] font-semibold text-red-400 active:scale-95 transition-all">
                        <X className="w-3 h-3" />Отмена
                      </button>
                    </div>
                  )}
                </div>
              );
            } else {
              const e = item.data;
              return (
                <button
                  key={`e-${e.id}`}
                  onClick={() => setShowEventDetail(e)}
                  className="w-full text-left p-3.5 rounded-2xl glass hover:bg-white/6 transition-all active:scale-[0.98]"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-xl bg-teal-500/12 flex items-center justify-center shrink-0">
                        <MapPin className="w-4.5 h-4.5 text-teal-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-[var(--tg-theme-text-color,#e0e0e0)] truncate">{e.name}</p>
                        <p className="text-[10px] text-white/30">
                          {dateLabel(e.start_time)} · {fmtTime(e.start_time)} — {fmtTime(e.end_time)} · {e.location}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={eventStatusVariants[e.status]}>{eventStatusLabels[e.status]}</Badge>
                      {e.check_id && checkTotals[e.check_id]?.status === 'closed' ? (
                        <span className="font-bold text-sm text-emerald-400 tabular-nums">{fmtCur(checkTotals[e.check_id].total)}</span>
                      ) : (
                        <span className="font-bold text-sm text-[var(--tg-theme-button-color,#6c5ce7)] tabular-nums">{fmtCur(e.amount)}</span>
                      )}
                    </div>
                  </div>
                  {e.check_id && checkTotals[e.check_id]?.status === 'closed' && (
                    <div className="flex items-center gap-1.5 text-[10px] text-emerald-400/60 mt-1">
                      <Check className="w-3 h-3" />
                      Чек закрыт · {fmtCur(checkTotals[e.check_id].total)}
                    </div>
                  )}
                  {e.check_id && checkTotals[e.check_id]?.status === 'open' && (
                    <div className="flex items-center gap-1.5 text-[10px] text-amber-400/60 mt-1">
                      <Clock className="w-3 h-3" />
                      Чек открыт в кассе
                    </div>
                  )}
                </button>
              );
            }
          })}
        </div>
      )}

      {/* Event detail drawer */}
      <Drawer
        open={!!showEventDetail}
        onClose={() => setShowEventDetail(null)}
        title={showEventDetail?.name || 'Выезд'}
      >
        {showEventDetail && (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-white/40">Место</span>
                <span className="text-[var(--tg-theme-text-color,#e0e0e0)] font-medium">{showEventDetail.location}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/40">Дата</span>
                <span className="text-[var(--tg-theme-text-color,#e0e0e0)]">{fmtDateFull(showEventDetail.start_time)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/40">Время</span>
                <span className="text-[var(--tg-theme-text-color,#e0e0e0)]">{fmtTime(showEventDetail.start_time)} — {fmtTime(showEventDetail.end_time)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/40">Сумма</span>
                <span className="font-bold text-[var(--tg-theme-button-color,#6c5ce7)]">{fmtCur(showEventDetail.amount)}</span>
              </div>
              {showEventDetail.note && (
                <div className="flex justify-between text-sm">
                  <span className="text-white/40">Примечание</span>
                  <span className="text-[var(--tg-theme-text-color,#e0e0e0)] text-right max-w-[60%]">{showEventDetail.note}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-white/40">Статус</span>
                <Badge variant={eventStatusVariants[showEventDetail.status]}>{eventStatusLabels[showEventDetail.status]}</Badge>
              </div>
            </div>

            {showEventDetail.status === 'planned' && (
              <div className="space-y-2 pt-2">
                <button onClick={() => startEvent(showEventDetail)} className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-500/10 text-sm font-semibold text-emerald-400 active:scale-[0.97] transition-all">
                  <Check className="w-4 h-4" />Начать и открыть в кассе
                </button>
                <div className="flex gap-2">
                  <button onClick={() => openEditEvent(showEventDetail)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-white/5 text-sm font-semibold text-[var(--tg-theme-text-color,#e0e0e0)] active:scale-[0.97] transition-all">
                    <Edit2 className="w-4 h-4" />Изменить
                  </button>
                  <button onClick={() => updateEventStatus(showEventDetail.id, 'cancelled')} className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-red-500/10 text-sm font-semibold text-red-400 active:scale-[0.97] transition-all">
                    <X className="w-4 h-4" />Отмена
                  </button>
                </div>
              </div>
            )}

            {showEventDetail.check_id && checkTotals[showEventDetail.check_id] && (
              <div className="p-3 rounded-xl bg-white/5 border border-white/5">
                <p className="text-[10px] text-white/40 mb-1">Привязанный чек</p>
                {checkTotals[showEventDetail.check_id].status === 'closed' ? (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-emerald-400 font-semibold">Чек закрыт</span>
                    <span className="text-sm font-bold text-emerald-400">{fmtCur(checkTotals[showEventDetail.check_id].total)}</span>
                  </div>
                ) : (
                  <p className="text-sm text-amber-400 font-semibold">Чек открыт в кассе</p>
                )}
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* New booking / event drawer */}
      <Drawer
        open={showNew}
        onClose={() => setShowNew(false)}
        title={newType === 'booking' ? (editingEvent ? 'Редактировать' : 'Новое бронирование') : (editingEvent ? 'Редактировать выезд' : 'Новый выезд')}
      >
        <div className="space-y-4">
          {/* Type toggle (only when creating new) */}
          {!editingEvent && (
            <div className="flex gap-1 p-1 rounded-xl bg-white/4 border border-white/5">
              <button
                onClick={() => setNewType('booking')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                  newType === 'booking' ? 'bg-indigo-500/20 text-indigo-300' : 'text-white/40'
                }`}
              >
                <DoorOpen className="w-3.5 h-3.5" />Бронь
              </button>
              <button
                onClick={() => setNewType('event')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                  newType === 'event' ? 'bg-teal-500/20 text-teal-300' : 'text-white/40'
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />Выезд
              </button>
            </div>
          )}

          {newType === 'booking' && (
            <>
              {!selectedSpace && (
                <div>
                  <p className="text-xs font-medium text-[var(--tg-theme-hint-color,#888)] mb-2">Выберите пространство</p>
                  <div className="grid grid-cols-3 gap-2">
                    {spaces.map((s) => {
                      const Icon = spaceIconMap[s.type] || DoorOpen;
                      return (
                        <button
                          key={s.id}
                          onClick={() => setSelectedSpace(s)}
                          className="p-3 rounded-xl bg-white/5 border border-white/5 text-center hover:bg-white/8 transition-all active:scale-95"
                        >
                          <Icon className="w-5 h-5 text-indigo-400 mx-auto mb-1" />
                          <p className="text-xs font-medium text-[var(--tg-theme-text-color,#e0e0e0)]">{s.name}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {selectedSpace && (
                <>
                  <div className="p-3 rounded-xl glass flex items-center gap-2">
                    {(() => { const Icon = spaceIconMap[selectedSpace.type] || DoorOpen; return <Icon className="w-5 h-5 text-indigo-400 shrink-0" />; })()}
                    <div>
                      <p className="text-sm font-bold text-[var(--tg-theme-text-color,#e0e0e0)]">{selectedSpace.name}</p>
                      <p className="text-[10px] text-white/30">
                        {selectedSpace.hourly_rate ? `${selectedSpace.hourly_rate}₽/ч · авто-расчет` : 'Ручной ввод суммы'}
                      </p>
                    </div>
                    <button onClick={() => setSelectedSpace(null)} className="ml-auto w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center active:scale-90">
                      <X className="w-3.5 h-3.5 text-white/30" />
                    </button>
                  </div>

                  <Input type="date" label="Дата" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  <div className="grid grid-cols-2 gap-2">
                    <TimeInput label="Начало" value={startTime} onChange={setStartTime} />
                    <TimeInput label="Конец" value={endTime} onChange={setEndTime} />
                  </div>
                  <Input
                    type="number"
                    label="Сумма аренды"
                    placeholder={selectedSpace.hourly_rate ? 'Авто-расчет' : 'Введите сумму'}
                    value={rentalAmount}
                    onChange={(e) => setRentalAmount(e.target.value)}
                    min={0}
                    hint={selectedSpace.hourly_rate ? 'Рассчитано автоматически' : undefined}
                  />

                  <div>
                    <p className="text-xs font-medium text-[var(--tg-theme-hint-color,#888)] mb-2">Клиент (необязательно)</p>
                    {selectedClient ? (
                      <div className="flex items-center gap-2 p-2.5 rounded-xl glass">
                        <User className="w-4 h-4 text-[var(--tg-theme-button-color,#6c5ce7)]" />
                        <span className="text-sm font-medium text-[var(--tg-theme-text-color,#e0e0e0)]">{selectedClient.nickname}</span>
                        <button onClick={() => setSelectedClient(null)} className="ml-auto w-6 h-6 rounded bg-white/5 flex items-center justify-center active:scale-90">
                          <X className="w-3 h-3 text-white/30" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <Input placeholder="Поиск по нику" value={clientSearch} onChange={(e) => searchClients(e.target.value)} />
                        {clients.length > 0 && (
                          <div className="space-y-1 mt-2 max-h-32 overflow-y-auto">
                            {clients.map((c) => (
                              <button key={c.id} onClick={() => { setSelectedClient(c); setClients([]); setClientSearch(''); }}
                                className="w-full flex items-center gap-2 p-2 rounded-lg bg-white/5 hover:bg-white/8 text-sm text-[var(--tg-theme-text-color,#e0e0e0)] transition-all active:scale-[0.98]"
                              >
                                <User className="w-4 h-4 text-white/30" />
                                {c.nickname}
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <Input label="Примечание" placeholder="Комментарий" value={bookingNote} onChange={(e) => setBookingNote(e.target.value)} />

                  <Button fullWidth size="lg" onClick={handleSaveBooking} loading={saving} disabled={saving || !startTime || !endTime}>
                    <CalendarPlus className="w-5 h-5" />
                    Забронировать
                  </Button>
                </>
              )}
            </>
          )}

          {newType === 'event' && (
            <>
              <Input label="Название" placeholder="Мероприятие" value={evName} onChange={(e) => setEvName(e.target.value)} autoFocus />
              <Input label="Место" placeholder="Адрес или локация" value={evLocation} onChange={(e) => setEvLocation(e.target.value)} />
              <Input type="date" label="Дата" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <TimeInput label="Начало" value={startTime} onChange={setStartTime} />
                <TimeInput label="Конец" value={endTime} onChange={setEndTime} />
              </div>
              <Input type="number" label="Сумма (₽)" placeholder="0" value={evAmount} onChange={(e) => setEvAmount(e.target.value)} min={0} />
              <Input label="Примечание" placeholder="Дополнительная информация" value={evNote} onChange={(e) => setEvNote(e.target.value)} />
              <Button fullWidth size="lg" onClick={handleSaveEvent} loading={saving} disabled={saving || !evName.trim() || !evLocation.trim()}>
                <CalendarPlus className="w-5 h-5" />
                {editingEvent ? 'Сохранить' : 'Создать выезд'}
              </Button>
            </>
          )}
        </div>
      </Drawer>
    </div>
  );
}
