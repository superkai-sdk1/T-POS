import { useEffect, useState, useRef, useCallback, memo, startTransition } from 'react';
import { usePOSStore } from '@/store/pos';
import { useShiftStore } from '@/store/shift';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Input';
import { ShiftHistory } from '@/components/shift/ShiftHistory';
import { Plus, Receipt, Search, User, Clock, History, UserPlus, UserX, DoorOpen, Home, Building2, Warehouse, Star, GraduationCap, Gamepad2, RotateCcw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Profile, Space, VisitTariff, ClientTier, Check } from '@/types';
import { hapticFeedback, hapticNotification } from '@/lib/telegram';
import { RefundsManager } from '@/components/management/RefundsManager';

interface OpenChecksProps {
  onSelectCheck: () => void;
}

const VISIT_ITEMS: Record<VisitTariff, { name: string; label: string; price: number; dbName: string }> = {
  regular: { name: 'Гость', label: 'Гость', price: 700, dbName: 'Игровой вечер Гость' },
  resident: { name: 'Резидент', label: 'Резидент', price: 500, dbName: 'Игровой вечер Резидент' },
  student: { name: 'Студент', label: 'Студент', price: 300, dbName: 'Игровой вечер Студент' },
  single_game: { name: 'Одна игра', label: 'Одна игра', price: 150, dbName: 'Игровой вечер Одна игра' },
};

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
      if (mins < 60) setText(`${mins} мин`);
      else setText(`${Math.floor(mins / 60)}ч ${mins % 60}м`);
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
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + '₽';

const CheckTile = memo(({ check, onSelect }: { check: Check; onSelect: (check: Check) => void }) => {
  const hasSpace = !!check.space;
  return (
    <button
      onClick={() => onSelect(check)}
      className="group text-left p-3 flex flex-col gap-2 rounded-2xl active:scale-[0.97] transition-all duration-300 hover:bg-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.2)] hover:shadow-[0_8px_24px_rgba(139,92,246,0.15)]"
      style={{
        background: 'rgba(255, 255, 255, 0.04)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      <div className="flex items-center gap-2">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: hasSpace
              ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(99, 102, 241, 0.05))'
              : check.player
                ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(6, 182, 212, 0.08))'
                : 'rgba(255, 255, 255, 0.06)',
          }}
        >
          {hasSpace ? (() => { const Icon = spaceIconMap[check.space!.type] || DoorOpen; return <Icon className="w-3.5 h-3.5 text-indigo-400" />; })()
            : check.player
              ? <span className="text-xs font-bold text-[var(--c-accent-light)]">{check.player.nickname?.charAt(0).toUpperCase()}</span>
              : <UserX className="w-3.5 h-3.5 text-[var(--c-muted)]" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[13px] text-[var(--c-text)] truncate leading-tight">
            {hasSpace
              ? check.space!.name
              : (() => {
                const names: string[] = [];
                if (check.player?.nickname) names.push(check.player.nickname);
                if (check.guest_names) names.push(...check.guest_names.split(', '));
                return names.length > 0 ? names.join(', ') : 'Без клиента';
              })()
            }
          </p>
          {hasSpace && check.player && (
            <p className="text-[10px] text-indigo-400/50 truncate">
              {check.player.nickname}{check.guest_names ? `, ${check.guest_names}` : ''}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-end justify-between mt-auto">
        <div className="flex items-center gap-1 text-[var(--c-muted)]">
          <Clock className="w-3 h-3" />
          <span className="text-[10px] tabular-nums"><ElapsedTime since={check.created_at} /></span>
        </div>
        {check.total_amount > 0 ? (
          <span className="text-base font-black text-[var(--c-text)] tabular-nums leading-none">
            {fmtCur(check.total_amount)}
          </span>
        ) : (
          <Badge variant="default" size="sm">Пусто</Badge>
        )}
      </div>
    </button>
  );
});

export function OpenChecks({ onSelectCheck }: OpenChecksProps) {
  const { openChecks, loadOpenChecks, createCheck, selectCheck, addToCart, saveCartToDb, inventory, checksLoaded } = usePOSStore();
  const activeShift = useShiftStore((s) => s.activeShift);
  const [showNewCheck, setShowNewCheck] = useState(false);
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

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      setPlayers((data as Profile[]) || []);
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

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      <div className="flex-1 space-y-4 pb-24 overflow-y-auto no-scrollbar">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-[var(--c-text)]">Касса</h2>
            <p className="text-[11px] text-[var(--c-hint)]">
              {openChecks.length > 0 ? `${openChecks.length} открыт${openChecks.length === 1 ? '' : 'о'}` : 'Нет открытых чеков'}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowHistory(true)}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-90"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <History className="w-4 h-4 text-[var(--c-hint)]" />
            </button>
            <Button size="sm" variant="danger" onClick={() => setShowRefunds(true)} disabled={!activeShift}>
              <RotateCcw className="w-3.5 h-3.5" />
              Возвраты
            </Button>
          </div>
        </div>

        {!checksLoaded ? (
          <div className="grid grid-cols-2 gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="p-3 rounded-2xl animate-pulse space-y-2"
                style={{
                  opacity: 1 - i * 0.2,
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                }}
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)' }} />
                  <div className="flex-1"><div className="h-3 w-20 rounded" style={{ background: 'rgba(255,255,255,0.06)' }} /></div>
                </div>
                <div className="flex items-end justify-between">
                  <div className="h-2.5 w-12 rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
                  <div className="h-5 w-14 rounded" style={{ background: 'rgba(255,255,255,0.06)' }} />
                </div>
              </div>
            ))}
          </div>
        ) : openChecks.length === 0 ? (
          <div className="text-center py-20 animate-fade-in">
            <button
              onClick={() => activeShift && setShowNewCheck(true)}
              disabled={!activeShift}
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 active:scale-90 transition-transform disabled:opacity-30"
              style={{
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.12), rgba(6, 182, 212, 0.06))',
                border: '1px solid rgba(139, 92, 246, 0.15)',
                boxShadow: '0 0 30px rgba(139, 92, 246, 0.08)',
              }}
            >
              <Plus className="w-7 h-7 text-[var(--c-accent-light)] animate-pulse" />
            </button>
            <p className="text-[var(--c-hint)] text-sm font-medium">Нет открытых чеков</p>
            <p className="text-xs text-[var(--c-muted)] mt-1">
              {activeShift ? 'Нажмите чтобы создать' : 'Откройте смену для начала'}
            </p>
          </div>
        ) : (
          <div className="grid gap-2.5 stagger-children" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', transform: 'translateZ(0)' }}>
            {openChecks.map((check) => (
              <CheckTile key={check.id} check={check} onSelect={handleSelectCheck} />
            ))}
          </div>
        )}
      </div>

      <Drawer open={showHistory} onClose={() => setShowHistory(false)} title="История смен">
        <ShiftHistory />
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
          {/* ── Search Results (Top) ── */}
          <div className="flex-1 overflow-y-auto min-h-[40dvh] space-y-1 pr-1">
            {isSearching && (
              <div className="flex justify-center py-6">
                <div className="w-6 h-6 border-2 border-[var(--c-accent)] border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {!isSearching && players.map((player) => (
              <button
                key={player.id}
                onClick={() => handlePlayerSelected(player)}
                className="w-full flex items-center gap-2.5 p-2.5 rounded-xl transition-all active:scale-[0.98]"
                style={{ background: 'transparent' }}
                onPointerEnter={(e) => { (e.target as HTMLElement).closest('button')!.style.background = 'rgba(255,255,255,0.04)'; }}
                onPointerLeave={(e) => { (e.target as HTMLElement).closest('button')!.style.background = 'transparent'; }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.12), rgba(6, 182, 212, 0.06))' }}
                >
                  <span className="text-xs font-bold text-[var(--c-accent-light)]">
                    {player.nickname?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="text-left flex-1 min-w-0">
                  <p className="font-semibold text-[13px] text-[var(--c-text)] truncate">
                    {player.nickname}
                  </p>
                  <div className="flex gap-1 mt-0.5">
                    {tierBadge(player.client_tier)}
                    {(player.balance ?? 0) < 0 && <Badge variant="danger" size="sm">{player.balance}₽</Badge>}
                    {(player.bonus_points ?? 0) > 0 && <Badge variant="accent" size="sm">{player.bonus_points} бон.</Badge>}
                  </div>
                </div>
              </button>
            ))}
            {searchQuery.length > 0 && !isSearching && players.length === 0 && (
              <p className="text-xs text-center text-[var(--c-hint)] py-6">
                Никого не найдено
              </p>
            )}
            {searchQuery.length === 0 && players.length === 0 && !isSearching && (
              <p className="text-xs text-center text-[var(--c-hint)] py-6">
                Введите никнейм или номер
              </p>
            )}
          </div>

          {/* ── Search & Navigation (Bottom) ── */}
          <div className="shrink-0 space-y-3 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--c-muted)]" />
              <Input
                placeholder="Поиск по нику..."
                value={searchQuery}
                onChange={(e) => searchPlayers(e.target.value)}
                className="pl-9"
                compact
              />
            </div>

            <div className="flex items-center gap-2 py-1">
              <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
              <span className="text-[9px] text-[var(--c-muted)] font-semibold tracking-widest">ИЛИ ВЫБЕРИТЕ</span>
              <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
            </div>

            <div className="grid grid-cols-3 gap-2 pb-1">
              <button
                onClick={handleCreateCheckNoClient}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl active:scale-[0.97] transition-all"
                style={{
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <UserX className="w-4 h-4 text-[var(--c-hint)]" />
                </div>
                <span className="text-[11px] font-semibold text-[var(--c-text)]">Без клиента</span>
              </button>
              <button
                onClick={() => { setShowNewCheck(false); setShowCreateClient(true); }}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl active:scale-[0.97] transition-all"
                style={{
                  background: 'rgba(52, 211, 153, 0.06)',
                  border: '1px solid rgba(52, 211, 153, 0.15)',
                }}
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(52, 211, 153, 0.1)' }}>
                  <UserPlus className="w-4 h-4 text-[var(--c-success)]" />
                </div>
                <span className="text-[11px] font-semibold text-[var(--c-success)]">Новый</span>
              </button>
              <button
                onClick={() => { setShowNewCheck(false); loadSpaces(); }}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl active:scale-[0.97] transition-all"
                style={{
                  background: 'rgba(99, 102, 241, 0.06)',
                  border: '1px solid rgba(99, 102, 241, 0.12)',
                }}
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(99, 102, 241, 0.12)' }}>
                  <DoorOpen className="w-4 h-4 text-indigo-400" />
                </div>
                <span className="text-[11px] font-semibold text-indigo-400">Кабинка</span>
              </button>
            </div>
          </div>
        </div>
      </Drawer>

      {/* ============ TARIFF SELECTOR ============ */}
      <Drawer
        open={showTariff}
        onClose={() => { setShowTariff(false); setSelectedPlayer(null); }}
        title="Выберите тариф"
        size="sm"
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
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(6, 182, 212, 0.08))' }}
              >
                <span className="text-sm font-bold text-[var(--c-accent-light)]">
                  {selectedPlayer.nickname?.charAt(0).toUpperCase()}
                </span>
              </div>
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

            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(VISIT_ITEMS) as [VisitTariff, typeof VISIT_ITEMS['regular']][]).map(([key, info]) => {
                const isSelected = selectedTariff === key;
                const isDefault = tierToTariff(selectedPlayer.client_tier || 'regular') === key;
                return (
                  <button
                    key={key}
                    onClick={() => { setSelectedTariff(key); hapticFeedback('light'); }}
                    className="relative flex flex-col items-center gap-1 p-3 rounded-xl transition-all active:scale-[0.97]"
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
                      <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                        <Star className="w-2.5 h-2.5 text-white fill-white" />
                      </div>
                    )}
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center`}
                      style={{
                        background: key === 'resident' ? 'rgba(52, 211, 153, 0.1)' :
                          key === 'student' ? 'rgba(96, 165, 250, 0.1)' :
                            key === 'single_game' ? 'rgba(251, 191, 36, 0.1)' :
                              'rgba(255, 255, 255, 0.06)',
                      }}
                    >
                      {key === 'resident' ? <Star className="w-4 h-4 text-[var(--c-success)]" /> :
                        key === 'student' ? <GraduationCap className="w-4 h-4 text-[var(--c-info)]" /> :
                          key === 'single_game' ? <Gamepad2 className="w-4 h-4 text-[var(--c-warning)]" /> :
                            <User className="w-4 h-4 text-[var(--c-hint)]" />}
                    </div>
                    <span className={`text-xs font-semibold ${isSelected ? 'text-[var(--c-accent-light)]' : 'text-[var(--c-text)]'}`}>
                      {info.label}
                    </span>
                    <span className={`text-sm font-black tabular-nums ${isSelected ? 'text-[var(--c-accent-light)]' : 'text-[var(--c-hint)]'}`}>
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
            compact
            autoFocus
          />

          <div>
            <p className="text-xs font-medium text-[var(--c-hint)] mb-2">Статус</p>
            <div className="grid grid-cols-3 gap-1.5">
              {([
                { key: 'regular' as ClientTier, label: 'Гость', icon: User, bgColor: 'rgba(255,255,255,0.06)' },
                { key: 'resident' as ClientTier, label: 'Резидент', icon: Star, bgColor: 'rgba(52,211,153,0.1)' },
                { key: 'student' as ClientTier, label: 'Студент', icon: GraduationCap, bgColor: 'rgba(96,165,250,0.1)' },
              ]).map(({ key, label, icon: Icon, bgColor }) => (
                <button
                  key={key}
                  onClick={() => setNewClientTier(key)}
                  className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl text-xs font-medium transition-all active:scale-[0.97]"
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
                    className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ background: newClientTier === key ? 'rgba(139, 92, 246, 0.15)' : bgColor }}
                  >
                    <Icon className="w-3.5 h-3.5" />
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
                className="w-full flex items-center gap-3 p-3 rounded-xl active:scale-[0.97] transition-all"
                style={{
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(99, 102, 241, 0.12)' }}>
                  <Icon className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-semibold text-[13px] text-[var(--c-text)]">{s.name}</p>
                  <p className="text-[11px] text-[var(--c-muted)]">
                    {s.hourly_rate ? `${s.hourly_rate}₽/час` : 'Ручная цена'}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </Drawer>

      {/* ── Fixed "New" button at the bottom ── */}
      <div className="absolute bottom-0 left-0 right-0 px-0 pt-6 pb-4 z-20 pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(10, 14, 26, 0.95) 70%, transparent)' }}>
        <div className="max-w-md mx-auto pointer-events-auto px-4 lg:px-0">
          <Button
            size="lg"
            fullWidth
            onClick={() => setShowNewCheck(true)}
            disabled={!activeShift}
            className="glow-accent py-4"
          >
            <Plus className="w-5 h-5 mr-2" />
            Новый чек
          </Button>
        </div>
      </div>
    </div>
  );
}
