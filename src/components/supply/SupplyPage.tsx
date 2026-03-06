import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Drawer } from '@/components/ui/Drawer';
import {
  Plus, Truck, ArrowLeft, Trash2, Search, Package,
  Pencil, CalendarDays, User, ChevronRight, AlertTriangle,
} from 'lucide-react';
import { hapticFeedback, hapticNotification } from '@/lib/telegram';
import { useOnTableChange } from '@/hooks/useRealtimeSync';
import { useSwipeBack } from '@/hooks/useSwipeBack';
import type { Supply, SupplyItem, InventoryItem } from '@/types';

interface DraftItem {
  item: InventoryItem;
  quantity: string;
  costPerUnit: string;
  totalCost: string;
  lastEdited: 'unit' | 'total' | null;
}

const categoryLabels: Record<string, string> = {
  drinks: 'Напитки', food: 'Еда', bar: 'Снеки', hookah: 'Кальяны', services: 'Услуги',
};

export function SupplyPage() {
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Full-screen create mode
  const [isCreating, setIsCreating] = useState(false);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
  const [draftNote, setDraftNote] = useState('');
  const [showAddItem, setShowAddItem] = useState(false);
  const [itemSearch, setItemSearch] = useState('');
  const [showExitWarning, setShowExitWarning] = useState(false);

  // Detail drawer
  const [selectedSupply, setSelectedSupply] = useState<Supply | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [detailItems, setDetailItems] = useState<SupplyItem[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editItems, setEditItems] = useState<DraftItem[]>([]);

  const user = useAuthStore((s) => s.user);

  const loadSupplies = useCallback(async () => {
    const { data } = await supabase
      .from('supplies')
      .select('*, creator:profiles!supplies_created_by_fkey(nickname)')
      .order('created_at', { ascending: false });
    if (data) {
      setSupplies(data.map((s) => ({
        ...s,
        creator: Array.isArray(s.creator) ? s.creator[0] : s.creator,
      })) as Supply[]);
    }
  }, []);

  const loadInventory = useCallback(async () => {
    const { data } = await supabase
      .from('inventory')
      .select('*')
      .eq('is_active', true)
      .order('name');
    if (data) setInventory(data as InventoryItem[]);
  }, []);

  const suppliesTables = useMemo(() => ['supplies'], []);
  useOnTableChange(suppliesTables, loadSupplies);

  useEffect(() => {
    Promise.all([loadSupplies(), loadInventory()]).then(() => setIsLoading(false));
  }, [loadSupplies, loadInventory]);

  // --- DRAFT HELPERS ---

  const hasDraftChanges = draftItems.length > 0 || draftNote.trim().length > 0;

  const handleTryExit = () => {
    if (hasDraftChanges) {
      setShowExitWarning(true);
    } else {
      setIsCreating(false);
    }
  };

  const confirmExit = () => {
    setShowExitWarning(false);
    setIsCreating(false);
    setDraftItems([]);
    setDraftNote('');
  };

  const { swipeIndicatorStyle: createIndicator, overlayStyle: createOverlay } = useSwipeBack({
    onBack: handleTryExit,
    enabled: isCreating,
  });

  const updateDraftItem = (idx: number, field: keyof DraftItem, value: string) => {
    setDraftItems((prev) => {
      const items = [...prev];
      const item = { ...items[idx] };

      if (field === 'quantity') {
        item.quantity = value;
        const qty = Number(value);
        if (qty > 0) {
          if (item.lastEdited === 'unit' && item.costPerUnit) {
            item.totalCost = String(Math.round(Number(item.costPerUnit) * qty * 100) / 100);
          } else if (item.lastEdited === 'total' && item.totalCost) {
            item.costPerUnit = String(Math.round(Number(item.totalCost) / qty * 100) / 100);
          }
        }
      } else if (field === 'costPerUnit') {
        item.costPerUnit = value;
        item.lastEdited = 'unit';
        const qty = Number(item.quantity);
        if (Number(value) >= 0 && qty > 0) {
          item.totalCost = String(Math.round(Number(value) * qty * 100) / 100);
        }
      } else if (field === 'totalCost') {
        item.totalCost = value;
        item.lastEdited = 'total';
        const qty = Number(item.quantity);
        if (Number(value) >= 0 && qty > 0) {
          item.costPerUnit = String(Math.round(Number(value) / qty * 100) / 100);
        }
      }

      items[idx] = item;
      return items;
    });
  };

  const removeDraftItem = (idx: number) => {
    setDraftItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const addInventoryItem = (inv: InventoryItem) => {
    hapticFeedback('light');
    if (draftItems.find((d) => d.item.id === inv.id)) return;
    setDraftItems((prev) => [...prev, {
      item: inv, quantity: '1', costPerUnit: '', totalCost: '', lastEdited: null,
    }]);
    setShowAddItem(false);
    setItemSearch('');
  };

  const draftTotal = draftItems.reduce((s, d) => s + (Number(d.totalCost) || 0), 0);

  // --- CREATE SUPPLY ---

  const handleCreate = async () => {
    if (draftItems.length === 0) return;

    const { data: supply, error } = await supabase
      .from('supplies')
      .insert({ note: draftNote || null, total_cost: draftTotal, created_by: user?.id })
      .select()
      .single();

    if (error || !supply) return;

    const rows = draftItems.map((d) => ({
      supply_id: supply.id,
      item_id: d.item.id,
      quantity: Number(d.quantity),
      cost_per_unit: Number(d.costPerUnit) || 0,
      total_cost: Number(d.totalCost) || 0,
    }));
    await supabase.from('supply_items').insert(rows);

    for (const d of draftItems) {
      const qty = Number(d.quantity);
      if (qty > 0) {
        const { data: fresh } = await supabase
          .from('inventory')
          .select('stock_quantity')
          .eq('id', d.item.id)
          .single();
        if (fresh) {
          await supabase
            .from('inventory')
            .update({ stock_quantity: fresh.stock_quantity + qty })
            .eq('id', d.item.id);
        }
      }
    }

    await supabase.from('transactions').insert({
      type: 'supply',
      amount: draftTotal,
      description: `Поставка #${supply.id.slice(0, 8)}: ${draftItems.length} поз. на ${draftTotal}₽`,
      created_by: user?.id,
    });

    hapticNotification('success');
    setIsCreating(false);
    setDraftItems([]);
    setDraftNote('');
    loadSupplies();
    loadInventory();
  };

  // --- DETAIL / EDIT / DELETE ---

  const [priceChanges, setPriceChanges] = useState<Record<string, { prev: number; delta: number }>>({});

  const openDetail = async (supply: Supply) => {
    setSelectedSupply(supply);
    setShowDetail(true);
    setIsEditing(false);
    setPriceChanges({});
    const { data } = await supabase
      .from('supply_items')
      .select('*, item:inventory(*)')
      .eq('supply_id', supply.id);
    const items = (data || []).map((si) => ({
      ...si,
      item: Array.isArray(si.item) ? si.item[0] : si.item,
    })) as SupplyItem[];
    setDetailItems(items);

    const changes: Record<string, { prev: number; delta: number }> = {};
    for (const si of items) {
      const { data: prevItems } = await supabase
        .from('supply_items')
        .select('cost_per_unit, supply:supplies!inner(created_at)')
        .eq('item_id', si.item_id)
        .neq('supply_id', supply.id)
        .order('supply(created_at)', { ascending: false })
        .limit(1);
      if (prevItems && prevItems.length > 0) {
        const prevCost = prevItems[0].cost_per_unit;
        if (prevCost !== si.cost_per_unit) {
          changes[si.item_id] = { prev: prevCost, delta: si.cost_per_unit - prevCost };
        }
      }
    }
    setPriceChanges(changes);
  };

  const startEdit = () => {
    setIsEditing(true);
    setEditItems(detailItems.map((si) => ({
      item: si.item!,
      quantity: String(si.quantity),
      costPerUnit: String(si.cost_per_unit),
      totalCost: String(si.total_cost),
      lastEdited: null,
    })));
  };

  const updateEditItem = (idx: number, field: keyof DraftItem, value: string) => {
    setEditItems((prev) => {
      const items = [...prev];
      const item = { ...items[idx] };
      if (field === 'quantity') {
        item.quantity = value;
        const qty = Number(value);
        if (qty > 0 && item.costPerUnit) {
          item.totalCost = String(Math.round(Number(item.costPerUnit) * qty * 100) / 100);
        }
      } else if (field === 'costPerUnit') {
        item.costPerUnit = value;
        const qty = Number(item.quantity);
        if (Number(value) >= 0 && qty > 0) {
          item.totalCost = String(Math.round(Number(value) * qty * 100) / 100);
        }
      } else if (field === 'totalCost') {
        item.totalCost = value;
        const qty = Number(item.quantity);
        if (Number(value) >= 0 && qty > 0) {
          item.costPerUnit = String(Math.round(Number(value) / qty * 100) / 100);
        }
      }
      items[idx] = item;
      return items;
    });
  };

  const handleSaveEdit = async () => {
    if (!selectedSupply) return;
    for (const si of detailItems) {
      const { data: fresh } = await supabase.from('inventory').select('stock_quantity').eq('id', si.item_id).single();
      if (fresh) await supabase.from('inventory').update({ stock_quantity: Math.max(0, fresh.stock_quantity - si.quantity) }).eq('id', si.item_id);
    }
    await supabase.from('supply_items').delete().eq('supply_id', selectedSupply.id);
    const newTotal = editItems.reduce((s, d) => s + (Number(d.totalCost) || 0), 0);
    const rows = editItems.map((d) => ({
      supply_id: selectedSupply.id, item_id: d.item.id,
      quantity: Number(d.quantity), cost_per_unit: Number(d.costPerUnit) || 0, total_cost: Number(d.totalCost) || 0,
    }));
    if (rows.length > 0) await supabase.from('supply_items').insert(rows);
    await supabase.from('supplies').update({ total_cost: newTotal }).eq('id', selectedSupply.id);
    for (const d of editItems) {
      const qty = Number(d.quantity);
      if (qty > 0) {
        const { data: fresh } = await supabase.from('inventory').select('stock_quantity').eq('id', d.item.id).single();
        if (fresh) await supabase.from('inventory').update({ stock_quantity: fresh.stock_quantity + qty }).eq('id', d.item.id);
      }
    }
    hapticNotification('success');
    setShowDetail(false);
    loadSupplies();
    loadInventory();
  };

  const handleDelete = async () => {
    if (!selectedSupply) return;
    for (const si of detailItems) {
      const { data: fresh } = await supabase.from('inventory').select('stock_quantity').eq('id', si.item_id).single();
      if (fresh) await supabase.from('inventory').update({ stock_quantity: Math.max(0, fresh.stock_quantity - si.quantity) }).eq('id', si.item_id);
    }
    await supabase.from('supplies').delete().eq('id', selectedSupply.id);
    hapticNotification('warning');
    setShowDetail(false);
    loadSupplies();
    loadInventory();
  };

  // --- RENDERING HELPERS ---

  const filteredInv = itemSearch
    ? inventory.filter((i) => i.name.toLowerCase().includes(itemSearch.toLowerCase()))
    : inventory;
  const alreadyAddedIds = new Set(draftItems.map((d) => d.item.id));

  const formatDate = (d: string) => new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  const formatTime = (d: string) => new Date(d).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const fmtCur = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + '₽';

  if (isLoading) {
    return (
      <div className="text-center py-20">
        <div className="w-8 h-8 border-2 border-[var(--c-accent)] border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  // ==================
  // FULL-SCREEN CREATE
  // ==================
  if (isCreating) {
    return (
      <div className="space-y-4">
        {createIndicator && <div style={createIndicator} />}
        {createOverlay && <div style={createOverlay} />}
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleTryExit}
            className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors active:scale-95 shrink-0"
          >
            <ArrowLeft className="w-5 h-5 text-[var(--c-text)]" />
          </button>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-[var(--c-text)]">Новая поставка</h2>
            {draftItems.length > 0 && (
              <p className="text-xs text-[var(--c-hint)]">{draftItems.length} поз. · {fmtCur(draftTotal)}</p>
            )}
          </div>
        </div>

        <Input
          label="Примечание"
          placeholder="Комментарий к поставке (необязательно)"
          value={draftNote}
          onChange={(e) => setDraftNote(e.target.value)}
        />

        {/* Draft items */}
        {draftItems.length > 0 && (
          <div className="space-y-3">
            {draftItems.map((d, idx) => (
              <div key={d.item.id} className="p-3 rounded-xl bg-white/5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[var(--c-text)] truncate">{d.item.name}</p>
                    <p className="text-[10px] text-white/30">Остаток: {d.item.stock_quantity} · Цена: {d.item.price}₽</p>
                  </div>
                  <button onClick={() => removeDraftItem(idx)} className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center active:scale-90">
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Input type="number" placeholder="Кол-во" min={1} value={d.quantity} onChange={(e) => updateDraftItem(idx, 'quantity', e.target.value)} />
                  <Input type="number" placeholder="За шт." min={0} step="0.01" value={d.costPerUnit} onChange={(e) => updateDraftItem(idx, 'costPerUnit', e.target.value)} />
                  <Input type="number" placeholder="Итого" min={0} step="0.01" value={d.totalCost} onChange={(e) => updateDraftItem(idx, 'totalCost', e.target.value)} />
                </div>
                {Number(d.totalCost) > 0 && d.item.price > 0 && Number(d.costPerUnit) > 0 && (
                  <div className="flex gap-3 text-[10px] text-white/30">
                    <span>Наценка: <span className="text-amber-400 font-semibold">{Math.round(((d.item.price - Number(d.costPerUnit)) / Number(d.costPerUnit)) * 100)}%</span></span>
                    <span>Сумма: <span className="text-emerald-400 font-semibold">{Number(d.totalCost).toFixed(0)}₽</span></span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => setShowAddItem(true)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-white/10 text-[var(--c-hint)] hover:border-white/20 hover:text-white/60 transition-all active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          <span className="text-sm font-medium">Добавить товар</span>
        </button>

        {draftItems.length > 0 && (
          <div className="p-3 rounded-xl bg-[var(--c-accent)]/10 border border-[var(--c-accent)]/20">
            <div className="flex justify-between text-sm">
              <span className="text-white/50">Позиций: {draftItems.length}</span>
              <span className="font-bold text-[var(--c-text)]">Итого: {fmtCur(draftTotal)}</span>
            </div>
          </div>
        )}

        <Button
          fullWidth size="lg"
          onClick={handleCreate}
          disabled={draftItems.length === 0 || draftItems.some((d) => !d.quantity || Number(d.quantity) <= 0)}
        >
          <Truck className="w-5 h-5" />
          Оформить поставку
        </Button>

        {/* Add item drawer */}
        <Drawer open={showAddItem} onClose={() => { setShowAddItem(false); setItemSearch(''); }} title="Добавить товар">
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <Input placeholder="Поиск..." value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} className="pl-10" autoFocus />
            </div>
            <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
              {filteredInv.filter((i) => !alreadyAddedIds.has(i.id)).map((item) => (
                <button key={item.id} onClick={() => addInventoryItem(item)} className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-all active:scale-[0.98]">
                  <Package className="w-4 h-4 text-white/30 shrink-0" />
                  <div className="text-left flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--c-text)] truncate">{item.name}</p>
                    <p className="text-[10px] text-white/30">{categoryLabels[item.category] || item.category} · {item.price}₽</p>
                  </div>
                  <Badge>Ост: {item.stock_quantity}</Badge>
                </button>
              ))}
            </div>
          </div>
        </Drawer>

        {/* Exit warning drawer */}
        <Drawer open={showExitWarning} onClose={() => setShowExitWarning(false)} title="Выйти из поставки?">
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-400">Поставка не сохранена</p>
                <p className="text-xs text-white/40 mt-1">
                  {draftItems.length > 0 ? `${draftItems.length} позиций на ${fmtCur(draftTotal)} будут потеряны` : 'Данные будут потеряны'}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button fullWidth variant="secondary" onClick={() => setShowExitWarning(false)}>
                Остаться
              </Button>
              <Button fullWidth variant="danger" onClick={confirmExit}>
                Выйти
              </Button>
            </div>
          </div>
        </Drawer>
      </div>
    );
  }

  const detailTotalQty = detailItems.reduce((s, si) => s + si.quantity, 0);

  // ==================
  // SUPPLY LIST
  // ==================
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--c-hint)]">{supplies.length} документов</p>
        <Button size="lg" onClick={() => setIsCreating(true)}>
          <Plus className="w-5 h-5" />
          Новая
        </Button>
      </div>

      {supplies.length === 0 ? (
        <div className="text-center py-16">
          <Truck className="w-16 h-16 text-white/5 mx-auto mb-4" />
          <p className="text-[var(--c-hint)]">Нет поставок</p>
        </div>
      ) : (
        <div className="space-y-2">
          {supplies.map((s) => (
            <button
              key={s.id}
              onClick={() => openDetail(s)}
              className="w-full text-left p-4 rounded-2xl bg-white/5 hover:bg-white/8 border border-white/5 transition-all active:scale-[0.98]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0">
                    <Truck className="w-5 h-5 text-blue-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-[var(--c-text)]">{formatDate(s.created_at)}</span>
                      <span className="text-xs text-[var(--c-hint)]">{formatTime(s.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {s.note && <span className="text-xs text-white/40 truncate">{s.note}</span>}
                      {s.creator && <span className="text-xs text-white/30">{s.creator.nickname}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-base font-bold text-[var(--c-accent)]">{fmtCur(s.total_cost)}</span>
                  <ChevronRight className="w-4 h-4 text-white/20" />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* SUPPLY DETAIL DRAWER */}
      <Drawer
        open={showDetail}
        onClose={() => { setShowDetail(false); setIsEditing(false); }}
        title={selectedSupply ? `Поставка · ${formatDate(selectedSupply.created_at)}` : 'Поставка'}
      >
        {selectedSupply && !isEditing && (
          <div className="space-y-4">
            {/* Meta */}
            <div className="p-3 rounded-xl bg-white/5 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/50 flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" /> Дата</span>
                <span className="text-[var(--c-text)]">{new Date(selectedSupply.created_at).toLocaleString('ru-RU')}</span>
              </div>
              {selectedSupply.creator && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/50 flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> Кто принял</span>
                  <span className="text-[var(--c-text)]">{selectedSupply.creator.nickname}</span>
                </div>
              )}
              {selectedSupply.note && (
                <div className="text-sm">
                  <span className="text-white/50">Примечание:</span>
                  <span className="text-[var(--c-text)] ml-2">{selectedSupply.note}</span>
                </div>
              )}
            </div>

            {/* Totals */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-xl bg-[var(--c-accent)]/10 border border-[var(--c-accent)]/15 text-center">
                <p className="text-xl font-bold text-[var(--c-accent)]">{fmtCur(selectedSupply.total_cost)}</p>
                <p className="text-[10px] text-white/40">Общая сумма</p>
              </div>
              <div className="p-3 rounded-xl bg-white/5 text-center">
                <p className="text-xl font-bold text-[var(--c-text)]">{detailTotalQty}</p>
                <p className="text-[10px] text-white/40">Единиц товара</p>
              </div>
            </div>

            {/* Items */}
            <div>
              <p className="text-xs font-semibold text-white/50 mb-2">{detailItems.length} позиций</p>
              <div className="space-y-1.5">
                {detailItems.map((si) => {
                  const pc = priceChanges[si.item_id];
                  return (
                  <div key={si.id} className={`p-3 rounded-xl ${pc ? (pc.delta > 0 ? 'bg-red-500/5 border border-red-500/10' : 'bg-emerald-500/5 border border-emerald-500/10') : 'bg-white/5'}`}>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-[var(--c-text)] truncate flex-1 min-w-0">{si.item?.name}</p>
                      <span className="font-bold text-sm text-[var(--c-text)] shrink-0 ml-2">{fmtCur(si.total_cost)}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-white/30">
                      <span>{si.quantity} шт</span>
                      <span>×</span>
                      <span>{si.cost_per_unit}₽/шт</span>
                      {pc && (
                        <span className={`font-semibold ${pc.delta > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                          {pc.delta > 0 ? '↑' : '↓'} {Math.abs(Math.round(pc.delta))}₽ (было {pc.prev}₽)
                        </span>
                      )}
                      {!pc && si.item && si.item.price > 0 && si.cost_per_unit > 0 && (
                        <span className="text-amber-400/70 ml-auto">наценка {Math.round(((si.item.price - si.cost_per_unit) / si.cost_per_unit) * 100)}%</span>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2">
              <Button fullWidth variant="secondary" onClick={startEdit}>
                <Pencil className="w-4 h-4" />
                Редактировать
              </Button>
              <Button variant="danger" onClick={handleDelete}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {selectedSupply && isEditing && (
          <div className="space-y-4">
            <div className="space-y-3">
              {editItems.map((d, idx) => (
                <div key={d.item.id} className="p-3 rounded-xl bg-white/5 space-y-2">
                  <p className="text-sm font-semibold text-[var(--c-text)] truncate">{d.item.name}</p>
                  <div className="grid grid-cols-3 gap-2">
                    <Input type="number" placeholder="Кол-во" min={1} value={d.quantity} onChange={(e) => updateEditItem(idx, 'quantity', e.target.value)} />
                    <Input type="number" placeholder="За шт." min={0} step="0.01" value={d.costPerUnit} onChange={(e) => updateEditItem(idx, 'costPerUnit', e.target.value)} />
                    <Input type="number" placeholder="Итого" min={0} step="0.01" value={d.totalCost} onChange={(e) => updateEditItem(idx, 'totalCost', e.target.value)} />
                  </div>
                </div>
              ))}
            </div>
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <div className="flex justify-between text-sm">
                <span className="text-white/50">Итого</span>
                <span className="font-bold text-emerald-400">{fmtCur(editItems.reduce((s, d) => s + (Number(d.totalCost) || 0), 0))}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button fullWidth variant="secondary" onClick={() => setIsEditing(false)}>
                <ArrowLeft className="w-4 h-4" />
                Отмена
              </Button>
              <Button fullWidth onClick={handleSaveEdit}>
                Сохранить
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
