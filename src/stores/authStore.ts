/**
 * Аутентификация и профиль.
 *
 * Работает и без Supabase: в этом случае пользователь считается гостем,
 * а данные профиля живут только в localStorage.
 */

import { create } from 'zustand';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { identifyUser, resetAnalytics } from '@/lib/analytics';
import type { Language, Profile, Theme } from '@/types';

interface AuthState {
  userId: string | null;
  email: string | null;
  profile: Profile | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;

  init: () => Promise<void>;
  signInWithMagicLink: (email: string) => Promise<void>;
  signInWithOtp: (phone: string) => Promise<void>;
  signInAnonymously: () => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (patch: Partial<Profile>) => Promise<void>;
  setTheme: (theme: Theme) => void;
  setLanguage: (language: Language) => void;
}

/** Локальные настройки для гостевого режима и мгновенного применения темы. */
const LOCAL_PROFILE_KEY = 'wfood-local-profile';

function readLocalProfile(): Partial<Profile> {
  try {
    const raw = localStorage.getItem(LOCAL_PROFILE_KEY);
    return raw ? (JSON.parse(raw) as Partial<Profile>) : {};
  } catch {
    return {};
  }
}

function writeLocalProfile(patch: Partial<Profile>): void {
  try {
    const current = readLocalProfile();
    localStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify({ ...current, ...patch }));
  } catch {
    // Приватный режим Safari может запретить localStorage — не критично.
  }
}

/** Профиль по умолчанию для гостя. */
function guestProfile(): Profile {
  const local = readLocalProfile();
  return {
    id: 'guest',
    username: 'Гость',
    avatar_url: null,
    city: local.city ?? String(import.meta.env.VITE_DEFAULT_CITY ?? 'Tallinn'),
    country: String(import.meta.env.VITE_DEFAULT_COUNTRY ?? 'EE'),
    currency: String(import.meta.env.VITE_DEFAULT_CURRENCY ?? 'EUR'),
    prefs: local.prefs ?? {},
    diet: local.diet ?? null,
    allergies: local.allergies ?? [],
    default_budget: local.default_budget ?? null,
    theme: local.theme ?? 'system',
    language: local.language ?? 'ru',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  userId: null,
  email: null,
  profile: null,
  loading: true,
  initialized: false,
  error: null,

  /** Восстанавливает сессию и подписывается на её изменения. */
  init: async () => {
    if (get().initialized) return;

    if (!isSupabaseConfigured || !supabase) {
      // Гостевой режим без бэкенда: приложение полностью функционально,
      // кроме синхронизации между устройствами.
      set({
        profile: guestProfile(),
        loading: false,
        initialized: true,
      });
      return;
    }

    try {
      const { data } = await supabase.auth.getSession();

      if (data.session?.user) {
        const user = data.session.user;
        set({ userId: user.id, email: user.email ?? null });
        await loadProfile(user.id, set);
      } else {
        set({ profile: guestProfile() });
      }

      // Подписка на изменения сессии (вход/выход в другой вкладке).
      supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
          set({ userId: null, email: null, profile: guestProfile() });
          resetAnalytics();
          return;
        }
        if (session?.user) {
          set({ userId: session.user.id, email: session.user.email ?? null });
          void loadProfile(session.user.id, set);
        }
      });
    } catch (err) {
      console.error('[auth] Ошибка инициализации:', err);
      set({ profile: guestProfile(), error: 'Не удалось восстановить сессию' });
    } finally {
      set({ loading: false, initialized: true });
    }
  },

  signInWithMagicLink: async (email) => {
    if (!supabase) throw new Error('Supabase не настроен');
    set({ loading: true, error: null });

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/profile` },
    });

    set({ loading: false });
    if (error) {
      set({ error: error.message });
      throw new Error(error.message);
    }
  },

  signInWithOtp: async (phone) => {
    if (!supabase) throw new Error('Supabase не настроен');
    set({ loading: true, error: null });

    const { error } = await supabase.auth.signInWithOtp({ phone });

    set({ loading: false });
    if (error) {
      set({ error: error.message });
      throw new Error(error.message);
    }
  },

  /** Анонимный вход: нужен, чтобы работали комнаты и избранное до регистрации. */
  signInAnonymously: async () => {
    if (!supabase) throw new Error('Supabase не настроен');
    set({ loading: true, error: null });

    const { data, error } = await supabase.auth.signInAnonymously();

    set({ loading: false });
    if (error) {
      set({ error: error.message });
      throw new Error(error.message);
    }
    if (data.user) {
      set({ userId: data.user.id, profile: guestProfile() });
      await loadProfile(data.user.id, set);
    }
  },

  signOut: async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    resetAnalytics();
    set({ userId: null, email: null, profile: guestProfile() });
  },

  updateProfile: async (patch) => {
    const { userId, profile } = get();
    const next = { ...(profile ?? guestProfile()), ...patch };

    // Локально применяем всегда — UI обновляется мгновенно.
    set({ profile: next });
    writeLocalProfile(patch);

    if (!supabase || !userId) return;

    const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
    if (error) {
      console.error('[auth] Не удалось сохранить профиль:', error.message);
      throw new Error('Не удалось сохранить настройки');
    }
  },

  /** Тема применяется к <html> и сохраняется локально — работает без бэкенда. */
  setTheme: (theme) => {
    const { profile } = get();
    set({ profile: { ...(profile ?? guestProfile()), theme } });
    writeLocalProfile({ theme });

    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = theme === 'dark' || (theme === 'system' && prefersDark);
    document.documentElement.classList.toggle('dark', isDark);

    const { userId } = get();
    if (supabase && userId) {
      void supabase.from('profiles').update({ theme }).eq('id', userId);
    }
  },

  setLanguage: (language) => {
    const { profile } = get();
    set({ profile: { ...(profile ?? guestProfile()), language } });
    writeLocalProfile({ language });
    document.documentElement.lang = language;

    const { userId } = get();
    if (supabase && userId) {
      void supabase.from('profiles').update({ language }).eq('id', userId);
    }
  },
}));

/** Загружает профиль из БД, создавая его при отсутствии. */
async function loadProfile(
  userId: string,
  set: (partial: Partial<AuthState>) => void,
): Promise<void> {
  if (!supabase) return;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('[auth] Ошибка загрузки профиля:', error.message);
      set({ profile: guestProfile() });
      return;
    }

    if (!data) {
      // Триггер на auth.users должен был создать профиль, но если по какой-то
      // причине его нет — создаём явно.
      const fallback = { ...guestProfile(), id: userId };
      await supabase.from('profiles').insert(fallback);
      set({ profile: fallback });
      return;
    }

    const profile = data as Profile;
    identifyUser(userId, { city: profile.city, language: profile.language });
    set({ profile });
  } catch (err) {
    console.error('[auth] Непредвиденная ошибка загрузки профиля:', err);
    set({ profile: guestProfile() });
  }
}
