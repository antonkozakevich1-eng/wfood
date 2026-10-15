/**
 * Детальная карточка заведения в bottom sheet.
 * Показывает всё, что нужно для решения: фото, рейтинг, часы, контакты, действия.
 */

import { Heart, MapPin, Phone, Share2, Sparkles, Star, Clock, Globe } from 'lucide-react';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PlacePhotoCarousel } from './PlacePhotoCarousel';
import {
  cuisineLabel,
  formatDistance,
  priceRangeLabel,
  priceSymbol,
  routeUrl,
  todayHours,
  walkingTime,
  WEEKDAYS_RU,
} from '@/lib/utils';
import { analytics } from '@/lib/analytics';
import { toast } from '@/hooks/useToast';
import type { Place } from '@/types';

interface PlaceDetailsProps {
  place: Place | null;
  open: boolean;
  onClose: () => void;
  isFavorite: boolean;
  onToggleFavorite: (place: Place) => void;
  onAskAi?: (place: Place) => void;
}

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export function PlaceDetails({
  place,
  open,
  onClose,
  isFavorite,
  onToggleFavorite,
  onAskAi,
}: PlaceDetailsProps) {
  if (!place) return null;

  const handleRoute = () => {
    analytics.routeClicked(place);
    window.open(routeUrl(place.lat, place.lng, place.name), '_blank', 'noopener');
  };

  const handleCall = () => {
    analytics.callClicked(place);
    if (place.phone) window.location.href = `tel:${place.phone}`;
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/place/${place.id}`;
    const shareData = {
      title: place.name,
      text: `Смотри, какое место: ${place.name}`,
      url,
    };

    try {
      // Web Share API работает на мобильных; на десктопе падаем в clipboard.
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(url);
        toast.success('Ссылка скопирована');
      }
    } catch (err) {
      // Пользователь отменил шаринг — это не ошибка.
      if (err instanceof Error && err.name !== 'AbortError') {
        toast.error('Не удалось поделиться');
      }
    }
  };

  return (
    <Sheet open={open} onClose={onClose} size="full">
      <div className="flex flex-col gap-4 pb-4">
        <PlacePhotoCarousel place={place} size="lg" />

        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-display text-2xl font-bold leading-tight">{place.name}</h2>
            <button
              type="button"
              onClick={() => onToggleFavorite(place)}
              aria-label={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
              aria-pressed={isFavorite}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted transition-colors hover:bg-muted/70"
            >
              <Heart
                className={
                  isFavorite ? 'h-5 w-5 fill-primary text-primary' : 'h-5 w-5 text-muted-foreground'
                }
              />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
            {place.rating !== null ? (
              <span className="flex items-center gap-1 font-semibold">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />
                {place.rating.toFixed(1)}
                <span className="font-normal text-muted-foreground">
                  ({place.reviews_count} отзывов)
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">Рейтинг пока нет</span>
            )}

            <span className="flex items-center gap-1 text-muted-foreground">
              <MapPin className="h-4 w-4" aria-hidden="true" />
              {formatDistance(place.distance_m)} · {walkingTime(place.distance_m)} пешком
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {place.price_level && (
              <Badge variant="default">
                {priceSymbol(place.price_level)} · {priceRangeLabel(place.price_level)}
              </Badge>
            )}
            {place.cuisine.map((c) => (
              <Badge key={c} variant="secondary">
                {cuisineLabel(c)}
              </Badge>
            ))}
          </div>
        </div>

        {place.description && (
          <p className="text-sm leading-relaxed text-muted-foreground">{place.description}</p>
        )}

        {/* Действия */}
        <div className="flex gap-2">
          <Button onClick={handleRoute} className="flex-1" size="lg">
            <MapPin className="h-4 w-4" aria-hidden="true" />
            Маршрут
          </Button>

          {place.phone && (
            <Button onClick={handleCall} variant="outline" size="lg" aria-label="Позвонить">
              <Phone className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}

          <Button onClick={handleShare} variant="outline" size="lg" aria-label="Поделиться">
            <Share2 className="h-4 w-4" aria-hidden="true" />
          </Button>

          {onAskAi && (
            <Button
              onClick={() => onAskAi(place)}
              variant="accent"
              size="lg"
              aria-label="Спросить ИИ об этом месте"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>

        {/* Часы работы */}
        <section className="flex flex-col gap-2 rounded-2xl bg-muted/50 p-3.5">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Clock className="h-4 w-4" aria-hidden="true" />
            Часы работы
            <span
              className={
                place.is_open_now
                  ? 'ml-auto rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-700 dark:text-emerald-400'
                  : 'ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground'
              }
            >
              {place.is_open_now ? 'Открыто' : 'Закрыто'}
            </span>
          </h3>

          {place.hours.raw ? (
            <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
              {WEEKDAY_KEYS.map((key, i) => {
                const value = place.hours[key];
                const todayIndex = (new Date().getDay() + 6) % 7;
                const isToday = i === todayIndex;
                const label =
                  Array.isArray(value) && Array.isArray(value[0])
                    ? `${(value[0] as [string, string])[0]}–${(value[0] as [string, string])[1]}`
                    : typeof value === 'undefined'
                      ? '—'
                      : null;

                return (
                  <li
                    key={key}
                    className={
                      isToday ? 'flex justify-between font-medium text-foreground' : 'flex justify-between'
                    }
                  >
                    <span>{WEEKDAYS_RU[i]}</span>
                    <span>{label ?? place.hours.raw}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              {todayHours(place.hours) ?? 'Часы работы не указаны'}
            </p>
          )}
        </section>

        {/* Контакты */}
        <section className="flex flex-col gap-2 rounded-2xl bg-muted/50 p-3.5">
          <h3 className="text-sm font-semibold">Контакты</h3>

          {place.address && (
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {place.address}
            </p>
          )}

          {place.phone && (
            <a
              href={`tel:${place.phone}`}
              className="flex items-center gap-2 text-xs text-primary hover:underline"
            >
              <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {place.phone}
            </a>
          )}

          {place.website && (
            <a
              href={place.website}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 truncate text-xs text-primary hover:underline"
            >
              <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {place.website.replace(/^https?:\/\//, '')}
            </a>
          )}

          {!place.address && !place.phone && !place.website && (
            <p className="text-xs text-muted-foreground">Контактные данные не указаны</p>
          )}
        </section>

        {/* Удобства */}
        {Object.values(place.amenities).some(Boolean) && (
          <section className="flex flex-col gap-2 rounded-2xl bg-muted/50 p-3.5">
            <h3 className="text-sm font-semibold">Удобства</h3>
            <div className="flex flex-wrap gap-1.5">
              {place.amenities.delivery && <Badge variant="success">🛵 Доставка</Badge>}
              {place.amenities.wifi && <Badge variant="success">📶 Wi-Fi</Badge>}
              {place.amenities.dog_friendly && <Badge variant="success">🐕 Можно с собакой</Badge>}
              {place.amenities.kids_menu && <Badge variant="success">🧒 Детское меню</Badge>}
              {place.amenities.outdoor && <Badge variant="success">☀️ Терраса</Badge>}
            </div>
          </section>
        )}

        <p className="text-center text-[10px] text-muted-foreground">
          Данные: {place.source === 'osm' ? 'OpenStreetMap' : place.source === 'google' ? 'Google Places' : 'WFOOD'}
        </p>
      </div>
    </Sheet>
  );
}
