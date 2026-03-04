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
          <h2 className="text-lg font-bold text-[var(--tg-theme-text-color,#e0e0e0)]">Касса</h2>
          <p className="text-[11px] text-[var(--tg-theme-hint-color,#888)]">
            {openChecks.length > 0 ? `${openChecks.length} открыт${openChecks.length === 1 ? '' : 'о'}` : 'Нет открытых чеков'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowHistory(true)}
            className="w-9 h-9 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center hover:bg-white/10 transition-all active:scale-90"
          >
            <History className="w-4 h-4 text-[var(--tg-theme-hint-color,#888)]" />
          </button>
          <Button size="sm" onClick={() => setShowNewCheck(true)} disabled={!activeShift}>
            <Plus className="w-3.5 h-3.5" />
            Новый
          </Button>
        </div>
      </div>

      {openChecks.length === 0 ? (
        <div className="text-center py-20 animate-fade-in">
          <button
            onClick={() => activeShift && setShowNewCheck(true)}
            disabled={!activeShift}
            className="w-16 h-16 rounded-2xl bg-[var(--tg-theme-button-color,#6c5ce7)]/10 border border-[var(--tg-theme-button-color,#6c5ce7)]/15 flex items-center justify-center mx-auto mb-4 active:scale-90 transition-transform disabled:opacity-30"
          >
            <Plus className="w-7 h-7 text-[var(--tg-theme-button-color,#6c5ce7)] animate-pulse" />
          </button>
          <p className="text-[var(--tg-theme-hint-color,#888)] text-sm font-medium">Нет открытых чеков</p>
          <p className="text-xs text-white/20 mt-1">
            {activeShift ? 'Нажмите чтобы создать' : 'Откройте смену для начала'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 stagger-children">
          {openChecks.map((check) => {
            const hasSpace = !!check.space;
            return (
              <button
                key={check.id}
                onClick={() => handleSelectCheck(check)}
                className="card-interactive text-left p-3 flex flex-col gap-2"
              >
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    hasSpace
                      ? 'bg-indigo-500/12'
                      : check.player
                      ? 'bg-[var(--tg-theme-button-color,#6c5ce7)]/10'
                      : 'bg-white/5'
                  }`}>
                    {hasSpace ? (() => { const Icon = spaceIconMap[check.space!.type] || DoorOpen; return <Icon className="w-3.5 h-3.5 text-indigo-400" />; })()
                      : check.player
                      ? <span className="text-xs font-bold text-[var(--tg-theme-button-color,#6c5ce7)]">{check.player.nickname?.charAt(0).toUpperCase()}</span>
                      : <UserX className="w-3.5 h-3.5 text-white/25" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[13px] text-[var(--tg-theme-text-color,#e0e0e0)] truncate leading-tight">
                      {hasSpace ? check.space!.name : check.player?.nickname || 'Без клиента'}
                    </p>
                    {hasSpace && check.player && (
                      <p className="text-[10px] text-indigo-400/50 truncate">{check.player.nickname}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-end justify-between mt-auto">
                  <div className="flex items-center gap-1 text-white/25">
                    <Clock className="w-3 h-3" />
                    <span className="text-[10px] tabular-nums"><ElapsedTime since={check.created_at} /></span>
                  </div>
                  {check.total_amount > 0 ? (
                    <span className="text-base font-black text-[var(--tg-theme-text-color,#e0e0e0)] tabular-nums leading-none">
                      {fmtCur(check.total_amount)}
                    </span>
                  ) : (
                    <Badge variant="default" size="sm">Пусто</Badge>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <Drawer open={showHistory} onClose={() => setShowHistory(false)} title="История смен">
        <ShiftHistory />
      </Drawer>

      <Drawer
        open={showNewCheck}
        onClose={() => { setShowNewCheck(false); setSearchQuery(''); setPlayers([]); }}
        title="Новый чек"
        size="md"
      >
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => handleCreateCheck(null)}
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl card-interactive"
            >
              <div className="w-9 h-9 rounded-lg bg-white/6 flex items-center justify-center">
                <UserX className="w-4 h-4 text-white/35" />
              </div>
              <span className="text-[11px] font-semibold text-[var(--tg-theme-text-color,#e0e0e0)]">Без клиента</span>
            </button>
            <button
              onClick={() => { setShowNewCheck(false); setShowCreateClient(true); }}
              className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-emerald-500/6 border border-emerald-500/10 active:scale-[0.97] transition-transform"
            >
              <div className="w-9 h-9 rounded-lg bg-emerald-500/12 flex items-center justify-center">
                <UserPlus className="w-4 h-4 text-emerald-400" />
              </div>
              <span className="text-[11px] font-semibold text-emerald-400">Новый</span>
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
            <div className="flex-1 h-px bg-white/6" />
            <span className="text-[9px] text-white/20 font-semibold tracking-widest">ИЛИ ВЫБЕРИТЕ</span>
            <div className="flex-1 h-px bg-white/6" />
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
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
              <div className="w-5 h-5 border-2 border-[var(--tg-theme-button-color,#6c5ce7)] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          <div className="space-y-1 max-h-[35vh] overflow-y-auto">
            {players.map((player) => (
              <button
                key={player.id}
                onClick={() => handleCreateCheck(player.id)}
                className="w-full flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-white/5 transition-colors active:scale-[0.98]"
              >
                <div className="w-8 h-8 rounded-lg bg-[var(--tg-theme-button-color,#6c5ce7)]/10 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-[var(--tg-theme-button-color,#6c5ce7)]">
                    {player.nickname?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="text-left flex-1 min-w-0">
                  <p className="font-semibold text-[13px] text-[var(--tg-theme-text-color,#e0e0e0)] truncate">
                    {player.nickname}
                  </p>
                  <div className="flex gap-1 mt-0.5">
                    {player.is_resident && <Badge variant="success" size="sm">Резидент</Badge>}
                    {(player.balance ?? 0) < 0 && <Badge variant="danger" size="sm">{player.balance}₽</Badge>}
                    {(player.bonus_points ?? 0) > 0 && <Badge variant="accent" size="sm">{player.bonus_points} бон.</Badge>}
                  </div>
                </div>
              </button>
            ))}
            {searchQuery.length > 0 && !isSearching && players.length === 0 && (
              <p className="text-xs text-center text-[var(--tg-theme-hint-color,#888)] py-6">
                Никого не найдено
              </p>
            )}
          </div>
        </div>
      </Drawer>

      <Drawer
        open={showCreateClient}
        onClose={() => { setShowCreateClient(false); setNewNickname(''); setNewIsResident(false); setCreateError(''); }}
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
          <button
            onClick={() => setNewIsResident(!newIsResident)}
            className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all active:scale-[0.98] ${
              newIsResident
                ? 'bg-emerald-500/6 border-emerald-500/20'
                : 'bg-white/3 border-white/6'
            }`}
          >
            <span className="text-[13px] font-medium text-[var(--tg-theme-text-color,#e0e0e0)]">Резидент клуба</span>
            <div className={`w-10 h-5.5 rounded-full transition-colors relative ${
              newIsResident ? 'bg-emerald-500' : 'bg-white/12'
            }`}>
              <div className={`absolute top-0.5 w-4.5 h-4.5 rounded-full bg-white transition-all duration-150 shadow ${
                newIsResident ? 'left-5' : 'left-0.5'
              }`} />
            </div>
          </button>
          {createError && (
            <p className="text-xs text-red-400 bg-red-500/6 rounded-lg px-3 py-2 border border-red-500/8">{createError}</p>
          )}
          <Button fullWidth onClick={handleCreateClient}>
            <UserPlus className="w-4 h-4" />
            Создать и открыть чек
          </Button>
        </div>
      </Drawer>

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
                onClick={() => handleCreateCheck(null, s.id)}
                className="w-full flex items-center gap-3 p-3 rounded-xl card-interactive"
              >
                <div className="w-9 h-9 rounded-lg bg-indigo-500/12 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-indigo-400" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-semibold text-[13px] text-[var(--tg-theme-text-color,#e0e0e0)]">{s.name}</p>
                  <p className="text-[11px] text-white/25">
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
