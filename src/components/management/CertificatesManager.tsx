import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Drawer } from '@/components/ui/Drawer';
import { useOnTableChange } from '@/hooks/useRealtimeSync';
import { hapticNotification } from '@/lib/telegram';
import {
  Plus, Ticket, Gift, Search, Trash2,
} from 'lucide-react';
import type { Certificate } from '@/types';

export function CertificatesManager() {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showGenerate, setShowGenerate] = useState(false);
  const [prefix, setPrefix] = useState('T-');
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [nominal, setNominal] = useState('');
  const [generating, setGenerating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<Certificate | null>(null);

  const user = useAuthStore((s) => s.user);

  const loadCertificates = useCallback(async () => {
    const { data } = await supabase
      .from('certificates')
      .select('*, creator:profiles!certificates_created_by_fkey(nickname), user:profiles!certificates_used_by_fkey(nickname)')
      .order('created_at', { ascending: false });
    setCertificates((data || []) as Certificate[]);
    setIsLoading(false);
  }, []);

  useEffect(() => { loadCertificates(); }, [loadCertificates]);
  useOnTableChange(useMemo(() => ['certificates'], []), loadCertificates);

  const handleGenerate = async () => {
    const from = parseInt(rangeFrom);
    const to = parseInt(rangeTo);
    const nom = parseFloat(nominal);
    if (isNaN(from) || isNaN(to) || isNaN(nom) || from > to || nom <= 0) return;
    if (to - from + 1 > 1000) return;

    setGenerating(true);
    const rows = [];
    for (let i = from; i <= to; i++) {
      rows.push({
        code: `${prefix}${i}`,
        nominal: nom,
        balance: nom,
        created_by: user?.id,
      });
    }

    const { error } = await supabase.from('certificates').insert(rows);
    if (error) {
      hapticNotification('error');
    } else {
      hapticNotification('success');
      setShowGenerate(false);
      setRangeFrom('');
      setRangeTo('');
      setNominal('');
      loadCertificates();
    }
    setGenerating(false);
  };

  const handleDelete = async (cert: Certificate) => {
    await supabase.from('certificates').delete().eq('id', cert.id);
    hapticNotification('success');
    setShowDeleteConfirm(null);
    loadCertificates();
  };

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return certificates;
    const q = searchQuery.toLowerCase();
    return certificates.filter((c) => c.code.toLowerCase().includes(q));
  }, [certificates, searchQuery]);

  const stats = useMemo(() => {
    const total = certificates.length;
    const used = certificates.filter((c) => c.is_used).length;
    const active = total - used;
    const totalNominal = certificates.reduce((s, c) => s + c.nominal, 0);
    const remainingBalance = certificates.filter((c) => !c.is_used).reduce((s, c) => s + c.balance, 0);
    return { total, used, active, totalNominal, remainingBalance };
  }, [certificates]);

  const fmtCur = (n: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(n) + '₽';

  if (isLoading) {
    return <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-[var(--c-surface)] animate-pulse" />)}</div>;
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2.5 rounded-xl card text-center">
          <p className="text-lg font-black text-[var(--c-text)] tabular-nums">{stats.active}</p>
          <p className="text-[9px] text-[var(--c-muted)]">Активных</p>
        </div>
        <div className="p-2.5 rounded-xl card text-center">
          <p className="text-lg font-black text-[var(--c-hint)] tabular-nums">{stats.used}</p>
          <p className="text-[9px] text-[var(--c-muted)]">Использовано</p>
        </div>
        <div className="p-2.5 rounded-xl card text-center">
          <p className="text-lg font-black text-[var(--c-success)] tabular-nums">{fmtCur(stats.remainingBalance)}</p>
          <p className="text-[9px] text-[var(--c-muted)]">Остаток</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--c-muted)]" />
          <input
            placeholder="Поиск по коду..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-[var(--c-surface)] border border-[var(--c-surface-hover)] text-sm text-[var(--c-text)] placeholder:text-[var(--c-muted)] focus:outline-none focus:border-[var(--c-accent)]/25 transition-colors"
          />
        </div>
        <Button size="sm" onClick={() => setShowGenerate(true)}>
          <Plus className="w-4 h-4" />
          Генерация
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-10">
          <Gift className="w-10 h-10 text-[var(--c-muted)] mx-auto mb-2" />
          <p className="text-sm text-[var(--c-hint)]">Нет сертификатов</p>
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map((cert) => (
            <div key={cert.id} className={`flex items-center gap-3 p-3 rounded-xl ${cert.is_used ? 'bg-white/2 opacity-50' : 'card'}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${cert.is_used ? 'bg-[var(--c-surface)]' : 'bg-[var(--c-warning-bg)]'}`}>
                <Ticket className={`w-5 h-5 ${cert.is_used ? 'text-[var(--c-muted)]' : 'text-[var(--c-warning)]'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-mono font-bold text-[13px] text-[var(--c-text)]">{cert.code}</p>
                  {cert.is_used ? (
                    <Badge size="sm" variant="default">использован</Badge>
                  ) : (
                    <Badge size="sm" variant="success">активен</Badge>
                  )}
                </div>
                <p className="text-[11px] text-[var(--c-muted)] mt-0.5">
                  Номинал: {fmtCur(cert.nominal)}
                  {cert.is_used && cert.user && <> · {cert.user.nickname}</>}
                </p>
              </div>
              {!cert.is_used && (
                <button
                  onClick={() => setShowDeleteConfirm(cert)}
                  className="w-8 h-8 rounded-lg bg-[var(--c-danger-bg)] flex items-center justify-center active:scale-90 transition-transform shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5 text-[var(--c-danger)]" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <Drawer open={showGenerate} onClose={() => setShowGenerate(false)} title="Генерация сертификатов">
        <div className="space-y-4">
          <Input label="Префикс" value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="T-" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="От" type="number" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} placeholder="100" />
            <Input label="До" type="number" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} placeholder="150" />
          </div>
          <Input label="Номинал (₽)" type="number" value={nominal} onChange={(e) => setNominal(e.target.value)} placeholder="1000" />

          {rangeFrom && rangeTo && nominal && (() => {
            const count = Math.max(0, (parseInt(rangeTo) || 0) - (parseInt(rangeFrom) || 0) + 1);
            const overLimit = count > 1000;
            return (
              <div className={`p-3 rounded-xl ${overLimit ? 'bg-red-500/6 border border-red-500/10' : 'bg-amber-500/6 border border-amber-500/10'}`}>
                <p className={`text-xs ${overLimit ? 'text-red-400' : 'text-amber-400'}`}>
                  Будет создано <strong>{count}</strong> сертификатов
                  от <strong>{prefix}{rangeFrom}</strong> до <strong>{prefix}{rangeTo}</strong> номиналом <strong>{nominal}₽</strong>
                  {overLimit && <><br />Максимум 1000 за раз</>}
                </p>
              </div>
            );
          })()}

          <Button onClick={handleGenerate} className="w-full" disabled={generating || !rangeFrom || !rangeTo || !nominal || ((parseInt(rangeTo) || 0) - (parseInt(rangeFrom) || 0) + 1) > 1000}>
            {generating ? 'Генерация...' : 'Сгенерировать'}
          </Button>
        </div>
      </Drawer>

      <Drawer open={!!showDeleteConfirm} onClose={() => setShowDeleteConfirm(null)} title="Удалить сертификат?">
        <div className="space-y-4">
          <p className="text-sm text-[var(--c-hint)]">Сертификат <strong>{showDeleteConfirm?.code}</strong> будет удалён.</p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setShowDeleteConfirm(null)} className="flex-1">Отмена</Button>
            <Button variant="danger" onClick={() => showDeleteConfirm && handleDelete(showDeleteConfirm)} className="flex-1">Удалить</Button>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
