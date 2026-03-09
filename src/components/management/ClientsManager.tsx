import { useEffect, useState, useCallback, useRef, useMemo, memo, startTransition } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Drawer } from '@/components/ui/Drawer';
import {
  Search, Pencil, Trash2, X, Check, User,
  Phone, Calendar, Star, CreditCard, UserPlus, Cake, GraduationCap, Send,
  Link, CheckCircle, XCircle, QrCode,
} from 'lucide-react';
import QRCode from 'qrcode';
import { hapticFeedback, hapticNotification } from '@/lib/telegram';
import { useOnTableChange } from '@/hooks/useRealtimeSync';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { Profile, ClientTier } from '@/types';

const WALLET_BOT_USERNAME = (import.meta.env.VITE_WALLET_BOT_USERNAME as string) || 'titanwalletrobot';

interface LinkRequest {
  id: string;
  tg_id: string;
  tg_username: string | null;
  tg_first_name: string | null;
  profile_id: string;
  status: string;
  created_at: string;
  profile?: { nickname: string };
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

interface ClientForm {
  nickname: string;
  phone: string;
  birthday: string;
  client_tier: ClientTier;
  photo_url: string;
  tg_username: string;
  search_tags_text: string;
}

const emptyForm: ClientForm = {
  nickname: '',
  phone: '',
  birthday: '',
  client_tier: 'regular',
  photo_url: '',
  tg_username: '',
  search_tags_text: '',
};

const ClientRow = memo(function ClientRow({ client, onSelect, getAge, isBirthdaySoon }: { client: Profile; onSelect: (c: Profile) => void; getAge: (d: string) => number; isBirthdaySoon: (d: string) => boolean }) {
  return (
    <button
      onClick={() => onSelect(client)}
      className="w-full flex items-center gap-3 p-2.5 rounded-xl card-interactive text-left"
    >
      {/* Avatar */}
      <div className="w-11 h-11 rounded-full overflow-hidden shrink-0 bg-[var(--c-surface-hover)] flex items-center justify-center">
        {client.photo_url ? (
          <img src={client.photo_url} alt={client.nickname} className="w-full h-full object-cover" />
        ) : (
          <User className="w-5 h-5 text-[var(--c-hint)]" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-[13px] font-medium text-[var(--c-text)] truncate">{client.nickname}</p>
          {client.birthday && isBirthdaySoon(client.birthday) && (
            <Cake className="w-3.5 h-3.5 text-pink-400 shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {client.client_tier === 'resident' && <Badge variant="success" size="sm">Резидент</Badge>}
          {client.client_tier === 'student' && <Badge variant="accent" size="sm">Студент</Badge>}
          {client.tg_username && (
            <span className="text-[10px] text-sky-400/50">@{client.tg_username}</span>
          )}
          {client.phone && (
            <span className="text-[10px] text-[var(--c-hint)]">{client.phone}</span>
          )}
          {client.birthday && (
            <span className="text-[10px] text-[var(--c-muted)]">{getAge(client.birthday)} лет</span>
          )}
        </div>
      </div>

      <div className="text-right shrink-0">
        {client.bonus_points > 0 && (
          <p className="text-xs font-bold text-[var(--c-warning)] flex items-center gap-0.5"><Star className="w-3 h-3" />{client.bonus_points}</p>
        )}
        {client.balance < 0 && (
          <p className="text-[10px] text-[var(--c-danger)]">{client.balance}₽</p>
        )}
      </div>
    </button>
  );
});

export function ClientsManager() {
  const [clients, setClients] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'residents' | 'students' | 'guests'>('all');

  const [showEditor, setShowEditor] = useState(false);
  const [editingClient, setEditingClient] = useState<Profile | null>(null);
  const [form, setForm] = useState<ClientForm>(emptyForm);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [detailClient, setDetailClient] = useState<Profile | null>(null);
  const [linkRequests, setLinkRequests] = useState<LinkRequest[]>([]);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);

  const loadClients = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'client')
      .is('deleted_at', null)
      .order('nickname');
    if (data) setClients(data as Profile[]);
  }, []);

  const loadLinkRequests = useCallback(async () => {
    const { data } = await supabase
      .from('tg_link_requests')
      .select('*, profile:profiles(nickname)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (data) setLinkRequests(data as unknown as LinkRequest[]);
  }, []);

  const handleApproveLink = async (req: LinkRequest) => {
    const updates: Record<string, string | null> = { tg_id: req.tg_id };
    if (req.tg_username) updates.tg_username = req.tg_username;
    await supabase.from('profiles').update(updates).eq('id', req.profile_id);
    await supabase.from('tg_link_requests').update({ status: 'approved' }).eq('id', req.id);
    hapticNotification('success');
    loadLinkRequests();
    loadClients();
  };

  const handleRejectLink = async (req: LinkRequest) => {
    await supabase.from('tg_link_requests').update({ status: 'rejected' }).eq('id', req.id);
    hapticNotification('warning');
    loadLinkRequests();
  };

  const profilesTables = useMemo(() => ['profiles'], []);
  const linkTables = useMemo(() => ['tg_link_requests'], []);
  useOnTableChange(profilesTables, loadClients);
  useOnTableChange(linkTables, loadLinkRequests);

  useEffect(() => {
    Promise.all([loadClients(), loadLinkRequests()]).then(() => setIsLoading(false));
  }, [loadClients, loadLinkRequests]);

  const filtered = clients.filter((c) => {
    if (search) {
      const q = search.toLowerCase();
      return c.nickname.toLowerCase().includes(q)
        || (c.phone && c.phone.includes(q))
        || (c.tg_username && c.tg_username.toLowerCase().includes(q))
        || (c.search_tags && c.search_tags.some(tag => tag.toLowerCase().includes(q)));
    }
    if (filter === 'residents') return c.client_tier === 'resident';
    if (filter === 'students') return c.client_tier === 'student';
    if (filter === 'guests') return c.client_tier === 'regular';
    return true;
  });

  const clientListRef = useRef<HTMLDivElement>(null);
  const clientVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => clientListRef.current,
    estimateSize: () => 60,
    overscan: 5,
  });

  const totalResidents = clients.filter((c) => c.client_tier === 'resident').length;

  const updateField = <K extends keyof ClientForm>(key: K, value: ClientForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const openCreate = () => {
    setEditingClient(null);
    setForm(emptyForm);
    setShowEditor(true);
  };

  const openEdit = (client: Profile) => {
    setEditingClient(client);
    setForm({
      nickname: client.nickname,
      phone: client.phone || '',
      birthday: client.birthday || '',
      client_tier: client.client_tier || 'regular',
      photo_url: client.photo_url || '',
      tg_username: client.tg_username || '',
      search_tags_text: (client.search_tags || []).join(', '),
    });
    setShowEditor(true);
    hapticFeedback();
  };

  const openDetail = (client: Profile) => {
    setDetailClient(client);
    setShowDetail(true);
    hapticFeedback('light');
  };

  const generateQr = async (client: Profile) => {
    hapticFeedback();
    const deepLink = `https://t.me/${WALLET_BOT_USERNAME}?start=link_${client.id}`;
    try {
      const url = await QRCode.toDataURL(deepLink, {
        width: 512,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });
      setQrDataUrl(url);
      setShowQr(true);
    } catch { /* ignore */ }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from('client-photos').upload(path, file, { contentType: file.type });
    if (!error) {
      const url = `${SUPABASE_URL}/storage/v1/object/public/client-photos/${path}`;
      updateField('photo_url', url);
      hapticNotification('success');
    }
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async () => {
    if (!form.nickname.trim()) return;
    const rawTg = form.tg_username.trim().replace(/^@/, '');
    const payload = {
      nickname: form.nickname.trim(),
      phone: form.phone.trim() || null,
      birthday: form.birthday || null,
      is_resident: form.client_tier === 'resident',
      client_tier: form.client_tier,
      photo_url: form.photo_url || null,
      tg_username: rawTg || null,
      search_tags: form.search_tags_text
        .split(',')
        .map((t: string) => t.trim())
        .filter(Boolean),
    };

    if (editingClient) {
      await supabase.from('profiles').update(payload).eq('id', editingClient.id);
    } else {
      await supabase.from('profiles').insert({ ...payload, role: 'client' as const });
    }
    hapticNotification('success');
    setShowEditor(false);
    loadClients();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const prevClients = clients;
    setClients((prev) => prev.filter((c) => c.id !== deleteTarget.id));
    setDeleteTarget(null);
    hapticNotification('success');
    const { error } = await supabase
      .from('profiles')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deleteTarget.id);
    if (error) {
      const { error: delErr } = await supabase
        .from('profiles')
        .delete()
        .eq('id', deleteTarget.id);
      if (delErr) {
        setClients(prevClients);
        hapticNotification('error');
      }
    }
  };

  const formatBirthday = (d: string) => {
    const date = new Date(d + 'T00:00:00');
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const getAge = (d: string) => {
    const birth = new Date(d + 'T00:00:00');
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
    return age;
  };

  const isBirthdaySoon = (d: string) => {
    const birth = new Date(d + 'T00:00:00');
    const now = new Date();
    const thisYear = new Date(now.getFullYear(), birth.getMonth(), birth.getDate());
    const diff = thisYear.getTime() - now.getTime();
    return diff >= 0 && diff <= 7 * 86400000;
  };

  if (isLoading) {
    return (
      <div className="space-y-3 py-4">
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl skeleton" />)}
        </div>
        <div className="h-11 rounded-xl skeleton" />
        {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-16 rounded-xl skeleton" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-3 rounded-xl bg-[var(--c-accent)]/10 text-center">
          <p className="text-lg font-bold text-[var(--c-accent)]">{clients.length}</p>
          <p className="text-[10px] text-[var(--c-hint)]">Всего</p>
        </div>
        <div className="p-3 rounded-xl bg-[var(--c-success-bg)] text-center">
          <p className="text-lg font-bold text-[var(--c-success)]">{totalResidents}</p>
          <p className="text-[10px] text-[var(--c-hint)]">Резиденты</p>
        </div>
        <div className="p-3 rounded-xl card text-center">
          <p className="text-lg font-bold text-[var(--c-text)]">{clients.length - totalResidents}</p>
          <p className="text-[10px] text-[var(--c-hint)]">Гости</p>
        </div>
      </div>

      {/* Search + Add */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--c-hint)]" />
          <input
            type="text"
            placeholder="Имя или телефон..."
            className="w-full pl-10 pr-4 py-2.5 card rounded-xl text-[13px] text-[var(--c-text)] placeholder:text-[var(--c-muted)]"
            value={search}
            onChange={(e) => startTransition(() => setSearch(e.target.value))}
          />
        </div>
        <Button onClick={openCreate}>
          <UserPlus className="w-5 h-5" />
        </Button>
      </div>

      {/* Filter tabs */}
      {!search && (
        <div className="flex gap-1 p-1 card rounded-xl">
          {([['all', 'Все'], ['residents', 'Резиденты'], ['students', 'Студенты'], ['guests', 'Гости']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                filter === key ? 'bg-[var(--c-accent)] text-white shadow' : 'text-[var(--c-hint)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Link Requests */}
      {linkRequests.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 px-1">
            <Link className="w-3.5 h-3.5 text-sky-400" />
            <p className="text-xs font-semibold text-sky-400">Заявки на привязку ({linkRequests.length})</p>
          </div>
          {linkRequests.map((req) => (
            <div key={req.id} className="flex items-center gap-3 p-2.5 rounded-xl card border-sky-500/20">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[var(--c-text)]">
                  {req.tg_first_name || 'Пользователь'}
                  {req.tg_username && <span className="text-sky-400/60 ml-1.5">@{req.tg_username}</span>}
                </p>
                <p className="text-[11px] text-[var(--c-hint)] mt-0.5">
                  хочет привязаться к <span className="text-[var(--c-hint)] font-medium">{(req.profile as unknown as { nickname: string })?.nickname || '?'}</span>
                </p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button
                  onClick={() => handleApproveLink(req)}
                  className="w-8 h-8 rounded-lg bg-[var(--c-success-bg)] flex items-center justify-center active:scale-90 transition-transform"
                >
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                </button>
                <button
                  onClick={() => handleRejectLink(req)}
                  className="w-8 h-8 rounded-lg bg-[var(--c-danger-bg)] flex items-center justify-center active:scale-90 transition-transform"
                >
                  <XCircle className="w-4 h-4 text-[var(--c-danger)]" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Client list */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <User className="w-12 h-12 text-[var(--c-muted)] mx-auto mb-3" />
          <p className="text-[var(--c-hint)]">
            {search ? 'Никого не найдено' : 'Нет клиентов'}
          </p>
        </div>
      ) : (
        <div ref={clientListRef} className="overflow-y-auto" style={{ height: Math.min(filtered.length * 60, 500) }}>
          <div style={{ height: `${clientVirtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
            {clientVirtualizer.getVirtualItems().map((virtualRow) => {
              const client = filtered[virtualRow.index];
              return (
                <div
                  key={client.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <ClientRow client={client} onSelect={openDetail} getAge={getAge} isBirthdaySoon={isBirthdaySoon} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============ DETAIL DRAWER ============ */}
      <Drawer
        open={showDetail}
        onClose={() => setShowDetail(false)}
        title={detailClient?.nickname || 'Клиент'}
        size="md"
      >
        {detailClient && (
          <div className="space-y-4">
            {/* Photo + name */}
            <div className="flex flex-col items-center gap-3">
              <div className="w-20 h-20 rounded-full overflow-hidden bg-[var(--c-surface-hover)] flex items-center justify-center">
                {detailClient.photo_url ? (
                  <img src={detailClient.photo_url} alt={detailClient.nickname} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-10 h-10 text-[var(--c-muted)]" />
                )}
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-[var(--c-text)]">{detailClient.nickname}</p>
                {detailClient.client_tier === 'resident' && <Badge variant="success" size="sm">Резидент</Badge>}
                {detailClient.client_tier === 'student' && <Badge variant="accent" size="sm">Студент</Badge>}
              </div>
            </div>

            {/* Info cards */}
            <div className="space-y-2">
              {detailClient.tg_username && (
                <div className="flex items-center gap-3 p-2.5 rounded-xl card">
                  <Send className="w-4 h-4 text-sky-400/60" />
                  <div className="flex-1">
                    <p className="text-[10px] font-semibold text-[var(--c-muted)] uppercase tracking-wider">Telegram</p>
                    <p className="text-[13px] text-sky-400">@{detailClient.tg_username}</p>
                  </div>
                </div>
              )}
              {detailClient.phone && (
                <div className="flex items-center gap-3 p-2.5 rounded-xl card">
                  <Phone className="w-4 h-4 text-[var(--c-hint)]" />
                  <div className="flex-1">
                    <p className="text-[10px] font-semibold text-[var(--c-muted)] uppercase tracking-wider">Телефон</p>
                    <p className="text-[13px] text-[var(--c-text)]">{detailClient.phone}</p>
                  </div>
                </div>
              )}
              {detailClient.birthday && (
                <div className="flex items-center gap-3 p-2.5 rounded-xl card">
                  <Calendar className="w-4 h-4 text-[var(--c-hint)]" />
                  <div className="flex-1">
                    <p className="text-[10px] font-semibold text-[var(--c-muted)] uppercase tracking-wider">День рождения</p>
                    <p className="text-[13px] text-[var(--c-text)]">
                      {formatBirthday(detailClient.birthday)}
                      <span className="text-[var(--c-hint)] ml-2">({getAge(detailClient.birthday)} лет)</span>
                    </p>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 rounded-xl bg-[var(--c-warning-bg)] text-center">
                  <Star className="w-4 h-4 text-[var(--c-warning)] mx-auto mb-1" />
                  <p className="text-lg font-bold text-[var(--c-warning)]">{detailClient.bonus_points}</p>
                  <p className="text-[10px] text-[var(--c-hint)]">Баллов</p>
                </div>
                <div className="p-2.5 rounded-xl card text-center">
                  <CreditCard className="w-4 h-4 text-[var(--c-hint)] mx-auto mb-1" />
                  <p className={`text-lg font-bold ${detailClient.balance < 0 ? 'text-[var(--c-danger)]' : 'text-[var(--c-text)]'}`}>
                    {detailClient.balance}₽
                  </p>
                  <p className="text-[10px] text-[var(--c-hint)]">Баланс</p>
                </div>
              </div>
              <p className="text-[10px] text-[var(--c-muted)] text-center">
                Зарегистрирован: {new Date(detailClient.created_at).toLocaleDateString('ru-RU')}
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                fullWidth
                onClick={() => { setShowDetail(false); openEdit(detailClient); }}
              >
                <Pencil className="w-4 h-4" />
                Редактировать
              </Button>
              <Button
                variant="secondary"
                onClick={() => generateQr(detailClient)}
                title="QR для привязки Telegram"
              >
                <QrCode className="w-4 h-4" />
              </Button>
              <Button
                variant="danger"
                onClick={() => { setShowDetail(false); setDeleteTarget(detailClient); }}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* ============ QR CODE MODAL ============ */}
      {showQr && qrDataUrl && detailClient && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setShowQr(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-xs w-full mx-4 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-black font-bold text-lg mb-1">{detailClient.nickname}</p>
            <p className="text-gray-500 text-xs mb-4">Отсканируйте для привязки Telegram</p>
            <img
              src={qrDataUrl}
              alt="QR"
              className="w-56 h-56 mx-auto rounded-xl"
            />
            <p className="text-gray-400 text-[10px] mt-3 break-all">
              t.me/{WALLET_BOT_USERNAME}?start=link_{detailClient.id.slice(0, 8)}…
            </p>
            <button
              onClick={() => setShowQr(false)}
              className="mt-4 w-full py-2.5 bg-black text-white rounded-xl text-sm font-medium active:scale-[0.97] transition-transform"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}

      {/* ============ EDIT / CREATE DRAWER ============ */}
      <Drawer
        open={showEditor}
        onClose={() => setShowEditor(false)}
        title={editingClient ? 'Редактирование' : 'Новый клиент'}
        size="md"
      >
        <div className="space-y-4">
          {/* Photo */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <div className="w-24 h-24 rounded-full overflow-hidden bg-[var(--c-surface-hover)] flex items-center justify-center">
                {form.photo_url ? (
                  <img src={form.photo_url} alt="Photo" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-10 h-10 text-[var(--c-muted)]" />
                )}
              </div>
              {form.photo_url && (
                <button
                  onClick={() => updateField('photo_url', '')}
                  className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-red-500/80 flex items-center justify-center active:scale-90"
                >
                  <X className="w-3.5 h-3.5 text-white" />
                </button>
              )}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="text-xs text-[var(--c-accent)] font-medium"
            >
              {isUploading ? 'Загрузка...' : form.photo_url ? 'Изменить фото' : 'Загрузить фото'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
          </div>

          <Input
            label="Никнейм"
            placeholder="Имя клиента"
            value={form.nickname}
            onChange={(e) => updateField('nickname', e.target.value)}
          />

          <Input
            label="Telegram"
            placeholder="@username"
            value={form.tg_username}
            onChange={(e) => updateField('tg_username', e.target.value)}
          />

          <Input
            label="Телефон"
            placeholder="+7 999 123-45-67"
            value={form.phone}
            onChange={(e) => updateField('phone', e.target.value)}
            type="tel"
          />

          <Input
            label="Дата рождения"
            type="date"
            value={form.birthday}
            onChange={(e) => updateField('birthday', e.target.value)}
          />

          <Input
            label="Теги для поиска"
            placeholder="Имя, фамилия, прозвище — через запятую"
            value={form.search_tags_text}
            onChange={(e) => updateField('search_tags_text', e.target.value)}
            hint="Всё, по чему можно найти клиента при создании чека"
          />

          {/* Tier selector */}
          <div>
            <p className="text-xs font-medium text-[var(--c-hint)] mb-2">Статус клиента</p>
            <div className="grid grid-cols-3 gap-1.5">
              {([
                { key: 'regular' as ClientTier, label: 'Гость', icon: User },
                { key: 'resident' as ClientTier, label: 'Резидент', icon: Star },
                { key: 'student' as ClientTier, label: 'Студент', icon: GraduationCap },
              ]).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => updateField('client_tier', key)}
                  className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl text-xs font-medium transition-all active:scale-[0.97] ${
                    form.client_tier === key
                      ? 'bg-[var(--c-accent)]/10 border border-[var(--c-accent)]/30 text-[var(--c-accent)]'
                      : 'card border border-[var(--c-border)] text-[var(--c-hint)]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <Button fullWidth size="lg" onClick={handleSave} disabled={!form.nickname.trim()}>
            <Check className="w-5 h-5" />
            {editingClient ? 'Сохранить' : 'Создать'}
          </Button>
        </div>
      </Drawer>

      {/* ============ DELETE CONFIRM ============ */}
      <Drawer
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Удалить клиента?"
        size="sm"
      >
        {deleteTarget && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-2.5 rounded-xl bg-[var(--c-danger-bg)] border border-[var(--c-border)]">
              <div className="w-10 h-10 rounded-full overflow-hidden bg-[var(--c-surface-hover)] flex items-center justify-center shrink-0">
                {deleteTarget.photo_url ? (
                  <img src={deleteTarget.photo_url} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-5 h-5 text-[var(--c-hint)]" />
                )}
              </div>
              <div>
                <p className="text-[13px] font-semibold text-[var(--c-text)]">{deleteTarget.nickname}</p>
                <p className="text-xs text-[var(--c-danger)]">Все данные будут утеряны</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button fullWidth variant="secondary" onClick={() => setDeleteTarget(null)}>Отмена</Button>
              <Button fullWidth variant="danger" onClick={handleDelete}>Удалить</Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
