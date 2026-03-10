import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { MenuCategory } from '@/types';
import {
  Coffee, UtensilsCrossed, Cookie, Wind, Ticket,
  Package, Music, Gamepad2, Sparkles, ShoppingBag,
  Flame, Grape, IceCream, Salad, Beer, Wine,
  Sandwich, Popcorn, CupSoda, Candy, FolderOpen,
  LayoutGrid,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  Coffee, UtensilsCrossed, Cookie, Wind, Ticket,
  Package, Music, Gamepad2, Sparkles, ShoppingBag,
  Flame, Grape, IceCream, Salad, Beer, Wine,
  Sandwich, Popcorn, CupSoda, Candy, FolderOpen,
  LayoutGrid,
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

export const CATEGORY_COLOR_OPTIONS = ['slate', 'violet', 'orange', 'emerald', 'rose', 'amber', 'blue', 'indigo', 'pink', 'cyan'] as const;
export type CategoryColorKey = (typeof CATEGORY_COLOR_OPTIONS)[number];

export const CATEGORY_COLOR_MAP: Record<string, { bg: string; bgActive: string; border: string; text: string; active: string; glow: string }> = {
  slate: { bg: 'bg-slate-500/10', bgActive: 'bg-slate-500/30', border: 'border-slate-500/20', text: 'text-slate-400', active: 'bg-slate-500', glow: 'shadow-slate-500/20' },
  violet: { bg: 'bg-violet-500/10', bgActive: 'bg-violet-500/30', border: 'border-violet-500/20', text: 'text-violet-400', active: 'bg-violet-500', glow: 'shadow-violet-500/20' },
  orange: { bg: 'bg-orange-500/10', bgActive: 'bg-orange-500/30', border: 'border-orange-500/20', text: 'text-orange-400', active: 'bg-orange-500', glow: 'shadow-orange-500/20' },
  emerald: { bg: 'bg-emerald-500/10', bgActive: 'bg-emerald-500/30', border: 'border-emerald-500/20', text: 'text-emerald-400', active: 'bg-emerald-500', glow: 'shadow-emerald-500/20' },
  rose: { bg: 'bg-rose-500/10', bgActive: 'bg-rose-500/30', border: 'border-rose-500/20', text: 'text-rose-400', active: 'bg-rose-500', glow: 'shadow-rose-500/20' },
  amber: { bg: 'bg-amber-500/10', bgActive: 'bg-amber-500/30', border: 'border-amber-500/20', text: 'text-amber-400', active: 'bg-amber-500', glow: 'shadow-amber-500/20' },
  blue: { bg: 'bg-blue-500/10', bgActive: 'bg-blue-500/30', border: 'border-blue-500/20', text: 'text-blue-400', active: 'bg-blue-500', glow: 'shadow-blue-500/20' },
  indigo: { bg: 'bg-indigo-500/10', bgActive: 'bg-indigo-500/30', border: 'border-indigo-500/20', text: 'text-indigo-400', active: 'bg-indigo-500', glow: 'shadow-indigo-500/20' },
  pink: { bg: 'bg-pink-500/10', bgActive: 'bg-pink-500/30', border: 'border-pink-500/20', text: 'text-pink-400', active: 'bg-pink-500', glow: 'shadow-pink-500/20' },
  cyan: { bg: 'bg-cyan-500/10', bgActive: 'bg-cyan-500/30', border: 'border-cyan-500/20', text: 'text-cyan-400', active: 'bg-cyan-500', glow: 'shadow-cyan-500/20' },
};

export function getCategoryColorConfig(colorKey?: string | null) {
  const key = colorKey && CATEGORY_COLOR_MAP[colorKey] ? colorKey : 'slate';
  return CATEGORY_COLOR_MAP[key] || CATEGORY_COLOR_MAP.slate;
}

import { usePOSStore } from '@/store/pos';

export function useMenuCategories() {
  const categories = usePOSStore((s) => s.menuCategories);
  const loading = !usePOSStore((s) => s.categoriesLoaded);
  const reload = usePOSStore((s) => s.loadMenuCategories);

  useEffect(() => {
    reload();
  }, [reload]);

  return { categories, loading, reload };
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
