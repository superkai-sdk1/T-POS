import type { ReactNode } from 'react';

interface TabPanelProps {
  id: string;
  activeTab: string;
  children: ReactNode;
}

export function TabPanel({ id, activeTab, children }: TabPanelProps) {
  const isActive = activeTab === id;
  return (
    <div
      className={isActive ? 'block tab-content-enter' : 'hidden'}
      aria-hidden={!isActive}
    >
      {children}
    </div>
  );
}
