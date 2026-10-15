/**
 * Управление темой (светлая / тёмная / системная).
 *
 * Тема применяется классом `dark` на <html>. Начальное значение выставляется
 * инлайн-скриптом в index.html до первой отрисовки, поэтому вспышки
 * белого экрана при загрузке нет.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import type { Theme } from '@/types';

const STORAGE_KEY = 'wfood-theme';

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme(theme: Theme): void {
  const isDark = theme === 'dark' || (theme === 'system' && systemPrefersDark());
  document.documentElement.classList.toggle('dark', isDark);

  // Синхронизируем цвет статус-бара на мобильных.
  const meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (meta) {
    meta.setAttribute('content', isDark ? '#1A1614' : '#FFF8F0');
  }
}

export function useTheme() {
  const profileTheme = useAuthStore((s) => s.profile?.theme);
  const setThemeInStore = useAuthStore((s) => s.setTheme);

  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
    } catch {
      // localStorage может быть недоступен в приватном режиме.
    }
    return (profileTheme as Theme) ?? 'system';
  });

  const [isDark, setIsDark] = useState<boolean>(() => {
    if (theme === 'system') return systemPrefersDark();
    return theme === 'dark';
  });

  useEffect(() => {
    applyTheme(theme);
    setIsDark(theme === 'dark' || (theme === 'system' && systemPrefersDark()));
  }, [theme]);

  // Реагируем на смену системной темы, если выбран режим «системная».
  useEffect(() => {
    if (theme !== 'system') return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (event: MediaQueryListEvent) => {
      document.documentElement.classList.toggle('dark', event.matches);
      setIsDark(event.matches);
    };

    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = useCallback(
    (next: Theme) => {
      setThemeState(next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* noop */
      }
      setThemeInStore(next);
    },
    [setThemeInStore],
  );

  const toggleTheme = useCallback(() => {
    setTheme(isDark ? 'light' : 'dark');
  }, [isDark, setTheme]);

  return { theme, isDark, setTheme, toggleTheme };
}
