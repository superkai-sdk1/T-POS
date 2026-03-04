import { Drawer } from '@/components/ui/Drawer';
import {
  Receipt, ShoppingBag, Users, CreditCard,
  TrendingUp,
} from 'lucide-react';
import { useState } from 'react';
import { useSwipe } from '@/hooks/useSwipe';
import type { ShiftAnalytics as SA } from '@/store/shift';

interface Props {
  open: boolean;
  onClose: () => void;
  analytics: SA;
}

const pmLabels: Record<string, string> = {
  cash: 'Наличные', card: 'Карта', debt: 'Долг', bonus: 'Бонусы', split: 'Разделённая',
};
const pmColors: Record<string, string> = {
  cash: 'bg-emerald-500', card: 'bg-blue-500', debt: 'bg-red-500', bonus: 'bg-amber-500', split: 'bg-violet-500',
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

  const tabIdx = tabs.findIndex((t) => t.id === tab);
  const swipe = useSwipe({
    onSwipeLeft: () => { if (tabIdx < tabs.length - 1) setTab(tabs[tabIdx + 1].id); },
    onSwipeRight: () => { if (tabIdx > 0) setTab(tabs[tabIdx - 1].id); },
    threshold: 50,
  });

  const maxItemRev = analytics.itemsSold.length > 0 ? analytics.itemsSold[0].revenue : 1;
  const maxPlayerTotal = analytics.playerBreakdown.length > 0 ? analytics.playerBreakdown[0].total : 1;

  return (
    <Drawer open={open} onClose={onClose} title="Итоги смены">
      <div className="space-y-3" {...swipe}>
        {/* Tab nav */}
        <div className="flex gap-1 p-0.5 rounded-lg bg-white/3">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[11px] font-semibold transition-all ${
                tab === t.id
                  ? 'bg-[var(--c-accent)] text-white shadow-sm'
                  : 'text-white/30'
              }`}
            >
              <t.icon className="w-3 h-3" />
              {t.label}
            </button>
          ))}
        </div>

        <div key={tab} className="tab-content-enter">
          {tab === 'overview' && (
            <div className="space-y-2.5 stagger-children">
              <div className="p-3 rounded-xl bg-gradient-to-br from-[var(--c-accent)]/10 to-emerald-500/5 card">
                <p className="text-[10px] text-white/25 font-semibold mb-0.5">Выручка</p>
                <p className="text-2xl font-black text-[var(--c-text)] tabular-nums">{fmtCur(analytics.totalRevenue)}</p>
                <p className="text-[10px] text-white/20 mt-0.5">
                  {new Date(analytics.shift.opened_at).toLocaleDateString('ru-RU')} · {shiftDuration()}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { value: analytics.totalChecks, label: 'Чеков', color: 'text-[var(--c-accent)]' },
                  { value: fmtCur(analytics.avgCheck), label: 'Ср. чек', color: 'text-amber-400' },
                  { value: analytics.itemsSold.length, label: 'Позиций', color: 'text-emerald-400' },
                ].map((s) => (
                  <div key={s.label} className="p-2 rounded-xl card text-center">
                    <p className={`text-lg font-black tabular-nums ${s.color}`}>{s.value}</p>
                    <p className="text-[9px] text-white/20 font-semibold">{s.label}</p>
                  </div>
                ))}
              </div>

              {Object.keys(analytics.paymentBreakdown).length > 0 && (
                <div className="p-2.5 rounded-xl card space-y-1.5">
                  <p className="text-[10px] font-semibold text-white/20 uppercase tracking-wider flex items-center gap-1"><CreditCard className="w-3 h-3" /> Оплата</p>
                  {Object.entries(analytics.paymentBreakdown).map(([method, val]) => {
                    const pct = analytics.totalRevenue > 0 ? (val.amount / analytics.totalRevenue) * 100 : 0;
                    return (
                      <div key={method}>
                        <div className="flex justify-between text-[12px] mb-0.5">
                          <span className="text-white/35">{pmLabels[method] || method} · {val.count}</span>
                          <span className="font-bold text-[var(--c-text)] tabular-nums">{fmtCur(val.amount)}</span>
                        </div>
                        <div className="h-1 rounded-full bg-white/4 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${pmColors[method] || 'bg-gray-500'} transition-all duration-500`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {analytics.shift.cash_start > 0 && (
                <div className="p-2.5 rounded-xl card space-y-1">
                  <p className="text-[10px] font-semibold text-white/20 uppercase tracking-wider">Касса</p>
                  <div className="flex justify-between text-[12px]">
                    <span className="text-white/30">Начало</span>
                    <span className="text-[var(--c-text)] tabular-nums">{fmtCur(analytics.shift.cash_start)}</span>
                  </div>
                  {analytics.shift.cash_end !== null && (
                    <div className="flex justify-between text-[12px]">
                      <span className="text-white/30">Конец</span>
                      <span className="text-[var(--c-text)] tabular-nums">{fmtCur(analytics.shift.cash_end)}</span>
                    </div>
                  )}
                  {analytics.paymentBreakdown['cash'] && (
                    <div className="flex justify-between text-[12px] border-t border-white/5 pt-1">
                      <span className="text-white/30">Ожидаемо</span>
                      <span className="font-bold text-emerald-400 tabular-nums">
                        {fmtCur(analytics.shift.cash_start + analytics.paymentBreakdown['cash'].amount)}
                      </span>
                    </div>
                  )}
                  {analytics.shift.cash_end !== null && analytics.paymentBreakdown['cash'] && (() => {
                    const expected = analytics.shift.cash_start + analytics.paymentBreakdown['cash'].amount;
                    const diff = analytics.shift.cash_end - expected;
                    return diff !== 0 ? (
                      <div className="flex justify-between text-[12px]">
                        <span className="text-white/30">Расхождение</span>
                        <span className={`font-black tabular-nums ${diff < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                          {diff > 0 ? '+' : ''}{fmtCur(diff)}
                        </span>
                      </div>
                    ) : null;
                  })()}
                </div>
              )}
            </div>
          )}

          {tab === 'checks' && (
            <div className="space-y-1.5 max-h-[55vh] overflow-y-auto stagger-children">
              {analytics.checks.length === 0 && (
                <p className="text-center text-xs text-white/20 py-8">Нет закрытых чеков</p>
              )}
              {analytics.checks.map((c) => (
                <div key={c.id} className="p-2.5 rounded-xl card space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-[13px] text-[var(--c-text)]">{c.player_nickname}</span>
                      <span className="text-[10px] text-white/20 ml-1.5">{fmtTime(c.closed_at)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {c.payment_method && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-semibold ${
                          c.payment_method === 'cash' ? 'bg-emerald-500/10 text-emerald-400' :
                          c.payment_method === 'card' ? 'bg-blue-500/10 text-blue-400' :
                          c.payment_method === 'debt' ? 'bg-red-500/10 text-red-400' :
                          'bg-amber-500/10 text-amber-400'
                        }`}>
                          {pmLabels[c.payment_method] || c.payment_method}
                        </span>
                      )}
                      <span className="font-black text-[13px] text-[var(--c-accent)] tabular-nums">{fmtCur(c.total_amount + (c.bonus_used || 0))}</span>
                    </div>
                  </div>
                  {c.items.length > 0 && (
                    <div className="space-y-0.5 pl-2 border-l-2 border-white/4">
                      {c.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-[11px] text-white/30">
                          <span>{item.name} × {item.quantity}</span>
                          <span className="tabular-nums">{fmtCur(item.quantity * item.price)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {(c.bonus_used || 0) > 0 && (
                    <div className="flex justify-between text-[11px] pt-1 border-t border-white/4">
                      <span className="text-amber-400/50">Бонусы</span>
                      <span className="font-bold text-amber-400 tabular-nums">-{fmtCur(c.bonus_used)}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab === 'items' && (
            <div className="space-y-1 max-h-[55vh] overflow-y-auto stagger-children">
              {analytics.itemsSold.length === 0 && (
                <p className="text-center text-xs text-white/20 py-8">Нет продаж</p>
              )}
              {analytics.itemsSold.map((item, idx) => (
                <div key={item.name} className="flex items-center gap-2.5 p-2 rounded-xl card">
                  <span className="text-[10px] font-black text-white/12 w-4 text-right tabular-nums shrink-0">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-[var(--c-text)] truncate">{item.name}</p>
                    <div className="h-1 rounded-full bg-white/4 overflow-hidden mt-1">
                      <div
                        className="h-full rounded-full bg-[var(--c-accent)] transition-all duration-500"
                        style={{ width: `${(item.revenue / maxItemRev) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[12px] font-bold text-[var(--c-accent)] tabular-nums">{fmtCur(item.revenue)}</p>
                    <p className="text-[9px] text-white/20">{item.quantity} шт</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'players' && (
            <div className="space-y-1 max-h-[55vh] overflow-y-auto stagger-children">
              {analytics.playerBreakdown.length === 0 && (
                <p className="text-center text-xs text-white/20 py-8">Нет данных</p>
              )}
              {analytics.playerBreakdown.map((p, idx) => (
                <div key={p.nickname} className="flex items-center gap-2.5 p-2 rounded-xl card">
                  <span className="text-[10px] font-black text-white/12 w-4 text-right tabular-nums shrink-0">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-[var(--c-text)] truncate">{p.nickname}</p>
                    <div className="h-1 rounded-full bg-white/4 overflow-hidden mt-1">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${(p.total / maxPlayerTotal) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[12px] font-bold text-emerald-400 tabular-nums">{fmtCur(p.total)}</p>
                    <p className="text-[9px] text-white/20">{p.checks} чек.</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
}
