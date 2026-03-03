import { Drawer } from '@/components/ui/Drawer';
import {
  Receipt, ShoppingBag, Users, CreditCard,
  TrendingUp,
} from 'lucide-react';
import { useState } from 'react';
import type { ShiftAnalytics as SA } from '@/store/shift';

interface Props {
  open: boolean;
  onClose: () => void;
  analytics: SA;
}

const pmLabels: Record<string, string> = {
  cash: 'Наличные', card: 'Карта', debt: 'Долг', bonus: 'Бонусы',
};
const pmColors: Record<string, string> = {
  cash: 'bg-emerald-500', card: 'bg-blue-500', debt: 'bg-red-500', bonus: 'bg-amber-500',
};

type Tab = 'overview' | 'checks' | 'items' | 'players';

export function ShiftAnalytics({ open, onClose, analytics }: Props) {
  const [tab, setTab] = useState<Tab>('overview');

  const fmtCur = (n: number) =>
    new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + '₽';
  const fmtTime = (d: string | null) =>
    d ? new Date(d).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '-';

  const shiftDuration = () => {
    const start = new Date(analytics.shift.opened_at).getTime();
    const end = analytics.shift.closed_at
      ? new Date(analytics.shift.closed_at).getTime()
      : Date.now();
    const ms = end - start;
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}ч ${m}м`;
  };

  const tabs: { id: Tab; label: string; icon: typeof Receipt }[] = [
    { id: 'overview', label: 'Обзор', icon: TrendingUp },
    { id: 'checks', label: 'Чеки', icon: Receipt },
    { id: 'items', label: 'Товары', icon: ShoppingBag },
    { id: 'players', label: 'Игроки', icon: Users },
  ];

  const maxItemRev = analytics.itemsSold.length > 0 ? analytics.itemsSold[0].revenue : 1;
  const maxPlayerTotal = analytics.playerBreakdown.length > 0 ? analytics.playerBreakdown[0].total : 1;

  return (
    <Drawer open={open} onClose={onClose} title="Итоги смены">
      <div className="space-y-4">
        {/* Tab nav */}
        <div className="flex gap-1 p-1 rounded-xl bg-white/5">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                tab === t.id
                  ? 'bg-[var(--tg-theme-button-color,#6c5ce7)] text-white'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        {/* OVERVIEW */}
        {tab === 'overview' && (
          <div className="space-y-3">
            <div className="p-4 rounded-2xl bg-gradient-to-br from-[var(--tg-theme-button-color,#6c5ce7)]/20 to-emerald-500/10 border border-white/5">
              <p className="text-xs text-white/40 mb-1">Выручка за смену</p>
              <p className="text-3xl font-black text-[var(--tg-theme-text-color,#e0e0e0)]">{fmtCur(analytics.totalRevenue)}</p>
              <p className="text-xs text-white/30 mt-1">
                {new Date(analytics.shift.opened_at).toLocaleDateString('ru-RU')} · {shiftDuration()}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 rounded-xl bg-white/5 text-center">
                <p className="text-xl font-bold text-[var(--tg-theme-button-color,#6c5ce7)]">{analytics.totalChecks}</p>
                <p className="text-[10px] text-white/40">Чеков</p>
              </div>
              <div className="p-3 rounded-xl bg-white/5 text-center">
                <p className="text-xl font-bold text-amber-400">{fmtCur(analytics.avgCheck)}</p>
                <p className="text-[10px] text-white/40">Ср. чек</p>
              </div>
              <div className="p-3 rounded-xl bg-white/5 text-center">
                <p className="text-xl font-bold text-emerald-400">{analytics.itemsSold.length}</p>
                <p className="text-[10px] text-white/40">Позиций</p>
              </div>
            </div>

            {/* Payment breakdown */}
            {Object.keys(analytics.paymentBreakdown).length > 0 && (
              <div className="p-3 rounded-xl bg-white/5 space-y-2">
                <p className="text-xs font-semibold text-white/50 flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5" /> Оплата</p>
                {Object.entries(analytics.paymentBreakdown).map(([method, val]) => {
                  const pct = analytics.totalRevenue > 0 ? (val.amount / analytics.totalRevenue) * 100 : 0;
                  return (
                    <div key={method}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-white/50">{pmLabels[method] || method} · {val.count} чек.</span>
                        <span className="font-semibold text-[var(--tg-theme-text-color,#e0e0e0)]">{fmtCur(val.amount)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${pmColors[method] || 'bg-gray-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Cash balance */}
            {analytics.shift.cash_start > 0 && (
              <div className="p-3 rounded-xl bg-white/5 space-y-1.5">
                <p className="text-xs font-semibold text-white/50">Касса</p>
                <div className="flex justify-between text-sm">
                  <span className="text-white/40">Начало</span>
                  <span className="text-[var(--tg-theme-text-color,#e0e0e0)]">{fmtCur(analytics.shift.cash_start)}</span>
                </div>
                {analytics.shift.cash_end !== null && (
                  <div className="flex justify-between text-sm">
                    <span className="text-white/40">Конец (факт)</span>
                    <span className="text-[var(--tg-theme-text-color,#e0e0e0)]">{fmtCur(analytics.shift.cash_end)}</span>
                  </div>
                )}
                {analytics.paymentBreakdown['cash'] && (
                  <div className="flex justify-between text-sm border-t border-white/10 pt-1.5">
                    <span className="text-white/40">Ожидаемо нал.</span>
                    <span className="font-semibold text-emerald-400">
                      {fmtCur(analytics.shift.cash_start + analytics.paymentBreakdown['cash'].amount)}
                    </span>
                  </div>
                )}
                {analytics.shift.cash_end !== null && analytics.paymentBreakdown['cash'] && (() => {
                  const expected = analytics.shift.cash_start + analytics.paymentBreakdown['cash'].amount;
                  const diff = analytics.shift.cash_end - expected;
                  return diff !== 0 ? (
                    <div className="flex justify-between text-sm">
                      <span className="text-white/40">Расхождение</span>
                      <span className={`font-bold ${diff < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                        {diff > 0 ? '+' : ''}{fmtCur(diff)}
                      </span>
                    </div>
                  ) : null;
                })()}
              </div>
            )}
          </div>
        )}

        {/* CHECKS */}
        {tab === 'checks' && (
          <div className="space-y-2 max-h-[55vh] overflow-y-auto">
            {analytics.checks.length === 0 && (
              <p className="text-center text-sm text-white/30 py-8">Нет закрытых чеков</p>
            )}
            {analytics.checks.map((c) => (
              <div key={c.id} className="p-3 rounded-xl bg-white/5 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-sm text-[var(--tg-theme-text-color,#e0e0e0)]">{c.player_nickname}</span>
                    <span className="text-[10px] text-white/30 ml-2">{fmtTime(c.closed_at)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {c.payment_method && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        c.payment_method === 'cash' ? 'bg-emerald-500/15 text-emerald-400' :
                        c.payment_method === 'card' ? 'bg-blue-500/15 text-blue-400' :
                        c.payment_method === 'debt' ? 'bg-red-500/15 text-red-400' :
                        'bg-amber-500/15 text-amber-400'
                      }`}>
                        {pmLabels[c.payment_method] || c.payment_method}
                      </span>
                    )}
                    <span className="font-bold text-sm text-[var(--tg-theme-button-color,#6c5ce7)]">{fmtCur(c.total_amount)}</span>
                  </div>
                </div>
                {c.items.length > 0 && (
                  <div className="space-y-0.5 pl-2 border-l-2 border-white/5">
                    {c.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-xs text-white/40">
                        <span>{item.name} × {item.quantity}</span>
                        <span>{fmtCur(item.quantity * item.price)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ITEMS */}
        {tab === 'items' && (
          <div className="space-y-2 max-h-[55vh] overflow-y-auto">
            {analytics.itemsSold.length === 0 && (
              <p className="text-center text-sm text-white/30 py-8">Нет продаж</p>
            )}
            {analytics.itemsSold.map((item, idx) => (
              <div key={item.name} className="p-3 rounded-xl bg-white/5">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-xs font-bold text-white/20 w-5 text-right">{idx + 1}</span>
                    <span className="text-sm font-medium text-[var(--tg-theme-text-color,#e0e0e0)] truncate">{item.name}</span>
                    <span className="text-[10px] text-white/30 shrink-0">{item.quantity} шт</span>
                  </div>
                  <span className="font-bold text-sm text-[var(--tg-theme-button-color,#6c5ce7)] shrink-0 ml-2">{fmtCur(item.revenue)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[var(--tg-theme-button-color,#6c5ce7)]"
                    style={{ width: `${(item.revenue / maxItemRev) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* PLAYERS */}
        {tab === 'players' && (
          <div className="space-y-2 max-h-[55vh] overflow-y-auto">
            {analytics.playerBreakdown.length === 0 && (
              <p className="text-center text-sm text-white/30 py-8">Нет данных</p>
            )}
            {analytics.playerBreakdown.map((p, idx) => (
              <div key={p.nickname} className="p-3 rounded-xl bg-white/5">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-xs font-bold text-white/20 w-5 text-right">{idx + 1}</span>
                    <span className="text-sm font-medium text-[var(--tg-theme-text-color,#e0e0e0)] truncate">{p.nickname}</span>
                    <span className="text-[10px] text-white/30 shrink-0">{p.checks} чек.</span>
                  </div>
                  <span className="font-bold text-sm text-emerald-400 shrink-0 ml-2">{fmtCur(p.total)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${(p.total / maxPlayerTotal) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Drawer>
  );
}
