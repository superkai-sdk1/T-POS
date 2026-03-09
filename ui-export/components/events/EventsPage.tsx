import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { usePOSStore } from '@/store/pos';
import {
    Calendar, MapPin, Clock, MoreVertical, Plus, Play,
    CheckCircle2, History, Timer, CreditCard, ChevronRight,
    MessageSquare, Trash2, Edit2, X
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { hapticFeedback, hapticNotification } from '@/lib/telegram';
import type { Event, EventStatus, EventType, PaymentType } from '@/types';

const HOURLY_RATES: Record<number, number> = {
    1: 5000,
    2: 8000,
    3: 10000,
    4: 12000,
    5: 14000
};

export function EventsPage() {
    const [activeTab, setActiveTab] = useState<'upcoming' | 'history'>('upcoming');
    const [events, setEvents] = useState<Event[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showCompletionModal, setShowCompletionModal] = useState<Event | null>(null);
    const [selectedHours, setSelectedHours] = useState<number>(1);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form State
    const [formData, setFormData] = useState<Partial<Event>>({
        type: 'titan',
        payment_type: 'fixed',
        fixed_amount: 0,
        status: 'planned',
        date: new Date().toISOString().split('T')[0],
        start_time: '18:00',
    });

    const loadEvents = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('events')
            .select('*')
            .order('date', { ascending: activeTab === 'upcoming' })
            .order('start_time', { ascending: activeTab === 'upcoming' });

        if (!error && data) {
            setEvents(data as Event[]);
        }
        setLoading(false);
    }, [activeTab]);

    useEffect(() => {
        loadEvents();
    }, [loadEvents]);

    const filteredEvents = useMemo(() => {
        const today = new Date().toISOString().split('T')[0];
        if (activeTab === 'upcoming') {
            return events.filter(e => e.status !== 'completed' && e.date >= today);
        }
        return events.filter(e => e.status === 'completed' || e.date < today);
    }, [events, activeTab]);

    const handleCreateEvent = async () => {
        setIsSubmitting(true);
        const { error } = await supabase
            .from('events')
            .insert([{
                ...formData,
                created_by: useAuthStore.getState().user?.id
            }]);

        if (!error) {
            hapticNotification('success');
            setShowAddModal(false);
            loadEvents();
        } else {
            console.error('Create Event Error:', error);
            alert('Ошибка создания: ' + (error.message || 'Проверьте соединение и наличие таблиц в БД'));
            hapticNotification('error');
        }
        setIsSubmitting(false);
    };

    const handleStatusChange = async (event: Event, newStatus: EventStatus) => {
        if (newStatus === 'completed') {
            setShowCompletionModal(event);
            return;
        }

        const { error } = await supabase
            .from('events')
            .update({ status: newStatus })
            .eq('id', event.id);

        if (!error) {
            hapticFeedback('medium');
            loadEvents();
        }
    };

    const handleCompleteEvent = async () => {
        if (!showCompletionModal) return;
        setIsSubmitting(true);

        const amount = showCompletionModal.payment_type === 'hourly'
            ? HOURLY_RATES[selectedHours]
            : (showCompletionModal.fixed_amount || 0);

        // 1. Create a check in POS
        const check = await usePOSStore.getState().createCheck(null);
        if (check) {
            // 2. Add as a special transaction or item in the check? 
            // For now, let's update the check total and close it to represent income
            await supabase.from('checks').update({
                status: 'closed',
                total_amount: amount,
                payment_method: 'cash', // Default to cash for simplicity
                note: `Мероприятие: ${showCompletionModal.type === 'titan' ? 'Титан' : showCompletionModal.location}`,
                closed_at: new Date().toISOString()
            }).eq('id', check.id);

            // 3. Update event status and link check
            await supabase
                .from('events')
                .update({
                    status: 'completed',
                    check_id: check.id,
                    fixed_amount: amount // Store final amount if it was hourly
                })
                .eq('id', showCompletionModal.id);

            hapticNotification('success');
            setShowCompletionModal(null);
            loadEvents();
            usePOSStore.getState().loadOpenChecks();
        } else {
            console.error('Complete Event Error: No check created');
            alert('Не удалось создать чек в кассе. Проверьте статус смены.');
        }
        setIsSubmitting(false);
    };

    return (
        <div className="flex flex-col h-full space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-[var(--c-text)]">Мероприятия</h2>
                <Button
                    onClick={() => { hapticFeedback('light'); setShowAddModal(true); }}
                    size="sm"
                    className="gap-2"
                >
                    <Plus className="w-4 h-4" />
                    Новое
                </Button>
            </div>

            <div className="flex gap-1 p-1 bg-[var(--c-surface)] rounded-xl w-fit">
                <button
                    onClick={() => { hapticFeedback('light'); setActiveTab('upcoming'); }}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'upcoming'
                        ? 'bg-[var(--c-bg)] text-[var(--c-text)] shadow-sm'
                        : 'text-[var(--c-hint)] hover:text-[var(--c-text)]'
                        }`}
                >
                    Предстоящие
                </button>
                <button
                    onClick={() => { hapticFeedback('light'); setActiveTab('history'); }}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'history'
                        ? 'bg-[var(--c-bg)] text-[var(--c-text)] shadow-sm'
                        : 'text-[var(--c-hint)] hover:text-[var(--c-text)]'
                        }`}
                >
                    История
                </button>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 space-y-3 pb-20">
                {loading ? (
                    <div className="flex items-center justify-center py-10">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--c-accent)]"></div>
                    </div>
                ) : filteredEvents.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-[var(--c-hint)] space-y-2">
                        <Calendar className="w-12 h-12 opacity-20" />
                        <p>Нет мероприятий в этом разделе</p>
                    </div>
                ) : (
                    filteredEvents.map(event => (
                        <div key={event.id} className="card p-4 space-y-3 group active:scale-[0.98] transition-all">
                            <div className="flex items-start justify-between">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <Badge variant={event.type === 'titan' ? 'success' : 'default'}>
                                            {event.type === 'titan' ? 'Титан' : 'Выезд'}
                                        </Badge>
                                        <span className="font-bold text-[var(--c-text)]">
                                            {event.type === 'titan' ? 'Титан Парк' : event.location}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-[var(--c-hint)]">
                                        <div className="flex items-center gap-1">
                                            <Calendar className="w-3.5 h-3.5" />
                                            {new Date(event.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Clock className="w-3.5 h-3.5" />
                                            {event.start_time.slice(0, 5)}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                    <Badge variant={
                                        event.status === 'planned' ? 'default' :
                                            event.status === 'active' ? 'success' : 'default'
                                    }>
                                        {event.status === 'planned' ? 'Запланировано' :
                                            event.status === 'active' ? 'В процессе' : 'Завершено'}
                                    </Badge>
                                    <span className="text-xs font-bold text-[var(--c-accent)]">
                                        {event.payment_type === 'hourly' ? 'Почасовая' : `${event.fixed_amount}₽`}
                                    </span>
                                </div>
                            </div>

                            {event.comment && (
                                <div className="flex items-start gap-2 p-2.5 bg-[var(--c-bg)] rounded-lg text-xs text-[var(--c-text)] italic">
                                    <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-40" />
                                    {event.comment}
                                </div>
                            )}

                            <div className="flex gap-2 pt-1">
                                {event.status === 'planned' && (
                                    <Button
                                        onClick={() => handleStatusChange(event, 'active')}
                                        className="flex-1 gap-2 bg-[var(--c-success-bg)] text-[var(--c-success)] hover:bg-[var(--c-success-bg)]/80"
                                        size="sm"
                                    >
                                        <Play className="w-3.5 h-3.5" />
                                        Начать
                                    </Button>
                                )}
                                {event.status === 'active' && (
                                    <Button
                                        onClick={() => handleStatusChange(event, 'completed')}
                                        className="flex-1 gap-2 bg-[var(--c-accent)] text-white"
                                        size="sm"
                                    >
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        Завершить
                                    </Button>
                                )}
                                <Button variant="secondary" size="sm" className="px-3">
                                    <Edit2 className="w-3.5 h-3.5" />
                                </Button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Add Modal */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-[var(--c-surface)] w-full max-w-md rounded-2xl p-6 space-y-4 shadow-2xl">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold">Новое мероприятие</h3>
                            <button onClick={() => setShowAddModal(false)} className="text-[var(--c-hint)]">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => setFormData({ ...formData, type: 'titan' })}
                                    className={`p-3 rounded-xl border-2 transition-all ${formData.type === 'titan' ? 'border-[var(--c-accent)] bg-[var(--c-accent)]/5' : 'border-transparent bg-[var(--c-bg)]'}`}
                                >
                                    <p className="font-bold">Титан</p>
                                    <p className="text-[10px] text-[var(--c-hint)]">В клубе</p>
                                </button>
                                <button
                                    onClick={() => setFormData({ ...formData, type: 'exit' })}
                                    className={`p-3 rounded-xl border-2 transition-all ${formData.type === 'exit' ? 'border-[var(--c-accent)] bg-[var(--c-accent)]/5' : 'border-transparent bg-[var(--c-bg)]'}`}
                                >
                                    <p className="font-bold">Выезд</p>
                                    <p className="text-[10px] text-[var(--c-hint)]">На локации</p>
                                </button>
                            </div>

                            {formData.type === 'exit' && (
                                <Input
                                    label="Локация"
                                    placeholder="Где будет проходить?"
                                    value={formData.location || ''}
                                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                                />
                            )}

                            <div className="grid grid-cols-2 gap-3">
                                <Input
                                    type="date"
                                    label="Дата"
                                    value={formData.date}
                                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                />
                                <Input
                                    type="time"
                                    label="Время"
                                    value={formData.start_time}
                                    onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-[var(--c-hint)]">Тип оплаты</label>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setFormData({ ...formData, payment_type: 'fixed' })}
                                        className={`flex-1 py-2 rounded-lg text-sm transition-all ${formData.payment_type === 'fixed' ? 'bg-[var(--c-accent)] text-white' : 'bg-[var(--c-bg)]'}`}
                                    >
                                        Фикс
                                    </button>
                                    <button
                                        onClick={() => setFormData({ ...formData, payment_type: 'hourly' })}
                                        className={`flex-1 py-2 rounded-lg text-sm transition-all ${formData.payment_type === 'hourly' ? 'bg-[var(--c-accent)] text-white' : 'bg-[var(--c-bg)]'}`}
                                    >
                                        Почасовая
                                    </button>
                                </div>
                            </div>

                            {formData.payment_type === 'fixed' && (
                                <Input
                                    type="number"
                                    label="Сумма (₽)"
                                    value={formData.fixed_amount || 0}
                                    onChange={(e) => setFormData({ ...formData, fixed_amount: Number(e.target.value) })}
                                />
                            )}

                            <Input
                                label="Комментарий"
                                placeholder="Заказчик, особенности..."
                                value={formData.comment || ''}
                                onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
                            />
                        </div>

                        <Button
                            className="w-full h-12"
                            onClick={handleCreateEvent}
                            disabled={isSubmitting}
                        >
                            Создать
                        </Button>
                    </div>
                </div>
            )}

            {/* Completion (Hourly Calculator) Modal */}
            {showCompletionModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-[var(--c-surface)] w-full max-w-md rounded-2xl p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold">Завершение мероприятия</h3>
                            <button onClick={() => setShowCompletionModal(null)} className="text-[var(--c-hint)]">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            {showCompletionModal.payment_type === 'hourly' ? (
                                <div className="space-y-3">
                                    <p className="text-sm text-[var(--c-hint)]">Выберите время проведения для расчета стоимости:</p>
                                    <div className="grid grid-cols-1 gap-2">
                                        {[1, 2, 3, 4, 5].map(hours => (
                                            <button
                                                key={hours}
                                                onClick={() => setSelectedHours(hours)}
                                                className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${selectedHours === hours
                                                    ? 'border-[var(--c-accent)] bg-[var(--c-accent)]/5'
                                                    : 'border-transparent bg-[var(--c-bg)]'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <Timer className={`w-5 h-5 ${selectedHours === hours ? 'text-[var(--c-accent)]' : 'text-[var(--c-hint)]'}`} />
                                                    <span className="font-bold">{hours} {hours === 1 ? 'час' : hours < 5 ? 'часа' : 'часов'}</span>
                                                </div>
                                                <span className="text-lg font-black text-[var(--c-accent)]">{HOURLY_RATES[hours]}₽</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="p-6 bg-[var(--c-bg)] rounded-xl text-center space-y-2">
                                    <p className="text-sm text-[var(--c-hint)]">Итоговая сумма к оплате:</p>
                                    <p className="text-3xl font-black text-[var(--c-accent)]">{showCompletionModal.fixed_amount}₽</p>
                                </div>
                            )}

                            <div className="pt-2">
                                <Button
                                    className="w-full h-12 gap-2"
                                    onClick={handleCompleteEvent}
                                    disabled={isSubmitting}
                                >
                                    <CreditCard className="w-5 h-5" />
                                    Принять оплату и закрыть
                                </Button>
                                <p className="text-[10px] text-center text-[var(--c-hint)] mt-3">
                                    Будет автоматически создан закрытый чек для финансовой отчетности
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
