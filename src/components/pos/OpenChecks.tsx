import { useEffect, useState } from 'react';
import { usePOSStore } from '@/store/pos';
import { useShiftStore } from '@/store/shift';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Input';
import { ShiftBar } from '@/components/shift/ShiftBar';
import { ShiftHistory } from '@/components/shift/ShiftHistory';
import { Plus, Receipt, Search, User, Clock, History, UserPlus, UserX } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types';
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

  // New client form
  const [newNickname, setNewNickname] = useState('');
  const [newIsResident, setNewIsResident] = useState(false);
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    loadOpenChecks();
  }, [loadOpenChecks]);

  const searchPlayers = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 1) {
      setPlayers([]);
      return;
    }
    setIsSearching(true);
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .ilike('nickname', `%${query}%`)
      .limit(20);
    setPlayers((data as Profile[]) || []);
    setIsSearching(false);
  };

  const handleCreateCheck = async (playerId: string | null) => {
    hapticFeedback('medium');
    const check = await createCheck(playerId);
    if (check) {
      setShowNewCheck(false);
      setSearchQuery('');
      setPlayers([]);
      onSelectCheck();
    }
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

    // Open check for the new client right away
    await handleCreateCheck(data.id);
  };

  const formatTime = (dateStr: string) =>
    new Date(dateStr).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

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
            className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors active:scale-95"
          >
            <History className="w-4 h-4 text-[var(--tg-theme-hint-color,#888)]" />
          </button>
          <Button size="lg" onClick={() => setShowNewCheck(true)} disabled={!activeShift}>
            <Plus className="w-5 h-5" />
            Новый чек
          </Button>
        </div>
      </div>

      {openChecks.length === 0 ? (
        <div className="text-center py-16">
          <Receipt className="w-20 h-20 text-white/5 mx-auto mb-4" />
          <p className="text-[var(--tg-theme-hint-color,#888)] text-lg">Нет открытых чеков</p>
          <p className="text-sm text-white/20 mt-1">
            {activeShift ? 'Нажмите «Новый чек» чтобы начать' : 'Откройте смену чтобы начать работу'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {openChecks.map((check) => (
            <button
              key={check.id}
              onClick={() => handleSelectCheck(check)}
              className="text-left p-4 rounded-2xl bg-white/5 hover:bg-white/10 transition-all active:scale-[0.97] border border-white/5 flex flex-col gap-3"
            >
              <div className="flex items-center gap-2">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                  check.player ? 'bg-[var(--tg-theme-button-color,#6c5ce7)]/20' : 'bg-white/10'
                }`}>
                  {check.player ? (
                    <User className="w-4 h-4 text-[var(--tg-theme-button-color,#6c5ce7)]" />
                  ) : (
                    <UserX className="w-4 h-4 text-white/40" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-[var(--tg-theme-text-color,#e0e0e0)] truncate">
                    {check.player?.nickname || 'Без клиента'}
                  </p>
                  {check.note && (
                    <p className="text-[10px] text-white/30 truncate">{check.note}</p>
                  )}
                </div>
              </div>

              <div className="flex items-end justify-between">
                <div className="flex items-center gap-1 text-[var(--tg-theme-hint-color,#888)]">
                  <Clock className="w-3 h-3" />
                  <span className="text-xs">{formatTime(check.created_at)}</span>
                </div>
                {check.total_amount > 0 ? (
                  <span className="text-lg font-bold text-[var(--tg-theme-button-color,#6c5ce7)]">
                    {check.total_amount}₽
                  </span>
                ) : (
                  <Badge variant="warning">Пусто</Badge>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Shift history drawer */}
      <Drawer
        open={showHistory}
        onClose={() => setShowHistory(false)}
        title="История смен"
      >
        <ShiftHistory />
      </Drawer>

      {/* New check drawer */}
      <Drawer
        open={showNewCheck}
        onClose={() => { setShowNewCheck(false); setSearchQuery(''); setPlayers([]); }}
        title="Новый чек"
      >
        <div className="space-y-4">
          {/* Quick actions */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleCreateCheck(null)}
              className="flex items-center gap-2 p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all active:scale-[0.98]"
            >
              <UserX className="w-5 h-5 text-white/40" />
              <span className="text-sm font-medium text-[var(--tg-theme-text-color,#e0e0e0)]">Без клиента</span>
            </button>
            <button
              onClick={() => { setShowNewCheck(false); setShowCreateClient(true); }}
              className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/20 transition-all active:scale-[0.98]"
            >
              <UserPlus className="w-5 h-5 text-emerald-400" />
              <span className="text-sm font-medium text-emerald-400">Новый клиент</span>
            </button>
          </div>

          <div className="relative flex items-center">
            <div className="flex-1 h-px bg-white/10" />
            <span className="px-3 text-[10px] text-white/30 font-medium">ИЛИ ВЫБЕРИТЕ</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
            <Input
              placeholder="Поиск по нику..."
              value={searchQuery}
              onChange={(e) => searchPlayers(e.target.value)}
              className="pl-10"
              autoFocus
            />
          </div>

          {isSearching && (
            <p className="text-sm text-center text-[var(--tg-theme-hint-color,#888)]">Поиск...</p>
          )}

          <div className="space-y-2 max-h-[40vh] overflow-y-auto">
            {players.map((player) => (
              <button
                key={player.id}
                onClick={() => handleCreateCheck(player.id)}
                className="w-full flex items-center gap-3 p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-all active:scale-[0.98]"
              >
                <div className="w-11 h-11 rounded-full bg-[var(--tg-theme-button-color,#6c5ce7)]/20 flex items-center justify-center shrink-0">
                  <User className="w-5 h-5 text-[var(--tg-theme-button-color,#6c5ce7)]" />
                </div>
                <div className="text-left flex-1 min-w-0">
                  <p className="font-semibold text-[var(--tg-theme-text-color,#e0e0e0)] truncate">
                    {player.nickname}
                  </p>
                  <div className="flex gap-2 mt-0.5">
                    {player.is_resident && <Badge variant="success">Резидент</Badge>}
                    {player.balance < 0 && <Badge variant="danger">{player.balance}₽</Badge>}
                    {player.bonus_points > 0 && <Badge variant="default">{player.bonus_points} бон.</Badge>}
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

      {/* Create new client drawer */}
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
            className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all active:scale-[0.98] ${
              newIsResident
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : 'bg-white/5 border-white/10'
            }`}
          >
            <span className="text-sm font-medium text-[var(--tg-theme-text-color,#e0e0e0)]">Резидент клуба</span>
            <div className={`w-10 h-6 rounded-full transition-colors relative ${
              newIsResident ? 'bg-emerald-500' : 'bg-white/20'
            }`}>
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                newIsResident ? 'left-5' : 'left-1'
              }`} />
            </div>
          </button>
          {createError && (
            <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{createError}</p>
          )}
          <Button fullWidth size="lg" onClick={handleCreateClient}>
            <UserPlus className="w-5 h-5" />
            Создать и открыть чек
          </Button>
        </div>
      </Drawer>
    </div>
  );
}
