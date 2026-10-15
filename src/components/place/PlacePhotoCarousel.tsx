/**
 * Фото места с каруселью.
 *
 * Если фотографий нет (типично для OSM-данных), показываем градиентный
 * плейсхолдер с эмодзи кухни — он детерминирован по названию, поэтому
 * одно и то же место всегда выглядит одинаково.
 *
 * Фото Google Places хранятся как photo_reference: прямой URL содержал бы
 * API-ключ, поэтому он не может быть получен на клиенте.
 */

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn, cuisineEmoji, gradientFromString } from '@/lib/utils';
import type { Place, PlacePhoto } from '@/types';

interface PlacePhotoCarouselProps {
  place: Place;
  className?: string;
  /** Высота контейнера. */
  size?: 'sm' | 'md' | 'lg';
  /** Показывать ли стрелки (на мобильных обычно скрыты — свайп). */
  showArrows?: boolean;
}

export function PlacePhotoCarousel({
  place,
  className,
  size = 'md',
  showArrows = true,
}: PlacePhotoCarouselProps) {
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<Set<number>>(new Set());

  const photos: PlacePhoto[] = (place.photos ?? []).filter(
    (p) => (p.url || p.photo_reference) && !failed.has(place.photos.indexOf(p)),
  );

  const heightClass = size === 'sm' ? 'h-20' : size === 'lg' ? 'h-56' : 'h-40';

  // Плейсхолдер: градиент + эмодзи. Всегда доступен и ничего не стоит.
  if (photos.length === 0) {
    return (
      <div
        className={cn(
          'relative flex items-center justify-center overflow-hidden rounded-xl',
          heightClass,
          className,
        )}
        style={{ background: gradientFromString(place.name) }}
        role="img"
        aria-label={`Фото: ${place.name}`}
      >
        <span className="text-4xl drop-shadow-sm" aria-hidden="true">
          {cuisineEmoji(place.cuisine)}
        </span>
      </div>
    );
  }

  const current = photos[Math.min(index, photos.length - 1)];
  const imageUrl = current?.url;

  const go = (delta: number) => {
    setIndex((prev) => (prev + delta + photos.length) % photos.length);
  };

  return (
    <div className={cn('group relative overflow-hidden rounded-xl', heightClass, className)}>
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={current?.alt ?? place.name}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => {
            // Битая ссылка (частая ситуация у OSM) → переключаемся на плейсхолдер.
            setFailed((prev) => new Set(prev).add(index));
          }}
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center"
          style={{ background: gradientFromString(place.name) }}
        >
          <span className="text-4xl" aria-hidden="true">
            {cuisineEmoji(place.cuisine)}
          </span>
        </div>
      )}

      {photos.length > 1 && (
        <>
          {showArrows && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  go(-1);
                }}
                aria-label="Предыдущее фото"
                className="absolute left-1.5 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 sm:flex"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  go(1);
                }}
                aria-label="Следующее фото"
                className="absolute right-1.5 top-1/2 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 sm:flex"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}

          {/* Точки-индикаторы */}
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
            {photos.map((_, i) => (
              <span
                key={i}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-200',
                  i === index ? 'w-4 bg-white' : 'w-1.5 bg-white/60',
                )}
              />
            ))}
          </div>
        </>
      )}

      {/* Бейдж «открыто/закрыто» */}
      <div className="absolute left-2 top-2">
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-semibold backdrop-blur-sm',
            place.is_open_now
              ? 'bg-emerald-500/90 text-white'
              : 'bg-black/50 text-white/90',
          )}
        >
          {place.is_open_now ? 'Открыто' : 'Закрыто'}
        </span>
      </div>
    </div>
  );
}
