import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Drawer } from '@/components/ui/Drawer';
import { Plus, MapPin, Calendar, Clock, X, Check, Edit2 } from 'lucide-react';
import { hapticFeedback, hapticNotification } from '@/lib/telegram';
import { useAuthStore } from '@/store/auth';
import type { OffsiteEvent, EventStatus } from '@/types';

const statusLabels: Record<EventStatus, string> = {
  planned: 'Запланировано',
  completed: 'Завершено',
  cancelled: 'Отменено',
};
const statusVariants: Record<EventStatus, 'warning' | 'success' | 'danger'> = {
  planned: 'warning',
  completed: 'success',
  cancelled: 'danger',
};

export function EventsPage() {
  const user = useAuthStore((s) => s.user);
  const [events, setEvents] = useState<OffsiteEvent[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<OffsiteEvent | null>(null);
  const [showDetail, setShowDetail] = useState<OffsiteEvent | null>(null);

  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [amount, setAmount] = useState('');
  const [eventNote, setEventNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'upcoming' | 'history'>('upcoming');

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('events')
      .select('*')
      .order('start_time', { ascending: false })
      .limit(200);
    if (data) setEvents(data as OffsiteEvent[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  const upcoming = events.filter((e) => e.status === 'planned');
  const history = events.filter((e) => e.status !== 'planned');

  const openNew = () => {
    setEditing(null);
    setName('');
    setLocation('');
    setStartDate(new Date().toISOString().slice(0, 10));
    setStartTime('');
    setEndTime('');
    setAmount('');
    setEventNote('');
    setShowForm(true);
  };

  const openEdit = (e: OffsiteEvent) => {
    setEditing(e);
    setName(e.name);
    setLocation(e.location);
    setStartDate(e.start_time.slice(0, 10));
    setStartTime(new Date(e.start_time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));
    setEndTime(new Date(e.end_time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));
    setAmount(String(e.amount));
    setEventNote(e.note || '');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !location.trim() || !startDate || !startTime || !endTime) return;
    setSaving(true);

    const startISO = new Date(`${startDate}T${startTime}`).toISOString();
    const endISO = new Date(`${startDate}T${endTime}`).toISOString();

    const payload = {
      name: name.trim(),
      location: location.trim(),
      start_time: startISO,
      end_time: endISO,
      amount: Number(amount) || 0,
      note: eventNote || null,
    };

    if (editing) {
      await supabase.from('events').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('events').insert({ ...payload, created_by: user?.id });
    }

    setSaving(false);
    hapticNotification('success');
    setShowForm(false);
    load();
  };

  const updateStatus = async (id: string, status: EventStatus) => {
    hapticFeedback('medium');
    await supabase.from('events').update({ status }).eq('id', id);
    setShowDetail(null);
    load();
  };

  const fmtCur = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + '₽';
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
  const fmtTime = (d: string) => new Date(d).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  const displayEvents = tab === 'upcoming' ? upcoming : history;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 p-1 rounded-xl bg-[var(--c-surface)] border border-[var(--c-border)]">
          {(['upcoming', 'history'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                tab === t
                  ? 'bg-[var(--c-accent)] text-white'
                  : 'text-[var(--c-hint)]'
              }`}
            >
              {t === 'upcoming' ? `Планы (${upcoming.length})` : `История (${history.length})`}
            </button>
          ))}
        </div>
        <Button size="md" onClick={openNew}>
          <Plus className="w-4 h-4" />
          Новый
        </Button>
      </div>

      {displayEvents.length === 0 ? (
        <div className="text-center py-12">
          <MapPin className="w-10 h-10 text-[var(--c-muted)] mx-auto mb-3" />
          <p className="text-sm text-[var(--c-hint)]">
            {tab === 'upcoming' ? 'Нет запланированных выездов' : 'Нет истории'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayEvents.map((e) => (
            <button
              key={e.id}
              onClick={() => setShowDetail(e)}
              className="w-full text-left p-3.5 rounded-2xl glass hover:bg-[var(--c-surface-hover)] transition-all active:scale-[0.98]"
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <MapPin className="w-4 h-4 text-teal-400 shrink-0" />
                  <p className="font-bold text-sm text-[var(--c-text)] truncate">{e.name}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={statusVariants[e.status]}>{statusLabels[e.status]}</Badge>
                  <span className="font-bold text-sm text-[var(--c-accent)] tabular-nums">{fmtCur(e.amount)}</span>
                </div>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-[var(--c-hint)]">
                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{fmtDate(e.start_time)}</span>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{fmtTime(e.start_time)} — {fmtTime(e.end_time)}</span>
                <span>{e.location}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Detail */}
      <Drawer
        open={!!showDetail}
        onClose={() => setShowDetail(null)}
        title={showDetail?.name || 'Выезд'}
      >
        {showDetail && (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--c-hint)]">Место</span>
                <span className="text-[var(--c-text)] font-medium">{showDetail.location}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--c-hint)]">Дата</span>
                <span className="text-[var(--c-text)]">{fmtDate(showDetail.start_time)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--c-hint)]">Время</span>
                <span className="text-[var(--c-text)]">{fmtTime(showDetail.start_time)} — {fmtTime(showDetail.end_time)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--c-hint)]">Сумма</span>
                <span className="font-bold text-[var(--c-accent)]">{fmtCur(showDetail.amount)}</span>
              </div>
              {showDetail.note && (
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--c-hint)]">Примечание</span>
                  <span className="text-[var(--c-text)] text-right max-w-[60%]">{showDetail.note}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-[var(--c-hint)]">Статус</span>
                <Badge variant={statusVariants[showDetail.status]}>{statusLabels[showDetail.status]}</Badge>
              </div>
            </div>

            {showDetail.status === 'planned' && (
              <div className="flex gap-2 pt-2">
                <button onClick={() => openEdit(showDetail)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[var(--c-surface)] text-sm font-semibold text-[var(--c-text)] active:scale-[0.97] transition-all">
                  <Edit2 className="w-4 h-4" />Изменить
                </button>
                <button onClick={() => updateStatus(showDetail.id, 'completed')} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[var(--c-success-bg)] text-sm font-semibold text-[var(--c-success)] active:scale-[0.97] transition-all">
                  <Check className="w-4 h-4" />Завершить
                </button>
                <button onClick={() => updateStatus(showDetail.id, 'cancelled')} className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[var(--c-danger-bg)] text-sm font-semibold text-[var(--c-danger)] active:scale-[0.97] transition-all">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* Form */}
      <Drawer
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? 'Редактировать выезд' : 'Новый выезд'}
      >
        <div className="space-y-4">
          <Input label="Название" placeholder="Мероприятие" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          <Input label="Место" placeholder="Адрес или локация" value={location} onChange={(e) => setLocation(e.target.value)} />
          <Input type="date" label="Дата" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Input type="time" label="Начало" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            <Input type="time" label="Конец" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
          <Input type="number" label="Сумма (₽)" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} min={0} />
          <Input label="Примечание" placeholder="Дополнительная информация" value={eventNote} onChange={(e) => setEventNote(e.target.value)} />
          <Button fullWidth size="lg" onClick={handleSave} loading={saving} disabled={saving || !name.trim() || !location.trim()}>
            {editing ? 'Сохранить' : 'Создать выезд'}
          </Button>
        </div>
      </Drawer>
    </div>
  );
}
