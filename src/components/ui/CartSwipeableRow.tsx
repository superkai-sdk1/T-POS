import { useRef, useState, useCallback, type ReactNode } from 'react';
import { Trash2, Plus, Minus } from 'lucide-react';
import { hapticFeedback } from '@/lib/telegram';

interface CartSwipeableRowProps {
    children: ReactNode;
    quantity: number;
    onIncrement?: () => void;
    onDecrement?: () => void;
    onRemove: () => void;
    disabled?: boolean;
}

const LOCK_THRESHOLD = 12; // px to decide scroll vs swipe
const SWIPE_THRESHOLD = 50;

export function CartSwipeableRow({ children, quantity, onIncrement, onDecrement, onRemove, disabled }: CartSwipeableRowProps) {
    const startX = useRef(0);
    const startY = useRef(0);
    const lockedHorizontal = useRef<boolean | null>(null);
    const [offsetX, setOffsetX] = useState(0);
    const [swiping, setSwiping] = useState(false);
    const [removing, setRemoving] = useState(false);
    const crossedThreshold = useRef(false);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        if (disabled) return;
        startX.current = e.touches[0].clientX;
        startY.current = e.touches[0].clientY;
        lockedHorizontal.current = null;
        setSwiping(true);
        crossedThreshold.current = false;
    }, [disabled]);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (!swiping || disabled) return;
        const dx = e.touches[0].clientX - startX.current;
        const dy = e.touches[0].clientY - startY.current;

        // Direction lock: vertical scroll vs horizontal swipe
        if (lockedHorizontal.current === null) {
            const absDx = Math.abs(dx);
            const absDy = Math.abs(dy);
            if (absDy > absDx && absDy > LOCK_THRESHOLD) {
                lockedHorizontal.current = false; // vertical scroll — don't swipe
                setSwiping(false);
                return;
            }
            if (absDx > absDy && absDx > LOCK_THRESHOLD) {
                lockedHorizontal.current = true;
            } else {
                return;
            }
        }
        if (!lockedHorizontal.current) return;

        // We allow swiping from -80 (Left swipe) to +80 (Right swipe)
        const clamped = Math.max(-80, Math.min(80, dx));
        setOffsetX(clamped);

        if (Math.abs(clamped) > SWIPE_THRESHOLD && !crossedThreshold.current) {
            crossedThreshold.current = true;
            hapticFeedback('light');
        }
        if (Math.abs(clamped) < SWIPE_THRESHOLD && crossedThreshold.current) {
            crossedThreshold.current = false;
        }
    }, [swiping, disabled]);

    const handleTouchEnd = useCallback(() => {
        if (!swiping) return;
        setSwiping(false);

        if (offsetX > SWIPE_THRESHOLD) {
            // Swiped Right -> Increment
            hapticFeedback('medium');
            onIncrement?.();
            // Snap back to 0
            setOffsetX(0);
        } else if (offsetX < -SWIPE_THRESHOLD) {
            // Swiped Left -> Decrement or Remove
            hapticFeedback('medium');
            if (quantity > 1) {
                onDecrement?.();
                setOffsetX(0);
            } else {
                setRemoving(true);
                setTimeout(onRemove, 200);
            }
        } else {
            // Didn't cross threshold, snap back
            setOffsetX(0);
        }
    }, [swiping, offsetX, quantity, onIncrement, onDecrement, onRemove]);

    const isAdding = offsetX > 0;
    const isRemovingOrSubs = offsetX < 0;

    return (
        <div className={`relative overflow-hidden rounded-2xl ${removing ? 'animate-swipe-out' : ''}`}>
            {/* Background container that reveals the icon based on direction */}
            <div className="absolute inset-0 flex">
                {/* Left side (Revealed when swiping right -> Add) */}
                {isAdding && (
                    <div className="flex-1 bg-emerald-500/15 flex items-center justify-start pl-6 rounded-l-2xl">
                        <Plus className="w-5 h-5 text-emerald-500" />
                    </div>
                )}

                {/* Right side (Revealed when swiping left -> Subtract or Trash) */}
                {isRemovingOrSubs && (
                    <div className="flex-1 right-0 flex justify-end">
                        <div className={`w-20 flex items-center justify-center rounded-r-2xl ${quantity > 1 ? 'bg-[var(--c-warning-bg)]' : 'bg-[var(--c-danger-bg)]'}`}>
                            {quantity > 1 ? (
                                <Minus className="w-5 h-5 text-[var(--c-warning)]" />
                            ) : (
                                <Trash2 className="w-5 h-5 text-[var(--c-danger)]" />
                            )}
                        </div>
                    </div>
                )}
            </div>

            <div
                className="relative z-10 bg-[var(--c-bg)]"
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
