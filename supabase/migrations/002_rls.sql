-- ============================================================================
-- WFOOD — 002_rls.sql
-- Row Level Security: доступ к данным только владельцу (или участнику комнаты).
-- Принцип: RLS включён на ВСЕХ пользовательских таблицах. Публичного доступа
-- к персональным данным нет по умолчанию — исключения описаны явно.
-- ============================================================================

alter table public.profiles          enable row level security;
alter table public.places            enable row level security;
alter table public.favorites         enable row level security;
alter table public.collections       enable row level security;
alter table public.collection_places enable row level security;
alter table public.rooms             enable row level security;
alter table public.room_members      enable row level security;
alter table public.room_suggestions  enable row level security;
alter table public.ai_chats          enable row level security;
alter table public.generated_images  enable row level security;
alter table public.place_cache       enable row level security;

-- ============================================================================
-- profiles
-- Читать профиль может любой авторизованный (нужно для имён в комнатах),
-- но менять — только свой. Гостевые (anon) чтения чужих профилей нет.
-- ============================================================================
drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists profiles_delete_self on public.profiles;
create policy profiles_delete_self
  on public.profiles for delete
  to authenticated
  using (auth.uid() = id);

-- ============================================================================
-- places
-- Читают ВСЕ, включая анонимных: карта должна работать до логина.
-- Пишут: краудсорсинг от авторизованных (только свои записи),
-- и Edge Function через service_role (он RLS обходит).
-- ============================================================================
drop policy if exists places_select_public on public.places;
create policy places_select_public
  on public.places for select
  to anon, authenticated
  using (true);

drop policy if exists places_insert_crowd on public.places;
create policy places_insert_crowd
  on public.places for insert
  to authenticated
  with check (source = 'crowd' and submitted_by = auth.uid());

-- Правку краудсорсингового места делает только его автор.
-- Места из OSM/Google редактируются исключительно service_role.
drop policy if exists places_update_own_crowd on public.places;
create policy places_update_own_crowd
  on public.places for update
  to authenticated
  using (source = 'crowd' and submitted_by = auth.uid())
  with check (source = 'crowd' and submitted_by = auth.uid());

drop policy if exists places_delete_own_crowd on public.places;
create policy places_delete_own_crowd
  on public.places for delete
  to authenticated
  using (source = 'crowd' and submitted_by = auth.uid());

-- ============================================================================
-- favorites — строго приватно
-- ============================================================================
drop policy if exists favorites_select_own on public.favorites;
create policy favorites_select_own
  on public.favorites for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists favorites_insert_own on public.favorites;
create policy favorites_insert_own
  on public.favorites for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists favorites_update_own on public.favorites;
create policy favorites_update_own
  on public.favorites for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists favorites_delete_own on public.favorites;
create policy favorites_delete_own
  on public.favorites for delete
  to authenticated
  using (auth.uid() = user_id);

-- ============================================================================
-- collections — свои + публичные по прямой ссылке
-- ============================================================================
drop policy if exists collections_select_own_or_public on public.collections;
create policy collections_select_own_or_public
  on public.collections for select
  to anon, authenticated
  using (is_public = true or auth.uid() = user_id);

drop policy if exists collections_insert_own on public.collections;
create policy collections_insert_own
  on public.collections for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists collections_update_own on public.collections;
create policy collections_update_own
  on public.collections for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists collections_delete_own on public.collections;
create policy collections_delete_own
  on public.collections for delete
  to authenticated
  using (auth.uid() = user_id);

-- ============================================================================
-- collection_places — доступ по владению подборкой
-- ============================================================================
drop policy if exists collection_places_select on public.collection_places;
create policy collection_places_select
  on public.collection_places for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.collections c
      where c.id = collection_id
        and (c.is_public = true or c.user_id = auth.uid())
    )
  );

drop policy if exists collection_places_insert_own on public.collection_places;
create policy collection_places_insert_own
  on public.collection_places for insert
  to authenticated
  with check (
    exists (
      select 1 from public.collections c
      where c.id = collection_id and c.user_id = auth.uid()
    )
  );

drop policy if exists collection_places_delete_own on public.collection_places;
create policy collection_places_delete_own
  on public.collection_places for delete
  to authenticated
  using (
    exists (
      select 1 from public.collections c
      where c.id = collection_id and c.user_id = auth.uid()
    )
  );

-- ============================================================================
-- rooms — видят хост и участники
-- ============================================================================
drop policy if exists rooms_select_member on public.rooms;
create policy rooms_select_member
  on public.rooms for select
  to authenticated
  using (
    host_id = auth.uid()
    or exists (
      select 1 from public.room_members m
      where m.room_id = id and m.user_id = auth.uid()
    )
  );

drop policy if exists rooms_insert_host on public.rooms;
create policy rooms_insert_host
  on public.rooms for insert
  to authenticated
  with check (host_id = auth.uid());

drop policy if exists rooms_update_host on public.rooms;
create policy rooms_update_host
  on public.rooms for update
  to authenticated
  using (host_id = auth.uid())
  with check (host_id = auth.uid());

drop policy if exists rooms_delete_host on public.rooms;
create policy rooms_delete_host
  on public.rooms for delete
  to authenticated
  using (host_id = auth.uid());

-- ============================================================================
-- room_members
-- ВАЖНО: участник должен видеть СПИСОК других участников — иначе групповой
-- режим не работает. Поэтому select открыт всем, кто уже в комнате,
-- а не только «своя строка».
-- ============================================================================
drop policy if exists room_members_select_member on public.room_members;
create policy room_members_select_member
  on public.room_members for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.room_members me
      where me.room_id = room_id and me.user_id = auth.uid()
    )
    or exists (
      select 1 from public.rooms r
      where r.id = room_id and r.host_id = auth.uid()
    )
  );

-- Вступить можно в открытую, не истёкшую комнату — от своего имени.
drop policy if exists room_members_insert_self on public.room_members;
create policy room_members_insert_self
  on public.room_members for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.rooms r
      where r.id = room_id and r.status = 'open' and r.expires_at > now()
    )
  );

-- Отметить «готов» может только сам участник (и хост — для управления комнатой).
drop policy if exists room_members_update_self on public.room_members;
create policy room_members_update_self
  on public.room_members for update
  to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.rooms r where r.id = room_id and r.host_id = auth.uid())
  )
  with check (user_id = auth.uid() or exists (select 1 from public.rooms r where r.id = room_id and r.host_id = auth.uid()));

drop policy if exists room_members_delete_self_or_host on public.room_members;
create policy room_members_delete_self_or_host
  on public.room_members for delete
  to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.rooms r where r.id = room_id and r.host_id = auth.uid())
  );

-- ============================================================================
-- room_suggestions — видят все участники комнаты
-- ============================================================================
drop policy if exists room_suggestions_select_member on public.room_suggestions;
create policy room_suggestions_select_member
  on public.room_suggestions for select
  to authenticated
  using (
    exists (
      select 1 from public.room_members m
      where m.room_id = room_id and m.user_id = auth.uid()
    )
    or exists (select 1 from public.rooms r where r.id = room_id and r.host_id = auth.uid())
  );

drop policy if exists room_suggestions_insert_member on public.room_suggestions;
create policy room_suggestions_insert_member
  on public.room_suggestions for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and (
      exists (
        select 1 from public.room_members m
        where m.room_id = room_id and m.user_id = auth.uid()
      )
      or exists (select 1 from public.rooms r where r.id = room_id and r.host_id = auth.uid())
    )
  );

drop policy if exists room_suggestions_delete_own on public.room_suggestions;
create policy room_suggestions_delete_own
  on public.room_suggestions for delete
  to authenticated
  using (user_id = auth.uid());

-- ============================================================================
-- ai_chats — только свои запросы.
-- Запись идёт из Edge Function через service_role (он RLS обходит),
-- поэтому insert-политики для клиента нет намеренно: клиент не должен
-- иметь возможности подделать provider/tokens_used/from_cache.
-- ============================================================================
drop policy if exists ai_chats_select_own on public.ai_chats;
create policy ai_chats_select_own
  on public.ai_chats for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists ai_chats_delete_own on public.ai_chats;
create policy ai_chats_delete_own
  on public.ai_chats for delete
  to authenticated
  using (auth.uid() = user_id);

-- ============================================================================
-- generated_images — кэш картинок читают все, пишет только service_role
-- ============================================================================
drop policy if exists generated_images_select_public on public.generated_images;
create policy generated_images_select_public
  on public.generated_images for select
  to anon, authenticated
  using (true);

-- ============================================================================
-- place_cache — внутренний кэш. Клиенту не нужен: только service_role.
-- Политик нет намеренно — значит, доступ запрещён для anon/authenticated.
-- ============================================================================

-- ============================================================================
-- GRANT'ы
-- ============================================================================
grant usage on schema public to anon, authenticated;

grant select on public.places, public.generated_images to anon, authenticated;
grant insert, update, delete on public.places to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;

grant select, insert, update, delete on public.favorites to authenticated;
grant select, insert, update, delete on public.collections to authenticated;
grant select, insert, update, delete on public.collection_places to authenticated;
grant select, insert, update, delete on public.rooms to authenticated;
grant select, insert, update, delete on public.room_members to authenticated;
grant select, insert, delete on public.room_suggestions to authenticated;
grant select, delete on public.ai_chats to authenticated;

grant execute on function public.nearby_places to anon, authenticated;
grant execute on function public.nearby_places_count to anon, authenticated;
grant execute on function public.collection_by_slug to anon, authenticated;
grant execute on function public.ai_usage_today to authenticated;
grant execute on function public.haversine_distance to anon, authenticated;

-- ============================================================================
-- Realtime для группового режима
-- Без этого подписки postgres_changes не получают события, и участники
-- комнаты не видят пожелания друг друга без перезагрузки страницы.
-- ============================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.room_suggestions;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.room_members;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.rooms;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- Realtime должен отдавать полную строку, а не только PK:
-- клиент рисует пожелание по полям, а не ходит за ним отдельно.
alter table public.room_suggestions replica identity full;
alter table public.room_members replica identity full;
