import { useRef, useEffect, type ReactNode } from 'react';
import { useHideNav } from '@/store/layout';

interface TabPanelProps {
  id: string;
  activeTab: string;
  prevTab?: string;
  tabOrder?: string[];
  children: ReactNode;
}

export function TabPanel({ id, activeTab, prevTab, tabOrder, children }: TabPanelProps) {
  const isActive = activeTab === id;
  const prevActiveRef = useRef<string | null>(null);
  const hideNav = useHideNav();

  useEffect(() => {
    if (isActive) {
      prevActiveRef.current = id;
    }
  }, [isActive, id]);

  let animClass = 'tab-content-enter';
  if (tabOrder && prevTab && prevTab !== id) {
    const fromIdx = tabOrder.indexOf(prevTab);
    const toIdx = tabOrder.indexOf(id);
    if (fromIdx >= 0 && toIdx >= 0) {
      animClass = toIdx > fromIdx ? 'tab-enter-right' : 'tab-enter-left';
    }
  }

  const pbNav = id !== 'pos' && !hideNav ? 'pb-24 lg:pb-0' : '';

  return (
    <div
      className={isActive ? `flex-1 flex flex-col min-h-0 min-w-0 overflow-y-auto overflow-x-hidden overscroll-contain scroll-area ${id === 'pos' ? 'lg:overflow-hidden lg:!h-full' : ''} ${pbNav} ${animClass}` : 'hidden'}
      aria-hidden={!isActive}
    >
      {children}
    </div>
  );
}
