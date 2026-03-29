import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { useTabletStore } from '@/store/tablet';
import { useAllMenuCategories, getIconComponent, getCategoryColorConfig } from '@/hooks/useMenuCategories';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { Plus, Minus, ShoppingCart, LogOut, ChevronLeft, Send, Check, Bell, Receipt, Clock, XCircle } from 'lucide-react';
import type { InventoryItem, MenuCategory } from '@/types';

export function TabletApp() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { 
    cart, comment, addComment, addToCart, removeFromCart, updateQuantity, submitOrder, isSubmitting,
    myOrders, currentCheckTotal, subscribeToMyOrders, callStaff
  } = useTabletStore();

  const { categories, loading: catLoading } = useAllMenuCategories();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);

  const [activeCategory, setActiveCategory] = useState<MenuCategory | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isMyOrdersOpen, setIsMyOrdersOpen] = useState(false);
  const [isCalling, setIsCalling] = useState<'waiter'|'check'|null>(null);
  const [spaceName, setSpaceName] = useState('Не привязано');

  useEffect(() => {
    if (user?.linked_space_id) {
      supabase.from('spaces').select('name').eq('id', user.linked_space_id).single().then(({data}) => {
        if (data) setSpaceName(data.name);
      });
    }
  }, [user?.linked_space_id]);

  useEffect(() => {
    if (user?.linked_space_id && user?.id) {
      return subscribeToMyOrders(user.linked_space_id, user.id);
    }
  }, [subscribeToMyOrders, user?.linked_space_id, user?.id]);

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

  // Identify direct items depending on selected category:
  // If activeCategory is set, show items matching that slug + subcategories slugs.
  // If activeCategory is null, maybe show "Top items" or root categories.
  // Actually, standard POS approach: if null, show root categories. If selected, show its subcats + items.

  const currentCats = activeCategory ? getSubcategories(activeCategory.id) : topCategories;

  const currentItems = activeCategory
    ? items.filter((i) => {
      if (i.category === activeCategory.slug) return true;
      const sub = getSubcategories(activeCategory.id).find((s) => s.slug === i.category);
      if (sub) return true;
      return false;
    })
    : items.filter((i) => i.is_top); // Show Top positions on root screen

  const totalPrice = cart.reduce((sum, c) => sum + (c.item.price * c.quantity), 0);
  const totalCount = cart.reduce((sum, c) => sum + c.quantity, 0);

  const handleOrder = async () => {
    if (!user?.linked_space_id || !user?.id) return;
    const ok = await submitOrder(user.linked_space_id, user.id);
    if (ok) setIsCartOpen(false);
  };

  const handleCall = async (type: 'waiter' | 'check') => {
    if (!user?.linked_space_id || !user?.id) return;
    setIsCalling(type);
    await callStaff(user.linked_space_id, user.id, type);
    setIsCalling(null);
  };

  if (catLoading || itemsLoading) return <ListSkeleton rows={5} />;

  return (
    <div className="flex flex-col h-screen bg-[var(--c-bg)] text-[var(--c-text)]">
      {/* HEADER */}
      <header className="px-4 py-3 sm:px-6 sm:py-4 border-b border-[var(--c-border)] bg-[var(--c-surface)] flex items-center justify-between shadow-sm z-10 sticky top-0">
        <div className="flex items-center gap-3">
          {activeCategory && (
            <button
              onClick={() => setActiveCategory(null)}
              className="p-2 sm:p-2.5 rounded-xl bg-[var(--c-bg)] border border-[var(--c-border)] active:scale-95 transition-transform"
            >
              <ChevronLeft className="w-5 h-5 text-[var(--c-hint)]" />
            </button>
          )}
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              {activeCategory ? activeCategory.name : 'Меню заведения'}
            </h1>
            <div className="flex items-center gap-2">
              <p className="text-[11px] sm:text-sm text-[var(--c-muted)] font-medium">Кабинка: {spaceName}</p>
              {currentCheckTotal !== null && currentCheckTotal > 0 && (
                <span className="text-[10px] sm:text-xs font-black bg-[var(--c-surface-hover)] border border-[var(--c-border)] px-2 py-0.5 rounded-full text-[var(--c-text)]">
                  Счёт: {currentCheckTotal} ₽
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsMyOrdersOpen(true)}
            className="p-3 sm:px-4 rounded-xl font-bold bg-[var(--c-bg)] border border-[var(--c-border)] text-[var(--c-hint)] hover:text-[var(--c-text)] active:scale-95 transition-all text-xs flex items-center gap-2"
          >
            <Clock className="w-4 h-4" />
            <span className="hidden sm:inline">Мои заказы</span>
            {myOrders.length > 0 && (
              <span className="bg-[var(--c-accent)] text-white shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-[10px]">{myOrders.length}</span>
            )}
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

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 pb-24">
        {/* CATEGORIES GRID */}
        {currentCats.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-black text-[var(--c-hint)] uppercase tracking-[0.2em] mb-4">
              Разделы
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {currentCats.map((cat) => {
                const Icon = getIconComponent(cat.icon_name);
                const colorCfg = getCategoryColorConfig(cat.color);
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat)}
                    className="relative group rounded-3xl p-4 sm:p-5 flex flex-col justify-between overflow-hidden transition-all duration-200 border border-[var(--c-border)] text-left hover:scale-[1.02] active:scale-[0.98]"
                    style={{ minHeight: '130px' }}
                  >
                    <div className={`absolute inset-0 ${colorCfg.bg} opacity-[0.85]`} />
                    <div className="relative z-10 flex flex-col h-full">
                      <div className={`w-12 h-12 mb-3 rounded-2xl flex items-center justify-center border ${colorCfg.text} bg-white shadow-sm ring-4 ring-white/30`}>
                        <Icon strokeWidth={2.5} className="w-6 h-6" />
                      </div>
                      <h3 className={`text-base sm:text-lg font-bold leading-tight ${colorCfg.text === 'text-white' ? 'text-white' : 'text-[var(--c-text)]'} drop-shadow-sm`}>
                        {cat.name}
                      </h3>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ITEMS GRID */}
        {currentItems.length > 0 && (
          <div>
            <h2 className="text-sm font-black text-[var(--c-hint)] uppercase tracking-[0.2em] mb-4">
              {activeCategory ? 'Позиции' : 'Популярное'}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {currentItems.map((item) => {
                const isOutOfStock = item.track_stock && item.stock_quantity <= 0;
                const inCart = cart.find((c) => c.item.id === item.id);
                return (
                  <div
                    key={item.id}
                    className={`flex flex-col rounded-3xl border p-3 shadow-sm transition-shadow relative overflow-hidden ${
                      isOutOfStock ? 'bg-[var(--c-bg)] border-[var(--c-border)] opacity-60 grayscale-[0.5]' : 'bg-[var(--c-surface)] border-[var(--c-border)] hover:shadow-md'
                    }`}
                  >
                    {isOutOfStock && (
                      <div className="absolute inset-x-0 top-1/3 z-10 flex justify-center -translate-y-1/2">
                        <span className="bg-red-500 text-white font-black uppercase tracking-widest text-[10px] px-3 py-1 rounded-xl shadow-lg border border-red-400 rotate-[-5deg]">
                          Нет в наличии
                        </span>
                      </div>
                    )}
                    
                    <div className="flex-1 flex flex-col justify-between p-1 mt-2">
                      <h3 className="font-bold text-sm sm:text-base leading-tight text-[var(--c-text)] mb-2">
                        {item.name}
                      </h3>
                      <p className="text-lg font-black text-[var(--c-accent)]">
                        {item.price} ₽
                      </p>
                    </div>

                    <div className="mt-3">
                      {inCart ? (
                        <div className="flex items-center justify-between bg-[var(--c-bg)] rounded-xl border border-[var(--c-border)] p-1">
                          <button
                            onClick={() => updateQuantity(item.id, inCart.quantity - 1)}
                            className="w-10 h-10 flex items-center justify-center rounded-lg bg-[var(--c-surface)] text-[var(--c-hint)] active:scale-90 transition-all shadow-sm"
                          >
                            <Minus strokeWidth={3} className="w-4 h-4" />
                          </button>
                          <span className="font-black text-lg w-8 text-center">{inCart.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.id, inCart.quantity + 1)}
                            className="w-10 h-10 flex items-center justify-center rounded-lg bg-[var(--c-accent)] text-white active:scale-90 transition-all shadow-sm"
                          >
                            <Plus strokeWidth={3} className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => addToCart(item)}
                          disabled={isOutOfStock}
                          className={`w-full h-12 rounded-xl border-2 active:scale-[0.98] transition-all font-bold text-sm flex items-center justify-center gap-2 ${
                            isOutOfStock 
                              ? 'bg-[var(--c-bg)] border-[var(--c-border)] text-[var(--c-muted)]' 
                              : 'bg-[var(--c-surface)] border-[var(--c-border)] active:bg-[var(--c-surface-hover)] text-[var(--c-text)]'
                          }`}
                        >
                          <Plus className="w-5 h-5" />
                          В корзину
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {currentCats.length === 0 && currentItems.length === 0 && (
          <div className="text-center py-20">
            <ShoppingCart className="w-16 h-16 mx-auto text-[var(--c-muted)] mb-4" />
            <p className="text-xl font-bold text-[var(--c-hint)]">В этом разделе пока ничего нет</p>
          </div>
        )}
      </main>

      {/* SERVICE BUTTONS (Call Waiter / Ask for Check) */}
      <div className="fixed bottom-24 right-4 sm:bottom-6 sm:right-6 sm:left-auto flex flex-col gap-3 z-30 pointer-events-none">
        <button
          onClick={() => handleCall('check')}
          disabled={isCalling === 'check'}
          className="pointer-events-auto flex items-center justify-center bg-emerald-500 hover:bg-emerald-600 active:scale-90 text-white shadow-lg p-3 sm:p-4 rounded-2xl sm:rounded-full transition-all group"
        >
          {isCalling === 'check' ? <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Receipt className="w-6 h-6 sm:w-7 sm:h-7" />}
          <span className="ml-0 w-0 overflow-hidden opacity-0 group-hover:w-auto group-hover:ml-3 group-hover:opacity-100 whitespace-nowrap font-bold text-sm transition-all hidden sm:inline-flex">Попросить счёт</span>
        </button>
        <button
          onClick={() => handleCall('waiter')}
          disabled={isCalling === 'waiter'}
          className="pointer-events-auto flex items-center justify-center bg-indigo-500 hover:bg-indigo-600 active:scale-90 text-white shadow-lg p-3 sm:p-4 rounded-2xl sm:rounded-full transition-all group"
        >
          {isCalling === 'waiter' ? <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Bell className="w-6 h-6 sm:w-7 sm:h-7" />}
          <span className="ml-0 w-0 overflow-hidden opacity-0 group-hover:w-auto group-hover:ml-3 group-hover:opacity-100 whitespace-nowrap font-bold text-sm transition-all hidden sm:inline-flex">Вызвать персонал</span>
        </button>
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
               disabled={isSubmitting || cart.length === 0 || !user?.linked_space_id}
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
          </div>
        </div>
      </Drawer>

      {/* MY ORDERS DRAWER */}
      <Drawer
        open={isMyOrdersOpen}
        onClose={() => setIsMyOrdersOpen(false)}
        title="Мои текущие заказы"
        size="md"
      >
        <div className="flex flex-col h-full -mx-6 -mb-6 sm:-mx-10 sm:-mb-10 bg-[var(--c-bg)]">
          <div className="flex-1 overflow-y-auto px-6 sm:px-10 py-6 space-y-4">
            {myOrders.length === 0 ? (
              <div className="text-center py-20">
                <Clock className="w-12 h-12 text-[var(--c-border)] mx-auto mb-4" />
                <p className="text-[var(--c-hint)] font-medium">Вы еще ничего не заказывали</p>
              </div>
            ) : (
              myOrders.map(order => {
                const isSpecial = order.comment?.startsWith('[');
                return (
                  <div key={order.id} className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-2xl p-4 shadow-sm">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        {isSpecial ? (
                          <h4 className="font-bold text-[var(--c-text)] text-sm">{order.comment}</h4>
                        ) : (
                          <h4 className="font-bold text-[var(--c-text)] text-sm">Заказ от {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</h4>
                        )}
                        <p className="text-[10px] text-[var(--c-muted)] mt-1 tracking-wider uppercase">Оформил: {user?.nickname}</p>
                      </div>
                      <div className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${
                        order.status === 'pending' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 
                        order.status === 'accepted' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 
                        'bg-red-500/10 text-red-500 border-red-500/20'
                      }`}>
                        {order.status === 'pending' ? 'В обработке' : order.status === 'accepted' ? 'Заказ принят' : 'Отклонён'}
                      </div>
                    </div>
                    
                    {!isSpecial && order.items && order.items.length > 0 && (
                      <div className="space-y-2 mt-2 pt-2 border-t border-[var(--c-border)]">
                        {order.items.map(item => (
                          <div key={item.id} className="flex justify-between text-xs sm:text-sm">
                            <span className="text-[var(--c-hint)]">{item.item?.name} <span className="text-[var(--c-muted)]">×{item.quantity}</span></span>
                            <span className="font-bold text-[var(--c-text)]">{(item.item?.price || 0) * item.quantity} ₽</span>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {!isSpecial && order.comment && (
                      <div className="mt-3 text-xs bg-[var(--c-bg)] p-2 rounded-lg border border-[var(--c-border)] text-[var(--c-hint)]">
                        <span className="font-bold text-[var(--c-text)]">Вы:</span> {order.comment}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </Drawer>
    </div>
  );
}
