import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export function Drawer({ open, onClose, title, children, size = 'lg' }: DrawerProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [closing, setClosing] = useState(false);

  const maxH = size === 'sm' ? 'max-h-[60vh]' : size === 'md' ? 'max-h-[70vh]' : 'max-h-[85vh]';

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      setClosing(false);
      setDragY(0);
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const handleClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => {
      onClose();
      setClosing(false);
    }, 200);
  }, [onClose, closing]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const el = contentRef.current;
    if (!el || el.scrollTop > 5) return;
    startY.current = e.touches[0].clientY;
    setDragging(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragging) return;
    const dy = e.touches[0].clientY - startY.current;
    setDragY(Math.max(0, dy));
  }, [dragging]);

  const handleTouchEnd = useCallback(() => {
    if (!dragging) return;
    setDragging(false);
    if (dragY > 80) {
      handleClose();
    } else {
      setDragY(0);
    }
  }, [dragging, dragY, handleClose]);

  if (!open && !closing) return null;

  const opacity = closing ? 0 : dragY > 0 ? Math.max(0, 1 - dragY / 250) : 1;

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center lg:justify-center">
      <div
        className={`absolute inset-0 bg-black/50 ${closing ? '' : 'animate-fade-in'}`}
        style={{ opacity, transition: closing ? 'opacity 0.2s' : undefined }}
        onClick={handleClose}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full ${maxH} lg:max-h-[80vh] lg:max-w-lg lg:rounded-2xl rounded-t-2xl overflow-hidden flex flex-col ${
          closing ? 'animate-slide-down' : 'lg:animate-pop-in animate-slide-up'
        }`}
        style={{
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? 'none' : 'transform 0.25s var(--ease-spring)',
          paddingBottom: 'var(--safe-bottom)',
          background: 'linear-gradient(180deg, color-mix(in srgb, var(--c-bg2) 60%, var(--c-bg)) 0%, var(--c-bg) 100%)',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.3)',
        }}
      >
        <div
          className="flex flex-col items-center pt-2 pb-1 lg:hidden cursor-grab"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-10 h-1 bg-white/15 rounded-full" />
        </div>

        <div className="flex items-center justify-between px-5 py-2">
          {title && (
            <h3 className="text-base font-bold text-[var(--c-text)]">
              {title}
            </h3>
          )}
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors ml-auto active:scale-90"
          >
            <X className="w-4 h-4 text-[var(--c-hint)]" />
          </button>
        </div>

        <div
          ref={contentRef}
          className="overflow-y-auto px-5 pb-5 flex-1"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
