import { useState, memo } from 'react';
import { useAnalyticsStore, type PeriodPreset } from '@/store/analytics';
import { CalendarDays, Filter, X, Search } from 'lucide-react';
import type { PaymentMethod, Profile } from '@/types';

const PRESETS: { id: PeriodPreset; label: string }[] = [
  { id: 'today', label: 'Сегодня' },
  { id: 'yesterday', label: 'Вчера' },
  { id: 'week', label: 'Неделя' },
  { id: 'month', label: 'Месяц' },
  { id: 'quarter', label: 'Квартал' },
];

const PM_OPTIONS: { id: PaymentMethod; label: string }[] = [
  { id: 'cash', label: 'Наличные' },
  { id: 'card', label: 'Карта' },
  { id: 'debt', label: 'Долг' },
  { id: 'bonus', label: 'Бонусы' },
  { id: 'deposit', label: 'Депозит' },
];

interface Props {
  admins?: Pick<Profile, 'id' | 'nickname'>[];
  showSearch?: boolean;
}

export const AnalyticsFilter = memo(function AnalyticsFilter({ admins = [], showSearch }: Props) {
  const preset = useAnalyticsStore((s) => s.preset);
  const setPreset = useAnalyticsStore((s) => s.setPreset);
  const setCustomRange = useAnalyticsStore((s) => s.setCustomRange);
  const paymentFilter = useAnalyticsStore((s) => s.paymentFilter);
  const setPaymentFilter = useAnalyticsStore((s) => s.setPaymentFilter);
  const adminFilter = useAnalyticsStore((s) => s.adminFilter);
  const setAdminFilter = useAnalyticsStore((s) => s.setAdminFilter);
  const search = useAnalyticsStore((s) => s.search);
  const setSearch = useAnalyticsStore((s) => s.setSearch);
  const [expanded, setExpanded] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const hasFilters = paymentFilter !== null || adminFilter !== null;

  const applyCustomRange = () => {
    if (dateFrom && dateTo) {
      const start = new Date(dateFrom + 'T00:00:00');
      const end = new Date(dateTo + 'T23:59:59');
      if (start <= end) {
        setCustomRange(start, end);
        setShowDatePicker(false);
      }
    }
  };

  return (
    <div className="space-y-2">
      {/* Period presets */}
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pb-0.5">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => { setPreset(p.id); setShowDatePicker(false); }}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all active:scale-95 ${preset === p.id && !showDatePicker
              ? 'bg-[var(--c-accent)] text-[var(--c-accent-text)] shadow-sm'
              : 'bg-[var(--c-surface)] text-[var(--c-hint)] hover:bg-[var(--c-surface-hover)]'
              }`}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => setShowDatePicker(!showDatePicker)}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all active:scale-95 flex items-center gap-1 ${showDatePicker || preset === 'custom'
            ? 'bg-[var(--c-accent)] text-[var(--c-accent-text)] shadow-sm'
            : 'bg-[var(--c-surface)] text-[var(--c-hint)]'
            }`}
        >
          <CalendarDays className="w-3 h-3" />
          Период
        </button>
        <button
          onClick={() => setExpanded(!expanded)}
          className={`ml-auto w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all active:scale-90 ${hasFilters ? 'bg-[rgba(var(--c-accent-rgb),0.1)] text-[var(--c-accent)]' : 'bg-[var(--c-surface)] text-[var(--c-hint)]'
            }`}
        >
          <Filter className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Date picker */}
      {showDatePicker && (
        <div className="p-3 rounded-xl card space-y-2 animate-fade-in-up">
          <p className="text-[10px] font-semibold text-[var(--c-hint)] uppercase tracking-wider">Выберите период</p>
          <div className="flex gap-2 items-center">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="flex-1 px-2 py-1.5 text-xs rounded-lg bg-[var(--c-surface)] border border-[var(--c-border)] text-[var(--c-text)] focus:outline-none focus:ring-1 focus:ring-[rgba(var(--c-accent-rgb),0.3)]"
            />
            <span className="text-xs text-[var(--c-hint)]">—</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="flex-1 px-2 py-1.5 text-xs rounded-lg bg-[var(--c-surface)] border border-[var(--c-border)] text-[var(--c-text)] focus:outline-none focus:ring-1 focus:ring-[rgba(var(--c-accent-rgb),0.3)]"
            />
          </div>
          <button
            onClick={applyCustomRange}
            disabled={!dateFrom || !dateTo}
            className="w-full py-1.5 rounded-lg text-xs font-semibold bg-[var(--c-accent)] text-[var(--c-accent-text)] disabled:opacity-30 active:scale-[0.98] transition-transform"
          >
            Применить
          </button>
        </div>
      )}

      {/* Expanded filters */}
      {expanded && (
        <div className="p-3 rounded-xl card space-y-3 animate-fade-in-up">
          {/* Payment type */}
          <div>
            <p className="text-[10px] font-semibold text-[var(--c-hint)] uppercase tracking-wider mb-1.5">Тип оплаты</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setPaymentFilter(null)}
                className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all ${!paymentFilter ? 'bg-[var(--c-accent)] text-[var(--c-accent-text)]' : 'bg-[var(--c-surface)] text-[var(--c-hint)]'
                  }`}
              >
                Все
              </button>
              {PM_OPTIONS.map((pm) => (
                <button
                  key={pm.id}
                  onClick={() => setPaymentFilter(paymentFilter === pm.id ? null : pm.id)}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all ${paymentFilter === pm.id ? 'bg-[var(--c-accent)] text-[var(--c-accent-text)]' : 'bg-[var(--c-surface)] text-[var(--c-hint)]'
                    }`}
                >
                  {pm.label}
                </button>
              ))}
            </div>
          </div>

          {/* Admin filter */}
          {admins.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-[var(--c-hint)] uppercase tracking-wider mb-1.5">Администратор</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setAdminFilter(null)}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all ${!adminFilter ? 'bg-[var(--c-accent)] text-[var(--c-accent-text)]' : 'bg-[var(--c-surface)] text-[var(--c-hint)]'
                    }`}
                >
                  Все
                </button>
                {admins.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setAdminFilter(adminFilter === a.id ? null : a.id)}
                    className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all ${adminFilter === a.id ? 'bg-[var(--c-accent)] text-[var(--c-accent-text)]' : 'bg-[var(--c-surface)] text-[var(--c-hint)]'
                      }`}
                  >
                    {a.nickname}
                  </button>
                ))}
              </div>
            </div>
          )}

          {hasFilters && (
            <button
              onClick={() => { setPaymentFilter(null); setAdminFilter(null); }}
              className="flex items-center gap-1 text-[11px] text-[var(--c-danger)] font-medium"
            >
              <X className="w-3 h-3" /> Сбросить фильтры
            </button>
          )}
        </div>
      )}

      {/* Search */}
      {showSearch && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--c-hint)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по товарам и игрокам..."
            className="w-full pl-8 pr-3 py-2 text-xs rounded-xl bg-[var(--c-surface)] border border-[var(--c-border)] text-[var(--c-text)] placeholder:text-[var(--c-muted)] focus:outline-none focus:ring-1 focus:ring-[rgba(var(--c-accent-rgb),0.3)]"
          />
        </div>
      )}
    </div>
  );
});
