import { useRef, useState, useEffect } from 'react';

interface SwipeBackConfig {
  onBack: () => void;
  edgeWidth?: number;
  threshold?: number;
  enabled?: boolean;
}

/** Minimum horizontal movement to "commit" to swipe (vs scroll) */
const COMMIT_PX = 18;
/** Cancel gesture if vertical movement exceeds this fraction of horizontal */
const VERTICAL_CANCEL_RATIO = 0.45;
/** Don't show indicator until drag exceeds this (avoids accidental flicker) */
const MIN_SHOW_PX = 20;

export function useSwipeBack({
  onBack,
  edgeWidth = 36,
  threshold = 100,
  enabled = true,
}: SwipeBackConfig) {
  const startX = useRef(0);
  const startY = useRef(0);
  const tracking = useRef(false);
  const committed = useRef(false);
  const [dragX, setDragX] = useState(0);
  const [isTracking, setIsTracking] = useState(false);
  const onBackRef = useRef(onBack);
  const thresholdRef = useRef(threshold);

  useEffect(() => {
    onBackRef.current = onBack;
    thresholdRef.current = threshold;
  });

  useEffect(() => {
    if (!enabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      const x = e.touches[0].clientX;
      if (x > edgeWidth) return;
      startX.current = x;
      startY.current = e.touches[0].clientY;
      tracking.current = true;
      committed.current = false;
      setIsTracking(true);
      setDragX(0);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!tracking.current) return;
      const dx = e.touches[0].clientX - startX.current;
      const dy = Math.abs(e.touches[0].clientY - startY.current);

      if (!committed.current && dy > Math.abs(dx) * VERTICAL_CANCEL_RATIO && dx < COMMIT_PX) {
        tracking.current = false;
        setIsTracking(false);
        setDragX(0);
        return;
      }

      if (dx > COMMIT_PX) committed.current = true;

      if (committed.current && dx > 0) {
        e.preventDefault();
      }

      setDragX(Math.max(0, dx));
    };

    const handleTouchEnd = () => {
      if (!tracking.current) {
        setDragX(0);
        setIsTracking(false);
        return;
      }
      tracking.current = false;
      setIsTracking(false);
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
      setIsTracking(false);
    };
  }, [enabled, edgeWidth]);

  const progress = Math.min(dragX / threshold, 1);
  const show = dragX > MIN_SHOW_PX;
  const visualProgress = Math.sqrt(progress);

  const slideOut = Math.min(dragX * 0.35, 28);
  const scale = 0.55 + visualProgress * 0.45;
  const opacity = 0.25 + visualProgress * 0.55;
  const overlayOpacity = visualProgress * 0.12;

  const swipeIndicatorStyle: React.CSSProperties | undefined = show
    ? {
        position: 'fixed' as const,
        left: 0,
        top: '50%',
        transform: `translate(${slideOut - 28}px, -50%) scale(${scale})`,
        width: 24,
        height: 48,
        borderRadius: '0 12px 12px 0',
        background: `rgba(108, 92, 231, ${opacity})`,
        zIndex: 9999,
        pointerEvents: 'none' as const,
        transition: isTracking ? 'none' : 'all 0.28s cubic-bezier(0.34, 1.2, 0.64, 1)',
      }
    : undefined;

  const overlayStyle: React.CSSProperties | undefined = show
    ? {
        position: 'fixed' as const,
        inset: 0,
        background: `rgba(0,0,0,${overlayOpacity})`,
        zIndex: 9998,
        pointerEvents: 'none' as const,
        transition: isTracking ? 'none' : 'all 0.28s cubic-bezier(0.34, 1.2, 0.64, 1)',
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
