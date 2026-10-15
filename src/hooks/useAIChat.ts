/**
 * Чат с ИИ-помощником.
 *
 * Особенности:
 *   - контекст (топ-30 мест рядом + погода + время суток) уходит на сервер;
 *   - при ошибке показывается локальный фолбэк, чат не «умирает»;
 *   - лимит запросов отслеживается и показывается пользователю.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AiError,
  getAiUsage,
  localFallbackReply,
  sendAiMessage,
  toPlaceContext,
} from '@/lib/ai-client';
import { fetchPlacesByIds } from '@/lib/places';
import { fetchWeather } from '@/lib/weather';
import { usePlacesStore } from '@/stores/placesStore';
import { useAuthStore } from '@/stores/authStore';
import { analytics } from '@/lib/analytics';
import { uid } from '@/lib/utils';
import type { ChatMessage, Coords, Place, WeatherContext } from '@/types';

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    'Привет! Я помогу выбрать, где поесть. Опишите, что хочется — настроение, бюджет, кухню. ' +
    'Или нажмите быструю подсказку ниже.',
  timestamp: Date.now(),
};

interface UseAIChatOptions {
  coords: Coords;
  /** Комната для группового режима (undefined = обычный чат). */
  roomId?: string | undefined;
}

interface UseAIChatResult {
  messages: ChatMessage[];
  sending: boolean;
  weather: WeatherContext | null;
  used: number;
  limit: number;
  limitReached: boolean;
  send: (text: string) => Promise<void>;
  retry: (messageId: string) => Promise<void>;
  clear: () => void;
}

export function useAIChat({ coords, roomId }: UseAIChatOptions): UseAIChatResult {
  const places = usePlacesStore((s) => s.places);
  const profile = useAuthStore((s) => s.profile);

  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [sending, setSending] = useState(false);
  const [weather, setWeather] = useState<WeatherContext | null>(null);
  const [used, setUsed] = useState(0);

  const limit = Number(import.meta.env.VITE_AI_DAILY_LIMIT ?? 10);
  const abortRef = useRef<AbortController | null>(null);
  const lastUserMessageRef = useRef<string>('');

  // Погода: нужна как контекст для ИИ («на улице дождь» меняет рекомендацию).
  // Зависим от координат через примитивы, а не от объекта coords:
  // иначе запрос уходил бы на каждый ререндер родителя.
  const { lat, lng } = coords;
  useEffect(() => {
    const controller = new AbortController();
    void fetchWeather({ lat, lng }, controller.signal).then((w) => {
      if (!controller.signal.aborted) setWeather(w);
    });
    return () => controller.abort();
  }, [lat, lng]);

  // Актуальный расход лимита.
  useEffect(() => {
    void getAiUsage().then((usage) => {
      if (usage) setUsed(usage.used);
    });
  }, [profile?.id]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;

      lastUserMessageRef.current = trimmed;

      const userMessage: ChatMessage = {
        id: uid(),
        role: 'user',
        content: trimmed,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setSending(true);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await sendAiMessage(
          {
            message: trimmed,
            roomId: roomId ?? null,
            places: toPlaceContext(places),
            weather,
            mode: roomId ? 'room' : 'chat',
            lat: coords.lat,
            lng: coords.lng,
          },
          controller.signal,
        );

        // Подтягиваем полные карточки мест по id, которые вернул ИИ.
        const placeCards = await fetchPlacesByIds(response.place_ids);

        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: 'assistant',
            content: response.reply,
            places: placeCards,
            reasoning: response.reasoning,
            provider: response.provider,
            fromCache: response.fromCache,
            timestamp: Date.now(),
          },
        ]);

        if (typeof response.usageToday === 'number') {
          setUsed(response.usageToday);
        } else if (!response.fromCache) {
          setUsed((u) => u + 1);
        }

        analytics.aiMessageSent(response.provider, response.fromCache, placeCards.length > 0);
      } catch (err) {
        const isLimit = err instanceof AiError && err.limitReached;

        if (isLimit) analytics.aiLimitReached();

        // Локальный фолбэк: пользователь получает хоть какой-то ответ,
        // а не сообщение об ошибке. Места берём из уже загруженной выдачи.
        const fallback = localFallbackReply(places);

        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: 'assistant',
            content: isLimit
              ? err.message
              : err instanceof AiError
                ? err.message
                : fallback.reply,
            places: isLimit ? [] : fallback.places,
            provider: 'fallback',
            timestamp: Date.now(),
            error: true,
          },
        ]);
      } finally {
        setSending(false);
      }
    },
    [sending, roomId, places, weather, coords.lat, coords.lng],
  );

  /** Повтор последнего запроса — для кнопки «Попробовать снова». */
  const retry = useCallback(
    async (messageId: string) => {
      // Убираем ошибочное сообщение и пробуем снова с тем же текстом.
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      await send(lastUserMessageRef.current);
    },
    [send],
  );

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setMessages([{ ...WELCOME_MESSAGE, timestamp: Date.now() }]);
  }, []);

  return {
    messages,
    sending,
    weather,
    used,
    limit,
    limitReached: used >= limit,
    send,
    retry,
    clear,
  };
}

/** Готовые места для показа в групповом режиме. */
export function useTopPlaces(count = 30): Place[] {
  const places = usePlacesStore((s) => s.places);
  return places.slice(0, count);
}
