import { useRef, useState, useCallback, type ReactNode } from 'react';
import { Trash2 } from 'lucide-react';

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
  const rowRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled) return;
    startX.current = e.touches[0].clientX;
    setSwiping(true);
  }, [disabled]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!swiping || disabled) return;
    const dx = e.touches[0].clientX - startX.current;
    const clamped = Math.max(-80, Math.min(0, dx));
    setOffsetX(clamped);
  }, [swiping, disabled]);

  const handleTouchEnd = useCallback(() => {
    if (!swiping) return;
    setSwiping(false);
    if (offsetX < -50) {
      setRemoving(true);
      setTimeout(onDelete, 250);
    } else {
      setOffsetX(0);
    }
  }, [swiping, offsetX, onDelete]);

  return (
    <div
      ref={rowRef}
      className={`relative overflow-hidden rounded-xl ${removing ? 'animate-swipe-out' : ''}`}
    >
      <div className="absolute inset-y-0 right-0 w-20 bg-red-500/20 flex items-center justify-center">
        <Trash2 className="w-5 h-5 text-red-400" />
      </div>
      <div
        className="relative z-10 transition-transform"
        style={{
          transform: `translateX(${offsetX}px)`,
          transitionDuration: swiping ? '0ms' : '200ms',
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
