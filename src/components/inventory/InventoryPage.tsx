import React, { useEffect, useState, useCallback, useMemo, memo, startTransition, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Badge } from '@/components/ui/Badge';
import { Package, AlertTriangle, Search } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { useOnTableChange } from '@/hooks/useRealtimeSync';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { InventoryItem } from '@/types';

const categoryLabels: Record<string, string> = {
  drinks: 'Напитки', food: 'Еда', bar: 'Снеки', hookah: 'Кальяны', services: 'Услуги',
};

const InventoryRow = React.memo(function InventoryRow({
  item,
  isCritical,
}: {
  item: InventoryItem;
  isCritical: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between p-3 rounded-xl ${
        isCritical ? 'bg-red-500/10 border border-red-500/20' : 'card'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
          isCritical ? 'bg-red-500/20' : 'bg-white/10'
        }`}>
          <Package className={`w-5 h-5 ${isCritical ? 'text-red-400' : 'text-white/50'}`} />
        </div>
        <div>
          <p className="font-medium text-[13px] text-[var(--c-text)]">
            {item.name}
          </p>
          <div className="flex gap-2 mt-0.5">
            <Badge size="sm">{categoryLabels[item.category] || item.category}</Badge>
            <Badge size="sm">{item.price}₽</Badge>
          </div>
        </div>
      </div>
      <div className="text-right">
        <p className={`text-lg font-bold ${isCritical ? 'text-red-400' : 'text-[var(--c-text)]'}`}>
          {item.stock_quantity}
        </p>
        {item.min_threshold > 0 && (
          <p className="text-xs text-[var(--c-hint)]">
            мин: {item.min_threshold}
          </p>
        )}
      </div>
    </div>
  );
});

export function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [search, setSearch] = useState('');

  const loadItems = useCallback(async () => {
    const { data } = await supabase
      .from('inventory')
      .select('*')
      .order('category')
      .order('name');
    if (data) setItems(data as InventoryItem[]);
  }, []);

  const inventoryTables = useMemo(() => ['inventory'], []);
  useOnTableChange(inventoryTables, loadItems);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const criticalItems = items.filter(
    (i) => i.min_threshold > 0 && i.stock_quantity <= i.min_threshold
  );

  const filtered = search
    ? items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
    : items;

  const listRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 72,
    overscan: 5,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[var(--c-text)]">Остатки</h2>
          <p className="text-xs text-[var(--c-hint)]">{items.length} позиций</p>
        </div>
      </div>

      {criticalItems.length > 0 && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-[13px] font-semibold text-red-400">Критический остаток</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {criticalItems.map((item) => (
              <Badge key={item.id} variant="danger" size="sm">
                {item.name}: {item.stock_quantity}/{item.min_threshold}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
        <Input
          placeholder="Поиск..."
          value={search}
          onChange={(e) => startTransition(() => setSearch(e.target.value))}
          className="pl-10"
        />
      </div>

      <div ref={listRef} className="overflow-y-auto" style={{ height: Math.min(filtered.length * 72, 600) }}>
        <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const item = filtered[virtualRow.index];
            const isCritical = item.min_threshold > 0 && item.stock_quantity <= item.min_threshold;
            return (
              <div
                key={item.id}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <InventoryRow item={item} isCritical={isCritical} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
