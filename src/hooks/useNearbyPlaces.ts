/**
 * Загрузка мест рядом с пагинацией.
 *
 * Состояние живёт в placesStore (нужно между вкладками), а этот хук
 * управляет жизненным циклом: загрузка, догрузка, реакция на смену фильтров.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePlacesStore } from '@/stores/placesStore';
import { useFiltersStore } from '@/stores/filtersStore';
import { fetchNearbyPlaces, sortPlaces } from '@/lib/places';
import { analytics } from '@/lib/analytics';
import type { Coords, Filters, Place, SortOption } from '@/types';

const PAGE_SIZE = 20;

interface UseNearbyPlacesResult {
  places: Place[];
  /** Отфильтрованный и отсортированный список, готовый к рендеру. */
  visible: Place[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  source: string;
  /** Признак работы на локальном сиде (бэкенд недоступен). */
  isOfflineData: boolean;
  hasMore: boolean;
  total: number;
  loadMore: () => void;
  refresh: () => void;
}

export function useNearbyPlaces(coords: Coords): UseNearbyPlacesResult {
  const places = usePlacesStore((s) => s.places);
  const source = usePlacesStore((s) => s.source);
  const loading = usePlacesStore((s) => s.loading);
  const loadingMore = usePlacesStore((s) => s.loadingMore);
  const error = usePlacesStore((s) => s.error);

  const setPlaces = usePlacesStore((s) => s.setPlaces);
  const setLoading = usePlacesStore((s) => s.setLoading);
  const setLoadingMore = usePlacesStore((s) => s.setLoadingMore);
  const setError = usePlacesStore((s) => s.setError);

  const radius = useFiltersStore((s) => s.radius);
  const cuisines = useFiltersStore((s) => s.cuisines);
  const priceLevels = useFiltersStore((s) => s.priceLevels);
  const minRating = useFiltersStore((s) => s.minRating);
  const openNow = useFiltersStore((s) => s.openNow);
  const amenities = useFiltersStore((s) => s.amenities);
  const search = useFiltersStore((s) => s.search);
  const sort = useFiltersStore((s) => s.sort);

  const [page, setPage] = useState(1);

  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  // Собираем объект фильтров мемоизированно: без этого эффект ниже
  // перезапускался бы на каждом рендере (новая ссылка на объект).
  const filters: Filters = useMemo(
    () => ({
      radius,
      cuisines,
      priceLevels,
      minRating,
      openNow,
      amenities,
      search,
      sort,
    }),
    [radius, cuisines, priceLevels, minRating, openNow, amenities, search, sort],
  );

  // Сериализованный ключ: эффект должен реагировать на ИЗМЕНЕНИЕ значений,
  // а не на новую ссылку массива при каждом рендере.
  const filtersKey = useMemo(
    () =>
      [
        filters.radius,
        filters.cuisines.join(','),
        filters.priceLevels.join(','),
        filters.minRating ?? '',
        filters.openNow,
        filters.amenities.join(','),
        filters.search,
        filters.sort,
      ].join('|'),
    [filters],
  );

  const load = useCallback(
    async (opts: { force?: boolean } = {}) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      setLoading(true);
      setError(null);
      setPage(1);

      try {
        const result = await fetchNearbyPlaces(coords, filters, {
          forceRefresh: opts.force,
          signal: controller.signal,
        });

        // Игнорируем устаревшие ответы: пользователь мог уже изменить фильтры.
        if (requestId !== requestIdRef.current) return;

        setPlaces(result.places, result.source);

        if (result.source === 'seed') {
          analytics.dataSourceFallback('seed');
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (requestId !== requestIdRef.current) return;

        console.error('[useNearbyPlaces] Ошибка загрузки:', err);
        setError('Не удалось загрузить заведения. Показываем последние известные.');
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    // filters намеренно не в зависимостях: перезагрузку запускает filtersKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [coords.lat, coords.lng, filtersKey, setLoading, setError, setPlaces],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Клиентская сортировка: применяется поверх серверной выдачи.
  // Даёт мгновенный отклик при смене сортировки (не нужен поход на сервер).
  const visible = useMemo(() => [...places].sort(sortPlaces(sort as SortOption)), [places, sort]);

  const total = visible.length;
  const hasMore = page * PAGE_SIZE < total;

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    // Данные уже в памяти — «догрузка» это просто увеличение окна рендера.
    // Имитирует сетевую паузу, чтобы скелетоны не мигали слишком быстро.
    window.setTimeout(() => {
      setPage((p) => p + 1);
      setLoadingMore(false);
    }, 250);
  }, [hasMore, loadingMore, setLoadingMore]);

  const refresh = useCallback(() => {
    void load({ force: true });
  }, [load]);

  return {
    places,
    visible: visible.slice(0, page * PAGE_SIZE),
    loading,
    loadingMore,
    error,
    source,
    isOfflineData: source === 'seed',
    hasMore,
    total,
    loadMore,
    refresh,
  };
}

export { PAGE_SIZE };
