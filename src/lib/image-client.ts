/**
 * Клиент Edge Function `generate-image` (DALL·E 3 через OpenAI).
 *
 * Используется для:
 *   - обложек подборок, когда у мест нет фото
 *   - иллюстраций пустых состояний
 *   - OG-картинок для шаринга
 *
 * Если генерация недоступна — возвращает null, а UI рисует CSS-градиент.
 * Это штатное поведение, а не ошибка: картинки не критичны для работы.
 */

import { functionsUrl } from './supabase';
import { gradientFromString } from './utils';
import type { GenerateImageResponse } from '@/types';

export interface GenerateImageOptions {
  size?: '1024x1024' | '1792x1024' | '1024x1792';
  quality?: 'standard' | 'hd';
  style?: 'vivid' | 'natural';
  /** Семантический ключ дедупликации: одинаковые подборки → одна картинка. */
  cacheKey?: string;
}

/** В памяти держим уже полученные URL, чтобы не дёргать функцию повторно. */
const imageCache = new Map<string, string | null>();

export async function generateImage(
  prompt: string,
  options: GenerateImageOptions = {},
): Promise<string | null> {
  const cacheKey = options.cacheKey ?? prompt;
  if (imageCache.has(cacheKey)) {
    return imageCache.get(cacheKey) ?? null;
  }

  const base = functionsUrl();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (!base || !anonKey) {
    imageCache.set(cacheKey, null);
    return null;
  }

  try {
    const res = await fetch(`${base}/generate-image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        prompt,
        size: options.size ?? '1024x1024',
        quality: options.quality ?? 'standard',
        style: options.style ?? 'vivid',
        cacheKey,
      }),
    });

    if (!res.ok) {
      imageCache.set(cacheKey, null);
      return null;
    }

    const payload = (await res.json()) as GenerateImageResponse;
    imageCache.set(cacheKey, payload.url);
    return payload.url;
  } catch (err) {
    console.warn('[image-client] Генерация недоступна:', err);
    imageCache.set(cacheKey, null);
    return null;
  }
}

/** Готовый промпт для обложки подборки. */
export function collectionCoverPrompt(title: string, placeNames: string[]): string {
  const context = placeNames.slice(0, 3).join(', ');
  return `Appetizing flat-lay food spread representing a collection called "${title}". ${context ? `Inspired by dishes from: ${context}.` : ''} Overhead shot, rustic wooden table, fresh ingredients, warm inviting colors.`;
}

/** Промпт для иллюстрации пустого состояния. */
export function emptyStatePrompt(scene: string): string {
  return `Minimalist cozy illustration of ${scene}, warm orange and cream palette, soft shapes, friendly and inviting mood, flat vector style.`;
}

/**
 * Синхронный плейсхолдер: CSS-градиент, детерминированный по строке.
 * Показывается мгновенно, пока (и если) грузится настоящая картинка.
 */
export function imagePlaceholder(seed: string): string {
  return gradientFromString(seed);
}

/** Сбрасывает кэш картинок (например, при выходе из аккаунта). */
export function clearImageCache(): void {
  imageCache.clear();
}
