import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Badge } from '@/components/ui/Badge';
import { Package, AlertTriangle, Search } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { useOnTableChange } from '@/hooks/useRealtimeSync';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useHideNav } from '@/store/layout';
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
      className={`flex items-center justify-between p-2 sm:p-2.5 rounded-lg sm:rounded-xl gap-2 ${
        isCritical ? 'bg-[var(--c-danger-bg)] border border-red-500/20' : 'card'
      }`}
    >
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center shrink-0 ${
          isCritical ? 'bg-red-500/20' : 'bg-[var(--c-surface-hover)]'
        }`}>
          <Package className={`w-4 h-4 sm:w-4 sm:h-4 ${isCritical ? 'text-[var(--c-danger)]' : 'text-[var(--c-hint)]'}`} />
        </div>
        <div className="min-w-0">
          <p className="font-medium text-xs sm:text-[13px] text-[var(--c-text)] truncate">
            {item.name}
          </p>
          <div className="flex gap-1 sm:gap-1.5 mt-0.5 flex-wrap">
            <Badge size="sm">{categoryLabels[item.category] || item.category}</Badge>
            <Badge size="sm">{item.price}₽</Badge>
          </div>
        </div>
      </div>
      <div className="text-right shrink-0">
        {!item.is_service && item.track_stock !== false ? (
          <>
            <p className={`text-base sm:text-lg font-bold ${isCritical ? 'text-[var(--c-danger)]' : 'text-[var(--c-text)]'}`}>
              {item.stock_quantity}
            </p>
            {item.min_threshold > 0 && (
              <p className="text-[10px] sm:text-xs text-[var(--c-hint)]">
                мин: {item.min_threshold}
              </p>
            )}
          </>
        ) : (
          <p className="text-[10px] sm:text-xs text-[var(--c-muted)] font-medium">—</p>
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
    (i) => !i.is_service && i.track_stock !== false && i.min_threshold > 0 && i.stock_quantity <= i.min_threshold
  );

  const filtered = search
    ? items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()))
    : items;

  const listRef = useRef<HTMLDivElement>(null);
  const hideNav = useHideNav();
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 60,
    overscan: 5,
  });

  return (
    <div className="flex flex-col min-h-0 flex-1 space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-[var(--c-text)]">Остатки</h2>
          <p className="text-[10px] sm:text-xs text-[var(--c-hint)]">{items.length} позиций</p>
        </div>
      </div>

      {criticalItems.length > 0 && (
        <div className="p-2.5 sm:p-3 rounded-lg sm:rounded-xl bg-[var(--c-danger-bg)] border border-red-500/20">
          <div className="flex items-center gap-1.5 mb-1.5">
            <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[var(--c-danger)]" />
            <span className="text-xs sm:text-[13px] font-semibold text-[var(--c-danger)]">Критический остаток</span>
          </div>
          <div className="flex flex-wrap gap-1 sm:gap-1.5">
            {criticalItems.map((item) => (
              <Badge key={item.id} variant="danger" size="sm">
                {item.name}: {item.stock_quantity}/{item.min_threshold}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--c-hint)]" />
        <Input
          placeholder="Поиск..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 sm:pl-10 text-sm sm:text-base"
        />
      </div>

      <div ref={listRef} className={`flex-1 min-h-0 overflow-y-auto min-h-[200px] scroll-area ${hideNav ? 'pb-0' : 'pb-24 lg:pb-0'}`}>
        <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const item = filtered[virtualRow.index];
            const isCritical = !item.is_service && item.track_stock !== false && item.min_threshold > 0 && item.stock_quantity <= item.min_threshold;
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
