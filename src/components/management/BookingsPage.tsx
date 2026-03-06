import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Drawer } from '@/components/ui/Drawer';
import { Plus, DoorOpen, Calendar, Clock, User, X, Check, Home, Building2, Warehouse } from 'lucide-react';
import { hapticFeedback, hapticNotification } from '@/lib/telegram';
import { useAuthStore } from '@/store/auth';
import type { Space, Booking, BookingStatus, Profile } from '@/types';

const statusLabels: Record<BookingStatus, string> = {
  booked: 'Забронировано',
  active: 'Активно',
  completed: 'Завершено',
  cancelled: 'Отменено',
};
const statusVariants: Record<BookingStatus, 'default' | 'success' | 'warning' | 'danger'> = {
  booked: 'warning',
  active: 'success',
  completed: 'default',
  cancelled: 'danger',
};

export function BookingsPage() {
  const user = useAuthStore((s) => s.user);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [selectedSpace, setSelectedSpace] = useState<Space | null>(null);
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [rentalAmount, setRentalAmount] = useState('');
  const [bookingNote, setBookingNote] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [clients, setClients] = useState<Profile[]>([]);
  const [selectedClient, setSelectedClient] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    const { data: sp } = await supabase.from('spaces').select('*').eq('is_active', true).order('type');
    if (sp) setSpaces(sp as Space[]);

    const { data: bk } = await supabase
      .from('bookings')
      .select('*, space:spaces(*), client:profiles!bookings_client_id_fkey(nickname, photo_url)')
      .order('start_time', { ascending: false })
      .limit(100);
    if (bk) setBookings(bk.map((b) => ({
      ...b,
      space: Array.isArray(b.space) ? b.space[0] : b.space,
      client: Array.isArray(b.client) ? b.client[0] : b.client,
    })) as Booking[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => b.start_time.slice(0, 10) === filterDate);
  }, [bookings, filterDate]);

  const todayBookings = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return bookings.filter((b) => b.start_time.slice(0, 10) === today && (b.status === 'booked' || b.status === 'active'));
  }, [bookings]);

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

  const openNew = (space?: Space) => {
    setSelectedSpace(space || null);
    setStartDate(new Date().toISOString().slice(0, 10));
    setStartTime('');
    setEndTime('');
    setRentalAmount('');
    setBookingNote('');
    setClientSearch('');
    setClients([]);
    setSelectedClient(null);
    setShowNew(true);
  };

  const handleSave = async () => {
    if (!selectedSpace || !startDate || !startTime || !endTime) return;
    setSaving(true);

    const startISO = new Date(`${startDate}T${startTime}`).toISOString();
    const endISO = new Date(`${startDate}T${endTime}`).toISOString();

    const { error } = await supabase.from('bookings').insert({
      space_id: selectedSpace.id,
      client_id: selectedClient?.id || null,
      start_time: startISO,
      end_time: endISO,
      rental_amount: Number(rentalAmount) || 0,
      note: bookingNote || null,
      created_by: user?.id,
    });

    setSaving(false);
    if (!error) {
      hapticNotification('success');
      setShowNew(false);
      load();
    }
  };

  const updateStatus = async (id: string, status: BookingStatus) => {
    hapticFeedback('medium');
    await supabase.from('bookings').update({ status }).eq('id', id);
    load();
  };

  const fmtCur = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + '₽';
  const fmtTime = (d: string) => new Date(d).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

  const spaceIconMap: Record<string, typeof Home> = {
    cabin_small: Home,
    cabin_big: Building2,
    hall: Warehouse,
  };

  return (
    <div className="space-y-4">
      {/* Space cards */}
      <div className="grid grid-cols-3 gap-2">
        {spaces.map((s) => {
          const active = todayBookings.filter((b) => b.space_id === s.id);
          const isBusy = active.length > 0;
          return (
            <button
              key={s.id}
              onClick={() => openNew(s)}
              className={`p-3 rounded-2xl text-center transition-all active:scale-[0.96] border ${
                isBusy
                  ? 'bg-[var(--c-warning-bg)] border-[var(--c-warning-border)]'
                  : 'bg-[var(--c-surface)] border-[var(--c-border)] hover:bg-[var(--c-surface-hover)]'
              }`}
            >
              {(() => { const Icon = spaceIconMap[s.type] || DoorOpen; return <Icon className="w-6 h-6 text-indigo-400 mb-1" />; })()}
              <p className="text-xs font-bold text-[var(--c-text)]">{s.name}</p>
              <p className="text-[10px] text-[var(--c-hint)] mt-0.5">
                {s.hourly_rate ? `${s.hourly_rate}₽/ч` : 'Своя цена'}
              </p>
              {isBusy && <Badge variant="warning" className="mt-1.5">Занято</Badge>}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <Input
          type="date"
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
          className="w-40"
        />
        <Button size="md" onClick={() => openNew()}>
          <Plus className="w-4 h-4" />
          Бронь
        </Button>
      </div>

      {filteredBookings.length === 0 ? (
        <div className="text-center py-10">
          <DoorOpen className="w-10 h-10 text-[var(--c-muted)] mx-auto mb-3" />
          <p className="text-sm text-[var(--c-hint)]">Нет бронирований на эту дату</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredBookings.map((b) => (
            <div key={b.id} className="p-3.5 rounded-2xl glass space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {(() => { const Icon = spaceIconMap[b.space?.type || ''] || DoorOpen; return <Icon className="w-5 h-5 text-indigo-400 shrink-0" />; })()}
                  <div>
                    <p className="text-sm font-bold text-[var(--c-text)]">
                      {b.space?.name || 'Пространство'}
                    </p>
<p className="text-[10px] text-[var(--c-hint)]">
                    {fmtTime(b.start_time)} — {fmtTime(b.end_time)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={statusVariants[b.status]}>{statusLabels[b.status]}</Badge>
                  <span className="font-bold text-sm text-[var(--c-accent)] tabular-nums">{fmtCur(b.rental_amount)}</span>
                </div>
              </div>
              {b.client && (
                <div className="flex items-center gap-1.5 text-xs text-[var(--c-hint)]">
                  <User className="w-3 h-3" />
                  {(b.client as { nickname: string }).nickname}
                </div>
              )}
              {b.note && <p className="text-xs text-[var(--c-muted)]">{b.note}</p>}
              {(b.status === 'booked' || b.status === 'active') && (
                <div className="flex gap-1.5 pt-1">
                  {b.status === 'booked' && (
                    <button onClick={() => updateStatus(b.id, 'active')} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--c-success-bg)] text-[10px] font-semibold text-[var(--c-success)] active:scale-95 transition-all">
                      <Check className="w-3 h-3" />Начать
                    </button>
                  )}
                  <button onClick={() => updateStatus(b.id, 'completed')} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--c-info-bg)] text-[10px] font-semibold text-[var(--c-info)] active:scale-95 transition-all">
                    <Check className="w-3 h-3" />Завершить
                  </button>
                  <button onClick={() => updateStatus(b.id, 'cancelled')} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--c-danger-bg)] text-[10px] font-semibold text-[var(--c-danger)] active:scale-95 transition-all">
                    <X className="w-3 h-3" />Отмена
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* New booking */}
      <Drawer open={showNew} onClose={() => setShowNew(false)} title="Новое бронирование">
        <div className="space-y-4">
          {!selectedSpace && (
            <div>
              <p className="text-xs font-medium text-[var(--c-hint)] mb-2">Выберите пространство</p>
              <div className="grid grid-cols-3 gap-2">
                {spaces.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSpace(s)}
                    className="p-3 rounded-xl bg-[var(--c-surface)] border border-[var(--c-border)] text-center hover:bg-[var(--c-surface-hover)] transition-all active:scale-95"
                  >
                    {(() => { const Icon = spaceIconMap[s.type] || DoorOpen; return <Icon className="w-5 h-5 text-indigo-400 mb-1" />; })()}
                    <p className="text-xs font-medium text-[var(--c-text)]">{s.name}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
          {selectedSpace && (
            <>
              <div className="p-3 rounded-xl glass flex items-center gap-2">
                {(() => { const Icon = spaceIconMap[selectedSpace.type] || DoorOpen; return <Icon className="w-5 h-5 text-indigo-400 shrink-0" />; })()}
                <div>
                  <p className="text-sm font-bold text-[var(--c-text)]">{selectedSpace.name}</p>
                  <p className="text-[10px] text-[var(--c-hint)]">
                    {selectedSpace.hourly_rate ? `${selectedSpace.hourly_rate}₽/ч · авто-расчет` : 'Ручной ввод суммы'}
                  </p>
                </div>
                <button onClick={() => setSelectedSpace(null)} className="ml-auto w-7 h-7 rounded-lg bg-[var(--c-surface)] flex items-center justify-center active:scale-90">
                  <X className="w-3.5 h-3.5 text-[var(--c-hint)]" />
                </button>
              </div>

              <Input type="date" label="Дата" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <Input type="time" label="Начало" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                <Input type="time" label="Конец" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
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
                <p className="text-xs font-medium text-[var(--c-hint)] mb-2">Клиент (необязательно)</p>
                {selectedClient ? (
                  <div className="flex items-center gap-2 p-2.5 rounded-xl glass">
                    <User className="w-4 h-4 text-[var(--c-accent)]" />
                    <span className="text-sm font-medium text-[var(--c-text)]">{selectedClient.nickname}</span>
                    <button onClick={() => setSelectedClient(null)} className="ml-auto w-6 h-6 rounded bg-[var(--c-surface)] flex items-center justify-center active:scale-90">
                      <X className="w-3 h-3 text-[var(--c-hint)]" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Input placeholder="Поиск по нику" value={clientSearch} onChange={(e) => searchClients(e.target.value)} />
                    {clients.length > 0 && (
                      <div className="space-y-1 mt-2 max-h-32 overflow-y-auto">
                        {clients.map((c) => (
                          <button key={c.id} onClick={() => { setSelectedClient(c); setClients([]); setClientSearch(''); }}
                            className="w-full flex items-center gap-2 p-2 rounded-lg bg-[var(--c-surface)] hover:bg-[var(--c-surface-hover)] text-sm text-[var(--c-text)] transition-all active:scale-[0.98]"
                          >
                            <User className="w-4 h-4 text-[var(--c-hint)]" />
                            {c.nickname}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              <Input label="Примечание" placeholder="Комментарий" value={bookingNote} onChange={(e) => setBookingNote(e.target.value)} />

              <Button fullWidth size="lg" onClick={handleSave} loading={saving} disabled={saving || !startTime || !endTime}>
                <Calendar className="w-5 h-5" />
                Забронировать
              </Button>
            </>
          )}
        </div>
      </Drawer>
    </div>
  );
}
