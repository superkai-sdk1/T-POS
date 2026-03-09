import { useMemo, useState, useRef, useEffect, type ReactNode } from 'react';
import { useAuthStore } from '@/store/auth';
import { useShiftStore } from '@/store/shift';
import { supabase } from '@/lib/supabase';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { hapticFeedback, hapticNotification } from '@/lib/telegram';
import { ShiftAnalytics as ShiftAnalyticsModal } from '@/components/shift/ShiftAnalytics';
import {
  Receipt, Package, BarChart3, LogOut, Settings, Calendar,
  Menu, RefreshCw, PlayCircle, StopCircle, AlertTriangle, X
} from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function Layout({ children, activeTab, onTabChange }: LayoutProps) {
  const user = useAuthStore((s) => s.user);
  const isOwner = useAuthStore((s) => s.isOwner);

  // Shift logic & states
  const { activeShift, openShift, closeShift, getShiftAnalytics, cashInRegister } = useShiftStore();
  const [showOpen, setShowOpen] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [cashStart, setCashStart] = useState('');
  const [cashEnd, setCashEnd] = useState('');
  const [closeNote, setCloseNote] = useState('');
  const [closeError, setCloseError] = useState('');
  const [isClosing, setIsClosing] = useState(false);
  const [analytics, setAnalytics] = useState<Awaited<ReturnType<typeof getShiftAnalytics>>>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);

  // Layout states
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const scrollRef = useRef<HTMLElement>(null);
  const touchStartY = useRef(0);

  const tabs = useMemo(() => isOwner()
    ? [
      { id: 'pos', label: 'Касса', icon: Receipt },
      { id: 'events', label: 'События', icon: Calendar },
      { id: 'dashboard', label: 'Отчёты', icon: BarChart3 },
      { id: 'management', label: 'Меню', icon: Settings },
    ]
    : [
      { id: 'pos', label: 'Касса', icon: Receipt },
      { id: 'events', label: 'События', icon: Calendar },
      { id: 'inventory', label: 'Остатки', icon: Package },
      { id: 'dashboard', label: 'Отчёты', icon: BarChart3 },
    ],
    [isOwner]);

  const fmtCur = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + '₽';

  const [shiftDurationStr, setShiftDurationStr] = useState('');

  useEffect(() => {
    if (!activeShift) {
      return;
    }
    const update = () => {
      const ms = Date.now() - new Date(activeShift.opened_at).getTime();
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      setShiftDurationStr(`${h}ч ${m}м`);
    };
    update();
    const iv = setInterval(update, 60000);
    return () => {
      clearInterval(iv);
      setShiftDurationStr('');
    };
  }, [activeShift]);

  const pmLabel = (m: string) => {
    const map: Record<string, string> = { cash: 'Наличные', card: 'Карта', debt: 'Долг', bonus: 'Бонусы', split: 'Разделённая' };
    return map[m] || m;
  };

  const handleOpenDrawer = () => {
    setShowOpen(true);
    // Pre-fill cash from last closed shift (non-blocking)
    supabase
      .from('shifts')
      .select('cash_end')
      .eq('status', 'closed')
      .order('closed_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data: lastShift }) => {
        if (lastShift?.cash_end != null) {
          setCashStart(String(lastShift.cash_end));
        }
      });
  };

  const handleOpen = async () => {
    hapticFeedback('medium');
    const shift = await openShift(Number(cashStart) || 0);
    if (shift) {
      hapticNotification('success');
      setShowOpen(false);
      setCashStart('');
    }
  };

  const handleStartClose = () => {
    if (!activeShift) return;
    hapticFeedback('medium');
    setCloseError('');
    setAnalytics(null);
    setIsClosing(true);

    // Open drawer IMMEDIATELY — show loading state inside
    if (cashInRegister !== null) {
      setCashEnd(String(cashInRegister));
    }
    setShowClose(true);

    // Check for open checks + load analytics in background
    (async () => {
      try {
        const { count } = await supabase
          .from('checks')
          .select('id', { count: 'exact', head: true })
          .eq('shift_id', activeShift.id)
          .eq('status', 'open');
        if (count && count > 0) {
          setCloseError(`Невозможно закрыть смену: ${count} открытых чеков. Закройте все чеки и повторите.`);
          hapticNotification('error');
          setIsClosing(false);
          return;
        }
      } catch {
        // Network error — still allow to try closing
      }

      // Load analytics (non-blocking)
      try {
        const data = await getShiftAnalytics(activeShift.id);
        setAnalytics(data);
      } catch {
        // Analytics failed — not critical
      }
      setIsClosing(false);
    })();
  };

  const handleConfirmClose = async () => {
    hapticFeedback('heavy');
    const ok = await closeShift(Number(cashEnd) || 0, closeNote);
    if (ok) {
      hapticNotification('success');
      setShowClose(false);
      setCashEnd('');
      setCloseNote('');
      setCloseError('');
      setShowAnalytics(true);
    } else {
      setCloseError('Не удалось закрыть смену. Проверьте открытые чеки.');
      hapticNotification('error');
    }
  };

  const triggerShiftAction = () => {
    hapticFeedback('heavy');
    if (activeShift) {
      handleStartClose();
    } else {
      handleOpenDrawer();
    }
  };

  // Mobile header tap handler — simple tap to open/close shift
  const handleHeaderTap = () => {
    triggerShiftAction();
  };

  // Pull to refresh hook — only on POS tab
  const handleTouchStart = (e: React.TouchEvent) => {
    if (activeTab !== 'pos') return;
    if (!scrollRef.current || scrollRef.current.scrollTop > 5) return;
    touchStartY.current = e.touches[0].clientY;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (activeTab !== 'pos') return;
    if (isRefreshing || !scrollRef.current || scrollRef.current.scrollTop > 5) return;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (dy > 120) {
      hapticFeedback('medium');
      setIsRefreshing(true);
      setTimeout(() => {
        window.location.reload();
      }, 300);
    }
  };

  return (
    <div className="h-[100dvh] flex flex-col lg:flex-row overflow-hidden relative">
      {/* ── Desktop sidebar ── */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 fixed top-0 left-0 h-full z-40 transition-all duration-300 ${isSidebarExpanded ? 'w-[240px]' : 'w-[72px] items-center'}`}
        style={{
          paddingTop: 'var(--safe-top)',
          paddingBottom: 'var(--safe-bottom)',
          background: 'rgba(10, 14, 26, 0.75)',
          backdropFilter: 'blur(40px) saturate(1.5)',
          WebkitBackdropFilter: 'blur(40px) saturate(1.5)',
          borderRight: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        <div className={`py-5 flex items-center ${isSidebarExpanded ? 'px-5 justify-between' : 'justify-center'}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(6, 182, 212, 0.15))', boxShadow: '0 0 20px rgba(139, 92, 246, 0.15)' }}>
              <img src="/icons/tpos.svg" alt="T-POS" className="w-7 h-7 drop-shadow-lg" />
            </div>
            {isSidebarExpanded && <span className="font-bold text-white tracking-wide">T-POS</span>}
          </div>
          {isSidebarExpanded && (
            <button onClick={() => setIsSidebarExpanded(false)} className="text-[var(--c-hint)] hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {!isSidebarExpanded && (
          <button
            onClick={() => setIsSidebarExpanded(true)}
            className="w-11 h-11 mx-auto mt-2 rounded-xl flex items-center justify-center text-[var(--c-hint)] hover:text-white transition-all bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.06)]"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        <nav className={`flex-1 flex flex-col pt-4 overflow-y-auto no-scrollbar ${isSidebarExpanded ? 'px-3 gap-1' : 'items-center gap-1.5'}`}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                title={isSidebarExpanded ? undefined : tab.label}
                className={`transition-all duration-200 tap relative flex items-center ${isSidebarExpanded ? 'w-full h-12 px-3 rounded-xl gap-3' : 'w-11 h-11 rounded-2xl justify-center'
                  } ${isActive ? 'text-white' : 'text-[var(--c-hint)] hover:text-[var(--c-text)] hover:bg-[rgba(255,255,255,0.06)]'}`}
                style={isActive ? {
                  background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(6, 182, 212, 0.1))',
                  boxShadow: '0 0 16px rgba(139, 92, 246, 0.15)',
                } : undefined}
              >
                {isActive && !isSidebarExpanded && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                    style={{ background: 'linear-gradient(180deg, #8b5cf6, #06b6d4)', boxShadow: '0 0 8px rgba(139, 92, 246, 0.4)' }}
                  />
                )}
                <tab.icon className={`w-5 h-5 shrink-0 ${isActive ? 'stroke-[2.5]' : ''}`} />
                {isSidebarExpanded && <span className="font-semibold text-[13px]">{tab.label}</span>}
              </button>
            );
          })}

          {isSidebarExpanded && (
            <div className="mt-8 mb-4 px-1 space-y-3">
              <div className="h-px w-full bg-[rgba(255,255,255,0.06)]" />
              <div className="px-2">
                <p className="text-[10px] uppercase tracking-widest text-[var(--c-muted)] font-bold mb-2">Смена</p>
                {activeShift ? (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-[13px]">
                      <span className="text-[var(--c-hint)]">Статус</span>
                      <span className="text-[var(--c-success)] font-semibold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--c-success)] animate-pulse" /> Открыта
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-[13px]">
                      <span className="text-[var(--c-hint)]">Время</span>
                      <span className="text-white tabular-nums">{shiftDurationStr}</span>
                    </div>
                    {cashInRegister !== null && (
                      <div className="flex justify-between items-center text-[13px]">
                        <span className="text-[var(--c-hint)]">В кассе</span>
                        <span className="text-white font-bold tabular-nums">{fmtCur(cashInRegister)}</span>
                      </div>
                    )}
                    <Button fullWidth variant="danger" size="sm" onClick={handleStartClose} className="mt-3">
                      Закрыть смену
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3 text-center py-2">
                    <p className="text-[13px] text-[var(--c-danger)] font-semibold">Смена закрыта</p>
                    <Button fullWidth variant="primary" size="sm" onClick={handleOpenDrawer}>
                      Открыть смену
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </nav>

        <div className={`pb-5 pt-3 mt-auto shrink-0 ${isSidebarExpanded ? 'px-4 flex flex-col gap-2' : 'flex flex-col items-center gap-3'}`}>
          <div className="h-px w-full bg-[rgba(255,255,255,0.06)] mb-2" />

          {/* Shift button in collapsed sidebar */}
          {!isSidebarExpanded && (
            <button
              onClick={triggerShiftAction}
              title={activeShift ? 'Закрыть смену' : 'Открыть смену'}
              className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all tap ${
                activeShift
                  ? 'text-[var(--c-danger)] hover:bg-[rgba(251,113,133,0.08)]'
                  : 'text-[var(--c-success)] hover:bg-[rgba(52,211,153,0.08)]'
              }`}
            >
              {activeShift ? <StopCircle className="w-5 h-5" /> : <PlayCircle className="w-5 h-5" />}
            </button>
          )}
          {isSidebarExpanded && (
            <button
              onClick={() => window.location.reload()}
              className="w-full h-11 rounded-xl flex items-center gap-3 px-3 text-[var(--c-hint)] hover:text-white hover:bg-[rgba(255,255,255,0.06)] transition-all tap"
            >
              <RefreshCw className="w-5 h-5 shrink-0" />
              <span className="font-semibold text-[13px]">Обновить</span>
            </button>
          )}
          <div className={`flex items-center gap-3 ${isSidebarExpanded ? 'w-full px-3 py-2 rounded-xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.04)]' : 'flex-col'}`}>
            <div className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(6, 182, 212, 0.1))', border: '1px solid rgba(139, 92, 246, 0.15)' }}>
              <span className="text-[11px] font-bold text-[var(--c-accent-light)]">
                {user?.nickname?.charAt(0).toUpperCase()}
              </span>
            </div>
            {isSidebarExpanded && (
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-white truncate">{user?.nickname}</p>
                <p className="text-[10px] text-[var(--c-muted)]">{isOwner() ? 'Владелец' : 'Сотрудник'}</p>
              </div>
            )}
            <button
              onClick={() => useAuthStore.getState().logout()}
              title="Выход"
              className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center text-[var(--c-hint)] hover:bg-[rgba(251,113,133,0.08)] hover:text-[var(--c-danger)] transition-all tap"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div
        className="flex-1 flex flex-col overflow-hidden transition-all duration-300"
        style={{ marginLeft: typeof window !== 'undefined' && window.innerWidth >= 1024 ? (isSidebarExpanded ? '240px' : '72px') : 0 }}
      >
        {/* ── Mobile header ── */}
        {activeTab === 'pos' ? (
          /* Shift header — only on POS tab */
          <header
            className="lg:hidden shrink-0 z-40 select-none relative"
            style={{
              paddingTop: `var(--safe-top)`,
              height: 'calc(var(--safe-top) + 65px)',
              background: 'rgba(10, 14, 26, 0.85)',
              backdropFilter: 'blur(40px) saturate(1.8)',
              WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            }}
            onContextMenu={(e) => e.preventDefault()}
          >
            {/* Logout button — top-left */}
            <button
              onClick={() => useAuthStore.getState().logout()}
              className="absolute top-0 left-3 z-10 w-9 h-9 rounded-xl flex items-center justify-center text-[var(--c-hint)] active:scale-90 transition-all"
              style={{ marginTop: 'calc(var(--safe-top) + 10px)' }}
            >
              <LogOut className="w-4 h-4" />
            </button>

            {/* Shift info — tappable center */}
            <div
              className="absolute inset-0 flex flex-col items-center justify-center pt-[var(--safe-top)] cursor-pointer"
              onClick={handleHeaderTap}
            >
              <h1 className={`text-[12px] uppercase tracking-[0.15em] font-black ${activeShift ? 'text-[var(--c-success)]' : 'text-[var(--c-danger)]'}`}>
                {activeShift ? 'Смена открыта' : 'Смена закрыта'}
              </h1>
              <div className="flex items-center justify-center mt-1">
                <span className={`text-[18px] font-black tabular-nums tracking-tight ${cashInRegister === null ? 'opacity-0' : 'text-white'}`}>
                  {fmtCur(cashInRegister ?? 0)}
                </span>
              </div>
            </div>

            {/* Pull to refresh visual indicator */}
            {isRefreshing && (
              <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-[var(--c-accent)] flex items-center justify-center animate-bounce shadow-lg z-50">
                <RefreshCw className="w-3.5 h-3.5 text-white animate-spin" />
              </div>
            )}
          </header>
        ) : (
          /* Compact header — other tabs */
          <header
            className="lg:hidden shrink-0 z-40 select-none relative"
            style={{
              paddingTop: `var(--safe-top)`,
              height: 'calc(var(--safe-top) + 50px)',
              background: 'rgba(10, 14, 26, 0.85)',
              backdropFilter: 'blur(40px) saturate(1.8)',
              WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <div className="absolute inset-0 flex items-center justify-between px-4 pt-[var(--safe-top)]">
              <h1 className="text-[15px] font-bold text-white">
                {tabs.find(t => t.id === activeTab)?.label ?? ''}
              </h1>
              <button
                onClick={() => useAuthStore.getState().logout()}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-[var(--c-hint)] active:scale-90 transition-all"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </header>
        )}

        <main
          ref={scrollRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          className="flex-1 px-4 py-3 lg:px-5 lg:py-4 w-full overflow-y-auto overflow-x-hidden flex flex-col"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {children}
        </main>

        {/* ── Mobile bottom nav — glass tab bar ── */}
        <nav
          className="lg:hidden shrink-0 z-40"
          style={{
            paddingBottom: 'max(var(--tg-safe-bottom), calc(env(safe-area-inset-bottom, 0px) * 0.5))',
            transform: 'translateZ(0)',
            background: 'rgba(10, 14, 26, 0.85)',
            backdropFilter: 'blur(40px) saturate(1.6)',
            WebkitBackdropFilter: 'blur(40px) saturate(1.6)',
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            boxShadow: '0 -4px 30px rgba(0, 0, 0, 0.3)',
          }}
        >
          <div className="flex max-w-3xl mx-auto" style={{ height: 'var(--nav-height)' }}>
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-all duration-200 active:scale-90 relative shrink-0 min-w-0`}
                >
                  {/* Active glow indicator */}
                  {isActive && (
                    <div
                      className="absolute -top-px left-1/2 -translate-x-1/2 h-[2px] rounded-full"
                      style={{
                        width: '28px',
                        background: 'linear-gradient(90deg, #8b5cf6, #06b6d4)',
                        boxShadow: '0 0 10px rgba(139, 92, 246, 0.5), 0 0 20px rgba(139, 92, 246, 0.2)',
                        animation: 'nav-indicator-glow 3s ease-in-out infinite',
                      }}
                    />
                  )}

                  {/* Icon with glow background */}
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200 ${isActive ? '' : ''
                      }`}
                    style={isActive ? {
                      background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(6, 182, 212, 0.08))',
                    } : undefined}
                  >
                    <tab.icon
                      className={`w-[20px] h-[20px] shrink-0 transition-all duration-200 ${isActive ? 'stroke-[2.5] text-white' : 'stroke-[1.5] text-[var(--c-hint)]'
                        }`}
                    />
                  </div>

                  <span
                    className={`text-[10px] font-semibold truncate w-full px-1 transition-all duration-200 ${isActive ? 'text-white opacity-100' : 'text-[var(--c-hint)] opacity-50'
                      }`}
                  >
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      {/* ── Shift Modals ── */}
      <Drawer open={showOpen} onClose={() => setShowOpen(false)} title="Открыть смену" size="sm">
        <div className="space-y-3">
          <Input
            type="number"
            label="Наличные в кассе"
            placeholder="Сумма на начало"
            value={cashStart}
            onChange={(e) => setCashStart(e.target.value)}
            compact
            min={0}
            autoFocus
          />
          <Button fullWidth onClick={handleOpen}>
            <PlayCircle className="w-4 h-4" />
            Открыть смену
          </Button>
        </div>
      </Drawer>

      <Drawer open={showClose} onClose={() => { setShowClose(false); setCloseError(''); setIsClosing(false); }} title="Закрытие смены" size="md">
        <div className="space-y-3">
          {closeError && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl animate-fade-in" style={{ background: 'rgba(251, 113, 133, 0.06)', border: '1px solid rgba(251, 113, 133, 0.12)' }}>
              <AlertTriangle className="w-3.5 h-3.5 text-[var(--c-danger)] shrink-0" />
              <p className="text-[11px] text-[var(--c-danger)] flex-1">{closeError}</p>
              <button onClick={() => setCloseError('')} className="w-5 h-5 rounded-md flex items-center justify-center shrink-0">
                <X className="w-2.5 h-2.5 text-[var(--c-muted)]" />
              </button>
            </div>
          )}
          {isClosing && !analytics && !closeError && (
            <div className="flex flex-col items-center justify-center py-6 gap-3">
              <div className="w-8 h-8 border-2 border-[var(--c-accent)]/30 border-t-[var(--c-accent)] rounded-full animate-spin" />
              <p className="text-xs text-[var(--c-hint)]">Проверка открытых чеков...</p>
            </div>
          )}
          {analytics && (
            <div className="space-y-2 stagger-children">
              <div className="grid grid-cols-3 gap-1.5">
                <div className="p-2.5 rounded-xl text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <p className="text-base font-black text-[var(--c-accent-light)] tabular-nums">{analytics.totalChecks}</p>
                  <p className="text-[9px] text-[var(--c-muted)] font-semibold">Чеков</p>
                </div>
                <div className="p-2.5 rounded-xl text-center" style={{ background: 'rgba(52,211,153,0.04)', border: '1px solid rgba(52,211,153,0.12)' }}>
                  <p className="text-base font-black text-[var(--c-success)] tabular-nums">{fmtCur(analytics.totalRevenue)}</p>
                  <p className="text-[9px] text-[var(--c-muted)] font-semibold">Выручка</p>
                </div>
                <div className="p-2.5 rounded-xl text-center" style={{ background: 'rgba(251,191,36,0.04)', border: '1px solid rgba(251,191,36,0.12)' }}>
                  <p className="text-base font-black text-[var(--c-warning)] tabular-nums">{fmtCur(analytics.avgCheck)}</p>
                  <p className="text-[9px] text-[var(--c-muted)] font-semibold">Ср. чек</p>
                </div>
              </div>

              {Object.keys(analytics.paymentBreakdown).length > 0 && (
                <div className="p-2.5 rounded-xl space-y-1" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <p className="text-[10px] font-semibold text-[var(--c-muted)] uppercase tracking-wider mb-1">Оплата</p>
                  {Object.entries(analytics.paymentBreakdown as Record<string, { count: number; amount: number }>).map(([method, val]) => (
                    <div key={method} className="flex justify-between text-[13px]">
                      <span className="text-[var(--c-hint)]">{pmLabel(method)} ({val.count})</span>
                      <span className="font-bold text-[var(--c-text)] tabular-nums">{fmtCur(val.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <Input type="number" label="Наличные в кассе (факт)" placeholder="Пересчитайте наличные" value={cashEnd} onChange={(e) => setCashEnd(e.target.value)} compact min={0} />
          <Input label="Примечание" placeholder="Комментарий к смене" value={closeNote} onChange={(e) => setCloseNote(e.target.value)} compact />
          <Button fullWidth variant="danger" onClick={handleConfirmClose} disabled={isClosing || !!closeError}>
            {isClosing ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <StopCircle className="w-4 h-4" />}
            Закрыть смену
          </Button>
        </div>
      </Drawer>

      {analytics && (
        <ShiftAnalyticsModal
          open={showAnalytics}
          onClose={() => { setShowAnalytics(false); setAnalytics(null); }}
          analytics={analytics}
        />
      )}
    </div>
  );
}
