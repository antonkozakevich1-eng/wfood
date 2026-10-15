-- ============================================================================
-- WFOOD — 001_init.sql
-- Базовая схема: пользователи, места, избранное, подборки, комнаты, ИИ, кэш.
-- Пилот: Эстония, Таллинн, EUR.
-- ============================================================================

-- Расширения -----------------------------------------------------------------
-- pg_trgm — нечёткий поиск по названию места («ля мула» найдёт «La Muula»).
-- cube/earthdistance не используем: считаем haversine в SQL-функции, этого достаточно
-- и не требует суперпользовательских прав в managed Supabase.
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";

-- Типы -----------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'place_source') then
    create type place_source as enum ('osm', 'google', '2gis', 'crowd');
  end if;
  if not exists (select 1 from pg_type where typname = 'room_status') then
    create type room_status as enum ('open', 'decided', 'closed', 'expired');
  end if;
  if not exists (select 1 from pg_type where typname = 'ai_provider') then
    create type ai_provider as enum ('gemini', 'openai', 'fallback', 'cache');
  end if;
end $$;

-- ============================================================================
-- profiles — профиль пользователя (1:1 с auth.users)
-- ============================================================================
create table if not exists public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  username       text,
  avatar_url     text,
  city           text        not null default 'Tallinn',
  country        text        not null default 'EE',
  currency       text        not null default 'EUR',
  prefs          jsonb       not null default '{}'::jsonb,
  diet           text,
  allergies      text[]      not null default '{}',
  default_budget integer     check (default_budget is null or default_budget >= 0),
  theme          text        not null default 'system' check (theme in ('system', 'light', 'dark')),
  language       text        not null default 'ru' check (language in ('ru', 'en')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on column public.profiles.prefs is
  'Свободные предпочтения: {"quiet": true, "dog_friendly": true, "work_friendly": false}';

-- ============================================================================
-- places — нормализованные заведения из всех источников
-- ============================================================================
create table if not exists public.places (
  id             uuid primary key default uuid_generate_v4(),
  -- external_id уникален в пределах источника: 'osm:node/123456', 'google:ChIJ...'
  external_id    text        not null,
  source         place_source not null default 'osm',
  name           text        not null,
  description    text,
  lat            double precision not null check (lat between -90 and 90),
  lng            double precision not null check (lng between -180 and 180),
  address        text,
  city           text        not null default 'Tallinn',
  country        text        not null default 'EE',
  phone          text,
  website        text,
  cuisine        text[]      not null default '{}',
  price_level    smallint    check (price_level is null or price_level between 1 and 4),
  rating         numeric(2,1) check (rating is null or rating between 0 and 5),
  reviews_count  integer     not null default 0,
  photos         jsonb       not null default '[]'::jsonb,
  hours          jsonb       not null default '{}'::jsonb,
  tags           text[]      not null default '{}',
  -- Атрибуты, по которым фильтрует UI (доставка, Wi-Fi, собаки, детское меню).
  amenities      jsonb       not null default '{}'::jsonb,
  is_open_now    boolean     not null default false,
  is_verified    boolean     not null default false,
  submitted_by   uuid        references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint places_source_external_id_key unique (source, external_id)
);

comment on column public.places.hours is
  'Формат OSM opening_hours как структура: {"mon":[["11:00","23:00"]], "raw":"Mo-Su 11:00-23:00"}';
comment on column public.places.amenities is
  '{"delivery":true,"wifi":true,"dog_friendly":false,"kids_menu":true,"outdoor":true}';

-- ============================================================================
-- favorites — избранное (уникально на пару пользователь-место)
-- ============================================================================
create table if not exists public.favorites (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  place_id   uuid not null references public.places (id) on delete cascade,
  note       text,
  created_at timestamptz not null default now(),
  constraint favorites_user_place_key unique (user_id, place_id)
);

-- ============================================================================
-- collections — личные подборки («Хочу сходить», «Свидание», ...)
-- ============================================================================
create table if not exists public.collections (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 80),
  emoji       text not null default '🍽️',
  description text,
  cover_url   text,
  is_public   boolean not null default false,
  -- Короткий слаг для шаринга: /c/abc12345
  share_slug  text unique default encode(gen_random_bytes(6), 'hex'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================================
-- collection_places — M:N подборки и места
-- ============================================================================
create table if not exists public.collection_places (
  collection_id uuid not null references public.collections (id) on delete cascade,
  place_id      uuid not null references public.places (id) on delete cascade,
  added_at      timestamptz not null default now(),
  primary key (collection_id, place_id)
);

-- ============================================================================
-- rooms / room_members / room_suggestions — групповой режим выбора
-- ============================================================================
create table if not exists public.rooms (
  id          uuid primary key default uuid_generate_v4(),
  host_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null default 'Где поедим?',
  status      room_status not null default 'open',
  -- Общий результат: заполняется, когда ИИ собрал решение.
  decision    jsonb,
  -- Комната живёт 6 часов: этого хватает на «сейчас поедим».
  expires_at  timestamptz not null default (now() + interval '6 hours'),
  created_at  timestamptz not null default now()
);

create table if not exists public.room_members (
  room_id   uuid not null references public.rooms (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  -- Гость без аккаунта: анонимный идентификатор браузера.
  guest_name text,
  is_ready  boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists public.room_suggestions (
  id         uuid primary key default uuid_generate_v4(),
  room_id    uuid not null references public.rooms (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  place_id   uuid references public.places (id) on delete set null,
  -- Пожелание текстом: «хочу суп», «только не суши».
  wish       text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- ai_chats — журнал запросов к ИИ (он же счётчик суточного лимита)
-- ============================================================================
create table if not exists public.ai_chats (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid references auth.users (id) on delete cascade,
  room_id         uuid references public.rooms (id) on delete cascade,
  message         text not null,
  response        text,
  reasoning       text,
  -- Хеш для кэша одинаковых запросов: md5(message + filters + гео-квадрат).
  request_hash    text,
  place_ids       uuid[] not null default '{}',
  context_places  jsonb not null default '[]'::jsonb,
  provider        ai_provider not null default 'gemini',
  tokens_used     integer not null default 0,
  latency_ms      integer,
  -- Ответ отдан из кэша, а не сгенерирован заново (не тратит лимит).
  from_cache      boolean not null default false,
  created_at      timestamptz not null default now()
);

-- ============================================================================
-- generated_images — кэш картинок DALL·E 3 (не платим дважды за один промпт)
-- ============================================================================
create table if not exists public.generated_images (
  id         uuid primary key default uuid_generate_v4(),
  -- Хеш промпта+параметров: одинаковый запрос → одна генерация.
  prompt_hash text not null,
  prompt     text not null,
  url        text not null,
  provider   text not null default 'openai',
  model      text not null default 'dall-e-3',
  size       text not null default '1024x1024',
  quality    text not null default 'standard',
  style      text not null default 'vivid',
  storage_path text,
  created_at timestamptz not null default now(),
  constraint generated_images_prompt_hash_key unique (prompt_hash)
);

-- ============================================================================
-- place_cache — сырой ответ внешнего источника (чтобы не дёргать API лишний раз)
-- ============================================================================
create table if not exists public.place_cache (
  external_id text primary key,
  source      place_source not null,
  payload     jsonb not null,
  fetched_at  timestamptz not null default now(),
  ttl_seconds integer not null default 604800
);

-- ============================================================================
-- Триггеры updated_at
-- ============================================================================
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists places_touch on public.places;
create trigger places_touch before update on public.places
  for each row execute function public.touch_updated_at();

drop trigger if exists collections_touch on public.collections;
create trigger collections_touch before update on public.collections
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- Автосоздание профиля при регистрации
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- haversine_distance — расстояние в метрах между двумя точками
-- Используется в RPC nearby_places и в сортировке по расстоянию.
-- ============================================================================
create or replace function public.haversine_distance(
  lat1 double precision,
  lng1 double precision,
  lat2 double precision,
  lng2 double precision
)
returns double precision
language sql
immutable
parallel safe
as $$
  select 6371000 * 2 * asin(
    sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) *
      power(sin(radians(lng2 - lng1) / 2), 2)
    )
  );
$$;

-- ============================================================================
-- RPC nearby_places — главный запрос вкладки «Рядом»
-- Фильтры применяются на сервере: клиент не тянет лишние строки.
-- ============================================================================
create or replace function public.nearby_places(
  p_lat          double precision,
  p_lng          double precision,
  p_radius       integer default 3000,
  p_cuisines     text[] default null,
  p_price_levels smallint[] default null,
  p_min_rating   numeric default null,
  p_open_now     boolean default false,
  p_amenities    text[] default null,
  p_search       text default null,
  p_sort         text default 'distance',
  p_limit        integer default 20,
  p_offset       integer default 0
)
returns table (
  id            uuid,
  external_id   text,
  source        place_source,
  name          text,
  description   text,
  lat           double precision,
  lng           double precision,
  address       text,
  phone         text,
  website       text,
  cuisine       text[],
  price_level   smallint,
  rating        numeric,
  reviews_count integer,
  photos        jsonb,
  hours         jsonb,
  tags          text[],
  amenities     jsonb,
  is_open_now   boolean,
  distance_m    double precision
)
language sql
stable
security invoker
as $$
  with candidates as (
    select
      p.*,
      public.haversine_distance(p_lat, p_lng, p.lat, p.lng) as dist
    from public.places p
    where
      -- Грубый отсев по bounding box до точного haversine: индекс работает, полный скан не нужен.
      p.lat between p_lat - (p_radius / 111320.0) and p_lat + (p_radius / 111320.0)
      and p.lng between p_lng - (p_radius / (111320.0 * greatest(cos(radians(p_lat)), 0.01)))
                    and p_lng + (p_radius / (111320.0 * greatest(cos(radians(p_lat)), 0.01)))
  )
  select
    c.id, c.external_id, c.source, c.name, c.description, c.lat, c.lng, c.address,
    c.phone, c.website, c.cuisine, c.price_level, c.rating, c.reviews_count,
    c.photos, c.hours, c.tags, c.amenities, c.is_open_now, c.dist
  from candidates c
  where
    c.dist <= p_radius
    and (p_cuisines is null or array_length(p_cuisines, 1) is null or c.cuisine && p_cuisines)
    and (p_price_levels is null or array_length(p_price_levels, 1) is null or c.price_level = any (p_price_levels))
    and (p_min_rating is null or coalesce(c.rating, 0) >= p_min_rating)
    and (p_open_now is false or c.is_open_now is true)
    -- Удобства: выбрано несколько → место должно иметь ВСЕ выбранные (AND).
    -- Проверяем через not exists, чтобы не зависеть от порядка и длины массива.
    and (
      p_amenities is null
      or array_length(p_amenities, 1) is null
      or not exists (
        select 1
        from unnest(p_amenities) as a
        where a in ('delivery', 'wifi', 'dog_friendly', 'kids_menu', 'outdoor')
          and coalesce((c.amenities ->> a)::boolean, false) is false
      )
    )
    and (
      p_search is null or p_search = ''
      or c.name ilike '%' || p_search || '%'
      or c.address ilike '%' || p_search || '%'
      or exists (select 1 from unnest(c.cuisine) cu where cu ilike '%' || p_search || '%')
      or exists (select 1 from unnest(c.tags) t where t ilike '%' || p_search || '%')
    )
  order by
    case when p_sort = 'distance'    then c.dist end asc nulls last,
    case when p_sort = 'rating'      then c.rating end desc nulls last,
    case when p_sort = 'popularity'  then c.reviews_count end desc nulls last,
    case when p_sort = 'newest'      then extract(epoch from c.created_at) end desc nulls last,
    -- Стабильный второй ключ: без него пагинация может дублировать строки.
    c.dist asc
  limit least(greatest(p_limit, 1), 50)
  offset greatest(p_offset, 0);
$$;

comment on function public.nearby_places is
  'Ближайшие места с фильтрами. p_sort: distance|rating|popularity|newest.';

-- ============================================================================
-- RPC nearby_places_count — сколько всего подходит под фильтры (для «показать ещё»)
-- ============================================================================
create or replace function public.nearby_places_count(
  p_lat double precision,
  p_lng double precision,
  p_radius integer default 3000,
  p_cuisines text[] default null,
  p_price_levels smallint[] default null,
  p_min_rating numeric default null,
  p_open_now boolean default false,
  p_amenities text[] default null,
  p_search text default null
)
returns integer
language sql
stable
security invoker
as $$
  select count(*)::integer
  from public.nearby_places(
    p_lat, p_lng, p_radius, p_cuisines, p_price_levels,
    p_min_rating, p_open_now, p_amenities, p_search, 'distance', 50, 0
  );
$$;

-- ============================================================================
-- RPC ai_usage_today — сколько ИИ-запросов потрачено сегодня (лимит 10/день)
-- Считаем на сервере: чистка localStorage лимит не обнуляет.
-- ============================================================================
create or replace function public.ai_usage_today(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.ai_chats
  where user_id = p_user_id
    and from_cache = false
    and created_at >= date_trunc('day', now() at time zone 'utc');
$$;

-- ============================================================================
-- RPC collection_by_slug — публичная подборка по слагу (для шаринга ссылкой)
-- ============================================================================
create or replace function public.collection_by_slug(p_slug text)
returns table (
  collection_id uuid,
  title         text,
  emoji         text,
  description   text,
  cover_url     text,
  is_public     boolean,
  share_slug    text,
  owner_name    text,
  place_count   bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id, c.title, c.emoji, c.description, c.cover_url, c.is_public, c.share_slug,
    pr.username, count(cp.place_id)
  from public.collections c
  left join public.profiles pr on pr.id = c.user_id
  left join public.collection_places cp on cp.collection_id = c.id
  where c.share_slug = p_slug and c.is_public = true
  group by c.id, pr.username;
$$;
