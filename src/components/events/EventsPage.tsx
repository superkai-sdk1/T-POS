import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useOnTableChange } from '@/hooks/useRealtimeSync';
import { useAuthStore } from '@/store/auth';
import { usePOSStore } from '@/store/pos';
import { useHideNav } from '@/store/layout';
import {
    Calendar, Clock, Plus, Play,
    CheckCircle2, Timer, CreditCard,
    MessageSquare, MapPin, Sparkles, History,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { TabSwitcher } from '@/components/ui/TabSwitcher';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Drawer } from '@/components/ui/Drawer';
import { hapticFeedback, hapticNotification } from '@/lib/telegram';
import type { Event, EventStatus } from '@/types';

const HOURLY_RATES: Record<number, number> = {
    1: 5000,
    2: 8000,
    3: 10000,
    4: 12000,
    5: 14000
};

const statusLabel: Record<EventStatus, string> = {
    planned: 'Запланировано',
    active: 'В процессе',
    completed: 'Завершено',
    cancelled: 'Отменено',
};

const statusVariant: Record<EventStatus, 'default' | 'success' | 'accent'> = {
    planned: 'default',
    active: 'success',
    completed: 'accent',
    cancelled: 'default',
};

function formatDate(d: string) {
    return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function pluralHours(n: number) {
    if (n === 1) return 'час';
    if (n >= 2 && n <= 4) return 'часа';
    return 'часов';
}

export function EventsPage() {
    const hideNav = useHideNav();
    const [activeTab, setActiveTab] = useState<'upcoming' | 'history'>('upcoming');
    const [events, setEvents] = useState<Event[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [formData, setFormData] = useState<Partial<Event>>({
        type: 'titan',
        payment_type: 'fixed',
        fixed_amount: 0,
        status: 'planned',
        date: new Date().toISOString().split('T')[0],
        start_time: '18:00',
    });

    const resetForm = () => setFormData({
        type: 'titan', payment_type: 'fixed', fixed_amount: 0,
        status: 'planned', date: new Date().toISOString().split('T')[0], start_time: '18:00',
    });

    const loadEvents = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('events')
            .select('*')
            .order('date', { ascending: activeTab === 'upcoming' })
            .order('start_time', { ascending: activeTab === 'upcoming' });

        if (!error && data) setEvents(data as Event[]);
        setLoading(false);
    }, [activeTab]);

    useEffect(() => { loadEvents(); }, [loadEvents]);
    useOnTableChange(['events'], loadEvents);

    const filteredEvents = useMemo(() => {
        const today = new Date().toISOString().split('T')[0];
        if (activeTab === 'upcoming') {
            return events.filter(e =>
                e.status !== 'completed' &&
                e.status !== 'cancelled' &&
                e.date >= today,
            );
        }
        return events.filter(e =>
            e.status === 'completed' ||
            e.status === 'cancelled' ||
            e.date < today,
        );
    }, [events, activeTab]);

    const handleCreateEvent = async () => {
        setIsSubmitting(true);
        const payload = {
            type: formData.type || 'titan',
            location: formData.type === 'exit' ? (formData.location || null) : null,
            date: formData.date || new Date().toISOString().split('T')[0],
            start_time: formData.start_time || '18:00',
            payment_type: formData.payment_type || 'fixed',
            fixed_amount: formData.payment_type === 'fixed' ? (formData.fixed_amount ?? 0) : null,
            status: 'planned',
            comment: formData.comment || null,
            created_by: useAuthStore.getState().user?.id ?? null,
        };
        const { error } = await supabase.from('events').insert([payload]);
        if (!error) {
            hapticNotification('success');
            setShowAdd(false);
            resetForm();
            loadEvents();
        } else {
            hapticNotification('error');
        }
        setIsSubmitting(false);
    };

    const handleStatusChange = async (event: Event, newStatus: EventStatus) => {
        // Старт мероприятия: создаём открытый чек и привязываем его к событию
        if (newStatus === 'active' && !event.check_id) {
            setIsSubmitting(true);
            try {
                const check = await usePOSStore.getState().createCheck(null);
                if (check) {
                    const { error } = await supabase.from('events').update({
                        status: 'active',
                        check_id: check.id,
                    }).eq('id', event.id);

                    if (!error) {
                        await supabase.from('checks').update({
                            note: `Заказ в ${event.type === 'titan' ? 'Титане' : (event.location || 'Выездном мероприятии')}`,
                        }).eq('id', check.id);

                        hapticFeedback('medium');
                        usePOSStore.getState().loadOpenChecks();
                        loadEvents();
                    } else {
                        hapticNotification('error');
                    }
                } else {
                    hapticNotification('error');
                }
            } catch (e) {
                console.error('handleStatusChange active error:', e);
                hapticNotification('error');
            }
            setIsSubmitting(false);
            return;
        }

        // Для остальных статусов просто обновляем статус
        const { error } = await supabase.from('events').update({ status: newStatus }).eq('id', event.id);
        if (!error) { hapticFeedback('medium'); loadEvents(); }
    };

    const handleCancelEvent = async (event: Event) => {
        if (isSubmitting) return;
        setIsSubmitting(true);
        try {
            const { error } = await supabase
                .from('events')
                .update({ status: 'cancelled' })
                .eq('id', event.id);
            if (!error) {
                hapticFeedback('medium');
                await loadEvents();
            } else {
                hapticNotification('error');
            }
        } catch (e) {
            console.error('handleCancelEvent error:', e);
            hapticNotification('error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-[var(--c-text)]">Мероприятия</h2>
                <Button onClick={() => { hapticFeedback('light'); setShowAdd(true); }} size="sm">
                    <Plus className="w-4 h-4" />
                    Новое
                </Button>
            </div>

            {/* Tabs */}
            <div className="shrink-0 mb-4">
                <TabSwitcher
                    tabs={[
                        { id: 'upcoming', label: 'Предстоящие', icon: <Calendar className="w-4 h-4" /> },
                        { id: 'history', label: 'История', icon: <History className="w-4 h-4" /> },
                    ]}
                    activeId={activeTab}
                    onChange={(id) => { hapticFeedback('light'); setActiveTab(id as 'upcoming' | 'history'); }}
                />
            </div>

            {/* Event list */}
            <div className={`flex-1 overflow-y-auto min-h-0 space-y-3 scroll-area ${hideNav ? 'pb-4' : 'pb-24 lg:pb-4'}`}>
                {loading ? (
                    <div className="flex justify-center py-12">
                        <div className="w-7 h-7 border-2 border-[var(--c-accent)] border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : filteredEvents.length === 0 ? (
                    <div className="flex flex-col items-center py-16 gap-3">
                        <Calendar className="w-12 h-12 text-[var(--c-muted)]" />
                        <p className="text-sm text-[var(--c-hint)]">
                            {activeTab === 'upcoming' ? 'Нет предстоящих мероприятий' : 'Нет завершённых'}
                        </p>
                    </div>
                ) : (
                    filteredEvents.map(event => (
                        <div
                            key={event.id}
                            className="rounded-2xl overflow-hidden"
                            style={{
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.07)',
                            }}
                        >
                            {/* Card header */}
                            <div className="p-3.5 pb-3">
                                <div className="flex items-center gap-2.5 mb-2.5">
                                    <div
                                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                                        style={{
                                            background: event.type === 'titan'
                                                ? 'linear-gradient(135deg, rgba(52,211,153,0.15), rgba(52,211,153,0.05))'
                                                : 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(99,102,241,0.05))',
                                        }}
                                    >
                                        {event.type === 'titan'
                                            ? <Sparkles className="w-5 h-5 text-emerald-400" />
                                            : <MapPin className="w-5 h-5 text-indigo-400" />
                                        }
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[14px] font-bold text-[var(--c-text)] truncate">
                                            {event.type === 'titan' ? 'Титан' : (event.location || 'Выездное')}
                                        </p>
                                        <div className="flex items-center gap-3 mt-0.5">
                                            <span className="flex items-center gap-1 text-[11px] text-[var(--c-hint)]">
                                                <Calendar className="w-3 h-3" />
                                                {formatDate(event.date)}
                                            </span>
                                            <span className="flex items-center gap-1 text-[11px] text-[var(--c-hint)]">
                                                <Clock className="w-3 h-3" />
                                                {event.start_time?.slice(0, 5)}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="shrink-0 flex flex-col items-end gap-1">
                                        <Badge variant={statusVariant[event.status]} size="sm">
                                            {statusLabel[event.status]}
                                        </Badge>
                                        <span className="text-[13px] font-bold tabular-nums text-[var(--c-accent-light)]">
                                            {event.payment_type === 'hourly' ? 'Почасовая' : `${event.fixed_amount || 0}₽`}
                                        </span>
                                    </div>
                                </div>

                                {event.comment && (
                                    <div
                                        className="flex items-start gap-2 px-3 py-2 rounded-lg text-[12px] text-[var(--c-text)]/70"
                                        style={{ background: 'rgba(255,255,255,0.03)' }}
                                    >
                                        <MessageSquare className="w-3 h-3 shrink-0 mt-0.5 text-[var(--c-muted)]" />
                                        <span className="line-clamp-2">{event.comment}</span>
                                    </div>
                                )}
                            </div>

                            {/* Card actions */}
                            {(event.status === 'planned' || event.status === 'active') && (
                                <div
                                    className="flex gap-2 px-3.5 py-2.5"
                                    style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
                                >
                                    {event.status === 'planned' && (
                                        <Button
                                            onClick={() => handleStatusChange(event, 'active')}
                                            variant="secondary"
                                            size="sm"
                                            fullWidth
                                            disabled={isSubmitting}
                                        >
                                            <Play className="w-3.5 h-3.5" />
                                            Начать
                                        </Button>
                                    )}
                                    {event.status === 'active' && (
                                        <>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                fullWidth
                                                disabled={isSubmitting}
                                                onClick={() => handleCancelEvent(event)}
                                            >
                                                Отменить
                                            </Button>
                                            <Button
                                                size="sm"
                                                fullWidth
                                                disabled
                                            >
                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                                Завершить в кассе
                                            </Button>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* ============ ADD EVENT DRAWER ============ */}
            <Drawer
                open={showAdd}
                onClose={() => { setShowAdd(false); resetForm(); }}
                title="Новое мероприятие"
                size="lg"
            >
                <div className="flex flex-col h-full">
                    <div className="flex-1 overflow-y-auto space-y-4 pb-4">
                        {/* Type selector */}
                        <div className="grid grid-cols-2 gap-2.5">
                            {([
                                { key: 'titan' as const, label: 'Титан', sub: 'В клубе', icon: Sparkles, color: 'rgba(52,211,153,0.1)', borderColor: 'rgba(52,211,153,0.2)' },
                                { key: 'exit' as const, label: 'Выезд', sub: 'На локации', icon: MapPin, color: 'rgba(99,102,241,0.1)', borderColor: 'rgba(99,102,241,0.2)' },
                            ]).map(({ key, label, sub, icon: Icon, color, borderColor }) => {
                                const active = formData.type === key;
                                return (
                                    <button
                                        key={key}
                                        onClick={() => { setFormData({ ...formData, type: key }); hapticFeedback('light'); }}
                                        className="flex items-center gap-3 p-3.5 rounded-xl transition-all active:scale-[0.97] min-h-[56px]"
                                        style={{
                                            background: active ? color : 'rgba(255,255,255,0.04)',
                                            border: active ? `1px solid ${borderColor}` : '1px solid rgba(255,255,255,0.08)',
                                        }}
                                    >
                                        <Icon className={`w-5 h-5 shrink-0 ${active ? 'text-white' : 'text-[var(--c-hint)]'}`} />
                                        <div className="text-left">
                                            <p className={`text-[13px] font-bold ${active ? 'text-white' : 'text-[var(--c-text)]'}`}>{label}</p>
                                            <p className="text-[10px] text-[var(--c-hint)]">{sub}</p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {formData.type === 'exit' && (
                            <Input
                                label="Локация"
                                placeholder="Где будет проходить?"
                                value={formData.location || ''}
                                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                                compact
                            />
                        )}

                        <div className="grid grid-cols-2 gap-2.5">
                            <Input
                                type="date"
                                label="Дата"
                                value={formData.date}
                                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                compact
                            />
                            <Input
                                type="time"
                                label="Время"
                                value={formData.start_time}
                                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                                compact
                            />
                        </div>

                        {/* Payment type */}
                        <div>
                            <p className="text-[11px] font-semibold text-[var(--c-hint)] mb-2 uppercase tracking-wider">Тип оплаты</p>
                            <div className="grid grid-cols-2 gap-2">
                                {([
                                    { key: 'fixed' as const, label: 'Фиксированная', icon: CreditCard },
                                    { key: 'hourly' as const, label: 'Почасовая', icon: Timer },
                                ]).map(({ key, label, icon: Icon }) => {
                                    const active = formData.payment_type === key;
                                    return (
                                        <button
                                            key={key}
                                            onClick={() => { setFormData({ ...formData, payment_type: key }); hapticFeedback('light'); }}
                                            className="flex items-center gap-2 p-3 rounded-xl transition-all active:scale-[0.97] min-h-[48px]"
                                            style={{
                                                background: active ? 'rgba(139,92,246,0.1)' : 'rgba(255,255,255,0.04)',
                                                border: active ? '1px solid rgba(139,92,246,0.25)' : '1px solid rgba(255,255,255,0.08)',
                                            }}
                                        >
                                            <Icon className={`w-4 h-4 ${active ? 'text-[var(--c-accent-light)]' : 'text-[var(--c-hint)]'}`} />
                                            <span className={`text-[12px] font-semibold ${active ? 'text-[var(--c-accent-light)]' : 'text-[var(--c-text)]'}`}>
                                                {label}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {formData.payment_type === 'fixed' && (
                            <Input
                                type="text"
                                inputMode="numeric"
                                label="Сумма (₽)"
                                placeholder="0"
                                value={formData.fixed_amount ? String(formData.fixed_amount) : ''}
                                onChange={(e) => {
                                    const raw = e.target.value.replace(/[^0-9]/g, '');
                                    setFormData({ ...formData, fixed_amount: raw === '' ? 0 : Number(raw) });
                                }}
                                compact
                            />
                        )}

                        <Input
                            label="Комментарий"
                            placeholder="Заказчик, особенности..."
                            value={formData.comment || ''}
                            onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
                            compact
                        />
                    </div>

                    <div className="shrink-0 pt-2">
                        <Button fullWidth size="lg" onClick={handleCreateEvent} loading={isSubmitting}>
                            <Plus className="w-4 h-4" />
                            Создать мероприятие
                        </Button>
                    </div>
                </div>
            </Drawer>

        </div>
    );
}
