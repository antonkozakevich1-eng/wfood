/**
 * Клиент Edge Function `ai-chat`.
 *
 * ⚠️ Ключи Gemini и OpenAI живут ТОЛЬКО в Supabase Secrets.
 * Этот файл не знает о них ничего и не может их знать: он лишь вызывает
 * Edge Function, которая уже на сервере решает, какой провайдер использовать.
 */

import { functionsUrl, supabase } from './supabase';
import type { AiChatRequest, AiChatResponse, AiPlaceContext, Place } from '@/types';

export class AiError extends Error {
  readonly limitReached: boolean;
  readonly status: number;

  constructor(message: string, status: number, limitReached = false) {
    super(message);
    this.name = 'AiError';
    this.status = status;
    this.limitReached = limitReached;
  }
}

/** Готовит контекст места для промпта — только нужные модели поля. */
export function toPlaceContext(places: Place[]): AiPlaceContext[] {
  return places.slice(0, 30).map((p) => ({
    id: p.id,
    name: p.name,
    cuisine: p.cuisine,
    price_level: p.price_level,
    rating: p.rating,
    distance_m: p.distance_m,
    is_open_now: p.is_open_now,
    address: p.address,
  }));
}

/** Отправляет запрос в ИИ-помощник. */
export async function sendAiMessage(
  request: AiChatRequest,
  signal?: AbortSignal,
): Promise<AiChatResponse> {
  const base = functionsUrl();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (!base || !anonKey) {
    throw new AiError(
      'Supabase не настроен. Добавьте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env.local',
      503,
    );
  }

  // Токен пользователя, если он вошёл: даёт полный лимит и историю.
  let accessToken: string | null = null;
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    accessToken = data.session?.access_token ?? null;
  }

  let res: Response;
  try {
    res = await fetch(`${base}/ai-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${accessToken ?? anonKey}`,
      },
      body: JSON.stringify(request),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new AiError(
      'Не удалось связаться с ИИ-помощником. Проверьте интернет и попробуйте снова.',
      0,
    );
  }

  if (res.status === 429) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string; limit?: number };
    throw new AiError(
      payload.error ?? 'Лимит бесплатных запросов на сегодня исчерпан.',
      429,
      true,
    );
  }

  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    throw new AiError(payload.error ?? `ИИ-помощник вернул ошибку ${res.status}`, res.status);
  }

  return (await res.json()) as AiChatResponse;
}

/** Сколько запросов потрачено сегодня (для индикатора лимита). */
export async function getAiUsage(): Promise<{ used: number; limit: number } | null> {
  if (!supabase) return null;

  try {
    const { data: session } = await supabase.auth.getSession();
    const userId = session.session?.user.id;
    if (!userId) return null;

    const { data, error } = await supabase.rpc('ai_usage_today', { p_user_id: userId });
    if (error) return null;

    const limit = Number(import.meta.env.VITE_AI_DAILY_LIMIT ?? 10);
    return { used: Number(data ?? 0), limit };
  } catch {
    return null;
  }
}

/**
 * Локальный фолбэк-ответ, если ИИ полностью недоступен.
 * Приложение не должно оставлять пользователя без ответа вообще.
 */
export function localFallbackReply(places: Place[]): { reply: string; places: Place[] } {
  if (places.length === 0) {
    return {
      reply:
        'ИИ-помощник недоступен, и подходящих мест рядом не нашлось. ' +
        'Попробуйте расширить радиус в фильтрах.',
      places: [],
    };
  }

  const top = places
    .slice()
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.distance_m - b.distance_m)
    .slice(0, 3);

  return {
    reply:
      'ИИ-помощник сейчас недоступен, но вот места рядом, которые стоит рассмотреть: ' +
      top.map((p) => p.name).join(', ') +
      '. Выбраны по рейтингу и близости.',
    places: top,
  };
}

/** Быстрые чипсы для чата. */
export const QUICK_CHIPS = [
  { id: 'hot', label: 'Что-то горячее', emoji: '🔥', prompt: 'Хочу что-то горячее и сытное' },
  { id: 'healthy', label: 'Полезное', emoji: '🥗', prompt: 'Хочу полезное: салат или что-то лёгкое' },
  { id: 'company', label: 'Для компании', emoji: '👥', prompt: 'Идём большой компанией, нужно место, где всем хватит' },
  { id: 'date', label: 'Для свидания', emoji: '💕', prompt: 'Нужно уютное место для свидания, тихое и атмосферное' },
  { id: 'fast', label: 'Быстро', emoji: '⚡', prompt: 'Нужно быстро поесть, не хочу ждать' },
  { id: 'open', label: 'Открыто сейчас', emoji: '🕐', prompt: 'Что открыто прямо сейчас рядом со мной?' },
  { id: 'coffee', label: 'Кофе и работа', emoji: '☕', prompt: 'Нужно место с кофе и Wi-Fi, чтобы поработать' },
  { id: 'cheap', label: 'Недорого', emoji: '💰', prompt: 'Хочу поесть недорого, до 15 евро' },
] as const;

export type QuickChipId = (typeof QUICK_CHIPS)[number]['id'];
