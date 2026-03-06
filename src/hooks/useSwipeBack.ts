import { useRef, useState, useEffect } from 'react';

interface SwipeBackConfig {
  onBack: () => void;
  edgeWidth?: number;
  threshold?: number;
  enabled?: boolean;
}

export function useSwipeBack({
  onBack,
  edgeWidth = 50,
  threshold = 60,
  enabled = true,
}: SwipeBackConfig) {
  const startX = useRef(0);
  const startY = useRef(0);
  const tracking = useRef(false);
  const committed = useRef(false);
  const [dragX, setDragX] = useState(0);
  const onBackRef = useRef(onBack);
  const thresholdRef = useRef(threshold);

  onBackRef.current = onBack;
  thresholdRef.current = threshold;

  useEffect(() => {
    if (!enabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      const x = e.touches[0].clientX;
      if (x > edgeWidth) return;
      startX.current = x;
      startY.current = e.touches[0].clientY;
      tracking.current = true;
      committed.current = false;
      setDragX(0);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!tracking.current) return;
      const dx = e.touches[0].clientX - startX.current;
      const dy = Math.abs(e.touches[0].clientY - startY.current);

      if (!committed.current && dy > Math.abs(dx) * 0.6 && dx < 12) {
        tracking.current = false;
        setDragX(0);
        return;
      }

      if (dx > 8) committed.current = true;

      if (committed.current && dx > 0) {
        e.preventDefault();
      }

      setDragX(Math.max(0, dx));
    };

    const handleTouchEnd = () => {
      if (!tracking.current) {
        setDragX(0);
        return;
      }
      tracking.current = false;
      setDragX((prev) => {
        if (prev >= thresholdRef.current) {
          setTimeout(() => onBackRef.current(), 0);
        }
        return 0;
      });
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    document.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', handleTouchEnd);
      tracking.current = false;
      setDragX(0);
    };
  }, [enabled, edgeWidth]);

  const progress = Math.min(dragX / threshold, 1);
  const show = dragX > 6;

  const swipeIndicatorStyle: React.CSSProperties | undefined = show
    ? {
        position: 'fixed' as const,
        left: 0,
        top: '50%',
        transform: `translate(${Math.min(dragX * 0.4, 24) - 24}px, -50%) scale(${0.6 + progress * 0.4})`,
        width: 24,
        height: 48,
        borderRadius: '0 12px 12px 0',
        background: `rgba(108, 92, 231, ${0.3 + progress * 0.5})`,
        zIndex: 9999,
        pointerEvents: 'none' as const,
        transition: tracking.current ? 'none' : 'all 0.22s cubic-bezier(0.22,1,0.36,1)',
      }
    : undefined;

  const overlayStyle: React.CSSProperties | undefined = show
    ? {
        position: 'fixed' as const,
        inset: 0,
        background: `rgba(0,0,0,${progress * 0.08})`,
        zIndex: 9998,
        pointerEvents: 'none' as const,
        transition: tracking.current ? 'none' : 'all 0.22s cubic-bezier(0.22,1,0.36,1)',
      }
    : undefined;

  return {
    swipeBackHandlers: {},
    swipeIndicatorStyle,
    overlayStyle,
    isDragging: show,
    progress,
  };
}
