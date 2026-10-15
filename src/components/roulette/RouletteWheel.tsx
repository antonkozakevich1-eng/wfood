/**
 * Колесо рулетки.
 *
 * Вращение — CSS-трансформация с cubic-bezier замедлением: это дешевле
 * для GPU, чем анимация через JS, и не дёргается на слабых телефонах.
 *
 * Секторы рисуются SVG: они должны масштабироваться под любой размер
 * без размытия и пересчитываться при смене пула мест.
 */

import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { cuisineEmoji } from '@/lib/utils';
import type { Place } from '@/types';

interface RouletteWheelProps {
  /** Места, попавшие в пул (до 8 — остальные не помещаются визуально). */
  pool: Place[];
  spinning: boolean;
  /** Угол поворота в градусах. */
  rotation: number;
  /** Длительность вращения, мс. */
  duration: number;
  /** Индекс победившего сектора (для подсветки). */
  winnerIndex: number | null;
  size?: number;
}

export const RouletteWheel = memo(function RouletteWheel({
  pool,
  spinning,
  rotation,
  duration,
  winnerIndex,
  size = 260,
}: RouletteWheelProps) {
  // Показываем максимум 8 секторов: больше — нечитаемо на телефоне.
  const sectors = useMemo(() => pool.slice(0, 8), [pool]);
  const radius = size / 2;
  const sectorAngle = sectors.length > 0 ? 360 / sectors.length : 0;

  /** Путь SVG для сектора-«пирога». */
  const sectorPath = (index: number): string => {
    const startAngle = (index * sectorAngle - 90) * (Math.PI / 180);
    const endAngle = ((index + 1) * sectorAngle - 90) * (Math.PI / 180);

    const x1 = radius + radius * Math.cos(startAngle);
    const y1 = radius + radius * Math.sin(startAngle);
    const x2 = radius + radius * Math.cos(endAngle);
    const y2 = radius + radius * Math.sin(endAngle);

    // Для полного круга (один сектор) дуга невозможна — рисуем окружность.
    if (sectors.length === 1) {
      return `M ${radius} 0 A ${radius} ${radius} 0 1 1 ${radius - 0.01} 0 Z`;
    }

    const largeArc = sectorAngle > 180 ? 1 : 0;
    return `M ${radius} ${radius} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
  };

  /** Чередующиеся оттенки — секторы должны различаться визуально. */
  const sectorColor = (index: number): string => {
    const palette = ['#FF6B35', '#FF8757', '#F7C59F', '#2EC4B6', '#FFA47F', '#FFC3A8'];
    if (winnerIndex === index) return '#2EC4B6';
    return palette[index % palette.length] ?? '#FF6B35';
  };

  if (sectors.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-full border-4 border-dashed border-border bg-muted"
        style={{ width: size, height: size }}
      >
        <p className="max-w-[60%] text-center text-sm text-muted-foreground">
          Нет мест под фильтры
        </p>
      </div>
    );
  }

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Указатель сверху */}
      <div
        className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1"
        aria-hidden="true"
      >
        <div className="h-0 w-0 border-l-[10px] border-r-[10px] border-t-[14px] border-l-transparent border-r-transparent border-t-primary drop-shadow-md" />
      </div>

      <motion.div
        className="h-full w-full"
        style={{ transformOrigin: 'center' }}
        animate={{ rotate: rotation }}
        transition={{
          duration: spinning ? duration / 1000 : 0,
          // easeOutQuint: быстро стартует, долго и плавно замедляется —
          // это и создаёт ощущение «настоящего» колеса.
          ease: [0.15, 0.9, 0.25, 1],
        }}
      >
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="drop-shadow-xl"
          role="img"
          aria-label={`Колесо рулетки: ${sectors.length} вариантов`}
        >
          {sectors.map((place, index) => (
            <path
              key={place.id}
              d={sectorPath(index)}
              fill={sectorColor(index)}
              stroke="white"
              strokeWidth="2"
            />
          ))}

          {/* Эмодзи кухни на каждом секторе */}
          {sectors.map((place, index) => {
            const midAngle = (index * sectorAngle + sectorAngle / 2 - 90) * (Math.PI / 180);
            // 0.62 радиуса: emoji должны быть ближе к краю, но не вылезать.
            const textRadius = radius * 0.62;
            const x = radius + textRadius * Math.cos(midAngle);
            const y = radius + textRadius * Math.sin(midAngle);

            return (
              <text
                key={`emoji-${place.id}`}
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={Math.max(16, size / 14)}
                // Поворачиваем так, чтобы эмодзи «смотрели» наружу.
                transform={`rotate(${index * sectorAngle + sectorAngle / 2} ${x} ${y})`}
              >
                {cuisineEmoji(place.cuisine)}
              </text>
            );
          })}

          {/* Центральная втулка */}
          <circle cx={radius} cy={radius} r={size * 0.12} fill="white" />
          <circle cx={radius} cy={radius} r={size * 0.12} fill="none" stroke="#FF6B35" strokeWidth="3" />
        </svg>
      </motion.div>
    </div>
  );
});
