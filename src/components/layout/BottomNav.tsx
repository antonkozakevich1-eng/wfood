/**
 * Нижняя навигация: 5 вкладок.
 *
 * Активная вкладка подсвечивается. Тач-цель каждой вкладки — не менее 44px
 * по высоте. Учитывается safe-area-inset-bottom для iPhone с домашним индикатором.
 */

import { memo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Dices, MapPin, Sparkles, Star, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { haptic } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: typeof MapPin;
  /** Путь, по которому определяется активность (для вложенных маршрутов). */
  match: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/nearby', label: 'Рядом', icon: MapPin, match: '/nearby' },
  { to: '/roulette', label: 'Рулетка', icon: Dices, match: '/roulette' },
  { to: '/ai', label: 'ИИ', icon: Sparkles, match: '/ai' },
  { to: '/favorites', label: 'Избранное', icon: Star, match: '/favorites' },
  { to: '/profile', label: 'Профиль', icon: User, match: '/profile' },
];

export const BottomNav = memo(function BottomNav() {
  const location = useLocation();

  return (
    <nav
      aria-label="Основная навигация"
      className={cn(
        'fixed bottom-0 left-0 right-0 z-40 border-t border-border/60 glass safe-bottom',
      )}
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around px-1">
        {NAV_ITEMS.map((item) => {
          const isActive =
            location.pathname === item.match || location.pathname.startsWith(`${item.match}/`);
          const Icon = item.icon;

          return (
            <li key={item.to} className="flex-1">
              <NavLink
                to={item.to}
                onClick={() => haptic(5)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  // min-h-14 = 56px: комфортная тач-цель на мобильном.
                  'relative flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2',
                  'transition-colors duration-200',
                  isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {isActive && (
                  // layoutId даёт плавное «перетекание» подсветки между вкладками.
                  <motion.span
                    layoutId="bottom-nav-indicator"
                    className="absolute -top-px h-0.5 w-8 rounded-full bg-primary"
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  />
                )}

                <Icon
                  className={cn('h-6 w-6 transition-transform duration-200', isActive && 'scale-110')}
                  strokeWidth={isActive ? 2.4 : 2}
                  aria-hidden="true"
                />

                <span
                  className={cn(
                    'text-[10px] font-medium leading-none',
                    isActive ? 'font-semibold' : '',
                  )}
                >
                  {item.label}
                </span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
});
