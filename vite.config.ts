import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

/**
 * Конфиг Vite для WFOOD.
 * PWA настраивается здесь: манифест + service worker + оффлайн-кэш.
 */
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'og-default.png', 'favicon.svg'],
      manifest: {
        name: 'WFOOD — Где поесть?',
        short_name: 'WFOOD',
        description: 'Рулетка, карта и ИИ-помощник: выбери, где поесть, за 10 секунд.',
        lang: 'ru',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FFF8F0',
        theme_color: '#FF6B35',
        categories: ['food', 'lifestyle', 'travel'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        shortcuts: [
          { name: 'Рулетка', short_name: 'Рулетка', url: '/roulette' },
          { name: 'Рядом', short_name: 'Рядом', url: '/nearby' },
          { name: 'ИИ-помощник', short_name: 'ИИ', url: '/ai' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Карта и тайлы не кэшируются агрессивно — они большие и меняются.
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Тайлы OpenStreetMap: сеть с фолбэком в кэш на 7 дней.
            urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-tiles',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Supabase REST: свежие данные в приоритете, кэш — только если сети нет.
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-rest',
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          // Карта тяжёлая и нужна только на вкладке «Рядом» — выносим отдельно.
          leaflet: ['leaflet', 'react-leaflet', 'leaflet.markercluster'],
          // React-ядро: кэшируется между деплоями, так как меняется редко.
          vendor: ['react', 'react-dom', 'react-router-dom'],
          // framer-motion — самая крупная зависимость после Leaflet.
          motion: ['framer-motion'],
        },
      },
    },
  },
});
