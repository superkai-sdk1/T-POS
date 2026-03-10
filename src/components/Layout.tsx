import { useMemo, useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useAuthStore } from '@/store/auth';
import { useShiftStore } from '@/store/shift';
import { useHideNav } from '@/store/layout';
import { usePOSStore } from '@/store/pos';
import { supabase } from '@/lib/supabase';
import { Drawer } from '@/components/ui/Drawer';
import { PullToRefreshContainer } from '@/components/ui/PullToRefreshContainer';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { hapticFeedback, hapticNotification } from '@/lib/telegram';
import { ShiftAnalytics as ShiftAnalyticsModal } from '@/components/shift/ShiftAnalytics';
import {
  Receipt, Package, BarChart3, LogOut, Settings, Calendar,
  PlayCircle, StopCircle, AlertTriangle, X, Plus,
  PanelLeftClose, PanelLeftOpen, RefreshCw, CreditCard, UserPlus,
} from 'lucide-react';

const fmtCur = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + '₽';

function CheckPaymentPanel() {
  const cart = usePOSStore((s) => s.cart);
  const getCartTotal = usePOSStore((s) => s.getCartTotal);
  const total = getCartTotal();
  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 w-[92%] max-w-lg z-[60]">
      <div className="absolute inset-0 bg-white/[0.06] backdrop-blur-3xl rounded-[2rem] border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)]" />
      <div className="relative p-3 flex items-center justify-between gap-3">
        <div className="flex gap-2">
          <button
            onClick={() => { hapticFeedback('light'); window.dispatchEvent(new CustomEvent('tpos:open-menu')); }}
            className="w-11 h-11 flex items-center justify-center bg-white/5 rounded-2xl border border-white/10 text-white/40 hover:text-white active:scale-90 transition-all"
          >
            <Plus className="w-5 h-5" />
          </button>
          <button
            onClick={() => { hapticFeedback('light'); window.dispatchEvent(new CustomEvent('tpos:open-add-player')); }}
            className="w-11 h-11 flex items-center justify-center bg-white/5 rounded-2xl border border-white/10 text-[#10b981] active:scale-90 transition-all"
            title="Добавить игрока"
          >
            <UserPlus className="w-5 h-5" />
          </button>
        </div>
        <div className="flex items-baseline gap-2">
          {cartCount > 0 && (
            <span className="text-2xl font-black italic text-white tabular-nums">{fmtCur(total)}</span>
          )}
        </div>
        {cartCount > 0 && (
          <button
            onClick={() => { hapticFeedback('medium'); window.dispatchEvent(new CustomEvent('tpos:open-payment')); }}
            className="flex-1 max-w-[160px] bg-gradient-to-br from-[#a78bfa] to-[#6d28d9] py-3.5 rounded-2xl flex items-center justify-center gap-2 shadow-xl shadow-[#8b5cf6]/30 font-black uppercase text-[11px] tracking-widest active:scale-95 transition-all text-white"
          >
            <CreditCard className="w-[18px] h-[18px]" /> Оплата
          </button>
        )}
      </div>
    </div>
  );
}

interface LayoutProps {
  children: ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  showCheckView?: boolean;
}

export function Layout({ children, activeTab, onTabChange, showCheckView }: LayoutProps) {
  const user = useAuthStore((s) => s.user);
  const isOwner = useAuthStore((s) => s.isOwner);

  // Shift logic & states
  const activeShift = useShiftStore((s) => s.activeShift);
  const openShift = useShiftStore((s) => s.openShift);
  const closeShift = useShiftStore((s) => s.closeShift);
  const getShiftAnalytics = useShiftStore((s) => s.getShiftAnalytics);
  const cashInRegister = useShiftStore((s) => s.cashInRegister);
  const [showOpen, setShowOpen] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [cashStart, setCashStart] = useState('');
  const [cashEnd, setCashEnd] = useState('');
  const [closeNote, setCloseNote] = useState('');
  const [closeError, setCloseError] = useState('');
  const [isClosing, setIsClosing] = useState(false);
  const [analytics, setAnalytics] = useState<Awaited<ReturnType<typeof getShiftAnalytics>>>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);

  // Pull-to-refresh global state needed in Layout
  const [isRefreshing, setIsRefreshing] = useState(false);
  const scrollRef = useRef<HTMLElement>(null);

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

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('tpos-sidebar-collapsed') === '1';
  });

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('tpos-sidebar-collapsed', next ? '1' : '0');
      return next;
    });
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

  const hideNav = useHideNav();

  return (
    <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden relative lg:h-full" style={{ backgroundColor: 'var(--c-bg)' }}>
      {/* ── Desktop floating sidebar (always visible on desktop, hideNav only affects mobile bottom nav) ── */}
      <aside
        className={`hidden lg:flex fixed top-4 left-4 bottom-4 z-40 flex-col transition-all duration-300 ${isSidebarCollapsed ? 'w-[72px]' : 'w-[260px]'
          }`}
      >
        <div
          className="flex-1 flex flex-col rounded-[2rem] overflow-hidden border border-white/10"
          style={{
            background: 'rgba(255, 255, 255, 0.04)',
            backdropFilter: 'blur(40px) saturate(1.6)',
            WebkitBackdropFilter: 'blur(40px) saturate(1.6)',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
          }}
        >
          {/* Logo + collapse */}
          <div className={`pt-6 pb-4 flex items-center gap-2 ${isSidebarCollapsed ? 'px-3 flex-col' : 'px-6 flex-row'}`}>
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(6, 182, 212, 0.15))', boxShadow: '0 0 20px rgba(139, 92, 246, 0.15)' }}>
              <img src="/icons/tpos.svg" alt="T-POS" className="w-7 h-7 drop-shadow-lg" />
            </div>
            {!isSidebarCollapsed && <span className="font-bold text-white tracking-wide text-[15px]">T-POS</span>}
            <button
              onClick={toggleSidebar}
              className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5 transition-all tap ${isSidebarCollapsed ? 'mt-2' : 'ml-auto'}`}
              title={isSidebarCollapsed ? 'Развернуть меню' : 'Свернуть меню'}
            >
              {isSidebarCollapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
            </button>
          </div>

          {/* Nav tabs */}
          <nav className={`flex-1 flex flex-col overflow-y-auto scrollbar-none ${isSidebarCollapsed ? 'px-2 gap-1' : 'px-3 gap-1'}`}>
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`relative w-full rounded-2xl flex items-center transition-all duration-200 tap ${isSidebarCollapsed ? 'h-11 justify-center px-0' : 'h-12 px-4 gap-3'} ${isActive ? 'text-white' : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'}`}
                >
                  {isActive && <div className="absolute inset-0 bg-white/[0.06] rounded-2xl border border-white/5" />}
                  <tab.icon className="w-5 h-5 shrink-0 relative z-10" />
                  {!isSidebarCollapsed && <span className="font-semibold text-[13px] relative z-10">{tab.label}</span>}
                </button>
              );
            })}

            {/* New check FAB */}
            <button
              onClick={() => {
                hapticFeedback('medium');
                const fire = () => window.dispatchEvent(new CustomEvent('tpos:new-check', { cancelable: true }));
                if (activeTab !== 'pos') { onTabChange('pos'); setTimeout(fire, 80); }
                else fire();
              }}
              disabled={!activeShift}
              className={`relative w-full mt-3 rounded-2xl flex items-center transition-all tap disabled:opacity-30 text-white overflow-hidden ${isSidebarCollapsed ? 'h-11 justify-center px-0' : 'h-12 gap-3 px-4'}`}
              style={{ background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', boxShadow: '0 8px 24px rgba(139, 92, 246, 0.3)' }}
            >
              <Plus className="w-5 h-5 shrink-0" />
              {!isSidebarCollapsed && <span className="font-black text-[12px] uppercase tracking-wider">Новый чек</span>}
            </button>

            {/* Shift info */}
            <div className={`mt-6 mb-2 space-y-3 ${isSidebarCollapsed ? 'px-1' : 'px-1'}`}>
              <div className="h-px w-full bg-white/[0.06]" />
              <div className={isSidebarCollapsed ? 'px-1 flex justify-center' : 'px-2'}>
                {!isSidebarCollapsed && <p className="text-[10px] uppercase tracking-widest text-white/20 font-bold mb-2">Смена</p>}
                {activeShift ? (
                  <div className={`space-y-2 ${isSidebarCollapsed ? 'flex flex-col items-center' : ''}`}>
                    {!isSidebarCollapsed && (
                      <>
                        <div className="flex justify-between items-center text-[13px]">
                          <span className="text-white/40">Статус</span>
                          <span className="text-[var(--c-success)] font-semibold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--c-success)] animate-pulse" /> Открыта
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-[13px]">
                          <span className="text-white/40">Время</span>
                          <span className="text-white tabular-nums">{shiftDurationStr}</span>
                        </div>
                        {cashInRegister !== null && (
                          <div className="flex justify-between items-center text-[13px]">
                            <span className="text-white/40">В кассе</span>
                            <span className="text-white font-bold tabular-nums">{fmtCur(cashInRegister)}</span>
                          </div>
                        )}
                      </>
                    )}
                    {isSidebarCollapsed ? (
                      <button
                        onClick={handleStartClose}
                        className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--c-danger)]/20 text-[var(--c-danger)] hover:bg-[var(--c-danger)]/30 tap"
                        title="Закрыть смену"
                      >
                        <StopCircle className="w-5 h-5" />
                      </button>
                    ) : (
                      <Button fullWidth variant="danger" size="sm" onClick={handleStartClose} className="mt-3">
                        Закрыть смену
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className={`space-y-3 text-center py-2 ${isSidebarCollapsed ? '' : ''}`}>
                    {!isSidebarCollapsed && <p className="text-[13px] text-[var(--c-danger)] font-semibold">Смена закрыта</p>}
                    {isSidebarCollapsed ? (
                      <button
                        onClick={handleOpenDrawer}
                        className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--c-success)]/20 text-[var(--c-success)] hover:bg-[var(--c-success)]/30 tap"
                        title="Открыть смену"
                      >
                        <PlayCircle className="w-5 h-5" />
                      </button>
                    ) : (
                      <Button fullWidth variant="primary" size="sm" onClick={handleOpenDrawer}>
                        Открыть смену
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </nav>

          {/* Bottom: user + logout */}
          <div className={`pb-5 pt-3 mt-auto shrink-0 flex flex-col gap-2 ${isSidebarCollapsed ? 'px-2' : 'px-4'}`}>
            <div className="h-px w-full bg-white/[0.06] mb-1" />
            <div className={`flex items-center w-full py-2 rounded-xl bg-white/[0.03] border border-white/[0.05] ${isSidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-3'}`}>
              <div className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(6, 182, 212, 0.1))', border: '1px solid rgba(139, 92, 246, 0.15)' }}>
                <span className="text-[11px] font-bold text-[var(--c-accent-light)]">
                  {user?.nickname?.charAt(0).toUpperCase()}
                </span>
              </div>
              {!isSidebarCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-white truncate">{user?.nickname}</p>
                  <p className="text-[10px] text-white/30">{isOwner() ? 'Владелец' : 'Сотрудник'}</p>
                </div>
              )}
              <button
                onClick={() => useAuthStore.getState().logout()}
                title="Выход"
                className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center text-white/30 hover:bg-[rgba(251,113,133,0.08)] hover:text-[var(--c-danger)] transition-all tap"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main content: flex на мобиле, fixed на десктопе с явной высотой ── */}
      <div
        className={`flex-1 flex flex-col min-h-0 overflow-hidden transition-all duration-300 lg:fixed lg:inset-y-4 lg:right-4 lg:h-[calc(100dvh-2rem)] ${isSidebarCollapsed ? 'lg:left-[88px]' : 'lg:left-[276px]'}`}
      >
        {/* ── Mobile header: POS — статус смены + в кассе; остальные вкладки — заголовок ── */}
        {activeTab === 'pos' ? (
          <header
            className="lg:hidden shrink-0 z-40 select-none bg-[#0d0d12] border-b border-white/5"
            style={{
              paddingTop: 'var(--safe-top)',
              paddingBottom: '12px',
              paddingLeft: 'var(--safe-left)',
              paddingRight: 'var(--safe-right)',
            }}
          >
            <div className="flex items-center justify-between px-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={triggerShiftAction}
                  className="active:scale-[0.98] transition-transform touch-manipulation"
                >
                  {activeShift ? (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#12231c] border border-[#1b3a2e] rounded-full text-[#10b981] font-bold uppercase tracking-widest text-[9px]">
                      <div className="w-1.5 h-1.5 bg-[#10b981] rounded-full shadow-[0_0_6px_#10b981]" />
                      Смена открыта
                    </div>
                  ) : (
                    <span className="text-[9px] font-bold uppercase tracking-widest text-white/30">Смена закрыта</span>
                  )}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (!isRefreshing) {
                      hapticFeedback('medium');
                      setIsRefreshing(true);
                      setTimeout(() => window.location.reload(), 200);
                    }
                  }}
                  disabled={isRefreshing}
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-white/40 hover:text-white/70 active:scale-90 transition-all shrink-0 disabled:opacity-50"
                  aria-label="Обновить"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
                <div className="flex flex-col items-end">
                  <span className="text-[9px] text-white/40 uppercase tracking-widest">В кассе</span>
                  <span className="text-xl font-black tracking-tight text-white italic tabular-nums">
                    {cashInRegister != null ? `${cashInRegister.toLocaleString('ru-RU')} ₽` : '—'}
                  </span>
                </div>
                <button
                  onClick={() => useAuthStore.getState().logout()}
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-white/40 hover:text-rose-400 active:scale-90 transition-all shrink-0"
                  aria-label="Выйти"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </header>
        ) : (
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

        <PullToRefreshContainer
          activeTab={activeTab}
          isRefreshing={isRefreshing}
          setIsRefreshing={setIsRefreshing}
          scrollRef={scrollRef}
        >
          <main
            ref={scrollRef}
            className={`flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden flex flex-col ${activeTab === 'pos' ? 'p-0 lg:pb-0 lg:overflow-hidden lg:h-full' : 'px-4 py-3 lg:px-5 lg:py-4'}`}
            style={{
              WebkitOverflowScrolling: 'touch',
              paddingBottom: 0,
              overscrollBehaviorY: 'contain',
              touchAction: 'pan-y',
            }}
          >
            {children}
          </main>
        </PullToRefreshContainer>

        {/* ── Когда навигация скрыта: маскируем область внизу, чтобы не было видимого фона ── */}
        {typeof document !== 'undefined' && hideNav && !showCheckView && createPortal(
          <div
            className="lg:hidden fixed bottom-0 left-0 right-0 h-24 z-[55] pointer-events-none"
            style={{ background: 'var(--c-bg)' }}
          />,
          document.body
        )}

        {/* ── Floating mobile bottom nav (hidden on deep screens) / Payment panel (when viewing a check) ── */}
        {typeof document !== 'undefined' && (showCheckView || !hideNav) && createPortal(
          showCheckView ? (
            <div className="lg:hidden">
              <CheckPaymentPanel />
            </div>
          ) : (
          <div className="lg:hidden fixed bottom-5 left-1/2 -translate-x-1/2 w-[92%] max-w-lg z-[60]">
            <div className="absolute inset-0 bg-white/[0.06] backdrop-blur-3xl rounded-[2rem] border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)]" />
            <nav className="relative p-2.5 flex items-center justify-center">
              {tabs.slice(0, 2).map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => onTabChange(tab.id)}
                    className={`relative flex-1 py-2 rounded-2xl transition-all flex flex-col items-center justify-center gap-1 tap ${isActive ? 'text-white' : 'text-white/30'}`}
                  >
                    {isActive && <div className="absolute inset-0 bg-white/[0.06] rounded-2xl border border-white/5" />}
                    <tab.icon className="w-5 h-5 shrink-0 relative z-10" />
                    <span className="text-[9px] font-black uppercase tracking-tighter relative z-10">{tab.label}</span>
                  </button>
                );
              })}

              <div className="mx-2 shrink-0">
                <button
                  onClick={() => {
                    hapticFeedback('medium');
                    const fire = () => window.dispatchEvent(new CustomEvent('tpos:new-check', { cancelable: true }));
                    if (activeTab !== 'pos') { onTabChange('pos'); setTimeout(fire, 80); }
                    else fire();
                  }}
                  disabled={!activeShift}
                  className="relative group flex items-center justify-center disabled:opacity-30"
                >
                  <div className="absolute inset-0 bg-[#8b5cf6] blur-2xl opacity-40 group-hover:opacity-60 transition-opacity rounded-full" />
                  <div className="relative w-14 h-14 bg-gradient-to-br from-[#a78bfa] to-[#6d28d9] rounded-full flex items-center justify-center shadow-[0_8px_30px_rgba(139,92,246,0.4)] border-4 border-[#0a0e1a] transition-all active:scale-90">
                    <Plus className="w-7 h-7 text-white drop-shadow-md" />
                    <div className="absolute top-1 left-2 w-7 h-3 bg-white/20 rounded-full blur-[2px] -rotate-15" />
                  </div>
                </button>
              </div>

              {tabs.slice(2).map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => onTabChange(tab.id)}
                    className={`relative flex-1 py-2 rounded-2xl transition-all flex flex-col items-center justify-center gap-1 tap ${isActive ? 'text-white' : 'text-white/30'}`}
                  >
                    {isActive && <div className="absolute inset-0 bg-white/[0.06] rounded-2xl border border-white/5" />}
                    <tab.icon className="w-5 h-5 shrink-0 relative z-10" />
                    <span className="text-[9px] font-black uppercase tracking-tighter relative z-10">{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
          ),
          document.body
        )}
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
