// ============================================================================
// WFOOD — Edge Function generate-image
// Генерация картинок через OpenAI Images API (DALL·E 3) с кэшем.
//
// Использование:
//   - обложки подборок, если у места нет фото
//   - иллюстрации пустых состояний
//   - OG-картинки для шаринга подборок
//   - аватары-заглушки
//
// Кэш обязателен: DALL·E 3 стоит ~$0.04 за картинку. Один и тот же промпт
// не должен генерироваться дважды — проверяем generated_images по prompt_hash.
// ============================================================================

import {
  adminClient,
  corsHeaders,
  errorResponse,
  jsonResponse,
  sha256,
} from '../_shared/utils.ts';

interface GenerateImageRequest {
  prompt: string;
  size?: '1024x1024' | '1792x1024' | '1024x1792';
  quality?: 'standard' | 'hd';
  style?: 'vivid' | 'natural';
  /** Ключ для дедупликации по смыслу, а не по точному тексту промпта. */
  cacheKey?: string;
}

/** Допустимые значения — валидируем, чтобы не отправить в API мусор. */
const ALLOWED_SIZES = ['1024x1024', '1792x1024', '1024x1792'] as const;
const ALLOWED_QUALITIES = ['standard', 'hd'] as const;
const ALLOWED_STYLES = ['vivid', 'natural'] as const;

/**
 * Общий стиль картинок WFOOD.
 * Без него DALL·E выдаёт разнобой: то фотореализм, то мультик —
 * и приложение выглядит собранным из разных источников.
 */
const STYLE_SUFFIX =
  ', warm appetizing food photography style, soft natural light, shallow depth of field, ' +
  'cozy restaurant atmosphere, orange and cream color palette, no text, no watermarks, no people faces';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }
  if (req.method !== 'POST') {
    return errorResponse('Разрешён только POST', 405, req);
  }

  try {
    const body = (await req.json()) as GenerateImageRequest;
    const prompt = (body.prompt ?? '').trim();

    if (!prompt) {
      return errorResponse('Пустой prompt', 400, req);
    }
    if (prompt.length > 900) {
      // Лимит DALL·E 3 — 4000 символов, но длинные промпты дороже и хуже слушаются.
      return errorResponse('Слишком длинный prompt (максимум 900 символов)', 400, req);
    }

    const size = ALLOWED_SIZES.includes(body.size as (typeof ALLOWED_SIZES)[number])
      ? (body.size as (typeof ALLOWED_SIZES)[number])
      : '1024x1024';
    const quality = ALLOWED_QUALITIES.includes(body.quality as (typeof ALLOWED_QUALITIES)[number])
      ? (body.quality as (typeof ALLOWED_QUALITIES)[number])
      : 'standard';
    const style = ALLOWED_STYLES.includes(body.style as (typeof ALLOWED_STYLES)[number])
      ? (body.style as (typeof ALLOWED_STYLES)[number])
      : 'vivid';

    const supabase = adminClient();

    // -----------------------------------------------------------------------
    // 1. Кэш
    // -----------------------------------------------------------------------
    const fullPrompt = `${prompt}${STYLE_SUFFIX}`;
    const promptHash = await sha256(
      `${body.cacheKey ?? prompt}|${size}|${quality}|${style}`,
    );

    const { data: cached } = await supabase
      .from('generated_images')
      .select('url, prompt, size, quality, style')
      .eq('prompt_hash', promptHash)
      .maybeSingle();

    if (cached?.url) {
      return jsonResponse(
        {
          url: cached.url,
          cached: true,
          size: cached.size,
          quality: cached.quality,
          style: cached.style,
          provider: 'cache',
        },
        200,
        req,
      );
    }

    // -----------------------------------------------------------------------
    // 2. Проверка ключа
    // Если ключа нет — это НЕ ошибка 500: клиент покажет CSS-плейсхолдер.
    // -----------------------------------------------------------------------
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      return jsonResponse(
        {
          url: null,
          cached: false,
          provider: 'none',
          reason: 'OPENAI_API_KEY не задан — используется плейсхолдер',
        },
        200,
        req,
      );
    }

    // -----------------------------------------------------------------------
    // 3. Генерация
    // -----------------------------------------------------------------------
    const controller = new AbortController();
    // DALL·E 3 иногда отвечает 30+ секунд; даём 60 и уходим в плейсхолдер.
    const timeout = setTimeout(() => controller.abort(), 60_000);

    let imageUrl: string | null = null;
    let revisedPrompt = '';

    try {
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt: fullPrompt,
          n: 1,
          size,
          quality,
          style,
          response_format: 'url',
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[generate-image] OpenAI ${res.status}: ${errText.slice(0, 300)}`);
        return jsonResponse(
          {
            url: null,
            cached: false,
            provider: 'none',
            reason: `OpenAI вернул ${res.status} — используется плейсхолдер`,
          },
          200,
          req,
        );
      }

      const data = (await res.json()) as {
        data?: Array<{ url?: string; revised_prompt?: string }>;
      };

      imageUrl = data.data?.[0]?.url ?? null;
      revisedPrompt = data.data?.[0]?.revised_prompt ?? '';
    } finally {
      clearTimeout(timeout);
    }

    if (!imageUrl) {
      return jsonResponse(
        { url: null, cached: false, provider: 'none', reason: 'Пустой ответ OpenAI' },
        200,
        req,
      );
    }

    // -----------------------------------------------------------------------
    // 4. Скачиваем и кладём в Supabase Storage
    // Ссылки OpenAI живут ~1 час. Если сохранить только URL, кэш протухнет,
    // и мы заплатим за генерацию повторно. Поэтому качаем файл к себе.
    // -----------------------------------------------------------------------
    let publicUrl = imageUrl;
    let storagePath: string | null = null;

    try {
      const imgRes = await fetch(imageUrl);
      if (imgRes.ok) {
        const blob = await imgRes.blob();
        storagePath = `generated/${promptHash}.png`;

        const { error: uploadError } = await supabase.storage
          .from('wfood-images')
          .upload(storagePath, blob, { contentType: 'image/png', upsert: true });

        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('wfood-images').getPublicUrl(storagePath);
          publicUrl = urlData.publicUrl;
        } else {
          console.error('[generate-image] Ошибка загрузки в Storage:', uploadError.message);
          storagePath = null;
        }
      }
    } catch (err) {
      // Не критично: отдадим исходный URL OpenAI, он проживёт час.
      console.error(
        '[generate-image] Не удалось сохранить в Storage:',
        err instanceof Error ? err.message : String(err),
      );
    }

    // -----------------------------------------------------------------------
    // 5. Кэшируем
    // -----------------------------------------------------------------------
    await supabase.from('generated_images').upsert(
      {
        prompt_hash: promptHash,
        prompt,
        url: publicUrl,
        provider: 'openai',
        model: 'dall-e-3',
        size,
        quality,
        style,
        storage_path: storagePath,
      },
      { onConflict: 'prompt_hash' },
    );

    return jsonResponse(
      {
        url: publicUrl,
        cached: false,
        provider: 'openai',
        size,
        quality,
        style,
        revisedPrompt,
      },
      200,
      req,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[generate-image] Необработанная ошибка:', msg);
    return errorResponse('Не удалось сгенерировать изображение', 500, req);
  }
});
