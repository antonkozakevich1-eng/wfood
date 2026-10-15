// ============================================================================
// WFOOD — общие утилиты для Edge Functions
// Здесь живёт всё, что раньше дублировалось бы в каждой функции:
// CORS, клиенты Supabase, разбор JSON-ответа модели и вызовы LLM.
// ============================================================================

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';

// ---------------------------------------------------------------------------
// CORS
// Разрешаем только запросы с фронтенда WFOOD (и localhost для разработки).
// ---------------------------------------------------------------------------
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
];

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  // Vercel-домены проекта (*.vercel.app) пускаем все — превью-деплои имеют
  // динамические адреса, а секретов в этих функциях нет: они сами ходят в LLM.
  const isAllowed =
    ALLOWED_ORIGINS.includes(origin) ||
    /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin) ||
    /^https:\/\/wfood[a-z0-9-]*\.vercel\.app$/.test(origin);

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0]!,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function jsonResponse(
  body: unknown,
  status: number,
  req: Request,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export function errorResponse(
  message: string,
  status: number,
  req: Request,
  extra?: Record<string, unknown>,
): Response {
  return jsonResponse({ error: message, ...extra }, status, req);
}

// ---------------------------------------------------------------------------
// Клиенты Supabase
// ---------------------------------------------------------------------------

/** Клиент с service_role — обходит RLS. Только внутри Edge Functions. */
export function adminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY не заданы в secrets');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Определяет пользователя по JWT из заголовка Authorization.
 * Возвращает null для анонимных вызовов — это не ошибка:
 * ИИ доступен и гостям (с более строгим лимитом на стороне функции).
 */
export async function getUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice('Bearer '.length);
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anonKey) return null;

  try {
    const client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data, error } = await client.auth.getUser(token);
    if (error) return null;
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Типы
// ---------------------------------------------------------------------------

export interface LlmPlaceContext {
  id: string;
  name: string;
  cuisine: string[];
  price_level: number | null;
  rating: number | null;
  distance_m: number;
  is_open_now: boolean;
  address: string | null;
}

export interface LlmAnswer {
  reply: string;
  place_ids: string[];
  reasoning: string;
}

export interface LlmResult {
  answer: LlmAnswer;
  provider: 'gemini' | 'openai';
  tokensUsed: number;
  latencyMs: number;
}

// ---------------------------------------------------------------------------
// Системный промпт
// Требование ТЗ + усиление: явный запрет выдумывать id и требование
// выбирать только из переданного списка.
// ---------------------------------------------------------------------------
export const SYSTEM_PROMPT = `Ты — дружелюбный помощник WFOOD. Помогаешь выбрать место поесть. Отвечай кратко (до 100 слов), предлагай 2-3 варианта из списка, учитывай расстояние, кухню, цену, рейтинг, часы работы. Если ничего не подходит — честно скажи и предложи расширить фильтры. Не выдумывай места, которых нет в списке. Формат ответа: JSON { reply: string, place_ids: string[], reasoning: string }.

ЖЁСТКИЕ ПРАВИЛА:
1. place_ids — ТОЛЬКО идентификаторы из переданного списка мест. Никогда не придумывай id.
2. Если ни одно место не подходит — верни place_ids: [] и честно объясни почему в reply.
3. reply — на языке пользователя (русский или английский), живой, без канцелярита, максимум 100 слов.
4. reasoning — одна короткая фраза, почему именно эти варианты (для показа в свёрнутом виде).
5. Отвечай ТОЛЬКО валидным JSON, без markdown-обёрток и пояснений вокруг.`;

/**
 * Собирает пользовательский промпт с контекстом.
 * Время суток и погода влияют на выбор («сейчас утро» → кафе с завтраками).
 */
export function buildUserPrompt(params: {
  message: string;
  places: LlmPlaceContext[];
  weather?: { temp: number; description: string } | null;
  timeOfDay: string;
  mode: 'chat' | 'room';
  roomWishes?: string[];
}): string {
  const { message, places, weather, timeOfDay, mode, roomWishes } = params;

  const placesBlock = places
    .map(
      (p) =>
        `- id=${p.id} | ${p.name} | кухня: ${p.cuisine.join(', ') || 'не указана'} | ` +
        `цена: ${p.price_level ? '$'.repeat(p.price_level) : 'н/д'} | ` +
        `рейтинг: ${p.rating ?? 'нет'} | ${Math.round(p.distance_m)} м | ` +
        `${p.is_open_now ? 'открыто' : 'закрыто'} | ${p.address ?? ''}`,
    )
    .join('\n');

  const weatherLine = weather
    ? `Погода сейчас: ${weather.temp}°C, ${weather.description}.`
    : 'Погода: нет данных.';

  if (mode === 'room') {
    const wishes = (roomWishes ?? []).map((w, i) => `${i + 1}. ${w}`).join('\n') || 'нет пожеланий';
    return `Ситуация: группа людей вместе выбирает место поесть.
Пожелания участников:
${wishes}

Время суток: ${timeOfDay}. ${weatherLine}

Доступные места:
${placesBlock}

Найди компромисс: предложи 2-3 места, которые устроят большинство. Учти противоречия между пожеланиями и объясни, как ты их примирил.`;
  }

  return `Запрос пользователя: ${message}

Время суток: ${timeOfDay}. ${weatherLine}

Доступные места:
${placesBlock}

Подбери 2-3 подходящих варианта из этого списка.`;
}

// ---------------------------------------------------------------------------
// Разбор ответа модели
// Модели любят обернуть JSON в ```json ... ``` даже при явном запрете,
// поэтому снимаем обёртку и, если не помогло, вытаскиваем первый {...}.
// ---------------------------------------------------------------------------
export function parseLlmAnswer(raw: string, validIds: Set<string>): LlmAnswer {
  let text = raw.trim();

  // Снимаем markdown-обёртку.
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch?.[1]) text = fenceMatch[1].trim();

  // Берём самый внешний JSON-объект.
  if (!text.startsWith('{')) {
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first !== -1 && last > first) text = text.slice(first, last + 1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Модель вернула не JSON — отдаём её текст как есть, но без мест:
    // лучше показать ответ без карточек, чем упасть с ошибкой.
    return {
      reply: raw.trim().slice(0, 600) || 'Не удалось разобрать ответ ИИ.',
      place_ids: [],
      reasoning: 'Ответ модели не в формате JSON.',
    };
  }

  const obj = (parsed ?? {}) as Record<string, unknown>;
  const reply = typeof obj['reply'] === 'string' ? obj['reply'] : '';
  const reasoning = typeof obj['reasoning'] === 'string' ? obj['reasoning'] : '';
  const rawIds = Array.isArray(obj['place_ids']) ? obj['place_ids'] : [];

  // КРИТИЧНО: фильтруем id по реально переданному списку.
  // Это последний рубеж защиты от галлюцинаций — даже если модель выдумает
  // UUID, он не дойдёт до БД и не отрисуется как карточка.
  const placeIds = rawIds
    .filter((id): id is string => typeof id === 'string')
    .filter((id) => validIds.has(id))
    .slice(0, 3);

  return {
    reply: reply || 'Не удалось подобрать вариант.',
    place_ids: placeIds,
    reasoning,
  };
}

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------
export async function callGemini(
  userPrompt: string,
  systemPrompt: string,
): Promise<{ text: string; tokens: number }> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) throw new Error('GEMINI_API_KEY не задан');

  const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-1.5-flash';
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // Таймаут обязателен: без него зависший Gemini держит пользователя
  // до таймаута платформы, и fallback на OpenAI не срабатывает вовремя.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 800,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini ${res.status}: ${errText.slice(0, 300)}`);
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { totalTokenCount?: number };
    };

    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (!text) throw new Error('Gemini вернул пустой ответ');

    return { text, tokens: data.usageMetadata?.totalTokenCount ?? 0 };
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// OpenAI (fallback чата)
// ---------------------------------------------------------------------------
export async function callOpenAI(
  userPrompt: string,
  systemPrompt: string,
): Promise<{ text: string; tokens: number }> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) throw new Error('OPENAI_API_KEY не задан');

  const model = Deno.env.get('OPENAI_MODEL') ?? 'gpt-4o-mini';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.7,
        max_tokens: 800,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI ${res.status}: ${errText.slice(0, 300)}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number };
    };

    const text = data.choices?.[0]?.message?.content ?? '';
    if (!text) throw new Error('OpenAI вернул пустой ответ');

    return { text, tokens: data.usage?.total_tokens ?? 0 };
  } finally {
    clearTimeout(timeout);
  }
}

/** Определяет время суток для контекста ИИ. */
export function timeOfDay(): string {
  const hour = new Date().getUTCHours() + 2; // Таллинн: UTC+2/+3
  const h = hour % 24;
  if (h < 5) return 'ночь';
  if (h < 11) return 'утро';
  if (h < 16) return 'день';
  if (h < 22) return 'вечер';
  return 'поздний вечер';
}

/** Стабильный хеш строки (для кэша запросов). */
export async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
