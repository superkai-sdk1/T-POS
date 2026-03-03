import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  Package, Truck, ClipboardList, Users, AlertTriangle, Wallet, Star, Banknote, UtensilsCrossed, UserCircle,
  ChevronRight, ArrowLeft,
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

type Screen = 'menu' | 'inventory' | 'supplies' | 'revision' | 'debtors' | 'staff' | 'bonus' | 'cash' | 'menuEditor' | 'clients';

const categoryLabels: Record<string, string> = {
  drinks: 'Напитки', food: 'Еда', bar: 'Снеки', hookah: 'Кальяны', services: 'Услуги',
};

const menuItems: { id: Screen; label: string; desc: string; icon: typeof Package; color: string }[] = [
  { id: 'menuEditor', label: 'Меню', desc: 'Позиции, картинки, разделы', icon: UtensilsCrossed, color: 'bg-orange-500/15 text-orange-400' },
  { id: 'inventory', label: 'Склад', desc: 'Остатки и товары', icon: Package, color: 'bg-blue-500/15 text-blue-400' },
  { id: 'supplies', label: 'Поставки', desc: 'История и новые поставки', icon: Truck, color: 'bg-emerald-500/15 text-emerald-400' },
  { id: 'revision', label: 'Ревизия', desc: 'История ревизий', icon: ClipboardList, color: 'bg-amber-500/15 text-amber-400' },
  { id: 'clients', label: 'Клиенты', desc: 'Профили, контакты, ДР', icon: UserCircle, color: 'bg-sky-500/15 text-sky-400' },
  { id: 'bonus', label: 'Бонусы', desc: 'Баллы и настройки', icon: Star, color: 'bg-yellow-500/15 text-yellow-400' },
  { id: 'cash', label: 'Инкассация', desc: 'Операции с наличными', icon: Banknote, color: 'bg-cyan-500/15 text-cyan-400' },
  { id: 'debtors', label: 'Должники', desc: 'Управление долгами', icon: Wallet, color: 'bg-red-500/15 text-red-400' },
  { id: 'staff', label: 'Персонал', desc: 'Сотрудники и доступы', icon: Users, color: 'bg-violet-500/15 text-violet-400' },
];

export function ManagementPage() {
  const [screen, setScreen] = useState<Screen>('menu');

  const screenLabel = menuItems.find((m) => m.id === screen)?.label || 'Управление';

  if (screen === 'menu') {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-[var(--tg-theme-text-color,#e0e0e0)]">Управление</h2>
        <div className="space-y-2">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setScreen(item.id)}
              className="w-full flex items-center gap-3 p-4 rounded-2xl bg-white/5 hover:bg-white/8 border border-white/5 transition-all active:scale-[0.98]"
            >
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${item.color.split(' ')[0]}`}>
                <item.icon className={`w-5 h-5 ${item.color.split(' ')[1]}`} />
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="font-semibold text-sm text-[var(--tg-theme-text-color,#e0e0e0)]">{item.label}</p>
                <p className="text-xs text-[var(--tg-theme-hint-color,#888)]">{item.desc}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-white/20 shrink-0" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setScreen('menu')}
          className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors active:scale-95 shrink-0"
        >
          <ArrowLeft className="w-5 h-5 text-[var(--tg-theme-text-color,#e0e0e0)]" />
        </button>
        <h2 className="text-xl font-bold text-[var(--tg-theme-text-color,#e0e0e0)]">{screenLabel}</h2>
      </div>

      {screen === 'menuEditor' && <MenuEditor />}
      {screen === 'inventory' && <InventoryFull />}
      {screen === 'supplies' && <SupplyPage />}
      {screen === 'revision' && <RevisionPage />}
      {screen === 'clients' && <ClientsManager />}
      {screen === 'bonus' && <BonusManager />}
      {screen === 'cash' && <InkassationPage />}
      {screen === 'debtors' && <DebtorsManager />}
      {screen === 'staff' && <StaffManager />}
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
    <div className="space-y-3">
      {criticalItems.length > 0 && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-sm font-semibold text-red-400">Критический остаток</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {criticalItems.map((item) => (
              <Badge key={item.id} variant="danger">
                {item.name}: {item.stock_quantity}/{item.min_threshold}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {items.map((item) => {
          const isCritical = item.min_threshold > 0 && item.stock_quantity <= item.min_threshold;
          return (
            <div
              key={item.id}
              className={`flex items-center justify-between p-3 rounded-xl ${
                isCritical ? 'bg-red-500/10 border border-red-500/20' : 'bg-white/5'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  isCritical ? 'bg-red-500/20' : 'bg-white/10'
                }`}>
                  <Package className={`w-5 h-5 ${isCritical ? 'text-red-400' : 'text-white/50'}`} />
                </div>
                <div>
                  <p className="font-medium text-sm text-[var(--tg-theme-text-color,#e0e0e0)]">
                    {item.name}
                  </p>
                  <div className="flex gap-2 mt-0.5">
                    <Badge>{categoryLabels[item.category] || item.category}</Badge>
                    <Badge>{item.price}₽</Badge>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className={`text-lg font-bold ${isCritical ? 'text-red-400' : 'text-[var(--tg-theme-text-color,#e0e0e0)]'}`}>
                  {item.stock_quantity}
                </p>
                {item.min_threshold > 0 && (
                  <p className="text-xs text-[var(--tg-theme-hint-color,#888)]">
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
