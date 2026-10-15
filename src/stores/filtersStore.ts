/**
 * Фильтры вкладки «Рядом» и «Рулетка».
 *
 * Отдельный store, а не Context: изменение радиуса или кухни не должно
 * ререндерить карту целиком. Zustand с селекторами это гарантирует.
 *
 * Фильтры переживают перезагрузку (persist в localStorage): пользователь
 * не должен заново выбирать «только веганское» после каждого открытия.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DEFAULT_FILTERS,
  type AmenityKey,
  type Filters,
  type PriceLevel,
  type SortOption,
} from '@/types';

interface FiltersState extends Filters {
  /** Открыт ли bottom sheet с полными фильтрами. */
  sheetOpen: boolean;

  setRadius: (radius: number) => void;
  toggleCuisine: (cuisine: string) => void;
  setCuisines: (cuisines: string[]) => void;
  togglePriceLevel: (level: PriceLevel) => void;
  setMinRating: (rating: number | null) => void;
  toggleOpenNow: () => void;
  toggleAmenity: (amenity: AmenityKey) => void;
  setSearch: (search: string) => void;
  setSort: (sort: SortOption) => void;
  setSheetOpen: (open: boolean) => void;
  reset: () => void;
  /** Сколько фильтров активно — для бейджа на кнопке. */
  activeCount: () => number;
  /** Сериализованные фильтры для аналитики. */
  toAnalytics: () => Record<string, unknown>;
}

function toggleInArray<T>(array: T[], value: T): T[] {
  return array.includes(value) ? array.filter((v) => v !== value) : [...array, value];
}

export const useFiltersStore = create<FiltersState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_FILTERS,
      sheetOpen: false,

      setRadius: (radius) => set({ radius }),

      toggleCuisine: (cuisine) =>
        set((state) => ({ cuisines: toggleInArray(state.cuisines, cuisine) })),

      setCuisines: (cuisines) => set({ cuisines }),

      togglePriceLevel: (level) =>
        set((state) => ({ priceLevels: toggleInArray(state.priceLevels, level) })),

      setMinRating: (minRating) => set({ minRating }),

      toggleOpenNow: () => set((state) => ({ openNow: !state.openNow })),

      toggleAmenity: (amenity) =>
        set((state) => ({ amenities: toggleInArray(state.amenities, amenity) })),

      setSearch: (search) => set({ search }),

      setSort: (sort) => set({ sort }),

      setSheetOpen: (sheetOpen) => set({ sheetOpen }),

      reset: () => set({ ...DEFAULT_FILTERS, sheetOpen: false }),

      activeCount: () => {
        const state = get();
        let count = 0;
        if (state.radius !== DEFAULT_FILTERS.radius) count += 1;
        if (state.cuisines.length > 0) count += 1;
        if (state.priceLevels.length > 0) count += 1;
        if (state.minRating !== null) count += 1;
        if (state.openNow) count += 1;
        if (state.amenities.length > 0) count += 1;
        if (state.sort !== DEFAULT_FILTERS.sort) count += 1;
        return count;
      },

      toAnalytics: () => {
        const state = get();
        return {
          radius: state.radius,
          cuisines: state.cuisines,
          price_levels: state.priceLevels,
          min_rating: state.minRating,
          open_now: state.openNow,
          amenities: state.amenities,
          sort: state.sort,
        };
      },
    }),
    {
      name: 'wfood-filters',
      // sheetOpen — состояние UI, его не нужно восстанавливать между сессиями.
      partialize: (state) => ({
        radius: state.radius,
        cuisines: state.cuisines,
        priceLevels: state.priceLevels,
        minRating: state.minRating,
        openNow: state.openNow,
        amenities: state.amenities,
        sort: state.sort,
      }),
    },
  ),
);
