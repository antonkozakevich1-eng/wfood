/**
 * Toast-уведомления: рендерят очередь из useToastStore.
 * Монтируется один раз в App и живёт над всем интерфейсом.
 */

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useToastStore, type ToastVariant } from '@/hooks/useToast';
import { cn } from '@/lib/utils';

const ICONS: Record<ToastVariant, typeof Info> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  success: 'bg-emerald-600 text-white',
  error: 'bg-destructive text-destructive-foreground',
  info: 'bg-card text-card-foreground border border-border',
};

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  // Автоскрытие: таймеры перезапускаются, если добавился новый тост,
  // поэтому выносим их в отдельный эффект с зависимостью на id.
  useEffect(() => {
    const timers = toasts
      .filter((t) => t.duration > 0)
      .map((t) => window.setTimeout(() => dismiss(t.id), t.duration));

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [toasts, dismiss]);

  return (
    <div
      // aria-live: скринридер озвучит уведомление, не прерывая пользователя.
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed left-0 right-0 top-0 z-[100] flex flex-col items-center gap-2 px-4 pt-3 safe-top"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const Icon = ICONS[toast.variant];
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.97 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                'pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl px-4 py-3 shadow-float',
                VARIANT_CLASSES[toast.variant],
              )}
              role="status"
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              <p className="flex-1 text-sm font-medium leading-snug">{toast.message}</p>

              {toast.action && (
                <button
                  type="button"
                  onClick={() => {
                    toast.action?.onClick();
                    dismiss(toast.id);
                  }}
                  className="shrink-0 text-sm font-semibold underline underline-offset-2 opacity-90 transition-opacity hover:opacity-100"
                >
                  {toast.action.label}
                </button>
              )}

              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Закрыть уведомление"
                className="shrink-0 opacity-70 transition-opacity hover:opacity-100"
              >
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
