/**
 * Skeleton — состояния загрузки вместо текста «Загрузка...».
 */

import { cn } from '@/lib/utils';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('skeleton', className)} aria-hidden="true" {...props} />;
}

/** Скелетон карточки заведения. */
export function PlaceCardSkeleton() {
  return (
    <div className="flex gap-3 rounded-2xl bg-card p-3 shadow-soft">
      <Skeleton className="h-20 w-20 shrink-0 rounded-xl" />
      <div className="flex flex-1 flex-col gap-2 py-0.5">
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-3 w-2/5" />
        <div className="flex gap-1.5">
          <Skeleton className="h-5 w-14 rounded-full" />
          <Skeleton className="h-5 w-12 rounded-full" />
        </div>
      </div>
    </div>
  );
}

/** Список скелетонов карточек. */
export function PlaceListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="Загрузка заведений">
      {Array.from({ length: count }, (_, i) => (
        <PlaceCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Скелетон сообщения чата. */
export function ChatMessageSkeleton() {
  return (
    <div className="flex max-w-[85%] flex-col gap-2 self-start rounded-2xl bg-card p-3.5 shadow-soft">
      <Skeleton className="h-3 w-40" />
      <Skeleton className="h-3 w-52" />
      <Skeleton className="h-16 w-64 rounded-xl" />
    </div>
  );
}
