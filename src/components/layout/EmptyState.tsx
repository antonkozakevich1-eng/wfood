/**
 * Пустые состояния: «ничего не нашлось», «нет избранного», «нет сети».
 * Всегда дают пользователю следующий шаг, а не просто сообщают о проблеме.
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  emoji?: string;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
  children?: ReactNode;
  className?: string;
}

export function EmptyState({
  emoji = '🍽️',
  title,
  description,
  action,
  secondaryAction,
  children,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        className,
      )}
    >
      <div
        className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 to-secondary/25 text-4xl"
        aria-hidden="true"
      >
        {emoji}
      </div>

      <h2 className="font-display text-lg font-semibold">{title}</h2>

      {description && (
        <p className="max-w-xs text-sm text-muted-foreground">{description}</p>
      )}

      {children}

      {(action || secondaryAction) && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {action && (
            <Button onClick={action.onClick} size="default">
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button onClick={secondaryAction.onClick} variant="outline" size="default">
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** Баннер о работе на офлайн-данных. */
export function OfflineBanner({ onRetry }: { onRetry?: () => void }) {
  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-2xl bg-amber-500/12 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-300"
    >
      <span aria-hidden="true">📡</span>
      <p className="flex-1">
        Показываем сохранённые места — источник данных временно недоступен.
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 font-semibold underline underline-offset-2"
        >
          Обновить
        </button>
      )}
    </div>
  );
}

/** Баннер о запрете геолокации. */
export function GeolocationBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-2xl bg-primary/10 px-3.5 py-2.5 text-xs text-primary-700 dark:text-primary-300"
    >
      <span aria-hidden="true">📍</span>
      <p className="flex-1">
        Геолокация недоступна — показываем центр Таллинна. Разрешите доступ в настройках браузера.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 font-semibold underline underline-offset-2"
      >
        Повторить
      </button>
    </div>
  );
}

/** Баннер о ненастроенном Supabase. */
export function SetupBanner() {
  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-2xl bg-accent/12 px-3.5 py-2.5 text-xs text-accent"
    >
      <span aria-hidden="true">⚙️</span>
      {/* break-words: имена переменных длинные и без пробелов — иначе
          они растягивают контейнер за пределы экрана. */}
      <p className="min-w-0 flex-1 break-words">
        Supabase не настроен: приложение работает на демо-данных. Добавьте{' '}
        <code className="rounded bg-accent/15 px-1 py-0.5 font-mono">
          VITE_SUPABASE_URL
        </code>{' '}
        и{' '}
        <code className="rounded bg-accent/15 px-1 py-0.5 font-mono">
          VITE_SUPABASE_ANON_KEY
        </code>{' '}
        в <code className="font-mono">.env.local</code>.
      </p>
    </div>
  );
}
