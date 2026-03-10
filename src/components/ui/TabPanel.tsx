import { useRef, useEffect, type ReactNode } from 'react';

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

  return (
    <div
      className={isActive ? `flex-1 flex flex-col min-h-0 min-w-0 overflow-y-auto overflow-x-hidden overscroll-contain scroll-area ${animClass}` : 'hidden'}
      aria-hidden={!isActive}
    >
      {children}
    </div>
  );
}
