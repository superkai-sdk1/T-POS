import { useEffect, useState, useRef, useCallback, memo, startTransition } from 'react';
import { usePOSStore } from '@/store/pos';
import { useShiftStore } from '@/store/shift';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Input';
import { ShiftBar } from '@/components/shift/ShiftBar';
import { ShiftHistory } from '@/components/shift/ShiftHistory';
import { Plus, Receipt, Search, User, Clock, History, UserPlus, UserX, DoorOpen, Home, Building2, Warehouse, Star, GraduationCap, Gamepad2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Profile, Space, VisitTariff, ClientTier, Check } from '@/types';
import { hapticFeedback, hapticNotification } from '@/lib/telegram';

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
      className="card-interactive text-left p-3 flex flex-col gap-2"
    >
      <div className="flex items-center gap-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${hasSpace
          ? 'bg-indigo-500/12'
          : check.player
            ? 'bg-[var(--c-accent)]/10'
            : 'bg-[var(--c-surface)]'
          }`}>
          {hasSpace ? (() => { const Icon = spaceIconMap[check.space!.type] || DoorOpen; return <Icon className="w-3.5 h-3.5 text-indigo-400" />; })()
            : check.player
              ? <span className="text-xs font-bold text-[var(--c-accent)]">{check.player.nickname?.charAt(0).toUpperCase()}</span>
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
        await saveCartToDb();
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

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  const tierBadge = (tier: ClientTier | undefined) => {
    if (tier === 'resident') return <Badge variant="success" size="sm">Резидент</Badge>;
    if (tier === 'student') return <Badge variant="accent" size="sm">Студент</Badge>;
    return null;
  };

  return (
    <div className="space-y-4">
      <ShiftBar />

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
            className="w-9 h-9 rounded-xl bg-[var(--c-surface)] border border-[var(--c-border)] flex items-center justify-center hover:bg-[var(--c-surface-hover)] transition-all active:scale-90"
          >
            <History className="w-4 h-4 text-[var(--c-hint)]" />
          </button>
          <Button size="sm" onClick={() => setShowNewCheck(true)} disabled={!activeShift}>
            <Plus className="w-3.5 h-3.5" />
            Новый
          </Button>
        </div>
      </div>

      {!checksLoaded ? (
        <div className="grid grid-cols-2 gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-3 rounded-xl bg-[var(--c-surface)] animate-pulse space-y-2 border border-[var(--c-border)]" style={{ opacity: 1 - i * 0.2 }}>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[var(--c-surface-hover)]" />
                <div className="flex-1"><div className="h-3 w-20 rounded bg-[var(--c-surface-hover)]" /></div>
              </div>
              <div className="flex items-end justify-between">
                <div className="h-2.5 w-12 rounded bg-[var(--c-surface)]" />
                <div className="h-5 w-14 rounded bg-[var(--c-surface-hover)]" />
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
            style={{ background: 'linear-gradient(135deg, rgba(var(--c-accent-rgb), 0.12), rgba(var(--c-accent-rgb), 0.06))', border: '1px solid rgba(var(--c-accent-rgb), 0.15)', boxShadow: '0 0 30px rgba(var(--c-accent-rgb), 0.08)' }}
          >
            <Plus className="w-7 h-7 text-[var(--c-accent)] animate-pulse" />
          </button>
          <p className="text-[var(--c-hint)] text-sm font-medium">Нет открытых чеков</p>
          <p className="text-xs text-[var(--c-muted)] mt-1">
            {activeShift ? 'Нажмите чтобы создать' : 'Откройте смену для начала'}
          </p>
        </div>
      ) : (
        <div className="grid gap-2 stagger-children" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
          {openChecks.map((check) => (
            <CheckTile key={check.id} check={check} onSelect={handleSelectCheck} />
          ))}
        </div>
      )}

      <Drawer open={showHistory} onClose={() => setShowHistory(false)} title="История смен">
        <ShiftHistory />
      </Drawer>

      {/* ============ NEW CHECK ============ */}
      <Drawer
        open={showNewCheck}
        onClose={() => { setShowNewCheck(false); setSearchQuery(''); setPlayers([]); }}
        title="Новый чек"
        size="md"
      >
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={handleCreateCheckNoClient}
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl card-interactive"
            >
              <div className="w-9 h-9 rounded-lg bg-[var(--c-surface-hover)] flex items-center justify-center">
                <UserX className="w-4 h-4 text-[var(--c-hint)]" />
              </div>
              <span className="text-[11px] font-semibold text-[var(--c-text)]">Без клиента</span>
            </button>
            <button
              onClick={() => { setShowNewCheck(false); setShowCreateClient(true); }}
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-[var(--c-success-bg)] border border-[var(--c-success-border)] active:scale-[0.97] transition-transform"
            >
              <div className="w-9 h-9 rounded-lg bg-[var(--c-success-bg)] flex items-center justify-center">
                <UserPlus className="w-4 h-4 text-[var(--c-success)]" />
              </div>
              <span className="text-[11px] font-semibold text-[var(--c-success)]">Новый</span>
            </button>
            <button
              onClick={() => { setShowNewCheck(false); loadSpaces(); }}
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-indigo-500/6 border border-indigo-500/10 active:scale-[0.97] transition-transform"
            >
              <div className="w-9 h-9 rounded-lg bg-indigo-500/12 flex items-center justify-center">
                <DoorOpen className="w-4 h-4 text-indigo-400" />
              </div>
              <span className="text-[11px] font-semibold text-indigo-400">Кабинка</span>
            </button>
          </div>

          <div className="flex items-center gap-2 py-1">
            <div className="flex-1 h-px bg-[var(--c-border)]" />
            <span className="text-[9px] text-[var(--c-muted)] font-semibold tracking-widest">ИЛИ ВЫБЕРИТЕ</span>
            <div className="flex-1 h-px bg-[var(--c-border)]" />
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--c-muted)]" />
            <Input
              placeholder="Поиск по нику..."
              value={searchQuery}
              onChange={(e) => searchPlayers(e.target.value)}
              className="pl-9"
              compact
              autoFocus
            />
          </div>

          {isSearching && (
            <div className="flex justify-center py-3">
              <div className="w-5 h-5 border-2 border-[var(--c-accent)] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          <div className="space-y-1 max-h-[35vh] overflow-y-auto">
            {players.map((player) => (
              <button
                key={player.id}
                onClick={() => handlePlayerSelected(player)}
                className="w-full flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-[var(--c-surface)] transition-colors active:scale-[0.98]"
              >
                <div className="w-8 h-8 rounded-lg bg-[var(--c-accent)]/10 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-[var(--c-accent)]">
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
            <div className="flex items-center gap-3 p-3 rounded-xl card">
              <div className="w-10 h-10 rounded-xl bg-[var(--c-accent)]/10 flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-[var(--c-accent)]">
                  {selectedPlayer.nickname?.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-[var(--c-text)] truncate">{selectedPlayer.nickname}</p>
                <div className="flex gap-1 mt-0.5">
                  {tierBadge(selectedPlayer.client_tier)}
                  {(selectedPlayer.bonus_points ?? 0) > 0 && (
                    <Badge variant="accent" size="sm">{selectedPlayer.bonus_points} бон.</Badge>
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
                    className={`relative flex flex-col items-center gap-1 p-3 rounded-xl border transition-all active:scale-[0.97] ${isSelected
                      ? 'bg-[var(--c-accent)]/10 border-[var(--c-accent)]/30'
                      : 'card border-[var(--c-border)]'
                      }`}
                  >
                    {isDefault && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                        <Star className="w-2.5 h-2.5 text-white fill-white" />
                      </div>
                    )}
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${key === 'resident' ? 'bg-[var(--c-success-bg)]' :
                      key === 'student' ? 'bg-[var(--c-info-bg)]' :
                        key === 'single_game' ? 'bg-[var(--c-warning-bg)]' :
                          'bg-[var(--c-surface-hover)]'
                      }`}>
                      {key === 'resident' ? <Star className="w-4 h-4 text-[var(--c-success)]" /> :
                        key === 'student' ? <GraduationCap className="w-4 h-4 text-[var(--c-info)]" /> :
                          key === 'single_game' ? <Gamepad2 className="w-4 h-4 text-[var(--c-warning)]" /> :
                            <User className="w-4 h-4 text-[var(--c-hint)]" />}
                    </div>
                    <span className={`text-xs font-semibold ${isSelected ? 'text-[var(--c-accent)]' : 'text-[var(--c-text)]'
                      }`}>
                      {info.label}
                    </span>
                    <span className={`text-sm font-black tabular-nums ${isSelected ? 'text-[var(--c-accent)]' : 'text-[var(--c-hint)]'
                      }`}>
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
                { key: 'regular' as ClientTier, label: 'Гость', icon: User, color: 'bg-[var(--c-surface)]' },
                { key: 'resident' as ClientTier, label: 'Резидент', icon: Star, color: 'bg-emerald-500/12' },
                { key: 'student' as ClientTier, label: 'Студент', icon: GraduationCap, color: 'bg-blue-500/12' },
              ]).map(({ key, label, icon: Icon, color }) => (
                <button
                  key={key}
                  onClick={() => setNewClientTier(key)}
                  className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl text-xs font-medium transition-all active:scale-[0.97] ${newClientTier === key
                    ? 'bg-[var(--c-accent)]/10 border border-[var(--c-accent)]/30 text-[var(--c-accent)]'
                    : 'card border border-[var(--c-border)] text-[var(--c-hint)]'
                    }`}
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${newClientTier === key ? 'bg-[var(--c-accent)]/15' : color}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {createError && (
            <p className="text-xs text-[var(--c-danger)] bg-[var(--c-danger-bg)] rounded-lg px-3 py-2 border border-[var(--c-border)]">{createError}</p>
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
                className="w-full flex items-center gap-3 p-3 rounded-xl card-interactive"
              >
                <div className="w-9 h-9 rounded-lg bg-indigo-500/12 flex items-center justify-center shrink-0">
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
    </div>
  );
}
