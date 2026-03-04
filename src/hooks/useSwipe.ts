import { useRef, useCallback } from 'react';

interface SwipeConfig {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeDown?: () => void;
  threshold?: number;
  velocityThreshold?: number;
}

export function useSwipe(config: SwipeConfig) {
  const startX = useRef(0);
  const startY = useRef(0);
  const startTime = useRef(0);
  const tracking = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    startTime.current = Date.now();
    tracking.current = true;
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!tracking.current) return;
    tracking.current = false;

    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const dx = endX - startX.current;
    const dy = endY - startY.current;
    const elapsed = Date.now() - startTime.current;
    const threshold = config.threshold ?? 50;
    const velThreshold = config.velocityThreshold ?? 0.3;
    const velocity = Math.abs(dx) / Math.max(elapsed, 1);

    if (Math.abs(dx) > Math.abs(dy) * 1.2 && (Math.abs(dx) > threshold || velocity > velThreshold)) {
      if (dx < 0) config.onSwipeLeft?.();
      else config.onSwipeRight?.();
    } else if (dy > threshold && Math.abs(dy) > Math.abs(dx) * 1.2) {
      config.onSwipeDown?.();
    }
  }, [config]);

  return { onTouchStart, onTouchEnd };
}
