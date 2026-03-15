import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { useLayoutStore, useSetHeader } from '@/store/layout';
import { ListSkeleton } from '@/components/ui/Skeleton';
import {
  Plus, ClipboardList, ChevronRight,
  Search, FileText, Save, AlertCircle, CalendarDays, User,
} from 'lucide-react';
import { hapticFeedback, hapticNotification } from '@/lib/telegram';
import { notifyRevision } from '@/lib/notifications';
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

const fmtCur = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + '₽';

interface RevisionPageProps {
  initialRevisionId?: string;
}

export function RevisionPage({ initialRevisionId }: RevisionPageProps) {
  const hasOpenedInitialRef = useRef(false);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isCreating, setIsCreating] = useState(false);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [revisionData, setRevisionData] = useState<Record<string, string>>({});
  const [revisionNote, setRevisionNote] = useState('');
  const [showExitConfirmation, setShowExitConfirmation] = useState(false);
  const [createSearch, setCreateSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [selectedRevision, setSelectedRevision] = useState<Revision | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [detailItems, setDetailItems] = useState<RevisionItem[]>([]);

  const user = useAuthStore((s) => s.user);
  const addHideReason = useLayoutStore((s) => s.addHideReason);
  const removeHideReason = useLayoutStore((s) => s.removeHideReason);

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

  useEffect(() => {
    if (!initialRevisionId || hasOpenedInitialRef.current || revisions.length === 0) return;
    const rev = revisions.find((r) => r.id === initialRevisionId);
    if (rev) {
      hasOpenedInitialRef.current = true;
      openDetail(rev);
    }
  }, [initialRevisionId, revisions]);

  const setHeader = useSetHeader();
  // Hide nav when creating revision
  useEffect(() => {
    if (isCreating) addHideReason('revision-creating');
    return () => removeHideReason('revision-creating');
  }, [isCreating, addHideReason, removeHideReason]);

  const physicalItems = items.filter((i) => !i.is_service && i.track_stock !== false && (i.min_threshold > 0 || i.stock_quantity > 0));

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

  const handleTryExit = useCallback(() => {
    setShowExitConfirmation(true);
  }, []);

  useEffect(() => {
    if (isCreating) {
      setHeader({
        title: 'Новая ревизия',
        subtitle: 'Ввод фактических остатков',
        showBack: true,
        onBack: handleTryExit,
      });
      return () => setHeader(null);
    }
  }, [isCreating, setHeader, handleTryExit]);

  const confirmExit = () => {
    setShowExitConfirmation(false);
    setIsCreating(false);
    setRevisionData({});
    setRevisionNote('');
    setCreateSearch('');
  };

  const handleCreateRevision = async () => {
    if (changes.length === 0 || isSaving) return;
    setIsSaving(true);

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

    if (error || !revision) { setIsSaving(false); return; }

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

    const revisionItems = changes.map((c) => ({
      name: c.item.name,
      expected: c.expected,
      actual: c.actual,
      diff: c.diff,
    }));
    notifyRevision(revision.id, totalDiff, revisionItems, user?.nickname).catch(() => {});

    hapticNotification('success');
    setIsSaving(false);
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

  const detailSummary = useMemo(() => {
    let shortageUnits = 0, surplusUnits = 0, shortageCost = 0, surplusCost = 0;
    for (const ri of detailItems) {
      if (ri.diff < 0) {
        shortageUnits += Math.abs(ri.diff);
        shortageCost += Math.abs(ri.diff) * (ri.item?.price || 0);
      } else if (ri.diff > 0) {
        surplusUnits += ri.diff;
        surplusCost += ri.diff * (ri.item?.price || 0);
      }
    }
    return { shortageUnits, surplusUnits, shortageCost, surplusCost };
  }, [detailItems]);

  const formatDate = (d: string) => new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '.');
  const formatTime = (d: string) => new Date(d).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  const startNewRevision = () => {
    hapticFeedback();
    loadItems();
    setIsCreating(true);
  };

  if (isLoading) {
    return <ListSkeleton rows={4} />;
  }

  // ==================
  // FULL-SCREEN CREATE REVISION
  // ==================
  if (isCreating) {
    return (
      <div className="flex flex-col -mx-4 -my-3 lg:-mx-5 lg:-my-4 bg-[#0b0e14]" style={{ height: '100dvh' }}>
        <div className="absolute top-[-5%] right-[-5%] w-[30%] h-[30%] bg-indigo-600/5 blur-[100px] rounded-full pointer-events-none" />

        {/* Scrollable content */}
        <div className="relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden scroll-area">
          <div className="max-w-4xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 space-y-4 sm:space-y-6">
            <div className="space-y-3 sm:space-y-4">
              <div className="flex flex-col">
                <label className="text-slate-500 text-[9px] sm:text-[10px] font-black uppercase tracking-widest mb-1 ml-1">Примечание</label>
                <textarea
                  value={revisionNote}
                  onChange={(e) => setRevisionNote(e.target.value)}
                  placeholder="Комментарий (необязательно)..."
                  className="w-full bg-slate-900/40 border border-slate-800 rounded-xl sm:rounded-2xl p-3 sm:p-4 text-sm sm:text-base text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all placeholder:text-slate-700 resize-none h-14 sm:h-16"
                />
              </div>

              <div className="relative">
                <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4 sm:w-5 sm:h-5" />
                <input
                  type="text"
                  placeholder="Поиск позиции..."
                  value={createSearch}
                  onChange={(e) => setCreateSearch(e.target.value)}
                  className="w-full bg-slate-900/40 border border-slate-800 rounded-xl sm:rounded-2xl py-2.5 sm:py-3 pl-10 sm:pl-12 pr-3 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-slate-700 text-white"
                />
              </div>
            </div>

            <div className="space-y-2 sm:space-y-3">
              <div className="flex items-center justify-between px-1 sm:px-2 text-[9px] sm:text-[10px]">
                <span className="text-slate-500 font-black uppercase tracking-widest">Товар / Система</span>
                <span className="text-slate-500 font-black uppercase tracking-widest">Факт</span>
              </div>

              {filteredPhysical.map((item) => {
                const val = revisionData[item.id] || '';
                const delta = val === '' ? 0 : Number(val) - item.stock_quantity;
                const hasDiscrepancy = val !== '' && delta !== 0;

                return (
                  <div
                    key={item.id}
                    className={`bg-slate-900/30 border ${hasDiscrepancy ? 'border-rose-500/20' : 'border-slate-800'} rounded-xl sm:rounded-2xl p-2.5 sm:p-3 flex items-center justify-between gap-2 transition-all`}
                  >
                    <div className="flex flex-col min-w-0 flex-1">
                      <h4 className="font-bold text-white text-sm sm:text-base leading-tight truncate">{item.name}</h4>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-slate-500 text-[10px] sm:text-xs font-bold uppercase">Система: {item.stock_quantity}</span>
                        {val !== '' && (
                          <span className={`text-[9px] sm:text-[10px] font-black px-1 py-0.5 rounded shrink-0 ${delta >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                            {delta > 0 ? `+${delta}` : delta}
                          </span>
                        )}
                      </div>
                    </div>

                    <input
                      type="number"
                      value={val}
                      onChange={(e) => { hapticFeedback('light'); setRevisionData((prev) => ({ ...prev, [item.id]: e.target.value })); }}
                      placeholder="—"
                      min={0}
                      className={`w-14 sm:w-16 lg:w-20 bg-slate-800/50 border border-slate-700 rounded-lg sm:rounded-xl py-2 sm:py-2.5 px-2 text-center text-base sm:text-lg font-black focus:outline-none focus:ring-2 transition-all shrink-0 ${
                        hasDiscrepancy ? 'text-rose-400 focus:ring-rose-500/30' : 'text-indigo-400 focus:ring-indigo-500/30'
                      }`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom Action Bar — pinned */}
        <div className="shrink-0 bg-[#0b0e14] border-t border-slate-800 p-3 sm:p-4 lg:p-5 flex justify-center safe-area-bottom">
          <div className="max-w-md w-full flex gap-2 sm:gap-3">
            <button
              onClick={handleTryExit}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-3 sm:py-3.5 rounded-xl sm:rounded-2xl font-bold text-sm sm:text-base transition-all active:scale-95"
            >
              Отмена
            </button>
            <button
              onClick={handleCreateRevision}
              disabled={changes.length === 0 || isSaving}
              className="flex-[2] bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:opacity-50 text-white py-3 sm:py-3.5 rounded-xl sm:rounded-2xl flex items-center justify-center gap-2 font-black uppercase tracking-wider text-sm sm:text-base shadow-xl shadow-indigo-600/30 active:scale-95 transition-all"
            >
              {isSaving ? <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4 sm:w-5 sm:h-5" />}
              Сохранить
            </button>
          </div>
        </div>

        {/* Exit confirmation modal */}
        {showExitConfirmation && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md">
            <div className="bg-[#0f1218] w-full max-w-sm rounded-2xl sm:rounded-[32px] border border-slate-800 p-5 sm:p-6 lg:p-8 text-center shadow-2xl">
              <div className="w-14 h-14 sm:w-16 sm:h-16 lg:w-20 lg:h-20 bg-rose-500/10 text-rose-500 rounded-2xl sm:rounded-3xl flex items-center justify-center mx-auto mb-4 sm:mb-6">
                <AlertCircle className="w-7 h-7 sm:w-9 sm:h-9 lg:w-12 lg:h-12" />
              </div>
              <h2 className="text-lg sm:text-xl lg:text-2xl font-black italic text-white uppercase tracking-tighter mb-2 sm:mb-3">Внимание!</h2>
              <p className="text-slate-400 font-medium text-sm sm:text-base mb-6 sm:mb-8">
                Вы уверены, что хотите выйти? Все введенные данные будут утеряны.
              </p>
              <div className="flex flex-col gap-2 sm:gap-3">
                <button
                  onClick={confirmExit}
                  className="w-full py-3 sm:py-4 bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white rounded-xl sm:rounded-2xl font-black uppercase tracking-wider text-sm sm:text-base transition-all active:scale-95"
                >
                  Выйти без сохранения
                </button>
                <button
                  onClick={() => setShowExitConfirmation(false)}
                  className="w-full py-3 sm:py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl sm:rounded-2xl font-bold text-sm sm:text-base transition-all active:scale-95"
                >
                  Продолжить работу
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==================
  // REVISION LIST (History)
  // ==================
  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-slate-500 text-xs sm:text-sm font-bold uppercase tracking-wider">{revisions.length} документов</span>
        <button
          onClick={startNewRevision}
          className="bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl flex items-center gap-1.5 sm:gap-2 font-bold text-sm sm:text-base shadow-lg shadow-indigo-600/20 active:scale-95 transition-all"
        >
          <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
          Новая ревизия
        </button>
      </div>

      {revisions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 sm:py-16 text-slate-600 opacity-50">
          <ClipboardList className="w-12 h-12 sm:w-16 sm:h-16 mb-3" />
          <p className="font-bold text-sm sm:text-base">Нет ревизий</p>
        </div>
      ) : (
        <div className="space-y-2 sm:space-y-3">
          {revisions.map((r) => (
            <button
              key={r.id}
              onClick={() => openDetail(r)}
              className="w-full text-left bg-slate-900/30 border border-slate-800 rounded-xl sm:rounded-2xl p-3 sm:p-4 flex items-center justify-between gap-2 hover:border-slate-600 transition-all group cursor-pointer"
            >
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-slate-800 rounded-xl sm:rounded-2xl flex items-center justify-center text-slate-400 group-hover:text-indigo-400 transition-colors shrink-0">
                  <FileText className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <h4 className="font-black text-white text-sm sm:text-base truncate">{r.id.slice(0, 12)}</h4>
                    <span className="text-[9px] sm:text-[10px] px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 rounded font-bold uppercase shrink-0">Завершено</span>
                  </div>
                  <p className="text-slate-500 text-[10px] sm:text-xs font-medium">{formatDate(r.created_at)} · {r.items_count} поз.</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {r.note && (
                  <div className="hidden sm:block text-right max-w-[100px] lg:max-w-[150px]">
                    <p className="text-slate-400 text-[10px] font-bold truncate">{r.note}</p>
                  </div>
                )}
                <ChevronRight className="text-slate-700 w-5 h-5 sm:w-6 sm:h-6" />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* DETAIL DRAWER */}
      {showDetail && selectedRevision && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md"
          onClick={() => setShowDetail(false)}
        >
          <div
            className="bg-[#0f1218] w-full max-w-lg max-h-[85vh] sm:max-h-[90vh] overflow-y-auto rounded-xl sm:rounded-2xl border border-slate-800 p-4 sm:p-5 lg:p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base sm:text-lg font-black text-white mb-4 sm:mb-5">Ревизия · {formatDate(selectedRevision.created_at)}</h2>

            <div className="space-y-2 sm:space-y-3 mb-4 sm:mb-5">
              <div className="flex justify-between text-xs sm:text-sm">
                <span className="text-slate-500 flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Дата</span>
                <span className="text-white">{new Date(selectedRevision.created_at).toLocaleString('ru-RU')}</span>
              </div>
              {selectedRevision.creator && (
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-slate-500 flex items-center gap-1.5"><User className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Кто проводил</span>
                  <span className="text-white">{selectedRevision.creator.nickname}</span>
                </div>
              )}
              {selectedRevision.note && (
                <div className="text-xs sm:text-sm">
                  <span className="text-slate-500">Примечание:</span>
                  <span className="text-white ml-2">{selectedRevision.note}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-4 sm:mb-5">
              <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-rose-500/5 border border-rose-500/20">
                <p className="text-[9px] sm:text-[10px] font-bold text-rose-400 uppercase mb-0.5">Недостача</p>
                <p className="text-base sm:text-lg font-black text-rose-400">{detailSummary.shortageUnits} ед.</p>
                <p className="text-[10px] sm:text-xs text-rose-400/60">{fmtCur(detailSummary.shortageCost)}</p>
              </div>
              <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-emerald-500/5 border border-emerald-500/20">
                <p className="text-[9px] sm:text-[10px] font-bold text-emerald-400 uppercase mb-0.5">Излишки</p>
                <p className="text-base sm:text-lg font-black text-emerald-400">{detailSummary.surplusUnits} ед.</p>
                <p className="text-[10px] sm:text-xs text-emerald-400/60">{fmtCur(detailSummary.surplusCost)}</p>
              </div>
            </div>

            <div className="space-y-1.5 sm:space-y-2 max-h-48 sm:max-h-56 overflow-y-auto">
              {detailItems.filter((ri) => ri.diff < 0).length > 0 && (
                <>
                  <p className="text-[9px] sm:text-[10px] font-bold text-rose-400 uppercase tracking-wider">Недостача</p>
                  {detailItems.filter((ri) => ri.diff < 0).map((ri) => (
                    <div key={ri.id} className="flex justify-between p-2 sm:p-2.5 rounded-lg sm:rounded-xl bg-rose-500/5 border border-rose-500/10">
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-bold text-white truncate">{ri.item?.name}</p>
                        <p className="text-[9px] sm:text-[10px] text-slate-500">Было: {ri.expected_qty} → Факт: {ri.actual_qty}</p>
                      </div>
                      <p className="font-bold text-rose-400 text-sm shrink-0">{ri.diff}</p>
                    </div>
                  ))}
                </>
              )}
              {detailItems.filter((ri) => ri.diff > 0).length > 0 && (
                <>
                  <p className="text-[9px] sm:text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Излишки</p>
                  {detailItems.filter((ri) => ri.diff > 0).map((ri) => (
                    <div key={ri.id} className="flex justify-between p-2 sm:p-2.5 rounded-lg sm:rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-bold text-white truncate">{ri.item?.name}</p>
                        <p className="text-[9px] sm:text-[10px] text-slate-500">Было: {ri.expected_qty} → Факт: {ri.actual_qty}</p>
                      </div>
                      <p className="font-bold text-emerald-400 text-sm shrink-0">+{ri.diff}</p>
                    </div>
                  ))}
                </>
              )}
            </div>

            <button
              onClick={() => setShowDetail(false)}
              className="w-full mt-4 sm:mt-5 py-3 sm:py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl sm:rounded-2xl font-bold text-sm sm:text-base transition-all"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
