/**
 * Публичная страница подборки (открывается по ссылке /c/:slug).
 * Доступна без авторизации — в этом и смысл шаринга.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { EmptyState } from '@/components/layout/EmptyState';
import { PlaceCard } from '@/components/place/PlaceCard';
import { PlaceDetails } from '@/components/place/PlaceDetails';
import { Button } from '@/components/ui/button';
import { PlaceListSkeleton } from '@/components/ui/skeleton';
import { supabase } from '@/lib/supabase';
import { usePlacesStore } from '@/stores/placesStore';
import { toast } from '@/hooks/useToast';
import { pluralRu } from '@/lib/utils';
import type { Place } from '@/types';

interface CollectionMeta {
  collection_id: string;
  title: string;
  emoji: string;
  description: string | null;
  owner_name: string | null;
  place_count: number;
}

export default function CollectionPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const favoriteIds = usePlacesStore((s) => s.favoriteIds);
  const loadFavorites = usePlacesStore((s) => s.loadFavorites);
  const toggleFavorite = usePlacesStore((s) => s.toggleFavorite);

  const [meta, setMeta] = useState<CollectionMeta | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const load = useCallback(async () => {
    if (!supabase || !slug) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    try {
      const { data: metaRows, error: metaError } = await supabase.rpc('collection_by_slug', {
        p_slug: slug,
      });

      if (metaError) throw metaError;

      const first = (metaRows as CollectionMeta[] | null)?.[0];
      if (!first) {
        setNotFound(true);
        return;
      }

      setMeta(first);

      const { data: placeRows, error: placesError } = await supabase
        .from('collection_places')
        .select('place_id, added_at, places(*)')
        .eq('collection_id', first.collection_id)
        .order('added_at', { ascending: false });

      if (placesError) throw placesError;

      const mapped = ((placeRows ?? []) as unknown as Array<{
        places: Record<string, unknown> | null;
      }>)
        .map((row) => row.places)
        .filter((p): p is Record<string, unknown> => Boolean(p))
        .map(
          (raw): Place => ({
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
          }),
        );

      setPlaces(mapped);
    } catch (err) {
      console.error('[CollectionPage] Ошибка:', err);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void loadFavorites();
    void load();
  }, [loadFavorites, load]);

  const handleToggleFavorite = useCallback(
    async (place: Place) => {
      try {
        await toggleFavorite(place);
        toast.success('Готово');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Не удалось');
      }
    },
    [toggleFavorite],
  );

  if (loading) {
    return (
      <div className="flex flex-1 flex-col pb-nav">
        <Header title="Подборка" />
        <div className="p-4">
          <PlaceListSkeleton count={4} />
        </div>
      </div>
    );
  }

  if (notFound || !meta) {
    return (
      <div className="flex flex-1 flex-col pb-nav">
        <Header title="Подборка" />
        <EmptyState
          emoji="🔗"
          title="Подборка недоступна"
          description="Возможно, ссылка неверна или автор сделал подборку приватной."
          action={{ label: 'На главную', onClick: () => navigate('/nearby') }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col pb-nav">
      <Header title={`${meta.emoji} ${meta.title}`} subtitle={`От ${meta.owner_name ?? 'пользователя WFOOD'}`} />

      <div className="flex flex-1 flex-col gap-4 px-4 py-4">
        <section className="rounded-2xl bg-gradient-to-br from-primary/12 to-secondary/20 p-4">
          <h2 className="font-display text-xl font-bold">
            {meta.emoji} {meta.title}
          </h2>
          {meta.description && (
            <p className="mt-1 text-sm text-muted-foreground">{meta.description}</p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {places.length} {pluralRu(places.length, 'место', 'места', 'мест')} в подборке
          </p>
        </section>

        {places.length === 0 ? (
          <EmptyState
            emoji="📭"
            title="В подборке пока пусто"
            description="Автор ещё не добавил места."
          />
        ) : (
          <ul className="flex flex-col gap-2.5">
            {places.map((place) => (
              <li key={place.id}>
                <PlaceCard
                  place={place}
                  isFavorite={favoriteIds.has(place.id)}
                  onOpen={(p) => {
                    setSelectedPlace(p);
                    setDetailsOpen(true);
                  }}
                  onToggleFavorite={handleToggleFavorite}
                />
              </li>
            ))}
          </ul>
        )}

        <Button variant="outline" className="w-full" onClick={() => navigate('/nearby')}>
          Найти своё место рядом
        </Button>
      </div>

      <PlaceDetails
        place={selectedPlace}
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        isFavorite={selectedPlace ? favoriteIds.has(selectedPlace.id) : false}
        onToggleFavorite={handleToggleFavorite}
      />
    </div>
  );
}
