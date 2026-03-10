import { useState, useRef, useEffect, type ReactNode } from 'react';
import { usePOSStore } from '@/store/pos';
import { hapticFeedback } from '@/lib/telegram';

interface PullToRefreshContainerProps {
    children: ReactNode;
    activeTab: string;
    isRefreshing: boolean;
    setIsRefreshing: (val: boolean) => void;
    scrollRef: React.RefObject<HTMLElement | null>;
}

const PULL_THRESHOLD = 80;
const PULL_MAX = 120;

const getScrollContainer = (target: EventTarget | null, fallback: HTMLElement | null): HTMLElement | null => {
    let el = target instanceof HTMLElement ? target : null;
    while (el) {
        const { overflowY } = getComputedStyle(el);
        const { scrollTop, scrollHeight, clientHeight } = el;
        if ((overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') && scrollHeight > clientHeight) {
            return el;
        }
        el = el.parentElement;
    }
    return fallback;
};

const canPullToRefresh = (scrollEl: HTMLElement | null) => {
    if (!scrollEl) return false;
    return scrollEl.scrollTop <= 2;
};

export function PullToRefreshContainer({
    children,
    activeTab,
    isRefreshing,
    setIsRefreshing,
    scrollRef,
}: PullToRefreshContainerProps) {
    const activeCheck = usePOSStore((s) => s.activeCheck);
    const isOverlayOpen = () => !!document.querySelector('[role="dialog"]');

    // DOM Refs to avoid re-renders
    const spinnerRef = useRef<HTMLDivElement>(null);
    const iconRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLSpanElement>(null);

    const touchStartY = useRef(0);
    const isPullingRef = useRef(false);
    const pullReadyRef = useRef(false);
    const pullScrollContainerRef = useRef<HTMLElement | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const listenersAttached = useRef(false);

    const updateSpinnerUI = (distance: number, ready: boolean, isRefreshingState = false) => {
        if (!spinnerRef.current || !iconRef.current || !textRef.current) return;

        if (isRefreshingState) {
            spinnerRef.current.style.top = `${Math.min(PULL_THRESHOLD, PULL_MAX) - 40}px`;
            spinnerRef.current.style.opacity = '1';
            spinnerRef.current.style.transition = 'top 300ms cubic-bezier(.2,1,.3,1), opacity 200ms ease';

            iconRef.current.style.transform = '';
            iconRef.current.style.animation = 'spin 0.6s linear infinite';
            iconRef.current.className = 'w-5 h-5 rounded-full border-2 border-white/15 border-t-violet-400';

            textRef.current.textContent = 'Обновление…';
            textRef.current.className = 'text-[10px] font-black uppercase tracking-widest transition-colors text-white/70';
            return;
        }

        spinnerRef.current.style.top = `${Math.min(distance, PULL_MAX) - 40}px`;
        spinnerRef.current.style.opacity = String(Math.min(distance / 40, 1));
        spinnerRef.current.style.transition = isPullingRef.current ? 'none' : 'top 300ms cubic-bezier(.2,1,.3,1), opacity 200ms ease';

        iconRef.current.style.transform = `rotate(${distance * 3}deg)`;
        iconRef.current.style.animation = 'none';

        if (ready) {
            textRef.current.textContent = 'Отпустите';
            textRef.current.className = 'text-[10px] font-black uppercase tracking-widest transition-colors text-white/70';
        } else {
            textRef.current.textContent = 'Потяните вниз';
            textRef.current.className = 'text-[10px] font-black uppercase tracking-widest transition-colors text-white/30';
        }
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        if (activeTab !== 'pos' || activeCheck || isOverlayOpen()) return;
        const scrollEl = getScrollContainer(e.target as HTMLElement, scrollRef.current);
        if (!canPullToRefresh(scrollEl)) return;

        touchStartY.current = e.touches[0].clientY;
        pullScrollContainerRef.current = scrollEl;
        isPullingRef.current = true;
        pullReadyRef.current = false;
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!isPullingRef.current || isRefreshing) return;

        const scrollEl = pullScrollContainerRef.current ?? getScrollContainer(e.target as HTMLElement, scrollRef.current);
        if (!canPullToRefresh(scrollEl)) {
            isPullingRef.current = false;
            pullScrollContainerRef.current = null;
            pullReadyRef.current = false;
            updateSpinnerUI(0, false);
            return;
        }

        const dy = e.touches[0].clientY - touchStartY.current;
        if (dy <= 0) {
            pullReadyRef.current = false;
            updateSpinnerUI(0, false);
            return;
        }

        // prevent default overscroll rubber-banding behavior if pulling
        if (e.cancelable) {
            e.preventDefault();
        }

        const damped = Math.min(dy * 0.5, PULL_MAX);
        const ready = damped >= PULL_THRESHOLD;

        if (ready !== pullReadyRef.current) {
            if (ready) hapticFeedback('light');
            pullReadyRef.current = ready;
        }

        updateSpinnerUI(damped, ready);
    };

    const handleTouchEnd = () => {
        if (!isPullingRef.current) return;
        isPullingRef.current = false;

        const scrollEl = pullScrollContainerRef.current;
        pullScrollContainerRef.current = null;

        if (!isRefreshing && pullReadyRef.current && canPullToRefresh(scrollEl)) {
            hapticFeedback('medium');
            setIsRefreshing(true);
            updateSpinnerUI(PULL_THRESHOLD, true, true);
            setTimeout(() => window.location.reload(), 400);
            return;
        }

        pullReadyRef.current = false;
        updateSpinnerUI(0, false);
    };

    // Ensure spinner reflects refreshing state from parent immediately
    useEffect(() => {
        if (isRefreshing) {
            updateSpinnerUI(PULL_THRESHOLD, true, true);
        } else if (!isPullingRef.current) {
            updateSpinnerUI(0, false, false);
        }
    }, [isRefreshing]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el || listenersAttached.current) return;
        listenersAttached.current = true;
        const opts: AddEventListenerOptions = { passive: false };
        const touchHandler = (e: TouchEvent) => {
            if (isPullingRef.current && e.cancelable) {
                e.preventDefault();
            }
        };
        el.addEventListener('touchmove', touchHandler, opts);
        return () => {
            el.removeEventListener('touchmove', touchHandler);
            listenersAttached.current = false;
        };
    }, []);

    return (
        <div
            className="contents relative h-full w-full"
            ref={containerRef}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {/* ── Spinner UI ── */}
            {activeTab === 'pos' && !activeCheck && (
                <div
                    ref={spinnerRef}
                    className="pointer-events-none absolute left-0 right-0 z-[50] flex justify-center"
                    style={{
                        top: '-40px',
                        opacity: 0,
                        transition: 'top 300ms cubic-bezier(.2,1,.3,1), opacity 200ms ease',
                    }}
                >
                    <div className="px-4 py-2 rounded-full bg-white/[0.08] backdrop-blur-2xl border border-white/10 flex items-center gap-2.5 shadow-lg">
                        <div
                            ref={iconRef}
                            className="w-5 h-5 rounded-full border-2 border-white/15 border-t-violet-400 transition-transform"
                        />
                        <span
                            ref={textRef}
                            className="text-[10px] font-black uppercase tracking-widest transition-colors text-white/30"
                        >
                            Потяните вниз
                        </span>
                    </div>
                </div>
            )}
            {children}
        </div>
    );
}
