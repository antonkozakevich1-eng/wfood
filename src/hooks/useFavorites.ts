/**
 * Избранное и подборки.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { usePlacesStore } from '@/stores/placesStore';
import { analytics } from '@/lib/analytics';
import type { Collection, Place } from '@/types';

/** Список избранных мест с полными карточками. */
export function useFavorites() {
  const favoriteIds = usePlacesStore((s) => s.favoriteIds);
  const loadFavorites = usePlacesStore((s) => s.loadFavorites);
  const toggleFavorite = usePlacesStore((s) => s.toggleFavorite);

  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (!supabase) {
      setPlaces([]);
      setLoading(false);
      return;
    }

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session?.user) {
        setPlaces([]);
        setLoading(false);
        return;
      }

      // Один запрос с join вместо N+1: выбираем избранное вместе с местами.
      const { data, error: queryError } = await supabase
        .from('favorites')
        .select('place_id, created_at, places(*)')
        .order('created_at', { ascending: false });

      if (queryError) throw queryError;

      const rows = (data ?? []) as unknown as Array<{ places: Record<string, unknown> | null }>;
      const mapped = rows
        .map((row) => row.places)
        .filter((p): p is Record<string, unknown> => Boolean(p))
        .map((raw) => ({
          id: String(raw['id']),
          external_id: String(raw['external_id'] ?? ''),
          source: (raw['source'] as Place['source']) ?? 'osm',
          name: String(raw['name'] ?? ''),
          description: (raw['description'] as string | null) ?? null,
          lat: Number(raw['lat'] ?? 0),
          lng: Number(raw['lng'] ?? 0),
          address: (raw['address'] as string | null) ?? null,
          phone: (raw['phone'] as string | null) ?? null,
          website: (raw['website'] as string | null) ?? null,
          cuisine: Array.isArray(raw['cuisine']) ? (raw['cuisine'] as string[]) : [],
          price_level: raw['price_level'] === null ? null : Number(raw['price_level']),
          rating: raw['rating'] === null ? null : Number(raw['rating']),
          reviews_count: Number(raw['reviews_count'] ?? 0),
          photos: Array.isArray(raw['photos']) ? (raw['photos'] as Place['photos']) : [],
          hours: (raw['hours'] as Place['hours']) ?? {},
          tags: Array.isArray(raw['tags']) ? (raw['tags'] as string[]) : [],
          amenities: (raw['amenities'] as Place['amenities']) ?? {},
          is_open_now: Boolean(raw['is_open_now']),
          distance_m: 0,
        }));

      setPlaces(mapped);
    } catch (err) {
      console.error('[useFavorites] Ошибка:', err);
      setError('Не удалось загрузить избранное');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFavorites();
    void load();
  }, [loadFavorites, load]);

  const remove = useCallback(
    async (place: Place) => {
      analytics.favoriteToggled(place, false);
      await toggleFavorite(place);
      setPlaces((prev) => prev.filter((p) => p.id !== place.id));
    },
    [toggleFavorite],
  );

  return {
    places,
    loading,
    error,
    count: favoriteIds.size,
    reload: load,
    remove,
  };
}

/** Подборки пользователя. */
export function useCollections() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (!supabase) {
      setCollections([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error: queryError } = await supabase
        .from('collections')
        .select('*, collection_places(count)')
        .order('created_at', { ascending: false });

      if (queryError) throw queryError;

      const mapped = ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
        const counts = row['collection_places'] as Array<{ count: number }> | undefined;
        return {
          ...(row as unknown as Collection),
          place_count: counts?.[0]?.count ?? 0,
        };
      });

      setCollections(mapped);
    } catch (err) {
      console.error('[useCollections] Ошибка:', err);
      setError('Не удалось загрузить подборки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = useCallback(
    async (title: string, emoji: string): Promise<Collection | null> => {
      if (!supabase) return null;

      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user.id;
      if (!userId) throw new Error('Войдите, чтобы создавать подборки');

      const { data, error: insertError } = await supabase
        .from('collections')
        .insert({ user_id: userId, title, emoji })
        .select()
        .single();

      if (insertError) throw insertError;

      const created = data as Collection;
      setCollections((prev) => [{ ...created, place_count: 0 }, ...prev]);
      return created;
    },
    [],
  );

  const remove = useCallback(async (id: string) => {
    if (!supabase) return;

    const { error: deleteError } = await supabase.from('collections').delete().eq('id', id);
    if (deleteError) throw deleteError;

    setCollections((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const togglePublic = useCallback(
    async (id: string, isPublic: boolean) => {
      if (!supabase) return;

      const { error: updateError } = await supabase
        .from('collections')
        .update({ is_public: isPublic })
        .eq('id', id);

      if (updateError) throw updateError;

      setCollections((prev) =>
        prev.map((c) => (c.id === id ? { ...c, is_public: isPublic } : c)),
      );
    },
    [],
  );

  const addPlace = useCallback(async (collectionId: string, placeId: string) => {
    if (!supabase) return;

    const { error: insertError } = await supabase
      .from('collection_places')
      .insert({ collection_id: collectionId, place_id: placeId });

    // 23505 = уже добавлено, это не ошибка для пользователя.
    if (insertError && insertError.code !== '23505') throw insertError;

    setCollections((prev) =>
      prev.map((c) =>
        c.id === collectionId ? { ...c, place_count: (c.place_count ?? 0) + 1 } : c,
      ),
    );
  }, []);

  return {
    collections,
    loading,
    error,
    reload: load,
    create,
    remove,
    togglePublic,
    addPlace,
  };
}

/** Ссылка для шаринга подборки. */
export function shareLink(slug: string): string {
  return `${window.location.origin}/c/${slug}`;
}
