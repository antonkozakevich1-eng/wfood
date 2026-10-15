/**
 * Вкладка «Рулетка» — главный «залипательный» экран.
 *
 * Сценарий: открыл → нажал КРУТИТЬ → получил место → «Идём сюда».
 * Всё должно укладываться в 10 секунд.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Dices, SlidersHorizontal } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { EmptyState, GeolocationBanner, OfflineBanner } from '@/components/layout/EmptyState';
import { RouletteWheel } from '@/components/roulette/RouletteWheel';
import { RouletteResult } from '@/components/roulette/RouletteResult';
import { Confetti } from '@/components/roulette/Confetti';
import { FilterSheet } from '@/components/filters/FilterBar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useNearbyPlaces } from '@/hooks/useNearbyPlaces';
import { useRoulette, SPIN_DURATION_MS } from '@/hooks/useRoulette';
import { useFiltersStore } from '@/stores/filtersStore';
import { usePlacesStore } from '@/stores/placesStore';
import { toast } from '@/hooks/useToast';
import { analytics } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import { radiusLabel } from '@/lib/geo';
import type { Place } from '@/types';

export default function Roulette() {
  const navigate = useNavigate();
  const { effectiveCoords, denied, request: requestLocation } = useGeolocation();
  const { visible, loading, isOfflineData, refresh } = useNearbyPlaces(effectiveCoords);

  const { pool, result, spinning, showResult, attempts, spin, reset, accept, excludeCurrent } =
    useRoulette();

  const favoriteIds = usePlacesStore((s) => s.favoriteIds);
  const loadFavorites = usePlacesStore((s) => s.loadFavorites);
  const toggleFavorite = usePlacesStore((s) => s.toggleFavorite);

  const radius = useFiltersStore((s) => s.radius);
  const activeCount = useFiltersStore((s) => s.activeCount());
  const setSheetOpen = useFiltersStore((s) => s.setSheetOpen);

  /** Угол поворота накопительно — иначе колесо «прыгает» назад. */
  const [rotation, setRotation] = useState(0);
  const [winnerIndex, setWinnerIndex] = useState<number | null>(null);
  const [confettiTrigger, setConfettiTrigger] = useState(0);

  const spinStartRef = useRef<number>(0);

  useEffect(() => {
    void loadFavorites();
  }, [loadFavorites]);

  const handleSpin = useCallback(() => {
    if (spinning || pool.length === 0) return;

    spinStartRef.current = Date.now();

    // Секторы на колесе — первые 8 из пула. Победитель определяется в useRoulette,
    // поэтому выбираем угол заранее так, чтобы указатель встал на случайный сектор.
    const sectorCount = Math.min(pool.length, 8);
    const targetSector = Math.floor(Math.random() * sectorCount);
    const sectorAngle = 360 / sectorCount;

    // 5 полных оборотов + доворот до нужного сектора.
    // -sectorAngle/2 центрирует указатель на середине сектора.
    const extraTurns = 5 * 360;
    const targetAngle = extraTurns + (360 - (targetSector * sectorAngle + sectorAngle / 2));

    setWinnerIndex(null);
    setRotation((prev) => {
      // Приводим текущий угол к «нулевому» циклу и добавляем новый оборот.
      const normalized = prev % 360;
      return prev - normalized + targetAngle + (normalized > targetAngle ? 360 : 0);
    });

    spin();

    // Подсветка победителя появляется вместе с результатом.
    window.setTimeout(() => {
      setWinnerIndex(targetSector);
      setConfettiTrigger((n) => n + 1);
    }, SPIN_DURATION_MS);
  }, [spinning, pool.length, spin]);

  const handleAccept = useCallback(() => {
    accept();
    if (!result) return;
    toast.success(`Отличный выбор! ${result.name} ждёт вас 🎉`, {
      action: {
        label: 'Маршрут',
        onClick: () =>
          window.open(
            `https://www.google.com/maps/dir/?api=1&destination=${result.lat},${result.lng}&travelmode=walking`,
            '_blank',
            'noopener',
          ),
      },
    });
  }, [accept, result]);

  const handleRetry = useCallback(() => {
    excludeCurrent();
    setWinnerIndex(null);
    handleSpin();
  }, [excludeCurrent, handleSpin]);

  const handleAskAi = useCallback(() => {
    if (!result) return;
    sessionStorage.setItem(
      'wfood-ai-prefill',
      `Рулетка выбрала «${result.name}». Расскажи, что там стоит заказать и подходит ли это место?`,
    );
    navigate('/ai');
  }, [navigate, result]);

  const handleToggleFavorite = useCallback(async () => {
    if (!result) return;
    const wasFavorite = favoriteIds.has(result.id);
    try {
      await toggleFavorite(result);
      analytics.favoriteToggled(result, !wasFavorite);
      toast.success(wasFavorite ? 'Убрано из избранного' : 'Добавлено в избранное');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось сохранить');
    }
  }, [result, favoriteIds, toggleFavorite]);

  return (
    <div className="flex flex-1 flex-col pb-nav">
      <Header
        title="Рулетка"
        subtitle="Не можете решить? Пусть решит случай"
        action={
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setSheetOpen(true)}
            aria-label="Фильтры рулетки"
            className="relative"
          >
            <SlidersHorizontal className="h-5 w-5" />
            {activeCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                {activeCount}
              </span>
            )}
          </Button>
        }
      />

      <Confetti trigger={confettiTrigger} />

      <div className="flex flex-1 flex-col items-center gap-5 px-4 py-5">
        {denied && <GeolocationBanner onRetry={requestLocation} />}
        {isOfflineData && <OfflineBanner onRetry={refresh} />}

        {/* Инфо о пуле */}
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <Badge variant="muted">📍 {radiusLabel(radius)}</Badge>
          <Badge variant="muted">
            {loading ? 'Ищем...' : `${pool.length} ${pool.length === 1 ? 'вариант' : 'вариантов'}`}
          </Badge>
          {attempts > 0 && <Badge variant="muted">Попыток: {attempts}</Badge>}
        </div>

        {pool.length === 0 && !loading ? (
          <EmptyState
            emoji="🎯"
            title="Не из чего выбирать"
            description="Под текущие фильтры не попалось ни одного заведения. Расширьте радиус или уберите фильтры."
            action={{
              label: 'Открыть фильтры',
              onClick: () => setSheetOpen(true),
            }}
            secondaryAction={{
              label: 'К списку мест',
              onClick: () => navigate('/nearby'),
            }}
          />
        ) : (
          <>
            <RouletteWheel
              pool={pool}
              spinning={spinning}
              rotation={rotation}
              duration={SPIN_DURATION_MS}
              winnerIndex={winnerIndex}
              size={Math.min(280, typeof window !== 'undefined' ? window.innerWidth - 80 : 260)}
            />

            {/* Кнопка КРУТИТЬ / состояние вращения */}
            <AnimatePresence mode="wait">
              {!showResult && (
                <motion.div
                  key="spin-button"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="flex w-full flex-col items-center gap-2"
                >
                  <Button
                    size="xl"
                    onClick={handleSpin}
                    disabled={spinning || pool.length === 0}
                    loading={spinning}
                    className={cn(
                      'w-full max-w-xs text-lg font-bold',
                      !spinning && 'animate-pulse-subtle',
                    )}
                    aria-label={spinning ? 'Крутим рулетку' : 'Крутить рулетку'}
                  >
                    <Dices className="h-6 w-6" aria-hidden="true" />
                    {spinning ? 'Крутим...' : 'КРУТИТЬ'}
                  </Button>

                  {!spinning && (
                    <p className="text-xs text-muted-foreground">
                      Случайное место из подходящих под ваши фильтры
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Результат */}
            <AnimatePresence>
              {showResult && result && (
                <RouletteResult
                  place={result}
                  isFavorite={favoriteIds.has(result.id)}
                  onAccept={handleAccept}
                  onRetry={handleRetry}
                  onAskAi={handleAskAi}
                  onToggleFavorite={handleToggleFavorite}
                  onOpenDetails={() => navigate('/nearby')}
                />
              )}
            </AnimatePresence>

            {showResult && (
              <button
                type="button"
                onClick={reset}
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                Начать заново
              </button>
            )}
          </>
        )}
      </div>

      {/* FilterSheet получает места из соседней выдачи: они уже загружены */}
      <FilterSheet places={visible.length > 0 ? visible : ([] as Place[])} />
    </div>
  );
}
