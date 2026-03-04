import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Profile } from '@/types';
import { supabase } from '@/lib/supabase';
import { getTelegramWebApp } from '@/lib/telegram';

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
  loadStaffUsers: () => Promise<void>;
  setupPin: (pin: string) => Promise<boolean>;
  skipPinSetup: () => void;
  logout: () => void;
  forgetUser: () => void;
  isOwner: () => boolean;
  refreshProfile: () => Promise<void>;
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
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('nickname', nickname)
            .eq('password_hash', password)
            .single();

          if (error || !data) {
            set({ error: 'Неверный логин или пароль', isLoading: false });
            return false;
          }

          const profile = data as Profile;
          const hasPin = !!profile.pin;

          set({
            user: profile,
            rememberedUserId: profile.id,
            rememberedNickname: profile.nickname,
            needsPinSetup: !hasPin,
            isLoading: false,
          });
          return true;
        } catch {
          set({ error: 'Ошибка подключения', isLoading: false });
          return false;
        }
      },

      loginWithTelegram: async () => {
        set({ isLoading: true, error: null });
        try {
          const tg = getTelegramWebApp();
          if (!tg?.initDataUnsafe?.user) {
            set({ error: 'Telegram данные недоступны', isLoading: false });
            return false;
          }

          const tgUser = tg.initDataUnsafe.user;
          const tgId = String(tgUser.id);

          const { data, error } = await supabase
            .from('profiles')
            .select('*')
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
            needsPinSetup: !profile.pin,
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
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', rememberedUserId)
            .eq('pin', pin)
            .single();

          if (error || !data) {
            set({ error: 'Неверный PIN-код', isLoading: false });
            return false;
          }

          set({ user: data as Profile, needsPinSetup: false, isLoading: false });
          return true;
        } catch {
          set({ error: 'Ошибка подключения', isLoading: false });
          return false;
        }
      },

      loginWithPinForUser: async (userId: string, pin: string) => {
        set({ isLoading: true, error: null });
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .eq('pin', pin)
            .single();

          if (error || !data) {
            set({ error: 'Неверный PIN-код', isLoading: false });
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
          set({ error: 'Ошибка подключения', isLoading: false });
          return false;
        }
      },

      loadStaffUsers: async () => {
        const { data } = await supabase
          .from('profiles')
          .select('id, nickname, role, pin')
          .in('role', ['staff', 'owner'])
          .order('role')
          .order('nickname');
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
        const { error } = await supabase
          .from('profiles')
          .update({ pin })
          .eq('id', user.id);
        if (error) return false;
        set({ user: { ...user, pin }, needsPinSetup: false });
        return true;
      },

      skipPinSetup: () => set({ needsPinSetup: false }),

      logout: () => set({ user: null, needsPinSetup: false, error: null }),

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
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        if (data) {
          set({ user: data as Profile });
        }
      },
    }),
    {
      name: 'tpos-auth',
      partialize: (state) => ({
        user: state.user,
        rememberedUserId: state.rememberedUserId,
        rememberedNickname: state.rememberedNickname,
      }),
    }
  )
);
