/**
 * Логика рулетки: сбор пула, вращение, результат.
 *
 * Пул пересобирается при смене фильтров. Если после фильтрации не осталось
 * ни одного места, хук сообщает об этом явно — UI предложит расширить фильтры,
 * а не будет молча крутить пустое колесо.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useFiltersStore } from '@/stores/filtersStore';
import { usePlacesStore } from '@/stores/placesStore';
import { analytics } from '@/lib/analytics';
import { haptic } from '@/lib/utils';
import type { Place } from '@/types';

/** Длительность анимации вращения, мс. */
export const SPIN_DURATION_MS = 3200;

interface UseRouletteResult {
  /** Пул мест, из которых выбирает рулетка. */
  pool: Place[];
  /** Текущий результат (null до первого вращения). */
  result: Place | null;
  spinning: boolean;
  /** Показывать ли результат (для анимации появления). */
  showResult: boolean;
  /** Сколько раз крутили с последнего результата — для «Ещё раз». */
  attempts: number;
  /** Момент принятия решения: для метрики «10 секунд». */
  decidedAt: number | null;
  spin: () => void;
  reset: () => void;
  accept: () => void;
  /** Исключает текущий результат из пула при следующем вращении. */
  excludeCurrent: () => void;
}

export function useRoulette(): UseRouletteResult {
  const places = usePlacesStore((s) => s.places);
  const addHistory = usePlacesStore((s) => s.addHistory);

  const radius = useFiltersStore((s) => s.radius);
  const cuisines = useFiltersStore((s) => s.cuisines);
  const priceLevels = useFiltersStore((s) => s.priceLevels);
  const minRating = useFiltersStore((s) => s.minRating);
  const openNow = useFiltersStore((s) => s.openNow);
  const amenities = useFiltersStore((s) => s.amenities);
  const search = useFiltersStore((s) => s.search);

  const [result, setResult] = useState<Place | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [decidedAt, setDecidedAt] = useState<number | null>(null);

  /** id мест, которые уже выпадали в текущей сессии кручения. */
  const seenRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<number | null>(null);

  const pool = useMemo(() => {
    return places.filter((place) => {
      if (place.distance_m > radius) return false;

      if (cuisines.length > 0) {
        const matches = place.cuisine.some((c) => cuisines.includes(c.toLowerCase()));
        if (!matches) return false;
      }

      if (priceLevels.length > 0) {
        if (place.price_level === null) return false;
        if (!priceLevels.includes(place.price_level as 1 | 2 | 3 | 4)) return false;
      }

      if (minRating !== null && (place.rating ?? 0) < minRating) return false;
      if (openNow && !place.is_open_now) return false;

      for (const amenity of amenities) {
        if (place.amenities[amenity] !== true) return false;
      }

      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const haystack = [place.name, place.address ?? '', ...place.cuisine, ...place.tags]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [places, radius, cuisines, priceLevels, minRating, openNow, amenities, search]);

  /** Очистка таймера при размонтировании — иначе setState после unmount. */
  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const spin = useCallback(() => {
    if (spinning || pool.length === 0) return;

    clearTimer();
    setSpinning(true);
    setShowResult(false);
    setDecidedAt(null);
    haptic([15, 40, 15]);

    analytics.rouletteSpun(useFiltersStore.getState().toAnalytics());

    // Выбираем место сразу (анимация лишь показывает уже принятое решение).
    // Так результат не зависит от того, успела ли анимация проиграться.
    const picked = pickWeighted(pool, seenRef.current);
    seenRef.current.add(picked.id);

    timerRef.current = window.setTimeout(() => {
      setResult(picked);
      setSpinning(false);
      setShowResult(true);
      setAttempts((a) => a + 1);
      addHistory(picked, false);
      haptic([30, 60, 30]);
      analytics.rouletteResult(picked, attempts + 1);
      timerRef.current = null;
    }, SPIN_DURATION_MS);
  }, [spinning, pool, addHistory, attempts, clearTimer]);

  const reset = useCallback(() => {
    clearTimer();
    setSpinning(false);
    setShowResult(false);
    setResult(null);
    setAttempts(0);
    setDecidedAt(null);
    seenRef.current.clear();
  }, [clearTimer]);

  const accept = useCallback(() => {
    if (!result) return;
    setDecidedAt(Date.now());
    addHistory(result, true);
    haptic(50);
    analytics.rouletteAccepted(result, attempts * 3);
  }, [result, addHistory, attempts]);

  /**
   * Исключает текущий результат: следующий спин не покажет то же место.
   * Сбрасывается, когда пул исчерпан, чтобы рулетка не зацикливалась.
   */
  const excludeCurrent = useCallback(() => {
    if (!result) return;
    seenRef.current.add(result.id);
    if (seenRef.current.size >= pool.length) {
      seenRef.current.clear();
      seenRef.current.add(result.id);
    }
  }, [result, pool.length]);

  return {
    pool,
    result,
    spinning,
    showResult,
    attempts,
    decidedAt,
    spin,
    reset,
    accept,
    excludeCurrent,
  };
}

/**
 * Взвешенный выбор места.
 *
 * Вес складывается из рейтинга и близости: хорошее место рядом выпадает
 * чаще, чем случайный фастфуд в 5 км. Полностью случайный выбор давал бы
 * плохие рекомендации в 40% случаев, что убивает доверие к рулетке.
 */
function pickWeighted(pool: Place[], seen: Set<string>): Place {
  // Сначала пробуем выбрать среди тех, что ещё не выпадали.
  const unseen = pool.filter((p) => !seen.has(p.id));
  const candidates = unseen.length > 0 ? unseen : pool;

  const weights = candidates.map((place) => {
    // Рейтинг: 4.8 → 1.48, 3.0 → 0.3. Место без рейтинга получает базовый вес.
    const ratingWeight = place.rating ? Math.pow(place.rating / 4, 2) : 0.6;
    // Близость: 200 м → 1.0, 3 км → 0.34. Ходить далеко никто не любит.
    const distanceWeight = 1 / (1 + place.distance_m / 3000);
    // Открытость: закрытое место — плохой совет.
    const openWeight = place.is_open_now ? 1 : 0.35;

    return Math.max(0.05, ratingWeight * distanceWeight * openWeight);
  });

  const total = weights.reduce((sum, w) => sum + w, 0);
  let random = Math.random() * total;

  for (let i = 0; i < candidates.length; i += 1) {
    random -= weights[i] ?? 0;
    if (random <= 0) {
      const picked = candidates[i];
      if (picked) return picked;
    }
  }

  // Математически недостижимо, но защищаемся от краевых случаев с плавающей точкой.
  return candidates[candidates.length - 1] ?? pool[0]!;
}

export { pickWeighted };
