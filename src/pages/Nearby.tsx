/**
 * Вкладка «Рядом» — главный экран приложения.
 *
 * Композиция: карта сверху (40dvh), bottom sheet со списком снизу,
 * липкая строка фильтров и поиск между ними.
 *
 * Бесконечная прокрутка реализована через IntersectionObserver:
 * он надёжнее, чем обработчик scroll, и не заставляет браузер
 * пересчитывать layout на каждое движение.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { List, Map as MapIcon, RefreshCw, Search } from 'lucide-react';import { Header } from '@/components/layout/Header';
import { EmptyState, GeolocationBanner, OfflineBanner, SetupBanner } from '@/components/layout/EmptyState';
import { PlaceCard } from '@/components/place/PlaceCard';
import { PlaceDetails } from '@/components/place/PlaceDetails';
import { LazyMap } from '@/components/map/LazyMap';
import { ActiveFilterChips, FilterBar, FilterSheet } from '@/components/filters/FilterBar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PlaceListSkeleton } from '@/components/ui/skeleton';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useNearbyPlaces } from '@/hooks/useNearbyPlaces';
import { useFiltersStore } from '@/stores/filtersStore';
import { usePlacesStore } from '@/stores/placesStore';
import { isSupabaseConfigured } from '@/lib/supabase';
import { analytics } from '@/lib/analytics';
import { toast } from '@/hooks/useToast';
import { cn, debounce } from '@/lib/utils';
import type { Place } from '@/types';

export default function Nearby() {
  const navigate = useNavigate();
  const { placeId: routePlaceId } = useParams<{ placeId?: string }>();

  const { effectiveCoords, isFallback, denied, request: requestLocation } = useGeolocation();
  const { visible, loading, loadingMore, error, isOfflineData, total, hasMore, loadMore, refresh } =
    useNearbyPlaces(effectiveCoords);

  const search = useFiltersStore((s) => s.search);
  const setSearch = useFiltersStore((s) => s.setSearch);
  const radius = useFiltersStore((s) => s.radius);

  const favoriteIds = usePlacesStore((s) => s.favoriteIds);
  const loadFavorites = usePlacesStore((s) => s.loadFavorites);
  const toggleFavorite = usePlacesStore((s) => s.toggleFavorite);

  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [mapVisible, setMapVisible] = useState(true);
  /** Локальное состояние поиска: инпут должен отзываться мгновенно. */
  const [searchInput, setSearchInput] = useState(search);

  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadFavorites();
  }, [loadFavorites]);

  // Открытие деталей по прямой ссылке /place/:id
  useEffect(() => {
    if (!routePlaceId || visible.length === 0) return;
    const found = visible.find((p) => p.id === routePlaceId);
    if (found) {
      setSelectedPlace(found);
      setDetailsOpen(true);
    }
  }, [routePlaceId, visible]);

  // Дебаунс поиска: не дёргаем фильтрацию на каждую букву.
  const debouncedSetSearch = useMemo(
    () =>
      debounce((value: string) => {
        setSearch(value);
      }, 300),
    [setSearch],
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchInput(value);
      debouncedSetSearch(value);
    },
    [debouncedSetSearch],
  );

  const handleOpenPlace = useCallback(
    (place: Place) => {
      setSelectedPlace(place);
      setDetailsOpen(true);
      analytics.placeOpened(place, 'list');
    },
    [],
  );

  const handleSelectOnMap = useCallback((place: Place) => {
    setSelectedPlace(place);
  }, []);

  const handleToggleFavorite = useCallback(
    async (place: Place) => {
      const wasFavorite = favoriteIds.has(place.id);
      try {
        await toggleFavorite(place);
        analytics.favoriteToggled(place, !wasFavorite);
        toast.success(wasFavorite ? 'Убрано из избранного' : 'Добавлено в избранное');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Не удалось сохранить');
      }
    },
    [favoriteIds, toggleFavorite],
  );

  const handleAskAi = useCallback(
    (place: Place) => {
      // Передаём название места в чат через sessionStorage: так вкладка «ИИ»
      // подхватит контекст без глобального состояния и без изменения URL.
      sessionStorage.setItem('wfood-ai-prefill', `Расскажи подробнее про «${place.name}»`);
      navigate('/ai');
    },
    [navigate],
  );

  // Бесконечная прокрутка
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: '300px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  return (
    <div className="flex flex-1 flex-col pb-nav">
      <Header
        title="Рядом"
        subtitle={isFallback ? 'Таллинн, центр' : 'Ваше местоположение'}
        action={
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setMapVisible((v) => !v)}
              aria-label={mapVisible ? 'Скрыть карту' : 'Показать карту'}
            >
              {mapVisible ? <List className="h-5 w-5" /> : <MapIcon className="h-5 w-5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={refresh}
              disabled={loading}
              aria-label="Обновить список"
            >
              <RefreshCw className={cn('h-5 w-5', loading && 'animate-spin')} />
            </Button>
          </div>
        }
      />

      {/* Карта */}
      {mapVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="relative h-[38dvh] min-h-[220px] w-full shrink-0 overflow-hidden"
        >
          <LazyMap
            places={visible}
            center={effectiveCoords}
            selectedPlaceId={selectedPlace?.id ?? null}
            onSelectPlace={handleSelectOnMap}
            radius={radius}
            showUserLocation={!isFallback}
            className="h-full w-full"
          />

          {/* Кнопка «в центр» */}
          {isFallback && (
            <button
              type="button"
              onClick={requestLocation}
              className="absolute bottom-3 left-3 z-[400] flex h-9 items-center gap-1.5 rounded-full bg-card px-3.5 text-xs font-medium shadow-card"
            >
              📍 Моё местоположение
            </button>
          )}
        </motion.div>
      )}

      {/* Список */}
      <div className="flex flex-1 flex-col gap-3 rounded-t-3xl bg-background px-4 pt-3">
        {/* Поиск */}
        <Input
          value={searchInput}
          onChange={(e) => handleSearchChange(e.target.value)}
          onClear={() => handleSearchChange('')}
          placeholder="Поиск: название, кухня, тег..."
          icon={<Search className="h-4 w-4" />}
          type="search"
          aria-label="Поиск заведений"
        />

        <FilterBar totalCount={total} />
        <ActiveFilterChips />

        {/* Баннеры состояния */}
        {!isSupabaseConfigured && <SetupBanner />}
        {denied && <GeolocationBanner onRetry={requestLocation} />}
        {isOfflineData && <OfflineBanner onRetry={refresh} />}

        {error && (
          <div role="alert" className="rounded-2xl bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive">
            {error}
          </div>
        )}

        {/* Список мест */}
        {loading && visible.length === 0 ? (
          <PlaceListSkeleton count={5} />
        ) : visible.length === 0 ? (
          <EmptyState
            emoji="🔍"
            title="Ничего не нашлось"
            description="Попробуйте увеличить радиус или снять часть фильтров — в Таллинне точно есть, где поесть."
            action={{
              label: 'Сбросить фильтры',
              onClick: () => {
                useFiltersStore.getState().reset();
                setSearchInput('');
              },
            }}
          />
        ) : (
          <>
            <ul className="flex flex-col gap-2.5" aria-label="Список заведений">
              {visible.map((place) => (
                <li key={place.id}>
                  <PlaceCard
                    place={place}
                    isFavorite={favoriteIds.has(place.id)}
                    onOpen={handleOpenPlace}
                    onToggleFavorite={handleToggleFavorite}
                    onAskAi={handleAskAi}
                  />
                </li>
              ))}
            </ul>

            {/* Триггер бесконечной прокрутки */}
            <div ref={sentinelRef} className="h-4" aria-hidden="true" />

            {loadingMore && <PlaceListSkeleton count={2} />}

            {!hasMore && visible.length > 0 && (
              <p className="py-4 text-center text-xs text-muted-foreground">
                Это все {total === 1 ? 'место' : 'места'} в радиусе. Расширьте радиус, чтобы увидеть больше.
              </p>
            )}
          </>
        )}
      </div>

      <FilterSheet places={visible} />

      <PlaceDetails
        place={selectedPlace}
        open={detailsOpen}
        onClose={() => {
          setDetailsOpen(false);
          // Убираем id из URL, чтобы «назад» не открывал карточку снова.
          if (routePlaceId) navigate('/nearby', { replace: true });
        }}
        isFavorite={selectedPlace ? favoriteIds.has(selectedPlace.id) : false}
        onToggleFavorite={handleToggleFavorite}
        onAskAi={handleAskAi}
      />
    </div>
  );
}
