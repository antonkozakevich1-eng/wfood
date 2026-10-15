/**
 * Места: выдача, избранное, история выборов рулетки.
 *
 * Избранное работает оптимистично: UI меняется мгновенно, а запись в БД
 * уходит в фоне. Если запись падает — состояние откатывается и показывается
 * уведомление, чтобы пользователь не думал, что место сохранено.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '@/lib/supabase';
import type { Place } from '@/types';

interface PlacesState {
  places: Place[];
  source: string;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;

  /** id мест в избранном — Set для быстрой проверки при рендере карточек. */
  favoriteIds: Set<string>;
  favoritesReady: boolean;

  /** История выборов рулетки (последние 50). */
  history: Array<{ place: Place; at: number; accepted: boolean }>;

  setPlaces: (places: Place[], source: string) => void;
  appendPlaces: (places: Place[]) => void;
  setLoading: (loading: boolean) => void;
  setLoadingMore: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setHasMore: (hasMore: boolean) => void;

  loadFavorites: () => Promise<void>;
  toggleFavorite: (place: Place) => Promise<boolean>;
  isFavorite: (placeId: string) => boolean;

  addHistory: (place: Place, accepted: boolean) => void;
  clearHistory: () => void;
}

export const usePlacesStore = create<PlacesState>()((set, get) => ({
  places: [],
  source: 'seed',
  loading: false,
  loadingMore: false,
  error: null,
  hasMore: true,
  favoriteIds: new Set<string>(),
  favoritesReady: false,
  history: [],

  setPlaces: (places, source) => set({ places, source, error: null }),

  appendPlaces: (places) =>
    set((state) => {
      // Защита от дублей: пагинация может пересечься, если данные изменились
      // между запросами (новое место открылось).
      const existing = new Set(state.places.map((p) => p.id));
      const unique = places.filter((p) => !existing.has(p.id));
      return { places: [...state.places, ...unique] };
    }),

  setLoading: (loading) => set({ loading }),
  setLoadingMore: (loadingMore) => set({ loadingMore }),
  setError: (error) => set({ error }),
  setHasMore: (hasMore) => set({ hasMore }),

  loadFavorites: async () => {
    if (!supabase) {
      set({ favoritesReady: true });
      return;
    }

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.user) {
        set({ favoritesReady: true });
        return;
      }

      const { data, error } = await supabase.from('favorites').select('place_id');
      if (error) throw error;

      const ids = new Set((data ?? []).map((row) => (row as { place_id: string }).place_id));
      set({ favoriteIds: ids, favoritesReady: true });
    } catch (err) {
      console.error('[places] Не удалось загрузить избранное:', err);
      set({ favoritesReady: true });
    }
  },

  toggleFavorite: async (place) => {
    const { favoriteIds } = get();
    const wasFavorite = favoriteIds.has(place.id);

    // Оптимистичное обновление: UI не ждёт сети.
    const next = new Set(favoriteIds);
    if (wasFavorite) {
      next.delete(place.id);
    } else {
      next.add(place.id);
    }
    set({ favoriteIds: next });

    if (!supabase) return !wasFavorite;

    try {
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user.id;

      if (!userId) {
        // Без входа избранное живёт только до перезагрузки: честнее показать
        // это пользователю, чем молча потерять данные.
        throw new Error('Войдите, чтобы сохранять избранное между устройствами');
      }

      if (wasFavorite) {
        const { error } = await supabase
          .from('favorites')
          .delete()
          .eq('user_id', userId)
          .eq('place_id', place.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('favorites')
          .insert({ user_id: userId, place_id: place.id });
        // 23505 = unique violation: место уже в избранном, это не ошибка.
        if (error && error.code !== '23505') throw error;
      }

      return !wasFavorite;
    } catch (err) {
      // Откат оптимистичного изменения.
      const rollback = new Set(get().favoriteIds);
      if (wasFavorite) {
        rollback.add(place.id);
      } else {
        rollback.delete(place.id);
      }
      set({ favoriteIds: rollback });
      console.error('[places] Ошибка избранного:', err);
      throw err;
    }
  },

  isFavorite: (placeId) => get().favoriteIds.has(placeId),

  addHistory: (place, accepted) =>
    set((state) => ({
      history: [{ place, at: Date.now(), accepted }, ...state.history].slice(0, 50),
    })),

  clearHistory: () => set({ history: [] }),
}));

/** Persist только истории: список мест и избранное приходят из БД. */
export const historyPersistKey = 'wfood-history';

/** Сериализация Set для persist-middleware невозможна, поэтому историю храним отдельно. */
export const useHistoryStore = create<{
  history: Array<{ place: Place; at: number; accepted: boolean }>;
  add: (place: Place, accepted: boolean) => void;
  clear: () => void;
}>()(
  persist(
    (set) => ({
      history: [],
      add: (place, accepted) =>
        set((state) => ({
          history: [{ place, at: Date.now(), accepted }, ...state.history].slice(0, 50),
        })),
      clear: () => set({ history: [] }),
    }),
    { name: historyPersistKey },
  ),
);
