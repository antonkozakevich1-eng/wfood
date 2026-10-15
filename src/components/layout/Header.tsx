/**
 * Шапка страницы: заголовок, опциональные действия, погода.
 * Липкая, с эффектом стекла при прокрутке.
 */

import { memo, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface HeaderProps {
  title: string;
  subtitle?: string;
  /** Действие справа (кнопка, иконка). */
  action?: ReactNode;
  /** Действие слева (например, кнопка «назад»). */
  leading?: ReactNode;
  /** Прозрачный фон: используется, когда под шапкой карта. */
  transparent?: boolean;
  className?: string;
}

export const Header = memo(function Header({
  title,
  subtitle,
  action,
  leading,
  transparent = false,
  className,
}: HeaderProps) {
  return (
    <header
      className={cn(
        'safe-top sticky top-0 z-30',
        transparent ? 'bg-transparent' : 'glass border-b border-border/50',
        className,
      )}
    >
      <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
        {leading}
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-xl font-bold leading-tight">{title}</h1>
          {subtitle && (
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
    </header>
  );
});
