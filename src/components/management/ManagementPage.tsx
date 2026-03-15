import { useState, useEffect, useCallback, useMemo, startTransition } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { hasPermission } from '@/lib/permissions';
import {
  Package, Truck, ClipboardList, Users, AlertTriangle, Wallet, Star, Banknote, UtensilsCrossed, UserCircle,
  ArrowLeft, Percent, Info, SlidersHorizontal, Ticket, Receipt, History, Filter, TrendingDown, Box, MoreVertical, Search, DollarSign, Bell,
} from 'lucide-react';
import type { InventoryItem } from '@/types';
import { SupplyPage } from '@/components/supply/SupplyPage';
import { RevisionPage } from './RevisionPage';
import { BonusManager } from './BonusManager';
import { InkassationPage } from './InkassationPage';
import { MenuEditor } from './MenuEditor';
import { ClientsManager } from './ClientsManager';
import { StaffManager } from './StaffManager';
import { DebtorsManager } from './DebtorsManager';
import { DiscountsManager } from './DiscountsManager';
import { AboutSystem } from './AboutSystem';
import { ModifiersManager } from './ModifiersManager';
import { CertificatesManager } from './CertificatesManager';
import { ExpensesManager } from './ExpensesManager';
import { SalaryManager } from './SalaryManager';
import { NotificationsManager } from './NotificationsManager';
import { useSwipeBack } from '@/hooks/useSwipeBack';
import { hapticFeedback } from '@/lib/telegram';
import { useLayoutStore, useHideNav, useHasHideReason, useSetHeader } from '@/store/layout';
import { TabSwitcher } from '@/components/ui/TabSwitcher';

type Screen = 'menu' | 'inventory' | 'supplies' | 'revision' | 'debtors' | 'staff' | 'bonus' | 'cash' | 'menuEditor' | 'clients' | 'discounts' | 'refunds' | 'modifiers' | 'certificates' | 'expenses' | 'salary' | 'notifications' | 'about';

const categoryLabels: Record<string, string> = {
  drinks: 'Напитки', food: 'Еда', bar: 'Снеки', hookah: 'Кальяны', services: 'Услуги',
};

type PermKey = import('@/types').ManagementPermissionKey;
const ALL_MENU_ITEMS: { id: Screen; label: string; desc: string; icon: typeof Package; color: string; permKey?: PermKey }[] = [
  { id: 'menuEditor', label: 'Меню', desc: 'Позиции, модификаторы, разделы', icon: UtensilsCrossed, color: 'bg-orange-500/10 text-orange-400', permKey: 'menu' },
  { id: 'inventory', label: 'Склад', desc: 'Контроль остатков и ревизии', icon: Package, color: 'bg-blue-500/10 text-blue-400', permKey: 'inventory' },
  { id: 'supplies', label: 'Поставки', desc: 'История и новые поставки', icon: Truck, color: 'bg-[var(--c-success-bg)] text-[var(--c-success)]', permKey: 'supplies' },
  { id: 'clients', label: 'Клиенты', desc: 'Профили, контакты, ДР', icon: UserCircle, color: 'bg-sky-500/10 text-sky-400', permKey: 'clients' },
  { id: 'discounts', label: 'Скидки', desc: 'Процентные и фиксированные', icon: Percent, color: 'bg-pink-500/10 text-pink-400', permKey: 'discounts' },
  { id: 'bonus', label: 'Бонусы', desc: 'Баллы и настройки', icon: Star, color: 'bg-yellow-500/10 text-yellow-400', permKey: 'bonus' },
  { id: 'certificates', label: 'Сертификаты', desc: 'Подарочные сертификаты', icon: Ticket, color: 'bg-[var(--c-warning-bg)] text-[var(--c-warning)]', permKey: 'bonus' },
  { id: 'cash', label: 'Инкассация', desc: 'Операции с наличными', icon: Banknote, color: 'bg-cyan-500/10 text-cyan-400' },
  { id: 'expenses', label: 'Расходы', desc: 'Аренда, коммуналка, зарплаты', icon: Receipt, color: 'bg-[var(--c-danger-bg)] text-[var(--c-danger)]', permKey: 'expenses' },
  { id: 'debtors', label: 'Должники', desc: 'Управление долгами', icon: Wallet, color: 'bg-[var(--c-danger-bg)] text-[var(--c-danger)]', permKey: 'debtors' },
  { id: 'staff', label: 'Персонал', desc: 'Сотрудники и доступы', icon: Users, color: 'bg-violet-500/10 text-violet-400', permKey: 'staff' },
  { id: 'salary', label: 'Зарплата', desc: 'Начисление и выдача ЗП', icon: DollarSign, color: 'bg-emerald-500/10 text-emerald-400', permKey: 'salary' },
  { id: 'notifications', label: 'Уведомления', desc: 'Telegram, PWA, настройки', icon: Bell, color: 'bg-amber-500/10 text-amber-400', permKey: 'about' },
  { id: 'about', label: 'О системе', desc: 'Версия, обновление', icon: Info, color: 'bg-gray-500/10 text-gray-400', permKey: 'about' },
];

interface ManagementPageProps {
  initialScreen?: string;
  initialSupplyId?: string;
  initialRevisionId?: string;
  isActive?: boolean;
}

type MenuSubTab = 'positions' | 'modifiers';
type InventorySubTab = 'stock' | 'revision';

export function ManagementPage({ initialScreen, initialSupplyId, initialRevisionId, isActive = true }: ManagementPageProps) {
  const user = useAuthStore((s) => s.user);
  const menuItems = useMemo(() => {
    return ALL_MENU_ITEMS.filter((item) => {
      if (!item.permKey) return true;
      return hasPermission(user, item.permKey);
    });
  }, [user]);

  const resolveInitial = (): { screen: Screen; menuSub?: MenuSubTab; inventorySub?: InventorySubTab } => {
    if (initialScreen === 'modifiers') return { screen: 'menuEditor', menuSub: 'modifiers' };
    if (initialScreen === 'revision') return { screen: 'inventory', inventorySub: 'revision' };
    return { screen: (initialScreen as Screen) || 'menu' };
  };
  const resolved = resolveInitial();
  const [screen, setScreen] = useState<Screen>(resolved.screen);
  const [menuSubTab, setMenuSubTab] = useState<MenuSubTab>(resolved.menuSub ?? 'positions');
  const [inventorySubTab, setInventorySubTab] = useState<InventorySubTab>(resolved.inventorySub ?? 'stock');

  useEffect(() => {
    if (initialScreen === 'modifiers') {
      if (hasPermission(user, 'menu')) {
        setScreen('menuEditor');
        setMenuSubTab('modifiers');
      } else setScreen('menu');
    } else if (initialScreen === 'revision') {
      if (hasPermission(user, 'inventory')) {
        setScreen('inventory');
        setInventorySubTab('revision');
      } else setScreen('menu');
    } else if (initialScreen !== undefined && initialScreen !== 'menu') {
      const item = ALL_MENU_ITEMS.find((m) => m.id === initialScreen);
      if (item && (!item.permKey || hasPermission(user, item.permKey))) {
        setScreen(initialScreen as Screen);
      } else {
        setScreen('menu');
      }
    } else if (initialScreen === undefined && screen !== 'menu') {
      setScreen('menu');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialScreen]);

  const goToMenu = useCallback(() => startTransition(() => setScreen('menu')), []);
  const addHideReason = useLayoutStore((s) => s.addHideReason);
  const removeHideReason = useLayoutStore((s) => s.removeHideReason);
  const setHeader = useSetHeader();

  const screenLabel =
    screen === 'menuEditor' && menuSubTab === 'modifiers' ? 'Модификаторы' :
    screen === 'inventory' && inventorySubTab === 'revision' ? 'Ревизия' :
    menuItems.find((m) => m.id === screen)?.label || 'Управление';

  const screenMeta = menuItems.find((m) => m.id === screen);

  useEffect(() => {
    if (screen !== 'menu') addHideReason('management-deep');
    else removeHideReason('management-deep');
    return () => removeHideReason('management-deep');
  }, [screen, addHideReason, removeHideReason]);

  useEffect(() => {
    if (screen === 'menu') {
      setHeader(null);
      return;
    }
    setHeader({
      title: screenLabel,
      subtitle: screenMeta?.desc,
      showBack: true,
      onBack: goToMenu,
      rightContent: screen === 'inventory' ? (
        <button
          onClick={() => { hapticFeedback('light'); setInventorySubTab('revision'); }}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-white/40 hover:text-white/70 active:scale-90 tap"
        >
          <History className="w-4 h-4" />
        </button>
      ) : undefined,
    });
    return () => setHeader(null);
  }, [screen, screenLabel, screenMeta?.desc, goToMenu, setHeader, inventorySubTab]);

  const { swipeIndicatorStyle, overlayStyle } = useSwipeBack({
    onBack: goToMenu,
    enabled: screen !== 'menu' && isActive,
  });

  const hideNav = useHideNav();
  const supplyCreating = useHasHideReason('supply-creating');
  const showManagementHeader = !(screen === 'menuEditor' && menuSubTab === 'positions') && !(screen === 'supplies' && supplyCreating);

  if (screen === 'menu') {
    return (
      <div className={`space-y-4 sm:space-y-6 ${hideNav ? 'pb-0' : 'pb-24 lg:pb-0'}`}>
        <div>
          <h1 className="text-lg sm:text-2xl font-extrabold tracking-tight text-[var(--c-text)] leading-tight">Управление</h1>
          <p className="text-[var(--c-muted)] text-[11px] sm:text-sm mt-0.5 font-medium">Панель администратора</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4 stagger-children">
          {menuItems.map((item) => {
            const [bgClass, textClass] = item.color.split(' ');
            return (
              <button
                key={item.id}
                onClick={() => startTransition(() => setScreen(item.id))}
                className="group relative text-left rounded-[20px] sm:rounded-[28px] p-4 sm:p-6 border border-[var(--c-border)] bg-[var(--c-surface)] transition-all duration-200 hover:bg-[var(--c-surface-hover)] hover:border-[var(--c-border-hover)] active:scale-[0.97] overflow-hidden"
              >
                <div className={`absolute -right-4 -top-4 w-20 h-20 ${bgClass} opacity-0 group-hover:opacity-40 blur-3xl transition-opacity duration-500`} />

                <div className={`relative w-11 h-11 sm:w-14 sm:h-14 ${bgClass} rounded-xl sm:rounded-2xl flex items-center justify-center mb-3 sm:mb-5 group-hover:scale-110 transition-transform duration-300`}>
                  <item.icon className={`w-5 h-5 sm:w-6 sm:h-6 ${textClass}`} />
                </div>

                <h3 className="relative text-[14px] sm:text-lg font-bold text-[var(--c-text)] mb-0.5 sm:mb-1 truncate">{item.label}</h3>
                <p className="relative text-[var(--c-muted)] text-[11px] sm:text-xs font-medium line-clamp-1">{item.desc}</p>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {swipeIndicatorStyle && <div style={swipeIndicatorStyle} />}
      {overlayStyle && <div style={overlayStyle} />}
      {screen === 'menuEditor' && (
        <div className="space-y-4">
          {menuSubTab === 'positions' && (
            <MenuEditor
              onBackToManagement={() => startTransition(() => setScreen('menu'))}
              tabSwitcher={
                <TabSwitcher
                  tabs={[
                    { id: 'positions', label: 'Позиции', icon: <UtensilsCrossed className="w-4 h-4" /> },
                    { id: 'modifiers', label: 'Модификаторы', icon: <SlidersHorizontal className="w-4 h-4" /> },
                  ]}
                  activeId={menuSubTab}
                  onChange={(id) => setMenuSubTab(id as 'positions' | 'modifiers')}
                />
              }
            />
          )}
          {menuSubTab === 'modifiers' && (
            <>
              <TabSwitcher
                tabs={[
                  { id: 'positions', label: 'Позиции', icon: <UtensilsCrossed className="w-4 h-4" /> },
                  { id: 'modifiers', label: 'Модификаторы', icon: <SlidersHorizontal className="w-4 h-4" /> },
                ]}
                activeId={menuSubTab}
                onChange={(id) => setMenuSubTab(id as 'positions' | 'modifiers')}
              />
              <ModifiersManager />
            </>
          )}
        </div>
      )}
      {screen === 'inventory' && (
        <div className="space-y-6">
          <TabSwitcher
            tabs={[
              { id: 'stock', label: 'Остатки', icon: <Package size={16} /> },
              { id: 'revision', label: 'Ревизия', icon: <ClipboardList size={16} /> },
            ]}
            activeId={inventorySubTab}
            onChange={(id) => setInventorySubTab(id as 'stock' | 'revision')}
            variant="indigo"
          />
          {inventorySubTab === 'stock' && (
            <InventoryFull />
          )}
          {inventorySubTab === 'revision' && <RevisionPage initialRevisionId={initialRevisionId} />}
        </div>
      )}
      {screen === 'supplies' && <SupplyPage initialSupplyId={initialSupplyId} />}
      {screen === 'clients' && <ClientsManager />}
      {screen === 'bonus' && <BonusManager />}
      {screen === 'cash' && <InkassationPage />}
      {screen === 'discounts' && <DiscountsManager />}
      {screen === 'certificates' && <CertificatesManager />}
      {screen === 'expenses' && <ExpensesManager />}
      {screen === 'debtors' && <DebtorsManager />}
      {screen === 'staff' && <StaffManager />}
      {screen === 'salary' && <SalaryManager />}
      {screen === 'notifications' && <NotificationsManager />}
      {screen === 'about' && <AboutSystem />}
    </div>
  );
}

function InventoryFull() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const loadItems = useCallback(async () => {
    const { data } = await supabase
      .from('inventory')
      .select('*')
      .order('category')
      .order('name');
    if (data) setItems(data as InventoryItem[]);
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const criticalItems = items.filter(
    (i) => !i.is_service && i.track_stock !== false && i.min_threshold > 0 && i.stock_quantity <= i.min_threshold
  );

  const filteredItems = searchQuery.trim()
    ? items.filter((i) => i.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : items;

  const hideNav = useHideNav();
  return (
    <div className={`space-y-4 sm:space-y-5 relative ${hideNav ? 'pb-0' : 'pb-24'} lg:pb-0`}>
      {/* Критический остаток */}
      {criticalItems.length > 0 && (
        <div className="relative overflow-hidden bg-rose-500/5 border border-rose-500/20 rounded-xl sm:rounded-2xl p-3 sm:p-4 lg:p-5">
          <div className="absolute top-0 right-0 p-4 sm:p-6 text-rose-500/10 pointer-events-none">
            <AlertTriangle className="w-10 h-10 sm:w-14 sm:h-14 lg:w-16 lg:h-16 text-rose-500/10" />
          </div>
          <div className="flex items-center gap-2 mb-2 sm:mb-3">
            <div className="p-1.5 sm:p-2 bg-rose-500/20 text-rose-500 rounded-lg">
              <TrendingDown className="w-4 h-4 sm:w-5 h-5" />
            </div>
            <h2 className="text-rose-400 font-black uppercase tracking-wider text-xs sm:text-sm">Критический остаток</h2>
          </div>
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {criticalItems.map((item) => (
              <div
                key={item.id}
                className="px-2.5 sm:px-3 py-1.5 sm:py-2 bg-rose-500/10 border border-rose-500/20 rounded-lg sm:rounded-xl flex items-center gap-1.5 transition-all hover:bg-rose-500/20"
              >
                <span className="text-white font-bold text-xs sm:text-sm truncate max-w-[120px] sm:max-w-none">{item.name}</span>
                <span className="text-rose-400 font-black text-[10px] sm:text-xs bg-rose-950/40 px-1.5 py-0.5 rounded shrink-0">
                  {item.stock_quantity}/{item.min_threshold}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Поиск и фильтры */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4 sm:w-5 sm:h-5" />
          <input
            type="text"
            placeholder="Поиск товара..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900/40 border border-slate-800 rounded-xl sm:rounded-2xl py-2.5 sm:py-3 pl-9 sm:pl-12 pr-3 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-slate-600 text-[var(--c-text)]"
          />
        </div>
        <button className="h-10 sm:h-10 w-10 sm:w-auto sm:px-4 bg-slate-900/40 border border-slate-800 rounded-xl sm:rounded-2xl flex items-center justify-center gap-2 text-slate-400 hover:bg-slate-800 transition-all shrink-0">
          <Filter className="w-4 h-4 sm:w-5 h-5" />
          <span className="hidden sm:inline font-bold text-xs">Фильтры</span>
        </button>
      </div>

      {/* Список товаров */}
      {filteredItems.length === 0 ? (
        <div className="text-center py-10 sm:py-12">
          <Package className="w-8 h-8 sm:w-10 h-10 text-slate-500 mx-auto mb-2" />
          <p className="text-slate-500 font-medium text-sm">
            {searchQuery ? 'Ничего не найдено' : 'Нет товаров на складе'}
          </p>
        </div>
      ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 lg:gap-4">
        {filteredItems.map((item) => {
          const isService = item.is_service === true;
          const isLow = !isService && item.min_threshold > 0 && item.stock_quantity <= item.min_threshold;
          return (
            <div
              key={item.id}
              className={`group relative bg-slate-900/30 border ${isLow ? 'border-rose-500/30' : 'border-slate-800'} rounded-xl sm:rounded-2xl p-3 sm:p-4 hover:bg-slate-800/40 transition-all flex items-center justify-between shadow-lg`}
            >
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-inner shrink-0 ${
                  isLow ? 'bg-rose-500/10 text-rose-400' : 'bg-slate-800/80 text-slate-500'
                }`}>
                  <Box className="w-5 h-5 sm:w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold text-[var(--c-text)] group-hover:text-indigo-400 transition-colors truncate">{item.name}</h3>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-slate-500 bg-slate-800/50 px-1.5 py-0.5 rounded">
                      {categoryLabels[item.category] || item.category}
                    </span>
                    <span className="text-[10px] sm:text-xs font-bold text-indigo-400/80">{item.price} ₽</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-end shrink-0">
                {isService ? (
                  <span className="text-[10px] text-slate-500 font-bold uppercase">—</span>
                ) : (
                  <>
                    <div className="flex items-baseline gap-0.5">
                      <span className={`text-xl sm:text-2xl font-black ${isLow ? 'text-rose-500' : 'text-[var(--c-text)]'}`}>
                        {item.stock_quantity}
                      </span>
                      <span className="text-slate-500 text-[10px] font-bold uppercase">шт</span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[9px] text-slate-500 font-bold uppercase">Мин:</span>
                      <span className="text-[9px] text-slate-400 font-black bg-slate-800 px-1 py-0.5 rounded">{item.min_threshold}</span>
                    </div>
                  </>
                )}
              </div>

              <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="p-1 text-slate-600 hover:text-white">
                  <MoreVertical className="w-4 h-4 sm:w-5 h-5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      )}

    </div>
  );
}
