# 🍽️ WFOOD — Где поесть?

> PWA, которая отвечает на вопрос «Где поесть?» за **10 секунд**.
> Пилот: **Эстония, Таллинн** · Валюта: **EUR (€)** · Языки: **RU / EN**

<div align="center">

**🎰 Рулетка** · **📍 Рядом** · **🤖 ИИ-помощник** · **⭐ Избранное** · **👤 Профиль**

</div>

---

## 📖 Содержание

- [Что это](#-что-это)
- [Быстрый старт](#-быстрый-старт)
- [Переменные окружения](#-переменные-окружения-главное)
- [Supabase: база и Edge Functions](#-supabase-база-и-edge-functions)
- [Деплой на Vercel через GitHub](#-деплой-на-vercel-через-github)
- [Git-flow и conventional commits](#-git-flow-и-conventional-commits)
- [Секреты: где что хранить](#-секреты-где-что-хранить)
- [Архитектура](#-архитектура)
- [Структура проекта](#-структура-проекта)
- [Скрипты](#-скрипты)
- [Траблшутинг](#-траблшутинг)

---

## 🎯 Что это

WFOOD помогает компании друзей, паре или коллегам быстро выбрать, где поесть:

| Вкладка | Что делает |
|---|---|
| 🎰 **Рулетка** | Крутит колесо → выпадает одно заведение. Фильтры по кухне, бюджету, радиусу, рейтингу. Конфетти, кнопки «Идём сюда», «Ещё раз», «Спросить ИИ». |
| 📍 **Рядом** | Карта Leaflet + кластеризация меток + bottom sheet со списком. Бесконечная прокрутка по 20 мест. Липкие фильтры, сортировка, поиск. |
| 🤖 **ИИ-помощник** | Чат на Gemini с автоматическим fallback на OpenAI. Свободный чат, быстрые чипсы, групповой режим (комната для друзей). |
| ⭐ **Избранное** | Сохранённые места и личные подборки с шарингом по ссылке. |
| 👤 **Профиль** | Город, диеты, аллергии, бюджет, тема, язык, история. |

**Источники данных:** OpenStreetMap (Overpass API, основной бесплатный) → Google Places (обогащение, опционально) → краудсорсинг → локальный сид. Приложение полностью работает **без единого платного ключа**.

---

## 🚀 Быстрый старт

### Требования

- **Node.js 20+** (проверено на 20 и 22)
- **npm 10+**
- Аккаунт [Supabase](https://supabase.com) (бесплатного тарифа достаточно)
- Для локального запуска Edge Functions — Docker (опционально)

### 1. Клонирование

```bash
git clone https://github.com/antonkozakevich1-eng/wfood.git
cd wfood
```

### 2. Установка зависимостей

```bash
npm install
```

### 3. Настройка `.env.local`

```bash
# Windows PowerShell
Copy-Item .env.local.example .env.local

# macOS / Linux
cp .env.local.example .env.local
```

Откройте `.env.local` и заполните **минимум две** переменные:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

> Где взять: [Supabase Dashboard](https://supabase.com/dashboard) → ваш проект → **Settings → API**.

> ⚠️ Без Supabase приложение всё равно запустится: оно покажет локальный сид таллиннских заведений и будет работать в read-only режиме. Но ИИ, избранное и авторизация требут бэкенда.

### 4. Запуск

```bash
npm run dev
```

Откройте **http://localhost:5173**.

### 5. Сборка

```bash
npm run build     # → dist/
npm run preview   # локальный просмотр собранной версии
```

---

## 🔑 Переменные окружения (главное)

**Три разных места. Не путайте их.**

```text
┌─────────────────────────┬──────────────────────────┬─────────────────────────────┐
│  .env.local             │  Vercel Environment Vars │  Supabase Secrets           │
│  (локальная разработка) │  (продакшен фронтенда)   │  (Edge Functions, бэкенд)   │
├─────────────────────────┼──────────────────────────┼─────────────────────────────┤
│  VITE_* только          │  VITE_* только           │  БЕЗ префикса VITE_         │
│  Попадают в бандл       │  Попадают в бандл        │  НИКОГДА не в бандл         │
│  В .gitignore           │  Вводятся в дашборде     │  supabase secrets set       │
└─────────────────────────┴──────────────────────────┴─────────────────────────────┘
```

### Правило префикса `VITE_`

| Префикс | Видит браузер? | Что туда кладём |
|---|---|---|
| `VITE_` | ✅ Да — Vite **инлайнит значение в JS-бандл открытым текстом** | Публичные значения: URL проекта, anon-ключ, настройки, PostHog-ключ |
| без префикса | ❌ Нет — недоступно в `import.meta.env` | Секреты. Только в Supabase Secrets |

> 🔴 **Никогда не давайте секретам префикс `VITE_`.** Если написать `VITE_OPENAI_API_KEY`, ключ окажется в `dist/assets/*.js` и его заберут за минуты. `SUPABASE_ANON_KEY` — исключение: он **создан** для браузера, доступ ограничивается через RLS-политики.

### Полная таблица переменных

#### A. `.env.local` — локальная разработка (префикс `VITE_`)

| Переменная | Обяз. | Где взять |
|---|---|---|
| `VITE_SUPABASE_URL` | ✅ | Supabase → Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Supabase → Settings → API → anon public |
| `VITE_DEFAULT_CITY` | — | `Tallinn` |
| `VITE_DEFAULT_COUNTRY` | — | `EE` |
| `VITE_DEFAULT_CURRENCY` | — | `EUR` |
| `VITE_DEFAULT_LOCALE` | — | `ru` или `en` |
| `VITE_DEFAULT_LAT` / `VITE_DEFAULT_LNG` | — | Центр карты без геолокации (Ратушная площадь) |
| `VITE_AI_DAILY_LIMIT` | — | `10` — должно совпадать с `DAILY_LIMIT` в `ai-chat` |
| `VITE_POSTHOG_KEY` | — | PostHog → Project Settings → Project API Key |
| `VITE_POSTHOG_HOST` | — | `https://eu.i.posthog.com` |
| `VITE_ANALYTICS_ENABLED` | — | `true` / `false` |
| `VITE_APP_ENV` | — | `development` / `production` |

#### B. Vercel Environment Variables — продакшен фронтенда

**Те же `VITE_*`-переменные, что и в `.env.local`.** Секретов здесь нет.

#### C. Supabase Secrets — Edge Functions (БЕЗ `VITE_`)

| Переменная | Обяз. | Где взять |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase → Settings → API → `service_role` ⚠️ обходит RLS |
| `GEMINI_API_KEY` | ✅ (для ИИ) | [Google AI Studio](https://aistudio.google.com/apikey) — есть бесплатный тариф |
| `OPENAI_API_KEY` | ✅ (fallback + DALL·E) | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| `GOOGLE_PLACES_API_KEY` | — | [Google Cloud Console](https://console.cloud.google.com) — нужен billing |
| `OPENWEATHER_API_KEY` | — | [openweathermap.org](https://openweathermap.org/api) — контекст для ИИ |
| `GEMINI_MODEL` | — | `gemini-1.5-flash` |
| `OPENAI_MODEL` | — | `gpt-4o-mini` |
| `ENVIRONMENT` | — | `production` / `development` |

---

## 🗄️ Supabase: база и Edge Functions

### 1. Создание проекта

1. [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**
2. Регион: **Central EU (Frankfurt)** — ближе всего к Таллинну
3. Задайте пароль БД (он понадобится только для `supabase db push`)

### 2. Применение миграций

**Вариант A — через Dashboard (проще, без CLI):**

Откройте **SQL Editor** и выполните по очереди содержимое файлов:

1. `supabase/migrations/001_init.sql`
2. `supabase/migrations/002_rls.sql`
3. `supabase/migrations/003_indexes.sql`

**Вариант B — через Supabase CLI:**

```bash
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

### 3. Storage-бакет для картинок

ИИ генерирует обложки через DALL·E и складывает их в Storage. Создайте бакет:

**Dashboard → Storage → New bucket**

- Имя: `wfood-images`
- Публичный: **Public** ✅

Затем выполните в SQL Editor:

```sql
-- Чтение картинок — всем, запись — только Edge Functions (service_role)
create policy "wfood_images_public_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'wfood-images');
```

### 4. Деплой Edge Functions

```bash
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>

# Секреты (файл supabase/.env.secrets в .gitignore)
Copy-Item supabase/.env.secrets.example supabase/.env.secrets
# ...заполните значения...
supabase secrets set --env-file ./supabase/.env.secrets

# Деплой функций
supabase functions deploy ai-chat
supabase functions deploy generate-image
supabase functions deploy fetch-places
```

> 💡 Если `supabase secrets set` не срабатывает из-за формата, задайте по одной:
> ```bash
> supabase secrets set GEMINI_API_KEY=xxx
> supabase secrets set OPENAI_API_KEY=xxx
> supabase secrets set GOOGLE_PLACES_API_KEY=xxx
> supabase secrets set SUPABASE_SERVICE_ROLE_KEY=xxx
> ```

> ℹ️ `SUPABASE_URL` и `SUPABASE_ANON_KEY` доступны в Edge Functions автоматически — задавать их не нужно.

Проверить, что всё задано:

```bash
supabase secrets list
```

### 5. Наполнение базы местами

После первого запроса к `/fetch-places` база наполнится автоматически. Чтобы прогрести Таллинн заранее:

```bash
curl "https://<project-ref>.supabase.co/functions/v1/fetch-places?lat=59.4370&lng=24.7536&radius=5000&refresh=true" \
  -H "Authorization: Bearer <your-anon-key>"
```

Повторите для разных районов (Кадриорг, Кристийне, Юлемисте), меняя `lat`/`lng`.

---

## ▲ Деплой на Vercel через GitHub

### Шаг 1. Пуш в GitHub

```bash
git init
git add .
git commit -m "feat: initial WFOOD release"
git branch -M main
git remote add origin https://github.com/antonkozakevich1-eng/wfood.git
git push -u origin main
```

### Шаг 2. Импорт проекта в Vercel

1. Зайдите на **[vercel.com](https://vercel.com)** и войдите через GitHub
2. **Add New… → Project**
3. В разделе **Import Git Repository** найдите `wfood` → **Import**

> Если репозитория нет в списке — нажмите **Adjust GitHub App Permissions** и дайте Vercel доступ к нему.

### Шаг 3. Настройка сборки

Vercel определит Vite сам, но **проверьте вручную**, чтобы не получить пустой деплой:

| Параметр | Значение |
|---|---|
| **Framework Preset** | `Vite` |
| **Root Directory** | `.` (корень репозитория — не меняйте) |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |
| **Install Command** | `npm install` |
| **Node.js Version** | `20.x` |

Node Version: **Settings → General → Node.js Version → 20.x**.

> 🔧 Эти же значения продублированы в `vercel.json`, поэтому Vercel подхватит их автоматически. Правки в дашборде имеют приоритет над файлом.

### Шаг 4. Первый деплой (пока без переменных)

Нажмите **Deploy**. Сборка пройдёт успешно, но приложение покажет сид-данные и надпись про отсутствующий Supabase — это **ожидаемо**, переменные ещё не заданы.

### Шаг 5. Добавление переменных окружения

1. Проект в Vercel → **Settings → Environment Variables**
2. Добавьте каждую переменную из [таблицы B](#b-vercel-environment-variables--продакшен-фронтенда):

| Name | Value | Environments |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://xxx.supabase.co` | Production, Preview, Development |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGci...` | Production, Preview, Development |
| `VITE_DEFAULT_CITY` | `Tallinn` | Production, Preview, Development |
| `VITE_DEFAULT_COUNTRY` | `EE` | Production, Preview, Development |
| `VITE_DEFAULT_CURRENCY` | `EUR` | Production, Preview, Development |
| `VITE_DEFAULT_LOCALE` | `ru` | Production, Preview, Development |
| `VITE_DEFAULT_LAT` | `59.4370` | Production, Preview, Development |
| `VITE_DEFAULT_LNG` | `24.7536` | Production, Preview, Development |
| `VITE_AI_DAILY_LIMIT` | `10` | Production, Preview, Development |
| `VITE_POSTHOG_KEY` | `phc_xxx` (или пусто) | Production |
| `VITE_POSTHOG_HOST` | `https://eu.i.posthog.com` | Production |
| `VITE_ANALYTICS_ENABLED` | `true` | Production |
| `VITE_APP_ENV` | `production` | Production |

> ⚠️ **Секретов (`OPENAI_API_KEY`, `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) здесь быть НЕ должно.** Они живут только в Supabase Secrets. Единственное исключение — если вы осознанно добавляете их как «Sensitive» для будущих серверных функций Vercel; фронтенду они не нужны.

### Шаг 6. Redeploy

Переменные применяются **только при новой сборке** — Vite инлайнит их на этапе билда:

**Deployments → у последнего деплоя ⋯ → Redeploy → ✅ Use existing Build Cache: выключить**

### Шаг 7. Автодеплой

Настраивается **автоматически** при импорте из GitHub:

| Событие | Результат |
|---|---|
| Push в `main` | 🚀 Деплой в **Production** |
| Push в `dev` | 🔍 Деплой в **Preview** |
| Pull Request в `main` | 🔍 Деплой в **Preview** + комментарий со ссылкой |

Отключить или изменить: **Settings → Git → Ignored Build Step**.

### Шаг 8. Свой домен (опционально)

**Settings → Domains → Add** → введите домен → пропишите DNS-записи, которые покажет Vercel. HTTPS-сертификат выпустится автоматически.

---

## 🌿 Git-flow и conventional commits

### Ветки

```
main      ← продакшен. Только через PR. Каждый мердж = деплой.
  ↑
dev       ← интеграция. Сюда мерджатся фичи.
  ↑
feature/* ← отдельная фича от dev
```

```bash
# Новая фича
git checkout dev
git pull origin dev
git checkout -b feature/roulette-confetti
# ...работа...
git commit -m "feat(roulette): add confetti animation on result"
git push -u origin feature/roulette-confetti
# → открыть Pull Request в dev
```

### Conventional commits

Формат: `<тип>(<область>): <описание>`

| Тип | Когда |
|---|---|
| `feat` | Новая функциональность |
| `fix` | Исправление бага |
| `docs` | Только документация |
| `chore` | Сборка, зависимости, конфиги |
| `refactor` | Рефакторинг без смены поведения |
| `perf` | Оптимизация производительности |
| `test` | Тесты |
| `style` | Форматирование |

Примеры:

```bash
git commit -m "feat(ai): add group room mode with realtime sync"
git commit -m "fix(map): prevent marker cluster leak on unmount"
git commit -m "docs(readme): add Vercel env variables table"
git commit -m "chore(deps): bump supabase-js to 2.45.4"
```

### Защита ветки `main` (рекомендуется)

**GitHub → Settings → Branches → Add branch protection rule**

- Branch name pattern: `main`
- ✅ Require a pull request before merging
- ✅ Require status checks to pass → выберите **CI / Lint, typecheck, build**

---

## 🔐 Секреты: где что хранить

| Место | Что | Как задать |
|---|---|---|
| **`.env.local`** | Публичные `VITE_*` для локальной разработки | Файл, в `.gitignore` |
| **Vercel → Environment Variables** | Публичные `VITE_*` для прода | Settings → Environment Variables |
| **Supabase → Edge Function Secrets** | `GEMINI_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_PLACES_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | `supabase secrets set` |
| **GitHub → Settings → Secrets and variables → Actions** | Секреты для CI/CD (если понадобятся) | Дашбордом. В логах маскируются |
| **GitHub → Settings → Secrets and variables → Variables** | Несекретные значения для CI | Как в `ci.yml`: `vars.VITE_SUPABASE_URL` |

### ❌ Чего делать нельзя

- Коммитить `.env`, `.env.local`, `supabase/.env.secrets`
- Давать секретам префикс `VITE_`
- Вставлять ключи прямо в код
- Публиковать `SUPABASE_SERVICE_ROLE_KEY` — он **обходит все RLS-политики**

### ✅ Проверка перед пушем

```bash
git status                    # .env.local не должен быть в списке
git diff --cached             # глазами проверить, что нет ключей
```

Если ключ всё-таки попал в репозиторий — **считайте его скомпрометированным и отзовите немедленно**. Удаление коммита не поможет: он остаётся в истории.

---

## 🏗️ Архитектура

Подробное описание решений — в [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

```
Клиент (PWA, Vercel)
   │
   ├─ lib/places.ts ──► Edge Function fetch-places ──► Overpass (OSM, бесплатно)
   │                                              └─► Google Places (опция)
   │                       └─► кэш в tables places + place_cache (TTL 7 дней)
   │
   ├─ lib/ai-client.ts ─► Edge Function ai-chat ──► Gemini 1.5 Flash
   │                                        └─► OpenAI gpt-4o-mini (fallback)
   │                                        └─► вежливый fallback (оба упали)
   │
   ├─ lib/image-client.ts ► Edge Function generate-image ► DALL·E 3 + кэш
   │
   └─ Supabase Realtime ──► групповой режим (комнаты)
```

**Ключевые решения:**

1. **Overpass вместо Google как основной источник** — Таллинн плотно покрыт в OSM, а Google требует платного billing. Приложение работает с нулевым бюджетом.
2. **Клиент не ходит во внешние API напрямую** — CORS, лимиты и ключи.
3. **ИИ возвращает JSON `{reply, place_ids, reasoning}`** — под ответом рендерятся настоящие карточки из БД. Модель не может показать несуществующее место: её `place_ids` фильтруются по реально переданному списку.
4. **Лимит 10 запросов/день считается на сервере** — очистка localStorage его не обнуляет.
5. **Кэш одинаковых ИИ-запросов** — гео округляется до ~100 м, ответ живёт 2 часа.

---

## 📂 Структура проекта

```
wfood/
├─ .github/workflows/ci.yml      # lint + typecheck + build на каждый push/PR
├─ docs/ARCHITECTURE.md          # архитектура, trade-offs, потоки данных
├─ public/
│  ├─ icons/                     # иконки PWA (192, 512, maskable)
│  ├─ favicon.svg
│  └─ og-default.png             # OG-картинка для шаринга
├─ src/
│  ├─ components/
│  │  ├─ ui/                     # базовые примитивы (Button, Card, Sheet...)
│  │  ├─ layout/                 # BottomNav, Header, SafeArea, Skeleton
│  │  ├─ map/                    # MapView, PlaceMarker, Cluster
│  │  ├─ place/                  # PlaceCard, PlaceDetails, PlaceList
│  │  ├─ roulette/               # RouletteWheel, RouletteResult
│  │  ├─ ai/                     # ChatWindow, ChatBubble, QuickChips
│  │  ├─ filters/                # FilterBar, FilterSheet
│  │  └─ favorites/              # CollectionCard
│  ├─ pages/                     # Roulette, Nearby, AI, Favorites, Profile,
│  │                             # RoomPage, CollectionPage
│  ├─ lib/                       # supabase, ai-client, image-client, places,
│  │                             # geo, utils, analytics, weather
│  ├─ hooks/                     # useGeolocation, useNearbyPlaces, useRoulette,
│  │                             # useAIChat, useFavorites, useTheme
│  ├─ stores/                    # authStore, filtersStore, placesStore
│  ├─ types/index.ts             # все типы приложения
│  ├─ data/tallinn-seed.ts       # оффлайн-фолбэк
│  └─ styles/globals.css         # Tailwind + CSS-переменные темы
├─ supabase/
│  ├─ migrations/                # 001_init, 002_rls, 003_indexes
│  └─ functions/
│     ├─ _shared/utils.ts        # CORS, клиенты, вызовы LLM, парсинг
│     ├─ ai-chat/index.ts        # Gemini → OpenAI fallback + кэш + лимит
│     ├─ generate-image/index.ts # DALL·E 3 + кэш в generated_images
│     └─ fetch-places/index.ts   # Overpass → Google Places → upsert
├─ .env.example / .env.local.example
├─ vercel.json                   # SPA-роутинг, CSP, кэш-заголовки
├─ vite.config.ts                # PWA-плагин, алиасы, чанки
└─ tailwind.config.ts            # дизайн-система
```

---

## 📜 Скрипты

| Команда | Что делает |
|---|---|
| `npm run dev` | Dev-сервер на http://localhost:5173 |
| `npm run build` | Typecheck + сборка в `dist/` |
| `npm run preview` | Просмотр собранной версии |
| `npm run lint` | ESLint (0 warnings допускается) |
| `npm run lint:fix` | ESLint с автофиксом |
| `npm run typecheck` | Только проверка типов |
| `npm run format` | Prettier |
| `npm run check:sql` | Проверка структуры SQL-миграций (баланс скобок, `$$`-блоков) |
| `npm run icons` | Перегенерация иконок PWA и OG-картинки (нужен Python + Pillow) |
| `npm run supabase:push` | Применить миграции |
| `npm run supabase:secrets` | Загрузить секреты Edge Functions |

---

## 🎨 Дизайн-система

| Токен | Светлая | Тёмная |
|---|---|---|
| Primary (апельсин) | `#FF6B35` | `#FF6B35` |
| Secondary (бежевый) | `#F7C59F` | `#F7C59F` |
| Accent (мятный) | `#2EC4B6` | `#2EC4B6` |
| Background | `#FFF8F0` | `#1A1614` |
| Text | `#1A1614` | `#F5F5F5` |

- **Шрифты:** Inter (UI) + Fraunces (заголовки, «вкусный» serif)
- **Радиусы:** `rounded-2xl` для карточек, `rounded-full` для кнопок
- **Тач-цели:** минимум 44×44 px
- **Safe-area:** поддержка `env(safe-area-inset-*)` для iPhone с вырезом
- **Тема:** переключается классом `dark` на `<html>`, применяется до первой отрисовки (без вспышки)

---

## 🔧 Траблшутинг

<details>
<summary><b>Сборка падает с «Cannot find module '@/...'»</b></summary>

Алиас `@` настроен в `vite.config.ts` **и** в `tsconfig.app.json`. Проверьте, что правки есть в обоих файлах — Vite резолвит пути для сборки, TypeScript для типов.
</details>

<details>
<summary><b>Переменные окружения не подхватываются</b></summary>

1. Имена должны начинаться с `VITE_` — иначе `import.meta.env.VITE_X` вернёт `undefined`
2. После правки `.env.local` **перезапустите** `npm run dev`
3. На Vercel переменные применяются только при новой сборке → **Redeploy** (лучше без Build Cache)
</details>

<details>
<summary><b>ИИ отвечает «оба сервиса не отвечают»</b></summary>

Проверьте секреты и логи:

```bash
supabase secrets list
supabase functions logs ai-chat
```

Частые причины: не задан `GEMINI_API_KEY`, исчерпана бесплатная квота Gemini, неверный ключ OpenAI. Приложение при этом продолжает работать — рулетка доступна.
</details>

<details>
<summary><b>Карта пустая / метки не появляются</b></summary>

1. База не наполнена → вызовите `fetch-places` вручную (см. [раздел Supabase](#5-наполнение-базы-местами))
2. CSP в `vercel.json` блокирует тайлы — проверьте консоль, домен `*.tile.openstreetmap.org` должен быть в `img-src`
3. Overpass временно недоступен → приложение покажет локальный сид
</details>

<details>
<summary><b>Edge Functions: «SUPABASE_URL не задан»</b></summary>

`SUPABASE_URL` и `SUPABASE_ANON_KEY` подставляются платформой автоматически. Если ошибка возникла локально — вы запускаете функцию без `supabase start`. Для локальной разработки бэкенда нужен Docker.
</details>

<details>
<summary><b>PWA не устанавливается / нет офлайн-режима</b></summary>

Service worker работает только в продакшене и только по HTTPS. Проверяйте на собранной версии:

```bash
npm run build && npm run preview
```

`localhost` — исключение, там SW работает без HTTPS.
</details>

<details>
<summary><b>Конфликты переносов строк в git</b></summary>

`.gitattributes` нормализует всё к LF. Если репозиторий уже был склонирован до его добавления:

```bash
git rm --cached -r .
git reset --hard
```
</details>

---

## 📄 Лицензия

MIT — используйте свободно.

## 🤝 Контрибьютинг

1. Форкните репозиторий
2. Ветка от `dev`: `git checkout -b feature/my-feature`
3. Conventional commits
4. PR в `dev` с описанием изменений

---

<div align="center">

**WFOOD** — потому что выбирать, где поесть, должно занимать 10 секунд, а не 40 минут.

Сделано с ❤️ в Таллинне

</div>
