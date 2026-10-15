/**
 * Утилиты общего назначения.
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Склеивает классы Tailwind, разрешая конфликты (последний побеждает). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Человекочитаемое расстояние: 450 м / 2.3 км. */
export function formatDistance(meters: number | null | undefined): string {
  // Явные проверки вместо == null: правило eqeqeq запрещает нестрогое сравнение,
  // а нам нужно покрыть и null, и undefined.
  if (meters === null || meters === undefined || !Number.isFinite(meters)) return '';
  if (meters < 1000) return `${Math.round(meters / 10) * 10} м`;
  return `${(meters / 1000).toFixed(1)} км`;
}

/**
 * Время пешком. Средняя скорость 4.5 км/ч — реалистично для города
 * с учётом светофоров и переходов.
 */
export function walkingTime(meters: number | null | undefined): string {
  if (meters === null || meters === undefined || !Number.isFinite(meters)) return '';
  const minutes = Math.max(1, Math.round(meters / 75));
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} ч` : `${hours} ч ${rest} мин`;
}

/** Средний чек из уровня цены (Эстония, EUR). */
export function priceRangeLabel(level: number | null): string {
  switch (level) {
    case 1:
      return 'до 10 €';
    case 2:
      return '10–20 €';
    case 3:
      return '20–35 €';
    case 4:
      return '35 € +';
    default:
      return 'Цена не указана';
  }
}

/** Символы уровня цены: $, $$, $$$. */
export function priceSymbol(level: number | null): string {
  if (!level) return '';
  return '$'.repeat(Math.min(level, 4));
}

/** Форматирует цену в валюте города. */
export function formatMoney(amount: number, currency = 'EUR', locale = 'ru-RU'): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

/** Русские названия дней недели, начиная с понедельника. */
export const WEEKDAYS_RU = [
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
  'Воскресенье',
] as const;

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** Сегодняшние часы работы из структуры hours. */
export function todayHours(hours: Record<string, unknown>): string | null {
  const todayIndex = (new Date().getDay() + 6) % 7; // 0 = понедельник
  const key = WEEKDAY_KEYS[todayIndex];
  if (!key) return null;
  const value = hours[key];
  if (Array.isArray(value) && Array.isArray(value[0])) {
    const [from, to] = value[0] as [string, string];
    return `${from}–${to}`;
  }
  const raw = hours['raw'];
  return typeof raw === 'string' ? raw : null;
}

/** Дебаунс для поисковой строки. */
export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/** Уникальный id для клиентских сущностей (сообщения чата и т.п.). */
export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Эмодзи для кухни — визуальный якорь в карточках и фильтрах. */
export function cuisineEmoji(cuisine: string[]): string {
  const map: Record<string, string> = {
    italian: '🍝',
    pizza: '🍕',
    sushi: '🍣',
    japanese: '🍱',
    chinese: '🥡',
    thai: '🍜',
    indian: '🍛',
    burger: '🍔',
    american: '🍔',
    kebab: '🥙',
    georgian: '🫓',
    russian: '🥟',
    estonian: '🥔',
    nordic: '🐟',
    seafood: '🦐',
    french: '🥐',
    coffee_shop: '☕',
    cafe: '☕',
    breakfast: '🥞',
    dessert: '🍰',
    ice_cream: '🍦',
    bakery: '🥖',
    bar: '🍸',
    pub: '🍺',
    vegan: '🥗',
    vegetarian: '🥗',
    mexican: '🌮',
    vietnamese: '🍜',
    korean: '🍲',
  };
  for (const c of cuisine) {
    const emoji = map[c.toLowerCase()];
    if (emoji) return emoji;
  }
  return '🍽️';
}

/** Человекочитаемое название кухни. */
export function cuisineLabel(cuisine: string): string {
  const map: Record<string, string> = {
    italian: 'Итальянская',
    pizza: 'Пицца',
    sushi: 'Суши',
    japanese: 'Японская',
    chinese: 'Китайская',
    thai: 'Тайская',
    indian: 'Индийская',
    burger: 'Бургеры',
    american: 'Американская',
    kebab: 'Кебаб',
    georgian: 'Грузинская',
    russian: 'Русская',
    estonian: 'Эстонская',
    nordic: 'Скандинавская',
    seafood: 'Морепродукты',
    french: 'Французская',
    coffee_shop: 'Кофейня',
    cafe: 'Кафе',
    breakfast: 'Завтраки',
    dessert: 'Десерты',
    ice_cream: 'Мороженое',
    bakery: 'Пекарня',
    bar: 'Бар',
    pub: 'Паб',
    vegan: 'Веганская',
    vegetarian: 'Вегетарианская',
    mexican: 'Мексиканская',
    vietnamese: 'Вьетнамская',
    korean: 'Корейская',
    fast_food: 'Фастфуд',
    regional: 'Региональная',
    international: 'Интернациональная',
  };
  return map[cuisine.toLowerCase()] ?? cuisine.charAt(0).toUpperCase() + cuisine.slice(1);
}

/** Склонение существительных: 1 место / 2 места / 5 мест. */
export function pluralRu(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

/** Ссылка на маршрут в картах (Google Maps — работает и в Эстонии). */
export function routeUrl(lat: number, lng: number, name: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&destination_place_id=&travelmode=walking&q=${encodeURIComponent(name)}`;
}

/** Безопасный вызов navigator.vibrate — не во всех браузерах есть. */
export function haptic(pattern: number | number[] = 10): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    // Вибрация — необязательное улучшение, молча игнорируем.
  }
}

/** Детерминированный цвет-градиент из строки (для плейсхолдеров фото). */
export function gradientFromString(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = input.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `linear-gradient(135deg, hsl(${hue} 70% 62%) 0%, hsl(${(hue + 40) % 360} 75% 48%) 100%)`;
}
