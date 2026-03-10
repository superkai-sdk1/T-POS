import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Подзаголовок в шапке (например "Premium Selection") */
  subtitle?: string;
  /** Иконка или буква в градиентном блоке слева от title */
  titleIcon?: ReactNode;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const SIZE_RATIO: Record<string, number> = { sm: 0.6, md: 0.7, lg: 0.85, xl: 0.95 };
const HEIGHT_VH: Record<string, string> = { sm: '65vh', md: '75vh', lg: '88vh', xl: '95vh' };

let _drawerCount = 0;

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  titleIcon,
  children,
  size = 'lg',
}: DrawerProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [closing, setClosing] = useState(false);
  const [visible, setVisible] = useState(false);
  const [viewportBox, setViewportBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  useEffect(() => {
    if (open && !closing) {
      const t = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(t);
    }
    if (!open) setVisible(false);
  }, [open, closing]);

  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      // In iOS PWA, keyboard showing shrinks visualViewport.
      // We no longer strictly match box size to prevent layout jumps,
      // but we do trigger a small reflow.
      window.scrollTo(0, 0);
    };
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
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
    }, 300);
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

  const heightVh = HEIGHT_VH[size] ?? '88vh';

  const overlayOpacity = closing ? 0 : dragY > 0 ? Math.max(0, 1 - dragY / 200) : visible ? 1 : 0;
  const panelTranslate = closing ? '100%' : dragY > 0 ? `${dragY}px` : visible ? '0' : '100%';

  const drawerContent = (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={title || 'Окно'}
      className="z-[100] flex items-end lg:items-center lg:justify-center overflow-hidden"
      style={{
        position: 'fixed',
        inset: 0,
        height: '100%',
        zIndex: 100,
      }}
    >
      {/* Оверлей с глубоким размытием */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[8px] transition-opacity duration-500"
        style={{
          opacity: overlayOpacity,
          WebkitBackdropFilter: 'blur(8px)',
        }}
        onClick={handleClose}
      />

      {/* Bottom Sheet — контейнер */}
      <div
        className="fixed bottom-0 left-0 right-0 w-full max-w-xl lg:max-w-2xl mx-auto z-[101] transition-transform duration-700 ease-out"
        style={{
          transform: `translateY(${panelTranslate}) translateZ(0)`,
          transition: dragging ? 'none' : 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          willChange: 'transform',
          marginBottom: 'var(--safe-bottom)',
          marginLeft: 'var(--safe-left)',
          marginRight: 'var(--safe-right)',
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-[#0c0c14] sm:bg-white/[0.03] backdrop-blur-[30px] border-t border-white/10 rounded-t-[32px] sm:rounded-t-[48px] shadow-2xl flex flex-col overflow-hidden"
          style={{
            maxHeight: `min(${heightVh}, calc(100% - var(--safe-top) - var(--safe-bottom)))`,
            marginTop: 'var(--safe-top)',
            WebkitBackdropFilter: 'blur(30px)',
          }}
        >
          {/* Декоративная ручка */}
          <div
            className="w-full flex justify-center pt-4 sm:pt-6 pb-2 shrink-0 cursor-grab active:cursor-grabbing touch-none lg:cursor-default"
            style={{ minHeight: '2.5rem' }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div className="w-16 sm:w-20 h-1.5 bg-gradient-to-r from-transparent via-white/20 to-transparent rounded-full" />
          </div>

          {/* Заголовок */}
          <div className="px-6 sm:px-10 py-3 sm:py-4 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
              {titleIcon != null ? (
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shadow-lg shadow-purple-500/20 shrink-0 text-white font-black text-lg sm:text-xl">
                  {titleIcon}
                </div>
              ) : null}
              <div className="min-w-0 flex-1">
                {title ? (
                  <>
                    <h2 className="text-xl sm:text-2xl font-black tracking-tight leading-none uppercase italic text-white truncate">
                      {title}
                    </h2>
                    {subtitle ? (
                      <p className="text-white/40 text-[10px] sm:text-sm mt-0.5 uppercase tracking-tighter truncate">
                        {subtitle}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <span className="block min-h-[1.5rem]" aria-hidden />
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="p-3 sm:p-4 bg-white/5 hover:bg-rose-500/20 rounded-xl sm:rounded-2xl transition-all shrink-0 min-w-[2.75rem] min-h-[2.75rem] flex items-center justify-center group"
              aria-label="Закрыть"
            >
              <X className="w-5 h-5 sm:w-6 h-6 text-white/40 group-hover:text-rose-400 transition-colors" />
            </button>
          </div>

          {/* Контент */}
          <div
            ref={contentRef}
            className="px-6 sm:px-10 pb-6 sm:pb-10 overflow-y-auto overflow-x-hidden flex-1 min-h-0 overscroll-contain"
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
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(drawerContent, document.body) : null;
}
