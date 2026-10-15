/**
 * Пузырь сообщения чата.
 * Ответ ассистента может содержать карточки мест — они рендерятся под текстом.
 */

import { memo } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, MapPin, Sparkles, Star, Zap } from 'lucide-react';
import { PlaceCard } from '@/components/place/PlaceCard';
import { Badge } from '@/components/ui/badge';
import { cn, formatDistance, priceSymbol } from '@/lib/utils';
import type { ChatMessage, Place } from '@/types';

interface ChatBubbleProps {
  message: ChatMessage;
  favoriteIds: Set<string>;
  onOpenPlace: (place: Place) => void;
  onToggleFavorite: (place: Place) => void;
  onRetry?: (messageId: string) => void;
}

export const ChatBubble = memo(function ChatBubble({
  message,
  favoriteIds,
  onOpenPlace,
  onToggleFavorite,
  onRetry,
}: ChatBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className={cn('flex w-full flex-col gap-1.5', isUser ? 'items-end' : 'items-start')}
    >
      <div
        className={cn(
          'max-w-[88%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          isUser
            ? 'rounded-br-md bg-primary text-primary-foreground'
            : message.error
              ? 'rounded-bl-md border border-amber-500/25 bg-amber-500/10 text-foreground'
              : 'rounded-bl-md bg-card text-card-foreground shadow-soft',
        )}
      >
        {message.error && (
          <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
            Ответ без ИИ
          </span>
        )}

        <p className="whitespace-pre-wrap">{message.content}</p>

        {/* Метка провайдера и кэша — прозрачность важнее, чем кажется */}
        {!isUser && message.provider && !message.error && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant="muted" className="text-[9px]">
              {message.provider === 'gemini' && '✨ Gemini'}
              {message.provider === 'openai' && '🔄 OpenAI'}
              {message.provider === 'cache' && <><Zap className="h-2.5 w-2.5" /> Из кэша</>}
              {message.provider === 'fallback' && '⚠️ Резервный ответ'}
            </Badge>
          </div>
        )}
      </div>

      {/* Карточки мест под ответом */}
      {message.places && message.places.length > 0 && (
        <div className="flex w-full flex-col gap-2">
          {message.places.map((place) => (
            <PlaceCard
              key={place.id}
              place={place}
              isFavorite={favoriteIds.has(place.id)}
              onOpen={onOpenPlace}
              onToggleFavorite={onToggleFavorite}
              className="bg-card/60"
            />
          ))}
        </div>
      )}

      {/* Причина выбора — свёрнутая строка, не отвлекает, но доступна */}
      {message.reasoning && !isUser && (
        <details className="max-w-[88%] px-1">
          <summary className="cursor-pointer list-none text-[11px] text-muted-foreground hover:text-foreground">
            <Sparkles className="mr-1 inline h-3 w-3" aria-hidden="true" />
            Почему эти варианты
          </summary>
          <p className="mt-1 pl-4 text-[11px] leading-relaxed text-muted-foreground">
            {message.reasoning}
          </p>
        </details>
      )}

      {message.error && onRetry && (
        <button
          type="button"
          onClick={() => onRetry(message.id)}
          className="px-1 text-[11px] font-medium text-primary underline-offset-2 hover:underline"
        >
          Попробовать снова
        </button>
      )}
    </motion.div>
  );
});

/** Компактная карточка места для быстрого просмотра в групповом режиме. */
export function MiniPlaceRow({ place, onOpen }: { place: Place; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-2.5 rounded-xl bg-card p-2 text-left transition-colors hover:bg-muted"
    >
      <span className="text-xl" aria-hidden="true">
        🍽️
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{place.name}</span>
        <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {place.rating !== null && (
            <span className="flex items-center gap-0.5">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              {place.rating.toFixed(1)}
            </span>
          )}
          <span className="flex items-center gap-0.5">
            <MapPin className="h-3 w-3" />
            {formatDistance(place.distance_m)}
          </span>
          {place.price_level && <span>{priceSymbol(place.price_level)}</span>}
        </span>
      </span>
    </button>
  );
}
