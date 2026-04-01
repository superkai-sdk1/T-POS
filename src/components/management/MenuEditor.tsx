import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Drawer } from '@/components/ui/Drawer';
import { ListSkeleton } from '@/components/ui/Skeleton';
import {
  Plus, Pencil, Trash2,
  Eye, EyeOff, Search, Upload, X, Check,
  FolderPlus, ChevronRight, ArrowLeft,
  Package, MoreVertical,
} from 'lucide-react';
import { hapticFeedback, hapticNotification } from '@/lib/telegram';
import {
  useAllMenuCategories,
  getIconComponent,
  getCategoryColorConfig,
  AVAILABLE_ICONS,
  CATEGORY_COLOR_OPTIONS,
} from '@/hooks/useMenuCategories';
import type { InventoryItem, MenuCategory, Space } from '@/types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

interface EditForm {
  name: string;
  price: string;
  category: string;
  is_service: boolean;
  track_stock: boolean;
  min_threshold: string;
  is_active: boolean;
  is_top: boolean;
  is_tablet_visible: boolean;
  image_url: string;
  search_tags: string;
  linked_space_id: string;
  hourly_rate: string;
}

const emptyForm: EditForm = {
  name: '',
  price: '',
  category: '',
  is_service: false,
  track_stock: true,
  min_threshold: '0',
  is_active: true,
  is_top: false,
  is_tablet_visible: true,
  image_url: '',
  search_tags: '',
  linked_space_id: '',
  hourly_rate: '',
};

interface CategoryForm {
  name: string;
  slug: string;
  icon_name: string;
  color: string;
  is_tablet_visible: boolean;
  parent_id: string | null;
}

const emptyCategoryForm: CategoryForm = {
  name: '',
  slug: '',
  icon_name: 'Package',
  color: 'slate',
  is_tablet_visible: true,
  parent_id: null,
};

interface MenuEditorProps {
  onBackToManagement?: () => void;
  tabSwitcher?: React.ReactNode;
}

export function MenuEditor({ onBackToManagement, tabSwitcher }: MenuEditorProps) {
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
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [allSpaces, setAllSpaces] = useState<Space[]>([]);

  const loadItems = useCallback(async () => {
    const { data } = await supabase
      .from('inventory')
      .select('*, linked_space:spaces!inventory_linked_space_id_fkey(id, name, type, hourly_rate, is_active)')
      .order('sort_order', { ascending: true })
      .order('name');
    if (data) {
      const items = (data as any[]).map((item) => ({
        ...item,
        linked_space: Array.isArray(item.linked_space) ? item.linked_space[0] || null : item.linked_space || null,
      })) as InventoryItem[];
      setItems(items);
    }
  }, []);

  const loadSpaces = useCallback(async () => {
    const { data } = await supabase.from('spaces').select('*').eq('is_active', true);
    if (data) setAllSpaces(data as Space[]);
  }, []);

  useEffect(() => {
    loadItems().then(() => setIsLoading(false));
    loadSpaces();
  }, [loadItems, loadSpaces]);

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
    const isService = item.is_service === true;
    setForm({
      name: item.name,
      price: String(item.price),
      category: item.category,
      is_service: isService,
      track_stock: isService ? false : (item.track_stock !== false),
      min_threshold: String(item.min_threshold),
      is_active: item.is_active,
      is_top: item.is_top ?? false,
      is_tablet_visible: item.is_tablet_visible ?? true,
      image_url: item.image_url || '',
      search_tags: (item.search_tags || []).join(', '),
      linked_space_id: item.linked_space_id || '',
      hourly_rate: item.linked_space?.hourly_rate != null ? String(item.linked_space.hourly_rate) : '',
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
      is_service: form.is_service,
      track_stock: form.is_service ? false : form.track_stock,
      min_threshold: form.is_service || !form.track_stock ? 0 : Number(form.min_threshold) || 0,
      is_active: form.is_active,
      is_top: form.is_top,
      is_tablet_visible: form.is_tablet_visible,
      image_url: form.image_url || null,
      search_tags: tags,
      linked_space_id: form.linked_space_id || null,
    };
    // If linked to a space, also update the space's hourly_rate
    if (form.linked_space_id && form.hourly_rate) {
      await supabase.from('spaces').update({ hourly_rate: Number(form.hourly_rate) }).eq('id', form.linked_space_id);
    }
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    })
  );

  const handleDndDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = directItems.findIndex((i) => i.id === active.id);
      const newIndex = directItems.findIndex((i) => i.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return;
      hapticFeedback('light');
      const reordered = arrayMove(directItems, oldIndex, newIndex);
      await Promise.all(
        reordered.map((item, idx) =>
          supabase.from('inventory').update({ sort_order: idx * 10 }).eq('id', item.id)
        )
      );
      loadItems();
    },
    [directItems, loadItems]
  );

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
      is_tablet_visible: cat.is_tablet_visible ?? true,
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
      is_tablet_visible: catForm.is_tablet_visible,
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
          {isRoot && onBackToManagement ? (
            <button
              onClick={onBackToManagement}
              className="p-2 sm:p-2.5 rounded-xl sm:rounded-2xl bg-[var(--c-surface)] border border-[var(--c-border)] active:scale-95 transition-all shrink-0"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 text-[var(--c-hint)]" />
            </button>
          ) : !isRoot && (
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
                {onBackToManagement && (
                  <>
                    <button onClick={onBackToManagement} className="hover:text-[var(--c-text)] transition-colors">Управление</button>
                    <ChevronRight className="w-3 h-3 shrink-0" />
                  </>
                )}
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

      {tabSwitcher}

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
              isReorderMode={false}
              isDragging={false}
              onDragStart={() => {}}
              onDragEnd={() => {}}
              onDragOver={() => {}}
              onDragEnter={() => {}}
              onDrop={() => {}}
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
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); openEditCategory(cat); }}
                            className="p-2 bg-white/10 text-white/60 hover:text-white rounded-xl transition-colors border border-white/10 active:scale-90"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteCatTarget(cat); }}
                            className="p-2 bg-white/10 text-white/60 hover:text-red-400 rounded-xl transition-colors border border-white/10 active:scale-90"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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
              {currentCategory && (
                <div className="flex flex-col items-end gap-1 mt-2 mb-1">
                  <button
                    onClick={() => { setIsReorderMode((v) => !v); hapticFeedback('light'); }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 border ${
                      isReorderMode
                        ? 'bg-[var(--c-accent)] text-white border-[var(--c-accent)]'
                        : 'bg-[var(--c-surface)] border-[var(--c-border)] text-[var(--c-hint)] hover:text-[var(--c-text)]'
                    }`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    {isReorderMode ? 'Готово' : 'Порядок'}
                  </button>
                  {isReorderMode && (
                    <span className="text-[10px] text-[var(--c-muted)]">Удерживайте карточку и перетаскивайте</span>
                  )}
                </div>
              )}
              <div className="grid gap-2.5 sm:gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {!!currentCategory && isReorderMode ? (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDndDragEnd}
                  >
                    <SortableContext
                      items={directItems.map((i) => i.id)}
                      strategy={rectSortingStrategy}
                    >
                      {directItems.map((item) => (
                        <SortableItemCard
                          key={item.id}
                          item={item}
                          categories={categories}
                          onEdit={openEdit}
                          onToggle={toggleActive}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                ) : (
                  directItems.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      categories={categories}
                      onEdit={openEdit}
                      onToggle={toggleActive}
                      isReorderMode={false}
                      isDragging={false}
                      onDragStart={() => {}}
                      onDragEnd={() => {}}
                      onDragOver={() => {}}
                      onDragEnter={() => {}}
                      onDrop={() => {}}
                    />
                  ))
                )}
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

            {/* ═══════ НАСТРОЙКИ ═══════ */}
            <div className="space-y-3">
              <label className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] ml-1">Настройки</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* Тип: Товар / Услуга */}
                <button
                  type="button"
                  onClick={() => {
                    const nextService = !form.is_service;
                    setForm((prev) => ({ ...prev, is_service: nextService, track_stock: nextService ? false : true }));
                  }}
                  className={`p-3.5 rounded-2xl flex items-center gap-3 transition-all active:scale-[0.98] border ${
                    form.is_service ? 'bg-violet-500/10 border-violet-500/25' : 'bg-sky-500/10 border-sky-500/25'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-lg ${
                    form.is_service ? 'bg-violet-500/20' : 'bg-sky-500/20'
                  }`}>
                    {form.is_service ? '🎮' : '📦'}
                  </div>
                  <div className="flex flex-col text-left min-w-0">
                    <span className={`text-sm font-bold ${form.is_service ? 'text-violet-400' : 'text-sky-400'}`}>
                      {form.is_service ? 'Услуга' : 'Товар'}
                    </span>
                    <span className="text-[10px] text-slate-500 truncate">{form.is_service ? 'Без складского учёта' : 'Складской учёт'}</span>
                  </div>
                </button>

                {/* Учёт остатков (только товар) */}
                {!form.is_service && (
                  <button
                    type="button"
                    onClick={() => updateField('track_stock', !form.track_stock)}
                    className={`p-3.5 rounded-2xl flex items-center gap-3 transition-all active:scale-[0.98] border ${
                      form.track_stock ? 'bg-emerald-500/10 border-emerald-500/25' : 'bg-slate-800/50 border-slate-700/50'
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-lg ${
                      form.track_stock ? 'bg-emerald-500/20' : 'bg-slate-700/30'
                    }`}>
                      📊
                    </div>
                    <div className="flex flex-col text-left min-w-0">
                      <span className={`text-sm font-bold ${form.track_stock ? 'text-emerald-400' : 'text-slate-400'}`}>
                        {form.track_stock ? 'Учёт остатков' : 'Без учёта'}
                      </span>
                      <span className="text-[10px] text-slate-500 truncate">{form.track_stock ? 'Списание при продаже' : 'Нет отслеживания'}</span>
                    </div>
                  </button>
                )}

                {/* Топ-позиция */}
                <button
                  type="button"
                  onClick={() => updateField('is_top', !form.is_top)}
                  className={`p-3.5 rounded-2xl flex items-center gap-3 transition-all active:scale-[0.98] border ${
                    form.is_top ? 'bg-amber-500/10 border-amber-500/25' : 'bg-slate-800/50 border-slate-700/50'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-lg ${
                    form.is_top ? 'bg-amber-500/20' : 'bg-slate-700/30'
                  }`}>
                    {form.is_top ? '⭐' : '☆'}
                  </div>
                  <div className="flex flex-col text-left min-w-0">
                    <span className={`text-sm font-bold ${form.is_top ? 'text-amber-400' : 'text-slate-400'}`}>
                      {form.is_top ? 'Топ-позиция' : 'Обычная'}
                    </span>
                    <span className="text-[10px] text-slate-500 truncate">Первая в POS меню</span>
                  </div>
                </button>

                {/* Планшет клиента */}
                <button
                  type="button"
                  onClick={() => updateField('is_tablet_visible', !form.is_tablet_visible)}
                  className={`p-3.5 rounded-2xl flex items-center gap-3 transition-all active:scale-[0.98] border ${
                    form.is_tablet_visible ? 'bg-purple-500/10 border-purple-500/25' : 'bg-slate-800/50 border-slate-700/50'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-lg ${
                    form.is_tablet_visible ? 'bg-purple-500/20' : 'bg-slate-700/30'
                  }`}>
                    {form.is_tablet_visible ? '📱' : '🚫'}
                  </div>
                  <div className="flex flex-col text-left min-w-0">
                    <span className={`text-sm font-bold ${form.is_tablet_visible ? 'text-purple-400' : 'text-slate-400'}`}>
                      {form.is_tablet_visible ? 'На планшете' : 'Скрыто'}
                    </span>
                    <span className="text-[10px] text-slate-500 truncate">Клиенты {form.is_tablet_visible ? 'видят' : 'не видят'}</span>
                  </div>
                </button>

                {/* Активна / Скрыта */}
                <button
                  type="button"
                  onClick={() => updateField('is_active', !form.is_active)}
                  className={`p-3.5 rounded-2xl flex items-center gap-3 transition-all active:scale-[0.98] border ${
                    form.is_active ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/10 border-red-500/25'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-lg ${
                    form.is_active ? 'bg-emerald-500/15' : 'bg-red-500/15'
                  }`}>
                    {form.is_active ? '✅' : '❌'}
                  </div>
                  <div className="flex flex-col text-left min-w-0">
                    <span className={`text-sm font-bold ${form.is_active ? 'text-emerald-400' : 'text-red-400'}`}>
                      {form.is_active ? 'Активна' : 'Отключена'}
                    </span>
                    <span className="text-[10px] text-slate-500 truncate">{form.is_active ? 'Видна везде' : 'Скрыта из POS и планшета'}</span>
                  </div>
                </button>
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
                  disabled={form.is_service || !form.track_stock}
                  className={`w-full bg-slate-900/50 border border-slate-800 rounded-2xl py-3 px-5 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all font-bold ${form.is_service || !form.track_stock ? 'opacity-50 cursor-not-allowed' : 'text-white'}`}
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

            {/* Привязка к кабинке / залу */}
            {form.is_service && (
              <div className="space-y-4">
                <label className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] ml-1">Привязка к кабинке / залу</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => { updateField('linked_space_id', ''); updateField('hourly_rate', ''); }}
                    className={`px-5 py-3 rounded-2xl border transition-all font-bold text-sm ${
                      !form.linked_space_id ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20' : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    Нет
                  </button>
                  {allSpaces.map((sp) => (
                    <button
                      key={sp.id}
                      type="button"
                      onClick={() => { updateField('linked_space_id', sp.id); updateField('hourly_rate', String(sp.hourly_rate || 0)); }}
                      className={`px-5 py-3 rounded-2xl border transition-all font-bold text-sm ${
                        form.linked_space_id === sp.id ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20' : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      {sp.name}
                    </button>
                  ))}
                </div>
                {form.linked_space_id && (
                  <div className="space-y-3">
                    <label className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] ml-1">Ставка (₽/час)</label>
                    <input
                      type="number"
                      value={form.hourly_rate}
                      onChange={(e) => updateField('hourly_rate', e.target.value)}
                      placeholder="0"
                      min={0}
                      className="w-full bg-slate-900/50 border border-slate-800 rounded-2xl py-4 px-5 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all text-indigo-400 font-black text-xl"
                    />
                  </div>
                )}
              </div>
            )}

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

// ============ SORTABLE ITEM CARD (touch + mouse drag on iOS/desktop) ============

function SortableItemCard({
  item,
  categories,
  onEdit,
  onToggle,
}: {
  item: InventoryItem;
  categories: MenuCategory[];
  onEdit: (item: InventoryItem) => void;
  onToggle: (item: InventoryItem) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    touchAction: 'manipulation' as const,
    WebkitTouchCallout: 'none' as const,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="touch-manipulation cursor-grab active:cursor-grabbing select-none">
      <ItemCard
        item={item}
        categories={categories}
        onEdit={onEdit}
        onToggle={onToggle}
        isReorderMode={true}
        isDragging={isDragging}
        onDragStart={() => {}}
        onDragEnd={() => {}}
        onDragOver={() => {}}
        onDragEnter={() => {}}
        onDrop={() => {}}
      />
    </div>
  );
}

// ============ ITEM CARD ============

function ItemCard({
  item,
  categories,
  onEdit,
  onToggle,
  isReorderMode,
  isDragging,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragEnter,
  onDrop,
}: {
  item: InventoryItem;
  categories: MenuCategory[];
  onEdit: (item: InventoryItem) => void;
  onToggle: (item: InventoryItem) => void;
  isReorderMode: boolean;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnter: (e: React.DragEvent) => void;
  onDrop: () => void;
}) {
  const cat = categories.find((c) => c.slug === item.category);
  const CatIcon = getIconComponent(cat?.icon_name || 'Package');
  const colorCfg = getCategoryColorConfig(cat?.color);
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div
      draggable={isReorderMode}
      onDragStart={isReorderMode ? onDragStart : undefined}
      onDragEnd={isReorderMode ? onDragEnd : undefined}
      onDragOver={isReorderMode ? onDragOver : undefined}
      onDragEnter={isReorderMode ? onDragEnter : undefined}
      onDrop={isReorderMode ? (e) => { e.preventDefault(); e.stopPropagation(); onDrop(); } : undefined}
      className={`group rounded-[16px] sm:rounded-[22px] p-3 sm:p-5 flex flex-col justify-between transition-all duration-200 border border-[var(--c-border)] hover:border-[var(--c-accent)]/30 bg-[var(--c-surface)] ${!item.is_active ? 'opacity-50' : ''} ${
        isReorderMode ? 'cursor-grab active:cursor-grabbing' : ''
      } ${isDragging ? 'opacity-50 scale-95' : ''}`}
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
          {!isReorderMode && (
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
          )}
        </div>
      </div>

      <div
        className={isReorderMode ? '' : 'cursor-pointer'}
        onClick={isReorderMode ? undefined : () => onEdit(item)}
      >
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
          {item.is_service ? (
            <span className="text-[9px] sm:text-[10px] font-bold text-[var(--c-muted)] px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl border border-[var(--c-border)]">
              Услуга
            </span>
          ) : item.track_stock !== false ? (
            item.min_threshold > 0 ? (
              <span className={`text-[9px] sm:text-[10px] font-black uppercase tracking-widest px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl border ${
                item.stock_quantity < item.min_threshold
                  ? 'bg-red-500/10 text-red-400 border-red-500/20'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              }`}>
                {item.stock_quantity} шт.
              </span>
            ) : (
              <span className="text-[9px] sm:text-[10px] font-bold text-[var(--c-muted)] px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl border border-[var(--c-border)]">
                {item.stock_quantity} шт.
              </span>
            )
          ) : (
            <span className="text-[9px] sm:text-[10px] font-bold text-[var(--c-muted)] px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl border border-[var(--c-border)]">
              Без учёта
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

        <div>
          <button
            type="button"
            onClick={() => setForm((prev) => ({ ...prev, is_tablet_visible: !prev.is_tablet_visible }))}
            className={`w-full p-3.5 rounded-2xl flex items-center gap-3 transition-all active:scale-[0.98] border ${
              form.is_tablet_visible ? 'bg-purple-500/10 border-purple-500/25' : 'bg-red-500/10 border-red-500/25'
            }`}
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-lg ${
              form.is_tablet_visible ? 'bg-purple-500/20' : 'bg-red-500/15'
            }`}>
              {form.is_tablet_visible ? '📱' : '🚫'}
            </div>
            <div className="flex flex-col text-left min-w-0 flex-1">
              <span className={`text-sm font-bold ${form.is_tablet_visible ? 'text-purple-400' : 'text-red-400'}`}>
                {form.is_tablet_visible ? 'Видна на планшете' : 'Скрыта на планшете'}
              </span>
              <span className="text-[10px] text-[var(--c-muted)]">
                {form.is_tablet_visible ? 'Клиенты видят этот раздел и все позиции в нём' : 'Раздел и все его позиции скрыты от клиентов'}
              </span>
            </div>
          </button>
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
