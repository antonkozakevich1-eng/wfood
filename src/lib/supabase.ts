/**
 * Supabase-клиент.
 *
 * ⚠️ Здесь используются только ПУБЛИЧНЫЕ ключи (VITE_*).
 * Секреты (OpenAI, Gemini, service_role) в клиент не попадают никогда —
 * они живут в Supabase Secrets и используются только Edge Functions.
 *
 * Если переменные не заданы, приложение не падает: клиент возвращает null,
 * и все хуки переключаются в офлайн-режим на локальном сиде.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Настроен ли бэкенд. UI показывает баннер, если нет. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

function createSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) {
    if (import.meta.env.DEV) {
      console.warn(
        '[wfood] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY не заданы. ' +
          'Приложение работает в офлайн-режиме на локальном сиде. ' +
          'Скопируйте .env.local.example → .env.local и заполните значения.',
      );
    }
    return null;
  }

  return createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'wfood-auth',
    },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  });
}

export const supabase = createSupabaseClient();

/**
 * Клиент, который гарантированно существует.
 * Бросает понятную ошибку вместо «cannot read property of null».
 * Используйте в местах, где бэкенд обязателен (мутации избранного и т.п.),
 * и обрабатывайте ошибку через try/catch + toast.
 */
export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'Supabase не настроен. Добавьте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env.local',
    );
  }
  return supabase;
}

/** Базовый URL Edge Functions проекта. */
export function functionsUrl(): string | null {
  if (!supabaseUrl) return null;
  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1`;
}
