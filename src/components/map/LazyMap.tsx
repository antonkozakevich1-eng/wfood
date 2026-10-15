/**
 * Ленивая обёртка карты.
 *
 * Leaflet + markercluster — это ~150 КБ JS. На вкладках «Рулетка»
 * и «ИИ» карта не нужна, поэтому грузим её отдельным чанком
 * и только при первом обращении к «Рядом».
 */

import { Suspense, lazy } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import type { Coords, Place } from '@/types';

const MapView = lazy(() => import('./MapView'));

interface LazyMapProps {
  places: Place[];
  center: Coords;
  selectedPlaceId: string | null;
  onSelectPlace: (place: Place) => void;
  radius: number;
  showUserLocation: boolean;
  className?: string;
}

export function LazyMap(props: LazyMapProps) {
  return (
    <Suspense
      fallback={
        <div className={props.className}>
          <Skeleton className="h-full w-full rounded-none" />
        </div>
      }
    >
      <MapView {...props} />
    </Suspense>
  );
}
