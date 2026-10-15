/**
 * Вкладка «Избранное»: сохранённые места + личные подборки.
 */

import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Share2, Star, Trash2 } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { EmptyState, SetupBanner } from '@/components/layout/EmptyState';
import { PlaceCard } from '@/components/place/PlaceCard';
import { PlaceDetails } from '@/components/place/PlaceDetails';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { PlaceListSkeleton } from '@/components/ui/skeleton';
import { useFavorites, useCollections, shareLink } from '@/hooks/useFavorites';
import { usePlacesStore } from '@/stores/placesStore';
import { isSupabaseConfigured } from '@/lib/supabase';
import { analytics } from '@/lib/analytics';
import { toast } from '@/hooks/useToast';
import { pluralRu } from '@/lib/utils';
import type { Place } from '@/types';

const COLLECTION_EMOJIS = ['🍽️', '💕', '💼', '🎉', '🌮', '🍕', '☕', '🍣', '🥗', '🍜'];

export default function Favorites() {
  const navigate = useNavigate();

  const { places, loading, remove, reload } = useFavorites();
  const {
    collections,
    loading: collectionsLoading,
    create,
    remove: removeCollection,
    togglePublic,
  } = useCollections();

  const favoriteIds = usePlacesStore((s) => s.favoriteIds);
  const toggleFavorite = usePlacesStore((s) => s.toggleFavorite);

  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newEmoji, setNewEmoji] = useState('🍽️');
  const [saving, setSaving] = useState(false);

  const handleOpenPlace = useCallback((place: Place) => {
    setSelectedPlace(place);
    setDetailsOpen(true);
  }, []);

  const handleToggleFavorite = useCallback(
    async (place: Place) => {
      try {
        await toggleFavorite(place);
        await remove(place);
        toast.success('Убрано из избранного');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Не удалось обновить');
      }
    },
    [toggleFavorite, remove],
  );

  const handleCreateCollection = useCallback(async () => {
    const title = newTitle.trim();
    if (!title) return;

    setSaving(true);
    try {
      await create(title, newEmoji);
      toast.success('Подборка создана');
      setCreateOpen(false);
      setNewTitle('');
      setNewEmoji('🍽️');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось создать подборку');
    } finally {
      setSaving(false);
    }
  }, [newTitle, newEmoji, create]);

  const handleShare = useCallback(async (id: string, slug: string | null, isPublic: boolean) => {
    if (!slug) return;

    // Публикуем перед шарингом: приватная подборка по ссылке не откроется.
    if (!isPublic) {
      try {
        await togglePublic(id, true);
      } catch {
        toast.error('Не удалось сделать подборку публичной');
        return;
      }
    }

    const url = shareLink(slug);
    analytics.collectionShared(id);

    try {
      if (navigator.share) {
        await navigator.share({ title: 'Моя подборка WFOOD', url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success('Ссылка скопирована');
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        toast.error('Не удалось поделиться');
      }
    }
  }, [togglePublic]);

  const handleDeleteCollection = useCallback(
    async (id: string) => {
      try {
        await removeCollection(id);
        toast.success('Подборка удалена');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Не удалось удалить');
      }
    },
    [removeCollection],
  );

  return (
    <div className="flex flex-1 flex-col pb-nav">
      <Header
        title="Избранное"
        subtitle={
          places.length > 0
            ? `${places.length} ${pluralRu(places.length, 'место', 'места', 'мест')}`
            : 'Ваши сохранённые места'
        }
        action={
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setCreateOpen(true)}
            aria-label="Создать подборку"
          >
            <Plus className="h-5 w-5" />
          </Button>
        }
      />

      <div className="flex flex-1 flex-col gap-5 px-4 py-4">
        {!isSupabaseConfigured && <SetupBanner />}

        {/* Подборки */}
        {!collectionsLoading && collections.length > 0 && (
          <section className="flex flex-col gap-2.5">
            <h2 className="text-sm font-semibold">Мои подборки</h2>
            <ul className="flex flex-col gap-2">
              {collections.map((collection) => (
                <li
                  key={collection.id}
                  className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-soft"
                >
                  {/* Клик по эмодзи открывает подборку (отдельно от кнопок справа) */}
                  <button
                    type="button"
                    onClick={() => navigate(`/c/${collection.share_slug ?? collection.id}`)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    aria-label={`Открыть подборку ${collection.title}`}
                  >
                    <span className="text-2xl" aria-hidden="true">
                      {collection.emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{collection.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {collection.place_count ?? 0}{' '}
                        {pluralRu(collection.place_count ?? 0, 'место', 'места', 'мест')}
                        {collection.is_public && ' · публичная'}
                      </span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      void handleShare(collection.id, collection.share_slug, collection.is_public)
                    }
                    aria-label={`Поделиться подборкой ${collection.title}`}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Share2 className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleDeleteCollection(collection.id)}
                    aria-label={`Удалить подборку ${collection.title}`}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Сохранённые места */}
        <section className="flex flex-col gap-2.5">
          {collections.length > 0 && <h2 className="text-sm font-semibold">Сохранённые места</h2>}

          {loading ? (
            <PlaceListSkeleton count={4} />
          ) : places.length === 0 ? (
            <EmptyState
              emoji="⭐"
              title="Пока пусто"
              description="Нажимайте на сердечко у заведений — они появятся здесь. Или крутите рулетку и сохраняйте находки."
              action={{ label: 'Крутить рулетку', onClick: () => navigate('/roulette') }}
              secondaryAction={{ label: 'Места рядом', onClick: () => navigate('/nearby') }}
            />
          ) : (
            <ul className="flex flex-col gap-2.5">
              {places.map((place) => (
                <li key={place.id}>
                  <PlaceCard
                    place={place}
                    isFavorite={favoriteIds.has(place.id)}
                    onOpen={handleOpenPlace}
                    onToggleFavorite={handleToggleFavorite}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Подсказка про подборки */}
        {places.length > 0 && collections.length === 0 && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-3 rounded-2xl border border-dashed border-border p-4 text-left transition-colors hover:border-primary/40"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Star className="h-5 w-5" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-medium">Создайте подборку</span>
              <span className="text-xs text-muted-foreground">
                Например, «Хочу сходить» или «Для свидания» — и поделитесь с друзьями
              </span>
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={() => void reload()}
          className="py-2 text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          Обновить список
        </button>
      </div>

      {/* Создание подборки */}
      <Sheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Новая подборка"
        description="Соберите места по настроению или поводу"
      >
        <div className="flex flex-col gap-4 pb-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="collection-title" className="text-sm font-medium">
              Название
            </label>
            <Input
              id="collection-title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Например: Хочу сходить"
              maxLength={80}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreateCollection();
              }}
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Эмодзи</span>
            <div className="flex flex-wrap gap-2">
              {COLLECTION_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setNewEmoji(emoji)}
                  aria-pressed={newEmoji === emoji}
                  aria-label={`Выбрать эмодзи ${emoji}`}
                  className={
                    newEmoji === emoji
                      ? 'flex h-11 w-11 items-center justify-center rounded-full bg-primary/15 text-xl ring-2 ring-primary'
                      : 'flex h-11 w-11 items-center justify-center rounded-full bg-muted text-xl transition-colors hover:bg-muted/70'
                  }
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <Button
            onClick={handleCreateCollection}
            disabled={!newTitle.trim()}
            loading={saving}
            size="lg"
            className="w-full"
          >
            Создать
          </Button>
        </div>
      </Sheet>

      <PlaceDetails
        place={selectedPlace}
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        isFavorite={selectedPlace ? favoriteIds.has(selectedPlace.id) : false}
        onToggleFavorite={handleToggleFavorite}
      />

      {/* Счётчик избранного для быстрой проверки */}
      {places.length > 0 && (
        <div className="pointer-events-none fixed bottom-20 right-4 z-30">
          <Badge variant="default" className="shadow-card">
            ⭐ {places.length}
          </Badge>
        </div>
      )}
    </div>
  );
}
