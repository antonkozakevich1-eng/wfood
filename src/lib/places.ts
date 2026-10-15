/**
 * Клиент Edge Function `fetch-places`.
 *
 * Загружает заведения, нормализует их и кэширует в памяти браузера.
 * Если бэкенд недоступен — возвращает локальный сид (приложение не пустеет).
 */

import { functionsUrl, supabase } from './supabase';
import { SEED_PLACES } from '@/data/tallinn-seed';
import { haversine } from './geo';
import type { Coords, FetchPlacesResponse, Filters, Place } from '@/types';

/** TTL кэша в памяти: 10 минут. За это время выдача не сильно меняется. */
const MEMORY_TTL_MS = 10 * 60 * 1000;

interface CacheEntry {
  places: Place[];
  fetchedAt: number;
}

const memoryCache = new Map<string, CacheEntry>();

/** Ключ кэша: округляем координаты и сериализуем фильтры. */
function cacheKey(coords: Coords, filters: Filters): string {
  return [
    coords.lat.toFixed(3),
    coords.lng.toFixed(3),
    filters.radius,
    filters.cuisines.slice().sort().join(','),
    filters.priceLevels.slice().sort().join(','),
    filters.minRating ?? '',
    filters.openNow ? '1' : '0',
    filters.amenities.slice().sort().join(','),
    filters.search.trim().toLowerCase(),
    filters.sort,
  ].join('|');
}

/**
 * Приводит место из БД к типу Place: Postgres возвращает numerics строками,
 * а photos/hours/amenities — произвольным JSON.
 */
function normalizePlace(raw: Record<string, unknown>): Place {
  const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };

  return {
    id: String(raw['id'] ?? ''),
    external_id: String(raw['external_id'] ?? ''),
    source: (raw['source'] as Place['source']) ?? 'osm',
    name: String(raw['name'] ?? 'Без названия'),
    description: (raw['description'] as string | null) ?? null,
    lat: num(raw['lat']) ?? 0,
    lng: num(raw['lng']) ?? 0,
    address: (raw['address'] as string | null) ?? null,
    phone: (raw['phone'] as string | null) ?? null,
    website: (raw['website'] as string | null) ?? null,
    cuisine: Array.isArray(raw['cuisine']) ? (raw['cuisine'] as string[]) : [],
    price_level: num(raw['price_level']),
    rating: num(raw['rating']),
    reviews_count: num(raw['reviews_count']) ?? 0,
    photos: Array.isArray(raw['photos'])
      ? (raw['photos'] as Place['photos'])
      : [],
    hours: (raw['hours'] as Place['hours']) ?? {},
    tags: Array.isArray(raw['tags']) ? (raw['tags'] as string[]) : [],
    amenities: (raw['amenities'] as Place['amenities']) ?? {},
    is_open_now: Boolean(raw['is_open_now']),
    distance_m: num(raw['distance_m']) ?? 0,
  };
}

/** Локальный сид с пересчитанным расстоянием и применёнными фильтрами. */
function seedFallback(coords: Coords, filters: Filters): Place[] {
  return SEED_PLACES.map((place) => ({
    ...place,
    distance_m: haversine(coords, { lat: place.lat, lng: place.lng }),
  }))
    .filter((place) => applyFilters(place, filters))
    .sort(sortPlaces(filters.sort));
}

/**
 * Клиентская фильтрация — нужна для сида и для мгновенного отклика UI
 * до ответа сервера (optimistic filtering).
 */
export function applyFilters(place: Place, filters: Filters): boolean {
  if (place.distance_m > filters.radius) return false;

  if (filters.cuisines.length > 0) {
    const hasCuisine = place.cuisine.some((c) =>
      filters.cuisines.includes(c.toLowerCase()),
    );
    if (!hasCuisine) return false;
  }

  if (filters.priceLevels.length > 0) {
    if (place.price_level === null || !filters.priceLevels.includes(place.price_level as 1 | 2 | 3 | 4)) {
      return false;
    }
  }

  if (filters.minRating !== null && (place.rating ?? 0) < filters.minRating) return false;
  if (filters.openNow && !place.is_open_now) return false;

  // Удобства: должны быть ВСЕ выбранные — та же логика, что в SQL-функции.
  for (const amenity of filters.amenities) {
    if (place.amenities[amenity] !== true) return false;
  }

  if (filters.search.trim()) {
    const q = filters.search.trim().toLowerCase();
    const haystack = [place.name, place.address ?? '', ...place.cuisine, ...place.tags]
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(q)) return false;
  }

  return true;
}

/** Компаратор сортировки. */
export function sortPlaces(sort: Filters['sort']): (a: Place, b: Place) => number {
  switch (sort) {
    case 'rating':
      return (a, b) => (b.rating ?? 0) - (a.rating ?? 0) || a.distance_m - b.distance_m;
    case 'popularity':
      return (a, b) => b.reviews_count - a.reviews_count || a.distance_m - b.distance_m;
    case 'newest':
      // OSM-места не имеют даты создания на клиенте — сортируем по id,
      // чтобы порядок был стабильным, а не случайным.
      return (a, b) => b.id.localeCompare(a.id);
    case 'distance':
    default:
      return (a, b) => a.distance_m - b.distance_m;
  }
}

/**
 * Загружает места рядом.
 *
 * Порядок попыток:
 *   1. Кэш в памяти (мгновенно)
 *   2. Supabase RPC nearby_places (быстро, уже в БД)
 *   3. Edge Function fetch-places (идёт в Overpass, медленнее)
 *   4. Локальный сид (работает всегда)
 */
export async function fetchNearbyPlaces(
  coords: Coords,
  filters: Filters,
  options: { forceRefresh?: boolean; signal?: AbortSignal } = {},
): Promise<{ places: Place[]; source: string }> {
  const key = cacheKey(coords, filters);

  if (!options.forceRefresh) {
    const cached = memoryCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < MEMORY_TTL_MS) {
      return { places: cached.places, source: 'memory' };
    }
  }

  // --- 2. Supabase RPC ---
  if (supabase) {
    try {
      const { data, error } = await supabase.rpc('nearby_places', {
        p_lat: coords.lat,
        p_lng: coords.lng,
        p_radius: filters.radius,
        p_cuisines: filters.cuisines.length > 0 ? filters.cuisines : null,
        p_price_levels: filters.priceLevels.length > 0 ? filters.priceLevels : null,
        p_min_rating: filters.minRating,
        p_open_now: filters.openNow,
        p_amenities: filters.amenities.length > 0 ? filters.amenities : null,
        p_search: filters.search.trim() || null,
        p_sort: filters.sort,
        p_limit: 200,
        p_offset: 0,
      });

      if (!error && Array.isArray(data) && data.length > 0) {
        const places = (data as Record<string, unknown>[])
          .map(normalizePlace)
          .filter((p) => p.id);
        memoryCache.set(key, { places, fetchedAt: Date.now() });
        return { places, source: 'database' };
      }
    } catch (err) {
      console.warn('[places] RPC nearby_places недоступен:', err);
    }
  }

  // --- 3. Edge Function ---
  const base = functionsUrl();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (base && anonKey) {
    try {
      const url = new URL(`${base}/fetch-places`);
      url.searchParams.set('lat', String(coords.lat));
      url.searchParams.set('lng', String(coords.lng));
      // Просим с запасом: сервер фильтрует точнее, а нам нужен буфер для карты.
      url.searchParams.set('radius', String(Math.min(filters.radius, 20_000)));
      if (options.forceRefresh) url.searchParams.set('refresh', 'true');

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${anonKey}`, apikey: anonKey },
        signal: options.signal,
      });

      if (res.ok) {
        const payload = (await res.json()) as FetchPlacesResponse;
        if (Array.isArray(payload.places) && payload.places.length > 0) {
          // Досчитываем расстояние и фильтруем на клиенте: Edge Function
          // отдаёт всё в радиусе, а фильтры кухни/цены применяет RPC.
          const places = payload.places
            .map((p) => normalizePlace(p as unknown as Record<string, unknown>))
            .map((p) => ({ ...p, distance_m: p.distance_m || haversine(coords, p) }))
            .filter((p) => applyFilters(p, filters))
            .sort(sortPlaces(filters.sort));

          memoryCache.set(key, { places, fetchedAt: Date.now() });
          return { places, source: payload.source };
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      console.warn('[places] Edge Function fetch-places недоступна:', err);
    }
  }

  // --- 4. Локальный сид ---
  const places = seedFallback(coords, filters);
  memoryCache.set(key, { places, fetchedAt: Date.now() });
  return { places, source: 'seed' };
}

/** Одно место по id (для страницы деталей и карточек ИИ). */
export async function fetchPlaceById(id: string): Promise<Place | null> {
  const seeded = SEED_PLACES.find((p) => p.id === id || p.external_id === id);
  if (seeded) return seeded as Place;

  if (!supabase) return null;

  try {
    const { data, error } = await supabase.from('places').select('*').eq('id', id).maybeSingle();
    if (error || !data) return null;
    return normalizePlace(data as Record<string, unknown>);
  } catch {
    return null;
  }
}

/** Несколько мест по списку id (для ответов ИИ). */
export async function fetchPlacesByIds(ids: string[]): Promise<Place[]> {
  if (ids.length === 0) return [];

  const seeded = SEED_PLACES.filter((p) => ids.includes(p.id));
  if (seeded.length === ids.length) return seeded as Place[];

  if (!supabase) return seeded as Place[];

  try {
    const { data, error } = await supabase.from('places').select('*').in('id', ids);
    if (error || !data) return seeded as Place[];

    // Сохраняем порядок, в котором места предложил ИИ: он отражает приоритет.
    const byId = new Map(
      (data as Record<string, unknown>[]).map((row) => {
        const place = normalizePlace(row);
        return [place.id, place] as const;
      }),
    );

    return ids.map((id) => byId.get(id)).filter((p): p is Place => Boolean(p));
  } catch {
    return seeded as Place[];
  }
}

/** Сбрасывает кэш — вызывается после добавления краудсорсингового места. */
export function clearPlacesCache(): void {
  memoryCache.clear();
}

/**
 * Все кухни, встречающиеся в выдаче, с частотой.
 * Нужны для фильтра-мультивыбора: показываем только то, что реально есть рядом,
 * а не абстрактный список из 40 кухонь.
 */
export function collectCuisines(places: Place[]): Array<{ value: string; count: number }> {
  const counter = new Map<string, number>();
  for (const place of places) {
    for (const cuisine of place.cuisine) {
      const key = cuisine.toLowerCase();
      counter.set(key, (counter.get(key) ?? 0) + 1);
    }
  }
  return Array.from(counter.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}
