import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Drawer } from '@/components/ui/Drawer';
import { TabSwitcher } from '@/components/ui/TabSwitcher';
import {
  AlertTriangle, TrendingDown, TrendingUp, User, Wallet,
  Plus, Search, ArrowUpCircle, ArrowDownCircle, Clock, PiggyBank,
} from 'lucide-react';
import { hapticFeedback, hapticNotification } from '@/lib/telegram';
import { useOnTableChange } from '@/hooks/useRealtimeSync';
import type { Profile, Transaction } from '@/types';

type BalanceTab = 'debtors' | 'deposits';

interface BalanceHistoryEntry {
  id: string;
  amount: number;
  description: string | null;
  created_at: string;
  creator?: { nickname: string } | null;
}

export function DebtorsManager() {
  const [tab, setTab] = useState<BalanceTab>('debtors');
  const [debtors, setDebtors] = useState<Profile[]>([]);
  const [depositors, setDepositors] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [showAdjust, setShowAdjust] = useState(false);
  const [amount, setAmount] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [history, setHistory] = useState<BalanceHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [showNewDialog, setShowNewDialog] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [allClients, setAllClients] = useState<Profile[]>([]);
  const [selectedNewClient, setSelectedNewClient] = useState<Profile | null>(null);
  const [newAmount, setNewAmount] = useState('');
  const [newNote, setNewNote] = useState('');

  const user = useAuthStore((s) => s.user);

  const load = useCallback(async () => {
    const [debtRes, depRes] = await Promise.all([
      supabase.from('profiles').select('*').lt('balance', 0).is('deleted_at', null).order('balance', { ascending: true }),
      supabase.from('profiles').select('*').gt('balance', 0).is('deleted_at', null).order('balance', { ascending: false }),
    ]);
    if (debtRes.data) setDebtors(debtRes.data as Profile[]);
    if (depRes.data) setDepositors(depRes.data as Profile[]);
    setIsLoading(false);
  }, []);

  const profilesTables = useMemo(() => ['profiles'], []);
  useOnTableChange(profilesTables, load);

  useEffect(() => { load(); }, [load]);

  const totalDebt = debtors.reduce((s, d) => s + d.balance, 0);
  const totalDeposits = depositors.reduce((s, d) => s + d.balance, 0);

  const loadHistory = async (profileId: string) => {
    setHistoryLoading(true);
    const { data } = await supabase
      .from('transactions')
      .select('id, amount, description, created_at, creator:profiles!transactions_created_by_fkey(nickname)')
      .eq('player_id', profileId)
      .eq('type', 'debt_adjustment')
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) {
      setHistory(data.map((t) => ({
        ...t,
        creator: Array.isArray(t.creator) ? t.creator[0] : t.creator,
      })) as BalanceHistoryEntry[]);
    }
    setHistoryLoading(false);
  };

  const openAdjust = (p: Profile) => {
    setSelected(p);
    setAmount('');
    setAdjustNote('');
    setShowAdjust(true);
    loadHistory(p.id);
    hapticFeedback('light');
  };

  const handleRepay = async () => {
    if (!selected || !amount) return;
    const val = Math.abs(Number(amount));
    if (!Number.isFinite(val) || val <= 0) return;

    const { data: fresh } = await supabase.from('profiles').select('balance').eq('id', selected.id).single();
    const currentBalance = fresh?.balance ?? selected.balance;
    const newBalance = currentBalance + val;
    await supabase.from('profiles').update({ balance: newBalance }).eq('id', selected.id);

    await supabase.from('transactions').insert({
      type: 'debt_adjustment',
      amount: val,
      description: `Погашение долга${adjustNote ? ': ' + adjustNote : ''} (было ${currentBalance}₽, стало ${newBalance}₽)`,
      player_id: selected.id,
      created_by: user?.id,
    });

    hapticNotification('success');
    setShowAdjust(false);
    load();
  };

  const handleIncrease = async () => {
    if (!selected || !amount) return;
    const val = Math.abs(Number(amount));
    if (!Number.isFinite(val) || val <= 0) return;

    const { data: fresh } = await supabase.from('profiles').select('balance').eq('id', selected.id).single();
    const currentBalance = fresh?.balance ?? selected.balance;
    const newBalance = currentBalance - val;
    await supabase.from('profiles').update({ balance: newBalance }).eq('id', selected.id);

    await supabase.from('transactions').insert({
      type: 'debt_adjustment',
      amount: -val,
      description: `Увеличение долга${adjustNote ? ': ' + adjustNote : ''} (было ${currentBalance}₽, стало ${newBalance}₽)`,
      player_id: selected.id,
      created_by: user?.id,
    });

    hapticNotification('warning');
    setShowAdjust(false);
    load();
  };

  const handleAddDeposit = async () => {
    if (!selected || !amount) return;
    const val = Math.abs(Number(amount));
    if (!Number.isFinite(val) || val <= 0) return;

    const { data: fresh } = await supabase.from('profiles').select('balance').eq('id', selected.id).single();
    const currentBalance = fresh?.balance ?? selected.balance;
    const newBalance = currentBalance + val;
    await supabase.from('profiles').update({ balance: newBalance }).eq('id', selected.id);

    await supabase.from('transactions').insert({
      type: 'debt_adjustment',
      amount: val,
      description: `Пополнение депозита${adjustNote ? ': ' + adjustNote : ''} (было ${currentBalance}₽, стало ${newBalance}₽)`,
      player_id: selected.id,
      created_by: user?.id,
    });

    hapticNotification('success');
    setShowAdjust(false);
    load();
  };

  const handleWithdrawDeposit = async () => {
    if (!selected || !amount) return;
    const val = Math.abs(Number(amount));
    if (!Number.isFinite(val) || val <= 0) return;

    const { data: fresh } = await supabase.from('profiles').select('balance').eq('id', selected.id).single();
    const currentBalance = fresh?.balance ?? selected.balance;
    const newBalance = currentBalance - val;
    await supabase.from('profiles').update({ balance: newBalance }).eq('id', selected.id);

    await supabase.from('transactions').insert({
      type: 'debt_adjustment',
      amount: -val,
      description: `Списание с депозита${adjustNote ? ': ' + adjustNote : ''} (было ${currentBalance}₽, стало ${newBalance}₽)`,
      player_id: selected.id,
      created_by: user?.id,
    });

    hapticNotification('warning');
    setShowAdjust(false);
    load();
  };

  const openNewDialog = async () => {
    setShowNewDialog(true);
    setClientSearch('');
    setSelectedNewClient(null);
    setNewAmount('');
    setNewNote('');
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'client')
      .is('deleted_at', null)
      .order('nickname');
    if (data) setAllClients(data as Profile[]);
  };

  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return allClients.slice(0, 30);
    const q = clientSearch.toLowerCase();
    return allClients.filter((c) =>
      c.nickname.toLowerCase().includes(q) ||
      (c.phone && c.phone.includes(q)) ||
      (c.search_tags && c.search_tags.some((t) => t.toLowerCase().includes(q)))
    ).slice(0, 30);
  }, [allClients, clientSearch]);

  const handleCreateNew = async (type: 'debt' | 'deposit') => {
    if (!selectedNewClient || !newAmount) return;
    const val = Math.abs(Number(newAmount));
    if (!Number.isFinite(val) || val <= 0) return;

    const { data: fresh } = await supabase.from('profiles').select('balance').eq('id', selectedNewClient.id).single();
    const currentBalance = fresh?.balance ?? selectedNewClient.balance;
    const delta = type === 'debt' ? -val : val;
    const newBalance = currentBalance + delta;
    await supabase.from('profiles').update({ balance: newBalance }).eq('id', selectedNewClient.id);

    const desc = type === 'debt'
      ? `Создание долга${newNote ? ': ' + newNote : ''} (было ${currentBalance}₽, стало ${newBalance}₽)`
      : `Внесение депозита${newNote ? ': ' + newNote : ''} (было ${currentBalance}₽, стало ${newBalance}₽)`;

    await supabase.from('transactions').insert({
      type: 'debt_adjustment',
      amount: delta,
      description: desc,
      player_id: selectedNewClient.id,
      created_by: user?.id,
    });

    hapticNotification('success');
    setShowNewDialog(false);
    load();
  };

  const fmtCur = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + '₽';
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  const isDebtorTab = tab === 'debtors';
  const activeList = isDebtorTab ? debtors : depositors;

  if (isLoading) {
    return (
      <div className="space-y-3 py-4">
        {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl skeleton" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <TabSwitcher
        tabs={[
          { id: 'debtors', label: `Должники (${debtors.length})`, icon: <AlertTriangle className="w-4 h-4" /> },
          { id: 'deposits', label: `Депозиты (${depositors.length})`, icon: <PiggyBank className="w-4 h-4" /> },
        ]}
        activeId={tab}
        onChange={(id) => setTab(id as 'debtors' | 'deposits')}
        variant={isDebtorTab ? 'danger' : 'cyan'}
      />

      {/* Summary */}
      {isDebtorTab ? (
        <div className="p-3 rounded-xl bg-[var(--c-danger-bg)] border border-[var(--c-border)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[var(--c-hint)]">Общий долг</p>
              <p className="text-lg font-black text-[var(--c-danger)]">{fmtCur(totalDebt)}</p>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-[var(--c-danger)]" />
              <span className="text-[13px] text-[var(--c-hint)]">{debtors.length} чел.</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[var(--c-hint)]">Общий депозит</p>
              <p className="text-lg font-black text-cyan-400">{fmtCur(totalDeposits)}</p>
            </div>
            <div className="flex items-center gap-2">
              <PiggyBank className="w-5 h-5 text-cyan-400" />
              <span className="text-[13px] text-[var(--c-hint)]">{depositors.length} чел.</span>
            </div>
          </div>
        </div>
      )}

      {/* Add new button */}
      <Button fullWidth variant="secondary" onClick={openNewDialog}>
        <Plus className="w-4 h-4" />
        {isDebtorTab ? 'Создать долг' : 'Внести депозит'}
      </Button>

      {/* List */}
      {activeList.length === 0 ? (
        <div className="text-center py-12">
          {isDebtorTab ? (
            <>
              <Wallet className="w-16 h-16 text-[var(--c-muted)] mx-auto mb-4" />
              <p className="text-[var(--c-hint)]">Нет должников</p>
            </>
          ) : (
            <>
              <PiggyBank className="w-16 h-16 text-[var(--c-muted)] mx-auto mb-4" />
              <p className="text-[var(--c-hint)]">Нет депозитов</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {activeList.map((d) => (
            <button
              key={d.id}
              onClick={() => openAdjust(d)}
              className="w-full flex items-center gap-3 p-2.5 rounded-xl card-interactive"
            >
              <div className={`w-10 h-10 rounded-xl ${isDebtorTab ? 'bg-red-500/15' : 'bg-cyan-500/15'} flex items-center justify-center shrink-0`}>
                <User className={`w-5 h-5 ${isDebtorTab ? 'text-red-400' : 'text-cyan-400'}`} />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="font-semibold text-[13px] text-[var(--c-text)] truncate">{d.nickname}</p>
                {d.is_resident && <span className="text-[10px] text-[var(--c-success)]">Резидент</span>}
              </div>
              <span className={`text-lg font-bold shrink-0 ${isDebtorTab ? 'text-[var(--c-danger)]' : 'text-cyan-400'}`}>
                {isDebtorTab ? fmtCur(d.balance) : '+' + fmtCur(d.balance)}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Adjust balance drawer */}
      <Drawer
        open={showAdjust}
        onClose={() => setShowAdjust(false)}
        title={selected ? selected.nickname : 'Баланс'}
        size="lg"
      >
        {selected && (
          <div className="space-y-4">
            {/* Current balance */}
            <div className={`p-3 rounded-xl border text-center ${
              selected.balance < 0
                ? 'bg-[var(--c-danger-bg)] border-[var(--c-border)]'
                : selected.balance > 0
                  ? 'bg-cyan-500/10 border-cyan-500/20'
                  : 'card border-[var(--c-border)]'
            }`}>
              <p className="text-xs text-[var(--c-hint)] mb-1">
                {selected.balance < 0 ? 'Текущий долг' : selected.balance > 0 ? 'Текущий депозит' : 'Баланс'}
              </p>
              <p className={`text-xl font-black ${
                selected.balance < 0 ? 'text-[var(--c-danger)]' : selected.balance > 0 ? 'text-cyan-400' : 'text-[var(--c-text)]'
              }`}>
                {selected.balance > 0 ? '+' : ''}{fmtCur(selected.balance)}
              </p>
            </div>

            <Input
              type="number"
              label="Сумма"
              placeholder="Введите сумму"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={1}
              autoFocus
            />

            <Input
              label="Примечание"
              placeholder="Причина (необязательно)"
              value={adjustNote}
              onChange={(e) => setAdjustNote(e.target.value)}
            />

            {/* Preview */}
            {Number(amount) > 0 && (
              <div className="p-2.5 rounded-xl card space-y-1.5">
                {selected.balance < 0 ? (
                  <>
                    <div className="flex justify-between text-[13px]">
                      <span className="text-[var(--c-hint)]">При погашении</span>
                      <span className={`font-semibold ${selected.balance + Number(amount) >= 0 ? 'text-[var(--c-success)]' : 'text-[var(--c-warning)]'}`}>
                        {fmtCur(selected.balance + Number(amount))}
                        {selected.balance + Number(amount) > 0 && (
                          <span className="text-[10px] text-cyan-400 ml-1">(→ депозит)</span>
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between text-[13px]">
                      <span className="text-[var(--c-hint)]">При увеличении долга</span>
                      <span className="font-semibold text-[var(--c-danger)]">
                        {fmtCur(selected.balance - Number(amount))}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between text-[13px]">
                      <span className="text-[var(--c-hint)]">При пополнении</span>
                      <span className="font-semibold text-cyan-400">
                        +{fmtCur(selected.balance + Number(amount))}
                      </span>
                    </div>
                    <div className="flex justify-between text-[13px]">
                      <span className="text-[var(--c-hint)]">При списании</span>
                      <span className={`font-semibold ${selected.balance - Number(amount) < 0 ? 'text-[var(--c-danger)]' : 'text-[var(--c-warning)]'}`}>
                        {fmtCur(selected.balance - Number(amount))}
                        {selected.balance - Number(amount) < 0 && (
                          <span className="text-[10px] text-red-400 ml-1">(→ долг)</span>
                        )}
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Action buttons */}
            {selected.balance < 0 ? (
              <div className="flex gap-2">
                <Button
                  fullWidth
                  onClick={handleRepay}
                  disabled={!amount || Number(amount) <= 0}
                >
                  <TrendingUp className="w-4 h-4" />
                  Погасить
                </Button>
                <Button
                  fullWidth
                  variant="danger"
                  onClick={handleIncrease}
                  disabled={!amount || Number(amount) <= 0}
                >
                  <TrendingDown className="w-4 h-4" />
                  Увеличить
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  fullWidth
                  onClick={handleAddDeposit}
                  disabled={!amount || Number(amount) <= 0}
                >
                  <ArrowUpCircle className="w-4 h-4" />
                  Пополнить
                </Button>
                <Button
                  fullWidth
                  variant="danger"
                  onClick={handleWithdrawDeposit}
                  disabled={!amount || Number(amount) <= 0}
                >
                  <ArrowDownCircle className="w-4 h-4" />
                  Списать
                </Button>
              </div>
            )}

            {/* Balance history */}
            <div className="pt-2 border-t border-[var(--c-border)]">
              <p className="text-xs font-semibold text-[var(--c-hint)] mb-2 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                История операций
              </p>
              {historyLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <div key={i} className="h-10 rounded-lg skeleton" />)}
                </div>
              ) : history.length === 0 ? (
                <p className="text-[11px] text-[var(--c-muted)] text-center py-4">Нет операций</p>
              ) : (
                <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                  {history.map((h) => (
                    <div key={h.id} className="flex items-start gap-2 p-2 rounded-lg card">
                      <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
                        h.amount > 0 ? 'bg-emerald-500/15' : 'bg-red-500/15'
                      }`}>
                        {h.amount > 0
                          ? <TrendingUp className="w-3 h-3 text-emerald-400" />
                          : <TrendingDown className="w-3 h-3 text-red-400" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-[var(--c-text)] leading-tight line-clamp-2">{h.description}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-[var(--c-muted)]">{fmtDate(h.created_at)}</span>
                          {h.creator && (
                            <span className="text-[10px] text-[var(--c-muted)]">• {h.creator.nickname}</span>
                          )}
                        </div>
                      </div>
                      <span className={`text-xs font-bold shrink-0 ${h.amount > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {h.amount > 0 ? '+' : ''}{fmtCur(h.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* New debt/deposit drawer */}
      <Drawer
        open={showNewDialog}
        onClose={() => setShowNewDialog(false)}
        title={isDebtorTab ? 'Новый долг' : 'Новый депозит'}
        size="lg"
      >
        <div className="space-y-4">
          {!selectedNewClient ? (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--c-hint)]" />
                <input
                  type="text"
                  placeholder="Поиск клиента..."
                  className="w-full pl-10 pr-4 py-2.5 card rounded-xl text-[13px] text-[var(--c-text)] placeholder:text-[var(--c-muted)]"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                {filteredClients.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { setSelectedNewClient(c); hapticFeedback('light'); }}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl card-interactive"
                  >
                    <div className="w-9 h-9 rounded-lg bg-[var(--c-surface-hover)] flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-[var(--c-hint)]" />
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="font-medium text-[13px] text-[var(--c-text)] truncate">{c.nickname}</p>
                      {c.balance !== 0 && (
                        <p className={`text-[10px] ${c.balance < 0 ? 'text-[var(--c-danger)]' : 'text-cyan-400'}`}>
                          Баланс: {c.balance > 0 ? '+' : ''}{fmtCur(c.balance)}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
                {filteredClients.length === 0 && (
                  <p className="text-center text-[var(--c-muted)] text-sm py-6">Не найдено</p>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 p-3 rounded-xl card border border-[var(--c-border)]">
                <div className="w-10 h-10 rounded-lg bg-[var(--c-surface-hover)] flex items-center justify-center shrink-0">
                  <User className="w-5 h-5 text-[var(--c-hint)]" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-[var(--c-text)]">{selectedNewClient.nickname}</p>
                  <p className={`text-[11px] ${selectedNewClient.balance < 0 ? 'text-[var(--c-danger)]' : selectedNewClient.balance > 0 ? 'text-cyan-400' : 'text-[var(--c-muted)]'}`}>
                    Текущий баланс: {selectedNewClient.balance > 0 ? '+' : ''}{fmtCur(selectedNewClient.balance)}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedNewClient(null)}
                  className="text-[var(--c-hint)] text-xs underline"
                >
                  Изменить
                </button>
              </div>

              <Input
                type="number"
                label="Сумма"
                placeholder="Введите сумму"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                min={1}
                autoFocus
              />

              <Input
                label="Примечание"
                placeholder="Причина (необязательно)"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
              />

              {Number(newAmount) > 0 && (
                <div className="p-2.5 rounded-xl card">
                  <div className="flex justify-between text-[13px]">
                    <span className="text-[var(--c-hint)]">Новый баланс</span>
                    <span className={`font-semibold ${
                      isDebtorTab
                        ? 'text-[var(--c-danger)]'
                        : 'text-cyan-400'
                    }`}>
                      {isDebtorTab
                        ? fmtCur(selectedNewClient.balance - Number(newAmount))
                        : '+' + fmtCur(selectedNewClient.balance + Number(newAmount))
                      }
                    </span>
                  </div>
                </div>
              )}

              <Button
                fullWidth
                variant={isDebtorTab ? 'danger' : 'primary'}
                onClick={() => handleCreateNew(isDebtorTab ? 'debt' : 'deposit')}
                disabled={!newAmount || Number(newAmount) <= 0}
              >
                {isDebtorTab ? (
                  <><AlertTriangle className="w-4 h-4" /> Создать долг</>
                ) : (
                  <><PiggyBank className="w-4 h-4" /> Внести депозит</>
                )}
              </Button>
            </>
          )}
        </div>
      </Drawer>
    </div>
  );
}
