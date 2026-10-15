import type { Config } from 'tailwindcss';
import tailwindcssAnimate from 'tailwindcss-animate';

/**
 * Дизайн-система WFOOD.
 * Палитра: апельсиновый primary (аппетит), тёплый бежевый secondary, мятный accent.
 * Все цвета заданы CSS-переменными, чтобы тёмная тема переключалась одним классом.
 */
const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1rem',
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: '#FF6B35',
          foreground: '#FFFFFF',
          50: '#FFF3ED',
          100: '#FFE1D1',
          200: '#FFC3A8',
          300: '#FFA47F',
          400: '#FF8757',
          500: '#FF6B35',
          600: '#ED4E14',
          700: '#C43C0C',
          800: '#9B300C',
          900: '#7A280C',
        },
        secondary: {
          DEFAULT: '#F7C59F',
          foreground: '#1A1614',
        },
        accent: {
          DEFAULT: '#2EC4B6',
          foreground: '#06201D',
        },
        destructive: {
          DEFAULT: '#E5484D',
          foreground: '#FFFFFF',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 4px)',
        sm: 'calc(var(--radius) - 8px)',
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        // Многослойные мягкие тени — «вкусный» объём без грязи.
        soft: '0 1px 2px rgba(26,22,20,0.04), 0 4px 12px rgba(26,22,20,0.06)',
        card: '0 2px 4px rgba(26,22,20,0.05), 0 12px 28px -8px rgba(26,22,20,0.12)',
        float: '0 4px 8px rgba(26,22,20,0.06), 0 24px 48px -12px rgba(26,22,20,0.20)',
        glow: '0 8px 32px -6px rgba(255,107,53,0.45)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.7' },
          '70%': { transform: 'scale(1.5)', opacity: '0' },
          '100%': { transform: 'scale(1.5)', opacity: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        shimmer: 'shimmer 1.6s infinite',
        'fade-up': 'fade-up 0.25s ease-out',
        'pulse-ring': 'pulse-ring 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      screens: {
        xs: '380px',
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
