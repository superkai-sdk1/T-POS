import { useEffect, useState, useRef, useCallback, memo, useMemo, startTransition, type ReactElement } from 'react';
import { usePOSStore } from '@/store/pos';
import { useShiftStore } from '@/store/shift';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Input';
import { ShiftClosedChecks } from '@/components/shift/ShiftClosedChecks';
import { Receipt, Search, User, Clock, History, UserPlus, UserX, DoorOpen, Home, Building2, Warehouse, Star, GraduationCap, Gamepad2, RotateCcw, Play, Power, AlertCircle, Trophy, Building, Baby, Dices, Moon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Profile, Space, VisitTariff, ClientTier, Check } from '@/types';
import { EVENING_TYPE_LABELS, type EveningType } from '@/types';
import { hapticFeedback, hapticNotification } from '@/lib/telegram';
import { RefundsManager } from '@/components/management/RefundsManager';
import { useHideNav, useLayoutStore, useTriggerNewCheck } from '@/store/layout';
import { ClientAvatar } from '@/components/ui/ClientAvatar';

interface OpenChecksProps {
  onSelectCheck: () => void;
}

function OpenShiftView({
  eveningType,
  setEveningType,
  cashStart,
  setCashStart,
  onOpen,
  isLoading,
}: {
  eveningType: EveningType;
  setEveningType: (v: EveningType) => void;
  cashStart: string;
  setCashStart: (v: string) => void;
  onOpen: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-6 animate-fade-in">
      <div className="text-center space-y-3">
        <div className="w-16 h-16 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex items-center justify-center mx-auto text-indigo-400 mb-4 shadow-xl">
          <Play size={28} fill="currentColor" />
        </div>
        <h2 className="text-2xl font-black text-white italic tracking-tight uppercase">Открыть смену</h2>
        <p className="text-xs text-white/40 font-black uppercase tracking-wider">Выберите параметры для начала работы</p>
      </div>

      <div className="space-y-5 bg-white/[0.03] backdrop-blur-[24px] border border-white/12 rounded-2xl p-6" style={{ WebkitBackdropFilter: 'blur(24px)', backfaceVisibility: 'hidden' }}>
        <div className="space-y-4">
          <p className="text-xs text-white/40 font-black uppercase tracking-wider px-1 italic">Тип вечера</p>
          <div className="space-y-2">
            {/* Первая строка: Спортивная, Городская */}
            <div className="grid grid-cols-2 gap-2">
              {(['sport_mafia', 'city_mafia'] as EveningType[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { hapticFeedback('light'); setEveningType(key); }}
                  className={`p-3 rounded-xl text-xs font-black uppercase transition-all border flex flex-col items-center gap-2 tap cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--c-accent)]/20 min-h-[44px] ${
                    eveningType === key
                      ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-600/20'
                      : 'bg-white/5 border-transparent text-white/50 hover:bg-white/10'
                  }`}
                >
                  {EVENING_ICONS_SVG[key]}
                  <span className="truncate w-full text-center tracking-tighter">{EVENING_TYPE_LABELS[key]}</span>
                </button>
              ))}
            </div>
            {/* Вторая строка: Настолки, Без вечера (по умолчанию), Детская */}
            <div className="grid grid-cols-3 gap-2">
              {(['board_games', 'no_event', 'kids_mafia'] as EveningType[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { hapticFeedback('light'); setEveningType(key); }}
                  className={`p-3 rounded-xl text-xs font-black uppercase transition-all border flex flex-col items-center gap-2 tap cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--c-accent)]/20 min-h-[44px] ${
                    eveningType === key
                      ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-600/20'
                      : 'bg-white/5 border-transparent text-white/50 hover:bg-white/10'
                  }`}
                >
                  {EVENING_ICONS_SVG[key]}
                  <span className="truncate w-full text-center tracking-tighter">{EVENING_TYPE_LABELS[key]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-[9px] text-white/40 font-black uppercase tracking-widest px-1 italic">Стартовая наличность</p>
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-400 font-black text-base italic">₽</div>
            <input
              type="number"
              inputMode="numeric"
              value={cashStart}
              onChange={(e) => setCashStart(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-xl py-4 pl-12 pr-5 text-lg font-black text-white focus:outline-none focus:border-indigo-500/50 transition-all"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={onOpen}
          disabled={isLoading}
          className="w-full py-5 bg-gradient-to-r from-indigo-600 to-violet-700 rounded-xl text-[11px] font-black uppercase tracking-[0.2em] text-white shadow-xl shadow-indigo-600/40 hover:scale-[1.01] active:scale-95 transition-all italic flex items-center justify-center gap-2 tap disabled:opacity-50"
        >
          {isLoading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
          Подтвердить и начать
        </button>
      </div>
    </div>
  );
}

function CloseShiftView({
  expectedCash,
  revenue,
  cashEnd,
  setCashEnd,
  closeNote,
  setCloseNote,
  discrepancy,
  onClose,
  closeError,
  isLoading,
}: {
  expectedCash: number;
  revenue: number;
  cashEnd: string;
  setCashEnd: (v: string) => void;
  closeNote: string;
  setCloseNote: (v: string) => void;
  discrepancy: number | null;
  onClose: () => void;
  closeError: string;
  isLoading: boolean;
}) {
  return (
    <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-6 animate-fade-in pb-28 lg:pb-8">
      <div className="text-center space-y-2">
        <div className="w-14 h-14 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center justify-center mx-auto text-rose-400 mb-3 shadow-xl">
          <Power size={24} />
        </div>
        <h2 className="text-xl font-black text-white italic tracking-tight uppercase">Сдача смены</h2>
        <p className="text-[9px] text-white/40 font-black uppercase tracking-[0.15em]">Все чеки закрыты. Можно завершать работу</p>
      </div>

      <div className="space-y-5 bg-white/[0.03] backdrop-blur-[24px] border border-white/10 rounded-2xl p-6" style={{ WebkitBackdropFilter: 'blur(24px)', backfaceVisibility: 'hidden' }}>
        <div className="bg-black/40 rounded-xl p-5 border border-white/5 space-y-3 italic">
          <div className="flex justify-between items-center text-[10px]">
            <span className="text-white/40 font-black uppercase tracking-widest">Ожидаемо по системе</span>
            <span className="text-white font-black tabular-nums">{fmtCur(expectedCash)}</span>
          </div>
          <div className="flex justify-between items-center text-[10px] border-t border-white/5 pt-3">
            <span className="text-white/40 font-black uppercase tracking-widest">Итоговая выручка</span>
            <span className="text-emerald-400 font-black tabular-nums">+{fmtCur(revenue)}</span>
          </div>
        </div>

        <div className="space-y-3 italic">
          <p className="text-[9px] text-white/40 font-black uppercase tracking-widest px-1">Фактическая сумма в кассе</p>
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-rose-400 font-black text-base">₽</div>
            <input
              type="number"
              inputMode="numeric"
              value={cashEnd}
              onChange={(e) => setCashEnd(e.target.value)}
              placeholder="Введите сумму..."
              className="w-full bg-black/40 border border-white/10 rounded-xl py-4 pl-12 pr-5 text-lg font-black text-white placeholder:text-white/30 focus:outline-none focus:border-rose-500/50 transition-all"
            />
          </div>
          {discrepancy !== null && discrepancy !== 0 && (
            <div className="flex items-center gap-2 px-1 text-rose-500/80 text-[10px] font-black uppercase tracking-wider">
              <AlertCircle size={12} /> Расхождение: {discrepancy > 0 ? '+' : ''}{fmtCur(discrepancy)}
            </div>
          )}
        </div>

        <div className="space-y-3 italic">
          <p className="text-[9px] text-white/40 font-black uppercase tracking-widest px-1">Комментарий</p>
          <textarea
            placeholder="Опишите события смены..."
            value={closeNote}
            onChange={(e) => setCloseNote(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-[13px] text-white h-20 resize-none focus:outline-none focus:border-white/20 transition-all"
          />
        </div>

        {closeError && (
          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <p className="text-[11px] text-rose-400 flex-1">{closeError}</p>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          disabled={isLoading}
          className="w-full py-5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-xl text-rose-400 font-black uppercase tracking-[0.2em] italic text-[11px] shadow-xl shadow-rose-900/10 transition-all flex items-center justify-center gap-2 tap disabled:opacity-50 active:scale-95"
        >
          {isLoading ? <span className="w-4 h-4 border-2 border-rose-400/30 border-t-rose-400 rounded-full animate-spin" /> : <Power size={18} strokeWidth={2.5} />}
          Закрыть и сдать кассу
        </button>
      </div>
    </div>
  );
}

const VISIT_ITEMS_STATIC: Record<VisitTariff, { name: string; label: string; fallbackPrice: number; dbName: string }> = {
  regular: { name: 'Гость', label: 'Гость', fallbackPrice: 700, dbName: 'Игровой вечер Гость' },
  resident: { name: 'Резидент', label: 'Резидент', fallbackPrice: 500, dbName: 'Игровой вечер Резидент' },
  student: { name: 'Студент', label: 'Студент', fallbackPrice: 300, dbName: 'Игровой вечер Студент' },
  single_game: { name: 'Одна игра', label: 'Одна игра', fallbackPrice: 150, dbName: 'Игровой вечер Одна игра' },
};

const ANON_CLIENT_NAMES = [
  'Тихий Волк',
  'Весёлый Кот',
  'Синий Лис',
  'Смелый Медведь',
  'Рыжий Заяц',
  'Добрый Ёж',
  'Ловкий Пёс',
  'Грозный Орёл',
  'Свежий Барс',
  'Молчаливый Ворон',
  'Упрямый Бык',
  'Ночной Тигр',
  'Зоркий Ястреб',
  'Радостный Енот',
  'Спокойный Панда',
  'Хитрый Лис',
  'Тёплый Пёс',
  'Лесной Кот',
  'Быстрый Барсук',
  'Мудрый Слон',
  'Дикий Волк',
  'Тихий Ёж',
  'Летний Конь',
  'Храбрый Лев',
  'Северный Волк',
  'Звонкий Жаворонок',
  'Весенний Медведь',
  'Снежный Кот',
  'Ласковый Тюлень',
  'Городской Сокол',
  'Солнечный Лис',
  'Вечерний Волк',
  'Улыбчивый Пёс',
  'Радужный Кот',
  'Громкий Попугай',
  'Лесной Олень',
  'Морской Краб',
  'Хитрый Волчонок',
  'Смелый Барс',
  'Весёлый Тигр',
  'Спящий Лис',
  'Тихий Медвежонок',
  'Гордый Конь',
  'Маленький Енот',
  'Добрый Котёнок',
  'Ловкий Ястреб',
  'Зоркий Пёс',
  'Ясный Волк',
  'Летучий Кот',
  'Бесстрашный Лев',
];

function getAnonymousClientName(seed: string): string {
  if (!seed) return ANON_CLIENT_NAMES[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const idx = hash % ANON_CLIENT_NAMES.length;
  return ANON_CLIENT_NAMES[idx];
}

function tierToTariff(tier: ClientTier): VisitTariff {
  if (tier === 'resident') return 'resident';
  if (tier === 'student') return 'student';
  return 'regular';
}

function ElapsedTime({ since }: { since: string }) {
  const [text, setText] = useState('');
  useEffect(() => {
    const tick = () => {
      const ms = Date.now() - new Date(since).getTime();
      const mins = Math.floor(ms / 60000);
      if (mins < 60) setText(`${mins} МИН`);
      else setText(`${Math.floor(mins / 60)}Ч ${mins % 60}М`);
    };
    tick();
    const iv = setInterval(tick, 30000);
    return () => clearInterval(iv);
  }, [since]);
  return <>{text}</>;
}

const spaceIconMap: Record<string, typeof Home> = {
  cabin_small: Home,
  cabin_big: Building2,
  hall: Warehouse,
};

const fmtCur = (n: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + ' ₽';

const EVENING_ICONS_SVG: Record<EveningType, ReactElement> = {
  sport_mafia: <Trophy size={20} className="text-current" />,
  city_mafia: <Building size={20} className="text-current" />,
  kids_mafia: <Baby size={20} className="text-current" />,
  board_games: <Dices size={20} className="text-current" />,
  no_event: <Moon size={20} className="text-current" />,
};

const EVENING_ICONS: Record<EveningType, string> = {
  sport_mafia: '⚽',
  city_mafia: '🏙️',
  kids_mafia: '🧸',
  board_games: '🎲',
  no_event: '🌙',
};

const CheckTile = memo(({ check, onSelect, listMode, exiting, isEvent }: { check: Check; onSelect: (check: Check) => void; listMode?: boolean; exiting?: boolean; isEvent?: boolean }) => {
  const hasSpace = !!check.space;
  const displayName = check.note?.startsWith('Заказ в ')
    ? check.note
    : hasSpace
      ? check.space?.name ?? ''
      : (() => {
        const names: string[] = [];
        if (check.player?.nickname) names.push(check.player.nickname);
        if (check.guest_names) names.push(...check.guest_names.split(', ').filter(Boolean));
      return names.length > 0 ? names.join(', ') : getAnonymousClientName(check.id);
      })();
  const isEventCheck = !!check.note?.startsWith('Заказ в ');
  const isEmpty = !check.player && !check.space && check.total_amount === 0 && !isEventCheck;
  return (
    <button
      type="button"
      onClick={() => !exiting && onSelect(check)}
      style={exiting ? { animation: 'check-exit 400ms ease-out forwards' } : undefined}
      className={`relative flex text-left transition-all border rounded-[20px] lg:rounded-2xl ${!listMode && isEvent ? 'col-span-2' : ''} ${listMode
          ? 'flex-row items-center justify-between gap-3 p-3 min-h-0'
          : 'flex-col justify-between p-3 lg:p-4 min-h-[120px] lg:min-h-[150px]'
        } ${isEmpty
          ? 'bg-transparent border-dashed border-white/5 opacity-30'
          : 'bg-[#1b1b26] border-white/5 shadow-xl hover:border-white/15 hover:bg-[#1f1f30]'
        } ${exiting
          ? 'pointer-events-none'
          : 'active:scale-[0.98]'
        }`}
    >
      <div className={`flex items-center gap-2 min-w-0 ${listMode ? 'flex-1' : 'flex items-start'}`}>
        <div className="relative shrink-0">
          <div className={`rounded-xl overflow-hidden bg-[#252535] border border-white/10 flex items-center justify-center shadow-inner ${listMode ? 'w-9 h-9' : 'w-10 h-10'}`}>
            {hasSpace ? (
              (() => {
                const Icon = spaceIconMap[check.space?.type ?? ''] || DoorOpen;
                return <Icon className={listMode ? 'w-4 h-4' : 'w-5 h-5'} />;
              })()
            ) : (
              <ClientAvatar
                photoUrl={check.player?.photo_url}
                id={check.player?.id || check.id}
                size="md"
                rounded="xl"
                className="w-full h-full !rounded-xl !bg-transparent"
              />
            )}
          </div>
          {!isEmpty && (
            <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-[#0d0d12] rounded-full flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-[#10b981] shadow-[0_0_4px_#10b981]" />
            </div>
          )}
        </div>
        <div className="flex-1 overflow-hidden min-w-0">
          <h3 className={`font-black tracking-tight uppercase leading-tight text-white/90 ${listMode ? 'text-[13px] line-clamp-1' : 'text-[11px] line-clamp-2'}`}>
            {displayName}
          </h3>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="flex items-center gap-0.5 text-[7px] font-bold text-white/20 uppercase tracking-widest">
              <Clock className="w-2 h-2 shrink-0" />
              <ElapsedTime since={check.created_at} />
            </span>
            {isEventCheck && (
              <span className="inline-flex items-center rounded-full bg-indigo-500/10 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] text-indigo-200">
                Мероприятие
              </span>
            )}
          </div>
        </div>
      </div>

      <div className={`flex items-center shrink-0 ${listMode ? '' : 'justify-end items-end mt-auto'}`}>
        <div
          className={`font-black italic tracking-tighter tabular-nums ${listMode ? 'text-base' : 'text-lg'} ${isEmpty ? 'text-white/5' : 'text-[#8b5cf6]'
            }`}
        >
          {isEmpty ? '—' : `${(check.total_amount || 0).toLocaleString('ru-RU')} ₽`}
        </div>
      </div>
    </button>
  );
});

export function OpenChecks({ onSelectCheck }: OpenChecksProps) {
  const hideNav = useHideNav();
  const openChecks = usePOSStore((s) => s.openChecks);

  const [exitingCheck, setExitingCheck] = useState<Check | null>(
    () => usePOSStore.getState().recentlyDeletedCheck
  );

  useEffect(() => {
    if (exitingCheck) {
      usePOSStore.setState({ recentlyDeletedCheck: null });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (exitingCheck) {
      const timer = setTimeout(() => setExitingCheck(null), 450);
      return () => clearTimeout(timer);
    }
  }, [exitingCheck]);

  useEffect(() => {
    return usePOSStore.subscribe((state, prev) => {
      if (state.recentlyDeletedCheck && state.recentlyDeletedCheck !== prev.recentlyDeletedCheck) {
        setExitingCheck(state.recentlyDeletedCheck);
        usePOSStore.setState({ recentlyDeletedCheck: null });
      }
    });
  }, []);
  const loadOpenChecks = usePOSStore((s) => s.loadOpenChecks);
  const createCheck = usePOSStore((s) => s.createCheck);
  const selectCheck = usePOSStore((s) => s.selectCheck);
  const addToCart = usePOSStore((s) => s.addToCart);
  const saveCartToDb = usePOSStore((s) => s.saveCartToDb);
  const inventory = usePOSStore((s) => s.inventory);

  const VISIT_ITEMS = useMemo(() => {
    const result: Record<VisitTariff, { name: string; label: string; price: number; dbName: string }> = {} as any;
    for (const [key, info] of Object.entries(VISIT_ITEMS_STATIC) as [VisitTariff, typeof VISIT_ITEMS_STATIC['regular']][]) {
      const invItem = inventory.find((i) => i.name === info.dbName);
      result[key] = { name: info.name, label: info.label, dbName: info.dbName, price: invItem?.price ?? info.fallbackPrice };
    }
    return result;
  }, [inventory]);

  const checksLoaded = usePOSStore((s) => s.checksLoaded);
  const activeCheck = usePOSStore((s) => s.activeCheck);
  const activeShift = useShiftStore((s) => s.activeShift);
  const openShift = useShiftStore((s) => s.openShift);
  const closeShift = useShiftStore((s) => s.closeShift);
  const getShiftAnalytics = useShiftStore((s) => s.getShiftAnalytics);
  const cashInRegister = useShiftStore((s) => s.cashInRegister);

  const [showNewCheck, setShowNewCheck] = useState(false);
  const [cashStart, setCashStart] = useState('');
  const [eveningType, setEveningType] = useState<EveningType>('no_event');
  const [isOpening, setIsOpening] = useState(false);
  const [cashEnd, setCashEnd] = useState('');
  const [closeNote, setCloseNote] = useState('');
  const [closeError, setCloseError] = useState('');
  const [isClosing, setIsClosing] = useState(false);
  const [closeAnalytics, setCloseAnalytics] = useState<Awaited<ReturnType<typeof getShiftAnalytics>> | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showRefunds, setShowRefunds] = useState(false);
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [players, setPlayers] = useState<Profile[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [newNickname, setNewNickname] = useState('');
  const [newClientTier, setNewClientTier] = useState<ClientTier>('regular');
  const [createError, setCreateError] = useState('');
  const [showSpaces, setShowSpaces] = useState(false);
  const [spacesList, setSpacesList] = useState<Space[]>([]);

  // Tariff selection state
  const [showTariff, setShowTariff] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Profile | null>(null);
  const [selectedTariff, setSelectedTariff] = useState<VisitTariff>('regular');

  useEffect(() => {
    loadOpenChecks();
  }, [loadOpenChecks]);

  useEffect(() => {
    if (!activeShift) {
      supabase
        .from('shifts')
        .select('cash_end')
        .eq('status', 'closed')
        .order('closed_at', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data: lastShift }) => {
          if (lastShift?.cash_end != null) setCashStart(String(lastShift.cash_end));
        });
    }
  }, [activeShift]);

  const noOpenChecks = openChecks.length === 0;
  useEffect(() => {
    if (noOpenChecks && activeShift) {
      setCloseError('');
      setCloseAnalytics(null);
      setIsClosing(true);
      if (cashInRegister !== null) setCashEnd(String(cashInRegister));
      getShiftAnalytics(activeShift.id).then((a) => {
        setCloseAnalytics(a);
        setIsClosing(false);
      });
    }
  }, [noOpenChecks, activeShift?.id, getShiftAnalytics, cashInRegister]);

  const handleOpenShift = async () => {
    hapticFeedback('medium');
    setIsOpening(true);
    const shift = await openShift(Number(cashStart) || 0, eveningType);
    if (shift) {
      hapticNotification('success');
      setCashStart('');
    } else {
      hapticNotification('error');
    }
    setIsOpening(false);
  };

  const handleCloseShift = async () => {
    hapticFeedback('heavy');
    setCloseError('');
    setIsClosing(true);
    const ok = await closeShift(Number(cashEnd) || 0, closeNote);
    if (ok) {
      hapticNotification('success');
      setCashEnd('');
      setCloseNote('');
      setCloseAnalytics(null);
    } else {
      setCloseError('Не удалось закрыть смену. Проверьте открытые чеки.');
      hapticNotification('error');
    }
    setIsClosing(false);
  };

  const triggerNewCheck = useTriggerNewCheck();
  useEffect(() => {
    if (triggerNewCheck > 0 && activeShift && !activeCheck) {
      setShowNewCheck(true);
      useLayoutStore.setState({ triggerNewCheck: 0 });
    }
  }, [triggerNewCheck, activeShift, activeCheck]);

  useEffect(() => {
    const handler = (e: Event) => {
      if (e.defaultPrevented) return;
      e.preventDefault();
      useLayoutStore.getState().requestNewCheck();
    };
    window.addEventListener('tpos:new-check', handler);
    return () => window.removeEventListener('tpos:new-check', handler);
  }, []);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const searchPlayers = useCallback((query: string) => {
    startTransition(() => setSearchQuery(query));
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (query.length < 1) {
      setPlayers([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .ilike('nickname', `%${query}%`)
        .is('deleted_at', null)
        .limit(20);
      const nicknameResults = (data as Profile[]) || [];
      const nicknameIds = new Set(nicknameResults.map(r => r.id));

      let tagResults: Profile[] = [];
      if (nicknameResults.length < 20) {
        const { data: allWithTags } = await supabase
          .from('profiles')
          .select('*')
          .is('deleted_at', null)
          .not('search_tags', 'eq', '{}')
          .limit(200);
        if (allWithTags) {
          const q = query.toLowerCase();
          tagResults = (allWithTags as Profile[]).filter(p =>
            !nicknameIds.has(p.id) &&
            p.search_tags?.some(tag => tag.toLowerCase().includes(q))
          );
        }
      }

      if (!mountedRef.current) return;
      setPlayers([...nicknameResults, ...tagResults].slice(0, 20));
      setIsSearching(false);
    }, 300);
  }, []);

  const handlePlayerSelected = (player: Profile) => {
    hapticFeedback('light');
    setSelectedPlayer(player);
    setSelectedTariff(tierToTariff(player.client_tier || 'regular'));
    setShowNewCheck(false);
    setShowTariff(true);
  };

  const handleConfirmTariff = async () => {
    hapticFeedback('medium');
    const check = await createCheck(selectedPlayer?.id || null);
    if (check) {
      const tariffInfo = VISIT_ITEMS[selectedTariff];
      const visitItem = inventory.find((i) => i.name === tariffInfo.dbName);
      if (visitItem) {
        addToCart(visitItem);
        saveCartToDb();
      }
      setShowTariff(false);
      setShowNewCheck(false);
      setSelectedPlayer(null);
      setSearchQuery('');
      setPlayers([]);
      onSelectCheck();
    } else {
      hapticNotification('error');
    }
  };

  const handleConfirmNoTariff = async () => {
    hapticFeedback('medium');
    const check = await createCheck(selectedPlayer?.id || null);
    if (check) {
      setShowTariff(false);
      setShowNewCheck(false);
      setSelectedPlayer(null);
      setSearchQuery('');
      setPlayers([]);
      onSelectCheck();
    } else {
      hapticNotification('error');
    }
  };

  const handleCreateCheckNoClient = async () => {
    hapticFeedback('medium');
    const check = await createCheck(null);
    if (check) {
      setShowNewCheck(false);
      setSearchQuery('');
      setPlayers([]);
      onSelectCheck();
    } else {
      hapticNotification('error');
    }
  };

  const handleCreateCheckSpace = async (spaceId: string) => {
    hapticFeedback('medium');
    const check = await createCheck(null, spaceId);
    if (check) {
      setShowSpaces(false);
      setShowNewCheck(false);
      setSearchQuery('');
      setPlayers([]);
      onSelectCheck();
    } else {
      hapticNotification('error');
    }
  };

  const loadSpaces = async () => {
    const { data } = await supabase.from('spaces').select('*').eq('is_active', true);
    if (data) setSpacesList(data as Space[]);
    setShowSpaces(true);
  };

  const handleSelectCheck = (check: (typeof openChecks)[0]) => {
    hapticFeedback('light');
    selectCheck(check);
    onSelectCheck();
  };

  const handleCreateClient = async () => {
    if (!newNickname.trim()) { setCreateError('Введите никнейм'); return; }
    setCreateError('');

    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('nickname', newNickname.trim())
      .maybeSingle();

    if (existing) {
      setCreateError('Такой никнейм уже существует');
      return;
    }

    const { data, error } = await supabase
      .from('profiles')
      .insert({
        nickname: newNickname.trim(),
        is_resident: newClientTier === 'resident',
        client_tier: newClientTier,
        role: 'client',
      })
      .select()
      .single();

    if (error || !data) {
      setCreateError('Ошибка создания');
      return;
    }

    hapticNotification('success');
    const profile = data as Profile;
    setShowCreateClient(false);
    setNewNickname('');
    setNewClientTier('regular');

    setSelectedPlayer(profile);
    setSelectedTariff(tierToTariff(profile.client_tier || 'regular'));
    setShowTariff(true);
  };

  const tierBadge = (tier: ClientTier | undefined) => {
    if (tier === 'resident') return <Badge variant="success" size="sm">Резидент</Badge>;
    if (tier === 'student') return <Badge variant="accent" size="sm">Студент</Badge>;
    return null;
  };

  const activeCount = openChecks.length;
  const expectedCash = cashInRegister ?? (closeAnalytics ? ((activeShift?.cash_start ?? 0) + (closeAnalytics.paymentBreakdown['cash']?.amount ?? 0)) : 0);
  const revenue = closeAnalytics?.totalRevenue ?? 0;
  const discrepancy = cashEnd ? (Number(cashEnd) || 0) - expectedCash : null;

  return (
    <div className="flex-1 flex flex-col min-h-0 lg:h-full relative bg-[#0d0d12] text-white">
      {!activeShift ? (
        <OpenShiftView
          eveningType={eveningType}
          setEveningType={setEveningType}
          cashStart={cashStart}
          setCashStart={setCashStart}
          onOpen={handleOpenShift}
          isLoading={isOpening}
        />
      ) : noOpenChecks ? (
        <CloseShiftView
          expectedCash={expectedCash}
          revenue={revenue}
          cashEnd={cashEnd}
          setCashEnd={setCashEnd}
          closeNote={closeNote}
          setCloseNote={setCloseNote}
          discrepancy={discrepancy}
          onClose={handleCloseShift}
          closeError={closeError}
          isLoading={isClosing}
        />
      ) : (
      <div className="flex-1 flex flex-col min-h-0 lg:h-full overflow-hidden animate-fade-in">
        {/* Заголовок КАССА и Действия — компактно */}
        <div className="px-4 sm:px-6 lg:px-4 py-3 lg:py-2 shrink-0">
          <div className="flex items-center justify-between mb-3 lg:mb-2">
            <h2 className="text-xl lg:text-2xl font-black italic uppercase tracking-tighter text-white">Касса</h2>
            <span className="text-[9px] lg:text-[11px] font-bold text-white/30 uppercase tracking-widest">
              {activeCount} активн{activeCount === 1 ? 'ый' : 'ых'}
            </span>
          </div>
          <div className="flex gap-2 lg:gap-3">
            <button
              type="button"
              onClick={() => setShowHistory(true)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 lg:py-3 bg-[#1b1b26] hover:bg-[#252535] rounded-xl lg:rounded-2xl transition-all border border-white/5 shadow-lg group"
            >
              <History className="w-4 h-4 text-white/40 group-hover:text-violet-400" />
              <span className="text-[10px] lg:text-xs font-black uppercase tracking-widest text-white/40 group-hover:text-white">История</span>
            </button>
            <button
              type="button"
              onClick={() => setShowRefunds(true)}
              disabled={!activeShift}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 lg:py-3 bg-[#1b1b26] hover:bg-rose-500/10 rounded-xl lg:rounded-2xl transition-all border border-white/5 shadow-lg group disabled:opacity-40 disabled:pointer-events-none"
            >
              <RotateCcw className="w-4 h-4 text-rose-500/40 group-hover:text-rose-500" />
              <span className="text-[10px] lg:text-xs font-black uppercase tracking-widest text-rose-500/40 group-hover:text-rose-500">Возвраты</span>
            </button>
          </div>
        </div>

        {/* Сетка чеков — скролл (pb-24 под нав на мобиле; убираем когда нав скрыт) */}
        <div className={`flex-1 overflow-y-auto overflow-x-hidden px-4 sm:px-6 lg:px-4 min-h-0 scrollbar-none scroll-area ${hideNav ? 'pb-0' : 'pb-24 lg:pb-0'}`}>
          {!checksLoaded ? (
            <div className={`grid gap-3 lg:gap-4 ${activeCheck ? 'lg:grid-cols-1' : 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'}`}>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="p-3 lg:p-4 rounded-[24px] animate-pulse border border-white/5 min-h-[120px] lg:min-h-[140px] bg-[#1b1b26]"
                  style={{ opacity: 1 - i * 0.15 }}
                >
                  <div className="flex items-start gap-2">
                    <div className="w-10 h-10 rounded-xl bg-[#252535] shrink-0" />
                    <div className="flex-1 space-y-1 min-w-0">
                      <div className="h-2.5 w-12 rounded bg-white/5" />
                      <div className="h-2 w-8 rounded bg-white/5" />
                    </div>
                  </div>
                  <div className="mt-1.5 h-5 w-16 rounded bg-white/5 ml-auto" />
                </div>
              ))}
            </div>
          ) : (
            <div className={`grid gap-3 lg:gap-4 ${activeCheck
                ? 'lg:grid-cols-1'
                : 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'
              }`}>
              {(() => {
                const merged = exitingCheck
                  ? [...openChecks, exitingCheck].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                  : openChecks;

                const eventChecks = merged.filter((c) => c.note?.startsWith('Заказ в '));
                const regularChecks = merged.filter((c) => !c.note?.startsWith('Заказ в '));

                return (
                  <>
                    {eventChecks.map((check) => {
                      const isExiting = exitingCheck?.id === check.id;
                      return (
                        <CheckTile
                          key={check.id}
                          check={check}
                          onSelect={handleSelectCheck}
                          listMode={!!activeCheck}
                          exiting={isExiting}
                          isEvent
                        />
                      );
                    })}
                    {regularChecks.map((check) => {
                      const isExiting = exitingCheck?.id === check.id;
                      return (
                        <CheckTile
                          key={check.id}
                          check={check}
                          onSelect={handleSelectCheck}
                          listMode={!!activeCheck}
                          exiting={isExiting}
                        />
                      );
                    })}
                  </>
                );
              })()}
            </div>
          )}
        </div>

        {/* FAB integrated into floating nav in Layout */}
      </div>
      )}

      <Drawer open={showHistory} onClose={() => setShowHistory(false)} title="Закрытые чеки смены">
        <ShiftClosedChecks />
      </Drawer>

      <Drawer open={showRefunds} onClose={() => setShowRefunds(false)} title="Возвраты" size="md">
        <RefundsManager />
      </Drawer>

      {/* ============ NEW CHECK ============ */}
      <Drawer
        open={showNewCheck}
        onClose={() => { setShowNewCheck(false); setSearchQuery(''); setPlayers([]); }}
        title="Новый чек"
        size="xl"
      >
        <div className="flex flex-col h-full space-y-3">
          {/* ── Search input (Top) ── */}
          <div className="shrink-0 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--c-muted)]" />
            <Input
              placeholder="Поиск игрока..."
              value={searchQuery}
              onChange={(e) => searchPlayers(e.target.value)}
              className="pl-9"
              size="md"
              autoFocus
            />
          </div>

          {/* ── Quick actions ── */}
          <div className="shrink-0 flex gap-2">
            <button
              onClick={handleCreateCheckNoClient}
              className="flex items-center gap-2.5 flex-1 p-3 rounded-xl active:scale-[0.97] transition-all min-h-[48px]"
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <UserX className="w-4.5 h-4.5 text-[var(--c-hint)]" />
              </div>
              <span className="text-[13px] font-semibold text-[var(--c-text)]">Без клиента</span>
            </button>
            <button
              onClick={() => { setShowNewCheck(false); setShowCreateClient(true); }}
              className="flex items-center gap-2.5 flex-1 p-3 rounded-xl active:scale-[0.97] transition-all min-h-[48px]"
              style={{
                background: 'rgba(52, 211, 153, 0.06)',
                border: '1px solid rgba(52, 211, 153, 0.15)',
              }}
            >
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(52, 211, 153, 0.1)' }}>
                <UserPlus className="w-4.5 h-4.5 text-[var(--c-success)]" />
              </div>
              <span className="text-[13px] font-semibold text-[var(--c-success)]">Новый</span>
            </button>
            <button
              onClick={() => { setShowNewCheck(false); loadSpaces(); }}
              className="flex items-center gap-2 p-3 rounded-xl active:scale-[0.97] transition-all min-h-[48px]"
              style={{
                background: 'rgba(99, 102, 241, 0.06)',
                border: '1px solid rgba(99, 102, 241, 0.12)',
              }}
            >
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(99, 102, 241, 0.12)' }}>
                <DoorOpen className="w-4.5 h-4.5 text-indigo-400" />
              </div>
            </button>
          </div>

          {/* ── Divider ── */}
          <div className="shrink-0 flex items-center gap-2">
            <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
            <span className="text-[9px] text-[var(--c-muted)] font-semibold tracking-widest">ИГРОКИ</span>
            <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
          </div>

          {/* ── Player list ── */}
          <div className="flex-1 overflow-y-auto min-h-0 space-y-1 -mx-1 px-1">
            {isSearching && (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-[var(--c-accent)] border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {!isSearching && players.map((player) => (
              <button
                key={player.id}
                onClick={() => handlePlayerSelected(player)}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl transition-all active:scale-[0.98] hover:bg-[rgba(255,255,255,0.04)] min-h-[56px]"
              >
                <ClientAvatar
                  photoUrl={player.photo_url}
                  id={player.id}
                  size="lg"
                  rounded="xl"
                  className="!rounded-xl shrink-0"
                />
                <div className="text-left flex-1 min-w-0">
                  <p className="font-bold text-[14px] text-[var(--c-text)] truncate">
                    {player.nickname}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {tierBadge(player.client_tier)}
                    {(player.balance ?? 0) < 0 && <Badge variant="danger" size="sm">{player.balance}₽</Badge>}
                    {(player.bonus_points ?? 0) > 0 && <Badge variant="accent" size="sm">{player.bonus_points} бон.</Badge>}
                  </div>
                </div>
                <Receipt className="w-4 h-4 text-[var(--c-muted)] shrink-0" />
              </button>
            ))}
            {searchQuery.length > 0 && !isSearching && players.length === 0 && (
              <div className="text-center py-8">
                <UserX className="w-8 h-8 text-[var(--c-muted)] mx-auto mb-2" />
                <p className="text-xs text-[var(--c-hint)]">Никого не найдено</p>
                <button
                  onClick={() => { setShowNewCheck(false); setNewNickname(searchQuery); setShowCreateClient(true); }}
                  className="mt-3 px-4 py-2.5 rounded-xl text-[13px] font-semibold text-[var(--c-accent-light)] active:opacity-70 min-h-[44px]"
                  style={{ background: 'rgba(139, 92, 246, 0.08)', border: '1px solid rgba(139, 92, 246, 0.15)' }}
                >
                  Создать «{searchQuery}» →
                </button>
              </div>
            )}
            {searchQuery.length === 0 && players.length === 0 && !isSearching && (
              <p className="text-xs text-center text-[var(--c-muted)] py-8">
                Начните вводить никнейм для поиска
              </p>
            )}
          </div>
        </div>
      </Drawer>

      {/* ============ TARIFF SELECTOR ============ */}
      <Drawer
        open={showTariff}
        onClose={() => { setShowTariff(false); setSelectedPlayer(null); }}
        title="Выберите тариф"
        size="lg"
      >
        {selectedPlayer && (
          <div className="space-y-4">
            <div
              className="flex items-center gap-3 p-3 rounded-xl"
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <ClientAvatar
                photoUrl={selectedPlayer.photo_url}
                id={selectedPlayer.id}
                size="md"
                rounded="xl"
                className="!rounded-xl shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-[var(--c-text)] truncate">{selectedPlayer?.nickname}</p>
                <div className="flex gap-1 mt-0.5">
                  {tierBadge(selectedPlayer?.client_tier)}
                  {(selectedPlayer?.bonus_points ?? 0) > 0 && (
                    <Badge variant="accent" size="sm">{selectedPlayer?.bonus_points} бон.</Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {(Object.entries(VISIT_ITEMS) as [VisitTariff, typeof VISIT_ITEMS['regular']][]).map(([key, info]) => {
                const isSelected = selectedTariff === key;
                const isDefault = tierToTariff(selectedPlayer.client_tier || 'regular') === key;
                return (
                  <button
                    key={key}
                    onClick={() => { setSelectedTariff(key); hapticFeedback('light'); }}
                    className="relative flex flex-col items-center gap-1.5 p-4 rounded-xl transition-all active:scale-[0.97] min-h-[88px]"
                    style={{
                      background: isSelected
                        ? 'rgba(139, 92, 246, 0.1)'
                        : 'rgba(255, 255, 255, 0.04)',
                      border: isSelected
                        ? '1px solid rgba(139, 92, 246, 0.25)'
                        : '1px solid rgba(255, 255, 255, 0.08)',
                      boxShadow: isSelected ? '0 0 16px rgba(139, 92, 246, 0.1)' : undefined,
                    }}
                  >
                    {isDefault && selectedPlayer && (
                      <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                        <Star className="w-3 h-3 text-white fill-white" />
                      </div>
                    )}
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center`}
                      style={{
                        background: key === 'resident' ? 'rgba(52, 211, 153, 0.1)' :
                          key === 'student' ? 'rgba(96, 165, 250, 0.1)' :
                            key === 'single_game' ? 'rgba(251, 191, 36, 0.1)' :
                              'rgba(255, 255, 255, 0.06)',
                      }}
                    >
                      {key === 'resident' ? <Star className="w-5 h-5 text-[var(--c-success)]" /> :
                        key === 'student' ? <GraduationCap className="w-5 h-5 text-[var(--c-info)]" /> :
                          key === 'single_game' ? <Gamepad2 className="w-5 h-5 text-[var(--c-warning)]" /> :
                            <User className="w-5 h-5 text-[var(--c-hint)]" />}
                    </div>
                    <span className={`text-[13px] font-semibold ${isSelected ? 'text-[var(--c-accent-light)]' : 'text-[var(--c-text)]'}`}>
                      {info.label}
                    </span>
                    <span className={`text-[15px] font-black tabular-nums ${isSelected ? 'text-[var(--c-accent-light)]' : 'text-[var(--c-hint)]'}`}>
                      {info.price}₽
                    </span>
                  </button>
                );
              })}
            </div>

            <Button fullWidth size="lg" onClick={handleConfirmTariff}>
              <Receipt className="w-4 h-4" />
              Открыть чек · {VISIT_ITEMS[selectedTariff].price}₽
            </Button>
            <button
              onClick={handleConfirmNoTariff}
              className="w-full text-center py-3 text-[13px] font-semibold text-[var(--c-hint)] active:text-[var(--c-text)] transition-colors min-h-[44px]"
            >
              Без тарифа (пустой чек)
            </button>
          </div>
        )}
      </Drawer>

      {/* ============ CREATE CLIENT ============ */}
      <Drawer
        open={showCreateClient}
        onClose={() => { setShowCreateClient(false); setNewNickname(''); setNewClientTier('regular'); setCreateError(''); }}
        title="Новый клиент"
        size="sm"
      >
        <div className="space-y-3">
          <Input
            label="Никнейм"
            placeholder="Имя клиента"
            value={newNickname}
            onChange={(e) => setNewNickname(e.target.value)}
            size="md"
            autoFocus
          />

          <div>
            <p className="text-xs font-medium text-[var(--c-hint)] mb-2">Статус</p>
            <div className="grid grid-cols-3 gap-2">
              {([
                { key: 'regular' as ClientTier, label: 'Гость', icon: User, bgColor: 'rgba(255,255,255,0.06)' },
                { key: 'resident' as ClientTier, label: 'Резидент', icon: Star, bgColor: 'rgba(52,211,153,0.1)' },
                { key: 'student' as ClientTier, label: 'Студент', icon: GraduationCap, bgColor: 'rgba(96,165,250,0.1)' },
              ]).map(({ key, label, icon: Icon, bgColor }) => (
                <button
                  key={key}
                  onClick={() => setNewClientTier(key)}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl text-[13px] font-medium transition-all active:scale-[0.97] min-h-[72px]"
                  style={{
                    background: newClientTier === key
                      ? 'rgba(139, 92, 246, 0.1)'
                      : 'rgba(255, 255, 255, 0.04)',
                    border: newClientTier === key
                      ? '1px solid rgba(139, 92, 246, 0.25)'
                      : '1px solid rgba(255, 255, 255, 0.08)',
                    color: newClientTier === key ? 'var(--c-accent-light)' : 'var(--c-hint)',
                  }}
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center"
                    style={{ background: newClientTier === key ? 'rgba(139, 92, 246, 0.15)' : bgColor }}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {createError && (
            <p
              className="text-xs rounded-lg px-3 py-2"
              style={{ color: 'var(--c-danger)', background: 'rgba(251,113,133,0.08)', border: '1px solid rgba(251,113,133,0.15)' }}
            >
              {createError}
            </p>
          )}
          <Button fullWidth onClick={handleCreateClient}>
            <UserPlus className="w-4 h-4" />
            Создать и открыть чек
          </Button>
        </div>
      </Drawer>

      {/* ============ SPACES ============ */}
      <Drawer
        open={showSpaces}
        onClose={() => setShowSpaces(false)}
        title="Чек на кабинку / зал"
        size="sm"
      >
        <div className="space-y-2">
          {spacesList.map((s) => {
            const Icon = spaceIconMap[s.type] || DoorOpen;
            return (
              <button
                key={s.id}
                onClick={() => handleCreateCheckSpace(s.id)}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl active:scale-[0.97] transition-all min-h-[56px]"
                style={{
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <div className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(99, 102, 241, 0.12)' }}>
                  <Icon className="w-5 h-5 text-indigo-400" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-semibold text-[14px] text-[var(--c-text)]">{s.name}</p>
                  <p className="text-[12px] text-[var(--c-muted)]">
                    {s.hourly_rate ? `${s.hourly_rate}₽/час` : 'Ручная цена'}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </Drawer>
    </div>
  );
}
