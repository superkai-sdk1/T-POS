import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Drawer } from '@/components/ui/Drawer';
import {
  Plus, GripVertical, ChevronUp, ChevronDown, Pencil, Trash2,
  Image as ImageIcon, Eye, EyeOff, Search, Upload, X, Check,
  Coffee, UtensilsCrossed, Cookie, Wind, Ticket,
} from 'lucide-react';
import { hapticFeedback, hapticNotification } from '@/lib/telegram';
import type { InventoryItem, ItemCategory } from '@/types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

import { Package } from 'lucide-react';

const categoryConfig: { key: ItemCategory; label: string; icon: typeof Coffee }[] = [
  { key: 'services', label: 'Услуги', icon: Ticket },
  { key: 'drinks', label: 'Напитки', icon: Coffee },
  { key: 'food', label: 'Еда', icon: UtensilsCrossed },
  { key: 'bar', label: 'Снеки', icon: Cookie },
  { key: 'hookah', label: 'Кальяны', icon: Wind },
];

interface EditForm {
  name: string;
  price: string;
  category: ItemCategory;
  min_threshold: string;
  is_active: boolean;
  image_url: string;
}

const emptyForm: EditForm = {
  name: '',
  price: '',
  category: 'drinks',
  min_threshold: '0',
  is_active: true,
  image_url: '',
};

export function MenuEditor() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<ItemCategory>('services');
  const [search, setSearch] = useState('');

  // Edit/Create drawer
  const [showEditor, setShowEditor] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState<EditForm>(emptyForm);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<InventoryItem | null>(null);

  const loadItems = useCallback(async () => {
    const { data } = await supabase
      .from('inventory')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name');
    if (data) setItems(data as InventoryItem[]);
  }, []);

  useEffect(() => {
    loadItems().then(() => setIsLoading(false));
  }, [loadItems]);

  const filteredItems = items.filter((i) => {
    if (search) return i.name.toLowerCase().includes(search.toLowerCase());
    return i.category === activeCategory;
  });

  const categoryCounts = items.reduce((acc, i) => {
    acc[i.category] = (acc[i.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // ============ EDITOR ============

  const openCreate = () => {
    setEditingItem(null);
    setForm({ ...emptyForm, category: activeCategory });
    setShowEditor(true);
  };

  const openEdit = (item: InventoryItem) => {
    setEditingItem(item);
    setForm({
      name: item.name,
      price: String(item.price),
      category: item.category,
      min_threshold: String(item.min_threshold),
      is_active: item.is_active,
      image_url: item.image_url || '',
    });
    setShowEditor(true);
    hapticFeedback();
  };

  const updateField = <K extends keyof EditForm>(key: K, value: EditForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error } = await supabase.storage
      .from('menu-images')
      .upload(path, file, { contentType: file.type });

    if (!error) {
      const url = `${SUPABASE_URL}/storage/v1/object/public/menu-images/${path}`;
      updateField('image_url', url);
      hapticNotification('success');
    }
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = () => {
    updateField('image_url', '');
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.price) return;

    const payload = {
      name: form.name.trim(),
      price: Number(form.price),
      category: form.category,
      min_threshold: Number(form.min_threshold) || 0,
      is_active: form.is_active,
      image_url: form.image_url || null,
    };

    if (editingItem) {
      await supabase.from('inventory').update(payload).eq('id', editingItem.id);
    } else {
      const maxOrder = items
        .filter((i) => i.category === form.category)
        .reduce((max, i) => Math.max(max, i.sort_order), 0);
      await supabase.from('inventory').insert({ ...payload, sort_order: maxOrder + 10 });
    }

    hapticNotification('success');
    setShowEditor(false);
    loadItems();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await supabase.from('inventory').delete().eq('id', deleteTarget.id);
    hapticNotification('success');
    setDeleteTarget(null);
    loadItems();
  };

  const toggleActive = async (item: InventoryItem) => {
    hapticFeedback();
    await supabase.from('inventory').update({ is_active: !item.is_active }).eq('id', item.id);
    loadItems();
  };

  // ============ REORDER ============

  const moveItem = async (item: InventoryItem, direction: 'up' | 'down') => {
    hapticFeedback('light');
    const categoryItems = items
      .filter((i) => i.category === item.category)
      .sort((a, b) => a.sort_order - b.sort_order);

    const idx = categoryItems.findIndex((i) => i.id === item.id);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= categoryItems.length) return;

    const other = categoryItems[swapIdx];
    await supabase.from('inventory').update({ sort_order: other.sort_order }).eq('id', item.id);
    await supabase.from('inventory').update({ sort_order: item.sort_order }).eq('id', other.id);
    loadItems();
  };

  if (isLoading) {
    return (
      <div className="text-center py-20">
        <div className="w-8 h-8 border-2 border-[var(--tg-theme-button-color,#6c5ce7)] border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 px-4 rounded-xl bg-white/5 text-center">
          <span className="text-sm font-bold text-[var(--tg-theme-text-color,#e0e0e0)]">{items.length}</span>
          <span className="text-xs text-white/40 ml-1.5">позиций</span>
        </div>
        <div className="p-2.5 px-4 rounded-xl bg-emerald-500/10 text-center">
          <span className="text-sm font-bold text-emerald-400">{items.filter((i) => i.is_active).length}</span>
          <span className="text-xs text-white/40 ml-1.5">активных</span>
        </div>
        <div className="flex-1" />
        <Button size="lg" onClick={openCreate}>
          <Plus className="w-5 h-5" />
          Добавить
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
        <input
          type="text"
          placeholder="Поиск по названию..."
          className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-[var(--tg-theme-text-color,#e0e0e0)] placeholder:text-white/30"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Category tabs */}
      {!search && (
        <div className="flex gap-1 overflow-x-auto scrollbar-none -mx-1 px-1">
          {categoryConfig.map((cat) => {
            const count = categoryCounts[cat.key] || 0;
            const isActive = activeCategory === cat.key;
            return (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium shrink-0 transition-all ${
                  isActive
                    ? 'bg-[var(--tg-theme-button-color,#6c5ce7)] text-white shadow-lg'
                    : 'bg-white/5 text-white/50 hover:text-white/70'
                }`}
              >
                <cat.icon className="w-3.5 h-3.5" />
                <span>{cat.label}</span>
                <span className={`ml-0.5 ${isActive ? 'text-white/70' : 'text-white/30'}`}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Items list */}
      <div className="space-y-1.5">
        {filteredItems.map((item, idx) => {
          const catItems = search ? filteredItems : items.filter((i) => i.category === item.category).sort((a, b) => a.sort_order - b.sort_order);
          const posInCategory = catItems.findIndex((i) => i.id === item.id);

          return (
            <div
              key={item.id}
              className={`flex items-center gap-2 p-2.5 rounded-xl transition-all ${
                item.is_active ? 'bg-white/5' : 'bg-white/[0.02] opacity-50'
              }`}
            >
              {/* Image / placeholder */}
              <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-white/10 flex items-center justify-center">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                  (() => { const CatIcon = categoryConfig.find((c) => c.key === item.category)?.icon || Package; return <CatIcon className="w-5 h-5 text-white/40" />; })()
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--tg-theme-text-color,#e0e0e0)] truncate">
                  {item.name}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-xs font-bold text-[var(--tg-theme-button-color,#6c5ce7)]">{item.price}₽</span>
                  {item.min_threshold > 0 && (
                    <span className="text-[10px] text-white/30">ост: {item.stock_quantity}</span>
                  )}
                  {!item.is_active && <Badge variant="default">Скрыт</Badge>}
                </div>
              </div>

              {/* Reorder */}
              {!search && (
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button
                    onClick={() => moveItem(item, 'up')}
                    disabled={posInCategory === 0}
                    className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center disabled:opacity-20 active:scale-90 transition-all"
                  >
                    <ChevronUp className="w-3.5 h-3.5 text-white/50" />
                  </button>
                  <button
                    onClick={() => moveItem(item, 'down')}
                    disabled={posInCategory === catItems.length - 1}
                    className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center disabled:opacity-20 active:scale-90 transition-all"
                  >
                    <ChevronDown className="w-3.5 h-3.5 text-white/50" />
                  </button>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-col gap-0.5 shrink-0">
                <button
                  onClick={() => openEdit(item)}
                  className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center active:scale-90 transition-all"
                >
                  <Pencil className="w-3.5 h-3.5 text-white/50" />
                </button>
                <button
                  onClick={() => toggleActive(item)}
                  className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center active:scale-90 transition-all"
                >
                  {item.is_active
                    ? <EyeOff className="w-3.5 h-3.5 text-white/30" />
                    : <Eye className="w-3.5 h-3.5 text-emerald-400" />
                  }
                </button>
              </div>
            </div>
          );
        })}

        {filteredItems.length === 0 && (
          <div className="text-center py-12">
            <p className="text-[var(--tg-theme-hint-color,#888)]">
              {search ? 'Ничего не найдено' : 'Нет позиций в этой категории'}
            </p>
          </div>
        )}
      </div>

      {/* ============ EDIT / CREATE DRAWER ============ */}
      <Drawer
        open={showEditor}
        onClose={() => setShowEditor(false)}
        title={editingItem ? 'Редактирование' : 'Новая позиция'}
      >
        <div className="space-y-4">
          {/* Image section */}
          <div>
            <p className="text-xs font-medium text-white/50 mb-2">Изображение</p>
            {form.image_url ? (
              <div className="relative w-full aspect-[3/2] rounded-xl overflow-hidden bg-white/5">
                <img src={form.image_url} alt="Preview" className="w-full h-full object-cover" />
                <button
                  onClick={removeImage}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center active:scale-90 transition-all"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="flex-1 flex flex-col items-center gap-2 py-6 rounded-xl border-2 border-dashed border-white/10 hover:border-white/20 text-white/40 transition-all active:scale-[0.98]"
                >
                  {isUploading ? (
                    <div className="w-6 h-6 border-2 border-[var(--tg-theme-button-color,#6c5ce7)] border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Upload className="w-6 h-6" />
                  )}
                  <span className="text-xs">{isUploading ? 'Загрузка...' : 'Загрузить фото'}</span>
                </button>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            {!form.image_url && (
              <Input
                label="Или ссылка на изображение"
                placeholder="https://..."
                value={form.image_url}
                onChange={(e) => updateField('image_url', e.target.value)}
                className="mt-2"
              />
            )}
          </div>

          {/* Name */}
          <Input
            label="Название"
            placeholder="Название позиции"
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
          />

          {/* Price */}
          <Input
            label="Цена (₽)"
            type="number"
            placeholder="0"
            value={form.price}
            onChange={(e) => updateField('price', e.target.value)}
            min={0}
          />

          {/* Category */}
          <div>
            <p className="text-xs font-medium text-white/50 mb-2">Категория</p>
            <div className="grid grid-cols-3 gap-1.5">
              {categoryConfig.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => updateField('category', cat.key)}
                  className={`flex items-center gap-1.5 px-2.5 py-2.5 rounded-xl text-xs font-medium transition-all active:scale-[0.97] ${
                    form.category === cat.key
                      ? 'bg-[var(--tg-theme-button-color,#6c5ce7)] text-white'
                      : 'bg-white/5 text-white/50'
                  }`}
                >
                  <cat.icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Min threshold */}
          <Input
            label="Мин. остаток (для учёта)"
            type="number"
            placeholder="0 — не отслеживать"
            value={form.min_threshold}
            onChange={(e) => updateField('min_threshold', e.target.value)}
            min={0}
          />

          {/* Active toggle */}
          <button
            onClick={() => updateField('is_active', !form.is_active)}
            className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all active:scale-[0.98] ${
              form.is_active
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : 'bg-white/5 border-white/10'
            }`}
          >
            <span className="text-sm font-medium text-[var(--tg-theme-text-color,#e0e0e0)]">
              {form.is_active ? 'Отображается в меню' : 'Скрыт из меню'}
            </span>
            <div className={`w-10 h-6 rounded-full transition-colors relative ${
              form.is_active ? 'bg-emerald-500' : 'bg-white/20'
            }`}>
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                form.is_active ? 'left-5' : 'left-1'
              }`} />
            </div>
          </button>

          {/* Save + Delete */}
          <Button
            fullWidth
            size="lg"
            onClick={handleSave}
            disabled={!form.name.trim() || !form.price}
          >
            <Check className="w-5 h-5" />
            {editingItem ? 'Сохранить' : 'Создать'}
          </Button>

          {editingItem && (
            <Button
              fullWidth
              variant="danger"
              onClick={() => { setShowEditor(false); setDeleteTarget(editingItem); }}
            >
              <Trash2 className="w-4 h-4" />
              Удалить позицию
            </Button>
          )}
        </div>
      </Drawer>

      {/* ============ DELETE CONFIRM ============ */}
      <Drawer
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Удалить позицию?"
      >
        {deleteTarget && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              {deleteTarget.image_url ? (
                <img src={deleteTarget.image_url} className="w-12 h-12 rounded-xl object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
                  {(() => { const CatIcon = categoryConfig.find((c) => c.key === deleteTarget.category)?.icon || Package; return <CatIcon className="w-5 h-5 text-white/40" />; })()}
                </div>
              )}
              <div>
                <p className="text-sm font-semibold text-[var(--tg-theme-text-color,#e0e0e0)]">{deleteTarget.name}</p>
                <p className="text-xs text-red-400">{deleteTarget.price}₽ · {categoryConfig.find((c) => c.key === deleteTarget.category)?.label}</p>
              </div>
            </div>
            <p className="text-xs text-white/40 text-center">
              Позиция будет удалена из меню. Это действие нельзя отменить.
            </p>
            <div className="flex gap-2">
              <Button fullWidth variant="secondary" onClick={() => setDeleteTarget(null)}>Отмена</Button>
              <Button fullWidth variant="danger" onClick={handleDelete}>Удалить</Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
