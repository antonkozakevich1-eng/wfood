import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  onClear?: () => void;
}

/**
 * Поле ввода. Шрифт 16px обязателен: меньший размер вызывает
 * автоматический зум в Safari на iOS при фокусе.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', icon, onClear, ...props }, ref) => (
    <div className="relative flex items-center">
      {icon && (
        <span className="pointer-events-none absolute left-3.5 flex text-muted-foreground">
          {icon}
        </span>
      )}
      <input
        ref={ref}
        type={type}
        className={cn(
          'h-11 w-full rounded-full border border-border bg-card px-4 text-base',
          'placeholder:text-muted-foreground/70',
          'transition-colors duration-200',
          'focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20',
          'disabled:cursor-not-allowed disabled:opacity-50',
          icon && 'pl-10',
          onClear && 'pr-10',
          className,
        )}
        {...props}
      />
      {onClear && props.value ? (
        <button
          type="button"
          onClick={onClear}
          aria-label="Очистить"
          className="absolute right-3 flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-foreground"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>
      ) : null}
    </div>
  ),
);
Input.displayName = 'Input';
