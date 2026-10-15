/**
 * Геометрия: расстояние, кластеризация, работа с координатами.
 */

import type { Coords, Place } from '@/types';

const EARTH_RADIUS_M = 6_371_000;

/** Расстояние между двумя точками по формуле гаверсинуса (в метрах). */
export function haversine(a: Coords, b: Coords): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Прямоугольник, покрывающий круг заданного радиуса.
 * Используется для подгонки границ карты и для грубого отсева.
 */
export function boundingBox(center: Coords, radiusMeters: number) {
  const latDelta = radiusMeters / 111_320;
  const lngDelta = radiusMeters / (111_320 * Math.max(Math.cos(toRad(center.lat)), 0.01));

  return {
    minLat: center.lat - latDelta,
    maxLat: center.lat + latDelta,
    minLng: center.lng - lngDelta,
    maxLng: center.lng + lngDelta,
  };
}

/** Центр набора точек — для автоцентрирования карты. */
export function centerOf(points: Coords[]): Coords | null {
  if (points.length === 0) return null;

  let sumLat = 0;
  let sumLng = 0;
  for (const p of points) {
    sumLat += p.lat;
    sumLng += p.lng;
  }
  return { lat: sumLat / points.length, lng: sumLng / points.length };
}

/** Простой кластер меток для случаев, когда leaflet.markercluster избыточен. */
export interface Cluster {
  id: string;
  center: Coords;
  places: Place[];
  count: number;
}

/**
 * Кластеризует места по сетке.
 * Используется как резерв, если плагин кластеризации не загрузился
 * (или для статистики «сколько мест в этом районе»).
 */
export function clusterByGrid(places: Place[], cellSizeDeg = 0.004): Cluster[] {
  const cells = new Map<string, Place[]>();

  for (const place of places) {
    const key = `${Math.floor(place.lat / cellSizeDeg)}:${Math.floor(place.lng / cellSizeDeg)}`;
    const bucket = cells.get(key);
    if (bucket) {
      bucket.push(place);
    } else {
      cells.set(key, [place]);
    }
  }

  return Array.from(cells.entries()).map(([key, bucket]) => {
    const center = centerOf(bucket.map((p) => ({ lat: p.lat, lng: p.lng }))) ?? {
      lat: 0,
      lng: 0,
    };
    return { id: key, center, places: bucket, count: bucket.length };
  });
}

/** Проверяет, попадает ли точка в радиус от центра. */
export function isWithinRadius(point: Coords, center: Coords, radiusMeters: number): boolean {
  return haversine(center, point) <= radiusMeters;
}

/** Текстовая метка радиуса для UI: «500 м», «3 км». */
export function radiusLabel(radius: number): string {
  return radius < 1000 ? `${radius} м` : `${radius / 1000} км`;
}
