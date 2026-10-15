/**
 * Маршрутизация приложения.
 *
 * Вкладки «Рядом», «Рулетка», «ИИ» и «Профиль» грузятся лениво:
 * карта и чат тянут за собой заметный объём JS, и держать их
 * в основном бандле незачем.
 */

import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { PlaceListSkeleton } from '@/components/ui/skeleton';

const Nearby = lazy(() => import('@/pages/Nearby'));
const Roulette = lazy(() => import('@/pages/Roulette'));
const AI = lazy(() => import('@/pages/AI'));
const Favorites = lazy(() => import('@/pages/Favorites'));
const Profile = lazy(() => import('@/pages/Profile'));
const RoomPage = lazy(() => import('@/pages/RoomPage'));
const CollectionPage = lazy(() => import('@/pages/CollectionPage'));
const NotFound = lazy(() => import('@/pages/NotFound'));

/** Фолбэк на время загрузки чанка вкладки. */
function PageFallback() {
  return (
    <div className="flex flex-col gap-3 p-4">
      <PlaceListSkeleton count={4} />
    </div>
  );
}

export function AppRoutes() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        {/* Главная — «Рядом»: самый частый сценарий входа. */}
        <Route path="/" element={<Navigate to="/nearby" replace />} />
        <Route path="/nearby" element={<Nearby />} />
        <Route path="/roulette" element={<Roulette />} />
        <Route path="/ai" element={<AI />} />
        <Route path="/favorites" element={<Favorites />} />
        <Route path="/profile" element={<Profile />} />

        {/* Вложенные маршруты доступны по прямой ссылке (шаринг) */}
        <Route path="/place/:placeId" element={<Nearby />} />
        <Route path="/room/:roomId" element={<RoomPage />} />
        <Route path="/c/:slug" element={<CollectionPage />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
