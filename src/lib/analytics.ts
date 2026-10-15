/**
 * Аналитика PostHog.
 *
 * Ключ VITE_POSTHOG_KEY — публичный по дизайну (он и предназначен для браузера).
 * Если ключ не задан, все вызовы превращаются в no-op: приложение работает
 * без аналитики, и ни один компонент не должен об этом беспокоиться.
 */

import posthog from 'posthog-js';
import type { Place, AiProvider } from '@/types';

const apiKey = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const host = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? 'https://eu.i.posthog.com';
const enabled =
  Boolean(apiKey) && String(import.meta.env.VITE_ANALYTICS_ENABLED ?? 'false') === 'true';

let initialized = false;

export function initAnalytics(): void {
  if (!enabled || initialized || !apiKey) return;

  try {
    posthog.init(apiKey, {
      api_host: host,
      // Отключаем автосбор: собираем только то, что нужно продукту,
      // и не отправляем лишние персональные данные.
      autocapture: false,
      capture_pageview: true,
      capture_pageleave: true,
      disable_session_recording: true,
      respect_dnt: true,
      persistence: 'localStorage',
    });
    initialized = true;
  } catch (err) {
    console.warn('[analytics] PostHog не инициализирован:', err);
  }
}

/** Безопасная отправка события: аналитика никогда не ломает UX. */
function capture(event: string, properties?: Record<string, unknown>): void {
  if (!initialized) return;
  try {
    posthog.capture(event, properties);
  } catch {
    // Игнорируем: сбой аналитики не должен влиять на приложение.
  }
}

export function identifyUser(userId: string, props?: Record<string, unknown>): void {
  if (!initialized) return;
  try {
    posthog.identify(userId, props);
  } catch {
    /* noop */
  }
}

export function resetAnalytics(): void {
  if (!initialized) return;
  try {
    posthog.reset();
  } catch {
    /* noop */
  }
}

// ---------------------------------------------------------------------------
// Продуктовые события — именованные, чтобы не разъезжались строки по коду.
// ---------------------------------------------------------------------------
export const analytics = {
  rouletteSpun(filters: Record<string, unknown>): void {
    capture('roulette_spun', filters);
  },

  rouletteResult(place: Place, attempts: number): void {
    capture('roulette_result', {
      place_id: place.id,
      place_name: place.name,
      cuisine: place.cuisine,
      rating: place.rating,
      distance_m: Math.round(place.distance_m),
      attempts,
    });
  },

  /** Ключевая метрика продукта: «Идём сюда» = решение принято. */
  rouletteAccepted(place: Place, secondsToDecide: number): void {
    capture('roulette_accepted', {
      place_id: place.id,
      place_name: place.name,
      seconds_to_decide: secondsToDecide,
    });
  },

  placeOpened(place: Place, from: string): void {
    capture('place_opened', { place_id: place.id, from });
  },

  routeClicked(place: Place): void {
    capture('route_clicked', { place_id: place.id });
  },

  callClicked(place: Place): void {
    capture('call_clicked', { place_id: place.id });
  },

  favoriteToggled(place: Place, added: boolean): void {
    capture(added ? 'favorite_added' : 'favorite_removed', { place_id: place.id });
  },

  collectionShared(collectionId: string): void {
    capture('collection_shared', { collection_id: collectionId });
  },

  aiMessageSent(provider: AiProvider, fromCache: boolean, hasPlaces: boolean): void {
    capture('ai_message_sent', { provider, from_cache: fromCache, has_places: hasPlaces });
  },

  aiLimitReached(): void {
    capture('ai_limit_reached');
  },

  roomCreated(roomId: string): void {
    capture('room_created', { room_id: roomId });
  },

  roomJoined(roomId: string): void {
    capture('room_joined', { room_id: roomId });
  },

  roomDecided(roomId: string, placeId: string): void {
    capture('room_decided', { room_id: roomId, place_id: placeId });
  },

  filterChanged(filter: string, value: unknown): void {
    capture('filter_changed', { filter, value });
  },

  searchPerformed(query: string, resultsCount: number): void {
    capture('search_performed', { query_length: query.length, results_count: resultsCount });
  },

  dataSourceFallback(source: string): void {
    capture('data_source_fallback', { source });
  },
};
