import { useEffect, useState, useRef, useCallback, memo, startTransition } from 'react';
import { usePOSStore } from '@/store/pos';
import { useShiftStore } from '@/store/shift';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Input';
import { ShiftHistory } from '@/components/shift/ShiftHistory';
import { Plus, Receipt, Search, User, Clock, History, UserPlus, UserX, DoorOpen, Home, Building2, Warehouse, Star, GraduationCap, Gamepad2, RotateCcw, PlusCircle } from 'lucide-react';
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
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + '₽';

const CheckTile = memo(({ check, onSelect }: { check: Check; onSelect: (check: Check) => void }) => {
  const hasSpace = !!check.space;
  const displayName = hasSpace
    ? check.space!.name
    : (() => {
        const names: string[] = [];
        if (check.player?.nickname) names.push(check.player.nickname);
        if (check.guest_names) names.push(...check.guest_names.split(', ').filter(Boolean));
        return names.length > 0 ? names.join(', ') : 'БЕЗ КЛИЕНТА';
      })();
  const isEmpty = !check.player && !check.space && check.total_amount === 0;
  const avatarUrl = check.player?.photo_url ?? null;

  return (
    <button
      type="button"
      onClick={() => onSelect(check)}
      className={`relative flex flex-col justify-between p-3 rounded-[24px] transition-all border min-h-[120px] text-left active:scale-[0.98] ${
        isEmpty
          ? 'bg-transparent border-dashed border-white/5 opacity-30'
          : 'bg-[#1b1b26] border-white/5 shadow-xl'
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="relative shrink-0">
          <div className="w-10 h-10 rounded-xl overflow-hidden bg-[#252535] border border-white/10 flex items-center justify-center shadow-inner">
            {hasSpace ? (
              (() => {
                const Icon = spaceIconMap[check.space!.type] || DoorOpen;
                return <Icon className="w-5 h-5 text-violet-400" />;
              })()
            ) : avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <User className={`w-5 h-5 ${isEmpty ? 'text-white/5' : 'text-white/20'}`} />
            )}
          </div>
          {!isEmpty && (
            <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-[#0d0d12] rounded-full flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-[#10b981] shadow-[0_0_4px_#10b981]" />
            </div>
          )}
        </div>
        <div className="flex-1 pt-0.5 overflow-hidden min-w-0">
          <h3 className="text-[11px] font-black tracking-tight uppercase leading-tight line-clamp-2 text-white/90">
            {displayName}
          </h3>
          <div className="flex items-center gap-0.5 text-[7px] font-bold text-white/20 uppercase tracking-widest mt-1">
            <Clock className="w-2 h-2 shrink-0" />
            <ElapsedTime since={check.created_at} />
          </div>
        </div>
      </div>

      <div className="flex justify-end items-end mt-auto">
        <div
          className={`text-lg font-black italic tracking-tighter tabular-nums ${
            isEmpty ? 'text-white/5' : 'text-[#8b5cf6]'
          }`}
        >
          {isEmpty ? '—' : `${(check.total_amount || 0).toLocaleString('ru-RU')} ₽`}
        </div>
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
      // Search by nickname
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .ilike('nickname', `%${query}%`)
        .is('deleted_at', null)
        .limit(20);
      const nicknameResults = (data as Profile[]) || [];
      const nicknameIds = new Set(nicknameResults.map(r => r.id));

      // Also search by tags — fetch all clients with tags and filter client-side
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

  return (
    <div className="flex-1 flex flex-col min-h-0 relative bg-[#0d0d12] text-white">
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden animate-fade-in">
        {/* Заголовок КАССА и Действия — компактно */}
        <div className="px-4 sm:px-6 py-3 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-black italic uppercase tracking-tighter text-white">Касса</h2>
            <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest">
              {activeCount} активн{activeCount === 1 ? 'ый' : 'ых'}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowHistory(true)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#1b1b26] hover:bg-[#252535] rounded-xl transition-all border border-white/5 shadow-lg group"
            >
              <History className="w-4 h-4 text-white/40 group-hover:text-violet-400" />
              <span className="text-[10px] font-black uppercase tracking-widest text-white/40 group-hover:text-white">История</span>
            </button>
            <button
              type="button"
              onClick={() => setShowRefunds(true)}
              disabled={!activeShift}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#1b1b26] hover:bg-rose-500/10 rounded-xl transition-all border border-white/5 shadow-lg group disabled:opacity-40 disabled:pointer-events-none"
            >
              <RotateCcw className="w-4 h-4 text-rose-500/40 group-hover:text-rose-500" />
              <span className="text-[10px] font-black uppercase tracking-widest text-rose-500/40 group-hover:text-rose-500">Возвраты</span>
            </button>
          </div>
        </div>

        {/* Сетка чеков — уменьшенные карточки */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 sm:px-6 pb-24 min-h-0 scrollbar-none">
          {!checksLoaded ? (
            <div className="grid grid-cols-2 gap-2.5">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="p-3 rounded-[24px] animate-pulse border border-white/5 min-h-[120px] bg-[#1b1b26]"
                  style={{ opacity: 1 - i * 0.2 }}
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
            <div className="grid grid-cols-2 gap-2.5">
              {openChecks.map((check) => (
                <CheckTile key={check.id} check={check} onSelect={handleSelectCheck} />
              ))}
            </div>
          )}
        </div>

        {/* FAB — закреплён над панелью навигации (fixed) */}
        <div
          className="fixed left-0 right-0 px-4 sm:px-6 pointer-events-none z-[65] flex justify-center"
          style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="max-w-xl mx-auto flex justify-center">
            <button
              type="button"
              onClick={() => {
                if (activeShift) setShowNewCheck(true);
              }}
              disabled={!activeShift}
              className="pointer-events-auto flex items-center gap-2 px-6 py-3.5 bg-[#8b5cf6] rounded-[20px] font-black uppercase tracking-widest shadow-[0_10px_24px_rgba(139,92,246,0.35)] hover:scale-105 active:scale-95 transition-all text-xs text-white disabled:opacity-40 disabled:hover:scale-100"
            >
              <PlusCircle className="w-5 h-5" />
              Новый чек
            </button>
          </div>
        </div>
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
          {/* ── Search input (Top) ── */}
          <div className="shrink-0 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--c-muted)]" />
            <Input
              placeholder="Поиск игрока..."
              value={searchQuery}
              onChange={(e) => searchPlayers(e.target.value)}
              className="pl-9"
              compact
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
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(6, 182, 212, 0.08))' }}
                >
                  <span className="text-sm font-bold text-[var(--c-accent-light)]">
                    {player.nickname?.charAt(0).toUpperCase()}
                  </span>
                </div>
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
            compact
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
