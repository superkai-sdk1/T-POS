import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export function Drawer({ open, onClose, title, children }: DrawerProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [closing, setClosing] = useState(false);

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
    setClosing(true);
    setTimeout(onClose, 250);
  }, [onClose]);

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
    if (dragY > 100) {
      handleClose();
    } else {
      setDragY(0);
    }
  }, [dragging, dragY, handleClose]);

  if (!open && !closing) return null;

  const opacity = closing ? 0 : dragY > 0 ? Math.max(0, 1 - dragY / 300) : 1;

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center lg:justify-center">
      <div
        className={`absolute inset-0 bg-black/60 ${closing ? '' : 'animate-fade-in'}`}
        style={{ opacity }}
        onClick={handleClose}
      />
      <div
        className={`relative w-full max-h-[85vh] lg:max-h-[80vh] lg:max-w-lg lg:rounded-2xl rounded-t-3xl overflow-hidden flex flex-col ${
          closing ? 'animate-slide-down' : 'lg:animate-pop-in animate-slide-up'
        }`}
        style={{
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? 'none' : 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
          paddingBottom: 'var(--safe-bottom)',
          background: 'var(--tg-theme-bg-color, #0f0f23)',
        }}
      >
        {/* Drag handle */}
        <div
          className="flex flex-col items-center pt-2 pb-0 lg:hidden cursor-grab"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-9 h-1 bg-white/20 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3">
          {title && (
            <h3 className="text-lg font-bold text-[var(--tg-theme-text-color,#e0e0e0)]">
              {title}
            </h3>
          )}
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors ml-auto active:scale-90"
          >
            <X className="w-4 h-4 text-[var(--tg-theme-hint-color,#888)]" />
          </button>
        </div>

        {/* Content */}
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
