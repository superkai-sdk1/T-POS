import { useRef, useState, useCallback, type ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import { hapticFeedback } from '@/lib/telegram';

interface SwipeableRowProps {
  children: ReactNode;
  onDelete: () => void;
  disabled?: boolean;
}

export function SwipeableRow({ children, onDelete, disabled }: SwipeableRowProps) {
  const startX = useRef(0);
  const [offsetX, setOffsetX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const [removing, setRemoving] = useState(false);
  const crossedThreshold = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return;
    startX.current = e.touches[0].clientX;
    setSwiping(true);
    crossedThreshold.current = false;
  }, [disabled]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!swiping || disabled) return;
    const dx = e.touches[0].clientX - startX.current;
    const clamped = Math.max(-80, Math.min(0, dx));
    setOffsetX(clamped);
    if (clamped < -50 && !crossedThreshold.current) {
      crossedThreshold.current = true;
      hapticFeedback('light');
    }
    if (clamped > -50 && crossedThreshold.current) {
      crossedThreshold.current = false;
    }
  }, [swiping, disabled]);

  const handleTouchEnd = useCallback(() => {
    if (!swiping) return;
    setSwiping(false);
    if (offsetX < -50) {
      setRemoving(true);
      hapticFeedback('medium');
      setTimeout(onDelete, 200);
    } else {
      setOffsetX(0);
    }
  }, [swiping, offsetX, onDelete]);

  return (
    <div className={`relative overflow-hidden rounded-xl ${removing ? 'animate-swipe-out' : ''}`}>
      <div className="absolute inset-y-0 right-0 w-20 bg-red-500/15 flex items-center justify-center rounded-r-xl">
        <Trash2 className="w-4 h-4 text-red-400" />
      </div>
      <div
        className="relative z-10"
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: swiping ? 'none' : 'transform 0.2s var(--ease-spring)',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}
