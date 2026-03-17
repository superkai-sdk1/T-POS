import { create } from 'zustand';
import type { ReactNode } from 'react';

export interface HeaderConfig {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightContent?: ReactNode;
  hideSystemButtons?: boolean;
}

interface LayoutState {
  hideReasons: Set<string>;
  header: HeaderConfig | null;
  triggerNewCheck: number;
  addHideReason: (id: string) => void;
  removeHideReason: (id: string) => void;
  clearAllHideReasons: () => void;
  setHeader: (config: HeaderConfig | null) => void;
  requestNewCheck: () => void;
}

export const useLayoutStore = create<LayoutState>((set) => ({
  hideReasons: new Set(),
  header: null,
  triggerNewCheck: 0,
  addHideReason: (id) => set((s) => {
    const next = new Set(s.hideReasons);
    next.add(id);
    return { hideReasons: next };
  }),
  removeHideReason: (id) => set((s) => {
    const next = new Set(s.hideReasons);
    next.delete(id);
    return { hideReasons: next };
  }),
  clearAllHideReasons: () => set({ hideReasons: new Set() }),
  setHeader: (config) => set({ header: config }),
  requestNewCheck: () => set({ triggerNewCheck: Date.now() }),
}));

export const useHideNav = () => useLayoutStore((s) => s.hideReasons.size > 0);
export const useHasHideReason = (id: string) => useLayoutStore((s) => s.hideReasons.has(id));
export const useHeader = () => useLayoutStore((s) => s.header);
export const useSetHeader = () => useLayoutStore((s) => s.setHeader);
export const useTriggerNewCheck = () => useLayoutStore((s) => s.triggerNewCheck);
