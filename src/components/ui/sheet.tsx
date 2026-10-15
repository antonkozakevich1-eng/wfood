/**
 * Sheet — нижняя выдвижная панель (bottom sheet).
 *
 * Собственная реализация на CSS-трансформациях вместо Radix Dialog:
 * нужен именно «шторный» жест-паттерн с drag-закрытием, а Dialog
 * для этого требует заметной обвязки.
 */

import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  /** Высота панели: 'auto' подстраивается под содержимое. */
  size?: 'auto' | 'half' | 'full';
  className?: string;
}

export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  size = 'auto',
  className,
}: SheetProps) {
  const [mounted, setMounted] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Закрытие по Escape и блокировка скролла фона.
  React.useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);

    // Фокусируем панель: скринридер и клавиатура должны попасть внутрь.
    const timer = window.setTimeout(() => panelRef.current?.focus(), 50);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      window.clearTimeout(timer);
    };
  }, [open, onClose]);

  // Свайп вниз для закрытия (мобильный жест).
  const dragStartY = React.useRef<number | null>(null);
  const [dragOffset, setDragOffset] = React.useState(0);

  const handleTouchStart = (event: React.TouchEvent) => {
    dragStartY.current = event.touches[0]?.clientY ?? null;
  };

  const handleTouchMove = (event: React.TouchEvent) => {
    if (dragStartY.current === null) return;
    const delta = (event.touches[0]?.clientY ?? 0) - dragStartY.current;
    // Тянем только вниз: вверх — это скролл содержимого.
    setDragOffset(Math.max(0, delta));
  };

  const handleTouchEnd = () => {
    // Порог 120px: короткие касания не должны закрывать панель.
    if (dragOffset > 120) onClose();
    setDragOffset(0);
    dragStartY.current = null;
  };

  if (!mounted || !open) return null;

  const sizeClass =
    size === 'full' ? 'h-[92dvh]' : size === 'half' ? 'max-h-[60dvh]' : 'max-h-[85dvh]';

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Затемнение фона */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-250"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{
          transform: `translateY(${dragOffset}px)`,
          transition: dragOffset === 0 ? 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)' : 'none',
        }}
        className={cn(
          'relative flex w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-background shadow-float outline-none',
          sizeClass,
          className,
        )}
      >
        {/* Ручка для перетаскивания */}
        <div
          className="flex cursor-grab justify-center py-2.5 active:cursor-grabbing"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="h-1.5 w-10 rounded-full bg-muted-foreground/25" />
        </div>

        {(title || description) && (
          <div className="flex items-start justify-between gap-3 px-5 pb-3">
            <div className="flex flex-col gap-0.5">
              {title && <h2 className="font-display text-xl font-semibold">{title}</h2>}
              {description && (
                <p className="text-sm text-muted-foreground">{description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть"
              className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* safe-bottom: контент не должен упираться в домашний индикатор iPhone */}
        <div className="safe-bottom flex-1 overflow-y-auto overscroll-contain px-5 pb-5 scroll-smooth-ios">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
