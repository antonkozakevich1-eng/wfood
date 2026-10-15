/**
 * Панель фильтров: липкая строка сверху + bottom sheet с полным набором.
 *
 * Логика в том, что основные фильтры (радиус, открыто сейчас, рейтинг)
 * доступны в один тап прямо в ленте, а всё остальное (кухни, удобства)
 * спрятано в sheet — иначе строка фильтров съедает пол-экрана.
 */

import { useMemo } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { Sheet } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useFiltersStore } from '@/stores/filtersStore';
import { collectCuisines } from '@/lib/places';
import { analytics } from '@/lib/analytics';
import { cn, cuisineLabel, pluralRu } from '@/lib/utils';
import { radiusLabel } from '@/lib/geo';
import { RADIUS_OPTIONS, type AmenityKey, type Place, type PriceLevel, type SortOption } from '@/types';

const SORT_LABELS: Record<SortOption, string> = {
  distance: 'Ближайшие',
  rating: 'По рейтингу',
  popularity: 'Популярные',
  newest: 'Новые',
};

const AMENITY_LABELS: Record<AmenityKey, string> = {
  delivery: '🛵 Доставка',
  wifi: '📶 Wi-Fi',
  dog_friendly: '🐕 Можно с собакой',
  kids_menu: '🧒 Детское меню',
  outdoor: '☀️ Терраса',
};

const PRICE_OPTIONS: Array<{ value: PriceLevel; label: string }> = [
  { value: 1, label: '$ до 10 €' },
  { value: 2, label: '$$ 10–20 €' },
  { value: 3, label: '$$$ 20–35 €' },
  { value: 4, label: '$$$$ 35 € +' },
];

/** Липкая строка быстрых фильтров над списком. */
export function FilterBar({ totalCount }: { totalCount: number }) {
  const radius = useFiltersStore((s) => s.radius);
  const setRadius = useFiltersStore((s) => s.setRadius);
  const openNow = useFiltersStore((s) => s.openNow);
  const toggleOpenNow = useFiltersStore((s) => s.toggleOpenNow);
  const minRating = useFiltersStore((s) => s.minRating);
  const setMinRating = useFiltersStore((s) => s.setMinRating);
  const activeCount = useFiltersStore((s) => s.activeCount());
  const setSheetOpen = useFiltersStore((s) => s.setSheetOpen);

  return (
    <div className="flex flex-col gap-2">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5">
        {/* Радиус — циклическое переключение одним тапом */}
        <button
          type="button"
          onClick={() => {
            const index = RADIUS_OPTIONS.indexOf(radius as (typeof RADIUS_OPTIONS)[number]);
            const next = RADIUS_OPTIONS[(index + 1) % RADIUS_OPTIONS.length] ?? 3000;
            setRadius(next);
            analytics.filterChanged('radius', next);
          }}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-xs font-medium transition-colors hover:border-primary/40"
          aria-label={`Радиус поиска: ${radiusLabel(radius)}. Нажмите, чтобы изменить`}
        >
          📍 {radiusLabel(radius)}
        </button>

        <button
          type="button"
          onClick={() => {
            toggleOpenNow();
            analytics.filterChanged('open_now', !openNow);
          }}
          aria-pressed={openNow}
          className={cn(
            'flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-colors',
            openNow
              ? 'border-emerald-500/40 bg-emerald-500/12 text-emerald-700 dark:text-emerald-400'
              : 'border-border bg-card hover:border-primary/40',
          )}
        >
          🕐 Открыто сейчас
        </button>

        <button
          type="button"
          onClick={() => {
            const next = minRating === 4 ? null : 4;
            setMinRating(next);
            analytics.filterChanged('min_rating', next);
          }}
          aria-pressed={minRating === 4}
          className={cn(
            'flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-colors',
            minRating === 4
              ? 'border-amber-500/40 bg-amber-500/12 text-amber-700 dark:text-amber-400'
              : 'border-border bg-card hover:border-primary/40',
          )}
        >
          ⭐ 4+
        </button>

        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className={cn(
            'flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-colors',
            activeCount > 0
              ? 'border-primary/40 bg-primary/12 text-primary'
              : 'border-border bg-card hover:border-primary/40',
          )}
          aria-label="Все фильтры"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          Фильтры
          {activeCount > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {totalCount > 0
          ? `${totalCount} ${pluralRu(totalCount, 'место', 'места', 'мест')} рядом`
          : 'Ничего не найдено'}
      </p>
    </div>
  );
}

/** Bottom sheet со всеми фильтрами. */
export function FilterSheet({ places }: { places: Place[] }) {
  const sheetOpen = useFiltersStore((s) => s.sheetOpen);
  const setSheetOpen = useFiltersStore((s) => s.setSheetOpen);

  const cuisines = useFiltersStore((s) => s.cuisines);
  const toggleCuisine = useFiltersStore((s) => s.toggleCuisine);
  const priceLevels = useFiltersStore((s) => s.priceLevels);
  const togglePriceLevel = useFiltersStore((s) => s.togglePriceLevel);
  const openNow = useFiltersStore((s) => s.openNow);
  const toggleOpenNow = useFiltersStore((s) => s.toggleOpenNow);
  const minRating = useFiltersStore((s) => s.minRating);
  const setMinRating = useFiltersStore((s) => s.setMinRating);
  const amenities = useFiltersStore((s) => s.amenities);
  const toggleAmenity = useFiltersStore((s) => s.toggleAmenity);
  const radius = useFiltersStore((s) => s.radius);
  const setRadius = useFiltersStore((s) => s.setRadius);
  const sort = useFiltersStore((s) => s.sort);
  const setSort = useFiltersStore((s) => s.setSort);
  const reset = useFiltersStore((s) => s.reset);

  // Показываем только те кухни, что реально есть в текущей выдаче:
  // список из 40 абстрактных кухонь бесполезен.
  const availableCuisines = useMemo(() => collectCuisines(places), [places]);

  return (
    <Sheet
      open={sheetOpen}
      onClose={() => setSheetOpen(false)}
      title="Фильтры"
      description="Настройте, что искать рядом"
      size="full"
    >
      <div className="flex flex-col gap-5 pb-6">
        {/* Радиус */}
        <section className="flex flex-col gap-2.5">
          <h3 className="text-sm font-semibold">Радиус поиска</h3>
          <div className="flex flex-wrap gap-2">
            {RADIUS_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setRadius(option)}
                aria-pressed={radius === option}
                className={cn(
                  'h-9 rounded-full border px-4 text-xs font-medium transition-colors',
                  radius === option
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card hover:border-primary/40',
                )}
              >
                {radiusLabel(option)}
              </button>
            ))}
          </div>
        </section>

        {/* Сортировка */}
        <section className="flex flex-col gap-2.5">
          <h3 className="text-sm font-semibold">Сортировка</h3>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(SORT_LABELS) as SortOption[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setSort(option)}
                aria-pressed={sort === option}
                className={cn(
                  'h-9 rounded-full border px-3 text-xs font-medium transition-colors',
                  sort === option
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card hover:border-primary/40',
                )}
              >
                {SORT_LABELS[option]}
              </button>
            ))}
          </div>
        </section>

        {/* Кухня */}
        {availableCuisines.length > 0 && (
          <section className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Кухня</h3>
              {cuisines.length > 0 && (
                <button
                  type="button"
                  onClick={() => useFiltersStore.getState().setCuisines([])}
                  className="flex items-center gap-1 text-xs text-primary"
                >
                  <X className="h-3 w-3" />
                  Сбросить
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {availableCuisines.map(({ value, count }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    toggleCuisine(value);
                    analytics.filterChanged('cuisine', value);
                  }}
                  aria-pressed={cuisines.includes(value)}
                  className={cn(
                    'flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors',
                    cuisines.includes(value)
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card hover:border-primary/40',
                  )}
                >
                  {cuisineLabel(value)}
                  <span className="opacity-60">{count}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Цена */}
        <section className="flex flex-col gap-2.5">
          <h3 className="text-sm font-semibold">Средний чек</h3>
          <div className="grid grid-cols-2 gap-2">
            {PRICE_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => togglePriceLevel(value)}
                aria-pressed={priceLevels.includes(value)}
                className={cn(
                  'h-9 rounded-full border px-3 text-xs font-medium transition-colors',
                  priceLevels.includes(value)
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card hover:border-primary/40',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {/* Тумблеры */}
        <section className="flex flex-col gap-1">
          <div className="flex items-center justify-between rounded-2xl bg-muted/50 px-3.5 py-3">
            <div>
              <p className="text-sm font-medium">Открыто сейчас</p>
              <p className="text-xs text-muted-foreground">Скрыть закрытые заведения</p>
            </div>
            <Switch
              checked={openNow}
              onCheckedChange={() => toggleOpenNow()}
              aria-label="Только открытые сейчас"
            />
          </div>

          <div className="flex items-center justify-between rounded-2xl bg-muted/50 px-3.5 py-3">
            <div>
              <p className="text-sm font-medium">Рейтинг 4+</p>
              <p className="text-xs text-muted-foreground">Только проверенные места</p>
            </div>
            <Switch
              checked={minRating === 4}
              onCheckedChange={(checked) => setMinRating(checked ? 4 : null)}
              aria-label="Только с рейтингом 4 и выше"
            />
          </div>
        </section>

        {/* Удобства */}
        <section className="flex flex-col gap-2.5">
          <h3 className="text-sm font-semibold">Удобства</h3>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(AMENITY_LABELS) as AmenityKey[]).map((amenity) => (
              <button
                key={amenity}
                type="button"
                onClick={() => toggleAmenity(amenity)}
                aria-pressed={amenities.includes(amenity)}
                className={cn(
                  'h-9 rounded-full border px-3.5 text-xs font-medium transition-colors',
                  amenities.includes(amenity)
                    ? 'border-accent bg-accent text-accent-foreground'
                    : 'border-border bg-card hover:border-accent/40',
                )}
              >
                {AMENITY_LABELS[amenity]}
              </button>
            ))}
          </div>
        </section>

        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1" onClick={reset}>
            Сбросить всё
          </Button>
          <Button className="flex-1" onClick={() => setSheetOpen(false)}>
            Показать
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

/** Компактные чипсы активных фильтров для отображения в ленте. */
export function ActiveFilterChips() {
  const cuisines = useFiltersStore((s) => s.cuisines);
  const toggleCuisine = useFiltersStore((s) => s.toggleCuisine);
  const priceLevels = useFiltersStore((s) => s.priceLevels);
  const togglePriceLevel = useFiltersStore((s) => s.togglePriceLevel);
  const amenities = useFiltersStore((s) => s.amenities);
  const toggleAmenity = useFiltersStore((s) => s.toggleAmenity);

  const chips = [
    ...cuisines.map((c) => ({ key: `cuisine-${c}`, label: cuisineLabel(c), onRemove: () => toggleCuisine(c) })),
    ...priceLevels.map((p) => ({
      key: `price-${p}`,
      label: '$'.repeat(p),
      onRemove: () => togglePriceLevel(p),
    })),
    ...amenities.map((a) => ({
      key: `amenity-${a}`,
      label: AMENITY_LABELS[a],
      onRemove: () => toggleAmenity(a),
    })),
  ];

  if (chips.length === 0) return null;

  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
      {chips.map((chip) => (
        <motion.button
          key={chip.key}
          type="button"
          onClick={chip.onRemove}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="flex h-7 shrink-0 items-center gap-1 rounded-full bg-primary/12 px-2.5 text-[11px] font-medium text-primary"
          aria-label={`Убрать фильтр ${chip.label}`}
        >
          {chip.label}
          <X className="h-3 w-3" aria-hidden="true" />
        </motion.button>
      ))}
    </div>
  );
}

export { Badge };
