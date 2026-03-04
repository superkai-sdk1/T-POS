import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { MenuCategory } from '@/types';
import {
  Coffee, UtensilsCrossed, Cookie, Wind, Ticket,
  Package, Music, Gamepad2, Sparkles, ShoppingBag,
  Flame, Grape, IceCream, Salad, Beer, Wine,
  Sandwich, Popcorn, CupSoda, Candy, FolderOpen,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  Coffee, UtensilsCrossed, Cookie, Wind, Ticket,
  Package, Music, Gamepad2, Sparkles, ShoppingBag,
  Flame, Grape, IceCream, Salad, Beer, Wine,
  Sandwich, Popcorn, CupSoda, Candy, FolderOpen,
};

export const AVAILABLE_ICONS = Object.keys(ICON_MAP);

export function getIconComponent(name: string): LucideIcon {
  return ICON_MAP[name] || Package;
}

const COLOR_PALETTE = [
  'from-violet-600/20 to-purple-600/5 border-violet-500/15',
  'from-blue-600/20 to-cyan-600/5 border-blue-500/15',
  'from-orange-600/20 to-amber-600/5 border-orange-500/15',
  'from-emerald-600/20 to-green-600/5 border-emerald-500/15',
  'from-pink-600/20 to-rose-600/5 border-pink-500/15',
  'from-amber-600/20 to-yellow-600/5 border-amber-500/15',
  'from-cyan-600/20 to-sky-600/5 border-cyan-500/15',
  'from-red-600/20 to-rose-600/5 border-red-500/15',
  'from-lime-600/20 to-green-600/5 border-lime-500/15',
  'from-indigo-600/20 to-blue-600/5 border-indigo-500/15',
];

export function getCategoryColor(index: number): string {
  return COLOR_PALETTE[index % COLOR_PALETTE.length];
}

export function useMenuCategories() {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('menu_categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');
    if (data) setCategories(data as MenuCategory[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return { categories, loading, reload: load };
}

export function useAllMenuCategories() {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('menu_categories')
      .select('*')
      .order('sort_order');
    if (data) setCategories(data as MenuCategory[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return { categories, loading, reload: load };
}
