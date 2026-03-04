import { useEffect, useState, useRef, useCallback } from 'react';
import { usePOSStore } from '@/store/pos';
import { useShiftStore } from '@/store/shift';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Input';
import { ShiftBar } from '@/components/shift/ShiftBar';
import { ShiftHistory } from '@/components/shift/ShiftHistory';
import { Plus, Receipt, Search, User, Clock, History, UserPlus, UserX, DoorOpen, Home, Building2, Warehouse } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Profile, Space } from '@/types';
import { hapticFeedback, hapticNotification } from '@/lib/telegram';

interface OpenChecksProps {
  onSelectCheck: () => void;
}

export function OpenChecks({ onSelectCheck }: OpenChecksProps) {
  const { openChecks, loadOpenChecks, createCheck, selectCheck } = usePOSStore();
  const activeShift = useShiftStore((s) => s.activeShift);
  const [showNewCheck, setShowNewCheck] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [players, setPlayers] = useState<Profile[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [newNickname, setNewNickname] = useState('');
  const [newIsResident, setNewIsResident] = useState(false);
  const [createError, setCreateError] = useState('');
  const [showSpaces, setShowSpaces] = useState(false);
  const [spacesList, setSpacesList] = useState<Space[]>([]);

  useEffect(() => {
    loadOpenChecks();
  }, [loadOpenChecks]);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchPlayers = useCallback((query: string) => {
    setSearchQuery(query);
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
        .limit(20);
      setPlayers((data as Profile[]) || []);
      setIsSearching(false);
    }, 300);
  }, []);

  const handleCreateCheck = async (playerId: string | null, spaceId?: string | null) => {
    hapticFeedback('medium');
    const check = await createCheck(playerId, spaceId);
    if (check) {
      setShowNewCheck(false);
      setShowSpaces(false);
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

  const spaceIconMap: Record<string, typeof Home> = {
    cabin_small: Home,
    cabin_big: Building2,
    hall: Warehouse,
  };

  const handleSelectCheck = async (check: (typeof openChecks)[0]) => {
    hapticFeedback('light');
    await selectCheck(check);
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
        is_resident: newIsResident,
        role: 'client',
      })
      .select()
      .single();

    if (error || !data) {
      setCreateError('Ошибка создания');
      return;
    }

    hapticNotification('success');
    setShowCreateClient(false);
    setNewNickname('');
    setNewIsResident(false);
    await handleCreateCheck(data.id);
  };

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  const fmtCur = (n: number) =>
    new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + '₽';

  return (
    <div className="space-y-4">
      <ShiftBar />

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[var(--tg-theme-text-color,#e0e0e0)]">Касса</h2>
          <p className="text-xs text-[var(--tg-theme-hint-color,#888)]">
            {openChecks.length > 0 ? `${openChecks.length} открыт${openChecks.length === 1 ? '' : 'о'}` : 'Нет открытых чеков'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowHistory(true)}
            className="w-10 h-10 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center hover:bg-white/10 transition-all active:scale-90"
          >
            <History className="w-4 h-4 text-[var(--tg-theme-hint-color,#888)]" />
          </button>
          <Button size="md" onClick={() => setShowNewCheck(true)} disabled={!activeShift}>
            <Plus className="w-4 h-4" />
            Новый чек
          </Button>
        </div>
      </div>

      {openChecks.length === 0 ? (
        <div className="text-center py-16 animate-fade-in">
          <div className="w-20 h-20 rounded-3xl bg-white/3 flex items-center justify-center mx-auto mb-4">
            <Receipt className="w-10 h-10 text-white/8" />
          </div>
          <p className="text-[var(--tg-theme-hint-color,#888)] text-base font-medium">Нет открытых чеков</p>
          <p className="text-sm text-white/20 mt-1">
            {activeShift ? 'Нажмите «Новый чек» чтобы начать' : 'Откройте смену чтобы начать'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 stagger-children">
          {openChecks.map((check) => (
            <button
              key={check.id}
              onClick={() => handleSelectCheck(check)}
              className="text-left p-3.5 rounded-2xl glass hover:bg-white/6 transition-all duration-200 active:scale-[0.97] flex flex-col gap-2.5"
            >
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  check.space
                    ? 'bg-indigo-500/15'
                    : check.player
                    ? 'bg-gradient-to-br from-[var(--tg-theme-button-color,#6c5ce7)]/25 to-purple-600/10'
                    : 'bg-white/8'
                }`}>
                  {check.space ? (
                    <DoorOpen className="w-4 h-4 text-indigo-400" />
                  ) : check.player ? (
                    <User className="w-4 h-4 text-[var(--tg-theme-button-color,#6c5ce7)]" />
                  ) : (
                    <UserX className="w-4 h-4 text-white/30" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-[var(--tg-theme-text-color,#e0e0e0)] truncate leading-tight">
                    {check.space ? check.space.name : check.player?.nickname || 'Без клиента'}
                  </p>
                  {check.space && check.player && (
                    <p className="text-[10px] text-indigo-400/60 truncate mt-0.5">{check.player.nickname}</p>
                  )}
                  {!check.space && check.note && (
                    <p className="text-[10px] text-white/25 truncate mt-0.5">{check.note}</p>
                  )}
                </div>
              </div>

              <div className="flex items-end justify-between">
                <div className="flex items-center gap-1 text-[var(--tg-theme-hint-color,#888)]">
                  <Clock className="w-3 h-3" />
                  <span className="text-[11px]">{formatTime(check.created_at)}</span>
                </div>
                {check.total_amount > 0 ? (
                  <span className="text-lg font-black text-[var(--tg-theme-text-color,#e0e0e0)] tabular-nums">
                    {fmtCur(check.total_amount)}
                  </span>
                ) : (
                  <Badge variant="warning">Пусто</Badge>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Shift history */}
      <Drawer
        open={showHistory}
        onClose={() => setShowHistory(false)}
        title="История смен"
      >
        <ShiftHistory />
      </Drawer>

      {/* New check */}
      <Drawer
        open={showNewCheck}
        onClose={() => { setShowNewCheck(false); setSearchQuery(''); setPlayers([]); }}
        title="Новый чек"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => handleCreateCheck(null)}
              className="flex flex-col items-center gap-2 p-3.5 rounded-2xl glass hover:bg-white/8 transition-all active:scale-[0.97]"
            >
              <div className="w-10 h-10 rounded-xl bg-white/8 flex items-center justify-center">
                <UserX className="w-5 h-5 text-white/40" />
              </div>
              <span className="text-xs font-semibold text-[var(--tg-theme-text-color,#e0e0e0)]">Без клиента</span>
            </button>
            <button
              onClick={() => { setShowNewCheck(false); setShowCreateClient(true); }}
              className="flex flex-col items-center gap-2 p-3.5 rounded-2xl bg-emerald-500/8 border border-emerald-500/15 hover:bg-emerald-500/12 transition-all active:scale-[0.97]"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                <UserPlus className="w-5 h-5 text-emerald-400" />
              </div>
              <span className="text-xs font-semibold text-emerald-400">Новый</span>
            </button>
            <button
              onClick={() => { setShowNewCheck(false); loadSpaces(); }}
              className="flex flex-col items-center gap-2 p-3.5 rounded-2xl bg-indigo-500/8 border border-indigo-500/15 hover:bg-indigo-500/12 transition-all active:scale-[0.97]"
            >
              <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center">
                <DoorOpen className="w-5 h-5 text-indigo-400" />
              </div>
              <span className="text-xs font-semibold text-indigo-400">Кабинка</span>
            </button>
          </div>

          <div className="relative flex items-center">
            <div className="flex-1 h-px bg-white/8" />
            <span className="px-3 text-[10px] text-white/25 font-semibold tracking-wider">ИЛИ ВЫБЕРИТЕ</span>
            <div className="flex-1 h-px bg-white/8" />
          </div>

          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
            <Input
              placeholder="Поиск по нику..."
              value={searchQuery}
              onChange={(e) => searchPlayers(e.target.value)}
              className="pl-10"
              autoFocus
            />
          </div>

          {isSearching && (
            <div className="flex justify-center py-4">
              <div className="w-5 h-5 border-2 border-[var(--tg-theme-button-color,#6c5ce7)] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
            {players.map((player) => (
              <button
                key={player.id}
                onClick={() => handleCreateCheck(player.id)}
                className="w-full flex items-center gap-3 p-3 rounded-xl glass hover:bg-white/8 transition-all active:scale-[0.98]"
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--tg-theme-button-color,#6c5ce7)]/20 to-purple-600/5 flex items-center justify-center shrink-0">
                  <User className="w-5 h-5 text-[var(--tg-theme-button-color,#6c5ce7)]" />
                </div>
                <div className="text-left flex-1 min-w-0">
                  <p className="font-semibold text-sm text-[var(--tg-theme-text-color,#e0e0e0)] truncate">
                    {player.nickname}
                  </p>
                  <div className="flex gap-1.5 mt-1">
                    {player.is_resident && <Badge variant="success">Резидент</Badge>}
                    {(player.balance ?? 0) < 0 && <Badge variant="danger">{player.balance}₽</Badge>}
                    {(player.bonus_points ?? 0) > 0 && <Badge variant="accent">{player.bonus_points} бон.</Badge>}
                  </div>
                </div>
              </button>
            ))}
            {searchQuery.length > 0 && !isSearching && players.length === 0 && (
              <p className="text-sm text-center text-[var(--tg-theme-hint-color,#888)] py-8">
                Никого не найдено
              </p>
            )}
          </div>
        </div>
      </Drawer>

      {/* Create client */}
      <Drawer
        open={showCreateClient}
        onClose={() => { setShowCreateClient(false); setNewNickname(''); setNewIsResident(false); setCreateError(''); }}
        title="Новый клиент"
      >
        <div className="space-y-4">
          <Input
            label="Никнейм"
            placeholder="Имя клиента"
            value={newNickname}
            onChange={(e) => setNewNickname(e.target.value)}
            autoFocus
          />
          <button
            onClick={() => setNewIsResident(!newIsResident)}
            className={`w-full flex items-center justify-between p-3.5 rounded-xl border transition-all active:scale-[0.98] ${
              newIsResident
                ? 'bg-emerald-500/8 border-emerald-500/25'
                : 'bg-white/3 border-white/8'
            }`}
          >
            <span className="text-sm font-medium text-[var(--tg-theme-text-color,#e0e0e0)]">Резидент клуба</span>
            <div className={`w-11 h-6 rounded-full transition-colors relative ${
              newIsResident ? 'bg-emerald-500' : 'bg-white/15'
            }`}>
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-200 shadow ${
                newIsResident ? 'left-6' : 'left-1'
              }`} />
            </div>
          </button>
          {createError && (
            <p className="text-sm text-red-400 bg-red-500/8 rounded-xl px-3 py-2 border border-red-500/10">{createError}</p>
          )}
          <Button fullWidth size="lg" onClick={handleCreateClient}>
            <UserPlus className="w-5 h-5" />
            Создать и открыть чек
          </Button>
        </div>
      </Drawer>

      {/* Space selection */}
      <Drawer
        open={showSpaces}
        onClose={() => setShowSpaces(false)}
        title="Чек на кабинку / зал"
      >
        <div className="space-y-3">
          <p className="text-xs text-[var(--tg-theme-hint-color,#888)]">Выберите пространство для открытия чека</p>
          {spacesList.map((s) => (
            <button
              key={s.id}
              onClick={() => handleCreateCheck(null, s.id)}
              className="w-full flex items-center gap-3 p-4 rounded-2xl glass hover:bg-white/8 transition-all active:scale-[0.97]"
            >
              {(() => { const Icon = spaceIconMap[s.type] || DoorOpen; return <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center shrink-0"><Icon className="w-5 h-5 text-indigo-400" /></div>; })()}
              <div className="flex-1 text-left">
                <p className="font-bold text-sm text-[var(--tg-theme-text-color,#e0e0e0)]">{s.name}</p>
                <p className="text-xs text-white/30">
                  {s.hourly_rate ? `${s.hourly_rate}₽/час` : 'Ручная цена'}
                </p>
              </div>
            </button>
          ))}
        </div>
      </Drawer>
    </div>
  );
}
