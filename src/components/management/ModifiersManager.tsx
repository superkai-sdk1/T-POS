import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Drawer } from '@/components/ui/Drawer';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { useOnTableChange } from '@/hooks/useRealtimeSync';
import { hapticFeedback, hapticNotification } from '@/lib/telegram';
import {
  Plus, Pencil, Trash2, Check, Search, SlidersHorizontal, MoreVertical,
} from 'lucide-react';
import type { Modifier, InventoryItem } from '@/types';

export function ModifiersManager() {
  const [modifiers, setModifiers] = useState<(Modifier & { products: string[] })[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
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
    hapticFeedback();
  };

  const openEdit = (mod: Modifier & { products: string[] }) => {
    setEditingId(mod.id);
    setName(mod.name);
    setPrice(String(mod.price));
    setSelectedProducts(mod.products);
    setProductSearch('');
    setShowForm(true);
    hapticFeedback();
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

  const filteredModifiers = useMemo(() => {
    if (!search.trim()) return modifiers;
    const q = search.toLowerCase();
    return modifiers.filter((m) => m.name.toLowerCase().includes(q));
  }, [modifiers, search]);

  const getProductNames = (ids: string[]): string[] => {
    return ids
      .map((id) => inventory.find((i) => i.id === id)?.name)
      .filter((n): n is string => !!n);
  };

  if (isLoading) {
    return <ListSkeleton rows={5} />;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ============ HEADER ============ */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-2xl font-extrabold tracking-tight text-[var(--c-text)] leading-tight">
            Модификаторы
          </h1>
          <p className="text-[var(--c-muted)] text-[11px] sm:text-sm mt-0.5 font-medium">
            Сиропы, добавки, опции к позициям
          </p>
        </div>
        <button
          onClick={openCreate}
          className="h-9 sm:h-11 px-3 sm:px-5 rounded-2xl sm:rounded-3xl flex items-center gap-1.5 sm:gap-2 font-bold text-xs sm:text-sm transition-all active:scale-95 text-white [background:linear-gradient(135deg,#8b5cf6,#06b6d4)] [box-shadow:0_4px_20px_rgba(139,92,246,0.25)] shrink-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--c-accent)]/20 min-w-[44px] min-h-[44px]"
        >
          <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
          <span className="hidden xs:inline">Добавить</span>
        </button>
      </div>

      {/* ============ SEARCH + STATS ============ */}
      <div className="flex gap-2 sm:gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-[var(--c-muted)]" size={16} />
          <input
            type="text"
            placeholder="Поиск модификаторов..."
            className="w-full bg-[var(--c-surface)] border border-[var(--c-border)] rounded-2xl sm:rounded-3xl py-2.5 sm:py-3.5 pl-9 sm:pl-11 pr-3 sm:pr-4 focus:outline-none focus:ring-2 focus:ring-[var(--c-accent)]/40 transition-all placeholder:text-[var(--c-muted)] text-sm text-[var(--c-text)]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="hidden sm:flex gap-3">
          <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl px-4 py-2 flex flex-col justify-center min-w-[80px]">
            <span className="text-indigo-400 text-[10px] font-bold uppercase tracking-widest">Всего</span>
            <span className="text-lg font-black text-indigo-400">{modifiers.length}</span>
          </div>
        </div>
      </div>

      {/* ============ CONTENT ============ */}
      {filteredModifiers.length === 0 ? (
        <div className="text-center py-16">
          <SlidersHorizontal className="w-10 h-10 text-[var(--c-muted)] mx-auto mb-3" />
          <p className="text-[var(--c-hint)] font-medium mb-3">
            {search ? 'Ничего не найдено' : 'Нет модификаторов'}
          </p>
          {!search && (
            <p className="text-[var(--c-muted)] text-sm mb-4">
              Создайте модификаторы для товаров (сироп, лёд и т.д.)
            </p>
          )}
          {!search && (
            <button
              onClick={openCreate}
              className="text-sm font-semibold text-[var(--c-accent)] hover:underline"
            >
              + Добавить модификатор
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-2.5 sm:gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filteredModifiers.map((mod) => (
            <ModifierCard
              key={mod.id}
              modifier={mod}
              productNames={getProductNames(mod.products)}
              onEdit={() => openEdit(mod)}
              onDelete={() => setShowDeleteConfirm(mod.id)}
            />
          ))}
        </div>
      )}

      {/* ============ DRAWERS ============ */}
      <Drawer
        open={showForm}
        onClose={() => { setShowForm(false); resetForm(); }}
        title={editingId ? 'Редактировать модификатор' : 'Новый модификатор'}
        subtitle="Название, цена, привязка к товарам"
        size="lg"
      >
        <div className="flex flex-col -mx-6 sm:-mx-10 -mb-6 sm:-mb-10">
          <div className="flex-1 overflow-y-auto px-6 sm:px-10 pb-4 space-y-6">
            <div className="space-y-3">
              <label className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] ml-1">Название</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Сироп, Без сахара, Лёд..."
                className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl py-4 px-5 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all text-white font-bold text-lg"
              />
            </div>
            <div className="space-y-3">
              <label className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] ml-1">Цена (₽)</label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0 — бесплатно"
                min={0}
                className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl py-4 px-5 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all text-indigo-400 font-black text-xl"
              />
            </div>
            <div className="space-y-3">
              <label className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] ml-1">
                Привязка к товарам ({selectedProducts.length} выбрано)
              </label>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Поиск товара..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl py-3 pl-11 pr-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all text-slate-200"
                />
              </div>
              <div className="max-h-[40vh] overflow-y-auto space-y-1 rounded-2xl border border-slate-800 p-2 bg-slate-900/30">
                {filteredInventory.map((item) => {
                  const isSelected = selectedProducts.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleProduct(item.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all active:scale-[0.98] ${
                        isSelected ? 'bg-indigo-500/15 border border-indigo-500/30' : 'hover:bg-slate-800/50 border border-transparent'
                      }`}
                    >
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-indigo-500' : 'border-2 border-slate-600'
                      }`}>
                        {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">{item.name}</p>
                      </div>
                      <span className="text-xs text-indigo-400 font-bold tabular-nums shrink-0">{item.price}₽</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="p-6 border-t border-slate-800 bg-slate-900/20 shrink-0">
            <button
              onClick={handleSave}
              disabled={!name.trim()}
              className="w-full h-14 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl flex items-center justify-center gap-2 font-black uppercase tracking-widest shadow-xl shadow-indigo-600/20 active:scale-95 transition-all"
            >
              <Check size={20} /> {editingId ? 'Сохранить' : 'Создать'}
            </button>
          </div>
        </div>
      </Drawer>

      <Drawer open={!!showDeleteConfirm} onClose={() => setShowDeleteConfirm(null)} title="Удалить модификатор?" size="sm">
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

// ============ MODIFIER CARD ============

function ModifierCard({
  modifier,
  productNames,
  onEdit,
  onDelete,
}: {
  modifier: Modifier & { products: string[] };
  productNames: string[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="group rounded-[22px] sm:rounded-[28px] p-3 sm:p-5 flex flex-col justify-between transition-all duration-200 border border-[var(--c-border)] hover:border-[var(--c-accent)]/30 bg-[var(--c-surface)]">
      <div className="flex justify-between items-start mb-2.5 sm:mb-4">
        <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-2xl sm:rounded-3xl flex items-center justify-center bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 group-hover:scale-105 transition-transform">
          <SlidersHorizontal className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 sm:p-1.5 hover:bg-[var(--c-surface-hover)] rounded-lg sm:rounded-xl text-[var(--c-muted)] transition-colors active:scale-90"
          >
            <MoreVertical className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-8 z-20 bg-[var(--c-bg)] border border-[var(--c-border)] rounded-xl shadow-xl p-1 min-w-[140px]">
                <button
                  onClick={() => { onEdit(); setShowMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-[var(--c-text)] hover:bg-[var(--c-surface)] rounded-lg transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5 text-[var(--c-hint)]" />
                  Редактировать
                </button>
                <button
                  onClick={() => { onDelete(); setShowMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-[var(--c-danger)] hover:bg-[var(--c-surface)] rounded-lg transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Удалить
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div
        className="cursor-pointer"
        onClick={onEdit}
      >
        <h4 className="text-[13px] sm:text-sm font-bold text-[var(--c-text)] group-hover:text-white transition-colors leading-snug line-clamp-2">
          {modifier.name}
        </h4>
        <div className="flex items-end justify-between mt-2 sm:mt-3">
          <div className="flex flex-col">
            <span className="text-[var(--c-muted)] text-[9px] sm:text-[10px] font-bold uppercase tracking-wider">Цена</span>
            <span className="text-base sm:text-xl font-black text-indigo-400">
              {modifier.price > 0 ? `+${modifier.price} ₽` : 'Бесплатно'}
            </span>
          </div>
          {productNames.length > 0 && (
            <span className="bg-indigo-500/10 text-indigo-400 text-[9px] sm:text-[10px] font-black uppercase tracking-widest px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl border border-indigo-500/20">
              {modifier.products.length} шт.
            </span>
          )}
        </div>
        {productNames.length > 0 && (
          <p className="text-[10px] text-[var(--c-muted)] mt-2 line-clamp-2">
            {productNames.slice(0, 3).join(', ')}
            {productNames.length > 3 && '...'}
          </p>
        )}
      </div>
    </div>
  );
}
