import { useEffect, useRef, useState, useMemo, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  titleIcon?: ReactNode;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const HEIGHT_VH: Record<string, number> = { sm: 78, md: 88, lg: 94, xl: 98 };

let _drawerCount = 0;

function useVisualViewport() {
  const [height, setHeight] = useState(() =>
    window.visualViewport?.height ?? window.innerHeight,
  );
  const [offsetTop, setOffsetTop] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    let raf = 0;
    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setHeight(vv.height);
        setOffsetTop(vv.offsetTop);
      });
    };

    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
    };
  }, []);

  return { height, offsetTop };
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const fn = () => setIsMobile(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return isMobile;
}

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
  const startY = useRef(0);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [closing, setClosing] = useState(false);
  const [visible, setVisible] = useState(false);

  const { height: vvHeight, offsetTop: vvOffset } = useVisualViewport();
  const isMobile = useIsMobile();
  const keyboardOpen = vvHeight < window.innerHeight - 60;

  const mobileHeaderOffset = useMemo(() => {
    if (typeof document === 'undefined') return 70;
    const val = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-top'));
    return Math.max((isNaN(val) ? 0 : val) + 56, 70);
  }, []);

  useEffect(() => {
    if (open && !closing) {
      const t = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(t);
    }
    if (!open) setVisible(false);
  }, [open, closing]);

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

  useEffect(() => {
    if (!open) return;
    const resetScroll = () => {
      window.scrollTo(0, 0);
    };
    resetScroll();
    window.visualViewport?.addEventListener('resize', resetScroll);
    return () => window.visualViewport?.removeEventListener('resize', resetScroll);
  }, [open]);

  const handleClose = useCallback(() => {
    if (closing) return;
    const active = document.activeElement as HTMLElement | null;
    active?.blur();
    setClosing(true);
    setTimeout(() => {
      onClose();
      setClosing(false);
    }, 300);
  }, [onClose, closing]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const el = contentRef.current;
    if (!el) return;
    if (el.contains(e.target as Node) && el.scrollTop > 5) return;
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

  const maxPct = HEIGHT_VH[size] ?? 88;
  const maxH = Math.min(
    (maxPct / 100) * vvHeight,
    vvHeight - (isMobile ? mobileHeaderOffset : 20),
  );

  const overlayOpacity = closing ? 0 : dragY > 0 ? Math.max(0, 1 - dragY / 200) : visible ? 1 : 0;
  const panelTranslate = closing ? '100%' : dragY > 0 ? `${dragY}px` : visible ? '0' : '100%';

  const drawerContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title || 'Окно'}
      className="fixed inset-0 z-[100] flex items-end lg:items-center lg:justify-center overflow-hidden"
      style={{
        top: vvOffset,
        height: vvHeight,
        transition: keyboardOpen ? 'none' : 'top 0.3s ease, height 0.3s ease',
      }}
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[8px] transition-opacity duration-500"
        style={{ opacity: overlayOpacity, WebkitBackdropFilter: 'blur(8px)' }}
        onClick={handleClose}
      />

      <div
        className="absolute bottom-0 left-0 right-0 w-full max-w-xl lg:max-w-2xl mx-auto z-[101]"
        style={{
          transform: `translateY(${panelTranslate}) translateZ(0)`,
          transition: dragging ? 'none' : 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          willChange: 'transform',
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-[#0c0c14] sm:bg-white/[0.03] backdrop-blur-[30px] border-t border-white/10 rounded-t-[32px] sm:rounded-t-[48px] shadow-2xl flex flex-col overflow-hidden"
          style={{
            maxHeight: maxH,
            WebkitBackdropFilter: 'blur(30px)',
            transition: keyboardOpen ? 'max-height 0.15s ease' : 'max-height 0.3s ease',
          }}
        >
          <div
            className="shrink-0 cursor-grab active:cursor-grabbing touch-none lg:cursor-default select-none"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div
              className="w-full flex justify-center pt-2 sm:pt-3 pb-1"
              style={{ minHeight: '2rem' }}
            >
              <div className="w-12 sm:w-16 h-1 bg-gradient-to-r from-transparent via-white/20 to-transparent rounded-full" />
            </div>

            <div className="px-6 sm:px-10 py-2 sm:py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
              {titleIcon != null ? (
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shadow-lg shadow-purple-500/20 shrink-0 text-white font-black text-base sm:text-lg">
                  {titleIcon}
                </div>
              ) : null}
              <div className="min-w-0 flex-1">
                {title ? (
                  <>
                    <h2 className="text-lg sm:text-xl font-black tracking-tight leading-none uppercase italic text-white truncate">
                      {title}
                    </h2>
                    {subtitle ? (
                      <p className="text-white/40 text-[10px] sm:text-xs mt-0.5 uppercase tracking-tighter truncate">
                        {subtitle}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <span className="block min-h-[1.25rem]" aria-hidden />
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="p-2.5 sm:p-3 bg-white/5 hover:bg-rose-500/20 rounded-xl sm:rounded-2xl transition-all shrink-0 min-w-[2.25rem] min-h-[2.25rem] flex items-center justify-center group"
              aria-label="Закрыть"
            >
              <X className="w-4 h-4 sm:w-5 h-5 text-white/40 group-hover:text-rose-400 transition-colors" />
            </button>
            </div>
          </div>

          <div
            ref={contentRef}
            className="px-6 sm:px-10 pb-4 sm:pb-6 overflow-y-auto overflow-x-hidden flex-1 min-h-0 overscroll-contain"
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
