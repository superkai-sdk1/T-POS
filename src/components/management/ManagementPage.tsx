import { useState, useEffect, useCallback, startTransition } from 'react';
import { supabase } from '@/lib/supabase';
import { Badge } from '@/components/ui/Badge';
import {
  Package, Truck, ClipboardList, Users, AlertTriangle, Wallet, Star, Banknote, UtensilsCrossed, UserCircle,
  ChevronRight, ArrowLeft, Percent, Info, RotateCcw, SlidersHorizontal, Ticket, Receipt,
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
import { RefundsManager } from './RefundsManager';
import { ModifiersManager } from './ModifiersManager';
import { CertificatesManager } from './CertificatesManager';
import { ExpensesManager } from './ExpensesManager';
import { useSwipeBack } from '@/hooks/useSwipeBack';

type Screen = 'menu' | 'inventory' | 'supplies' | 'revision' | 'debtors' | 'staff' | 'bonus' | 'cash' | 'menuEditor' | 'clients' | 'discounts' | 'refunds' | 'modifiers' | 'certificates' | 'expenses' | 'about';

const categoryLabels: Record<string, string> = {
  drinks: 'Напитки', food: 'Еда', bar: 'Снеки', hookah: 'Кальяны', services: 'Услуги',
};

const menuItems: { id: Screen; label: string; desc: string; icon: typeof Package; color: string }[] = [
  { id: 'menuEditor', label: 'Меню', desc: 'Позиции, картинки, разделы', icon: UtensilsCrossed, color: 'bg-orange-500/10 text-orange-400' },
  { id: 'inventory', label: 'Склад', desc: 'Остатки и товары', icon: Package, color: 'bg-blue-500/10 text-blue-400' },
  { id: 'supplies', label: 'Поставки', desc: 'История и новые поставки', icon: Truck, color: 'bg-[var(--c-success-bg)] text-[var(--c-success)]' },
  { id: 'revision', label: 'Ревизия', desc: 'История ревизий', icon: ClipboardList, color: 'bg-[var(--c-warning-bg)] text-[var(--c-warning)]' },
  { id: 'clients', label: 'Клиенты', desc: 'Профили, контакты, ДР', icon: UserCircle, color: 'bg-sky-500/10 text-sky-400' },
  { id: 'modifiers', label: 'Модификаторы', desc: 'Сиропы, добавки, опции', icon: SlidersHorizontal, color: 'bg-indigo-500/10 text-indigo-400' },
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

export function ManagementPage({ initialScreen, isActive = true }: ManagementPageProps) {
  const [screen, setScreen] = useState<Screen>((initialScreen as Screen) || 'menu');

  useEffect(() => {
    if (initialScreen !== undefined && initialScreen !== screen) {
      setScreen(initialScreen as Screen);
    } else if (initialScreen === undefined && screen !== 'menu') {
      setScreen('menu');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialScreen]);

  const goToMenu = useCallback(() => startTransition(() => setScreen('menu')), []);
  const { swipeIndicatorStyle, overlayStyle } = useSwipeBack({
    onBack: goToMenu,
    enabled: screen !== 'menu' && isActive,
  });

  const screenLabel = menuItems.find((m) => m.id === screen)?.label || 'Управление';

  if (screen === 'menu') {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-[var(--c-text)]">Управление</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 stagger-children">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => startTransition(() => setScreen(item.id))}
              className="flex items-center gap-2.5 p-3 rounded-xl card-interactive"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${item.color.split(' ')[0]}`}>
                <item.icon className={`w-[18px] h-[18px] ${item.color.split(' ')[1]}`} />
              </div>
              <p className="font-semibold text-[12px] text-[var(--c-text)] text-left leading-tight truncate">{item.label}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {swipeIndicatorStyle && <div style={swipeIndicatorStyle} />}
      {overlayStyle && <div style={overlayStyle} />}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setScreen('menu')}
          className="w-9 h-9 rounded-xl bg-[var(--c-surface)] flex items-center justify-center hover:bg-[var(--c-surface-hover)] active:scale-90 transition-transform shrink-0"
        >
          <ArrowLeft className="w-4 h-4 text-[var(--c-text)]" />
        </button>
        <h2 className="text-lg font-bold text-[var(--c-text)]">{screenLabel}</h2>
      </div>

      {screen === 'menuEditor' && <MenuEditor />}
      {screen === 'inventory' && <InventoryFull />}
      {screen === 'supplies' && <SupplyPage />}
      {screen === 'revision' && <RevisionPage />}
      {screen === 'clients' && <ClientsManager />}
      {screen === 'bonus' && <BonusManager />}
      {screen === 'cash' && <InkassationPage />}
      {screen === 'discounts' && <DiscountsManager />}
      {screen === 'modifiers' && <ModifiersManager />}
      {screen === 'certificates' && <CertificatesManager />}
      {screen === 'expenses' && <ExpensesManager />}
      {screen === 'debtors' && <DebtorsManager />}
      {screen === 'staff' && <StaffManager />}
      {screen === 'about' && <AboutSystem />}
    </div>
  );
}

function InventoryFull() {
  const [items, setItems] = useState<InventoryItem[]>([]);

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

  return (
    <div className="space-y-2">
      {criticalItems.length > 0 && (
        <div className="p-2.5 rounded-xl bg-[var(--c-danger-bg)] border border-[var(--c-border)]">
          <div className="flex items-center gap-2 mb-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-[var(--c-danger)]" />
            <span className="text-[11px] font-semibold text-[var(--c-danger)]">Критический остаток</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {criticalItems.map((item) => (
              <Badge key={item.id} variant="danger" size="sm">
                {item.name}: {item.stock_quantity}/{item.min_threshold}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1">
        {items.map((item) => {
          const isCritical = item.min_threshold > 0 && item.stock_quantity <= item.min_threshold;
          return (
            <div
              key={item.id}
              className={`flex items-center justify-between p-2.5 rounded-xl ${isCritical ? 'bg-[var(--c-danger-bg)] border border-[var(--c-border)]' : 'card'
                }`}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isCritical ? 'bg-[var(--c-danger-bg)]' : 'bg-[var(--c-surface)]'
                  }`}>
                  <Package className={`w-3.5 h-3.5 ${isCritical ? 'text-[var(--c-danger)]' : 'text-[var(--c-hint)]'}`} />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-[13px] text-[var(--c-text)] truncate">
                    {item.name}
                  </p>
                  <div className="flex gap-1 mt-0.5">
                    <Badge size="sm">{categoryLabels[item.category] || item.category}</Badge>
                    <Badge size="sm">{item.price}₽</Badge>
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0 ml-2">
                <p className={`text-base font-black tabular-nums ${isCritical ? 'text-[var(--c-danger)]' : 'text-[var(--c-text)]'}`}>
                  {item.stock_quantity}
                </p>
                {item.min_threshold > 0 && (
                  <p className="text-[10px] text-[var(--c-muted)]">
                    мин: {item.min_threshold}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
