// ============================================================================
// WFOOD — Edge Function ai-chat
// Единая точка входа для ИИ-помощника.
//
// Логика:
//   1. Проверяем суточный лимит (10 запросов/день для авторизованных).
//   2. Проверяем кэш одинаковых запросов (не тратит лимит).
//   3. Пробуем Gemini (gemini-1.5-flash).
//   4. Если упал/нет ключа/лимит → OpenAI (gpt-4o-mini).
//   5. Если оба упали → вежливый fallback без ИИ (клиент покажет рулетку).
//
// Ключи GEMINI_API_KEY и OPENAI_API_KEY живут только здесь (Supabase Secrets)
// и никогда не покидают сервер.
// ============================================================================

import {
  adminClient,
  buildUserPrompt,
  callGemini,
  callOpenAI,
  corsHeaders,
  errorResponse,
  getUserId,
  jsonResponse,
  parseLlmAnswer,
  sha256,
  SYSTEM_PROMPT,
  timeOfDay,
  type LlmAnswer,
  type LlmPlaceContext,
} from '../_shared/utils.ts';

interface AiChatRequest {
  message: string;
  roomId?: string | null;
  places?: LlmPlaceContext[];
  weather?: { temp: number; description: string } | null;
  mode?: 'chat' | 'room';
  lat?: number;
  lng?: number;
}

const DAILY_LIMIT = 10;
/** Кэш живёт 2 часа: за это время контекст (погода, часы работы) не сильно меняется. */
const CACHE_TTL_MINUTES = 120;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }
  if (req.method !== 'POST') {
    return errorResponse('Разрешён только POST', 405, req);
  }

  const startedAt = Date.now();

  try {
    const body = (await req.json()) as AiChatRequest;
    const message = (body.message ?? '').trim();

    if (!message) {
      return errorResponse('Пустой запрос', 400, req);
    }
    if (message.length > 1000) {
      return errorResponse('Слишком длинное сообщение (максимум 1000 символов)', 400, req);
    }

    const supabase = adminClient();
    const userId = await getUserId(req);
    const mode: 'chat' | 'room' = body.mode === 'room' ? 'room' : 'chat';

    // -----------------------------------------------------------------------
    // 1. Суточный лимит
    // Считаем на сервере: очистка localStorage лимит не обнуляет.
    // Анонимные пользователи получают урезанный лимит (3) — иначе ИИ
    // превращается в бесплатный прокси для всех желающих.
    // -----------------------------------------------------------------------
    const limit = userId ? DAILY_LIMIT : 3;

    if (userId) {
      const { count, error: countError } = await supabase
        .from('ai_chats')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('from_cache', false)
        .gte('created_at', new Date(new Date().setUTCHours(0, 0, 0, 0)).toISOString());

      if (!countError && (count ?? 0) >= limit) {
        return errorResponse(
          'Лимит бесплатных запросов на сегодня исчерпан. Попробуйте рулетку или вернитесь завтра.',
          429,
          req,
          { limitReached: true, limit },
        );
      }
    }

    // -----------------------------------------------------------------------
    // 2. Контекст: места, погода, время суток
    // -----------------------------------------------------------------------
    const places = (body.places ?? []).slice(0, 30);
    const validIds = new Set(places.map((p) => p.id));

    let roomWishes: string[] = [];
    if (mode === 'room' && body.roomId) {
      const { data: suggestions } = await supabase
        .from('room_suggestions')
        .select('wish')
        .eq('room_id', body.roomId)
        .not('wish', 'is', null)
        .limit(30);
      roomWishes = (suggestions ?? [])
        .map((s) => (s as { wish: string | null }).wish)
        .filter((w): w is string => typeof w === 'string' && w.length > 0);
    }

    const userPrompt = buildUserPrompt({
      message,
      places,
      weather: body.weather ?? null,
      timeOfDay: timeOfDay(),
      mode,
      roomWishes,
    });

    // -----------------------------------------------------------------------
    // 3. Кэш одинаковых запросов
    // Гео округляем до ~100 м: пользователь, отошедший на 50 метров,
    // не должен платить за новый вызов LLM.
    // -----------------------------------------------------------------------
    const geoKey = body.lat && body.lng
      ? `${body.lat.toFixed(3)},${body.lng.toFixed(3)}`
      : 'no-geo';
    const requestHash = await sha256(
      `${mode}|${message.toLowerCase()}|${geoKey}|${places.map((p) => p.id).join(',')}`,
    );

    const cacheCutoff = new Date(Date.now() - CACHE_TTL_MINUTES * 60_000).toISOString();
    const { data: cached } = await supabase
      .from('ai_chats')
      .select('id, response, reasoning, place_ids, provider')
      .eq('request_hash', requestHash)
      .eq('from_cache', false)
      .gte('created_at', cacheCutoff)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cached?.response) {
      // Перепроверяем id по актуальному списку: место могло пропасть из выдачи.
      const cachedIds = ((cached.place_ids ?? []) as string[]).filter((id) => validIds.has(id));

      await supabase.from('ai_chats').insert({
        user_id: userId,
        room_id: body.roomId ?? null,
        message,
        response: cached.response,
        reasoning: cached.reasoning,
        request_hash: requestHash,
        place_ids: cachedIds,
        context_places: places,
        provider: 'cache',
        from_cache: true,
        tokens_used: 0,
        latency_ms: Date.now() - startedAt,
      });

      return jsonResponse(
        {
          reply: cached.response,
          place_ids: cachedIds,
          reasoning: cached.reasoning ?? '',
          provider: 'cache',
          fromCache: true,
          usageToday: 0,
        },
        200,
        req,
      );
    }

    // -----------------------------------------------------------------------
    // 4. Gemini → OpenAI fallback
    // -----------------------------------------------------------------------
    let answer: LlmAnswer | null = null;
    let provider: 'gemini' | 'openai' | 'fallback' = 'gemini';
    let tokensUsed = 0;
    const errors: string[] = [];

    try {
      const gemini = await callGemini(userPrompt, SYSTEM_PROMPT);
      answer = parseLlmAnswer(gemini.text, validIds);
      tokensUsed = gemini.tokens;
      provider = 'gemini';
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`gemini: ${msg}`);
      console.error('[ai-chat] Gemini недоступен, переключаюсь на OpenAI:', msg);
    }

    if (!answer) {
      try {
        const openai = await callOpenAI(userPrompt, SYSTEM_PROMPT);
        answer = parseLlmAnswer(openai.text, validIds);
        tokensUsed = openai.tokens;
        provider = 'openai';
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`openai: ${msg}`);
        console.error('[ai-chat] OpenAI тоже недоступен:', msg);
      }
    }

    // -----------------------------------------------------------------------
    // 5. Оба провайдера упали — отдаём вежливый fallback.
    // Приложение продолжает работать: клиент покажет результаты рулетки.
    // -----------------------------------------------------------------------
    if (!answer) {
      const fallback: LlmAnswer = {
        reply:
          'ИИ-помощник сейчас недоступен — оба сервиса не отвечают. ' +
          'Но выбор всё равно есть: крутите рулетку, она работает офлайн.',
        place_ids: [],
        reasoning: 'Провайдеры ИИ недоступны.',
      };

      await supabase.from('ai_chats').insert({
        user_id: userId,
        room_id: body.roomId ?? null,
        message,
        response: fallback.reply,
        reasoning: fallback.reasoning,
        request_hash: requestHash,
        place_ids: [],
        context_places: places,
        provider: 'fallback',
        tokens_used: 0,
        latency_ms: Date.now() - startedAt,
      });

      return jsonResponse(
        {
          reply: fallback.reply,
          place_ids: [],
          reasoning: fallback.reasoning,
          provider: 'fallback',
          fromCache: false,
          usageToday: 0,
          degraded: true,
        },
        200,
        req,
      );
    }

    // -----------------------------------------------------------------------
    // 6. Сохраняем результат (он же — счётчик лимита)
    // -----------------------------------------------------------------------
    const latency = Date.now() - startedAt;

    const { data: inserted } = await supabase
      .from('ai_chats')
      .insert({
        user_id: userId,
        room_id: body.roomId ?? null,
        message,
        response: answer.reply,
        reasoning: answer.reasoning,
        request_hash: requestHash,
        place_ids: answer.place_ids,
        context_places: places,
        provider,
        tokens_used: tokensUsed,
        latency_ms: latency,
      })
      .select('id')
      .maybeSingle();

    // В групповом режиме сразу пишем решения участников как предложения:
    // так остальные видят их через Realtime без дополнительных запросов.
    if (mode === 'room' && body.roomId && userId && answer.place_ids.length > 0) {
      await supabase.from('room_suggestions').insert(
        answer.place_ids.map((placeId) => ({
          room_id: body.roomId,
          user_id: userId,
          place_id: placeId,
          wish: `ИИ предложил: ${answer!.reply.slice(0, 120)}`,
        })),
      );
    }

    // Использовано запросов за сегодня (для индикатора в UI).
    let usageToday = 0;
    if (userId) {
      const { count } = await supabase
        .from('ai_chats')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('from_cache', false)
        .gte('created_at', new Date(new Date().setUTCHours(0, 0, 0, 0)).toISOString());
      usageToday = count ?? 0;
    }

    return jsonResponse(
      {
        chatId: inserted?.id ?? null,
        reply: answer.reply,
        place_ids: answer.place_ids,
        reasoning: answer.reasoning,
        provider,
        fromCache: false,
        usageToday,
        limit,
        latencyMs: latency,
        // Ошибки отдаём только в dev-режиме, чтобы не светить внутренности.
        ...(Deno.env.get('ENVIRONMENT') === 'development' ? { debugErrors: errors } : {}),
      },
      200,
      req,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[ai-chat] Необработанная ошибка:', msg);
    return errorResponse('Внутренняя ошибка ИИ-помощника', 500, req);
  }
});
