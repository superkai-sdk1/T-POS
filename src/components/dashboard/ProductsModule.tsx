import { memo, useState, useMemo, useEffect } from 'react';
import { useLayoutStore } from '@/store/layout';
import { ArrowLeft, ShoppingBag, Crown, ChevronRight, Search, BarChart3 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import type { ProductStat } from '@/hooks/useAnalyticsData';
import { useAnalyticsStore } from '@/store/analytics';

interface Props {
  products: ProductStat[];
  allCheckItems: { item_id: string; check_id: string; quantity: number; price_at_time: number; item: { name: string; category: string } | null }[];
  checks: { id: string; player_id: string; closed_at: string; player: { nickname: string } | null }[];
  refundQtyByCheckItem?: Map<string, number>;
}

const fmt = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n);
const fmtCur = (n: number) => fmt(n) + '₽';

const abcColors: Record<string, { bg: string; text: string; label: string }> = {
  A: { bg: 'bg-[var(--c-success-bg)]', text: 'text-[var(--c-success)]', label: 'Топ (A)' },
  B: { bg: 'bg-[var(--c-warning-bg)]', text: 'text-[var(--c-warning)]', label: 'Средний (B)' },
  C: { bg: 'bg-[var(--c-surface)]', text: 'text-[var(--c-hint)]', label: 'Неликвид (C)' },
};

const categoryLabels: Record<string, string> = {
  drinks: 'Напитки', food: 'Еда', bar: 'Снеки', hookah: 'Кальяны', services: 'Услуги',
};

export const ProductsModule = memo(function ProductsModule({ products, allCheckItems, checks, refundQtyByCheckItem }: Props) {
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [abcFilter, setAbcFilter] = useState<'all' | 'A' | 'B' | 'C'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'products' | 'services'>('all');
  const addHideReason = useLayoutStore((s) => s.addHideReason);
  const removeHideReason = useLayoutStore((s) => s.removeHideReason);
  useEffect(() => {
    if (selectedProduct) {
      addHideReason('dashboard-product-drilldown');
      return () => removeHideReason('dashboard-product-drilldown');
    }
  }, [selectedProduct, addHideReason, removeHideReason]);
  const search = useAnalyticsStore((s) => s.search);
  const setSearch = useAnalyticsStore((s) => s.setSearch);

  const filtered = useMemo(() => {
    let list = products;
    if (typeFilter === 'products') list = list.filter((p) => !p.isService);
    if (typeFilter === 'services') list = list.filter((p) => p.isService);
    if (abcFilter !== 'all') list = list.filter((p) => p.abcGroup === abcFilter);
    if (search) list = list.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [products, typeFilter, abcFilter, search]);

  const totalRevenue = products.reduce((s, p) => s + p.revenue, 0);
  const abcGroups = useMemo(() => ({
    A: products.filter((p) => p.abcGroup === 'A'),
    B: products.filter((p) => p.abcGroup === 'B'),
    C: products.filter((p) => p.abcGroup === 'C'),
  }), [products]);

  const product = selectedProduct ? products.find((p) => p.id === selectedProduct) : null;

  if (product) {
    return <ProductDrilldown product={product} allCheckItems={allCheckItems} checks={checks} refundQtyByCheckItem={refundQtyByCheckItem} onBack={() => setSelectedProduct(null)} />;
  }

  const productsCount = products.filter((p) => !p.isService).length;
  const servicesCount = products.filter((p) => p.isService).length;

  return (
    <div className="space-y-4">
      {/* Type filter: Товары / Услуги */}
      <div className="flex gap-1.5 p-1 rounded-xl bg-[var(--c-surface)]">
        <button
          onClick={() => setTypeFilter('all')}
          className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
            typeFilter === 'all' ? 'bg-[var(--c-accent)] text-[var(--c-accent-text)]' : 'text-[var(--c-hint)]'
          }`}
        >
          Все ({products.length})
        </button>
        <button
          onClick={() => setTypeFilter('products')}
          className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
            typeFilter === 'products' ? 'bg-[var(--c-accent)] text-[var(--c-accent-text)]' : 'text-[var(--c-hint)]'
          }`}
        >
          Товары ({productsCount})
        </button>
        <button
          onClick={() => setTypeFilter('services')}
          className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
            typeFilter === 'services' ? 'bg-[var(--c-accent)] text-[var(--c-accent-text)]' : 'text-[var(--c-hint)]'
          }`}
        >
          Услуги ({servicesCount})
        </button>
      </div>

      {/* ABC summary */}
      <div className="grid grid-cols-3 gap-2">
        {(['A', 'B', 'C'] as const).map((g) => {
          const abc = abcColors[g];
          const group = abcGroups[g];
          const rev = group.reduce((s, p) => s + p.revenue, 0);
          const pct = totalRevenue > 0 ? Math.round((rev / totalRevenue) * 100) : 0;
          return (
            <button
              key={g}
              onClick={() => setAbcFilter(abcFilter === g ? 'all' : g)}
              className={`p-2.5 rounded-xl text-center transition-all active:scale-95 ${
                abcFilter === g ? 'ring-2 ring-[var(--c-accent)]' : ''
              } ${abc.bg} border border-[var(--c-border)]`}
            >
              <p className={`text-lg font-black tabular-nums ${abc.text}`}>{group.length}</p>
              <p className="text-[9px] text-[var(--c-hint)]">{abc.label}</p>
              <p className="text-[10px] font-bold text-[var(--c-text)] mt-0.5">{pct}%</p>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--c-hint)]" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск товара..."
          className="w-full pl-8 pr-3 py-2 text-xs rounded-xl bg-[var(--c-surface)] border border-[var(--c-border)] text-[var(--c-text)] placeholder:text-[var(--c-muted)] focus:outline-none focus:ring-1 focus:ring-[rgba(var(--c-accent-rgb),0.3)]"
        />
      </div>

      {/* Product list */}
      {filtered.length === 0 ? (
        <div className="text-center py-10">
          <ShoppingBag className="w-12 h-12 text-[var(--c-muted)] mx-auto mb-2" />
          <p className="text-sm text-[var(--c-hint)]">Нет данных о продажах</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((item, i) => {
            const abc = abcColors[item.abcGroup];
            const maxRev = filtered[0]?.revenue || 1;
            return (
              <button
                key={item.id}
                onClick={() => setSelectedProduct(item.id)}
                className="w-full flex items-center gap-2.5 p-2.5 rounded-xl card-interactive text-left"
              >
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  i === 0 ? 'bg-[var(--c-warning-bg)] text-[var(--c-warning)]' :
                  i <= 2 ? `${abc.bg} ${abc.text}` :
                  'bg-[var(--c-surface)] text-[var(--c-hint)]'
                }`}>
                  {i === 0 ? <Crown className="w-3 h-3" /> : i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-[var(--c-text)] truncate">{item.name}</p>
                    <Badge variant={item.abcGroup === 'A' ? 'success' : item.abcGroup === 'B' ? 'warning' : 'default'} size="sm">
                      {item.abcGroup}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-[var(--c-muted)]">{categoryLabels[item.category] || item.category}</span>
                    <div className="flex-1 h-1 rounded-full bg-[var(--c-surface)] overflow-hidden">
                      <div className="h-full rounded-full bg-[var(--c-accent)] transition-all duration-500" style={{ width: `${(item.revenue / maxRev) * 100}%` }} />
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-[var(--c-text)] tabular-nums">{fmtCur(item.revenue)}</p>
                  <p className="text-[10px] text-[var(--c-hint)]">{item.qty} {item.isService ? 'раз' : 'шт'}</p>
                </div>
                <ChevronRight className="w-3 h-3 text-[var(--c-muted)] shrink-0" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

function ProductDrilldown({ product, allCheckItems, checks, refundQtyByCheckItem, onBack }: {
  product: ProductStat;
  allCheckItems: Props['allCheckItems'];
  checks: Props['checks'];
  refundQtyByCheckItem?: Map<string, number>;
  onBack: () => void;
}) {
  const salesByDay = useMemo(() => {
    const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const dayMap: Record<number, { qty: number; revenue: number }> = {};
    for (let i = 0; i < 7; i++) dayMap[i] = { qty: 0, revenue: 0 };

    const checkDateMap = new Map(checks.map((c) => [c.id, new Date(c.closed_at)]));
    for (const ci of allCheckItems) {
      if (ci.item_id !== product.id) continue;
      const refundQty = refundQtyByCheckItem?.get(`${ci.check_id}:${ci.item_id}`) || 0;
      const netQty = ci.quantity - refundQty;
      if (netQty <= 0) continue;
      const date = checkDateMap.get(ci.check_id);
      if (!date) continue;
      const day = date.getDay();
      dayMap[day].qty += netQty;
      dayMap[day].revenue += netQty * ci.price_at_time;
    }

    return dayNames.map((name, i) => ({ name, ...dayMap[i] }));
  }, [product.id, allCheckItems, checks, refundQtyByCheckItem]);

  const buyers = useMemo(() => {
    const buyerChecks: Record<string, { nickname: string; qty: number; total: number }> = {};
    const checkPlayerMap = new Map(checks.map((c) => [c.id, { id: c.player_id, nick: c.player?.nickname || 'Гость' }]));

    for (const ci of allCheckItems) {
      if (ci.item_id !== product.id) continue;
      const refundQty = refundQtyByCheckItem?.get(`${ci.check_id}:${ci.item_id}`) || 0;
      const netQty = ci.quantity - refundQty;
      if (netQty <= 0) continue;
      const p = checkPlayerMap.get(ci.check_id);
      if (!p || !p.id) continue;
      if (!buyerChecks[p.id]) buyerChecks[p.id] = { nickname: p.nick, qty: 0, total: 0 };
      buyerChecks[p.id].qty += netQty;
      buyerChecks[p.id].total += netQty * ci.price_at_time;
    }

    return Object.values(buyerChecks).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [product.id, allCheckItems, checks, refundQtyByCheckItem]);

  const maxDayQty = Math.max(...salesByDay.map((d) => d.qty), 1);

  return (
    <div className="space-y-4 animate-fade-in-up">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={onBack} className="w-9 h-9 rounded-xl bg-[var(--c-surface)] flex items-center justify-center active:scale-90 transition-transform shrink-0">
          <ArrowLeft className="w-4 h-4 text-[var(--c-text)]" />
        </button>
        <div>
          <h2 className="text-lg font-bold text-[var(--c-text)]">{product.name}</h2>
          <p className="text-[10px] text-[var(--c-hint)]">{categoryLabels[product.category] || product.category} · Группа {product.abcGroup}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'Выручка', value: fmtCur(product.revenue), color: 'text-[var(--c-success)]' },
          { label: 'Прибыль', value: fmtCur(product.profit), color: product.profit >= 0 ? 'text-[var(--c-success)]' : 'text-[var(--c-danger)]' },
          { label: 'Продано', value: `${product.qty} ${product.isService ? 'раз' : 'шт'}`, color: 'text-[var(--c-info)]' },
          { label: 'Покупателей', value: `${product.buyers.size}`, color: 'text-[var(--c-accent)]' },
        ].map((s) => (
          <div key={s.label} className="p-2.5 rounded-xl card text-center">
            <p className={`text-sm font-black tabular-nums ${s.color}`}>{s.value}</p>
            <p className="text-[9px] text-[var(--c-muted)]">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Sales by day */}
      <div className="p-3 rounded-xl card">
        <div className="flex items-center gap-1.5 mb-3">
          <BarChart3 className="w-3.5 h-3.5 text-[var(--c-hint)]" />
          <h3 className="text-[11px] font-semibold text-[var(--c-hint)] uppercase tracking-wider">Продажи по дням недели</h3>
        </div>
        <div className="flex items-end gap-1.5 h-24">
          {salesByDay.map((day) => (
            <div key={day.name} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[8px] text-[var(--c-hint)]">{day.qty > 0 ? day.qty : ''}</span>
              <div className="w-full flex-1 flex items-end">
                <div className="w-full rounded-t-md bg-[var(--c-accent)] min-h-[2px] transition-all duration-500" style={{ height: `${Math.max(2, (day.qty / maxDayQty) * 100)}%` }} />
              </div>
              <span className="text-[9px] text-[var(--c-hint)] font-semibold">{day.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top buyers */}
      {buyers.length > 0 && (
        <div>
          <h3 className="text-[11px] font-semibold text-[var(--c-hint)] uppercase tracking-wider mb-2">Кто покупает</h3>
          <div className="space-y-1.5">
            {buyers.map((b) => (
              <div key={b.nickname} className="flex items-center justify-between p-2.5 rounded-xl card">
                <span className="text-sm text-[var(--c-text)] truncate">{b.nickname}</span>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[10px] text-[var(--c-hint)]">{b.qty} шт</span>
                  <span className="text-sm font-bold text-[var(--c-text)] tabular-nums">{fmtCur(b.total)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
