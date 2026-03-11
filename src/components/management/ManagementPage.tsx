import { useState, useEffect, useCallback, startTransition } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Package, Truck, ClipboardList, Users, AlertTriangle, Wallet, Star, Banknote, UtensilsCrossed, UserCircle,
  ArrowLeft, Percent, Info, SlidersHorizontal, Ticket, Receipt, History, Filter, ArrowDownToLine, TrendingDown, Box, MoreVertical, Search,
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
import { useSwipeBack } from '@/hooks/useSwipeBack';
import { hapticFeedback } from '@/lib/telegram';
import { useLayoutStore, useHideNav } from '@/store/layout';

type Screen = 'menu' | 'inventory' | 'supplies' | 'revision' | 'debtors' | 'staff' | 'bonus' | 'cash' | 'menuEditor' | 'clients' | 'discounts' | 'refunds' | 'modifiers' | 'certificates' | 'expenses' | 'about';

const categoryLabels: Record<string, string> = {
  drinks: 'Напитки', food: 'Еда', bar: 'Снеки', hookah: 'Кальяны', services: 'Услуги',
};

const menuItems: { id: Screen; label: string; desc: string; icon: typeof Package; color: string }[] = [
  { id: 'menuEditor', label: 'Меню', desc: 'Позиции, модификаторы, разделы', icon: UtensilsCrossed, color: 'bg-orange-500/10 text-orange-400' },
  { id: 'inventory', label: 'Склад', desc: 'Контроль остатков и ревизии', icon: Package, color: 'bg-blue-500/10 text-blue-400' },
  { id: 'supplies', label: 'Поставки', desc: 'История и новые поставки', icon: Truck, color: 'bg-[var(--c-success-bg)] text-[var(--c-success)]' },
  { id: 'clients', label: 'Клиенты', desc: 'Профили, контакты, ДР', icon: UserCircle, color: 'bg-sky-500/10 text-sky-400' },
  { id: 'discounts', label: 'Скидки', desc: 'Процентные и фиксированные', icon: Percent, color: 'bg-pink-500/10 text-pink-400' },
  { id: 'bonus', label: 'Бонусы', desc: 'Баллы и настройки', icon: Star, color: 'bg-yellow-500/10 text-yellow-400' },
  { id: 'certificates', label: 'Сертификаты', desc: 'Подарочные сертификаты', icon: Ticket, color: 'bg-[var(--c-warning-bg)] text-[var(--c-warning)]' },
  { id: 'cash', label: 'Инкассация', desc: 'Операции с наличными', icon: Banknote, color: 'bg-cyan-500/10 text-cyan-400' },
  { id: 'expenses', label: 'Расходы', desc: 'Аренда, коммуналка, зарплаты', icon: Receipt, color: 'bg-[var(--c-danger-bg)] text-[var(--c-danger)]' },
  { id: 'debtors', label: 'Должники', desc: 'Управление долгами', icon: Wallet, color: 'bg-[var(--c-danger-bg)] text-[var(--c-danger)]' },
  { id: 'staff', label: 'Персонал', desc: 'Сотрудники и доступы', icon: Users, color: 'bg-violet-500/10 text-violet-400' },
  { id: 'about', label: 'О системе', desc: 'Версия, обновление', icon: Info, color: 'bg-gray-500/10 text-gray-400' },
];

interface ManagementPageProps {
  initialScreen?: string;
  isActive?: boolean;
}

type MenuSubTab = 'positions' | 'modifiers';
type InventorySubTab = 'stock' | 'revision';

export function ManagementPage({ initialScreen, isActive = true }: ManagementPageProps) {
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
      setScreen('menuEditor');
      setMenuSubTab('modifiers');
    } else if (initialScreen === 'revision') {
      setScreen('inventory');
      setInventorySubTab('revision');
    } else if (initialScreen !== undefined && initialScreen !== screen) {
      setScreen(initialScreen as Screen);
    } else if (initialScreen === undefined && screen !== 'menu') {
      setScreen('menu');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialScreen]);

  const goToMenu = useCallback(() => startTransition(() => setScreen('menu')), []);
  const addHideReason = useLayoutStore((s) => s.addHideReason);
  const removeHideReason = useLayoutStore((s) => s.removeHideReason);

  useEffect(() => {
    if (screen !== 'menu') addHideReason('management-deep');
    else removeHideReason('management-deep');
    return () => removeHideReason('management-deep');
  }, [screen, addHideReason, removeHideReason]);

  const { swipeIndicatorStyle, overlayStyle } = useSwipeBack({
    onBack: goToMenu,
    enabled: screen !== 'menu' && isActive,
  });

  const screenLabel =
    screen === 'menuEditor' && menuSubTab === 'modifiers' ? 'Модификаторы' :
    screen === 'inventory' && inventorySubTab === 'revision' ? 'Ревизия' :
    menuItems.find((m) => m.id === screen)?.label || 'Управление';

  const screenMeta = menuItems.find((m) => m.id === screen);

  if (screen === 'menu') {
    return (
      <div className="space-y-4 sm:space-y-6">
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
      <div className="flex items-center justify-between gap-2.5 sm:gap-3">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <button
            onClick={() => setScreen('menu')}
            className="p-2 sm:p-2.5 rounded-xl sm:rounded-2xl bg-[var(--c-surface)] border border-[var(--c-border)] flex items-center justify-center active:scale-95 transition-all shrink-0"
          >
            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 text-[var(--c-hint)]" />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-extrabold tracking-tight text-[var(--c-text)] leading-tight truncate">{screenLabel}</h1>
            {screenMeta && (
              <p className="text-[var(--c-muted)] text-[11px] sm:text-sm mt-0.5 font-medium truncate">{screenMeta.desc}</p>
            )}
          </div>
        </div>
        {screen === 'inventory' && (
          <button
            onClick={() => { hapticFeedback('light'); setInventorySubTab('revision'); }}
            className="p-2 sm:p-2.5 rounded-xl sm:rounded-2xl bg-[var(--c-surface)] border border-[var(--c-border)] flex items-center justify-center active:scale-95 transition-all shrink-0 text-[var(--c-hint)] hover:text-[var(--c-text)]"
          >
            <History className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        )}
      </div>

      {screen === 'menuEditor' && (
        <div className="space-y-4">
          <div className="flex gap-1 p-1 rounded-2xl bg-[var(--c-surface)] border border-[var(--c-border)] w-fit">
            <button
              onClick={() => setMenuSubTab('positions')}
              className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${menuSubTab === 'positions' ? 'bg-[var(--c-accent)] text-white shadow-md' : 'text-[var(--c-muted)] hover:text-[var(--c-text)]'}`}
            >
              Позиции
            </button>
            <button
              onClick={() => setMenuSubTab('modifiers')}
              className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 ${menuSubTab === 'modifiers' ? 'bg-[var(--c-accent)] text-white shadow-md' : 'text-[var(--c-muted)] hover:text-[var(--c-text)]'}`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              Модификаторы
            </button>
          </div>
          {menuSubTab === 'positions' && <MenuEditor />}
          {menuSubTab === 'modifiers' && <ModifiersManager />}
        </div>
      )}
      {screen === 'inventory' && (
        <div className="space-y-6">
          <div className="flex gap-1.5 p-1.5 rounded-[24px] bg-slate-900/50 border border-slate-800 max-w-md">
            <button
              onClick={() => setInventorySubTab('stock')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-[18px] font-bold text-sm transition-all ${
                inventorySubTab === 'stock' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <Package size={18} />
              Остатки
            </button>
            <button
              onClick={() => setInventorySubTab('revision')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-[18px] font-bold text-sm transition-all ${
                inventorySubTab === 'revision' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <ClipboardList size={18} />
              Ревизия
            </button>
          </div>
          {inventorySubTab === 'stock' && (
            <InventoryFull
              onNavigateToSupplies={() => startTransition(() => setScreen('supplies'))}
            />
          )}
          {inventorySubTab === 'revision' && <RevisionPage />}
        </div>
      )}
      {screen === 'supplies' && <SupplyPage />}
      {screen === 'clients' && <ClientsManager />}
      {screen === 'bonus' && <BonusManager />}
      {screen === 'cash' && <InkassationPage />}
      {screen === 'discounts' && <DiscountsManager />}
      {screen === 'certificates' && <CertificatesManager />}
      {screen === 'expenses' && <ExpensesManager />}
      {screen === 'debtors' && <DebtorsManager />}
      {screen === 'staff' && <StaffManager />}
      {screen === 'about' && <AboutSystem />}
    </div>
  );
}

function InventoryFull({ onNavigateToSupplies }: { onNavigateToSupplies?: () => void }) {
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
    (i) => i.min_threshold > 0 && i.stock_quantity <= i.min_threshold
  );

  const filteredItems = searchQuery.trim()
    ? items.filter((i) => i.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : items;

  const hideNav = useHideNav();
  return (
    <div className={`space-y-6 relative ${hideNav ? 'pb-0' : 'pb-24'} lg:pb-0`}>
      {/* Критический остаток */}
      {criticalItems.length > 0 && (
        <div className="relative overflow-hidden bg-rose-500/5 border border-rose-500/20 rounded-[32px] p-6 lg:p-8">
          <div className="absolute top-0 right-0 p-8 text-rose-500/10 pointer-events-none">
            <AlertTriangle size={80} />
          </div>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-rose-500/20 text-rose-500 rounded-xl">
              <TrendingDown className="w-5 h-5" />
            </div>
            <h2 className="text-rose-400 font-black uppercase tracking-wider text-sm">Критический остаток</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {criticalItems.map((item) => (
              <div
                key={item.id}
                className="px-4 py-2 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2 transition-all hover:bg-rose-500/20"
              >
                <span className="text-white font-bold text-sm">{item.name}</span>
                <span className="text-rose-400 font-black text-xs bg-rose-950/40 px-2 py-0.5 rounded-md">
                  {item.stock_quantity}/{item.min_threshold}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Поиск и фильтры */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
          <input
            type="text"
            placeholder="Поиск товара по названию..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900/40 border border-slate-800 rounded-2xl py-3.5 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-slate-600 text-[var(--c-text)]"
          />
        </div>
        <button className="h-12 w-12 sm:w-auto sm:px-5 bg-slate-900/40 border border-slate-800 rounded-2xl flex items-center justify-center gap-2 text-slate-400 hover:bg-slate-800 transition-all">
          <Filter size={20} />
          <span className="hidden sm:inline font-bold text-sm">Фильтры</span>
        </button>
      </div>

      {/* Список товаров */}
      {filteredItems.length === 0 ? (
        <div className="text-center py-16">
          <Package className="w-10 h-10 text-slate-500 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">
            {searchQuery ? 'Ничего не найдено' : 'Нет товаров на складе'}
          </p>
        </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredItems.map((item) => {
          const isLow = item.min_threshold > 0 && item.stock_quantity <= item.min_threshold;
          return (
            <div
              key={item.id}
              className={`group relative bg-slate-900/30 border ${isLow ? 'border-rose-500/30' : 'border-slate-800'} rounded-3xl p-5 hover:bg-slate-800/40 transition-all flex items-center justify-between shadow-lg`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner ${
                  isLow ? 'bg-rose-500/10 text-rose-400' : 'bg-slate-800/80 text-slate-500'
                }`}>
                  <Box className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[var(--c-text)] group-hover:text-indigo-400 transition-colors">{item.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 bg-slate-800/50 px-2 py-0.5 rounded-md">
                      {categoryLabels[item.category] || item.category}
                    </span>
                    <span className="text-xs font-bold text-indigo-400/80">{item.price} ₽</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-end">
                <div className="flex items-baseline gap-1">
                  <span className={`text-3xl font-black ${isLow ? 'text-rose-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.3)]' : 'text-[var(--c-text)]'}`}>
                    {item.stock_quantity}
                  </span>
                  <span className="text-slate-500 text-xs font-bold uppercase">шт</span>
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">Мин:</span>
                  <span className="text-[10px] text-slate-400 font-black bg-slate-800 px-1.5 py-0.5 rounded">{item.min_threshold}</span>
                </div>
              </div>

              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="p-1.5 text-slate-600 hover:text-white">
                  <MoreVertical size={18} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* FAB — Поставка */}
      {onNavigateToSupplies && (
        <div className="fixed bottom-10 right-10 z-20">
          <button
            onClick={() => { hapticFeedback(); onNavigateToSupplies(); }}
            className="w-16 h-16 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-2xl shadow-indigo-600/40 hover:scale-110 active:scale-95 transition-all border-4 border-[var(--c-bg)]"
          >
            <ArrowDownToLine size={28} />
          </button>
        </div>
      )}
    </div>
  );
}
