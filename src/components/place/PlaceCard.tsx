/**
 * Карточка заведения в списке.
 *
 * Мемоизирована: список может содержать сотни элементов, и ререндер
 * одной карточки при переключении избранного не должен тянуть за собой все.
 */

import { memo, useCallback } from 'react';
import { Heart, MapPin, Phone, Sparkles, Star, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn, cuisineEmoji, cuisineLabel, formatDistance, priceSymbol, todayHours, walkingTime } from '@/lib/utils';
import { routeUrl } from '@/lib/utils';
import type { Place } from '@/types';

interface PlaceCardProps {
  place: Place;
  isFavorite: boolean;
  onOpen: (place: Place) => void;
  onToggleFavorite: (place: Place) => void;
  onAskAi?: (place: Place) => void;
  /** Показывать ли номер места (для результатов рулетки). */
  index?: number;
  className?: string;
}

export const PlaceCard = memo(function PlaceCard({
  place,
  isFavorite,
  onOpen,
  onToggleFavorite,
  onAskAi,
  index,
  className,
}: PlaceCardProps) {
  const hours = todayHours(place.hours);

  const handleFavorite = useCallback(
    (event: React.MouseEvent) => {
      // Карточка целиком кликабельна — кнопка не должна открывать детали.
      event.stopPropagation();
      onToggleFavorite(place);
    },
    [onToggleFavorite, place],
  );

  const handleCall = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      if (place.phone) window.location.href = `tel:${place.phone}`;
    },
    [place.phone],
  );

  const handleRoute = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      window.open(routeUrl(place.lat, place.lng, place.name), '_blank', 'noopener');
    },
    [place.lat, place.lng, place.name],
  );

  return (
    <article
      className={cn(
        'flex cursor-pointer gap-3 rounded-2xl bg-card p-3 shadow-soft transition-all duration-200',
        'hover:shadow-card active:scale-[0.99]',
        className,
      )}
      onClick={() => onOpen(place)}
      // Карточка ведёт себя как кнопка: доступна с клавиатуры.
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(place);
        }
      }}
      aria-label={`${place.name}, ${formatDistance(place.distance_m)}`}
    >
      {/* Превью: градиент с эмодзи кухни, если фото нет */}
      <div className="relative shrink-0">
        {place.photos[0]?.url ? (
          <img
            src={place.photos[0].url}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-20 w-20 rounded-xl object-cover"
          />
        ) : (
          <div
            className="flex h-20 w-20 items-center justify-center rounded-xl text-2xl"
            style={{
              background: `linear-gradient(135deg, hsl(${(place.name.length * 37) % 360} 65% 62%), hsl(${((place.name.length * 37) + 40) % 360} 70% 48%))`,
            }}
            aria-hidden="true"
          >
            {cuisineEmoji(place.cuisine)}
          </div>
        )}

        {typeof index === 'number' && (
          <span className="absolute -left-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow-md">
            {index + 1}
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 font-semibold leading-tight">{place.name}</h3>

          <button
            type="button"
            onClick={handleFavorite}
            aria-label={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
            aria-pressed={isFavorite}
            className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-muted"
          >
            <Heart
              className={cn(
                'h-[18px] w-[18px] transition-all duration-200',
                isFavorite ? 'fill-primary text-primary scale-110' : 'text-muted-foreground',
              )}
            />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
          {place.rating !== null ? (
            <span className="flex items-center gap-0.5 font-semibold text-foreground">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
              {place.rating.toFixed(1)}
              {place.reviews_count > 0 && (
                <span className="font-normal text-muted-foreground">
                  ({place.reviews_count > 999
                    ? `${Math.round(place.reviews_count / 100) / 10}k`
                    : place.reviews_count})
                </span>
              )}
            </span>
          ) : (
            <span className="italic opacity-70">Нет рейтинга</span>
          )}

          <span className="flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            {formatDistance(place.distance_m)}
          </span>

          <span>{walkingTime(place.distance_m)} пешком</span>

          {place.price_level && <span className="font-medium">{priceSymbol(place.price_level)}</span>}
        </div>

        {place.cuisine.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {place.cuisine.slice(0, 2).map((c) => (
              <Badge key={c} variant="muted" className="text-[10px]">
                {cuisineLabel(c)}
              </Badge>
            ))}
            {place.cuisine.length > 2 && (
              <Badge variant="muted" className="text-[10px]">
                +{place.cuisine.length - 2}
              </Badge>
            )}
          </div>
        )}

        {hours && (
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {hours}
          </p>
        )}

        {/* Быстрые действия */}
        <div className="mt-1 flex gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={handleRoute}
            className="flex h-8 flex-1 items-center justify-center gap-1 rounded-full bg-primary/12 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
          >
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            Маршрут
          </button>

          {place.phone && (
            <button
              type="button"
              onClick={handleCall}
              aria-label={`Позвонить в ${place.name}`}
              className="flex h-8 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
            >
              <Phone className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}

          {onAskAi && (
            <button
              type="button"
              onClick={() => onAskAi(place)}
              aria-label={`Спросить ИИ про ${place.name}`}
              className="flex h-8 w-9 items-center justify-center rounded-full bg-accent/15 text-accent transition-colors hover:bg-accent/25"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
});
