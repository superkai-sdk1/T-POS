import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Drawer } from '@/components/ui/Drawer';
import {
  Plus, ClipboardList, ArrowLeft, ChevronRight, AlertTriangle,
  CalendarDays, User, TrendingDown, TrendingUp, Search,
} from 'lucide-react';
import { hapticFeedback, hapticNotification } from '@/lib/telegram';
import { useOnTableChange } from '@/hooks/useRealtimeSync';
import type { InventoryItem } from '@/types';

interface Revision {
  id: string;
  note: string | null;
  total_diff: number;
  items_count: number;
  created_by: string | null;
  created_at: string;
  creator?: { nickname: string };
}

interface RevisionItem {
  id: string;
  revision_id: string;
  item_id: string;
  expected_qty: number;
  actual_qty: number;
  diff: number;
  item?: InventoryItem;
}

interface RevisionSummary {
  shortageCount: number;
  surplusCount: number;
  shortageUnits: number;
  surplusUnits: number;
  shortageCost: number;
  surplusCost: number;
}

function computeSummary(changes: { diff: number; price: number }[]): RevisionSummary {
  let shortageCount = 0, surplusCount = 0, shortageUnits = 0, surplusUnits = 0, shortageCost = 0, surplusCost = 0;
  for (const c of changes) {
    if (c.diff < 0) {
      shortageCount++;
      shortageUnits += Math.abs(c.diff);
      shortageCost += Math.abs(c.diff) * c.price;
    } else if (c.diff > 0) {
      surplusCount++;
      surplusUnits += c.diff;
      surplusCost += c.diff * c.price;
    }
  }
  return { shortageCount, surplusCount, shortageUnits, surplusUnits, shortageCost, surplusCost };
}

const fmtCur = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + '₽';

export function RevisionPage() {
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isCreating, setIsCreating] = useState(false);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [revisionData, setRevisionData] = useState<Record<string, string>>({});
  const [revisionNote, setRevisionNote] = useState('');
  const [showExitWarning, setShowExitWarning] = useState(false);
  const [createSearch, setCreateSearch] = useState('');

  const [selectedRevision, setSelectedRevision] = useState<Revision | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [detailItems, setDetailItems] = useState<RevisionItem[]>([]);

  const user = useAuthStore((s) => s.user);

  const loadRevisions = useCallback(async () => {
    const { data } = await supabase
      .from('revisions')
      .select('*, creator:profiles!revisions_created_by_fkey(nickname)')
      .order('created_at', { ascending: false });
    if (data) {
      setRevisions(data.map((r) => ({
        ...r,
        creator: Array.isArray(r.creator) ? r.creator[0] : r.creator,
      })) as Revision[]);
    }
  }, []);

  const loadItems = useCallback(async () => {
    const { data } = await supabase
      .from('inventory')
      .select('*')
      .order('category')
      .order('name');
    if (data) setItems(data as InventoryItem[]);
  }, []);

  const revisionsTables = useMemo(() => ['revisions'], []);
  useOnTableChange(revisionsTables, loadRevisions);

  useEffect(() => {
    Promise.all([loadRevisions(), loadItems()]).then(() => setIsLoading(false));
  }, [loadRevisions, loadItems]);

  const physicalItems = items.filter((i) => i.min_threshold > 0);

  const filteredPhysical = createSearch
    ? physicalItems.filter((i) => i.name.toLowerCase().includes(createSearch.toLowerCase()))
    : physicalItems;

  const getChanges = () => {
    return Object.entries(revisionData)
      .filter(([id, val]) => {
        if (val === '' || val === undefined) return false;
        const item = items.find((i) => i.id === id);
        return item && Number(val) !== item.stock_quantity;
      })
      .map(([id, val]) => {
        const item = items.find((i) => i.id === id)!;
        return { item, expected: item.stock_quantity, actual: Number(val), diff: Number(val) - item.stock_quantity, price: item.price };
      });
  };

  const changes = getChanges();
  const hasDraftChanges = changes.length > 0 || revisionNote.trim().length > 0;
  const draftSummary = computeSummary(changes);

  const handleTryExit = () => {
    if (hasDraftChanges) setShowExitWarning(true);
    else setIsCreating(false);
  };

  const confirmExit = () => {
    setShowExitWarning(false);
    setIsCreating(false);
    setRevisionData({});
    setRevisionNote('');
    setCreateSearch('');
  };

  const handleCreateRevision = async () => {
    if (changes.length === 0) return;

    const totalDiff = changes.reduce((s, c) => s + Math.abs(c.diff), 0);

    const { data: revision, error } = await supabase
      .from('revisions')
      .insert({
        note: revisionNote || null,
        total_diff: totalDiff,
        items_count: changes.length,
        created_by: user?.id,
      })
      .select()
      .single();

    if (error || !revision) return;

    const rows = changes.map((c) => ({
      revision_id: revision.id,
      item_id: c.item.id,
      expected_qty: c.expected,
      actual_qty: c.actual,
      diff: c.diff,
    }));
    await supabase.from('revision_items').insert(rows);

    for (const c of changes) {
      await supabase.from('inventory').update({ stock_quantity: c.actual }).eq('id', c.item.id);
      await supabase.from('transactions').insert({
        type: 'revision',
        amount: c.diff,
        description: `Ревизия ${c.item.name}: было ${c.expected}, факт ${c.actual}, разница ${c.diff > 0 ? '+' : ''}${c.diff}`,
        item_id: c.item.id,
        created_by: user?.id,
      });
    }

    hapticNotification('success');
    setIsCreating(false);
    setRevisionData({});
    setRevisionNote('');
    setCreateSearch('');
    loadRevisions();
    loadItems();
  };

  const openDetail = async (rev: Revision) => {
    setSelectedRevision(rev);
    setShowDetail(true);
    const { data } = await supabase
      .from('revision_items')
      .select('*, item:inventory(*)')
      .eq('revision_id', rev.id);
    const revItems = (data || []).map((ri) => ({
      ...ri,
      item: Array.isArray(ri.item) ? ri.item[0] : ri.item,
    })) as RevisionItem[];
    setDetailItems(revItems);
  };

  const detailSummary = computeSummary(
    detailItems.map((ri) => ({ diff: ri.diff, price: ri.item?.price || 0 }))
  );

  const formatDate = (d: string) => new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  const formatTime = (d: string) => new Date(d).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

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
        <div className="flex items-center gap-3">
          <button onClick={handleTryExit} className="w-10 h-10 rounded-xl card flex items-center justify-center hover:bg-white/10 transition-colors active:scale-95 shrink-0">
            <ArrowLeft className="w-5 h-5 text-[var(--c-text)]" />
          </button>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-[var(--c-text)]">Новая ревизия</h2>
            {changes.length > 0 && (
              <p className="text-xs text-[var(--c-hint)]">{changes.length} расхождений</p>
            )}
          </div>
        </div>

        <Input
          label="Примечание"
          placeholder="Комментарий к ревизии (необязательно)"
          value={revisionNote}
          onChange={(e) => setRevisionNote(e.target.value)}
        />

        {/* Live summary */}
        {changes.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/15">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                <span className="text-[10px] font-medium text-red-400">Недостача</span>
              </div>
              <p className="text-lg font-bold text-red-400">{draftSummary.shortageUnits} ед.</p>
              <p className="text-xs text-red-400/60">{draftSummary.shortageCount} поз. · {fmtCur(draftSummary.shortageCost)}</p>
            </div>
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/15">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[10px] font-medium text-emerald-400">Излишки</span>
              </div>
              <p className="text-lg font-bold text-emerald-400">{draftSummary.surplusUnits} ед.</p>
              <p className="text-xs text-emerald-400/60">{draftSummary.surplusCount} поз. · {fmtCur(draftSummary.surplusCost)}</p>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type="text"
            placeholder="Поиск позиции..."
            className="w-full pl-10 pr-4 py-2.5 card rounded-xl text-[13px] text-[var(--c-text)] placeholder:text-white/30"
            value={createSearch}
            onChange={(e) => setCreateSearch(e.target.value)}
          />
        </div>

        <p className="text-xs text-[var(--c-hint)]">
          Введите фактическое количество для каждой позиции
        </p>

        <div className="space-y-2">
          {filteredPhysical.map((item) => {
            const val = revisionData[item.id];
            const hasChange = val !== undefined && val !== '' && Number(val) !== item.stock_quantity;
            const diff = hasChange ? Number(val) - item.stock_quantity : 0;
            const costImpact = Math.abs(diff) * item.price;
            return (
              <div key={item.id} className={`flex items-center gap-3 p-2.5 rounded-xl ${hasChange ? (diff < 0 ? 'bg-red-500/5 border border-red-500/20' : 'bg-emerald-500/5 border border-emerald-500/20') : 'card'}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[var(--c-text)] truncate">{item.name}</p>
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] text-white/30">Система: {item.stock_quantity}</p>
                    {hasChange && (
                      <p className={`text-[10px] font-medium ${diff < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                        {fmtCur(costImpact)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="w-20">
                  <Input
                    type="number" placeholder="Факт"
                    value={revisionData[item.id] || ''}
                    onChange={(e) => { hapticFeedback('light'); setRevisionData((prev) => ({ ...prev, [item.id]: e.target.value })); }}
                    min={0}
                  />
                </div>
                {hasChange && (
                  <span className={`text-[13px] font-bold min-w-[40px] text-right ${diff < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {diff > 0 ? '+' : ''}{diff}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {changes.length > 0 && (
          <>
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-1">
              <div className="flex justify-between text-[13px]">
                <span className="text-white/50">Всего расхождений</span>
                <span className="font-bold text-amber-400">{changes.length} поз.</span>
              </div>
              <div className="flex justify-between text-[13px]">
                <span className="text-white/50">На сумму</span>
                <span className="font-bold text-[var(--c-text)]">{fmtCur(draftSummary.shortageCost + draftSummary.surplusCost)}</span>
              </div>
            </div>
            <Button fullWidth size="lg" onClick={handleCreateRevision}>
              <ClipboardList className="w-5 h-5" />
              Применить ревизию
            </Button>
          </>
        )}

        <Drawer open={showExitWarning} onClose={() => setShowExitWarning(false)} title="Выйти из ревизии?" size="sm">
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[13px] font-semibold text-amber-400">Ревизия не сохранена</p>
                <p className="text-xs text-white/40 mt-1">Все введённые данные будут потеряны</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button fullWidth variant="secondary" onClick={() => setShowExitWarning(false)}>Остаться</Button>
              <Button fullWidth variant="danger" onClick={confirmExit}>Выйти</Button>
            </div>
          </div>
        </Drawer>
      </div>
    );
  }

  // ==================
  // REVISION LIST
  // ==================
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--c-hint)]">{revisions.length} документов</p>
        <Button size="lg" onClick={() => { setIsCreating(true); loadItems(); }}>
          <Plus className="w-5 h-5" />
          Новая
        </Button>
      </div>

      {revisions.length === 0 ? (
        <div className="text-center py-16">
          <ClipboardList className="w-16 h-16 text-white/5 mx-auto mb-4" />
          <p className="text-[var(--c-hint)]">Нет ревизий</p>
        </div>
      ) : (
        <div className="space-y-2">
          {revisions.map((r) => (
            <button
              key={r.id}
              onClick={() => openDetail(r)}
              className="w-full text-left p-3 rounded-xl card-interactive"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
                    <ClipboardList className="w-5 h-5 text-amber-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[13px] text-[var(--c-text)]">{formatDate(r.created_at)}</span>
                      <span className="text-xs text-[var(--c-hint)]">{formatTime(r.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-white/40">{r.items_count} поз.</span>
                      <span className="text-xs text-amber-400/70">Δ {r.total_diff} ед.</span>
                      {r.note && <span className="text-xs text-white/30 truncate">· {r.note}</span>}
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-white/20 shrink-0" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* DETAIL DRAWER */}
      <Drawer
        open={showDetail}
        onClose={() => setShowDetail(false)}
        title={selectedRevision ? `Ревизия · ${formatDate(selectedRevision.created_at)}` : 'Ревизия'}
        size="md"
      >
        {selectedRevision && (
          <div className="space-y-4">
            {/* Meta */}
            <div className="p-2.5 rounded-xl card space-y-2">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-white/50 flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" /> Дата</span>
                <span className="text-[var(--c-text)]">{new Date(selectedRevision.created_at).toLocaleString('ru-RU')}</span>
              </div>
              {selectedRevision.creator && (
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-white/50 flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> Кто проводил</span>
                  <span className="text-[var(--c-text)]">{selectedRevision.creator.nickname}</span>
                </div>
              )}
              {selectedRevision.note && (
                <div className="text-[13px]">
                  <span className="text-white/50">Примечание:</span>
                  <span className="text-[var(--c-text)] ml-2">{selectedRevision.note}</span>
                </div>
              )}
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/15">
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                  <span className="text-[10px] font-medium text-red-400">Недостача</span>
                </div>
                <p className="text-lg font-bold text-red-400">{detailSummary.shortageUnits} ед.</p>
                <p className="text-xs text-red-400/60">{detailSummary.shortageCount} поз. · {fmtCur(detailSummary.shortageCost)}</p>
              </div>
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/15">
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[10px] font-medium text-emerald-400">Излишки</span>
                </div>
                <p className="text-lg font-bold text-emerald-400">{detailSummary.surplusUnits} ед.</p>
                <p className="text-xs text-emerald-400/60">{detailSummary.surplusCount} поз. · {fmtCur(detailSummary.surplusCost)}</p>
              </div>
            </div>

            {/* Total impact */}
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <div className="flex justify-between text-[13px]">
                <span className="text-white/50">Общее расхождение</span>
                <span className="font-bold text-amber-400">{fmtCur(detailSummary.shortageCost + detailSummary.surplusCost)}</span>
              </div>
            </div>

            {/* Items — shortages first */}
            {detailItems.filter((ri) => ri.diff < 0).length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wider mb-2">Недостача</p>
                <div className="space-y-1.5">
                  {detailItems.filter((ri) => ri.diff < 0).map((ri) => (
                    <div key={ri.id} className="flex items-center justify-between p-3 rounded-xl bg-red-500/5 border border-red-500/10">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-[var(--c-text)] truncate">{ri.item?.name}</p>
                        <p className="text-[10px] text-white/30">Было: {ri.expected_qty} → Факт: {ri.actual_qty}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-[13px] text-red-400">{ri.diff}</p>
                        <p className="text-[10px] text-red-400/60">{fmtCur(Math.abs(ri.diff) * (ri.item?.price || 0))}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detailItems.filter((ri) => ri.diff > 0).length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mb-2">Излишки</p>
                <div className="space-y-1.5">
                  {detailItems.filter((ri) => ri.diff > 0).map((ri) => (
                    <div key={ri.id} className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-[var(--c-text)] truncate">{ri.item?.name}</p>
                        <p className="text-[10px] text-white/30">Было: {ri.expected_qty} → Факт: {ri.actual_qty}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-[13px] text-emerald-400">+{ri.diff}</p>
                        <p className="text-[10px] text-emerald-400/60">{fmtCur(ri.diff * (ri.item?.price || 0))}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
