import { create } from 'zustand';

interface LayoutState {
  hideReasons: Set<string>;
  addHideReason: (id: string) => void;
  removeHideReason: (id: string) => void;
}

export const useLayoutStore = create<LayoutState>((set) => ({
  hideReasons: new Set(),
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
}));

export const useHideNav = () => useLayoutStore((s) => s.hideReasons.size > 0);
