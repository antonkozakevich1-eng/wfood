/**
 * Уведомления (тосты).
 *
 * Собственная минимальная реализация вместо внешней библиотеки:
 * нужен один тип уведомлений и полный контроль над стилем и доступностью.
 */

import { create } from 'zustand';
import { uid } from '@/lib/utils';

export type ToastVariant = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  /** Длительность показа в мс. 0 = не скрывать автоматически. */
  duration: number;
  action?: { label: string; onClick: () => void };
}

interface ToastState {
  toasts: Toast[];
  show: (
    message: string,
    variant?: ToastVariant,
    options?: { duration?: number; action?: Toast['action'] },
  ) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],

  show: (message, variant = 'info', options = {}) => {
    const id = uid();
    const toast: Toast = {
      id,
      message,
      variant,
      duration: options.duration ?? (variant === 'error' ? 5000 : 3000),
      ...(options.action ? { action: options.action } : {}),
    };

    set((state) => ({
      // Максимум 3 одновременно: больше — визуальный шум.
      toasts: [...state.toasts, toast].slice(-3),
    }));

    return id;
  },

  dismiss: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  clear: () => set({ toasts: [] }),
}));

/** Удобный хелпер для вызова вне компонентов. */
export const toast = {
  success: (message: string, options?: { duration?: number; action?: Toast['action'] }) =>
    useToastStore.getState().show(message, 'success', options),
  error: (message: string, options?: { duration?: number; action?: Toast['action'] }) =>
    useToastStore.getState().show(message, 'error', options),
  info: (message: string, options?: { duration?: number; action?: Toast['action'] }) =>
    useToastStore.getState().show(message, 'info', options),
};
