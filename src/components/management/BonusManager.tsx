import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Drawer } from '@/components/ui/Drawer';
import {
  Star, Search, Settings, Plus, Minus, Save,
  User, TrendingUp, TrendingDown, ToggleLeft, ToggleRight,
} from 'lucide-react';
import { hapticNotification, hapticFeedback } from '@/lib/telegram';
import type { Profile, AppSettings } from '@/types';

type Tab = 'players' | 'settings';

const defaultSettings: AppSettings = {
  bonus_accrual_rate: 10,
  bonus_min_purchase: 0,
  bonus_enabled: true,
  bonus_accrual_on_debt: false,
};

export function BonusManager() {
  const [tab, setTab] = useState<Tab>('players');
  const [players, setPlayers] = useState<Profile[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Player bonus drawer
  const [selectedPlayer, setSelectedPlayer] = useState<Profile | null>(null);
  const [showPlayerDrawer, setShowPlayerDrawer] = useState(false);
  const [bonusAction, setBonusAction] = useState<'add' | 'subtract'>('add');
  const [bonusAmount, setBonusAmount] = useState('');
  const [bonusNote, setBonusNote] = useState('');

  // Settings
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [settingsChanged, setSettingsChanged] = useState(false);

  const user = useAuthStore((s) => s.user);

  const loadPlayers = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'client')
      .order('bonus_points', { ascending: false });
    if (data) setPlayers(data as Profile[]);
  }, []);

  const loadSettings = useCallback(async () => {
    const { data } = await supabase.from('app_settings').select('*');
    if (data) {
      const s = { ...defaultSettings };
      for (const row of data) {
        const k = row.key as keyof AppSettings;
        if (k === 'bonus_enabled' || k === 'bonus_accrual_on_debt') {
          (s as Record<string, boolean | number>)[k] = row.value === 'true';
        } else {
          (s as Record<string, boolean | number>)[k] = Number(row.value);
        }
      }
      setSettings(s);
      setSettingsChanged(false);
    }
  }, []);

  useEffect(() => {
    Promise.all([loadPlayers(), loadSettings()]).then(() => setIsLoading(false));
  }, [loadPlayers, loadSettings]);

  const filteredPlayers = players.filter((p) =>
    p.nickname.toLowerCase().includes(search.toLowerCase()),
  );

  const openPlayerDrawer = (p: Profile) => {
    setSelectedPlayer(p);
    setBonusAction('add');
    setBonusAmount('');
    setBonusNote('');
    setShowPlayerDrawer(true);
    hapticFeedback();
  };

  const submitBonus = async () => {
    if (!selectedPlayer || !bonusAmount) return;
    const amount = Math.abs(Number(bonusAmount));
    if (amount <= 0) return;

    const newPoints = bonusAction === 'add'
      ? selectedPlayer.bonus_points + amount
      : Math.max(0, selectedPlayer.bonus_points - amount);

    await supabase
      .from('profiles')
      .update({ bonus_points: newPoints })
      .eq('id', selectedPlayer.id);

    await supabase.from('transactions').insert({
      type: bonusAction === 'add' ? 'bonus_accrual' : 'bonus_spend',
      amount,
      description: bonusNote || (bonusAction === 'add' ? 'Ручное начисление баллов' : 'Ручное списание баллов'),
      player_id: selectedPlayer.id,
      created_by: user?.id,
    });

    hapticNotification('success');
    setShowPlayerDrawer(false);
    loadPlayers();
  };

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSettingsChanged(true);
  };

  const saveSettings = async () => {
    const entries: { key: string; value: string }[] = [
      { key: 'bonus_accrual_rate', value: String(settings.bonus_accrual_rate) },
      { key: 'bonus_min_purchase', value: String(settings.bonus_min_purchase) },
      { key: 'bonus_enabled', value: String(settings.bonus_enabled) },
      { key: 'bonus_accrual_on_debt', value: String(settings.bonus_accrual_on_debt) },
    ];
    for (const e of entries) {
      await supabase
        .from('app_settings')
        .update({ value: e.value, updated_at: new Date().toISOString() })
        .eq('key', e.key);
    }
    setSettingsChanged(false);
    hapticNotification('success');
  };

  const totalBonusPoints = players.reduce((s, p) => s + p.bonus_points, 0);
  const playersWithBonus = players.filter((p) => p.bonus_points > 0).length;

  if (isLoading) {
    return (
      <div className="text-center py-20">
        <div className="w-8 h-8 border-2 border-[var(--c-accent)] border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/15 text-center">
          <p className="text-lg font-bold text-amber-400">{totalBonusPoints}</p>
          <p className="text-[10px] text-white/40">Всего баллов</p>
        </div>
        <div className="p-3 rounded-xl bg-violet-500/10 border border-violet-500/15 text-center">
          <p className="text-lg font-bold text-violet-400">{playersWithBonus}</p>
          <p className="text-[10px] text-white/40">С баллами</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 card rounded-xl">
        <button onClick={() => setTab('players')} className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${tab === 'players' ? 'bg-[var(--c-accent)] text-white shadow' : 'text-white/50 hover:text-white/70'}`}>
          <User className="w-4 h-4 inline mr-1.5" />Клиенты
        </button>
        <button onClick={() => setTab('settings')} className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${tab === 'settings' ? 'bg-[var(--c-accent)] text-white shadow' : 'text-white/50 hover:text-white/70'}`}>
          <Settings className="w-4 h-4 inline mr-1.5" />Настройки
        </button>
      </div>

      {/* ============ PLAYERS ============ */}
      {tab === 'players' && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              type="text" placeholder="Поиск клиента..."
              className="w-full pl-10 pr-4 py-2.5 card rounded-xl text-[13px] text-[var(--c-text)] placeholder:text-white/30"
              value={search} onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            {filteredPlayers.map((p) => (
              <button
                key={p.id}
                onClick={() => openPlayerDrawer(p)}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl card-interactive"
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500/20 to-yellow-500/20 flex items-center justify-center shrink-0">
                  <Star className="w-4 h-4 text-amber-400" />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-[13px] font-medium text-[var(--c-text)] truncate">{p.nickname}</p>
                  {p.balance < 0 && (
                    <p className="text-[10px] text-red-400">Долг: {Math.abs(p.balance)}₽</p>
                  )}
                </div>
                <Badge variant={p.bonus_points > 0 ? 'success' : 'default'} size="sm">
                  <Star className="w-3 h-3 inline mr-0.5" />{p.bonus_points}
                </Badge>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ============ SETTINGS ============ */}
      {tab === 'settings' && (
        <div className="space-y-4">
          {/* Enable/disable */}
          <div className="flex items-center justify-between p-3 rounded-xl card">
            <div>
              <p className="text-[13px] font-medium text-[var(--c-text)]">Бонусная система</p>
              <p className="text-xs text-white/40">Начисление при закрытии чеков</p>
            </div>
            <button onClick={() => updateSetting('bonus_enabled', !settings.bonus_enabled)} className="text-[var(--c-accent)]">
              {settings.bonus_enabled
                ? <ToggleRight className="w-8 h-8" />
                : <ToggleLeft className="w-8 h-8 text-white/30" />}
            </button>
          </div>

          {settings.bonus_enabled && (
            <>
              {/* Accrual rate */}
              <div className="p-3 rounded-xl card space-y-2">
                <p className="text-[13px] font-medium text-[var(--c-text)]">Процент начисления</p>
                <p className="text-xs text-white/40">Сколько % от суммы чека начисляется в виде баллов</p>
                <div className="flex items-center gap-3">
                  <input
                    type="range" min="1" max="30" step="1"
                    value={settings.bonus_accrual_rate}
                    onChange={(e) => updateSetting('bonus_accrual_rate', Number(e.target.value))}
                    className="flex-1 accent-[var(--c-accent)]"
                  />
                  <span className="font-bold text-lg text-[var(--c-accent)] min-w-[3rem] text-right">
                    {settings.bonus_accrual_rate}%
                  </span>
                </div>
                <p className="text-[10px] text-white/30">
                  Пример: чек 1000₽ → начисление {Math.floor(1000 * settings.bonus_accrual_rate / 100)} баллов
                </p>
              </div>

              {/* Min purchase */}
              <div className="p-3 rounded-xl card space-y-2">
                <p className="text-[13px] font-medium text-[var(--c-text)]">Мин. сумма для начисления</p>
                <p className="text-xs text-white/40">Не начислять баллы если сумма ниже</p>
                <Input
                  type="number" placeholder="0₽ (без ограничений)"
                  value={settings.bonus_min_purchase || ''}
                  onChange={(e) => updateSetting('bonus_min_purchase', Number(e.target.value))}
                  min={0}
                />
              </div>

              {/* Accrue on debt */}
              <div className="flex items-center justify-between p-3 rounded-xl card">
                <div>
                  <p className="text-[13px] font-medium text-[var(--c-text)]">Начисление при долге</p>
                  <p className="text-xs text-white/40">Начислять баллы при оплате «В долг»</p>
                </div>
                <button onClick={() => updateSetting('bonus_accrual_on_debt', !settings.bonus_accrual_on_debt)} className="text-[var(--c-accent)]">
                  {settings.bonus_accrual_on_debt
                    ? <ToggleRight className="w-8 h-8" />
                    : <ToggleLeft className="w-8 h-8 text-white/30" />}
                </button>
              </div>
            </>
          )}

          {settingsChanged && (
            <Button fullWidth size="lg" onClick={saveSettings}>
              <Save className="w-5 h-5" />
              Сохранить настройки
            </Button>
          )}
        </div>
      )}

      {/* ============ PLAYER BONUS DRAWER ============ */}
      <Drawer
        open={showPlayerDrawer}
        onClose={() => setShowPlayerDrawer(false)}
        title={selectedPlayer?.nickname || 'Баллы'}
        size="md"
      >
        {selectedPlayer && (
          <div className="space-y-4">
            <div className="text-center p-6 rounded-xl bg-gradient-to-br from-amber-500/10 to-yellow-500/5 border border-amber-500/20">
              <Star className="w-10 h-10 text-amber-400 mx-auto mb-2" />
              <p className="text-3xl font-bold text-amber-400">{selectedPlayer.bonus_points}</p>
              <p className="text-xs text-white/40 mt-1">баллов</p>
            </div>

            {/* Action toggle */}
            <div className="flex gap-1 p-1 card rounded-xl">
              <button
                onClick={() => setBonusAction('add')}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${bonusAction === 'add' ? 'bg-emerald-500/20 text-emerald-400' : 'text-white/50'}`}
              >
                <Plus className="w-4 h-4" />Начислить
              </button>
              <button
                onClick={() => setBonusAction('subtract')}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${bonusAction === 'subtract' ? 'bg-red-500/20 text-red-400' : 'text-white/50'}`}
              >
                <Minus className="w-4 h-4" />Списать
              </button>
            </div>

            <Input
              label="Количество баллов"
              type="number" placeholder="0"
              value={bonusAmount}
              onChange={(e) => setBonusAmount(e.target.value)}
              min={0}
            />

            <Input
              label="Примечание"
              placeholder="Причина (необязательно)"
              value={bonusNote}
              onChange={(e) => setBonusNote(e.target.value)}
            />

            {bonusAmount && Number(bonusAmount) > 0 && (
              <div className="p-2.5 rounded-xl card text-center">
                <p className="text-xs text-white/40">Баланс после</p>
                <p className="text-xl font-bold text-[var(--c-text)]">
                  {bonusAction === 'add'
                    ? selectedPlayer.bonus_points + Math.abs(Number(bonusAmount))
                    : Math.max(0, selectedPlayer.bonus_points - Math.abs(Number(bonusAmount)))
                  } <Star className="w-4 h-4 inline text-amber-400" />
                </p>
              </div>
            )}

            <Button
              fullWidth size="lg"
              onClick={submitBonus}
              disabled={!bonusAmount || Number(bonusAmount) <= 0}
              variant={bonusAction === 'subtract' ? 'danger' : 'primary'}
            >
              {bonusAction === 'add' ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
              {bonusAction === 'add' ? 'Начислить' : 'Списать'} {bonusAmount || 0} баллов
            </Button>
          </div>
        )}
      </Drawer>
    </div>
  );
}
