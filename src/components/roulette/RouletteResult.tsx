/**
 * Результат рулетки: карточка победившего заведения + действия.
 */

import { motion } from 'framer-motion';
import { Heart, MapPin, Phone, RefreshCw, Sparkles, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  cuisineEmoji,
  cuisineLabel,
  formatDistance,
  priceRangeLabel,
  priceSymbol,
  routeUrl,
  walkingTime,
} from '@/lib/utils';
import type { Place } from '@/types';

interface RouletteResultProps {
  place: Place;
  isFavorite: boolean;
  onAccept: () => void;
  onRetry: () => void;
  onAskAi: () => void;
  onToggleFavorite: () => void;
  onOpenDetails: () => void;
}

export function RouletteResult({
  place,
  isFavorite,
  onAccept,
  onRetry,
  onAskAi,
  onToggleFavorite,
  onOpenDetails,
}: RouletteResultProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      className="flex w-full flex-col gap-3 rounded-3xl bg-card p-5 shadow-float"
    >
      {/* Заголовок */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-3xl" aria-hidden="true">
            {cuisineEmoji(place.cuisine)}
          </span>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-primary">
              Рулетка выбрала
            </p>
            <h2 className="font-display text-2xl font-bold leading-tight">{place.name}</h2>
          </div>
        </div>

        <button
          type="button"
          onClick={onToggleFavorite}
          aria-label={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
          aria-pressed={isFavorite}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted transition-colors hover:bg-muted/70"
        >
          <Heart
            className={isFavorite ? 'h-5 w-5 fill-primary text-primary' : 'h-5 w-5 text-muted-foreground'}
          />
        </button>
      </div>

      {/* Метрики */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
        {place.rating !== null && (
          <span className="flex items-center gap-1 font-semibold">
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden="true" />
            {place.rating.toFixed(1)}
          </span>
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
        {place.cuisine.slice(0, 3).map((c) => (
          <Badge key={c} variant="secondary">
            {cuisineLabel(c)}
          </Badge>
        ))}
        {place.is_open_now ? (
          <Badge variant="success">Открыто</Badge>
        ) : (
          <Badge variant="muted">Закрыто</Badge>
        )}
      </div>

      {place.address && (
        <button
          type="button"
          onClick={onOpenDetails}
          className="text-left text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          {place.address}
        </button>
      )}

      {/* Действия */}
      <div className="mt-1 flex flex-col gap-2">
        <Button size="lg" onClick={onAccept} className="w-full">
          🎉 Идём сюда
        </Button>

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => window.open(routeUrl(place.lat, place.lng, place.name), '_blank', 'noopener')}
          >
            <MapPin className="h-4 w-4" aria-hidden="true" />
            Маршрут
          </Button>

          <Button variant="outline" className="flex-1" onClick={onRetry}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Ещё раз
          </Button>
        </div>

        <div className="flex gap-2">
          {place.phone && (
            <Button
              variant="ghost"
              className="flex-1"
              onClick={() => {
                window.location.href = `tel:${place.phone}`;
              }}
            >
              <Phone className="h-4 w-4" aria-hidden="true" />
              Позвонить
            </Button>
          )}

          <Button variant="accent" className="flex-1" onClick={onAskAi}>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Спросить ИИ
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
