import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Drawer } from '@/components/ui/Drawer';
import { Plus, Percent, Banknote, Trash2, Edit2, Package, Search, Hash, User, Zap } from 'lucide-react';
import { hapticFeedback, hapticNotification } from '@/lib/telegram';
import { useOnTableChange } from '@/hooks/useRealtimeSync';
import type { Discount, DiscountType, InventoryItem, Profile, ClientDiscountRule } from '@/types';

export function DiscountsManager() {
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Discount | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<DiscountType>('percentage');
  const [value, setValue] = useState('');
  const [minQuantity, setMinQuantity] = useState('');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedItemName, setSelectedItemName] = useState('');
  const [saving, setSaving] = useState(false);

  const [showItemPicker, setShowItemPicker] = useState(false);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [itemSearch, setItemSearch] = useState('');

  // Client discount rules: client + item + discount amount, applied when item added to check
  const [clientRules, setClientRules] = useState<ClientDiscountRule[]>([]);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [ruleProfileId, setRuleProfileId] = useState<string | null>(null);
  const [ruleProfileName, setRuleProfileName] = useState('');
  const [ruleItemId, setRuleItemId] = useState<string | null>(null);
  const [ruleItemName, setRuleItemName] = useState('');
  const [ruleType, setRuleType] = useState<DiscountType>('percentage');
  const [ruleValue, setRuleValue] = useState('');
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [clients, setClients] = useState<Profile[]>([]);
  const [clientSearch, setClientSearch] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('discounts')
      .select('*, item:inventory(*)')
      .order('created_at', { ascending: false });
    if (data) {
      setDiscounts(data.map((d) => ({
        ...d,
        item: Array.isArray(d.item) ? d.item[0] : d.item,
      })) as Discount[]);
    }
  }, []);

  const discountsTables = useMemo(() => ['discounts', 'client_discount_rules'], []);
  useOnTableChange(discountsTables, () => { load(); loadClientRules(); });

  const loadClientRules = useCallback(async () => {
    const { data } = await supabase
      .from('client_discount_rules')
      .select('*, discount:discounts(*), profile:profiles!client_discount_rules_profile_id_fkey(nickname), item:inventory(name)')
      .order('created_at', { ascending: false });
    if (data) {
      setClientRules(data.map((r) => ({
        ...r,
        discount: Array.isArray(r.discount) ? r.discount[0] : r.discount,
        profile: Array.isArray(r.profile) ? r.profile[0] : r.profile,
        item: Array.isArray(r.item) ? r.item[0] : r.item,
      })) as ClientDiscountRule[]);
    }
  }, []);

  useEffect(() => { load(); loadClientRules(); }, [load, loadClientRules]);

  const loadItems = useCallback(async () => {
    const { data } = await supabase
      .from('inventory')
      .select('*')
      .eq('is_active', true)
      .order('name');
    if (data) setItems(data as InventoryItem[]);
  }, []);

  const openNew = () => {
    setEditing(null);
    setName('');
    setType('percentage');
    setValue('');
    setMinQuantity('');
    setSelectedItemId(null);
    setSelectedItemName('');
    setShowForm(true);
  };

  const openEdit = (d: Discount) => {
    setEditing(d);
    setName(d.name);
    setType(d.type);
    setValue(String(d.value));
    setMinQuantity(d.min_quantity ? String(d.min_quantity) : '');
    setSelectedItemId(d.item_id);
    setSelectedItemName(d.item?.name || '');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !value) return;
    setSaving(true);
    const payload: Record<string, unknown> = {
      name: name.trim(),
      type,
      value: Number(value),
      min_quantity: minQuantity ? Number(minQuantity) : null,
      item_id: selectedItemId || null,
    };

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

  const openItemPicker = () => {
    loadItems();
    setItemSearch('');
    setShowItemPicker(true);
  };

  const selectItem = (item: InventoryItem) => {
    setSelectedItemId(item.id);
    setSelectedItemName(item.name);
    setShowItemPicker(false);
    hapticFeedback('light');
  };

  const openRuleItemPicker = () => {
    loadItems();
    setItemSearch('');
    setShowItemPicker(true);
  };

  const clearItem = () => {
    setSelectedItemId(null);
    setSelectedItemName('');
  };

  const filteredPickerItems = items.filter((i) =>
    !itemSearch || i.name.toLowerCase().includes(itemSearch.toLowerCase())
  );

  const isQuantityDiscount = (d: Discount) => d.min_quantity != null && d.min_quantity > 0;

  const openRuleForm = () => {
    setRuleProfileId(null);
    setRuleProfileName('');
    setRuleItemId(null);
    setRuleItemName('');
    setRuleType('percentage');
    setRuleValue('');
    setShowRuleForm(true);
  };

  const saveRule = async () => {
    if (!ruleProfileId || !ruleItemId || !ruleValue) return;
    hapticFeedback('light');
    const valueNum = Number(ruleValue);
    if (isNaN(valueNum) || valueNum <= 0) return;

    const discountName = `Авто: ${ruleProfileName} на ${ruleItemName}`;
    const { data: discount, error: discErr } = await supabase
      .from('discounts')
      .insert({
        name: discountName,
        type: ruleType,
        value: valueNum,
        is_active: true,
        is_auto: true,
      })
      .select()
      .single();

    if (discErr || !discount) {
      hapticNotification('error');
      return;
    }

    await supabase.from('client_discount_rules').insert({
      discount_id: discount.id,
      profile_id: ruleProfileId,
      item_id: ruleItemId,
    });
    hapticNotification('success');
    setShowRuleForm(false);
    load();
    loadClientRules();
  };

  const deleteRule = async (rule: ClientDiscountRule) => {
    hapticFeedback('medium');
    const discountId = rule.discount_id || (rule.discount as Discount)?.id;
    await supabase.from('client_discount_rules').delete().eq('id', rule.id);
    if (discountId) {
      await supabase.from('discounts').update({ is_active: false }).eq('id', discountId);
    }
    load();
    loadClientRules();
  };

  const loadClients = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .is('deleted_at', null)
      .order('nickname');
    if (data) setClients(data as Profile[]);
  }, []);

  const openClientPicker = () => {
    loadClients();
    setClientSearch('');
    setShowClientPicker(true);
  };

  const selectClient = (p: Profile) => {
    setRuleProfileId(p.id);
    setRuleProfileName(p.nickname);
    setShowClientPicker(false);
    hapticFeedback('light');
  };

  const clearRuleClient = () => {
    setRuleProfileId(null);
    setRuleProfileName('');
  };

  const handleItemPickerSelect = (item: InventoryItem) => {
    if (showRuleForm) {
      setRuleItemId(item.id);
      setRuleItemName(item.name);
    } else {
      setSelectedItemId(item.id);
      setSelectedItemName(item.name);
    }
    setShowItemPicker(false);
    hapticFeedback('light');
  };

  const clearRuleItem = () => {
    setRuleItemId(null);
    setRuleItemName('');
  };

  const filteredClients = clients.filter((c) =>
    !clientSearch || c.nickname.toLowerCase().includes(clientSearch.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--c-hint)]">
          {discounts.filter((d) => !d.is_auto).length} скидок
        </p>
        <Button size="md" onClick={openNew}>
          <Plus className="w-4 h-4" />
          Добавить
        </Button>
      </div>

      {(discounts.filter((d) => !d.is_auto)).length === 0 ? (
        <div className="text-center py-12">
          <Percent className="w-10 h-10 text-[var(--c-muted)] mx-auto mb-3" />
          <p className="text-sm text-[var(--c-hint)]">Нет скидок</p>
        </div>
      ) : (
        <div className="space-y-2">
          {discounts.filter((d) => !d.is_auto).map((d) => (
            <div
              key={d.id}
              className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all ${d.is_active ? 'card' : 'bg-white/2 border-[var(--c-border)] opacity-50'
                }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isQuantityDiscount(d) ? 'bg-[var(--c-warning-bg)]' :
                  d.type === 'percentage' ? 'bg-[rgba(var(--c-accent-rgb),0.1)]' : 'bg-[var(--c-success-bg)]'
                }`}>
                {isQuantityDiscount(d) ? (
                  <Hash className="w-5 h-5 text-[var(--c-warning)]" />
                ) : d.type === 'percentage' ? (
                  <Percent className="w-5 h-5 text-[var(--c-accent)]" />
                ) : (
                  <Banknote className="w-5 h-5 text-[var(--c-success)]" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[13px] text-[var(--c-text)] truncate">
                  {d.name}
                </p>
                <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                  <Badge variant={d.type === 'percentage' ? 'default' : 'success'} size="sm">
                    {d.type === 'percentage' ? `-${d.value}%` : `-${d.value}₽`}
                  </Badge>
                  {isQuantityDiscount(d) && (
                    <Badge variant="accent" size="sm">
                      от {d.min_quantity} шт
                    </Badge>
                  )}
                  {d.item && (
                    <span className="text-[10px] text-[var(--c-hint)] truncate max-w-[120px]">{d.item.name}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => toggleActive(d)}
                  className={`w-10 h-6 rounded-full transition-colors relative ${d.is_active ? 'bg-emerald-500' : 'bg-[var(--c-surface-hover)]'
                    }`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${d.is_active ? 'left-5' : 'left-1'
                    }`} />
                </button>
                <button
                  onClick={() => openEdit(d)}
                  className="w-8 h-8 rounded-lg bg-[var(--c-surface)] flex items-center justify-center active:scale-90 transition-transform"
                >
                  <Edit2 className="w-3.5 h-3.5 text-[var(--c-hint)]" />
                </button>
                <button
                  onClick={() => handleDelete(d.id)}
                  className="w-8 h-8 rounded-lg bg-[var(--c-danger-bg)] flex items-center justify-center active:scale-90 transition-transform"
                >
                  <Trash2 className="w-3.5 h-3.5 text-[var(--c-danger)]" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Client discount rules — auto-apply for specific clients on specific items */}
      <div className="mt-6 pt-6 border-t border-[var(--c-border)]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            <p className="text-sm font-semibold text-[var(--c-text)]">Авто-скидки для клиентов</p>
          </div>
          <Button size="sm" variant="ghost" onClick={openRuleForm}>
            <Plus className="w-3.5 h-3.5" />
            Добавить правило
          </Button>
        </div>
        <p className="text-[11px] text-[var(--c-hint)] mb-3">
          При добавлении позиции в чек указанному клиенту автоматически применяется скидка
        </p>
        {clientRules.length === 0 ? (
          <div className="text-center py-6 rounded-xl bg-white/[0.02] border border-dashed border-[var(--c-border)]">
            <User className="w-8 h-8 text-[var(--c-muted)] mx-auto mb-2" />
            <p className="text-xs text-[var(--c-hint)]">Нет правил</p>
          </div>
        ) : (
          <div className="space-y-2">
            {clientRules.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 p-2.5 rounded-xl border border-[var(--c-border)] bg-white/[0.02]"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[var(--c-text)] truncate">
                    {(r.profile as { nickname?: string })?.nickname || '?'} → {(r.item as { name?: string })?.name || '?'}
                  </p>
                  <p className="text-[11px] text-[var(--c-hint)]">
                    {(r.discount as Discount)?.name || '?'} ({(r.discount as Discount)?.type === 'percentage' ? `-${(r.discount as Discount)?.value}%` : `-${(r.discount as Discount)?.value}₽`})
                  </p>
                </div>
                <button
                  onClick={() => deleteRule(r)}
                  className="w-8 h-8 rounded-lg bg-[var(--c-danger-bg)] flex items-center justify-center active:scale-90 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5 text-[var(--c-danger)]" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit form */}
      <Drawer
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editing ? 'Редактировать скидку' : 'Новая скидка'}
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="Название"
            placeholder="Например: 2 кальяна -10%"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />

          <div>
            <p className="text-[10px] font-semibold text-[var(--c-muted)] uppercase tracking-wider mb-2">Тип скидки</p>
            <div className="grid grid-cols-2 gap-2">
              {([['percentage', 'Процент', Percent], ['fixed', 'Фиксированная', Banknote]] as const).map(([t, label, Icon]) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border transition-all active:scale-[0.97] ${type === t
                      ? 'bg-[var(--c-accent)]/15 border-[var(--c-accent)]/30'
                      : 'bg-[var(--c-surface)] border-[var(--c-border)]'
                    }`}
                >
                  <Icon className={`w-4 h-4 ${type === t ? 'text-[var(--c-accent)]' : 'text-[var(--c-hint)]'}`} />
                  <span className={`text-[13px] font-medium ${type === t ? 'text-[var(--c-text)]' : 'text-[var(--c-hint)]'}`}>
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

          {/* Quantity-based section */}
          <div className="p-3 rounded-xl bg-[var(--c-warning-bg)] border border-[var(--c-warning-border)] space-y-3">
            <p className="text-[11px] font-semibold text-[var(--c-warning)]">Скидка по количеству (необязательно)</p>

            <Input
              label="Мин. количество в чеке"
              type="number"
              placeholder="Например: 2"
              value={minQuantity}
              onChange={(e) => setMinQuantity(e.target.value)}
              min={1}
              compact
            />

            <div>
              <p className="text-xs font-medium text-[var(--c-hint)] mb-1.5">Применить к товару</p>
              {selectedItemId ? (
                <div className="flex items-center gap-2 p-2 rounded-xl card">
                  <Package className="w-4 h-4 text-[var(--c-warning)] shrink-0" />
                  <span className="text-[13px] text-[var(--c-text)] truncate flex-1 min-w-0">{selectedItemName}</span>
                  <button onClick={clearItem} className="w-6 h-6 rounded-lg bg-[var(--c-surface)] flex items-center justify-center active:scale-90 shrink-0">
                    <Trash2 className="w-3 h-3 text-[var(--c-hint)]" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={openItemPicker}
                  className="w-full flex items-center gap-2 p-2.5 rounded-xl border border-dashed border-[var(--c-border)] text-[var(--c-hint)] hover:text-[var(--c-hint)] hover:border-white/20 transition-all active:scale-[0.98]"
                >
                  <Search className="w-4 h-4" />
                  <span className="text-xs">Выбрать товар...</span>
                </button>
              )}
              <p className="text-[10px] text-[var(--c-muted)] mt-1">
                Если не выбран — скидка на любые {minQuantity || 'N'} одинаковых позиций
              </p>
            </div>
          </div>

          <Button fullWidth size="lg" onClick={handleSave} loading={saving} disabled={saving || !name.trim() || !value}>
            {editing ? 'Сохранить' : 'Создать'}
          </Button>
        </div>
      </Drawer>

      {/* Item picker */}
      <Drawer
        open={showItemPicker}
        onClose={() => setShowItemPicker(false)}
        title="Выберите товар"
        size="md"
      >
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--c-muted)]" />
            <input
              placeholder="Поиск..."
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-[var(--c-surface)] border border-[var(--c-surface-hover)] text-sm text-[var(--c-text)] placeholder:text-[var(--c-muted)] focus:outline-none focus:border-[var(--c-accent)]/25 transition-colors"
              autoFocus
            />
          </div>
          <div className="space-y-1 max-h-[50vh] overflow-y-auto">
            {filteredPickerItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleItemPickerSelect(item)}
                className="w-full flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-[var(--c-surface-hover)] transition-colors active:scale-[0.98]"
              >
                <div className="w-8 h-8 rounded-lg bg-[var(--c-surface)] flex items-center justify-center shrink-0 overflow-hidden">
                  {item.image_url ? (
                    <img src={item.image_url} className="w-full h-full object-cover" />
                  ) : (
                    <Package className="w-4 h-4 text-[var(--c-hint)]" />
                  )}
                </div>
                <div className="text-left flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[var(--c-text)] truncate">{item.name}</p>
                  <p className="text-[11px] text-[var(--c-hint)] tabular-nums">{item.price}₽</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </Drawer>

      {/* Rule form: client, item, discount amount */}
      <Drawer
        open={showRuleForm}
        onClose={() => setShowRuleForm(false)}
        title="Авто-скидка для клиента"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <p className="text-[10px] font-semibold text-[var(--c-muted)] uppercase tracking-wider mb-2">Клиент</p>
            {ruleProfileId ? (
              <div className="flex items-center gap-2 p-2 rounded-xl card">
                <User className="w-4 h-4 text-[var(--c-accent)] shrink-0" />
                <span className="text-[13px] text-[var(--c-text)] truncate flex-1 min-w-0">{ruleProfileName}</span>
                <button onClick={clearRuleClient} className="w-6 h-6 rounded-lg bg-[var(--c-surface)] flex items-center justify-center active:scale-90 shrink-0">
                  <Trash2 className="w-3 h-3 text-[var(--c-hint)]" />
                </button>
              </div>
            ) : (
              <button
                onClick={openClientPicker}
                className="w-full flex items-center gap-2 p-2.5 rounded-xl border border-dashed border-[var(--c-border)] text-[var(--c-hint)] hover:text-[var(--c-hint)] hover:border-white/20 transition-all active:scale-[0.98]"
              >
                <Search className="w-4 h-4" />
                <span className="text-xs">Выбрать клиента...</span>
              </button>
            )}
          </div>

          <div>
            <p className="text-[10px] font-semibold text-[var(--c-muted)] uppercase tracking-wider mb-2">Товар</p>
            {ruleItemId ? (
              <div className="flex items-center gap-2 p-2 rounded-xl card">
                <Package className="w-4 h-4 text-[var(--c-warning)] shrink-0" />
                <span className="text-[13px] text-[var(--c-text)] truncate flex-1 min-w-0">{ruleItemName}</span>
                <button onClick={clearRuleItem} className="w-6 h-6 rounded-lg bg-[var(--c-surface)] flex items-center justify-center active:scale-90 shrink-0">
                  <Trash2 className="w-3 h-3 text-[var(--c-hint)]" />
                </button>
              </div>
            ) : (
              <button
                onClick={openRuleItemPicker}
                className="w-full flex items-center gap-2 p-2.5 rounded-xl border border-dashed border-[var(--c-border)] text-[var(--c-hint)] hover:text-[var(--c-hint)] hover:border-white/20 transition-all active:scale-[0.98]"
              >
                <Search className="w-4 h-4" />
                <span className="text-xs">Выбрать товар...</span>
              </button>
            )}
          </div>

          <div>
            <p className="text-[10px] font-semibold text-[var(--c-muted)] uppercase tracking-wider mb-2">Сумма скидки</p>
            <div className="grid grid-cols-2 gap-2 mb-2">
              {([['percentage', 'Процент', Percent], ['fixed', 'Фиксированная', Banknote]] as const).map(([t, label, Icon]) => (
                <button
                  key={t}
                  onClick={() => setRuleType(t)}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border transition-all active:scale-[0.97] ${ruleType === t
                    ? 'bg-[var(--c-accent)]/15 border-[var(--c-accent)]/30'
                    : 'bg-[var(--c-surface)] border-[var(--c-border)]'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${ruleType === t ? 'text-[var(--c-accent)]' : 'text-[var(--c-hint)]'}`} />
                  <span className={`text-[13px] font-medium ${ruleType === t ? 'text-[var(--c-text)]' : 'text-[var(--c-hint)]'}`}>
                    {label}
                  </span>
                </button>
              ))}
            </div>
            <Input
              type="number"
              placeholder={ruleType === 'percentage' ? '10' : '100'}
              value={ruleValue}
              onChange={(e) => setRuleValue(e.target.value)}
              min={0}
              max={ruleType === 'percentage' ? 100 : undefined}
              compact
            />
          </div>

          <Button fullWidth size="lg" onClick={saveRule} disabled={!ruleProfileId || !ruleItemId || !ruleValue}>
            Добавить правило
          </Button>
        </div>
      </Drawer>

      {/* Client picker for rules */}
      <Drawer
        open={showClientPicker}
        onClose={() => setShowClientPicker(false)}
        title="Выберите клиента"
        size="md"
      >
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--c-muted)]" />
            <input
              placeholder="Поиск по нику..."
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-[var(--c-surface)] border border-[var(--c-surface-hover)] text-sm text-[var(--c-text)] placeholder:text-[var(--c-muted)] focus:outline-none focus:border-[var(--c-accent)]/25 transition-colors"
              autoFocus
            />
          </div>
          <div className="space-y-1 max-h-[50vh] overflow-y-auto">
            {filteredClients.map((p) => (
              <button
                key={p.id}
                onClick={() => selectClient(p)}
                className="w-full flex items-center gap-2.5 p-2.5 rounded-xl hover:bg-[var(--c-surface-hover)] transition-colors active:scale-[0.98]"
              >
                <div className="w-8 h-8 rounded-lg bg-[var(--c-surface)] flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-[var(--c-hint)]" />
                </div>
                <div className="text-left flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[var(--c-text)] truncate">{p.nickname}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </Drawer>
    </div>
  );
}
