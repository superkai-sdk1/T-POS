import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { useOnTableChange } from '@/hooks/useRealtimeSync';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Drawer } from '@/components/ui/Drawer';
import { SwipeableRow } from '@/components/ui/SwipeableRow';
import { Plus, Building2, Zap, Users, MoreHorizontal, Trash2 } from 'lucide-react';
import type { Expense, ExpenseCategory } from '@/types';
import { hapticFeedback, hapticNotification } from '@/lib/telegram';

const CATEGORIES: { value: ExpenseCategory; label: string; icon: typeof Building2; color: string }[] = [
  { value: 'rent', label: 'Аренда', icon: Building2, color: 'text-blue-400 bg-blue-500/10' },
  { value: 'utilities', label: 'Коммуналка', icon: Zap, color: 'text-amber-400 bg-amber-500/10' },
  { value: 'salary', label: 'Зарплаты', icon: Users, color: 'text-emerald-400 bg-emerald-500/10' },
  { value: 'other', label: 'Прочее', icon: MoreHorizontal, color: 'text-gray-400 bg-gray-500/10' },
];

const fmtCur = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + '₽';

export function ExpensesManager() {
  const { user } = useAuthStore();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [category, setCategory] = useState<ExpenseCategory>('other');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [filterCat, setFilterCat] = useState<ExpenseCategory | 'all'>('all');
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7));

  const load = useCallback(async () => {
    const start = filterMonth + '-01';
    const y = parseInt(filterMonth.slice(0, 4));
    const m = parseInt(filterMonth.slice(5, 7));
    const end = new Date(y, m, 1).toISOString().slice(0, 10);

    let q = supabase
      .from('expenses')
      .select('*, creator:profiles!expenses_created_by_fkey(nickname)')
      .gte('expense_date', start)
      .lt('expense_date', end)
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (filterCat !== 'all') q = q.eq('category', filterCat);
    const { data } = await q;
    if (data) setExpenses(data as Expense[]);
  }, [filterCat, filterMonth]);

  useEffect(() => { load(); }, [load]);
  useOnTableChange(useMemo(() => ['expenses'], []), load);

  const handleSave = async () => {
    if (!amount || Number(amount) <= 0) return;
    setSaving(true);
    const { error } = await supabase.from('expenses').insert({
      category,
      amount: Number(amount),
      description: description.trim() || null,
      expense_date: expenseDate,
      created_by: user?.id || null,
    });
    setSaving(false);
    if (!error) {
      hapticNotification('success');
      setShowAdd(false);
      setAmount('');
      setDescription('');
    }
  };

  const handleDelete = async (id: string) => {
    hapticFeedback('medium');
    await supabase.from('expenses').delete().eq('id', id);
  };

  const totalMonth = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const byCategory = CATEGORIES.map((cat) => ({
    ...cat,
    total: expenses.filter((e) => e.category === cat.value).reduce((s, e) => s + Number(e.amount), 0),
  }));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <input
            type="month"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="bg-white/5 border border-white/8 rounded-lg px-2 py-1 text-[12px] text-[var(--c-text)]"
          />
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Расход
        </Button>
      </div>

      <div className="p-3 rounded-xl card">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] text-white/30 font-semibold uppercase tracking-wider">Итого за месяц</span>
          <span className="text-xl font-black text-red-400 tabular-nums">{fmtCur(totalMonth)}</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {byCategory.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setFilterCat(filterCat === cat.value ? 'all' : cat.value)}
              className={`flex items-center gap-2 p-2 rounded-lg transition-all active:scale-95 ${
                filterCat === cat.value ? 'bg-[var(--c-accent)]/10 border border-[var(--c-accent)]/20' : 'bg-white/3'
              }`}
            >
              <cat.icon className={`w-3.5 h-3.5 ${cat.color.split(' ')[0]}`} />
              <div className="flex-1 text-left">
                <p className="text-[10px] text-white/40">{cat.label}</p>
                <p className="text-[12px] font-bold text-[var(--c-text)] tabular-nums">{fmtCur(cat.total)}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        {expenses.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-white/20">Нет расходов за выбранный период</p>
          </div>
        ) : (
          expenses.map((exp) => {
            const cat = CATEGORIES.find((c) => c.value === exp.category) || CATEGORIES[3];
            return (
              <SwipeableRow key={exp.id} onDelete={() => handleDelete(exp.id)}>
                <div className="flex items-center gap-2.5 p-2.5 rounded-xl card">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${cat.color.split(' ')[1]}`}>
                    <cat.icon className={`w-4 h-4 ${cat.color.split(' ')[0]}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-[var(--c-text)] truncate">
                      {exp.description || cat.label}
                    </p>
                    <div className="flex gap-1.5 mt-0.5">
                      <span className="text-[10px] text-white/20">
                        {new Date(exp.expense_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                      </span>
                      {exp.creator?.nickname && (
                        <span className="text-[10px] text-white/15">· {exp.creator.nickname}</span>
                      )}
                    </div>
                  </div>
                  <p className="text-[14px] font-bold text-red-400 tabular-nums shrink-0">{fmtCur(Number(exp.amount))}</p>
                </div>
              </SwipeableRow>
            );
          })
        )}
      </div>

      <Drawer open={showAdd} onClose={() => setShowAdd(false)} title="Новый расход">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-1.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                onClick={() => { hapticFeedback('light'); setCategory(cat.value); }}
                className={`flex items-center gap-2 p-2.5 rounded-xl border transition-all active:scale-95 ${
                  category === cat.value
                    ? 'bg-[var(--c-accent)]/10 border-[var(--c-accent)]/20'
                    : 'bg-white/3 border-white/5'
                }`}
              >
                <cat.icon className={`w-4 h-4 ${cat.color.split(' ')[0]}`} />
                <span className={`text-[12px] font-semibold ${category === cat.value ? 'text-[var(--c-accent)]' : 'text-white/50'}`}>
                  {cat.label}
                </span>
              </button>
            ))}
          </div>

          <Input
            type="number"
            label="Сумма"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min={0}
          />

          <Input
            label="Описание"
            placeholder="Например: аренда за март"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <Input
            type="date"
            label="Дата"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
          />

          <Button onClick={handleSave} loading={saving} disabled={!amount || Number(amount) <= 0} className="w-full">
            Сохранить
          </Button>
        </div>
      </Drawer>
    </div>
  );
}
