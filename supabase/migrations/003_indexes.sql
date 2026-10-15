-- ============================================================================
-- WFOOD — 003_indexes.sql
-- Индексы под реальные запросы приложения.
-- Принцип: индекс создаётся только там, где есть конкретный запрос из кода.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- places: гео-поиск
-- nearby_places сначала отсекает по bounding box (lat/lng BETWEEN), поэтому
-- составной btree по (lat, lng) — самый эффективный вариант: он даёт range scan
-- по широте и точную фильтрацию по долготе внутри выборки.
-- GIST (btree_gist) был бы лучше для произвольных полигонов, но для
-- «прямоугольник вокруг пользователя» btree проще, дешевле по записи и не
-- требует доп. расширения.
-- ---------------------------------------------------------------------------
create index if not exists places_lat_lng_idx on public.places (lat, lng);

-- Отдельный btree по lng полезен, когда долгота — ведущий фильтр (маленький радиус).
create index if not exists places_lng_idx on public.places (lng);

-- ---------------------------------------------------------------------------
-- places: сортировки и фильтры UI
-- ---------------------------------------------------------------------------
-- Сортировка по рейтингу (partial: места без рейтинга не нужны в выдаче «рейтинг 4+»).
create index if not exists places_rating_idx
  on public.places (rating desc nulls last)
  where rating is not null;

create index if not exists places_reviews_count_idx
  on public.places (reviews_count desc);

create index if not exists places_created_at_idx
  on public.places (created_at desc);

create index if not exists places_price_level_idx
  on public.places (price_level)
  where price_level is not null;

create index if not exists places_is_open_now_idx
  on public.places (is_open_now)
  where is_open_now = true;

-- ---------------------------------------------------------------------------
-- places: массивы cuisine[] / tags[] → GIN
-- Оператор пересечения массивов && (используется в nearby_places) работает
-- по GIN-индексу; обычный btree для массивов бесполезен.
-- ---------------------------------------------------------------------------
create index if not exists places_cuisine_gin_idx on public.places using gin (cuisine);
create index if not exists places_tags_gin_idx on public.places using gin (tags);

-- ---------------------------------------------------------------------------
-- places: jsonb amenities → GIN
-- Нужен для фильтров «доставка», «Wi-Fi», «можно с собакой».
-- jsonb_path_ops компактнее и быстрее для проверок вхождения (@>).
-- ---------------------------------------------------------------------------
create index if not exists places_amenities_gin_idx
  on public.places using gin (amenities jsonb_path_ops);

-- ---------------------------------------------------------------------------
-- places: нечёткий поиск по названию и адресу
-- pg_trgm позволяет искать «muula» → «La Muula» и переживает опечатки.
-- ---------------------------------------------------------------------------
create index if not exists places_name_trgm_idx
  on public.places using gin (name gin_trgm_ops);

create index if not exists places_address_trgm_idx
  on public.places using gin (address gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- places: источник
-- ---------------------------------------------------------------------------
create index if not exists places_source_idx on public.places (source);
create index if not exists places_city_idx on public.places (city);

-- ---------------------------------------------------------------------------
-- favorites
-- ---------------------------------------------------------------------------
create index if not exists favorites_user_id_idx on public.favorites (user_id, created_at desc);
create index if not exists favorites_place_id_idx on public.favorites (place_id);

-- ---------------------------------------------------------------------------
-- collections / collection_places
-- ---------------------------------------------------------------------------
create index if not exists collections_user_id_idx on public.collections (user_id, created_at desc);
create index if not exists collections_is_public_idx
  on public.collections (is_public)
  where is_public = true;
create index if not exists collection_places_place_id_idx
  on public.collection_places (place_id);

-- ---------------------------------------------------------------------------
-- rooms / room_members / room_suggestions
-- ---------------------------------------------------------------------------
create index if not exists rooms_host_id_idx on public.rooms (host_id);
-- Частый запрос: «мои активные комнаты».
create index if not exists rooms_status_expires_idx on public.rooms (status, expires_at desc);
create index if not exists room_members_user_id_idx on public.room_members (user_id);
create index if not exists room_suggestions_room_id_idx
  on public.room_suggestions (room_id, created_at);
create index if not exists room_suggestions_user_id_idx on public.room_suggestions (user_id);

-- ---------------------------------------------------------------------------
-- ai_chats
-- ---------------------------------------------------------------------------
-- Главный запрос: лимит за сутки по пользователю.
create index if not exists ai_chats_user_created_idx
  on public.ai_chats (user_id, created_at desc);

-- Кэш одинаковых запросов: ищем по хешу свежие ответы.
create index if not exists ai_chats_request_hash_idx
  on public.ai_chats (request_hash, created_at desc)
  where request_hash is not null;

create index if not exists ai_chats_room_id_idx
  on public.ai_chats (room_id)
  where room_id is not null;

-- ---------------------------------------------------------------------------
-- generated_images
-- ---------------------------------------------------------------------------
create index if not exists generated_images_prompt_hash_idx
  on public.generated_images (prompt_hash);
create index if not exists generated_images_created_at_idx
  on public.generated_images (created_at desc);

-- ---------------------------------------------------------------------------
-- place_cache
-- TTL-выборка: «что протухло и требует обновления».
-- ---------------------------------------------------------------------------
create index if not exists place_cache_fetched_at_idx on public.place_cache (fetched_at desc);
create index if not exists place_cache_source_idx on public.place_cache (source);

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create index if not exists profiles_city_idx on public.profiles (city);
create index if not exists profiles_username_trgm_idx
  on public.profiles using gin (username gin_trgm_ops);

-- ============================================================================
-- Обновление статистики после создания индексов.
-- ============================================================================
analyze public.places;
analyze public.favorites;
analyze public.collections;
