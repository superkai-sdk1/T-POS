import React, { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Drawer } from '@/components/ui/Drawer';
import { ListSkeleton } from '@/components/ui/Skeleton';
import {
  Plus, Pencil, Trash2,
  Eye, EyeOff, Search, Upload, X, Check,
  FolderPlus, ChevronRight, ArrowLeft,
  Package, MoreVertical, ChevronUp, ChevronDown,
} from 'lucide-react';
import { hapticFeedback, hapticNotification } from '@/lib/telegram';
import {
  useAllMenuCategories,
  getIconComponent,
  getCategoryColorConfig,
  AVAILABLE_ICONS,
  CATEGORY_COLOR_OPTIONS,
} from '@/hooks/useMenuCategories';
import type { InventoryItem, MenuCategory } from '@/types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

interface EditForm {
  name: string;
  price: string;
  category: string;
  min_threshold: string;
  is_active: boolean;
  is_top: boolean;
  image_url: string;
  search_tags: string;
}

const emptyForm: EditForm = {
  name: '',
  price: '',
  category: '',
  min_threshold: '0',
  is_active: true,
  is_top: false,
  image_url: '',
  search_tags: '',
};

interface CategoryForm {
  name: string;
  slug: string;
  icon_name: string;
  color: string;
  parent_id: string | null;
}

const emptyCategoryForm: CategoryForm = {
  name: '',
  slug: '',
  icon_name: 'Package',
  color: 'slate',
  parent_id: null,
};

export function MenuEditor() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { categories, loading: catLoading, reload: reloadCategories } = useAllMenuCategories();

  // Hierarchical navigation: stack of categories
  const [path, setPath] = useState<MenuCategory[]>([]);
  const currentCategory = path.length > 0 ? path[path.length - 1] : null;

  const [search, setSearch] = useState('');

  const [showEditor, setShowEditor] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState<EditForm>(emptyForm);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [deleteTarget, setDeleteTarget] = useState<InventoryItem | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const [showCatEditor, setShowCatEditor] = useState(false);
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(null);
  const [catForm, setCatForm] = useState<CategoryForm>(emptyCategoryForm);
  const [deleteCatTarget, setDeleteCatTarget] = useState<MenuCategory | null>(null);

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

  const getChildren = useCallback(
    (parentId: string | null) =>
      parentId
        ? categories.filter((c) => c.parent_id === parentId)
        : categories.filter((c) => !c.parent_id),
    [categories],
  );

  const childCategories = getChildren(currentCategory?.id ?? null)
    .sort((a, b) => a.sort_order - b.sort_order);

  const directItems = items.filter((i) => {
    if (search) {
      const q = search.toLowerCase();
      return i.name.toLowerCase().includes(q) || (i.search_tags || []).some((t) => t.toLowerCase().includes(q));
    }
    if (!currentCategory) {
      const topSlugs = getChildren(null).map((c) => c.slug);
      return !topSlugs.includes(i.category) || categories.length === 0;
    }
    return i.category === currentCategory.slug;
  });

  const countForCategory = (cat: MenuCategory): number => {
    const childSlugs = getChildren(cat.id).map((c) => c.slug);
    return items.filter((i) => i.category === cat.slug || childSlugs.includes(i.category)).length;
  };

  const navigateInto = (cat: MenuCategory) => {
    setPath((prev) => [...prev, cat]);
    setSearch('');
    hapticFeedback('light');
  };

  const navigateBack = () => {
    setPath((prev) => prev.slice(0, -1));
    setSearch('');
  };

  // ============ ITEM EDITOR ============

  const openCreate = () => {
    setEditingItem(null);
    setForm({ ...emptyForm, category: currentCategory?.slug || categories[0]?.slug || '' });
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
      is_top: item.is_top ?? false,
      image_url: item.image_url || '',
      search_tags: (item.search_tags || []).join(', '),
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
    const fpath = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage
      .from('menu-images')
      .upload(fpath, file, { contentType: file.type });
    if (!error) {
      const url = `${SUPABASE_URL}/storage/v1/object/public/menu-images/${fpath}`;
      updateField('image_url', url);
      hapticNotification('success');
    }
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.price) return;
    const tags = form.search_tags
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    const payload = {
      name: form.name.trim(),
      price: Number(form.price),
      category: form.category,
      min_threshold: Number(form.min_threshold) || 0,
      is_active: form.is_active,
      is_top: form.is_top,
      image_url: form.image_url || null,
      search_tags: tags,
    };
    let error;
    if (editingItem) {
      const res = await supabase.from('inventory').update(payload).eq('id', editingItem.id);
      error = res.error;
    } else {
      const maxOrder = items
        .filter((i) => i.category === form.category)
        .reduce((max, i) => Math.max(max, i.sort_order), 0);
      const res = await supabase.from('inventory').insert({ ...payload, sort_order: maxOrder + 10 });
      error = res.error;
    }
    if (error) {
      hapticNotification('error');
      return;
    }
    hapticNotification('success');
    setShowEditor(false);
    loadItems();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError('');
    const { error } = await supabase.from('inventory').delete().eq('id', deleteTarget.id);
    if (error) {
      if (error.code === '23503') {
        setDeleteError('Нельзя удалить — позиция используется в чеках. Скройте её вместо удаления.');
      } else {
        setDeleteError(error.message);
      }
      return;
    }
    hapticNotification('success');
    setDeleteTarget(null);
    loadItems();
  };

  const deactivateAndClose = async () => {
    if (!deleteTarget) return;
    await supabase.from('inventory').update({ is_active: false }).eq('id', deleteTarget.id);
    hapticNotification('success');
    setDeleteTarget(null);
    setDeleteError('');
    loadItems();
  };

  const toggleActive = async (item: InventoryItem) => {
    hapticFeedback();
    await supabase.from('inventory').update({ is_active: !item.is_active }).eq('id', item.id);
    loadItems();
  };

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

    if (item.sort_order === other.sort_order) {
      const newOrder = direction === 'up' ? other.sort_order - 1 : other.sort_order + 1;
      await supabase.from('inventory').update({ sort_order: newOrder }).eq('id', item.id);
    } else {
      await Promise.all([
        supabase.from('inventory').update({ sort_order: other.sort_order }).eq('id', item.id),
        supabase.from('inventory').update({ sort_order: item.sort_order }).eq('id', other.id),
      ]);
    }
    loadItems();
  };

  // ============ CATEGORY EDITOR ============

  const openCreateCategory = () => {
    setEditingCategory(null);
    setCatForm({ ...emptyCategoryForm, parent_id: currentCategory?.id ?? null });
    setShowCatEditor(true);
  };

  const openEditCategory = (cat: MenuCategory) => {
    setEditingCategory(cat);
    setCatForm({
      name: cat.name,
      slug: cat.slug,
      icon_name: cat.icon_name,
      color: cat.color || 'slate',
      parent_id: cat.parent_id,
    });
    setShowCatEditor(true);
    hapticFeedback();
  };

  const handleSaveCategory = async () => {
    if (!catForm.name.trim()) return;
    const slug = catForm.slug.trim() || catForm.name.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_а-яё]/gi, '');
    const payload = {
      name: catForm.name.trim(),
      slug,
      icon_name: catForm.icon_name,
      color: catForm.color || 'slate',
      parent_id: catForm.parent_id || null,
    };
    if (editingCategory) {
      await supabase.from('menu_categories').update(payload).eq('id', editingCategory.id);
      if (editingCategory.slug !== slug) {
        await supabase.from('inventory').update({ category: slug }).eq('category', editingCategory.slug);
      }
    } else {
      const maxOrder = categories.reduce((max, c) => Math.max(max, c.sort_order), 0);
      await supabase.from('menu_categories').insert({ ...payload, sort_order: maxOrder + 10 });
    }
    hapticNotification('success');
    setShowCatEditor(false);
    reloadCategories();
  };

  const handleDeleteCategory = async () => {
    if (!deleteCatTarget) return;
    const childCount = getChildren(deleteCatTarget.id).length;
    const itemCount = items.filter((i) => i.category === deleteCatTarget.slug).length;
    if (childCount > 0) {
      await supabase.from('menu_categories').update({ parent_id: deleteCatTarget.parent_id ?? null }).eq('parent_id', deleteCatTarget.id);
    }
    if (itemCount > 0) {
      const fallback = currentCategory
        ? currentCategory.slug
        : categories.find((c) => c.id !== deleteCatTarget.id)?.slug;
      if (fallback) {
        await supabase.from('inventory').update({ category: fallback }).eq('category', deleteCatTarget.slug);
      }
    }
    await supabase.from('menu_categories').delete().eq('id', deleteCatTarget.id);
    hapticNotification('success');
    setDeleteCatTarget(null);
    reloadCategories();
    loadItems();
  };

  if (isLoading || catLoading) {
    return <ListSkeleton rows={5} />;
  }

  const isRoot = path.length === 0;
  const activeItemsCount = items.filter((i) => i.is_active).length;
  const hasSubcategories = childCategories.length > 0;
  const topCategories = categories.filter((c) => !c.parent_id);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ============ HEADER ============ */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          {!isRoot && (
            <button
              onClick={navigateBack}
              className="p-2 sm:p-2.5 rounded-xl sm:rounded-2xl bg-[var(--c-surface)] border border-[var(--c-border)] active:scale-95 transition-all shrink-0"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 text-[var(--c-hint)]" />
            </button>
          )}
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-extrabold tracking-tight text-[var(--c-text)] leading-tight truncate">
              {isRoot ? 'Меню' : currentCategory!.name}
            </h1>
            {isRoot ? (
              <p className="text-[var(--c-muted)] text-[11px] sm:text-sm mt-0.5 font-medium">
                Структура заведения
              </p>
            ) : (
              <div className="flex items-center gap-1 text-[var(--c-muted)] text-[11px] sm:text-xs mt-0.5 font-medium truncate">
                <button onClick={() => setPath([])} className="hover:text-[var(--c-text)] transition-colors">Меню</button>
                {path.slice(0, -1).map((p, i) => (
                  <span key={p.id} className="flex items-center gap-1">
                    <ChevronRight className="w-3 h-3" />
                    <button onClick={() => setPath(path.slice(0, i + 1))} className="hover:text-[var(--c-text)] transition-colors truncate">{p.name}</button>
                  </span>
                ))}
                <ChevronRight className="w-3 h-3 shrink-0" />
                <span className="text-[var(--c-text)] truncate">{currentCategory!.name}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={openCreateCategory}
            className="h-9 sm:h-11 px-3 sm:px-5 rounded-xl sm:rounded-2xl flex items-center gap-1.5 sm:gap-2 font-semibold text-xs sm:text-sm transition-all active:scale-95 bg-[var(--c-surface)] border border-[var(--c-border)] text-[var(--c-text)] hover:bg-[var(--c-surface-hover)] shrink-0"
          >
            <FolderPlus className="w-4 h-4" />
            <span className="hidden sm:inline">Раздел</span>
          </button>
          <button
            onClick={openCreate}
            className="h-9 sm:h-11 px-3 sm:px-5 rounded-xl sm:rounded-2xl flex items-center gap-1.5 sm:gap-2 font-bold text-xs sm:text-sm transition-all active:scale-95 text-white [background:linear-gradient(135deg,#8b5cf6,#06b6d4)] [box-shadow:0_4px_20px_rgba(139,92,246,0.25)] shrink-0"
          >
            <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="hidden xs:inline">Позиция</span>
          </button>
        </div>
      </div>

      {/* ============ SEARCH + STATS ============ */}
      <div className="flex gap-2 sm:gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-[var(--c-muted)]" size={16} />
          <input
            type="text"
            placeholder="Поиск..."
            className="w-full bg-[var(--c-surface)] border border-[var(--c-border)] rounded-xl sm:rounded-2xl py-2.5 sm:py-3.5 pl-9 sm:pl-11 pr-3 sm:pr-4 focus:outline-none focus:ring-2 focus:ring-[var(--c-accent)]/40 transition-all placeholder:text-[var(--c-muted)] text-[13px] sm:text-sm text-[var(--c-text)]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {isRoot && (
          <div className="hidden sm:flex gap-3">
            <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-2xl px-4 py-2 flex flex-col justify-center min-w-[80px]">
              <span className="text-[var(--c-muted)] text-[10px] font-bold uppercase tracking-widest">Всего</span>
              <span className="text-lg font-black text-[var(--c-text)]">{items.length}</span>
            </div>
            <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-2xl px-4 py-2 flex flex-col justify-center min-w-[80px]">
              <span className="text-emerald-400 text-[10px] font-bold uppercase tracking-widest">Активных</span>
              <span className="text-lg font-black text-emerald-400">{activeItemsCount}</span>
            </div>
          </div>
        )}
      </div>

      {/* ============ CONTENT ============ */}
      {search ? (
        <div className="grid gap-2.5 sm:gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {directItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              categories={categories}
              onEdit={openEdit}
              onToggle={toggleActive}
              onMove={moveItem}
              canMoveUp={false}
              canMoveDown={false}
            />
          ))}
          {directItems.length === 0 && (
            <div className="col-span-full text-center py-16">
              <Search className="w-10 h-10 text-[var(--c-muted)] mx-auto mb-3" />
              <p className="text-[var(--c-hint)] font-medium">Ничего не найдено</p>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Subcategories */}
          {hasSubcategories && (
            <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-3">
              {childCategories.map((cat) => {
                const Icon = getIconComponent(cat.icon_name);
                const count = countForCategory(cat);
                const subChildren = getChildren(cat.id);
                const colorCfg = getCategoryColorConfig(cat.color);

                return (
                  <div
                    key={cat.id}
                    className="group relative rounded-[20px] sm:rounded-[28px] p-3.5 sm:p-6 cursor-pointer overflow-hidden transition-all duration-200 border hover:scale-[1.01] active:scale-[0.98]"
                    style={{ borderColor: 'var(--c-border)' }}
                    onClick={() => navigateInto(cat)}
                  >
                    <div className={`absolute inset-0 ${colorCfg.bg} opacity-60 group-hover:opacity-100 transition-opacity`} />

                    <div className="relative z-10">
                      <div className="flex items-start justify-between mb-3 sm:mb-6">
                        <div className={`w-10 h-10 sm:w-14 sm:h-14 ${colorCfg.bg} ${colorCfg.text} rounded-xl sm:rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300 border ${colorCfg.border}`}>
                          <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
                        </div>
                        <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-all sm:translate-x-2 sm:group-hover:translate-x-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); openEditCategory(cat); }}
                            className="p-1.5 sm:p-2 bg-[var(--c-surface)] text-[var(--c-hint)] hover:text-[var(--c-accent)] rounded-lg sm:rounded-xl transition-colors border border-[var(--c-border)] active:scale-90"
                          >
                            <Pencil className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteCatTarget(cat); }}
                            className="p-1.5 sm:p-2 bg-[var(--c-surface)] text-[var(--c-hint)] hover:text-[var(--c-danger)] rounded-lg sm:rounded-xl transition-colors border border-[var(--c-border)] active:scale-90"
                          >
                            <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                          </button>
                        </div>
                      </div>

                      <h3 className="text-[15px] sm:text-xl font-bold text-[var(--c-text)] mb-1 sm:mb-2 truncate">{cat.name}</h3>
                      <div className="flex items-center gap-1.5 sm:gap-2 text-[var(--c-muted)] font-medium flex-wrap">
                        <span className="bg-[var(--c-surface)] px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md sm:rounded-lg text-[11px] sm:text-xs border border-[var(--c-border)]">
                          {count} шт.
                        </span>
                        {subChildren.length > 0 && (
                          <span className="text-[11px] sm:text-xs">{subChildren.length} подразд.</span>
                        )}
                      </div>

                      <div className="absolute bottom-0 right-0 text-[var(--c-muted)] group-hover:text-[var(--c-accent)] transition-all group-hover:translate-x-1 hidden sm:block">
                        <ChevronRight className="w-6 h-6" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Items in current category */}
          {directItems.length > 0 && (
            <>
              {hasSubcategories && (
                <div className="flex items-center gap-2 pt-1">
                  <div className="h-px flex-1 bg-[var(--c-border)]" />
                  <span className="text-[11px] sm:text-xs font-semibold text-[var(--c-muted)] uppercase tracking-wider px-2">
                    Позиции{currentCategory ? ` · ${currentCategory.name}` : ''}
                  </span>
                  <div className="h-px flex-1 bg-[var(--c-border)]" />
                </div>
              )}
              <div className="grid gap-2.5 sm:gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {directItems.map((item, idx) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    categories={categories}
                    onEdit={openEdit}
                    onToggle={toggleActive}
                    onMove={moveItem}
                    canMoveUp={!!currentCategory && idx > 0}
                    canMoveDown={!!currentCategory && idx < directItems.length - 1}
                  />
                ))}
              </div>
            </>
          )}

          {/* Empty state */}
          {!hasSubcategories && directItems.length === 0 && (
            <div className="text-center py-16">
              <Package className="w-10 h-10 text-[var(--c-muted)] mx-auto mb-3" />
              <p className="text-[var(--c-hint)] font-medium mb-3">
                {isRoot ? 'Нет разделов и позиций' : 'Нет позиций в этом разделе'}
              </p>
              <div className="flex items-center justify-center gap-2">
                <button onClick={openCreateCategory} className="text-sm font-semibold text-[var(--c-accent)]">
                  + Раздел
                </button>
                <span className="text-[var(--c-muted)]">или</span>
                <button onClick={openCreate} className="text-sm font-semibold text-[var(--c-accent)]">
                  + Позиция
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ============ ALL DRAWERS ============ */}

      <Drawer
        open={showEditor}
        onClose={() => setShowEditor(false)}
        title={editingItem ? 'Редактирование' : 'Новая позиция'}
        subtitle="Параметры позиции"
        size="lg"
      >
        <div className="flex flex-col -mx-6 sm:-mx-10 -mb-6 sm:-mb-10">
          <div className="flex-1 overflow-y-auto px-6 sm:px-10 pb-4 space-y-8">
            {/* Изображение */}
            <div className="space-y-3">
              <label className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] ml-1">Изображение</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {form.image_url ? (
                  <div className="relative aspect-video md:aspect-auto md:h-32 rounded-3xl overflow-hidden border border-slate-800">
                    <img src={form.image_url} alt="Preview" className="w-full h-full object-cover" />
                    <button
                      onClick={() => updateField('image_url', '')}
                      className="absolute top-2 right-2 w-10 h-10 rounded-2xl bg-black/60 flex items-center justify-center active:scale-90 transition-all"
                    >
                      <X className="w-5 h-5 text-white" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="aspect-video md:aspect-auto md:h-32 border-2 border-dashed border-slate-800 hover:border-indigo-500/50 hover:bg-indigo-500/5 rounded-3xl flex flex-col items-center justify-center gap-2 transition-all group"
                  >
                    {isUploading ? (
                      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <div className="p-3 bg-slate-800/50 rounded-2xl text-slate-400 group-hover:text-indigo-400 transition-colors">
                        <Upload size={20} />
                      </div>
                    )}
                    <span className="text-sm font-bold text-slate-400 group-hover:text-slate-200">{isUploading ? 'Загрузка...' : 'Загрузить фото'}</span>
                  </button>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                <div className="flex flex-col justify-center gap-3">
                  <span className="text-[10px] font-bold text-slate-600 uppercase md:text-left">или ссылка на изображение</span>
                  <input
                    type="text"
                    placeholder="https://..."
                    value={form.image_url}
                    onChange={(e) => updateField('image_url', e.target.value)}
                    className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl py-3 px-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all text-slate-200"
                  />
                </div>
              </div>
            </div>

            {/* Название и Цена */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <label className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] ml-1">Название</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  placeholder="Например: Адреналин"
                  className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl py-4 px-5 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all text-white font-bold text-lg"
                />
              </div>
              <div className="space-y-3">
                <label className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] ml-1">Цена (₽)</label>
                <input
                  type="number"
                  value={form.price}
                  onChange={(e) => updateField('price', e.target.value)}
                  placeholder="0"
                  min={0}
                  className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl py-4 px-5 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all text-indigo-400 font-black text-xl"
                />
              </div>
            </div>

            {/* Раздел */}
            <div className="space-y-4">
              <label className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] ml-1">Раздел</label>
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => {
                  const Icon = getIconComponent(cat.icon_name);
                  const isSelected = form.category === cat.slug;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => updateField('category', cat.slug)}
                      className={`px-5 py-3 rounded-2xl border transition-all flex items-center gap-3 font-bold text-sm ${
                        isSelected ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20' : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <Icon size={16} />
                      {cat.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Мин. остаток и Теги */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <label className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] ml-1">Мин. остаток</label>
                <input
                  type="number"
                  value={form.min_threshold}
                  onChange={(e) => updateField('min_threshold', e.target.value)}
                  placeholder="0 — не отслеживать"
                  min={0}
                  className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl py-3 px-5 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all text-white font-bold"
                />
              </div>
              <div className="space-y-3">
                <label className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] ml-1">Теги для поиска</label>
                <input
                  type="text"
                  value={form.search_tags}
                  onChange={(e) => updateField('search_tags', e.target.value)}
                  placeholder="кола, газировка, pepsi"
                  className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl py-3 px-5 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all text-slate-300 text-sm"
                />
              </div>
            </div>

            {/* Переключатели */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => updateField('is_top', !form.is_top)}
                className={`w-full p-5 rounded-3xl flex items-center justify-between transition-all active:scale-[0.99] ${
                  form.is_top ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-slate-900/30 border border-slate-800'
                }`}
              >
                <div className="flex flex-col text-left">
                  <span className={`text-sm font-bold ${form.is_top ? 'text-amber-400' : 'text-white'}`}>
                    {form.is_top ? 'Топ-позиция' : 'Обычная позиция'}
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">Топ отображается первым в меню POS</span>
                </div>
                <div className={`w-14 h-8 rounded-full relative transition-all duration-300 ${form.is_top ? 'bg-amber-500' : 'bg-slate-800'}`}>
                  <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-md transition-all duration-300 ${form.is_top ? 'left-7' : 'left-1'}`} />
                </div>
              </button>
              <button
                type="button"
                onClick={() => updateField('is_active', !form.is_active)}
                className={`w-full p-5 rounded-3xl flex items-center justify-between transition-all active:scale-[0.99] ${
                  form.is_active ? 'bg-emerald-500/5 border border-emerald-500/20' : 'bg-slate-900/30 border border-slate-800'
                }`}
              >
                <div className="flex flex-col text-left">
                  <span className={`text-sm font-bold ${form.is_active ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {form.is_active ? 'Отображается в меню' : 'Скрыт из меню'}
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">
                    {form.is_active ? 'Видна клиентам и в системе' : 'Не отображается в меню'}
                  </span>
                </div>
                <div className={`w-14 h-8 rounded-full relative transition-all duration-300 ${form.is_active ? 'bg-emerald-500' : 'bg-slate-800'}`}>
                  <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-md transition-all duration-300 ${form.is_active ? 'left-7' : 'left-1'}`} />
                </div>
              </button>
            </div>
          </div>

          {/* Футер */}
          <div className={`p-6 border-t border-slate-800 bg-slate-900/20 shrink-0 ${editingItem ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : ''}`}>
            <button
              onClick={handleSave}
              disabled={!form.name.trim() || !form.price}
              className={`h-14 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl flex items-center justify-center gap-2 font-black uppercase tracking-widest shadow-xl shadow-indigo-600/20 active:scale-95 transition-all ${editingItem ? 'sm:order-2' : 'w-full'}`}
            >
              <Check size={20} /> Сохранить
            </button>
            {editingItem && (
              <button
                type="button"
                onClick={() => { setShowEditor(false); setDeleteTarget(editingItem); }}
                className="h-14 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-2xl flex items-center justify-center gap-2 font-bold transition-all border border-red-500/20 active:scale-95 sm:order-1"
              >
                <Trash2 size={20} /> Удалить позицию
              </button>
            )}
          </div>
        </div>
      </Drawer>

      <Drawer open={!!deleteTarget} onClose={() => { setDeleteTarget(null); setDeleteError(''); }} title="Удалить позицию?" size="sm">
        {deleteTarget && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--c-danger-bg)] border border-red-500/20">
              {deleteTarget.image_url ? (
                <img src={deleteTarget.image_url} className="w-12 h-12 rounded-xl object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-[var(--c-surface-hover)] flex items-center justify-center">
                  <Package className="w-5 h-5 text-[var(--c-hint)]" />
                </div>
              )}
              <div>
                <p className="text-[13px] font-semibold text-[var(--c-text)]">{deleteTarget.name}</p>
                <p className="text-xs text-[var(--c-danger)]">{deleteTarget.price}₽</p>
              </div>
            </div>

            {deleteError ? (
              <div className="p-3 rounded-xl bg-[var(--c-warning-bg)] border border-amber-500/20">
                <p className="text-xs text-[var(--c-warning)]">{deleteError}</p>
                <Button fullWidth size="sm" variant="secondary" className="mt-3" onClick={deactivateAndClose}>
                  <EyeOff className="w-4 h-4" />
                  Скрыть вместо удаления
                </Button>
              </div>
            ) : (
              <p className="text-xs text-[var(--c-hint)] text-center">
                Позиция будет удалена из меню. Это действие нельзя отменить.
              </p>
            )}

            <div className="flex gap-2">
              <Button fullWidth variant="secondary" onClick={() => { setDeleteTarget(null); setDeleteError(''); }}>Отмена</Button>
              {!deleteError && <Button fullWidth variant="danger" onClick={handleDelete}>Удалить</Button>}
            </div>
          </div>
        )}
      </Drawer>

      <CategoryEditorDrawer
        open={showCatEditor}
        onClose={() => setShowCatEditor(false)}
        editing={editingCategory}
        form={catForm}
        setForm={setCatForm}
        topCategories={topCategories}
        onSave={handleSaveCategory}
        onDelete={editingCategory ? () => { setShowCatEditor(false); setDeleteCatTarget(editingCategory); } : undefined}
      />

      <Drawer open={!!deleteCatTarget} onClose={() => setDeleteCatTarget(null)} title="Удалить раздел?" size="sm">
        {deleteCatTarget && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--c-danger-bg)] border border-red-500/20">
              {(() => { const I = getIconComponent(deleteCatTarget.icon_name); return <I className="w-5 h-5 text-[var(--c-danger)] shrink-0" />; })()}
              <div>
                <p className="text-[13px] font-semibold text-[var(--c-text)]">{deleteCatTarget.name}</p>
                <p className="text-xs text-[var(--c-hint)]">{countForCategory(deleteCatTarget)} позиций</p>
              </div>
            </div>
            <p className="text-xs text-[var(--c-hint)] text-center">
              Позиции будут перемещены в родительский раздел. Подразделы станут основными.
            </p>
            <div className="flex gap-2">
              <Button fullWidth variant="secondary" onClick={() => setDeleteCatTarget(null)}>Отмена</Button>
              <Button fullWidth variant="danger" onClick={handleDeleteCategory}>Удалить</Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

// ============ ITEM CARD ============

function ItemCard({
  item,
  categories,
  onEdit,
  onToggle,
  onMove,
  canMoveUp,
  canMoveDown,
}: {
  item: InventoryItem;
  categories: MenuCategory[];
  onEdit: (item: InventoryItem) => void;
  onToggle: (item: InventoryItem) => void;
  onMove: (item: InventoryItem, dir: 'up' | 'down') => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const cat = categories.find((c) => c.slug === item.category);
  const CatIcon = getIconComponent(cat?.icon_name || 'Package');
  const colorCfg = getCategoryColorConfig(cat?.color);
  const [showMenu, setShowMenu] = useState(false);
  const canMove = canMoveUp || canMoveDown;

  return (
    <div
      className={`group rounded-[16px] sm:rounded-[22px] p-3 sm:p-5 flex flex-col justify-between transition-all duration-200 border border-[var(--c-border)] hover:border-[var(--c-accent)]/30 bg-[var(--c-surface)] ${!item.is_active ? 'opacity-50' : ''}`}
    >
      <div className="flex justify-between items-start mb-2.5 sm:mb-4">
        <div className={`w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl flex items-center justify-center ${colorCfg.bg} ${colorCfg.text} border ${colorCfg.border} group-hover:scale-105 transition-transform overflow-hidden`}>
          {item.image_url ? (
            <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
          ) : (
            <CatIcon className="w-4 h-4 sm:w-5 sm:h-5" />
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {canMove && (
            <div className="flex flex-col gap-0.5 mr-0.5">
              <button
                onClick={() => onMove(item, 'up')}
                disabled={!canMoveUp}
                className="w-7 h-7 rounded-lg bg-[var(--c-surface)] flex items-center justify-center disabled:opacity-30 active:scale-90 transition-all border border-[var(--c-border)]"
              >
                <ChevronUp className="w-3.5 h-3.5 text-[var(--c-hint)]" />
              </button>
              <button
                onClick={() => onMove(item, 'down')}
                disabled={!canMoveDown}
                className="w-7 h-7 rounded-lg bg-[var(--c-surface)] flex items-center justify-center disabled:opacity-30 active:scale-90 transition-all border border-[var(--c-border)]"
              >
                <ChevronDown className="w-3.5 h-3.5 text-[var(--c-hint)]" />
              </button>
            </div>
          )}
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
                    onClick={() => { onEdit(item); setShowMenu(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-[var(--c-text)] hover:bg-[var(--c-surface)] rounded-lg transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5 text-[var(--c-hint)]" />
                    Редактировать
                  </button>
                  {canMove && (
                    <>
                      <button
                        onClick={() => { onMove(item, 'up'); setShowMenu(false); }}
                        disabled={!canMoveUp}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-[var(--c-text)] hover:bg-[var(--c-surface)] rounded-lg transition-colors disabled:opacity-50"
                      >
                        <ChevronUp className="w-3.5 h-3.5 text-[var(--c-hint)]" />
                        Поднять
                      </button>
                      <button
                        onClick={() => { onMove(item, 'down'); setShowMenu(false); }}
                        disabled={!canMoveDown}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-[var(--c-text)] hover:bg-[var(--c-surface)] rounded-lg transition-colors disabled:opacity-50"
                      >
                        <ChevronDown className="w-3.5 h-3.5 text-[var(--c-hint)]" />
                        Опустить
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => { onToggle(item); setShowMenu(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-[var(--c-text)] hover:bg-[var(--c-surface)] rounded-lg transition-colors"
                  >
                    {item.is_active
                      ? <><EyeOff className="w-3.5 h-3.5 text-[var(--c-muted)]" /> Скрыть</>
                      : <><Eye className="w-3.5 h-3.5 text-emerald-400" /> Показать</>
                    }
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="cursor-pointer" onClick={() => onEdit(item)}>
        <h4 className="text-[13px] sm:text-sm font-bold text-[var(--c-text)] group-hover:text-white transition-colors leading-snug line-clamp-2">
          {item.name}
        </h4>
        {!item.is_active && (
          <span className="inline-block mt-1 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest px-1.5 sm:px-2 py-0.5 rounded-md sm:rounded-lg bg-[var(--c-muted)]/15 text-[var(--c-muted)]">
            Скрыт
          </span>
        )}
        <div className="flex items-end justify-between mt-2 sm:mt-3">
          <div className="flex flex-col">
            <span className="text-[var(--c-muted)] text-[9px] sm:text-[10px] font-bold uppercase tracking-wider">Цена</span>
            <span className="text-base sm:text-xl font-black text-[var(--c-accent)]">{item.price} ₽</span>
          </div>
          {item.min_threshold > 0 && (
            <span className={`text-[9px] sm:text-[10px] font-black uppercase tracking-widest px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl border ${
              item.stock_quantity < item.min_threshold
                ? 'bg-red-500/10 text-red-400 border-red-500/20'
                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
            }`}>
              {item.stock_quantity} шт.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ============ CATEGORY EDITOR DRAWER ============

function CategoryEditorDrawer({
  open,
  onClose,
  editing,
  form,
  setForm,
  topCategories,
  onSave,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  editing: MenuCategory | null;
  form: CategoryForm;
  setForm: React.Dispatch<React.SetStateAction<CategoryForm>>;
  topCategories: MenuCategory[];
  onSave: () => void;
  onDelete?: () => void;
}) {
  const [showIcons, setShowIcons] = useState(false);

  return (
    <Drawer open={open} onClose={onClose} title={editing ? 'Редактировать раздел' : 'Новый раздел'} size="md">
      <div className="space-y-4">
        <Input
          label="Название"
          placeholder="Название раздела"
          value={form.name}
          onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
        />

        <Input
          label="Slug (идентификатор)"
          placeholder="автоматически из названия"
          value={form.slug}
          onChange={(e) => setForm((prev) => ({ ...prev, slug: e.target.value }))}
        />

        <div>
          <p className="text-xs font-medium text-[var(--c-hint)] mb-2">Цвет категории (в меню POS)</p>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_COLOR_OPTIONS.map((key) => {
              const cfg = getCategoryColorConfig(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, color: key }))}
                  className={`w-9 h-9 rounded-xl transition-all active:scale-90 ${cfg.active} ${form.color === key ? 'ring-2 ring-white ring-offset-2 ring-offset-[var(--c-bg)]' : 'opacity-60 hover:opacity-100'}`}
                  title={key}
                />
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-[var(--c-hint)] mb-2">Иконка</p>
          <button
            onClick={() => setShowIcons(!showIcons)}
            className="flex items-center gap-2 p-3 rounded-xl card active:scale-[0.98] transition-all w-full"
          >
            {React.createElement(getIconComponent(form.icon_name), { className: "w-5 h-5 text-[var(--c-text)]" })}
            <span className="text-[13px] text-[var(--c-text)]">{form.icon_name}</span>
            <ChevronRight className={`w-4 h-4 text-[var(--c-hint)] ml-auto transition-transform ${showIcons ? 'rotate-90' : ''}`} />
          </button>
          {showIcons && (
            <div className="grid grid-cols-6 gap-1.5 mt-2 p-2 rounded-xl bg-[var(--c-surface)] max-h-48 overflow-y-auto">
              {AVAILABLE_ICONS.map((iconName) => {
                const I = getIconComponent(iconName);
                return (
                  <button
                    key={iconName}
                    onClick={() => { setForm((prev) => ({ ...prev, icon_name: iconName })); setShowIcons(false); }}
                    className={`w-full aspect-square rounded-xl flex items-center justify-center transition-all active:scale-90 ${form.icon_name === iconName
                      ? 'bg-[var(--c-accent)] text-white'
                      : 'bg-[var(--c-surface)] text-[var(--c-hint)] hover:text-[var(--c-text)]'
                      }`}
                  >
                    <I className="w-5 h-5" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <p className="text-xs font-medium text-[var(--c-hint)] mb-2">Родительский раздел</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setForm((prev) => ({ ...prev, parent_id: null }))}
              className={`px-3 py-2 rounded-xl text-xs font-medium transition-all active:scale-[0.97] ${!form.parent_id
                ? 'bg-[var(--c-accent)] text-white'
                : 'card text-[var(--c-hint)]'
                }`}
            >
              Нет (основной)
            </button>
            {topCategories.filter((c) => c.id !== editing?.id).map((cat) => {
              const I = getIconComponent(cat.icon_name);
              return (
                <button
                  key={cat.id}
                  onClick={() => setForm((prev) => ({ ...prev, parent_id: cat.id }))}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all active:scale-[0.97] ${form.parent_id === cat.id
                    ? 'bg-[var(--c-accent)] text-white'
                    : 'card text-[var(--c-hint)]'
                    }`}
                >
                  <I className="w-3.5 h-3.5" />
                  {cat.name}
                </button>
              );
            })}
          </div>
        </div>

        <Button fullWidth size="lg" onClick={onSave} disabled={!form.name.trim()}>
          <Check className="w-5 h-5" />
          {editing ? 'Сохранить' : 'Создать'}
        </Button>

        {editing && onDelete && (
          <Button fullWidth variant="danger" onClick={onDelete}>
            <Trash2 className="w-4 h-4" />
            Удалить раздел
          </Button>
        )}
      </div>
    </Drawer>
  );
}
