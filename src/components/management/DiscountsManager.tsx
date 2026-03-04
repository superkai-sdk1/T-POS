import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Drawer } from '@/components/ui/Drawer';
import { Plus, Percent, Banknote, Trash2, Edit2, Package, Search, Hash } from 'lucide-react';
import { hapticFeedback, hapticNotification } from '@/lib/telegram';
import { useOnTableChange } from '@/hooks/useRealtimeSync';
import type { Discount, DiscountType, InventoryItem } from '@/types';

export function DiscountsManager() {
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Discount | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<DiscountType>('percentage');
  const [value, setValue] = useState('');
  const [minQuantity, setMinQuantity] = useState('');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedItemName, setSelectedItemName] = useState('');
  const [saving, setSaving] = useState(false);

  const [showItemPicker, setShowItemPicker] = useState(false);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [itemSearch, setItemSearch] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('discounts')
      .select('*, item:inventory(*)')
      .order('created_at', { ascending: false });
    if (data) {
      setDiscounts(data.map((d) => ({
        ...d,
        item: Array.isArray(d.item) ? d.item[0] : d.item,
      })) as Discount[]);
    }
  }, []);

  const discountsTables = useMemo(() => ['discounts'], []);
  useOnTableChange(discountsTables, load);

  useEffect(() => { load(); }, [load]);

  const loadItems = useCallback(async () => {
    const { data } = await supabase
      .from('inventory')
      .select('*')
      .eq('is_active', true)
      .order('name');
    if (data) setItems(data as InventoryItem[]);
  }, []);

  const openNew = () => {
    setEditing(null);
    setName('');
    setType('percentage');
    setValue('');
    setMinQuantity('');
    setSelectedItemId(null);
    setSelectedItemName('');
    setShowForm(true);
  };

  const openEdit = (d: Discount) => {
    setEditing(d);
    setName(d.name);
    setType(d.type);
    setValue(String(d.value));
    setMinQuantity(d.min_quantity ? String(d.min_quantity) : '');
    setSelectedItemId(d.item_id);
    setSelectedItemName(d.item?.name || '');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !value) return;
    setSaving(true);
    const payload: Record<string, unknown> = {
      name: name.trim(),
      type,
      value: Number(value),
      min_quantity: minQuantity ? Number(minQuantity) : null,
      item_id: selectedItemId || null,
    };

    if (editing) {
      await supabase.from('discounts').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('discounts').insert(payload);
    }

    hapticNotification('success');
    setSaving(false);
    setShowForm(false);
    load();
  };

  const toggleActive = async (d: Discount) => {
    hapticFeedback('light');
    await supabase.from('discounts').update({ is_active: !d.is_active }).eq('id', d.id);
    load();
  };

  const handleDelete = async (id: string) => {
    hapticFeedback('medium');
    await supabase.from('discounts').delete().eq('id', id);
    load();
  };

  const openItemPicker = () => {
    loadItems();
    setItemSearch('');
    setShowItemPicker(true);
  };

  const selectItem = (item: InventoryItem) => {
    setSelectedItemId(item.id);
    setSelectedItemName(item.name);
    setShowItemPicker(false);
    hapticFeedback('light');
  };

  const clearItem = () => {
    setSelectedItemId(null);
    setSelectedItemName('');
  };

  const filteredPickerItems = items.filter((i) =>
    !itemSearch || i.name.toLowerCase().includes(itemSearch.toLowerCase())
  );

  const isQuantityDiscount = (d: Discount) => d.min_quantity != null && d.min_quantity > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--tg-theme-hint-color,#888)]">
          {discounts.length} скидок
        </p>
        <Button size="md" onClick={openNew}>
          <Plus className="w-4 h-4" />
          Добавить
        </Button>
      </div>

      {discounts.length === 0 ? (
        <div className="text-center py-12">
          <Percent className="w-10 h-10 text-white/8 mx-auto mb-3" />
          <p className="text-sm text-[var(--tg-theme-hint-color,#888)]">Нет скидок</p>
        </div>
      ) : (
        <div className="space-y-2">
          {discounts.map((d) => (
            <div
              key={d.id}
              className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all ${
                d.is_active ? 'card' : 'bg-white/2 border-white/3 opacity-50'
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isQuantityDiscount(d) ? 'bg-amber-500/15' :
                d.type === 'percentage' ? 'bg-violet-500/15' : 'bg-emerald-500/15'
              }`}>
                {isQuantityDiscount(d) ? (
                  <Hash className="w-5 h-5 text-amber-400" />
                ) : d.type === 'percentage' ? (
                  <Percent className="w-5 h-5 text-violet-400" />
                ) : (
                  <Banknote className="w-5 h-5 text-emerald-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[13px] text-[var(--tg-theme-text-color,#e0e0e0)] truncate">
                  {d.name}
                </p>
                <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                  <Badge variant={d.type === 'percentage' ? 'default' : 'success'} size="sm">
                    {d.type === 'percentage' ? `-${d.value}%` : `-${d.value}₽`}
                  </Badge>
                  {isQuantityDiscount(d) && (
                    <Badge variant="accent" size="sm">
                      от {d.min_quantity} шт
                    </Badge>
                  )}
                  {d.item && (
                    <span className="text-[10px] text-white/30 truncate max-w-[120px]">{d.item.name}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => toggleActive(d)}
                  className={`w-10 h-6 rounded-full transition-colors relative ${
                    d.is_active ? 'bg-emerald-500' : 'bg-white/15'
                  }`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${
                    d.is_active ? 'left-5' : 'left-1'
                  }`} />
                </button>
                <button
                  onClick={() => openEdit(d)}
                  className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center active:scale-90 transition-transform"
                >
                  <Edit2 className="w-3.5 h-3.5 text-white/40" />
                </button>
                <button
                  onClick={() => handleDelete(d.id)}
                  className="w-8 h-8 rounded-lg bg-red-500/8 flex items-center justify-center active:scale-90 transition-transform"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit form */}
      <Drawer
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? 'Редактировать скидку' : 'Новая скидка'}
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="Название"
            placeholder="Например: 2 кальяна -10%"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />

          <div>
            <p className="text-[10px] font-semibold text-white/25 uppercase tracking-wider mb-2">Тип скидки</p>
            <div className="grid grid-cols-2 gap-2">
              {([['percentage', 'Процент', Percent], ['fixed', 'Фиксированная', Banknote]] as const).map(([t, label, Icon]) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border transition-all active:scale-[0.97] ${
                    type === t
                      ? 'bg-[var(--tg-theme-button-color,#6c5ce7)]/15 border-[var(--tg-theme-button-color,#6c5ce7)]/30'
                      : 'bg-white/3 border-white/8'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${type === t ? 'text-[var(--tg-theme-button-color,#6c5ce7)]' : 'text-white/30'}`} />
                  <span className={`text-[13px] font-medium ${type === t ? 'text-[var(--tg-theme-text-color,#e0e0e0)]' : 'text-white/40'}`}>
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <Input
            label={type === 'percentage' ? 'Процент (%)' : 'Сумма (₽)'}
            type="number"
            placeholder={type === 'percentage' ? '10' : '100'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            min={0}
            max={type === 'percentage' ? 100 : undefined}
          />

          {/* Quantity-based section */}
          <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/10 space-y-3">
            <p className="text-[11px] font-semibold text-amber-400/80">Скидка по количеству (необязательно)</p>

            <Input
              label="Мин. количество в чеке"
              type="number"
              placeholder="Например: 2"
              value={minQuantity}
              onChange={(e) => setMinQuantity(e.target.value)}
              min={1}
              compact
            />

            <div>
              <p className="text-xs font-medium text-white/40 mb-1.5">Применить к товару</p>
              {selectedItemId ? (
                <div className="flex items-center gap-2 p-2 rounded-xl card">
                  <Package className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-[13px] text-[var(--tg-theme-text-color,#e0e0e0)] truncate flex-1">{selectedItemName}</span>
                  <button onClick={clearItem} className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center active:scale-90 shrink-0">
                    <Trash2 className="w-3 h-3 text-white/40" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={openItemPicker}
                  className="w-full flex items-center gap-2 p-2.5 rounded-xl border border-dashed border-white/10 text-white/30 hover:text-white/50 hover:border-white/20 transition-all active:scale-[0.98]"
                >
                  <Search className="w-4 h-4" />
                  <span className="text-xs">Выбрать товар...</span>
                </button>
              )}
              <p className="text-[10px] text-white/20 mt-1">
                Если не выбран — скидка на любые {minQuantity || 'N'} одинаковых позиций
              </p>
            </div>
          </div>

          <Button fullWidth size="lg" onClick={handleSave} loading={saving} disabled={saving || !name.trim() || !value}>
            {editing ? 'Сохранить' : 'Создать'}
          </Button>
        </div>
      </Drawer>

      {/* Item picker */}
      <Drawer
        open={showItemPicker}
        onClose={() => setShowItemPicker(false)}
        title="Выберите товар"
        size="md"
      >
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
            <input
              placeholder="Поиск..."
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/5 border border-white/6 text-sm text-[var(--tg-theme-text-color,#e0e0e0)] placeholder:text-white/15 focus:outline-none focus:border-[var(--tg-theme-button-color,#6c5ce7)]/25 transition-colors"
              autoFocus
            />
          </div>
          <div className="space-y-1 max-h-[50vh] overflow-y-auto">
            {filteredPickerItems.map((item) => (
              <button
                key={item.id}
                onClick={() => selectItem(item)}
                className="w-full flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-white/5 transition-colors active:scale-[0.98]"
              >
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0 overflow-hidden">
                  {item.image_url ? (
                    <img src={item.image_url} className="w-full h-full object-cover" />
                  ) : (
                    <Package className="w-4 h-4 text-white/30" />
                  )}
                </div>
                <div className="text-left flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[var(--tg-theme-text-color,#e0e0e0)] truncate">{item.name}</p>
                  <p className="text-[11px] text-white/30 tabular-nums">{item.price}₽</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </Drawer>
    </div>
  );
}
