/**
 * Карта заведений на Leaflet + OpenStreetMap.
 *
 * Особенности:
 *   - кластеризация через leaflet.markercluster (нативные DOM-маркеры,
 *     а не react-leaflet-обёртка: плагин требует прямого доступа к карте);
 *   - пульсирующий маркер текущего местоположения;
 *   - авто-подгонка границ под найденные места;
 *   - тёмная тема через CSS-фильтр тайлов (см. globals.css).
 *
 * Компонент грузится лениво (React.lazy): Leaflet — это ~150 КБ JS,
 * который не нужен на вкладках «Рулетка» и «ИИ».
 */

import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { cuisineEmoji } from '@/lib/utils';
import type { Coords, Place } from '@/types';

/** Leaflet по умолчанию ищет иконки в CSS-путях, которые Vite переписывает.
 *  Мы используем divIcon и не пользуемся стандартными иконками вообще. */
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)['_getIconUrl'];

interface MapViewProps {
  places: Place[];
  center: Coords;
  selectedPlaceId: string | null;
  onSelectPlace: (place: Place) => void;
  /** Радиус поиска — рисуем круг, чтобы пользователь понимал границы. */
  radius: number;
  /** Показывать ли точку пользователя. */
  showUserLocation: boolean;
  className?: string;
}

export default function MapView({
  places,
  center,
  selectedPlaceId,
  onSelectPlace,
  radius,
  showUserLocation,
  className,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const radiusCircleRef = useRef<L.Circle | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  // Колбэк в ref: элементы маркеров создаются один раз и не должны
  // пересоздаваться при каждом изменении пропса.
  const onSelectRef = useRef(onSelectPlace);
  useEffect(() => {
    onSelectRef.current = onSelectPlace;
  }, [onSelectPlace]);

  // --- Инициализация карты (один раз) ---
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [center.lat, center.lng],
      zoom: 15,
      zoomControl: false,
      attributionControl: true,
      // Плавный зум колёсиком: рывки на тачпаде раздражают.
      wheelPxPerZoomLevel: 90,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    tileLayerRef.current = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
      // Не грузим тайлы за пределами видимой области — экономия трафика.
      keepBuffer: 2,
      updateWhenIdle: true,
    }).addTo(map);

    clusterRef.current = L.markerClusterGroup({
      // Свои иконки кластеров вместо дефолтных синих кругов.
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();
        const size = count < 10 ? 40 : count < 100 ? 48 : 56;
        const variant = count < 10 ? '' : count < 100 ? ' marker-cluster-wfood--md' : ' marker-cluster-wfood--lg';

        return L.divIcon({
          html: `<div class="marker-cluster-wfood${variant}" style="width:${size}px;height:${size}px">${count}</div>`,
          className: '',
          iconSize: L.point(size, size),
        });
      },
      maxClusterRadius: 55,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      // Разбиваем кластеры плавно, чтобы не было «прыжка» меток.
      animate: true,
      animateAddingMarkers: false,
      chunkedLoading: true,
    });
    map.addLayer(clusterRef.current);

    radiusCircleRef.current = L.circle([center.lat, center.lng], {
      radius,
      color: '#FF6B35',
      weight: 1.5,
      opacity: 0.5,
      fillColor: '#FF6B35',
      fillOpacity: 0.06,
      interactive: false,
    }).addTo(map);

    mapRef.current = map;

    // Leaflet неправильно считает размеры, если контейнер изменился
    // (например, открылась клавиатура или повернулся экран).
    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      clusterRef.current = null;
      userMarkerRef.current = null;
      radiusCircleRef.current = null;
      tileLayerRef.current = null;
    };
    // Инициализация выполняется один раз: зависимости намеренно пустые.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Центр и радиус ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    radiusCircleRef.current?.setLatLng([center.lat, center.lng]);
    radiusCircleRef.current?.setRadius(radius);
  }, [center.lat, center.lng, radius]);

  // --- Точка пользователя ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!showUserLocation) {
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      return;
    }

    const icon = L.divIcon({
      html: '<div class="user-location-marker"><div class="user-location-pulse"></div><div class="user-location-dot"></div></div>',
      className: '',
      iconSize: L.point(18, 18),
      iconAnchor: L.point(9, 9),
    });

    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([center.lat, center.lng]);
    } else {
      userMarkerRef.current = L.marker([center.lat, center.lng], {
        icon,
        interactive: false,
        zIndexOffset: 1000,
      }).addTo(map);
    }
  }, [center.lat, center.lng, showUserLocation]);

  // --- Метки заведений ---
  useEffect(() => {
    const cluster = clusterRef.current;
    if (!cluster) return;

    cluster.clearLayers();

    const markers = places.map((place) => {
      const isSelected = place.id === selectedPlaceId;

      const marker = L.marker([place.lat, place.lng], {
        icon: L.divIcon({
          html: `<div class="place-marker ${
            isSelected ? 'place-marker--selected' : ''
          } ${place.is_open_now ? '' : 'place-marker--closed'}">${cuisineEmoji(place.cuisine)}</div>`,
          className: isSelected ? 'place-marker-pin' : '',
          iconSize: L.point(36, 36),
          iconAnchor: L.point(18, 18),
        }),
        // Название показываем в тултипе, детали — в bottom sheet.
        title: place.name,
        riseOnHover: true,
      });

      marker.on('click', () => {
        onSelectRef.current(place);
      });

      return marker;
    });

    cluster.addLayers(markers);
  }, [places, selectedPlaceId]);

  // --- Авто-подгонка границ при первой загрузке мест ---
  const hasFittedRef = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || places.length === 0 || hasFittedRef.current) return;

    const bounds = L.latLngBounds(places.map((p) => [p.lat, p.lng] as [number, number]));
    // Не подгоняем, если все места в одной точке: получится зум 19 на один ресторан.
    if (bounds.isValid() && places.length > 1) {
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16 });
      hasFittedRef.current = true;
    }
  }, [places]);

  // Сброс флага подгонки при смене фильтров, чтобы карта снова
  // показала всю новую выдачу.
  const placeCountRef = useRef(places.length);
  useEffect(() => {
    if (Math.abs(places.length - placeCountRef.current) > 8) {
      hasFittedRef.current = false;
    }
    placeCountRef.current = places.length;
  }, [places.length]);

  // --- Плавный перелёт к выбранному месту ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedPlaceId) return;

    const place = places.find((p) => p.id === selectedPlaceId);
    if (!place) return;

    map.flyTo([place.lat, place.lng], Math.max(map.getZoom(), 16), {
      duration: 0.6,
      easeLinearity: 0.25,
    });
  }, [selectedPlaceId, places]);

  const containerId = useMemo(() => 'wfood-map', []);

  return (
    <div
      id={containerId}
      ref={containerRef}
      className={className}
      // Карта — декоративный элемент для скринридера: список под ней
      // даёт тот же контент в доступной форме.
      role="application"
      aria-label="Карта заведений рядом"
    />
  );
}
