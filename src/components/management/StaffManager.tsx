import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Drawer } from '@/components/ui/Drawer';
import { UserPlus, Users, Pencil, Trash2, Eye, EyeOff, Search } from 'lucide-react';
import { hapticFeedback, hapticNotification } from '@/lib/telegram';
import type { Profile } from '@/types';

export function StaffManager() {
  const [staff, setStaff] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [search, setSearch] = useState('');

  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const loadStaff = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'staff')
      .not('password_hash', 'is', null)
      .order('nickname');
    if (data) setStaff(data as Profile[]);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  const resetForm = () => {
    setNickname('');
    setPassword('');
    setShowPassword(false);
    setError('');
    setSelected(null);
  };

  const handleAdd = async () => {
    if (!nickname.trim()) { setError('Введите никнейм'); return; }
    if (!password.trim()) { setError('Введите пароль'); return; }
    setError('');

    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('nickname', nickname.trim())
      .maybeSingle();

    if (existing) {
      setError('Такой никнейм уже существует');
      return;
    }

    const { error: insertErr } = await supabase.from('profiles').insert({
      nickname: nickname.trim(),
      password_hash: password,
      role: 'staff',
      is_resident: false,
    });

    if (insertErr) {
      setError('Ошибка при создании');
      return;
    }

    hapticNotification('success');
    setShowAdd(false);
    resetForm();
    loadStaff();
  };

  const openEdit = (p: Profile) => {
    setSelected(p);
    setNickname(p.nickname);
    setPassword('');
    setShowEdit(true);
    setError('');
  };

  const handleSaveEdit = async () => {
    if (!selected) return;
    if (!nickname.trim()) { setError('Введите никнейм'); return; }
    setError('');

    const updates: Record<string, unknown> = { nickname: nickname.trim() };
    if (password.trim()) {
      updates.password_hash = password.trim();
    }

    const { error: updErr } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', selected.id);

    if (updErr) {
      setError(updErr.message.includes('unique') ? 'Такой никнейм уже занят' : 'Ошибка сохранения');
      return;
    }

    hapticNotification('success');
    setShowEdit(false);
    resetForm();
    loadStaff();
  };

  const handleDelete = async () => {
    if (!selected) return;
    hapticFeedback('heavy');

    const { error: delErr } = await supabase
      .from('profiles')
      .delete()
      .eq('id', selected.id);

    if (delErr) {
      setError('Невозможно удалить (есть связанные данные)');
      return;
    }

    hapticNotification('warning');
    setShowEdit(false);
    resetForm();
    loadStaff();
  };

  const filtered = search
    ? staff.filter((s) => s.nickname.toLowerCase().includes(search.toLowerCase()))
    : staff;

  if (isLoading) {
    return (
      <div className="text-center py-16">
        <div className="w-8 h-8 border-2 border-[var(--tg-theme-button-color,#6c5ce7)] border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--tg-theme-hint-color,#888)]">{staff.length} сотрудников</p>
        <Button size="sm" onClick={() => { resetForm(); setShowAdd(true); }}>
          <UserPlus className="w-4 h-4" />
          Добавить
        </Button>
      </div>

      {staff.length > 3 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <Input
            placeholder="Поиск..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      )}

      {filtered.length === 0 && (
        <div className="text-center py-12">
          <Users className="w-16 h-16 text-white/5 mx-auto mb-4" />
          <p className="text-[var(--tg-theme-hint-color,#888)]">
            {staff.length === 0 ? 'Нет сотрудников' : 'Никого не найдено'}
          </p>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((p) => (
          <button
            key={p.id}
            onClick={() => openEdit(p)}
            className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/8 transition-all active:scale-[0.98]"
          >
            <div className="w-10 h-10 rounded-xl bg-[var(--tg-theme-button-color,#6c5ce7)]/15 flex items-center justify-center shrink-0">
              <span className="text-sm font-bold text-[var(--tg-theme-button-color,#6c5ce7)]">
                {p.nickname.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="text-left flex-1 min-w-0">
              <p className="font-semibold text-sm text-[var(--tg-theme-text-color,#e0e0e0)] truncate">{p.nickname}</p>
              <div className="flex gap-1.5 mt-0.5">
                <Badge>Сотрудник</Badge>
                {p.password_hash && <Badge variant="success">Пароль задан</Badge>}
              </div>
            </div>
            <Pencil className="w-4 h-4 text-white/20 shrink-0" />
          </button>
        ))}
      </div>

      {/* Add staff drawer */}
      <Drawer open={showAdd} onClose={() => { setShowAdd(false); resetForm(); }} title="Новый сотрудник">
        <div className="space-y-4">
          <Input
            label="Никнейм"
            placeholder="Имя для входа"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            autoFocus
          />
          <div className="relative">
            <Input
              label="Пароль"
              type={showPassword ? 'text' : 'password'}
              placeholder="Пароль для входа"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-[38px] text-white/30 hover:text-white/60"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
          )}
          <Button fullWidth size="lg" onClick={handleAdd}>
            <UserPlus className="w-5 h-5" />
            Создать сотрудника
          </Button>
        </div>
      </Drawer>

      {/* Edit staff drawer */}
      <Drawer open={showEdit} onClose={() => { setShowEdit(false); resetForm(); }} title="Редактирование">
        <div className="space-y-4">
          <Input
            label="Никнейм"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            autoFocus
          />
          <div className="relative">
            <Input
              label="Новый пароль"
              type={showPassword ? 'text' : 'password'}
              placeholder="Оставьте пустым чтобы не менять"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-[38px] text-white/30 hover:text-white/60"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
          )}
          <div className="flex gap-2">
            <Button fullWidth onClick={handleSaveEdit}>
              Сохранить
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
