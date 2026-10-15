/**
 * Конфетти без внешней библиотеки.
 *
 * Реализовано на canvas: рисуем N частиц с физикой (гравитация, вращение,
 * затухание) и останавливаем анимацию, когда все они улетели за экран.
 * ~60 строк вместо зависимости на 30 КБ.
 */

import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
  shape: 'rect' | 'circle';
}

/** Палитра WFOOD + дополнительные «праздничные» цвета. */
const COLORS = ['#FF6B35', '#F7C59F', '#2EC4B6', '#FFD166', '#EF476F', '#FFFFFF'];

const PARTICLE_COUNT = 110;
const GRAVITY = 0.28;
const DRAG = 0.992;
/** Частица считается улетевшей, если она ниже экрана или погасла. */
const MAX_LIFETIME_MS = 3200;

interface ConfettiProps {
  /** Изменение этого значения перезапускает залп. */
  trigger: number;
  /** Показывать ли конфетти (уважаем prefers-reduced-motion). */
  enabled?: boolean;
}

export function Confetti({ trigger, enabled = true }: ConfettiProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || trigger === 0) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Учитываем devicePixelRatio, иначе на Retina конфетти будет мыльным.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    const startTime = performance.now();

    // Залп из двух точек — верхних углов: так конфетти разлетается «занавесом».
    const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
      const fromLeft = i % 2 === 0;
      return {
        x: fromLeft ? width * 0.5 - 40 : width * 0.5 + 40,
        y: height * 0.32,
        vx: (fromLeft ? -1 : 1) * (2 + Math.random() * 7) + (Math.random() - 0.5) * 3,
        vy: -6 - Math.random() * 9,
        size: 5 + Math.random() * 7,
        color: COLORS[Math.floor(Math.random() * COLORS.length)] ?? '#FF6B35',
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.3,
        shape: Math.random() > 0.5 ? 'rect' : 'circle',
      };
    });

    const animate = (now: number) => {
      const elapsed = now - startTime;

      // Затухание в конце: конфетти не должно исчезать рывком.
      const fadeStart = MAX_LIFETIME_MS - 600;
      const alpha = elapsed > fadeStart ? Math.max(0, 1 - (elapsed - fadeStart) / 600) : 1;

      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = alpha;

      let alive = false;

      for (const p of particles) {
        p.vy += GRAVITY;
        p.vx *= DRAG;
        p.vy *= DRAG;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;

        if (p.y < height + 50) alive = true;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;

        if (p.shape === 'rect') {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2.4, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }

      // Останавливаемся, когда всё улетело и время вышло.
      if (alive && elapsed < MAX_LIFETIME_MS) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        ctx.clearRect(0, 0, width, height);
        animationRef.current = null;
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      ctx.clearRect(0, 0, width, height);
    };
  }, [trigger, enabled]);

  if (!enabled) return null;

  return (
    <canvas
      ref={canvasRef}
      // pointer-events-none: конфетти не должно перехватывать тапы по кнопкам.
      className="pointer-events-none fixed inset-0 z-[60]"
      aria-hidden="true"
    />
  );
}
