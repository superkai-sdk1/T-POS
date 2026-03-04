import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Badge } from '@/components/ui/Badge';
import {
  Package, Truck, ClipboardList, Users, AlertTriangle, Wallet, Star, Banknote, UtensilsCrossed, UserCircle,
  ChevronRight, ArrowLeft, Percent, Info,
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

type Screen = 'menu' | 'inventory' | 'supplies' | 'revision' | 'debtors' | 'staff' | 'bonus' | 'cash' | 'menuEditor' | 'clients' | 'discounts' | 'about';

const categoryLabels: Record<string, string> = {
  drinks: 'Напитки', food: 'Еда', bar: 'Снеки', hookah: 'Кальяны', services: 'Услуги',
};

const menuItems: { id: Screen; label: string; desc: string; icon: typeof Package; color: string }[] = [
  { id: 'menuEditor', label: 'Меню', desc: 'Позиции, картинки, разделы', icon: UtensilsCrossed, color: 'bg-orange-500/10 text-orange-400' },
  { id: 'inventory', label: 'Склад', desc: 'Остатки и товары', icon: Package, color: 'bg-blue-500/10 text-blue-400' },
  { id: 'supplies', label: 'Поставки', desc: 'История и новые поставки', icon: Truck, color: 'bg-emerald-500/10 text-emerald-400' },
  { id: 'revision', label: 'Ревизия', desc: 'История ревизий', icon: ClipboardList, color: 'bg-amber-500/10 text-amber-400' },
  { id: 'clients', label: 'Клиенты', desc: 'Профили, контакты, ДР', icon: UserCircle, color: 'bg-sky-500/10 text-sky-400' },
  { id: 'discounts', label: 'Скидки', desc: 'Процентные и фиксированные', icon: Percent, color: 'bg-pink-500/10 text-pink-400' },
  { id: 'bonus', label: 'Бонусы', desc: 'Баллы и настройки', icon: Star, color: 'bg-yellow-500/10 text-yellow-400' },
  { id: 'cash', label: 'Инкассация', desc: 'Операции с наличными', icon: Banknote, color: 'bg-cyan-500/10 text-cyan-400' },
  { id: 'debtors', label: 'Должники', desc: 'Управление долгами', icon: Wallet, color: 'bg-red-500/10 text-red-400' },
  { id: 'staff', label: 'Персонал', desc: 'Сотрудники и доступы', icon: Users, color: 'bg-violet-500/10 text-violet-400' },
  { id: 'about', label: 'О системе', desc: 'Версия, обновление', icon: Info, color: 'bg-gray-500/10 text-gray-400' },
];

interface ManagementPageProps {
  initialScreen?: string;
}

export function ManagementPage({ initialScreen }: ManagementPageProps) {
  const [screen, setScreen] = useState<Screen>((initialScreen as Screen) || 'menu');

  useEffect(() => {
    if (initialScreen && initialScreen !== screen) {
      setScreen(initialScreen as Screen);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialScreen]);

  const screenLabel = menuItems.find((m) => m.id === screen)?.label || 'Управление';

  if (screen === 'menu') {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-[var(--tg-theme-text-color,#e0e0e0)]">Управление</h2>
        <div className="space-y-1 lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-2 lg:space-y-0 stagger-children">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setScreen(item.id)}
              className="w-full flex items-center gap-2.5 p-3 rounded-xl card-interactive"
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${item.color.split(' ')[0]}`}>
                <item.icon className={`w-4 h-4 ${item.color.split(' ')[1]}`} />
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="font-semibold text-[13px] text-[var(--tg-theme-text-color,#e0e0e0)]">{item.label}</p>
                <p className="text-[10px] text-white/25">{item.desc}</p>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-white/12 shrink-0" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setScreen('menu')}
          className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center active:scale-90 transition-transform shrink-0"
        >
          <ArrowLeft className="w-4 h-4 text-[var(--tg-theme-text-color,#e0e0e0)]" />
        </button>
        <h2 className="text-lg font-bold text-[var(--tg-theme-text-color,#e0e0e0)]">{screenLabel}</h2>
      </div>

      {screen === 'menuEditor' && <MenuEditor />}
      {screen === 'inventory' && <InventoryFull />}
      {screen === 'supplies' && <SupplyPage />}
      {screen === 'revision' && <RevisionPage />}
      {screen === 'clients' && <ClientsManager />}
      {screen === 'bonus' && <BonusManager />}
      {screen === 'cash' && <InkassationPage />}
      {screen === 'discounts' && <DiscountsManager />}
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
        <div className="p-2.5 rounded-xl bg-red-500/6 border border-red-500/10">
          <div className="flex items-center gap-2 mb-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
            <span className="text-[11px] font-semibold text-red-400">Критический остаток</span>
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
              className={`flex items-center justify-between p-2.5 rounded-xl ${
                isCritical ? 'bg-red-500/6 border border-red-500/10' : 'card'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  isCritical ? 'bg-red-500/12' : 'bg-white/5'
                }`}>
                  <Package className={`w-3.5 h-3.5 ${isCritical ? 'text-red-400' : 'text-white/35'}`} />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-[13px] text-[var(--tg-theme-text-color,#e0e0e0)] truncate">
                    {item.name}
                  </p>
                  <div className="flex gap-1 mt-0.5">
                    <Badge size="sm">{categoryLabels[item.category] || item.category}</Badge>
                    <Badge size="sm">{item.price}₽</Badge>
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0 ml-2">
                <p className={`text-base font-black tabular-nums ${isCritical ? 'text-red-400' : 'text-[var(--tg-theme-text-color,#e0e0e0)]'}`}>
                  {item.stock_quantity}
                </p>
                {item.min_threshold > 0 && (
                  <p className="text-[10px] text-white/20">
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
