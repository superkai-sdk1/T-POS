import { useRef, useEffect, type ReactNode } from 'react';
import { usePOSStore } from '@/store/pos';

interface PullToRefreshContainerProps {
    children: ReactNode;
    activeTab: string;
    isRefreshing: boolean;
    setIsRefreshing: (val: boolean) => void;
    scrollRef: React.RefObject<HTMLElement | null>;
}

const PULL_THRESHOLD = 80;
const PULL_MAX = 120;

export function PullToRefreshContainer({
    children,
    activeTab,
    isRefreshing,
}: PullToRefreshContainerProps) {
    const activeCheck = usePOSStore((s) => s.activeCheck);

    const spinnerRef = useRef<HTMLDivElement>(null);
    const iconRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLSpanElement>(null);

    const updateSpinnerUI = (_distance: number, _ready: boolean, isRefreshingState = false) => {
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
        } else {
            spinnerRef.current.style.top = '-40px';
            spinnerRef.current.style.opacity = '0';
            spinnerRef.current.style.transition = 'top 300ms cubic-bezier(.2,1,.3,1), opacity 200ms ease';

            iconRef.current.style.transform = '';
            iconRef.current.style.animation = 'none';
            textRef.current.textContent = 'Потяните вниз';
            textRef.current.className = 'text-[10px] font-black uppercase tracking-widest transition-colors text-white/30';
        }
    };

    useEffect(() => {
        if (isRefreshing) {
            updateSpinnerUI(PULL_THRESHOLD, true, true);
        } else {
            updateSpinnerUI(0, false, false);
        }
    }, [isRefreshing]);

    return (
        <div className="contents relative h-full w-full">
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
