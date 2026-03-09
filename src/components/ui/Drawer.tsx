import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const SIZE_RATIO: Record<string, number> = { sm: 0.6, md: 0.7, lg: 0.85, xl: 0.95 };

let _drawerCount = 0;

export function Drawer({ open, onClose, title, children, size = 'lg' }: DrawerProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [closing, setClosing] = useState(false);
  const [viewportH, setViewportH] = useState<number | null>(null);

  // Track visual viewport for keyboard adaptation
  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    if (!vv) return;

    const sync = () => {
      // Use visual viewport height so Drawer shrinks when keyboard opens
      setViewportH(vv.height);
      // Prevent page scroll behind Drawer when keyboard is open
      window.scrollTo(0, 0);
    };

    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      setViewportH(null);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      _drawerCount++;
      document.body.style.overflow = 'hidden';
      setClosing(false);
      setDragY(0);
    }
    return () => {
      if (open) {
        _drawerCount = Math.max(0, _drawerCount - 1);
        if (_drawerCount === 0) document.body.style.overflow = '';
      }
    };
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
    if (!el) return;
    const isContentArea = el.contains((e.target as Node) || null);
    if (isContentArea && el.scrollTop > 5) return;
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
  const ratio = SIZE_RATIO[size] ?? 0.85;

  // Container height: use visualViewport height if keyboard is open, otherwise full screen
  const containerHeight = viewportH != null ? `${viewportH}px` : '100dvh';

  const drawerContent = (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={title || 'Окно'}
      className="fixed inset-0 z-[100] flex items-end lg:items-center lg:justify-center overflow-hidden"
      style={{
        height: containerHeight,
        paddingTop: 'var(--safe-top)',
        paddingBottom: 'var(--safe-bottom)',
        paddingLeft: 'var(--safe-left)',
        paddingRight: 'var(--safe-right)',
      }}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 ${closing ? '' : 'animate-fade-in'}`}
        style={{
          background: 'rgba(0, 0, 0, 0.55)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          opacity,
          transition: closing ? 'opacity 0.18s, backdrop-filter 0.18s' : undefined,
        }}
        onClick={handleClose}
      />
      {/* Panel */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full lg:max-w-lg lg:rounded-2xl rounded-t-3xl overflow-hidden flex flex-col ${closing ? 'animate-slide-down' : 'lg:animate-pop-in animate-slide-up'}`}
        style={{
          maxHeight: `calc(${ratio * 100}% - var(--safe-top) - var(--safe-bottom))`,
          transform: dragY > 0 ? `translateY(${dragY}px) translateZ(0)` : 'translateZ(0)',
          transition: dragging ? 'none' : 'transform 0.2s var(--ease-spring)',
          willChange: 'transform',
          paddingTop: 'max(var(--safe-top), 0.5rem)',
          paddingBottom: 'var(--safe-bottom)',
          paddingLeft: 'var(--safe-left)',
          paddingRight: 'var(--safe-right)',
          background: 'linear-gradient(180deg, rgba(20, 24, 40, 0.95) 0%, rgba(10, 14, 26, 0.98) 100%)',
          backdropFilter: 'blur(40px) saturate(1.5)',
          WebkitBackdropFilter: 'blur(40px) saturate(1.5)',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderBottom: 'none',
        }}
      >
        {/* ── Drag Handle (PWA/MiniApp: 44px touch zone) ── */}
        <div
          className="flex flex-col items-center pt-3 pb-1 lg:hidden cursor-grab active:cursor-grabbing shrink-0 touch-none"
          style={{ minHeight: '2.75rem' }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div
            className="w-10 h-1 rounded-full"
            style={{
              background: 'linear-gradient(90deg, rgba(139, 92, 246, 0.3), rgba(6, 182, 212, 0.3))',
            }}
          />
        </div>

        {/* ── Title Bar ── */}
        <div className="flex items-center justify-between px-4 py-3 shrink-0">
          {title && (
            <h3 className="text-base font-bold text-[var(--c-text)] truncate min-w-0 flex-1 mr-2">
              {title}
            </h3>
          )}
          <button
            type="button"
            onClick={handleClose}
            className="min-w-[2.75rem] min-h-[2.75rem] w-10 h-10 rounded-xl flex items-center justify-center transition-all ml-auto active:scale-90 -mr-1"
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
            aria-label="Закрыть"
          >
            <X className="w-5 h-5 text-[var(--c-hint)]" />
          </button>
        </div>

        {/* ── Content (smooth scroll, touch pan-y for PWA/MiniApp) ── */}
        <div
          ref={contentRef}
          className="overflow-y-auto overflow-x-hidden px-4 pb-5 flex-1 min-h-0 overscroll-contain"
          style={{
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-y',
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {children}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(drawerContent, document.body) : null;
}
