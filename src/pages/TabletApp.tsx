import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { useTabletStore } from '@/store/tablet';
import { useAllMenuCategories, getIconComponent, getCategoryColorConfig } from '@/hooks/useMenuCategories';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { Plus, Minus, ShoppingCart, ShoppingBag, LogOut, Send, Check, XCircle, ClipboardList, Ban, Search } from 'lucide-react';
import type { InventoryItem, MenuCategory } from '@/types';

export function TabletApp() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { 
    cart, comment, addComment, addToCart, removeFromCart, updateQuantity, submitOrder, isSubmitting,
    currentCheckTotal, currentCheckItems, hasOpenCheck, subscribeToSpace,
    orderSentMessage, dismissOrderSent, loadCheckItems,
  } = useTabletStore();

  const { categories, loading: catLoading } = useAllMenuCategories();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);

  const [activeCategory, setActiveCategory] = useState<MenuCategory | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckViewOpen, setIsCheckViewOpen] = useState(false);
  const [spaceName, setSpaceName] = useState('Не привязано');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (user?.linked_space_id) {
      supabase.from('spaces').select('name').eq('id', user.linked_space_id).single().then(({data}) => {
        if (data) setSpaceName(data.name);
      });
    }
  }, [user?.linked_space_id]);

  useEffect(() => {
    if (user?.linked_space_id && user?.id) {
      return subscribeToSpace(user.linked_space_id, user.id);
    }
  }, [subscribeToSpace, user?.linked_space_id, user?.id]);

  useEffect(() => {
    async function loadItems() {
      const { data } = await supabase
        .from('inventory')
        .select('*')
        .eq('is_active', true)
        .eq('is_tablet_visible', true)
        .order('sort_order', { ascending: true })
        .order('name');
      if (data) setItems(data as InventoryItem[]);
      setItemsLoading(false);
    }
    loadItems();
  }, []);

  const visibleCategories = categories.filter((c) => c.is_tablet_visible !== false);
  const topCategories = visibleCategories.filter((c) => !c.parent_id);
  const getSubcategories = (parentId: string) => visibleCategories.filter((c) => c.parent_id === parentId);

  // Filter by category
  const categoryFiltered = activeCategory
    ? items.filter((i) => {
      if (i.category === activeCategory.slug) return true;
      const subs = getSubcategories(activeCategory.id);
      return subs.some((s) => s.slug === i.category);
    })
    : items;

  // Filter by search query (name + search_tags)
  const q = searchQuery.trim().toLowerCase();
  const currentItems = q
    ? categoryFiltered.filter((i) =>
        i.name.toLowerCase().includes(q) ||
        (i.search_tags || []).some((t) => t.toLowerCase().includes(q))
      )
    : categoryFiltered;

  const totalPrice = cart.reduce((sum, c) => sum + (c.item.price * c.quantity), 0);
  const totalCount = cart.reduce((sum, c) => sum + c.quantity, 0);

  const handleOrder = async () => {
    if (!user?.linked_space_id || !user?.id) return;
    const ok = await submitOrder(user.linked_space_id, user.id);
    if (ok) setIsCartOpen(false);
  };



  const handleOpenCheckView = () => {
    if (user?.linked_space_id) {
      loadCheckItems(user.linked_space_id);
    }
    setIsCheckViewOpen(true);
  };

  const checkItemsTotal = currentCheckItems.reduce((sum, ci) => sum + ci.price_at_time * ci.quantity, 0);

  if (catLoading || itemsLoading) return <ListSkeleton rows={5} />;

  // If no open check, show blocking screen
  if (!hasOpenCheck && user?.linked_space_id) {
    return (
      <div className="flex flex-col h-screen bg-[var(--c-bg)] text-[var(--c-text)]">
        <header className="px-4 py-3 sm:px-6 sm:py-4 border-b border-[var(--c-border)] bg-[var(--c-surface)] flex items-center justify-between shadow-sm">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">Меню заведения</h1>
            <p className="text-[11px] sm:text-sm text-[var(--c-muted)] font-medium">Кабинка: {spaceName}</p>
          </div>
          <button
            onClick={logout}
            className="p-3 sm:px-4 rounded-xl font-bold bg-[var(--c-bg)] border border-[var(--c-border)] text-[var(--c-hint)] hover:text-red-400 active:scale-95 transition-all text-xs flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Выход</span>
          </button>
        </header>
        <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="w-20 h-20 rounded-full bg-amber-500/10 flex items-center justify-center mb-6">
            <Ban className="w-10 h-10 text-amber-500" />
          </div>
          <h2 className="text-2xl font-black text-[var(--c-text)] mb-3">Счёт ещё не открыт</h2>
          <p className="text-[var(--c-muted)] text-sm max-w-sm leading-relaxed">
            Заказы станут доступны после того, как персонал откроет счёт для вашей кабинки. Пожалуйста, подождите.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[var(--c-bg)] text-[var(--c-text)]">
      {/* ORDER SENT TOAST */}
      {orderSentMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-[slideDown_0.3s_ease] max-w-[90%] sm:max-w-md">
          <div className="flex items-center gap-3 bg-emerald-500 text-white px-5 py-3.5 rounded-2xl shadow-2xl font-bold text-sm">
            <Check className="w-5 h-5 shrink-0" />
            <span className="flex-1">{orderSentMessage}</span>
            <button onClick={dismissOrderSent} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* HEADER */}
      <header className="px-4 py-3 sm:px-6 sm:py-4 border-b border-[var(--c-border)] bg-[var(--c-surface)] flex items-center justify-between shadow-sm z-10 shrink-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">Меню заведения</h1>
          <div className="flex items-center gap-2">
            <p className="text-[11px] sm:text-sm text-[var(--c-muted)] font-medium">Кабинка: {spaceName}</p>
            {currentCheckTotal !== null && currentCheckTotal > 0 && (
              <span className="text-[10px] sm:text-xs font-black bg-[var(--c-surface-hover)] border border-[var(--c-border)] px-2 py-0.5 rounded-full text-[var(--c-text)]">
                Счёт: {currentCheckTotal} ₽
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenCheckView}
            className="p-3 sm:px-4 rounded-xl font-bold bg-[var(--c-bg)] border border-[var(--c-border)] text-[var(--c-hint)] hover:text-[var(--c-text)] active:scale-95 transition-all text-xs flex items-center gap-2"
          >
            <ClipboardList className="w-4 h-4" />
            <span className="hidden sm:inline">Текущий счёт</span>
          </button>
          <button
            onClick={logout}
            className="p-3 sm:px-4 rounded-xl font-bold bg-[var(--c-bg)] border border-[var(--c-border)] text-[var(--c-hint)] hover:text-red-400 active:scale-95 transition-all text-xs flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Выход</span>
          </button>
        </div>
      </header>

      {/* MAIN: SIDEBAR + CONTENT */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* SIDEBAR — Categories */}
        <nav className="shrink-0 w-[140px] sm:w-[170px] bg-[var(--c-surface)] border-r border-[var(--c-border)] overflow-y-auto py-3 flex flex-col gap-1 px-2">
          {/* Search */}
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск..."
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-2.5 text-xs text-white placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all"
            />
          </div>
          {/* "Все" category */}
          <button
            onClick={() => setActiveCategory(null)}
            className={`flex items-center gap-2.5 w-full px-3 py-3 rounded-xl transition-all duration-300 border shrink-0 ${
              !activeCategory
                ? 'bg-white/20 border-transparent shadow-lg scale-[1.02]'
                : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04]'
            }`}
          >
            <div className={`p-1.5 rounded-lg transition-all ${!activeCategory ? 'bg-white/20 shadow-inner' : 'bg-white/5'}`}>
              <ShoppingBag className={`w-4 h-4 ${!activeCategory ? 'text-white' : 'text-slate-400'}`} />
            </div>
            <span className={`text-[11px] sm:text-xs font-black uppercase tracking-[0.1em] truncate ${!activeCategory ? 'text-white' : 'text-white/30'}`}>
              Все
            </span>
          </button>

          {topCategories.map((cat) => {
            const CatIcon = getIconComponent(cat.icon_name);
            const colors = getCategoryColorConfig(cat.color);
            const isActive = activeCategory?.id === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat)}
                className={`flex items-center gap-2.5 w-full px-3 py-3 rounded-xl transition-all duration-300 border shrink-0 ${
                  isActive
                    ? `${colors.active} border-transparent shadow-lg ${colors.glow} scale-[1.02]`
                    : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04]'
                }`}
              >
                <div className={`p-1.5 rounded-lg transition-all ${isActive ? 'bg-white/20 shadow-inner' : 'bg-white/5'}`}>
                  <CatIcon className={`w-4 h-4 ${isActive ? 'text-white' : colors.text}`} />
                </div>
                <span className={`text-[11px] sm:text-xs font-black uppercase tracking-[0.1em] truncate ${isActive ? 'text-white' : 'text-white/30'}`}>
                  {cat.name}
                </span>
              </button>
            );
          })}
        </nav>

        {/* CONTENT — Items grid */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 pb-28">
          {currentItems.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {currentItems.map((item) => {
                const isOutOfStock = item.track_stock && item.stock_quantity <= 0;
                const inCart = cart.find((c) => c.item.id === item.id);
                const cat = categories.find((c) => c.slug === item.category);
                const colorCfg = getCategoryColorConfig(cat?.color);
                const CatIcon = getIconComponent(cat?.icon_name || '');
                return (
                  <div
                    key={item.id}
                    className={`group relative transition-all duration-300 rounded-2xl p-4 flex flex-col text-left min-h-[120px] overflow-hidden ${
                      isOutOfStock
                        ? 'opacity-40 grayscale pointer-events-none'
                        : inCart
                          ? `${colorCfg.bgActive} border border-white/12 shadow-[0_10px_30px_rgba(0,0,0,0.3)] ring-1 ring-white/12`
                          : `${colorCfg.bg} border border-white/5 hover:bg-white/[0.08] active:scale-[0.97]`
                    }`}
                  >
                    {/* Icon pattern background */}
                    <div className="absolute inset-0 pointer-events-none opacity-[0.08] overflow-hidden">
                      <div className="absolute left-1/2 top-1/2 w-[200%] grid gap-[1px]" style={{ gridTemplateColumns: 'repeat(8, 1fr)', gridTemplateRows: 'repeat(8, 1fr)', aspectRatio: '1', transform: 'translate(-50%, -50%) rotate(-45deg)' }}>
                        {Array.from({ length: 64 }).map((_, i) => (
                          <CatIcon key={i} className="w-6 h-6 text-white place-self-center" strokeWidth={1.5} />
                        ))}
                      </div>
                    </div>

                    {isOutOfStock && (
                      <div className="absolute inset-x-0 top-1/3 z-20 flex justify-center -translate-y-1/2">
                        <span className="bg-red-500 text-white font-black uppercase tracking-widest text-[10px] px-3 py-1 rounded-xl shadow-lg border border-red-400 rotate-[-5deg]">
                          Нет в наличии
                        </span>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => !isOutOfStock && addToCart(item)}
                      disabled={isOutOfStock}
                      className="relative z-10 flex-1 flex flex-col min-w-0 min-h-0"
                    >
                      {/* Category label + quantity badge */}
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex items-center gap-1 min-w-0">
                          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${colorCfg.active} shadow-[0_0_6px_rgba(255,255,255,0.1)]`} />
                          <span className={`text-[8px] font-black uppercase tracking-[0.15em] truncate ${colorCfg.text}`}>
                            {cat?.name || ''}
                          </span>
                        </div>
                        {inCart && (
                          <button
                            onClick={(e) => { e.stopPropagation(); removeFromCart(item.id); }}
                            className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/10 border border-white/10 hover:bg-white/20 active:scale-90 transition-all"
                          >
                            <Minus className="w-3.5 h-3.5 text-white/70" />
                            <span className="text-xs font-black text-white tabular-nums">{inCart.quantity}</span>
                          </button>
                        )}
                      </div>

                      {/* Item name */}
                      <h3 className="text-[15px] sm:text-base font-black uppercase tracking-tighter text-white/90 line-clamp-2 leading-snug mb-auto text-left w-full">
                        {item.name}
                      </h3>

                      {/* Price */}
                      <div className="flex justify-end mt-2">
                        <span className="text-base sm:text-lg font-black text-white tracking-tighter tabular-nums">
                          {new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(item.price)}₽
                        </span>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-20">
              <ShoppingCart className="w-16 h-16 mx-auto text-[var(--c-muted)] mb-4" />
              <p className="text-xl font-bold text-[var(--c-hint)]">В этом разделе пока ничего нет</p>
            </div>
          )}
        </main>
      </div>



      {/* FLOATING CART BUTTON */}
      {totalCount > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] sm:w-[400px] z-20">
          <button
            onClick={() => setIsCartOpen(true)}
            className="w-full relative overflow-hidden flex items-center p-4 rounded-3xl font-extrabold text-white transition-all active:scale-[0.98] shadow-2xl [background:linear-gradient(135deg,#6366f1,#8b5cf6)]"
          >
            <div className="absolute inset-0 bg-white/10" />
            <div className="relative z-10 flex-1 flex items-center justify-between">
              <span className="flex items-center gap-3 text-lg">
                <ShoppingCart className="w-6 h-6" />
                <span>Корзина ({totalCount})</span>
              </span>
              <span className="text-xl [text-shadow:0_2px_4px_rgba(0,0,0,0.2)]">{totalPrice} ₽</span>
            </div>
          </button>
        </div>
      )}

      {/* CART DRAWER */}
      <Drawer
        open={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        title="Ваш заказ"
        subtitle={`Кабинка: ${spaceName}`}
      >
        <div className="flex flex-col h-full -mx-6 -mb-6 sm:-mx-10 sm:-mb-10">
          <div className="flex-1 overflow-y-auto px-6 sm:px-10 py-4 space-y-4">
            {cart.map((c) => (
              <div key={c.item.id} className="flex items-center justify-between py-2 border-b border-[var(--c-border)] last:border-0">
                <div className="flex-1 pr-4">
                  <h4 className="font-bold text-[var(--c-text)] text-sm sm:text-base leading-tight mb-1">{c.item.name}</h4>
                  <p className="text-[var(--c-muted)] font-medium text-xs sm:text-sm">{c.item.price} ₽ × {c.quantity}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-black text-[var(--c-text)] text-base whitespace-nowrap">{c.item.price * c.quantity} ₽</span>
                  <div className="flex items-center bg-[var(--c-surface)] rounded-xl border border-[var(--c-border)] p-1">
                    <button
                      onClick={() => updateQuantity(c.item.id, c.quantity - 1)}
                      className="w-10 h-10 flex items-center justify-center text-[var(--c-hint)] active:scale-95"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="font-bold w-6 text-center text-[var(--c-text)]">{c.quantity}</span>
                    <button
                      onClick={() => updateQuantity(c.item.id, c.quantity + 1)}
                      className="w-10 h-10 flex items-center justify-center text-[var(--c-text)] active:scale-95"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            
            {cart.length > 0 && (
              <div className="mt-6 pt-4 border-t border-[var(--c-border)] space-y-4">
                 <div>
                    <label className="text-[10px] font-black uppercase text-[var(--c-hint)] tracking-widest pl-1 mb-2 block">
                      Комментарий к заказу
                    </label>
                    <textarea 
                      value={comment}
                      onChange={(e) => addComment(e.target.value)}
                      placeholder="Например: Пожалуйста, без льда"
                      className="w-full bg-[var(--c-surface)] border border-[var(--c-border)] rounded-2xl p-4 text-[var(--c-text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--c-accent)] transition-all resize-none h-24"
                    />
                 </div>
              </div>
            )}
          </div>
          
          <div className="p-6 sm:p-10 bg-[var(--c-surface)] border-t border-[var(--c-border)]">
            <div className="flex items-center justify-between mb-6">
              <span className="text-[var(--c-hint)] font-semibold uppercase tracking-wider text-sm">Итого</span>
              <span className="text-3xl font-black text-[var(--c-text)]">{totalPrice} <span className="text-xl text-[var(--c-muted)]">₽</span></span>
            </div>
            <button
               onClick={handleOrder}
               disabled={isSubmitting || cart.length === 0 || !user?.linked_space_id || !hasOpenCheck}
               className="w-full h-16 rounded-3xl font-extrabold text-white flex items-center justify-center gap-3 transition-all active:scale-[0.98] shadow-xl disabled:opacity-50 [background:linear-gradient(135deg,#6366f1,#8b5cf6)]"
            >
              {isSubmitting ? (
                <>
                  <div className="w-6 h-6 border-4 border-white/20 border-t-white rounded-full animate-spin" />
                  Отправка...
                </>
              ) : (
                <>
                  <Send className="w-6 h-6" />
                  <span className="text-lg text-shadow-sm">Отправить заказ бармену</span>
                </>
              )}
            </button>
            {!user?.linked_space_id && (
               <p className="text-center text-red-500 text-xs mt-3 font-semibold">Нельзя сделать заказ: планшет не привязан к кабинке.</p>
            )}
            {user?.linked_space_id && !hasOpenCheck && (
               <p className="text-center text-amber-500 text-xs mt-3 font-semibold">Счёт ещё не открыт. Дождитесь открытия персоналом.</p>
            )}
          </div>
        </div>
      </Drawer>

      {/* CURRENT CHECK ITEMS DRAWER */}
      <Drawer
        open={isCheckViewOpen}
        onClose={() => setIsCheckViewOpen(false)}
        title="Текущий счёт"
        subtitle={`Кабинка: ${spaceName}`}
        size="md"
      >
        <div className="flex flex-col h-full -mx-6 -mb-6 sm:-mx-10 sm:-mb-10 bg-[var(--c-bg)]">
          <div className="flex-1 overflow-y-auto px-6 sm:px-10 py-6 space-y-3">
            {currentCheckItems.length === 0 ? (
              <div className="text-center py-20">
                <ClipboardList className="w-12 h-12 text-[var(--c-border)] mx-auto mb-4" />
                <p className="text-[var(--c-hint)] font-medium">Счёт пока пуст</p>
              </div>
            ) : (
              <>
                {currentCheckItems.map((ci) => (
                  <div key={ci.id} className="flex items-center justify-between py-3 border-b border-[var(--c-border)] last:border-0">
                    <div className="flex-1">
                      <h4 className="font-bold text-[var(--c-text)] text-sm">{ci.item?.name || 'Позиция'}</h4>
                      <p className="text-xs text-[var(--c-muted)]">{ci.price_at_time} ₽ × {ci.quantity}</p>
                    </div>
                    <span className="font-black text-[var(--c-text)] text-sm">{ci.price_at_time * ci.quantity} ₽</span>
                  </div>
                ))}
              </>
            )}
          </div>
          {currentCheckItems.length > 0 && (
            <div className="p-6 sm:p-10 bg-[var(--c-surface)] border-t border-[var(--c-border)]">
              <div className="flex items-center justify-between">
                <span className="text-[var(--c-hint)] font-semibold uppercase tracking-wider text-sm">Итого по счёту</span>
                <span className="text-2xl font-black text-[var(--c-text)]">{currentCheckTotal || checkItemsTotal} <span className="text-lg text-[var(--c-muted)]">₽</span></span>
              </div>
            </div>
          )}
        </div>
      </Drawer>

    </div>
  );
}
