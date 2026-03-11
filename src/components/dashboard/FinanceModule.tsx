import { memo, useState, useEffect } from 'react';
import { useLayoutStore } from '@/store/layout';
import {
  ArrowUpRight, ArrowDownRight, Wallet, PieChart, AlertCircle,
  TrendingUp, ChevronRight, ArrowLeft, Receipt,
} from 'lucide-react';
import type { Profile } from '@/types';

interface Props {
  revenue: number;
  prevRevenue: number;
  netProfit: number;
  prevNetProfit: number;
  marginPct: number;
  totalExpenses: number;
  prevTotalExpenses: number;
  cogs: number;
  periodExpenses: number;
  supplyCostInPeriod: number;
  paymentBreakdown: { cash: number; card: number; debt: number; bonus: number; deposit: number };
  debtors: Profile[];
  totalDebt: number;
  checkCount: number;
  prevCheckCount: number;
  avgCheck: number;
  delta: (c: number, p: number) => number;
  onNavigate: (target: string) => void;
}

const fmt = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n);
const fmtCur = (n: number) => fmt(n) + '₽';

function DeltaBadge({ value }: { value: number }) {
  if (value === 0) return null;
  return (
    <span className={`text-[9px] font-bold ${value > 0 ? 'text-[var(--c-success)]' : 'text-[var(--c-danger)]'}`}>
      {value > 0 ? '↑' : '↓'}{Math.abs(value)}%
    </span>
  );
}

type DetailView = null | 'revenue' | 'expenses' | 'pnl' | 'payments' | 'debtors';

export const FinanceModule = memo(function FinanceModule(props: Props) {
  const { revenue, prevRevenue, netProfit, marginPct, totalExpenses,
    paymentBreakdown,
    debtors, totalDebt, checkCount, prevCheckCount, avgCheck, delta, onNavigate } = props;

  const [detail, setDetail] = useState<DetailView>(null);
  const addHideReason = useLayoutStore((s) => s.addHideReason);
  const removeHideReason = useLayoutStore((s) => s.removeHideReason);
  useEffect(() => {
    if (detail) {
      addHideReason('dashboard-detail');
      return () => removeHideReason('dashboard-detail');
    }
  }, [detail, addHideReason, removeHideReason]);
  const revDelta = delta(revenue, prevRevenue);
  const totalPayments = paymentBreakdown.cash + paymentBreakdown.card + paymentBreakdown.debt + paymentBreakdown.bonus + paymentBreakdown.deposit;

  if (detail) {
    return (
      <DetailScreen
        detail={detail}
        onBack={() => setDetail(null)}
        {...props}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-2">
        <button onClick={() => setDetail('revenue')} className="p-3 rounded-xl bg-gradient-to-br from-[rgba(var(--c-accent-rgb),0.12)] to-transparent card-interactive text-left">
          <div className="flex items-center gap-1 mb-1">
            <ArrowUpRight className="w-3 h-3 text-[var(--c-success)]" />
            <span className="text-[9px] text-[var(--c-hint)] font-semibold uppercase">Доход</span>
          </div>
          <p className="text-base font-black text-[var(--c-text)] tabular-nums leading-tight">{fmtCur(revenue)}</p>
          <DeltaBadge value={revDelta} />
        </button>

        <button onClick={() => setDetail('expenses')} className="p-3 rounded-xl card-interactive text-left">
          <div className="flex items-center gap-1 mb-1">
            <ArrowDownRight className="w-3 h-3 text-[var(--c-danger)]" />
            <span className="text-[9px] text-[var(--c-hint)] font-semibold uppercase">Расходы</span>
          </div>
          <p className="text-base font-black text-[var(--c-danger)] tabular-nums leading-tight">{fmtCur(totalExpenses)}</p>
          <DeltaBadge value={delta(totalExpenses, props.prevTotalExpenses)} />
        </button>

        <button onClick={() => setDetail('pnl')} className={`p-3 rounded-xl card-interactive text-left ${netProfit >= 0 ? 'bg-[var(--c-success-bg)]' : 'bg-[var(--c-danger-bg)]'}`}>
          <div className="flex items-center gap-1 mb-1">
            <Wallet className="w-3 h-3 text-[var(--c-accent)]" />
            <span className="text-[9px] text-[var(--c-hint)] font-semibold uppercase">Прибыль</span>
          </div>
          <p className={`text-base font-black tabular-nums leading-tight ${netProfit >= 0 ? 'text-[var(--c-success)]' : 'text-[var(--c-danger)]'}`}>
            {fmtCur(netProfit)}
          </p>
          <span className="text-[9px] text-[var(--c-muted)]">маржа {marginPct}%</span>
        </button>
      </div>

      {/* Margin warning */}
      {marginPct < 85 && marginPct > 0 && (
        <div className="p-3 rounded-xl bg-[var(--c-danger-bg)] border border-[var(--c-danger-border)] flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-[var(--c-danger)] shrink-0" />
          <p className="text-xs text-[var(--c-danger)]">
            Маржинальность {marginPct}% — ниже целевых 85%. Проверьте расходы.
          </p>
        </div>
      )}

      {/* P&L bar */}
      {revenue > 0 && (
        <button onClick={() => setDetail('pnl')} className="w-full p-3 rounded-xl card-interactive space-y-2 text-left">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[var(--c-hint)] font-semibold uppercase tracking-wider">Структура P&L</span>
            <PieChart className="w-3 h-3 text-[var(--c-muted)]" />
          </div>
          <div className="flex h-3 rounded-full overflow-hidden bg-[var(--c-surface)]">
            {totalExpenses > 0 && <div className="bg-red-500/70 transition-all duration-700" style={{ width: `${(totalExpenses / revenue) * 100}%` }} />}
            <div className="bg-emerald-500 transition-all duration-700" style={{ width: `${Math.max(0, (netProfit / revenue) * 100)}%` }} />
          </div>
          <div className="flex gap-4 text-[10px]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-[var(--c-hint)]">Прибыль {marginPct}%</span></span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500/70" /><span className="text-[var(--c-hint)]">Расходы {100 - marginPct}%</span></span>
          </div>
        </button>
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-2.5 rounded-xl card flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[var(--c-surface)] flex items-center justify-center shrink-0">
            <Receipt className="w-4 h-4 text-[var(--c-info)]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-[var(--c-text)] tabular-nums leading-tight">{checkCount}</p>
            <div className="flex items-center gap-1">
              <p className="text-[9px] text-[var(--c-muted)]">Чеков</p>
              <DeltaBadge value={delta(checkCount, prevCheckCount)} />
            </div>
          </div>
        </div>
        <div className="p-2.5 rounded-xl card flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[var(--c-surface)] flex items-center justify-center shrink-0">
            <TrendingUp className="w-4 h-4 text-[var(--c-warning)]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-[var(--c-text)] tabular-nums leading-tight">{fmtCur(avgCheck)}</p>
            <p className="text-[9px] text-[var(--c-muted)]">Средний чек</p>
          </div>
        </div>
      </div>

      {/* Payment methods */}
      <div>
        <button onClick={() => setDetail('payments')} className="flex items-center gap-1 mb-2 group">
          <h3 className="text-[11px] font-semibold text-[var(--c-hint)] uppercase tracking-wider">Способы оплаты</h3>
          <ChevronRight className="w-3 h-3 text-[var(--c-muted)] group-hover:text-[var(--c-hint)] transition-colors" />
        </button>
        <div className="space-y-2">
          {([
            { label: 'Наличные', value: paymentBreakdown.cash, color: 'bg-emerald-500' },
            { label: 'Карта', value: paymentBreakdown.card, color: 'bg-sky-500' },
            { label: 'В долг', value: paymentBreakdown.debt, color: 'bg-red-500' },
            { label: 'Бонусы', value: paymentBreakdown.bonus, color: 'bg-amber-500' },
            { label: 'Депозит', value: paymentBreakdown.deposit, color: 'bg-cyan-500' },
          ] as const).filter((pm) => pm.value > 0).map((pm) => {
            const pct = totalPayments > 0 ? (pm.value / totalPayments) * 100 : 0;
            return (
              <div key={pm.label} className="flex items-center gap-3">
                <span className="text-xs text-[var(--c-hint)] w-16 shrink-0">{pm.label}</span>
                <div className="flex-1 h-1.5 rounded-full bg-[var(--c-surface)] overflow-hidden">
                  <div className={`h-full rounded-full ${pm.color} transition-all duration-700`} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs font-bold text-[var(--c-text)] w-20 text-right tabular-nums">{fmtCur(pm.value)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Debtors */}
      <button onClick={() => setDetail('debtors')} className="w-full flex items-center gap-2 group">
        <AlertCircle className="w-4 h-4 text-[var(--c-danger)]" />
        <h3 className="text-sm font-semibold text-[var(--c-text)]">Должники ({debtors.length})</h3>
        <span className="ml-auto text-xs font-bold text-[var(--c-danger)]">{fmtCur(totalDebt)}</span>
        <ChevronRight className="w-3.5 h-3.5 text-[var(--c-muted)] group-hover:text-[var(--c-hint)] transition-colors shrink-0" />
      </button>
      {debtors.length > 0 && (
        <div className="space-y-1.5">
          {debtors.slice(0, 3).map((d) => (
            <div key={d.id} className="flex items-center justify-between p-2.5 rounded-xl bg-[var(--c-danger-bg)] border border-[var(--c-border)]">
              <span className="font-medium text-sm text-[var(--c-text)]">{d.nickname}</span>
              <span className="font-bold text-sm text-[var(--c-danger)]">{fmtCur(d.balance)}</span>
            </div>
          ))}
          {debtors.length > 3 && (
            <button onClick={() => onNavigate('management:debtors')} className="w-full py-1.5 text-xs text-[var(--c-accent)] font-medium">
              Все должники ({debtors.length}) →
            </button>
          )}
        </div>
      )}
    </div>
  );
});

function DetailScreen(props: Props & { detail: DetailView; onBack: () => void }) {
  const { detail, onBack, revenue, prevRevenue, netProfit, marginPct, totalExpenses,
    cogs, periodExpenses, supplyCostInPeriod, paymentBreakdown, debtors, totalDebt,
    checkCount, delta, onNavigate } = props;

  // Stable timestamp for debtors view (useState initializer runs once, not on re-render)
  const [nowTimestamp] = useState(() => Date.now());

  const statRow = (label: string, value: number, color = 'text-[var(--c-text)]') => (
    <div className="flex items-center justify-between py-2 border-b border-[var(--c-border)] last:border-0">
      <span className="text-xs text-[var(--c-hint)]">{label}</span>
      <span className={`text-sm font-bold tabular-nums ${color}`}>{fmtCur(value)}</span>
    </div>
  );

  const header = (title: string) => (
    <div className="flex items-center gap-2 mb-4">
      <button onClick={onBack} className="w-9 h-9 rounded-xl bg-[var(--c-surface)] flex items-center justify-center active:scale-90 transition-transform shrink-0">
        <ArrowLeft className="w-4 h-4 text-[var(--c-text)]" />
      </button>
      <h2 className="text-lg font-bold text-[var(--c-text)]">{title}</h2>
    </div>
  );

  if (detail === 'pnl') {
    return (
      <div className="space-y-4 animate-fade-in-up">
        {header('P&L Отчёт')}
        <div className={`p-4 rounded-xl text-center ${netProfit >= 0 ? 'bg-[var(--c-success-bg)] border border-[var(--c-success-border)]' : 'bg-[var(--c-danger-bg)] border border-[var(--c-danger-border)]'}`}>
          <p className="text-[11px] text-[var(--c-hint)] mb-1">Чистая прибыль</p>
          <p className={`text-3xl font-black tabular-nums ${netProfit >= 0 ? 'text-[var(--c-success)]' : 'text-[var(--c-danger)]'}`}>{fmtCur(netProfit)}</p>
          <p className="text-[11px] text-[var(--c-muted)] mt-1">маржа {marginPct}%</p>
        </div>
        <div className="p-3 rounded-xl card">
          <h3 className="text-[11px] font-semibold text-[var(--c-hint)] uppercase tracking-wider mb-1">P&L</h3>
          {statRow('Выручка', revenue, 'text-[var(--c-success)]')}
          {cogs > 0 && statRow('Себестоимость (COGS)', -cogs, 'text-[var(--c-warning)]')}
          {periodExpenses > 0 && statRow('Опер. расходы (OPEX)', -periodExpenses, 'text-[var(--c-danger)]')}
          <div className="border-t-2 border-[var(--c-border)] mt-1 pt-1">
            {statRow('Чистая прибыль', netProfit, netProfit >= 0 ? 'text-[var(--c-success)]' : 'text-[var(--c-danger)]')}
          </div>
        </div>
        <div className="p-3 rounded-xl card">
          <h3 className="text-[11px] font-semibold text-[var(--c-hint)] uppercase tracking-wider mb-1">Сравнение с пред. периодом</h3>
          {statRow('Выручка (текущий)', revenue)}
          {statRow('Выручка (предыдущий)', prevRevenue, 'text-[var(--c-hint)]')}
          {statRow('Расходы (текущий)', totalExpenses, 'text-[var(--c-danger)]')}
          {statRow('Расходы (предыдущий)', props.prevTotalExpenses, 'text-[var(--c-hint)]')}
        </div>
      </div>
    );
  }

  if (detail === 'expenses') {
    return (
      <div className="space-y-4 animate-fade-in-up">
        {header('Детализация расходов')}
        <div className="p-4 rounded-xl bg-[var(--c-danger-bg)] border border-[var(--c-danger-border)] text-center">
          <p className="text-3xl font-black text-[var(--c-danger)] tabular-nums">{fmtCur(totalExpenses)}</p>
          <p className="text-[11px] text-[var(--c-hint)] mt-1">расходы за период</p>
        </div>
        <div className="p-3 rounded-xl card">
          {cogs > 0 && statRow('Себестоимость проданного (COGS)', cogs, 'text-[var(--c-warning)]')}
          {periodExpenses > 0 && statRow('Операционные расходы (OPEX)', periodExpenses, 'text-[var(--c-danger)]')}
          {supplyCostInPeriod > 0 && statRow('Закупки (поставки)', supplyCostInPeriod, 'text-[var(--c-danger)]')}
        </div>
        <button onClick={() => onNavigate('management:expenses')} className="w-full p-3 rounded-xl card-interactive flex items-center gap-2">
          <span className="text-xs text-[var(--c-accent)] font-medium">Управление расходами →</span>
        </button>
      </div>
    );
  }

  if (detail === 'revenue') {
    return (
      <div className="space-y-4 animate-fade-in-up">
        {header('Доход за период')}
        <div className="p-4 rounded-xl bg-gradient-to-br from-[rgba(var(--c-accent-rgb),0.12)] to-transparent card text-center">
          <p className="text-3xl font-black text-[var(--c-text)] tabular-nums">{fmtCur(revenue)}</p>
          <p className="text-[11px] text-[var(--c-hint)] mt-1">{checkCount} чеков · ср. {fmtCur(checkCount > 0 ? Math.round(revenue / checkCount) : 0)}</p>
          <DeltaBadge value={delta(revenue, prevRevenue)} />
        </div>
        <div className="p-3 rounded-xl card">
          <h3 className="text-[11px] font-semibold text-[var(--c-hint)] uppercase tracking-wider mb-1">По способам оплаты</h3>
          {paymentBreakdown.cash > 0 && statRow('Наличные', paymentBreakdown.cash, 'text-[var(--c-success)]')}
          {paymentBreakdown.card > 0 && statRow('Карта', paymentBreakdown.card, 'text-[var(--c-info)]')}
          {paymentBreakdown.debt > 0 && statRow('В долг', paymentBreakdown.debt, 'text-[var(--c-danger)]')}
          {paymentBreakdown.bonus > 0 && statRow('Бонусы', paymentBreakdown.bonus, 'text-[var(--c-warning)]')}
          {paymentBreakdown.deposit > 0 && statRow('Депозит', paymentBreakdown.deposit, 'text-cyan-400')}
        </div>
      </div>
    );
  }

  if (detail === 'debtors') {
    const sorted = [...debtors].sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
    return (
      <div className="space-y-4 animate-fade-in-up">
        {header(`Дебиторка · ${fmtCur(totalDebt)}`)}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-3 rounded-xl card text-center">
            <p className="text-lg font-black text-[var(--c-danger)] tabular-nums">{debtors.length}</p>
            <p className="text-[9px] text-[var(--c-muted)]">Должников</p>
          </div>
          <div className="p-3 rounded-xl card text-center">
            <p className="text-lg font-black text-[var(--c-danger)] tabular-nums">{fmtCur(totalDebt)}</p>
            <p className="text-[9px] text-[var(--c-muted)]">Общий долг</p>
          </div>
        </div>
        <div className="space-y-1.5">
          {sorted.map((d) => {
            const daysAgo = d.updated_at ? Math.floor((nowTimestamp - new Date(d.updated_at).getTime()) / 86400000) : 0;
            const isOld = daysAgo > 30;
            return (
              <div key={d.id} className={`flex items-center justify-between p-3 rounded-xl card ${isOld ? 'border-l-2 border-l-[var(--c-danger)]' : ''}`}>
                <div>
                  <p className="text-sm font-medium text-[var(--c-text)]">{d.nickname}</p>
                  {isOld && <p className="text-[10px] text-[var(--c-danger)]">{daysAgo}д без оплаты</p>}
                </div>
                <span className="font-bold text-sm text-[var(--c-danger)] tabular-nums">{fmtCur(d.balance)}</span>
              </div>
            );
          })}
        </div>
        <button onClick={() => onNavigate('management:debtors')} className="w-full p-3 rounded-xl card-interactive text-center">
          <span className="text-xs text-[var(--c-accent)] font-medium">Управление долгами →</span>
        </button>
      </div>
    );
  }

  return null;
}
