import { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { BottomNav } from '@/components/layout/BottomNav';
import { AppRoutes } from '@/routes';
import { useAuthStore } from '@/stores/authStore';
import { initAnalytics } from '@/lib/analytics';

export default function App() {
  const initAuth = useAuthStore((s) => s.init);

  useEffect(() => {
    // Инициализация сессии и аналитики — однократно при монтировании.
    void initAuth();
    initAnalytics();
  }, [initAuth]);

  return (
    <BrowserRouter>
      <div className="relative mx-auto flex min-h-screen-safe max-w-lg flex-col">
        {/*
          Отступ под фиксированную навигацию задаётся внутри страниц
          (.pb-nav или .pb-composer), а не здесь: экран чата прижимает
          поле ввода к навигации своим способом, и общий padding ломал бы
          расчёт высоты (h-screen-safe + flex).
        */}
        <main className="flex min-w-0 flex-1 flex-col">
          <AppRoutes />
        </main>
        <BottomNav />
      </div>
      <Toaster />
    </BrowserRouter>
  );
}
