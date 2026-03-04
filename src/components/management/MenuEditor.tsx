import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Drawer } from '@/components/ui/Drawer';
import {
  Plus, ChevronUp, ChevronDown, Pencil, Trash2,
  Image as ImageIcon, Eye, EyeOff, Search, Upload, X, Check,
  FolderPlus, FolderOpen, ChevronRight, ArrowLeft,
  Package,
} from 'lucide-react';
import { hapticFeedback, hapticNotification } from '@/lib/telegram';
import {
  useAllMenuCategories,
  getIconComponent,
  getCategoryColor,
  AVAILABLE_ICONS,
} from '@/hooks/useMenuCategories';
import type { InventoryItem, MenuCategory } from '@/types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

type ViewMode = 'categories' | 'items' | 'category-editor';

interface EditForm {
  name: string;
  price: string;
  category: string;
  min_threshold: string;
  is_active: boolean;
  image_url: string;
}

const emptyForm: EditForm = {
  name: '',
  price: '',
  category: '',
  min_threshold: '0',
  is_active: true,
  image_url: '',
};

interface CategoryForm {
  name: string;
  slug: string;
  icon_name: string;
  parent_id: string | null;
}

const emptyCategoryForm: CategoryForm = {
  name: '',
  slug: '',
  icon_name: 'Package',
  parent_id: null,
};

export function MenuEditor() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { categories, loading: catLoading, reload: reloadCategories } = useAllMenuCategories();
  const [viewMode, setViewMode] = useState<ViewMode>('categories');
  const [activeCategory, setActiveCategory] = useState<MenuCategory | null>(null);
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

  const topCategories = categories.filter((c) => !c.parent_id);
  const getChildren = (parentId: string) => categories.filter((c) => c.parent_id === parentId);

  const filteredItems = items.filter((i) => {
    if (search) return i.name.toLowerCase().includes(search.toLowerCase());
    if (!activeCategory) return true;
    const childSlugs = getChildren(activeCategory.id).map((c) => c.slug);
    return i.category === activeCategory.slug || childSlugs.includes(i.category);
  });

  const countForCategory = (cat: MenuCategory): number => {
    const childSlugs = getChildren(cat.id).map((c) => c.slug);
    return items.filter((i) => i.category === cat.slug || childSlugs.includes(i.category)).length;
  };

  // ============ ITEM EDITOR ============

  const openCreate = () => {
    setEditingItem(null);
    setForm({ ...emptyForm, category: activeCategory?.slug || categories[0]?.slug || '' });
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
    await supabase.from('inventory').update({ sort_order: other.sort_order }).eq('id', item.id);
    await supabase.from('inventory').update({ sort_order: item.sort_order }).eq('id', other.id);
    loadItems();
  };

  // ============ CATEGORY EDITOR ============

  const openCreateCategory = (parentId: string | null = null) => {
    setEditingCategory(null);
    setCatForm({ ...emptyCategoryForm, parent_id: parentId });
    setShowCatEditor(true);
  };

  const openEditCategory = (cat: MenuCategory) => {
    setEditingCategory(cat);
    setCatForm({
      name: cat.name,
      slug: cat.slug,
      icon_name: cat.icon_name,
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
      await supabase.from('menu_categories').update({ parent_id: null }).eq('parent_id', deleteCatTarget.id);
    }
    if (itemCount > 0) {
      const firstCat = categories.find((c) => c.id !== deleteCatTarget.id);
      if (firstCat) {
        await supabase.from('inventory').update({ category: firstCat.slug }).eq('category', deleteCatTarget.slug);
      }
    }
    await supabase.from('menu_categories').delete().eq('id', deleteCatTarget.id);
    hapticNotification('success');
    setDeleteCatTarget(null);
    reloadCategories();
    loadItems();
  };

  const moveCategoryOrder = async (cat: MenuCategory, direction: 'up' | 'down') => {
    hapticFeedback('light');
    const siblings = (cat.parent_id
      ? categories.filter((c) => c.parent_id === cat.parent_id)
      : topCategories
    ).sort((a, b) => a.sort_order - b.sort_order);
    const idx = siblings.findIndex((c) => c.id === cat.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= siblings.length) return;
    const other = siblings[swapIdx];
    await supabase.from('menu_categories').update({ sort_order: other.sort_order }).eq('id', cat.id);
    await supabase.from('menu_categories').update({ sort_order: cat.sort_order }).eq('id', other.id);
    reloadCategories();
  };

  if (isLoading || catLoading) {
    return (
      <div className="text-center py-20">
        <div className="w-8 h-8 border-2 border-[var(--tg-theme-button-color,#6c5ce7)] border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  // ============ CATEGORY LIST VIEW ============

  if (viewMode === 'categories') {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 px-4 rounded-xl card text-center">
            <span className="text-sm font-bold text-[var(--tg-theme-text-color,#e0e0e0)]">{items.length}</span>
            <span className="text-xs text-white/40 ml-1.5">позиций</span>
          </div>
          <div className="p-2.5 px-4 rounded-xl bg-emerald-500/10 text-center">
            <span className="text-sm font-bold text-emerald-400">{categories.length}</span>
            <span className="text-xs text-white/40 ml-1.5">разделов</span>
          </div>
          <div className="flex-1" />
          <Button size="sm" variant="secondary" onClick={() => openCreateCategory()}>
            <FolderPlus className="w-4 h-4" />
            Раздел
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type="text"
            placeholder="Поиск по названию..."
            className="w-full pl-10 pr-4 py-2.5 card rounded-xl text-[13px] text-[var(--tg-theme-text-color,#e0e0e0)] placeholder:text-white/30"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {search ? (
          <ItemsList
            items={filteredItems}
            categories={categories}
            onEdit={openEdit}
            onToggle={toggleActive}
            onMove={moveItem}
            search
          />
        ) : (
          <div className="space-y-1.5">
            {topCategories.sort((a, b) => a.sort_order - b.sort_order).map((cat, idx) => {
              const Icon = getIconComponent(cat.icon_name);
              const count = countForCategory(cat);
              const children = getChildren(cat.id).sort((a, b) => a.sort_order - b.sort_order);
              return (
                <div key={cat.id}>
                  <div className="flex items-center gap-2">
                    {/* Reorder */}
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <button
                        onClick={() => moveCategoryOrder(cat, 'up')}
                        disabled={idx === 0}
                        className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center disabled:opacity-20 active:scale-90 transition-all"
                      >
                        <ChevronUp className="w-3 h-3 text-white/50" />
                      </button>
                      <button
                        onClick={() => moveCategoryOrder(cat, 'down')}
                        disabled={idx === topCategories.length - 1}
                        className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center disabled:opacity-20 active:scale-90 transition-all"
                      >
                        <ChevronDown className="w-3 h-3 text-white/50" />
                      </button>
                    </div>

                    {/* Category card */}
                    <button
                      onClick={() => { setActiveCategory(cat); setViewMode('items'); }}
                      className={`flex-1 flex items-center gap-3 p-3 rounded-xl card-interactive bg-gradient-to-r ${getCategoryColor(idx)}`}
                    >
                      <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                        <Icon className="w-5 h-5 text-white/70" />
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-[13px] font-semibold text-[var(--tg-theme-text-color,#e0e0e0)] truncate">
                          {cat.name}
                        </p>
                        <p className="text-[11px] text-white/40 mt-0.5">
                          {count} {count === 1 ? 'позиция' : count < 5 ? 'позиции' : 'позиций'}
                          {children.length > 0 && ` · ${children.length} подразделов`}
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-white/20 shrink-0" />
                    </button>

                    {/* Edit/Delete */}
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <button
                        onClick={() => openEditCategory(cat)}
                        className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center active:scale-90 transition-all"
                      >
                        <Pencil className="w-3 h-3 text-white/50" />
                      </button>
                      <button
                        onClick={() => setDeleteCatTarget(cat)}
                        className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center active:scale-90 transition-all"
                      >
                        <Trash2 className="w-3 h-3 text-red-400/60" />
                      </button>
                    </div>
                  </div>

                  {/* Subcategories */}
                  {children.length > 0 && (
                    <div className="ml-10 mt-1 space-y-1">
                      {children.map((child, childIdx) => {
                        const ChildIcon = getIconComponent(child.icon_name);
                        const childCount = items.filter((i) => i.category === child.slug).length;
                        return (
                          <div key={child.id} className="flex items-center gap-2">
                            <div className="flex flex-col gap-0.5 shrink-0">
                              <button
                                onClick={() => moveCategoryOrder(child, 'up')}
                                disabled={childIdx === 0}
                                className="w-5 h-5 rounded bg-white/5 flex items-center justify-center disabled:opacity-20 active:scale-90 transition-all"
                              >
                                <ChevronUp className="w-2.5 h-2.5 text-white/50" />
                              </button>
                              <button
                                onClick={() => moveCategoryOrder(child, 'down')}
                                disabled={childIdx === children.length - 1}
                                className="w-5 h-5 rounded bg-white/5 flex items-center justify-center disabled:opacity-20 active:scale-90 transition-all"
                              >
                                <ChevronDown className="w-2.5 h-2.5 text-white/50" />
                              </button>
                            </div>
                            <button
                              onClick={() => { setActiveCategory(child); setViewMode('items'); }}
                              className="flex-1 flex items-center gap-2.5 p-2.5 rounded-xl card-interactive"
                            >
                              <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                                <ChildIcon className="w-4 h-4 text-white/50" />
                              </div>
                              <div className="flex-1 text-left">
                                <p className="text-xs font-medium text-[var(--tg-theme-text-color,#e0e0e0)]">{child.name}</p>
                                <p className="text-[10px] text-white/30">{childCount} позиций</p>
                              </div>
                              <ChevronRight className="w-3.5 h-3.5 text-white/15" />
                            </button>
                            <div className="flex flex-col gap-0.5 shrink-0">
                              <button onClick={() => openEditCategory(child)} className="w-5 h-5 rounded bg-white/5 flex items-center justify-center active:scale-90 transition-all">
                                <Pencil className="w-2.5 h-2.5 text-white/50" />
                              </button>
                              <button onClick={() => setDeleteCatTarget(child)} className="w-5 h-5 rounded bg-white/5 flex items-center justify-center active:scale-90 transition-all">
                                <Trash2 className="w-2.5 h-2.5 text-red-400/60" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Add sub-category button */}
                  <div className="ml-10 mt-1">
                    <button
                      onClick={() => openCreateCategory(cat.id)}
                      className="flex items-center gap-1.5 text-[11px] text-white/25 hover:text-white/50 transition-colors py-1"
                    >
                      <Plus className="w-3 h-3" />
                      Подраздел
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Category edit/create drawer */}
        <CategoryEditorDrawer
          open={showCatEditor}
          onClose={() => setShowCatEditor(false)}
          editing={editingCategory}
          form={catForm}
          setForm={setCatForm}
          topCategories={topCategories}
          onSave={handleSaveCategory}
        />

        {/* Category delete confirm */}
        <Drawer open={!!deleteCatTarget} onClose={() => setDeleteCatTarget(null)} title="Удалить раздел?" size="sm">
          {deleteCatTarget && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                {(() => { const I = getIconComponent(deleteCatTarget.icon_name); return <I className="w-5 h-5 text-red-400 shrink-0" />; })()}
                <div>
                  <p className="text-[13px] font-semibold text-[var(--tg-theme-text-color,#e0e0e0)]">{deleteCatTarget.name}</p>
                  <p className="text-xs text-white/40">{countForCategory(deleteCatTarget)} позиций</p>
                </div>
              </div>
              <p className="text-xs text-white/40 text-center">
                Позиции будут перемещены в другой раздел. Подразделы станут основными.
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

  // ============ ITEMS LIST VIEW ============

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => { setViewMode('categories'); setActiveCategory(null); setSearch(''); }}
          className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center active:scale-90 transition-all shrink-0"
        >
          <ArrowLeft className="w-5 h-5 text-white/60" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-[var(--tg-theme-text-color,#e0e0e0)] truncate">
            {activeCategory?.name || 'Все позиции'}
          </p>
          <p className="text-[11px] text-white/40">{filteredItems.length} позиций</p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="w-4 h-4" />
          Позиция
        </Button>
      </div>

      {/* Subcategory tabs if parent */}
      {activeCategory && getChildren(activeCategory.id).length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1">
          <button
            onClick={() => {/* already showing all for this category */}}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap bg-[var(--tg-theme-button-color,#6c5ce7)]/15 text-[var(--tg-theme-button-color,#6c5ce7)] shrink-0"
          >
            Все
          </button>
          {getChildren(activeCategory.id).sort((a, b) => a.sort_order - b.sort_order).map((sub) => {
            const SubIcon = getIconComponent(sub.icon_name);
            return (
              <button
                key={sub.id}
                onClick={() => setActiveCategory(sub)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap bg-white/5 text-white/35 active:scale-95 shrink-0 transition-all"
              >
                <SubIcon className="w-3 h-3" />
                {sub.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
        <input
          type="text"
          placeholder="Поиск по названию..."
          className="w-full pl-10 pr-4 py-2.5 card rounded-xl text-[13px] text-[var(--tg-theme-text-color,#e0e0e0)] placeholder:text-white/30"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <ItemsList
        items={filteredItems}
        categories={categories}
        onEdit={openEdit}
        onToggle={toggleActive}
        onMove={moveItem}
        search={!!search}
      />

      {filteredItems.length === 0 && (
        <div className="text-center py-12">
          <p className="text-[var(--tg-theme-hint-color,#888)]">
            {search ? 'Ничего не найдено' : 'Нет позиций в этом разделе'}
          </p>
          <Button size="sm" className="mt-3" onClick={openCreate}>
            <Plus className="w-4 h-4" /> Добавить позицию
          </Button>
        </div>
      )}

      {/* ============ EDIT / CREATE ITEM DRAWER ============ */}
      <Drawer
        open={showEditor}
        onClose={() => setShowEditor(false)}
        title={editingItem ? 'Редактирование' : 'Новая позиция'}
        size="md"
      >
        <div className="space-y-4">
          {/* Image */}
          <div>
            <p className="text-xs font-medium text-white/50 mb-2">Изображение</p>
            {form.image_url ? (
              <div className="relative w-full aspect-[3/2] rounded-xl overflow-hidden card">
                <img src={form.image_url} alt="Preview" className="w-full h-full object-cover" />
                <button
                  onClick={() => updateField('image_url', '')}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center active:scale-90 transition-all"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="w-full flex flex-col items-center gap-2 py-6 rounded-xl border-2 border-dashed border-white/10 hover:border-white/20 text-white/40 transition-all active:scale-[0.98]"
              >
                {isUploading ? (
                  <div className="w-6 h-6 border-2 border-[var(--tg-theme-button-color,#6c5ce7)] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Upload className="w-6 h-6" />
                )}
                <span className="text-xs">{isUploading ? 'Загрузка...' : 'Загрузить фото'}</span>
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
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

          <Input label="Название" placeholder="Название позиции" value={form.name} onChange={(e) => updateField('name', e.target.value)} />
          <Input label="Цена (₽)" type="number" placeholder="0" value={form.price} onChange={(e) => updateField('price', e.target.value)} min={0} />

          {/* Category selector */}
          <div>
            <p className="text-xs font-medium text-white/50 mb-2">Раздел</p>
            <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
              {categories.map((cat) => {
                const Icon = getIconComponent(cat.icon_name);
                const isChild = !!cat.parent_id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => updateField('category', cat.slug)}
                    className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-medium transition-all active:scale-[0.97] ${
                      isChild ? 'ml-3' : ''
                    } ${
                      form.category === cat.slug
                        ? 'bg-[var(--tg-theme-button-color,#6c5ce7)] text-white'
                        : 'card text-white/50'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{cat.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <Input label="Мин. остаток" type="number" placeholder="0 — не отслеживать" value={form.min_threshold} onChange={(e) => updateField('min_threshold', e.target.value)} min={0} />

          {/* Active toggle */}
          <button
            onClick={() => updateField('is_active', !form.is_active)}
            className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all active:scale-[0.98] ${
              form.is_active ? 'bg-emerald-500/10 border-emerald-500/30' : 'card border-white/10'
            }`}
          >
            <span className="text-[13px] font-medium text-[var(--tg-theme-text-color,#e0e0e0)]">
              {form.is_active ? 'Отображается в меню' : 'Скрыт из меню'}
            </span>
            <div className={`w-10 h-6 rounded-full transition-colors relative ${form.is_active ? 'bg-emerald-500' : 'bg-white/20'}`}>
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${form.is_active ? 'left-5' : 'left-1'}`} />
            </div>
          </button>

          <Button fullWidth size="lg" onClick={handleSave} disabled={!form.name.trim() || !form.price}>
            <Check className="w-5 h-5" />
            {editingItem ? 'Сохранить' : 'Создать'}
          </Button>

          {editingItem && (
            <Button fullWidth variant="danger" onClick={() => { setShowEditor(false); setDeleteTarget(editingItem); }}>
              <Trash2 className="w-4 h-4" />
              Удалить позицию
            </Button>
          )}
        </div>
      </Drawer>

      {/* ============ DELETE CONFIRM ============ */}
      <Drawer open={!!deleteTarget} onClose={() => { setDeleteTarget(null); setDeleteError(''); }} title="Удалить позицию?" size="sm">
        {deleteTarget && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              {deleteTarget.image_url ? (
                <img src={deleteTarget.image_url} className="w-12 h-12 rounded-xl object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
                  <Package className="w-5 h-5 text-white/40" />
                </div>
              )}
              <div>
                <p className="text-[13px] font-semibold text-[var(--tg-theme-text-color,#e0e0e0)]">{deleteTarget.name}</p>
                <p className="text-xs text-red-400">{deleteTarget.price}₽</p>
              </div>
            </div>

            {deleteError ? (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <p className="text-xs text-amber-400">{deleteError}</p>
                <Button fullWidth size="sm" variant="secondary" className="mt-3" onClick={deactivateAndClose}>
                  <EyeOff className="w-4 h-4" />
                  Скрыть вместо удаления
                </Button>
              </div>
            ) : (
              <p className="text-xs text-white/40 text-center">
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
    </div>
  );
}

// ============ SUB-COMPONENTS ============

function ItemsList({
  items,
  categories,
  onEdit,
  onToggle,
  onMove,
  search,
}: {
  items: InventoryItem[];
  categories: MenuCategory[];
  onEdit: (item: InventoryItem) => void;
  onToggle: (item: InventoryItem) => void;
  onMove: (item: InventoryItem, dir: 'up' | 'down') => void;
  search: boolean;
}) {
  return (
    <div className="space-y-1.5">
      {items.map((item, idx) => {
        const catItems = search ? items : items.filter((i) => i.category === item.category).sort((a, b) => a.sort_order - b.sort_order);
        const posInCategory = catItems.findIndex((i) => i.id === item.id);
        const CatIcon = getIconComponent(categories.find((c) => c.slug === item.category)?.icon_name || 'Package');

        return (
          <div
            key={item.id}
            className={`flex items-center gap-2 p-2.5 rounded-xl transition-all ${
              item.is_active ? 'card' : 'bg-white/[0.02] opacity-50'
            }`}
          >
            <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-white/10 flex items-center justify-center">
              {item.image_url ? (
                <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
              ) : (
                <CatIcon className="w-5 h-5 text-white/40" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-[var(--tg-theme-text-color,#e0e0e0)] truncate">{item.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-xs font-bold text-[var(--tg-theme-button-color,#6c5ce7)]">{item.price}₽</span>
                {item.min_threshold > 0 && (
                  <span className="text-[10px] text-white/30">ост: {item.stock_quantity}</span>
                )}
                {!item.is_active && <Badge variant="default" size="sm">Скрыт</Badge>}
              </div>
            </div>

            {!search && (
              <div className="flex flex-col gap-0.5 shrink-0">
                <button
                  onClick={() => onMove(item, 'up')}
                  disabled={posInCategory === 0}
                  className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center disabled:opacity-20 active:scale-90 transition-all"
                >
                  <ChevronUp className="w-3.5 h-3.5 text-white/50" />
                </button>
                <button
                  onClick={() => onMove(item, 'down')}
                  disabled={posInCategory === catItems.length - 1}
                  className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center disabled:opacity-20 active:scale-90 transition-all"
                >
                  <ChevronDown className="w-3.5 h-3.5 text-white/50" />
                </button>
              </div>
            )}

            <div className="flex flex-col gap-0.5 shrink-0">
              <button
                onClick={() => onEdit(item)}
                className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center active:scale-90 transition-all"
              >
                <Pencil className="w-3.5 h-3.5 text-white/50" />
              </button>
              <button
                onClick={() => onToggle(item)}
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
    </div>
  );
}

function CategoryEditorDrawer({
  open,
  onClose,
  editing,
  form,
  setForm,
  topCategories,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  editing: MenuCategory | null;
  form: CategoryForm;
  setForm: React.Dispatch<React.SetStateAction<CategoryForm>>;
  topCategories: MenuCategory[];
  onSave: () => void;
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

        {/* Icon picker */}
        <div>
          <p className="text-xs font-medium text-white/50 mb-2">Иконка</p>
          <button
            onClick={() => setShowIcons(!showIcons)}
            className="flex items-center gap-2 p-3 rounded-xl card active:scale-[0.98] transition-all w-full"
          >
            {(() => { const I = getIconComponent(form.icon_name); return <I className="w-5 h-5 text-white/70" />; })()}
            <span className="text-[13px] text-[var(--tg-theme-text-color,#e0e0e0)]">{form.icon_name}</span>
            <ChevronRight className={`w-4 h-4 text-white/30 ml-auto transition-transform ${showIcons ? 'rotate-90' : ''}`} />
          </button>
          {showIcons && (
            <div className="grid grid-cols-6 gap-1.5 mt-2 p-2 rounded-xl bg-white/[0.03] max-h-48 overflow-y-auto">
              {AVAILABLE_ICONS.map((iconName) => {
                const I = getIconComponent(iconName);
                return (
                  <button
                    key={iconName}
                    onClick={() => { setForm((prev) => ({ ...prev, icon_name: iconName })); setShowIcons(false); }}
                    className={`w-full aspect-square rounded-xl flex items-center justify-center transition-all active:scale-90 ${
                      form.icon_name === iconName
                        ? 'bg-[var(--tg-theme-button-color,#6c5ce7)] text-white'
                        : 'bg-white/5 text-white/40 hover:text-white/70'
                    }`}
                  >
                    <I className="w-5 h-5" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Parent category */}
        <div>
          <p className="text-xs font-medium text-white/50 mb-2">Родительский раздел</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setForm((prev) => ({ ...prev, parent_id: null }))}
              className={`px-3 py-2 rounded-xl text-xs font-medium transition-all active:scale-[0.97] ${
                !form.parent_id
                  ? 'bg-[var(--tg-theme-button-color,#6c5ce7)] text-white'
                  : 'card text-white/50'
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
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all active:scale-[0.97] ${
                    form.parent_id === cat.id
                      ? 'bg-[var(--tg-theme-button-color,#6c5ce7)] text-white'
                      : 'card text-white/50'
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
      </div>
    </Drawer>
  );
}
