// ============================================================================
// WFOOD — Edge Function fetch-places
// Агрегатор заведений: Overpass (OSM) → Google Places → уже имеющаяся БД.
//
// Почему это на сервере, а не в браузере:
//   1. Overpass и Google не отдают CORS-заголовки для произвольных доменов.
//   2. Ключ Google Places нельзя отдавать на фронтенд.
//   3. Нормализацию и upsert нужно делать одной транзакцией.
//
// Пилот: Таллинн, Эстония. Overpass — основной бесплатный источник.
// ============================================================================

import {
  adminClient,
  corsHeaders,
  errorResponse,
  jsonResponse,
} from '../_shared/utils.ts';

// ---------------------------------------------------------------------------
// Overpass
// ---------------------------------------------------------------------------
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

/** Собирает запрос Overpass: заведения общепита в радиусе. */
function buildOverpassQuery(lat: number, lng: number, radius: number): string {
  // Только точки питания. `out center` нужен, чтобы у way/relation была координата.
  const amenities = ['restaurant', 'cafe', 'bar', 'pub', 'fast_food', 'food_court', 'ice_cream'];
  const filters = amenities
    .map((a) => `node["amenity"="${a}"](around:${radius},${lat},${lng});\n  way["amenity"="${a}"](around:${radius},${lat},${lng});`)
    .join('\n  ');

  return `[out:json][timeout:25];
(
  ${filters}
);
out center tags;`;
}

/** Парсит тег OSM `opening_hours` в проверку «открыто сейчас». */
function isOpenNow(tags: Record<string, string>): boolean {
  const raw = tags['opening_hours'];
  if (!raw) return false;

  // Полноценный парсер OSM opening_hours — это отдельная библиотека на 2000 строк.
  // Здесь обрабатываем 4 самых частых случая, которые покрывают большинство
  // заведений Таллинна. Остальное помечаем как «неизвестно» → закрыто,
  // чтобы не показывать пользователю ложное «открыто».
  const now = new Date();
  // Таллинн: UTC+2 зимой, UTC+3 летом. Берём приближённо +2/+3 по DST-месяцу.
  const month = now.getUTCMonth();
  const isDst = month >= 2 && month <= 9;
  const localHour = (now.getUTCHours() + (isDst ? 3 : 2)) % 24;
  const localMinutes = localHour * 60 + now.getUTCMinutes();
  const localDay = (now.getUTCDay() + 6) % 7; // 0 = понедельник

  if (raw === '24/7') return true;

  const normalized = raw.trim();

  // «Mo-Su 11:00-23:00» / «Mo-Fr 09:00-18:00»
  const rangeMatch = normalized.match(
    /^([A-Za-z]{2}(?:-[A-Za-z]{2})?)\s+(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/,
  );
  if (rangeMatch) {
    const [, days, fromH, fromM, toH, toM] = rangeMatch;
    if (!days || !fromH || !fromM || !toH || !toM) return false;

    const dayNames = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
    const [startDay, endDay] = days.split('-');
    const startIdx = dayNames.indexOf(startDay ?? '');
    const endIdx = dayNames.indexOf(endDay ?? startDay ?? '');
    if (startIdx === -1 || endIdx === -1) return false;

    const inDayRange =
      startIdx <= endIdx
        ? localDay >= startIdx && localDay <= endIdx
        : localDay >= startIdx || localDay <= endIdx; // «Sa-Su» и переход через неделю

    if (!inDayRange) return false;

    const from = Number(fromH) * 60 + Number(fromM);
    const to = Number(toH) * 60 + Number(toM);
    // Заведение, работающее до полуночи и позже (23:00-02:00), проверяем «через ноль».
    return to < from ? localMinutes >= from || localMinutes <= to : localMinutes >= from && localMinutes <= to;
  }

  // «Mo-Su 10:00-22:00; PH off» и прочие составные — берём первый временной интервал.
  const partial = normalized.match(/(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})/);
  if (partial) {
    const [, fromH, fromM, toH, toM] = partial;
    if (!fromH || !fromM || !toH || !toM) return false;
    const from = Number(fromH) * 60 + Number(fromM);
    const to = Number(toH) * 60 + Number(toM);
    return to < from ? localMinutes >= from || localMinutes <= to : localMinutes >= from && localMinutes <= to;
  }

  return false;
}

/** Нормализует теги OSM в структуру таблицы places. */
function normalizeOverpass(el: OverpassElement): Record<string, unknown> | null {
  const tags = el.tags ?? {};
  const name = tags['name'] ?? tags['name:ru'] ?? tags['name:en'];
  if (!name) return null; // Безымянные POI бесполезны пользователю.

  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;

  // Кухня: «italian; pizza» → ['italian', 'pizza']
  const cuisine = (tags['cuisine'] ?? '')
    .split(/[;,]/)
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);

  // Цена: OSM почти не заполняет price_level. Выводим оценку из типа заведения —
  // это честнее, чем врать точным значением. UI показывает «$»–«$$$$».
  const amenity = tags['amenity'] ?? '';
  const priceLevel = amenity === 'fast_food' ? 1 : amenity === 'restaurant' ? 3 : 2;

  const address = [
    tags['addr:street'],
    tags['addr:housenumber'],
    tags['addr:postcode'],
  ]
    .filter(Boolean)
    .join(' ');

  const photos: Array<{ url: string; alt: string }> = [];
  if (tags['image']) photos.push({ url: tags['image'], alt: name });

  const amenities = {
    delivery: tags['delivery'] === 'yes',
    wifi: tags['internet_access'] === 'wlan' || tags['internet_access'] === 'yes',
    dog_friendly: tags['dog'] === 'yes' || tags['dog'] === 'leashed',
    kids_menu: tags['kids_menu'] === 'yes' || tags['highchair'] === 'yes',
    outdoor: tags['outdoor_seating'] === 'yes' || tags['terrace'] === 'yes',
  };

  const tagsList = Object.entries(tags)
    .filter(([k]) => k.startsWith('diet:'))
    .map(([k, v]) => `${k.replace('diet:', '')}:${v}`);

  return {
    external_id: `osm:${el.type}/${el.id}`,
    source: 'osm',
    name,
    lat,
    lng,
    address: address || null,
    city: tags['addr:city'] ?? 'Tallinn',
    country: 'EE',
    phone: tags['phone'] ?? tags['contact:phone'] ?? null,
    website: tags['website'] ?? tags['contact:website'] ?? null,
    cuisine,
    price_level: priceLevel,
    rating: null, // OSM не содержит рейтингов — не выдумываем.
    reviews_count: 0,
    photos,
    hours: { raw: tags['opening_hours'] ?? null },
    tags: tagsList,
    amenities,
    is_open_now: isOpenNow(tags),
  };
}

/** Запрашивает Overpass с перебором зеркал: одно из них обычно живо. */
async function fetchOverpass(
  lat: number,
  lng: number,
  radius: number,
): Promise<OverpassElement[]> {
  const query = buildOverpassQuery(lat, lng, radius);

  for (const endpoint of OVERPASS_ENDPOINTS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          // Overpass блокирует запросы без User-Agent.
          'User-Agent': 'WFOOD/1.0 (food discovery PWA; contact: hello@wfood.app)',
        },
        signal: controller.signal,
        body: `data=${encodeURIComponent(query)}`,
      });

      if (!res.ok) {
        console.error(`[fetch-places] Overpass ${endpoint} → ${res.status}`);
        continue;
      }

      const data = (await res.json()) as OverpassResponse;
      if (Array.isArray(data.elements)) return data.elements;
    } catch (err) {
      console.error(
        `[fetch-places] Overpass ${endpoint} ошибка:`,
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  return [];
}

// ---------------------------------------------------------------------------
// Google Places (опциональное обогащение)
// ---------------------------------------------------------------------------
interface GooglePlace {
  place_id: string;
  name?: string;
  rating?: number;
  user_ratings_total?: number;
  price_level?: number;
  photos?: Array<{ photo_reference: string }>;
  vicinity?: string;
  formatted_phone_number?: string;
  website?: string;
  opening_hours?: { open_now?: boolean };
  geometry?: { location: { lat: number; lng: number } };
}

/**
 * Nearby Search Google Places.
 * Возвращает [] если ключа нет — это штатная ситуация, а не ошибка:
 * приложение должно полноценно работать на одном OSM.
 */
async function fetchGooglePlaces(
  lat: number,
  lng: number,
  radius: number,
): Promise<GooglePlace[]> {
  const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
  if (!apiKey) return [];

  const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
  url.searchParams.set('location', `${lat},${lng}`);
  url.searchParams.set('radius', String(Math.min(radius, 50_000)));
  url.searchParams.set('type', 'restaurant');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('language', 'ru');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: GooglePlace[]; status?: string };
    if (data.status && data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error(`[fetch-places] Google Places статус: ${data.status}`);
    }
    return data.results ?? [];
  } catch (err) {
    console.error(
      '[fetch-places] Google Places ошибка:',
      err instanceof Error ? err.message : String(err),
    );
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/** Дополняет OSM-запись данными Google, если нашли то же место. */
function mergeGoogleData(
  osmPlace: Record<string, unknown>,
  googleResults: GooglePlace[],
): Record<string, unknown> {
  const lat = osmPlace['lat'] as number;
  const lng = osmPlace['lng'] as number;
  const name = (osmPlace['name'] as string).toLowerCase();

  // Матчим по совпадению имени + близости (< 80 м). По id матчить нельзя:
  // у Google и OSM разные пространства идентификаторов.
  const match = googleResults.find((g) => {
    if (!g.geometry?.location) return false;
    const gLat = g.geometry.location.lat;
    const gLng = g.geometry.location.lng;
    const dist = Math.hypot((gLat - lat) * 111_320, (gLng - lng) * 111_320 * Math.cos((lat * Math.PI) / 180));
    if (dist > 80) return false;
    const gName = (g.name ?? '').toLowerCase();
    return gName.includes(name) || name.includes(gName);
  });

  if (!match) return osmPlace;

  const photos = (match.photos ?? []).slice(0, 5).map((p) => ({
    // Ссылка на фото Google строится на клиенте через прокси-эндпоинт,
    // здесь храним только reference — сам URL содержит API-ключ.
    photo_reference: p.photo_reference,
    alt: match.name ?? (osmPlace['name'] as string),
  }));

  return {
    ...osmPlace,
    rating: match.rating ?? osmPlace['rating'],
    reviews_count: match.user_ratings_total ?? osmPlace['reviews_count'],
    price_level: match.price_level ?? osmPlace['price_level'],
    phone: osmPlace['phone'] ?? match.formatted_phone_number ?? null,
    website: osmPlace['website'] ?? match.website ?? null,
    photos: photos.length > 0 ? photos : osmPlace['photos'],
    is_open_now: match.opening_hours?.open_now ?? osmPlace['is_open_now'],
    // Google-источник помечаем как обогащение, но базовая запись остаётся OSM:
    // иначе повторный запрос создаст дубль с другим source.
    tags: [...((osmPlace['tags'] as string[]) ?? []), 'google-enriched'],
  };
}

// ---------------------------------------------------------------------------
// Обработчик
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }

  try {
    const url = new URL(req.url);
    const lat = Number(url.searchParams.get('lat'));
    const lng = Number(url.searchParams.get('lng'));
    const radius = Math.min(Number(url.searchParams.get('radius') ?? 3000), 20_000);
    const forceRefresh = url.searchParams.get('refresh') === 'true';

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return errorResponse('Нужны параметры lat и lng', 400, req);
    }

    const supabase = adminClient();

    // -----------------------------------------------------------------------
    // 0. Отдаём из БД, если данные свежие и не просили обновление.
    // Это главная защита от лишних обращений к Overpass: они того не любят.
    // -----------------------------------------------------------------------
    if (!forceRefresh) {
      const { data: existing, count } = await supabase.rpc('nearby_places', {
        p_lat: lat,
        p_lng: lng,
        p_radius: radius,
        p_sort: 'distance',
        p_limit: 50,
        p_offset: 0,
      });

      if (!existing || existing.length === 0) {
        const { count: totalCount } = await supabase
          .from('places')
          .select('id', { count: 'exact', head: true })
          .eq('city', 'Tallinn');

        // Если база уже наполнена, но в этом радиусе пусто — это честный ответ «ничего нет»,
        // и дёргать Overpass не нужно.
        if ((totalCount ?? 0) > 50 && (count ?? 0) === 0) {
          return jsonResponse({ places: [], source: 'database', fetched: 0 }, 200, req);
        }
      } else {
        return jsonResponse(
          { places: existing, source: 'database', fetched: existing.length },
          200,
          req,
        );
      }
    }

    // -----------------------------------------------------------------------
    // 1. Внешние источники
    // -----------------------------------------------------------------------
    const [elements, googleResults] = await Promise.all([
      fetchOverpass(lat, lng, radius),
      fetchGooglePlaces(lat, lng, radius),
    ]);

    const normalized = elements
      .map(normalizeOverpass)
      .filter((p): p is Record<string, unknown> => p !== null)
      .map((p) => (googleResults.length > 0 ? mergeGoogleData(p, googleResults) : p));

    // OSM — не единственный источник: добавляем места из Google, которых нет в OSM.
    // Иначе в новых районах (например, Ülemiste) выдача будет пустой.
    const osmNames = new Set(normalized.map((p) => (p['name'] as string).toLowerCase()));
    const googleOnly = googleResults
      .filter((g) => g.geometry?.location && g.name && !osmNames.has(g.name.toLowerCase()))
      .map((g) => ({
        external_id: `google:${g.place_id}`,
        source: 'google' as const,
        name: g.name!,
        lat: g.geometry!.location.lat,
        lng: g.geometry!.location.lng,
        address: g.vicinity ?? null,
        city: 'Tallinn',
        country: 'EE',
        phone: g.formatted_phone_number ?? null,
        website: g.website ?? null,
        cuisine: [],
        price_level: g.price_level ?? null,
        rating: g.rating ?? null,
        reviews_count: g.user_ratings_total ?? 0,
        photos: (g.photos ?? []).slice(0, 5).map((p) => ({
          photo_reference: p.photo_reference,
          alt: g.name!,
        })),
        hours: {},
        tags: ['google'],
        amenities: {},
        is_open_now: g.opening_hours?.open_now ?? false,
      }));

    const allPlaces = [...normalized, ...googleOnly];

    // -----------------------------------------------------------------------
    // 2. Upsert в БД + кэш сырых ответов
    // -----------------------------------------------------------------------
    if (allPlaces.length > 0) {
      const { error: upsertError } = await supabase
        .from('places')
        .upsert(allPlaces, { onConflict: 'source,external_id', ignoreDuplicates: false });

      if (upsertError) {
        console.error('[fetch-places] Ошибка upsert:', upsertError.message);
        // Не падаем: данные уже получены, отдадим их клиенту даже без сохранения.
      }

      const cacheRows = elements.map((el) => ({
        external_id: `osm:${el.type}/${el.id}`,
        source: 'osm' as const,
        payload: el as unknown,
        fetched_at: new Date().toISOString(),
      }));

      if (cacheRows.length > 0) {
        await supabase.from('place_cache').upsert(cacheRows, { onConflict: 'external_id' });
      }
    }

    // -----------------------------------------------------------------------
    // 3. Возвращаем нормализованный результат из БД (уже с id и distance_m)
    // -----------------------------------------------------------------------
    const { data: fresh } = await supabase.rpc('nearby_places', {
      p_lat: lat,
      p_lng: lng,
      p_radius: radius,
      p_sort: 'distance',
      p_limit: 50,
      p_offset: 0,
    });

    return jsonResponse(
      {
        places: fresh ?? [],
        source: googleResults.length > 0 ? 'osm+google' : 'osm',
        fetched: allPlaces.length,
      },
      200,
      req,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[fetch-places] Необработанная ошибка:', msg);
    return errorResponse('Не удалось загрузить заведения', 500, req);
  }
});
