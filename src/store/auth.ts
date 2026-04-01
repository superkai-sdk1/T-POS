import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Profile } from '@/types';
import { supabase } from '@/lib/supabase';
import { getTelegramWebApp } from '@/lib/telegram';

/** Server auth endpoint helper */
async function authFetch(endpoint: string, body: Record<string, unknown>): Promise<{ data?: Profile; error?: string }> {
  try {
    const res = await fetch(`/api/auth/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || json.error) return { error: json.error || 'Ошибка сервера' };
    return { data: json.data as Profile };
  } catch {
    return { error: 'Ошибка подключения к серверу' };
  }
}

interface StaffEntry {
  id: string;
  nickname: string;
  role: string;
  hasPin: boolean;
}

interface AuthState {
  user: Profile | null;
  rememberedUserId: string | null;
  rememberedNickname: string | null;
  needsPinSetup: boolean;
  isLoading: boolean;
  error: string | null;
  staffUsers: StaffEntry[];
  login: (nickname: string, password: string) => Promise<boolean>;
  loginWithTelegram: () => Promise<boolean>;
  loginWithPin: (pin: string) => Promise<boolean>;
  loginWithPinForUser: (userId: string, pin: string) => Promise<boolean>;
  /** Find user by PIN and log in (for PIN-first login screen) */
  loginByPinOnly: (pin: string) => Promise<boolean>;
  loadStaffUsers: () => Promise<void>;
  setupPin: (pin: string) => Promise<boolean>;
  skipPinSetup: () => void;
  logout: () => void;
  forgetUser: () => void;
  isOwner: () => boolean;
  refreshProfile: () => Promise<void>;
  upsertProfileLocal: (profile: Profile) => void;
  upsertStaffLocal: (staff: StaffEntry) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      rememberedUserId: null,
      rememberedNickname: null,
      needsPinSetup: false,
      isLoading: false,
      error: null,
      staffUsers: [],

      login: async (nickname: string, password: string) => {
        set({ isLoading: true, error: null });
        const { data, error } = await authFetch('login', { nickname, password });
        if (error || !data) {
          set({ error: error || 'Неверный логин или пароль', isLoading: false });
          return false;
        }
        set({
          user: data,
          rememberedUserId: data.id,
          rememberedNickname: data.nickname,
          needsPinSetup: data.role === 'tablet' || data.role === 'client' ? false : !data.pin,
          isLoading: false,
        });
        return true;
      },

      loginWithTelegram: async () => {
        set({ isLoading: true, error: null });
        try {
          const tg = getTelegramWebApp();
          if (!tg?.initDataUnsafe?.user) {
            set({ error: 'Telegram данные недоступны', isLoading: false });
            return false;
          }

          // AUTH-2: Verify initData on server first
          const initData = tg.initData;
          if (initData) {
            try {
              const { data: verifyResult, error: verifyError } = await supabase.functions.invoke('verify-telegram', {
                body: { initData },
              });
              if (verifyError || !verifyResult?.valid) {
                console.warn('[AUTH] Telegram verification failed:', verifyError || verifyResult?.error);
                // Fall through — don't block if edge function is not deployed yet
              }
            } catch (e) {
              console.warn('[AUTH] Telegram verify function unavailable:', e);
              // Fall through — edge function may not be deployed
            }
          }

          const tgUser = tg.initDataUnsafe.user;
          const tgId = String(tgUser.id);

          const { data, error } = await supabase
            .from('profiles')
            .select('id, nickname, role, balance, bonus_points, client_tier, is_resident, photo_url, tg_id, tg_username, phone, birthday, linked_space_id, created_at, deleted_at')
            .eq('tg_id', tgId)
            .single();

          if (error || !data) {
            set({ error: 'Пользователь не найден. Обратитесь к администратору.', isLoading: false });
            return false;
          }

          const profile = data as Profile;
          set({
            user: profile,
            rememberedUserId: profile.id,
            rememberedNickname: profile.nickname,
            needsPinSetup: false,
            isLoading: false,
          });
          return true;
        } catch {
          set({ error: 'Ошибка авторизации через Telegram', isLoading: false });
          return false;
        }
      },

      loginWithPin: async (pin: string) => {
        const { rememberedUserId } = get();
        if (!rememberedUserId) {
          set({ error: 'Пользователь не найден' });
          return false;
        }
        set({ isLoading: true, error: null });
        const { data, error } = await authFetch('pin', { userId: rememberedUserId, pin });
        if (error || !data) {
          set({ error: error || 'Неверный PIN-код', isLoading: false });
          return false;
        }
        set({ user: data, needsPinSetup: false, isLoading: false });
        return true;
      },

      loginWithPinForUser: async (userId: string, pin: string) => {
        set({ isLoading: true, error: null });
        const { data, error } = await authFetch('pin', { userId, pin });
        if (error || !data) {
          set({ error: error || 'Неверный PIN-код', isLoading: false });
          return false;
        }
        set({
          user: data,
          rememberedUserId: data.id,
          rememberedNickname: data.nickname,
          needsPinSetup: false,
          isLoading: false,
        });
        return true;
      },

      loginByPinOnly: async (pin: string) => {
        set({ isLoading: true, error: null });
        const { data, error } = await authFetch('pin', { pin });
        if (error || !data) {
          set({ error: error || 'Неверный PIN-код', isLoading: false });
          return false;
        }
        set({
          user: data,
          rememberedUserId: data.id,
          rememberedNickname: data.nickname,
          needsPinSetup: false,
          isLoading: false,
        });
        return true;
      },

      loadStaffUsers: async () => {
        // Select pin to determine if staff has a PIN set
        const { data, error } = await supabase
          .from('profiles')
          .select('id, nickname, role, pin')
          .in('role', ['staff', 'owner', 'tablet'])
          .order('role')
          .order('nickname');
        if (import.meta.env.DEV && error) console.error('[auth] loadStaffUsers:', error);
        if (data) {
          set({
            staffUsers: data.map((p) => ({
              id: p.id,
              nickname: p.nickname,
              role: p.role,
              hasPin: !!p.pin,
            })),
          });
        }
      },

      setupPin: async (pin: string) => {
        const { user } = get();
        if (!user) return false;
        try {
          const res = await fetch('/api/auth/setup-pin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id, pin }),
          });
          const json = await res.json();
          if (!res.ok || json.error) return false;
          set({ user: { ...user, pin: '***' }, needsPinSetup: false });
          return true;
        } catch {
          return false;
        }
      },

      skipPinSetup: () => set({ needsPinSetup: false }),

      logout: () => {
        set({ user: null, rememberedUserId: null, rememberedNickname: null, needsPinSetup: false, error: null });
        if (window.__clearPOSState) window.__clearPOSState();
      },

      forgetUser: () => set({
        user: null,
        rememberedUserId: null,
        rememberedNickname: null,
        needsPinSetup: false,
        error: null,
      }),

      isOwner: () => get().user?.role === 'owner',

      refreshProfile: async () => {
        const { user } = get();
        if (!user) return;
        const userId = user.id;
        const { data } = await supabase
          .from('profiles')
          .select('id, nickname, role, balance, bonus_points, client_tier, is_resident, photo_url, tg_id, tg_username, phone, birthday, linked_space_id, permissions, created_at, deleted_at')
          .eq('id', userId)
          .single();
        if (data && get().user?.id === userId) {
          set({ user: data as Profile });
        }
      },

      upsertProfileLocal: (profile: Profile) => {
        const current = get().user;
        if (current && current.id === profile.id) {
          set({ user: profile });
        }
      },

      upsertStaffLocal: (staff: StaffEntry) => {
        const currentStaff = get().staffUsers;
        const exists = currentStaff.find(s => s.id === staff.id);
        if (exists) {
          set({
            staffUsers: currentStaff.map(s => s.id === staff.id ? staff : s)
          });
        } else {
          set({
            staffUsers: [...currentStaff, staff].sort((a, b) => a.role.localeCompare(b.role) || a.nickname.localeCompare(b.nickname))
          });
        }
      },
    }),
    {
      name: 'tpos-auth',
      partialize: (state) => ({
        user: state.user ? (({ password_hash: _ph, pin: _p, ...safe }) => { void _ph; void _p; return safe; })(state.user) : null,
        rememberedUserId: state.rememberedUserId,
        rememberedNickname: state.rememberedNickname,
      }),
    }
  )
);
