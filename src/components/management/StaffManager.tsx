import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Drawer } from '@/components/ui/Drawer';
import { Switch } from '@/components/ui/Switch';
import { UserPlus, Users, Pencil, Trash2, Eye, EyeOff, Search, Crown, ArrowLeft, Shield } from 'lucide-react';
import { hapticFeedback, hapticNotification } from '@/lib/telegram';
import { useOnTableChange } from '@/hooks/useRealtimeSync';
import { useAuthStore } from '@/store/auth';
import { normalizePermissions, ALL_KEYS, type ManagementPermissionKey } from '@/lib/permissions';
import type { Profile, ManagementPermissions } from '@/types';

const PERMISSION_LABELS: Record<ManagementPermissionKey, { label: string; desc: string }> = {
  menu: { label: 'Меню', desc: 'Позиции, модификаторы, разделы' },
  inventory: { label: 'Склад', desc: 'Остатки и ревизии' },
  supplies: { label: 'Поставки', desc: 'История и новые поставки' },
  clients: { label: 'Клиенты', desc: 'Профили, контакты' },
  discounts: { label: 'Скидки', desc: 'Процентные и фиксированные' },
  bonus: { label: 'Бонусы', desc: 'Баллы и настройки' },
  expenses: { label: 'Расходы', desc: 'Аренда, коммуналка' },
  debtors: { label: 'Должники', desc: 'Управление долгами' },
  staff: { label: 'Персонал', desc: 'Сотрудники и доступы' },
  salary: { label: 'Зарплата', desc: 'Начисление и выдача ЗП' },
  about: { label: 'О системе', desc: 'Версия, обновление' },
};

export function StaffManager() {
  const isOwner = useAuthStore((s) => s.isOwner());
  const [staff, setStaff] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [search, setSearch] = useState('');

  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [permissions, setPermissions] = useState<ManagementPermissions>(() =>
    Object.fromEntries(ALL_KEYS.map((k) => [k, true])) as ManagementPermissions
  );
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const loadStaff = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .in('role', ['staff', 'owner'])
      .order('role')
      .order('nickname');
    if (data) setStaff(data as Profile[]);
    setIsLoading(false);
  }, []);

  const profilesTables = useMemo(() => ['profiles'], []);
  useOnTableChange(profilesTables, loadStaff);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  const resetForm = () => {
    setNickname('');
    setPassword('');
    setPinCode('');
    setShowPassword(false);
    setPermissions(Object.fromEntries(ALL_KEYS.map((k) => [k, true])) as ManagementPermissions);
    setError('');
    setSelected(null);
  };

  const handleAdd = async () => {
    if (!nickname.trim()) { setError('Введите никнейм'); return; }
    if (!password.trim()) { setError('Введите пароль'); return; }
    if (isSaving) return;
    setError('');
    setIsSaving(true);

    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('nickname', nickname.trim())
      .maybeSingle();

    if (existing) {
      setError('Такой никнейм уже существует');
      setIsSaving(false);
      return;
    }

    const insertData: Record<string, unknown> = {
      nickname: nickname.trim(),
      password_hash: password,
      role: 'staff',
      is_resident: false,
    };
    if (pinCode.trim() && /^\d{4}$/.test(pinCode.trim())) {
      insertData.pin = pinCode.trim();
    }
    const { error: insertErr } = await supabase.from('profiles').insert(insertData);

    if (insertErr) {
      setError('Ошибка при создании');
      setIsSaving(false);
      return;
    }

    hapticNotification('success');
    setIsSaving(false);
    setShowAdd(false);
    resetForm();
    loadStaff();
  };

  const openEdit = (p: Profile) => {
    setSelected(p);
    setNickname(p.nickname);
    setPassword('');
    setPinCode(p.pin || '');
    setPermissions(normalizePermissions(p.permissions));
    setShowEdit(true);
    setError('');
  };

  const handleSaveEdit = async () => {
    if (!selected || isSaving) return;
    if (!nickname.trim()) { setError('Введите никнейм'); return; }
    setError('');
    setIsSaving(true);

    const updates: Record<string, unknown> = { nickname: nickname.trim() };
    if (password.trim()) {
      updates.password_hash = password.trim();
    }
    if (pinCode.trim()) {
      if (pinCode.trim().length !== 4 || !/^\d{4}$/.test(pinCode.trim())) {
        setError('PIN-код должен быть 4 цифры');
        setIsSaving(false);
        return;
      }
      updates.pin = pinCode.trim();
    } else if (selected.pin) {
      updates.pin = null;
    }

    if (selected.role === 'staff' && isOwner) {
      const hasAll = ALL_KEYS.every((k) => permissions[k] !== false);
      updates.permissions = hasAll ? null : permissions;
    }

    const { error: updErr } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', selected.id);

    if (updErr) {
      setError(updErr.message.includes('unique') ? 'Такой никнейм уже занят' : 'Ошибка сохранения');
      setIsSaving(false);
      return;
    }

    hapticNotification('success');
    setIsSaving(false);
    setShowEdit(false);
    resetForm();
    loadStaff();
  };

  const handleDelete = async () => {
    if (!selected || isSaving) return;
    setIsSaving(true);
    hapticFeedback('heavy');

    const { error: delErr } = await supabase
      .from('profiles')
      .delete()
      .eq('id', selected.id);

    if (delErr) {
      setError('Невозможно удалить (есть связанные данные)');
      setIsSaving(false);
      return;
    }

    hapticNotification('warning');
    setIsSaving(false);
    setShowEdit(false);
    resetForm();
    loadStaff();
  };

  const togglePermission = (key: ManagementPermissionKey, value: boolean) => {
    setPermissions((prev) => ({ ...prev, [key]: value }));
  };

  const filtered = search
    ? staff.filter((s) => s.nickname.toLowerCase().includes(search.toLowerCase()))
    : staff;

  if (isLoading) {
    return (
      <div className="space-y-3 py-4">
        {[1, 2, 3, 4].map((i) => <div key={i} className="h-16 rounded-xl skeleton" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--c-hint)]">
          {staff.filter((s) => s.role === 'owner').length} владельцев · {staff.filter((s) => s.role === 'staff').length} сотрудников
        </p>
        <Button size="sm" onClick={() => { resetForm(); setShowAdd(true); }}>
          <UserPlus className="w-4 h-4" />
          Добавить
        </Button>
      </div>

      {staff.length > 3 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--c-hint)]" />
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
          <Users className="w-16 h-16 text-[var(--c-muted)] mx-auto mb-4" />
          <p className="text-[var(--c-hint)]">
            {staff.length === 0 ? 'Нет сотрудников' : 'Никого не найдено'}
          </p>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((p) => {
          const isOwnerRole = p.role === 'owner';
          const permCount = p.permissions
            ? ALL_KEYS.filter((k) => p.permissions![k] !== false).length
            : ALL_KEYS.length;
          return (
            <button
              key={p.id}
              onClick={() => openEdit(p)}
              className="w-full flex items-center gap-3 p-2.5 rounded-xl card-interactive"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isOwnerRole ? 'bg-[var(--c-warning-bg)]' : 'bg-[var(--c-accent)]/15'
              }`}>
                {isOwnerRole ? (
                  <Crown className="w-4.5 h-4.5 text-[var(--c-warning)]" />
                ) : (
                  <span className="text-sm font-bold text-[var(--c-accent)]">
                    {p.nickname.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="text-left flex-1 min-w-0">
                <p className="font-semibold text-[13px] text-[var(--c-text)] truncate">{p.nickname}</p>
                <div className="flex gap-1.5 mt-0.5 flex-wrap">
                  {isOwnerRole ? (
                    <Badge variant="warning" size="sm">Владелец</Badge>
                  ) : (
                    <>
                      <Badge size="sm">Сотрудник</Badge>
                      {permCount < ALL_KEYS.length && (
                        <Badge variant="accent" size="sm">{permCount}/{ALL_KEYS.length}</Badge>
                      )}
                    </>
                  )}
                  {p.pin && <Badge variant="success" size="sm">PIN</Badge>}
                  {p.tg_id && <Badge variant="accent" size="sm">TG</Badge>}
                  {p.password_hash && <Badge size="sm">Пароль</Badge>}
                </div>
              </div>
              <Pencil className="w-4 h-4 text-[var(--c-muted)] shrink-0" />
            </button>
          );
        })}
      </div>

      {/* Add staff drawer */}
      <Drawer open={showAdd} onClose={() => { setShowAdd(false); resetForm(); }} title="Новый сотрудник" size="sm">
        <div className="space-y-4">
          <p className="text-xs text-[var(--c-hint)]">
            Новые сотрудники получают полный доступ ко всем разделам управления по умолчанию.
          </p>
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
              className="absolute right-3 top-[38px] text-[var(--c-hint)] hover:text-[var(--c-hint)]"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <Input
            label="PIN-код (4 цифры)"
            placeholder="Для быстрого входа"
            value={pinCode}
            onChange={(e) => setPinCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
            maxLength={4}
            inputMode="numeric"
          />
          {error && (
            <p className="text-[13px] text-[var(--c-danger)] bg-[var(--c-danger-bg)] rounded-lg px-3 py-2">{error}</p>
          )}
          <Button fullWidth size="lg" onClick={handleAdd}>
            <UserPlus className="w-5 h-5" />
            Создать сотрудника
          </Button>
        </div>
      </Drawer>

      {/* Edit staff drawer — full interface with permissions */}
      <Drawer open={showEdit} onClose={() => { setShowEdit(false); resetForm(); }} title="Редактирование профиля" size="lg">
        <div className="space-y-6">
          {selected?.role === 'owner' && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[var(--c-warning-bg)] border border-[var(--c-border)]">
              <Crown className="w-4 h-4 text-[var(--c-warning)] shrink-0" />
              <span className="text-xs font-semibold text-[var(--c-warning)]">Владелец — полный доступ ко всем разделам</span>
            </div>
          )}

          <div>
            <h3 className="text-[11px] font-semibold text-[var(--c-hint)] uppercase tracking-wider mb-2">Учётные данные</h3>
            <div className="space-y-3">
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
                  className="absolute right-3 top-[38px] text-[var(--c-hint)] hover:text-[var(--c-hint)]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <Input
                label="PIN-код (4 цифры)"
                placeholder="Для быстрого входа"
                value={pinCode}
                onChange={(e) => setPinCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                maxLength={4}
                inputMode="numeric"
              />
            </div>
          </div>

          {selected?.role === 'staff' && isOwner && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-[var(--c-accent)]" />
                <h3 className="text-[11px] font-semibold text-[var(--c-hint)] uppercase tracking-wider">
                  Доступ к разделам управления
                </h3>
              </div>
              <p className="text-xs text-[var(--c-muted)] mb-3">
                Касса и аналитика доступны всегда. Включите или отключите доступ к остальным разделам.
              </p>
              <div className="space-y-2">
                {ALL_KEYS.map((key) => (
                  <Switch
                    key={key}
                    checked={permissions[key] !== false}
                    onCheckedChange={(v) => togglePermission(key, v)}
                    label={PERMISSION_LABELS[key].label}
                    description={PERMISSION_LABELS[key].desc}
                  />
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="text-[13px] text-[var(--c-danger)] bg-[var(--c-danger-bg)] rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-2 pt-2">
            <Button fullWidth onClick={handleSaveEdit}>
              Сохранить
            </Button>
            {selected?.role !== 'owner' && (
              <Button variant="danger" onClick={handleDelete}>
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </Drawer>
    </div>
  );
}
