import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Drawer } from '@/components/ui/Drawer';
import { Plus, Percent, Banknote, Trash2, Edit2 } from 'lucide-react';
import { hapticFeedback, hapticNotification } from '@/lib/telegram';
import type { Discount, DiscountType } from '@/types';

export function DiscountsManager() {
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Discount | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<DiscountType>('percentage');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('discounts')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setDiscounts(data as Discount[]);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditing(null);
    setName('');
    setType('percentage');
    setValue('');
    setShowForm(true);
  };

  const openEdit = (d: Discount) => {
    setEditing(d);
    setName(d.name);
    setType(d.type);
    setValue(String(d.value));
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !value) return;
    setSaving(true);
    const payload = { name: name.trim(), type, value: Number(value) };

    if (editing) {
      await supabase.from('discounts').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('discounts').insert(payload);
    }

    hapticNotification('success');
    setSaving(false);
    setShowForm(false);
    load();
  };

  const toggleActive = async (d: Discount) => {
    hapticFeedback('light');
    await supabase.from('discounts').update({ is_active: !d.is_active }).eq('id', d.id);
    load();
  };

  const handleDelete = async (id: string) => {
    hapticFeedback('medium');
    await supabase.from('discounts').delete().eq('id', id);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--tg-theme-hint-color,#888)]">
          {discounts.length} скидок
        </p>
        <Button size="md" onClick={openNew}>
          <Plus className="w-4 h-4" />
          Добавить
        </Button>
      </div>

      {discounts.length === 0 ? (
        <div className="text-center py-12">
          <Percent className="w-10 h-10 text-white/8 mx-auto mb-3" />
          <p className="text-sm text-[var(--tg-theme-hint-color,#888)]">Нет скидок</p>
        </div>
      ) : (
        <div className="space-y-2">
          {discounts.map((d) => (
            <div
              key={d.id}
              className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all ${
                d.is_active
                  ? 'card'
                  : 'bg-white/2 border-white/3 opacity-50'
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                d.type === 'percentage' ? 'bg-violet-500/15' : 'bg-emerald-500/15'
              }`}>
                {d.type === 'percentage' ? (
                  <Percent className="w-5 h-5 text-violet-400" />
                ) : (
                  <Banknote className="w-5 h-5 text-emerald-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[13px] text-[var(--tg-theme-text-color,#e0e0e0)] truncate">
                  {d.name}
                </p>
                <Badge variant={d.type === 'percentage' ? 'default' : 'success'} size="sm">
                  {d.type === 'percentage' ? `-${d.value}%` : `-${d.value}₽`}
                </Badge>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => toggleActive(d)}
                  className={`w-10 h-6 rounded-full transition-colors relative ${
                    d.is_active ? 'bg-emerald-500' : 'bg-white/15'
                  }`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${
                    d.is_active ? 'left-5' : 'left-1'
                  }`} />
                </button>
                <button
                  onClick={() => openEdit(d)}
                  className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center active:scale-90 transition-transform"
                >
                  <Edit2 className="w-3.5 h-3.5 text-white/40" />
                </button>
                <button
                  onClick={() => handleDelete(d.id)}
                  className="w-8 h-8 rounded-lg bg-red-500/8 flex items-center justify-center active:scale-90 transition-transform"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Drawer
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? 'Редактировать скидку' : 'Новая скидка'}
        size="sm"
      >
        <div className="space-y-4">
          <Input
            label="Название"
            placeholder="Например: Резидент -10%"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <div>
            <p className="text-[10px] font-semibold text-white/25 uppercase tracking-wider mb-2">Тип скидки</p>
            <div className="grid grid-cols-2 gap-2">
              {([['percentage', 'Процент', Percent], ['fixed', 'Фиксированная', Banknote]] as const).map(([t, label, Icon]) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border transition-all active:scale-[0.97] ${
                    type === t
                      ? 'bg-[var(--tg-theme-button-color,#6c5ce7)]/15 border-[var(--tg-theme-button-color,#6c5ce7)]/30'
                      : 'bg-white/3 border-white/8'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${type === t ? 'text-[var(--tg-theme-button-color,#6c5ce7)]' : 'text-white/30'}`} />
                  <span className={`text-[13px] font-medium ${type === t ? 'text-[var(--tg-theme-text-color,#e0e0e0)]' : 'text-white/40'}`}>
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <Input
            label={type === 'percentage' ? 'Процент (%)' : 'Сумма (₽)'}
            type="number"
            placeholder={type === 'percentage' ? '10' : '100'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            min={0}
            max={type === 'percentage' ? 100 : undefined}
          />
          <Button fullWidth size="lg" onClick={handleSave} loading={saving} disabled={saving || !name.trim() || !value}>
            {editing ? 'Сохранить' : 'Создать'}
          </Button>
        </div>
      </Drawer>
    </div>
  );
}
