/**
 * Геолокация с фолбэком на Таллинн.
 *
 * Ключевое требование: если пользователь запретил геолокацию, приложение
 * НЕ должно ломаться. Оно центрируется на Ратушной площади Таллинна
 * и показывает баннер с предложением включить доступ.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Coords, GeolocationState } from '@/types';

const DEFAULT_COORDS: Coords = {
  lat: Number(import.meta.env.VITE_DEFAULT_LAT ?? 59.437),
  lng: Number(import.meta.env.VITE_DEFAULT_LNG ?? 24.7536),
};

/** Точность, после которой перестаём ждать лучшего сигнала (метры). */
const GOOD_ACCURACY_M = 100;
/** Максимум ожидания первого фикса. */
const TIMEOUT_MS = 10_000;

interface UseGeolocationResult extends GeolocationState {
  /** Координаты для запросов: реальные или фолбэк-центр города. */
  effectiveCoords: Coords;
  /** Используется ли фолбэк вместо реальной геопозиции. */
  isFallback: boolean;
  request: () => void;
}

export function useGeolocation(options: { auto?: boolean } = {}): UseGeolocationResult {
  const { auto = true } = options;

  const [state, setState] = useState<GeolocationState>({
    coords: null,
    accuracy: null,
    loading: false,
    error: null,
    denied: false,
  });

  const watchIdRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (watchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const request = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setState({
        coords: null,
        accuracy: null,
        loading: false,
        error: 'Браузер не поддерживает геолокацию',
        denied: true,
      });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    // watchPosition, а не getCurrentPosition: пользователь идёт пешком,
    // и список «рядом» должен пересортировываться по мере движения.
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        if (!mountedRef.current) return;

        const accuracy = position.coords.accuracy;
        setState({
          coords: { lat: position.coords.latitude, lng: position.coords.longitude },
          accuracy,
          loading: false,
          error: null,
          denied: false,
        });

        // Как только точность достаточная — прекращаем слежение,
        // чтобы не тратить батарею. Пользователь может запросить снова.
        if (accuracy <= GOOD_ACCURACY_M && watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
        }
      },
      (error) => {
        if (!mountedRef.current) return;

        const denied = error.code === error.PERMISSION_DENIED;
        setState({
          coords: null,
          accuracy: null,
          loading: false,
          error: denied
            ? 'Доступ к геолокации запрещён'
            : 'Не удалось определить местоположение',
          denied,
        });
      },
      {
        enableHighAccuracy: true,
        timeout: TIMEOUT_MS,
        maximumAge: 30_000,
      },
    );
  }, []);

  useEffect(() => {
    if (!auto) return;
    request();
  }, [auto, request]);

  /** Если реальных координат нет — используем центр города. */
  const effectiveCoords = state.coords ?? DEFAULT_COORDS;
  const isFallback = state.coords === null;

  return { ...state, effectiveCoords, isFallback, request };
}

export { DEFAULT_COORDS };
