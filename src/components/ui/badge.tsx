import * as React from 'react';
import { cn } from '@/lib/utils';

/** Бейдж-«пилюля»: используется для кухни, цены, рейтинга. */
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'accent' | 'outline' | 'muted' | 'success' | 'warning';
}

const variantClasses: Record<NonNullable<BadgeProps['variant']>, string> = {
  default: 'bg-primary/12 text-primary-700 dark:text-primary-300',
  secondary: 'bg-secondary/40 text-secondary-foreground',
  accent: 'bg-accent/15 text-accent',
  outline: 'border border-border text-muted-foreground',
  muted: 'bg-muted text-muted-foreground',
  success: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
};

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium leading-none',
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
