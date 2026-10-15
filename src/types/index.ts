/**
 * Типы WFOOD. Единый источник правды для всего приложения —
 * соответствует схеме БД из supabase/migrations/001_init.sql.
 */

// ============================================================================
// Места
// ============================================================================

export type PlaceSource = 'osm' | 'google' | '2gis' | 'crowd';

export interface PlacePhoto {
  url?: string;
  /** Ссылка Google Places: сам URL содержит API-ключ, храним только reference. */
  photo_reference?: string;
  alt?: string;
}

/** Место в том виде, в каком его возвращает RPC nearby_places. */
export interface Place {
  id: string;
  external_id: string;
  source: PlaceSource;
  name: string;
  description: string | null;
  lat: number;
  lng: number;
  address: string | null;
  phone: string | null;
  website: string | null;
  cuisine: string[];
  price_level: number | null;
  rating: number | null;
  reviews_count: number;
  photos: PlacePhoto[];
  hours: OpeningHours;
  tags: string[];
  amenities: PlaceAmenities;
  is_open_now: boolean;
  /** Расстояние в метрах от пользователя. Считает Postgres. */
  distance_m: number;
}

export interface PlaceAmenities {
  delivery?: boolean;
  wifi?: boolean;
  dog_friendly?: boolean;
  kids_menu?: boolean;
  outdoor?: boolean;
  [key: string]: boolean | undefined;
}

export interface OpeningHours {
  raw?: string | null;
  mon?: Array<[string, string]>;
  tue?: Array<[string, string]>;
  wed?: Array<[string, string]>;
  thu?: Array<[string, string]>;
  fri?: Array<[string, string]>;
  sat?: Array<[string, string]>;
  sun?: Array<[string, string]>;
  /** Индексная сигнатура: позволяет итерировать по дням недели динамически. */
  [key: string]: unknown;
}

// ============================================================================
// Фильтры
// ============================================================================

export type PriceLevel = 1 | 2 | 3 | 4;

export type AmenityKey = 'delivery' | 'wifi' | 'dog_friendly' | 'kids_menu' | 'outdoor';

export type SortOption = 'distance' | 'rating' | 'popularity' | 'newest';

export interface Filters {
  /** Радиус в метрах: 500 / 1000 / 3000 / 5000 / 10000. */
  radius: number;
  cuisines: string[];
  priceLevels: PriceLevel[];
  minRating: number | null;
  openNow: boolean;
  amenities: AmenityKey[];
  search: string;
  sort: SortOption;
}

export const RADIUS_OPTIONS = [500, 1000, 3000, 5000, 10000] as const;

export type RadiusOption = (typeof RADIUS_OPTIONS)[number];

export const DEFAULT_FILTERS: Filters = {
  radius: 3000,
  cuisines: [],
  priceLevels: [],
  minRating: null,
  openNow: false,
  amenities: [],
  search: '',
  sort: 'distance',
};

// ============================================================================
// Геолокация
// ============================================================================

export interface Coords {
  lat: number;
  lng: number;
}

export interface GeolocationState {
  coords: Coords | null;
  accuracy: number | null;
  loading: boolean;
  error: string | null;
  /** Пользователь запретил доступ к геолокации (не путать с ошибкой сети). */
  denied: boolean;
}

// ============================================================================
// ИИ
// ============================================================================

export type AiProvider = 'gemini' | 'openai' | 'fallback' | 'cache';

export interface AiChatRequest {
  message: string;
  roomId?: string | null;
  places?: AiPlaceContext[];
  weather?: WeatherContext | null;
  mode?: 'chat' | 'room';
  lat?: number;
  lng?: number;
}

export interface AiPlaceContext {
  id: string;
  name: string;
  cuisine: string[];
  price_level: number | null;
  rating: number | null;
  distance_m: number;
  is_open_now: boolean;
  address: string | null;
}

export interface AiChatResponse {
  chatId?: string | null;
  reply: string;
  place_ids: string[];
  reasoning: string;
  provider: AiProvider;
  fromCache: boolean;
  usageToday?: number;
  limit?: number;
  latencyMs?: number;
  degraded?: boolean;
  debugErrors?: string[];
}

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  /** Места, привязанные к ответу ассистента (рендерятся карточками). */
  places?: Place[];
  reasoning?: string;
  provider?: AiProvider;
  fromCache?: boolean;
  timestamp: number;
  error?: boolean;
}

// ============================================================================
// Погода
// ============================================================================

export interface WeatherContext {
  temp: number;
  description: string;
  icon: string;
}

// ============================================================================
// Избранное и подборки
// ============================================================================

export interface Favorite {
  id: string;
  user_id: string;
  place_id: string;
  note: string | null;
  created_at: string;
  place?: Place;
}

export interface Collection {
  id: string;
  user_id: string;
  title: string;
  emoji: string;
  description: string | null;
  cover_url: string | null;
  is_public: boolean;
  share_slug: string | null;
  created_at: string;
  updated_at: string;
  place_count?: number;
}

export interface CollectionPlace {
  collection_id: string;
  place_id: string;
  added_at: string;
  place?: Place;
}

// ============================================================================
// Групповой режим
// ============================================================================

export type RoomStatus = 'open' | 'decided' | 'closed' | 'expired';

export interface Room {
  id: string;
  host_id: string;
  title: string;
  status: RoomStatus;
  decision: RoomDecision | null;
  expires_at: string;
  created_at: string;
}

export interface RoomDecision {
  place_id: string;
  place_name: string;
  reasoning: string;
  decided_at: string;
}

export interface RoomMember {
  room_id: string;
  user_id: string;
  guest_name: string | null;
  is_ready: boolean;
  joined_at: string;
  profile?: Profile;
}

export interface RoomSuggestion {
  id: string;
  room_id: string;
  user_id: string;
  place_id: string | null;
  wish: string | null;
  created_at: string;
}

// ============================================================================
// Профиль
// ============================================================================

export type Theme = 'system' | 'light' | 'dark';
export type Language = 'ru' | 'en';

export interface Profile {
  id: string;
  username: string | null;
  avatar_url: string | null;
  city: string;
  country: string;
  currency: string;
  prefs: ProfilePrefs;
  diet: string | null;
  allergies: string[];
  default_budget: number | null;
  theme: Theme;
  language: Language;
  created_at: string;
  updated_at: string;
}

export interface ProfilePrefs {
  quiet?: boolean;
  dog_friendly?: boolean;
  work_friendly?: boolean;
  [key: string]: boolean | undefined;
}

// ============================================================================
// Прочее
// ============================================================================

export interface AiUsage {
  used: number;
  limit: number;
  remaining: number;
  limitReached: boolean;
}

/** Тип ответа Edge Function fetch-places. */
export interface FetchPlacesResponse {
  places: Place[];
  source: string;
  fetched: number;
}

export interface GenerateImageResponse {
  url: string | null;
  cached: boolean;
  provider: string;
  reason?: string;
  size?: string;
}
