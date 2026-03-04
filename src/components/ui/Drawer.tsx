import { useEffect, useRef, type ReactNode } from 'react';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export function Drawer({ open, onClose, title, children }: DrawerProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center lg:justify-center">
      <div
        ref={backdropRef}
        className="absolute inset-0 bg-black/50 animate-fade-in"
        onClick={onClose}
      />
      <div
        className="relative w-full max-h-[85vh] lg:max-h-[80vh] lg:max-w-lg lg:rounded-2xl bg-[var(--tg-theme-bg-color,#1a1a2e)] rounded-t-2xl animate-slide-up lg:animate-pop-in overflow-hidden flex flex-col"
        style={{ paddingBottom: 'var(--safe-bottom)' }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="w-10 h-1 bg-white/30 rounded-full mx-auto absolute top-2 left-1/2 -translate-x-1/2 lg:hidden" />
          {title && (
            <h3 className="text-lg font-semibold text-[var(--tg-theme-text-color,#e0e0e0)] mt-2 lg:mt-0">
              {title}
            </h3>
          )}
          <button
            onClick={onClose}
            className="text-[var(--tg-theme-hint-color,#888)] hover:text-white transition-colors mt-2 lg:mt-0 ml-auto"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto p-4 flex-1">{children}</div>
      </div>
    </div>
  );
}
