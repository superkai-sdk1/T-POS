import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Drawer } from '@/components/ui/Drawer';
import { useOnTableChange } from '@/hooks/useRealtimeSync';
import { hapticFeedback, hapticNotification } from '@/lib/telegram';
import {
  Plus, Pencil, Trash2, Check, Search,
} from 'lucide-react';
import type { Modifier, InventoryItem } from '@/types';

export function ModifiersManager() {
  const [modifiers, setModifiers] = useState<(Modifier & { products: string[] })[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const loadModifiers = useCallback(async () => {
    const { data: mods } = await supabase
      .from('modifiers')
      .select('*')
      .order('name');
    const { data: links } = await supabase
      .from('product_modifiers')
      .select('product_id, modifier_id');

    const linkMap = new Map<string, string[]>();
    for (const l of links || []) {
      if (!linkMap.has(l.modifier_id)) linkMap.set(l.modifier_id, []);
      linkMap.get(l.modifier_id)!.push(l.product_id);
    }

    setModifiers((mods || []).map((m) => ({
      ...m as Modifier,
      products: linkMap.get(m.id) || [],
    })));
    setIsLoading(false);
  }, []);

  const loadInventory = useCallback(async () => {
    const { data } = await supabase
      .from('inventory')
      .select('*')
      .eq('is_active', true)
      .order('name');
    if (data) setInventory(data as InventoryItem[]);
  }, []);

  useEffect(() => { loadModifiers(); loadInventory(); }, [loadModifiers, loadInventory]);
  useOnTableChange(useMemo(() => ['modifiers', 'product_modifiers'], []), loadModifiers);

  const resetForm = () => {
    setName('');
    setPrice('');
    setSelectedProducts([]);
    setEditingId(null);
    setProductSearch('');
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (mod: Modifier & { products: string[] }) => {
    setEditingId(mod.id);
    setName(mod.name);
    setPrice(String(mod.price));
    setSelectedProducts(mod.products);
    setProductSearch('');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    const priceNum = parseFloat(price) || 0;

    if (editingId) {
      await supabase.from('modifiers').update({ name: name.trim(), price: priceNum }).eq('id', editingId);
      await supabase.from('product_modifiers').delete().eq('modifier_id', editingId);
      if (selectedProducts.length > 0) {
        await supabase.from('product_modifiers').insert(
          selectedProducts.map((pid) => ({ product_id: pid, modifier_id: editingId }))
        );
      }
    } else {
      const { data, error: insErr } = await supabase.from('modifiers').insert({ name: name.trim(), price: priceNum }).select().single();
      if (insErr || !data) { hapticNotification('error'); return; }
      if (selectedProducts.length > 0) {
        await supabase.from('product_modifiers').insert(
          selectedProducts.map((pid) => ({ product_id: pid, modifier_id: data.id }))
        );
      }
    }

    hapticNotification('success');
    setShowForm(false);
    resetForm();
    loadModifiers();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('product_modifiers').delete().eq('modifier_id', id);
    await supabase.from('modifiers').delete().eq('id', id);
    hapticNotification('success');
    setShowDeleteConfirm(null);
    loadModifiers();
  };

  const toggleProduct = (productId: string) => {
    hapticFeedback('light');
    setSelectedProducts((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId]
    );
  };

  const filteredInventory = useMemo(() => {
    if (!productSearch.trim()) return inventory;
    const q = productSearch.toLowerCase();
    return inventory.filter((i) => i.name.toLowerCase().includes(q));
  }, [inventory, productSearch]);

  const getProductNames = (ids: string[]) => {
    return ids.map((id) => inventory.find((i) => i.id === id)?.name).filter(Boolean);
  };

  if (isLoading) {
    return <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-[var(--c-surface)] animate-pulse" />)}</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--c-hint)]">{modifiers.length} модификаторов</p>
        <Button size="sm" onClick={openCreate}>
          <Plus className="w-4 h-4" />
          Добавить
        </Button>
      </div>

      {modifiers.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-sm text-[var(--c-hint)]">Нет модификаторов</p>
          <p className="text-xs text-[var(--c-muted)] mt-1">Создайте модификаторы для товаров (сироп, лёд и т.д.)</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {modifiers.map((mod) => {
            const productNames = getProductNames(mod.products);
            return (
              <div key={mod.id} className="p-3 rounded-xl card">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-[13px] text-[var(--c-text)]">{mod.name}</p>
                      {mod.price > 0 && (
                        <Badge size="sm">+{mod.price}₽</Badge>
                      )}
                      {mod.price === 0 && (
                        <Badge size="sm" variant="default">бесплатно</Badge>
                      )}
                    </div>
                    {productNames.length > 0 ? (
                      <p className="text-[11px] text-[var(--c-hint)] mt-1 line-clamp-2">
                        {productNames.join(', ')}
                      </p>
                    ) : (
                      <p className="text-[11px] text-[var(--c-muted)] mt-1 italic">Нет привязанных товаров</p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => openEdit(mod)}
                      className="w-8 h-8 rounded-lg bg-[var(--c-surface)] flex items-center justify-center active:scale-90 transition-transform"
                    >
                      <Pencil className="w-3.5 h-3.5 text-[var(--c-hint)]" />
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(mod.id)}
                      className="w-8 h-8 rounded-lg bg-[var(--c-danger-bg)] flex items-center justify-center active:scale-90 transition-transform"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-[var(--c-danger)]" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Drawer open={showForm} onClose={() => { setShowForm(false); resetForm(); }} title={editingId ? 'Редактировать модификатор' : 'Новый модификатор'}>
        <div className="space-y-4">
          <Input
            label="Название"
            placeholder="Добавить сироп, Без сахара..."
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label="Цена (₽)"
            type="number"
            placeholder="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />

          <div>
            <label className="block text-xs font-semibold text-[var(--c-hint)] mb-2">
              Привязка к товарам ({selectedProducts.length} выбрано)
            </label>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--c-muted)]" />
              <input
                placeholder="Поиск товара..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-[var(--c-surface)] border border-[var(--c-surface-hover)] text-sm text-[var(--c-text)] placeholder:text-[var(--c-muted)] focus:outline-none focus:border-[var(--c-accent)]/25 transition-colors"
              />
            </div>
            <div className="max-h-[40vh] overflow-y-auto space-y-0.5 rounded-xl border border-[var(--c-border)] p-1">
              {filteredInventory.map((item) => {
                const isSelected = selectedProducts.includes(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => toggleProduct(item.id)}
                    className={`w-full flex items-center gap-2.5 p-2 rounded-lg text-left transition-all active:scale-[0.98] ${
                      isSelected ? 'bg-[var(--c-accent)]/10 border border-[var(--c-accent)]/20' : 'hover:bg-[var(--c-surface)]'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
                      isSelected ? 'bg-[var(--c-accent)]' : 'border border-[var(--c-border)]'
                    }`}>
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-[var(--c-text)] truncate">{item.name}</p>
                    </div>
                    <span className="text-[11px] text-[var(--c-muted)] tabular-nums shrink-0">{item.price}₽</span>
                  </button>
                );
              })}
            </div>
          </div>

          <Button onClick={handleSave} className="w-full" disabled={!name.trim()}>
            {editingId ? 'Сохранить' : 'Создать'}
          </Button>
        </div>
      </Drawer>

      <Drawer open={!!showDeleteConfirm} onClose={() => setShowDeleteConfirm(null)} title="Удалить модификатор?">
        <div className="space-y-4">
          <p className="text-sm text-[var(--c-hint)]">Модификатор будет удалён. Это действие необратимо.</p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setShowDeleteConfirm(null)} className="flex-1">Отмена</Button>
            <Button variant="danger" onClick={() => showDeleteConfirm && handleDelete(showDeleteConfirm)} className="flex-1">Удалить</Button>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
