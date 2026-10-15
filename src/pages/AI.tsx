/**
 * Вкладка «ИИ-помощник».
 *
 * Три режима:
 *   а) свободный чат — просто пишете, что хочется;
 *   б) быстрые чипсы — один тап для частых запросов;
 *   в) групповой режим — создаётся комната, друзья подключаются по ссылке.
 *
 * Контекст (топ-30 мест рядом + погода + время суток) собирается
 * в useAIChat и уходит на сервер вместе с сообщением.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp, Eraser, Sparkles, Users } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { EmptyState, GeolocationBanner, SetupBanner } from '@/components/layout/EmptyState';
import { ChatBubble } from '@/components/ai/ChatBubble';
import { PlaceDetails } from '@/components/place/PlaceDetails';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChatMessageSkeleton } from '@/components/ui/skeleton';
import { Sheet } from '@/components/ui/sheet';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useNearbyPlaces } from '@/hooks/useNearbyPlaces';
import { useAIChat } from '@/hooks/useAIChat';
import { QUICK_CHIPS } from '@/lib/ai-client';
import { usePlacesStore } from '@/stores/placesStore';
import { useAuthStore } from '@/stores/authStore';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { toast } from '@/hooks/useToast';
import { analytics } from '@/lib/analytics';
import { weatherAdvice, weatherLabel } from '@/lib/weather';
import { cn } from '@/lib/utils';
import type { Place } from '@/types';

export default function AI() {
  const navigate = useNavigate();
  const { effectiveCoords, denied, request: requestLocation } = useGeolocation();
  const { visible } = useNearbyPlaces(effectiveCoords);

  const { messages, sending, weather, used, limit, limitReached, send, retry, clear } = useAIChat({
    coords: effectiveCoords,
  });

  const favoriteIds = usePlacesStore((s) => s.favoriteIds);
  const loadFavorites = usePlacesStore((s) => s.loadFavorites);
  const toggleFavorite = usePlacesStore((s) => s.toggleFavorite);
  const userId = useAuthStore((s) => s.userId);

  const [input, setInput] = useState('');
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [roomSheetOpen, setRoomSheetOpen] = useState(false);
  const [creatingRoom, setCreatingRoom] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void loadFavorites();
  }, [loadFavorites]);

  // Подхватываем предзаполненный запрос с других вкладок (рулетка, карточка места).
  useEffect(() => {
    const prefill = sessionStorage.getItem('wfood-ai-prefill');
    if (prefill) {
      sessionStorage.removeItem('wfood-ai-prefill');
      setInput(prefill);
      inputRef.current?.focus();
    }
  }, []);

  // Автоскролл вниз при новом сообщении.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const handleSend = useCallback(
    async (text?: string) => {
      const value = (text ?? input).trim();
      if (!value || sending) return;

      setInput('');
      await send(value);
    },
    [input, sending, send],
  );

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      void handleSend();
    },
    [handleSend],
  );

  /** Enter отправляет, Shift+Enter переносит строку — привычно для чата. */
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  const handleToggleFavorite = useCallback(
    async (place: Place) => {
      const wasFavorite = favoriteIds.has(place.id);
      try {
        await toggleFavorite(place);
        analytics.favoriteToggled(place, !wasFavorite);
        toast.success(wasFavorite ? 'Убрано из избранного' : 'Добавлено в избранное');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Не удалось сохранить');
      }
    },
    [favoriteIds, toggleFavorite],
  );

  const handleOpenPlace = useCallback((place: Place) => {
    setSelectedPlace(place);
    setDetailsOpen(true);
  }, []);

  /** Создание комнаты для группового режима. */
  const handleCreateRoom = useCallback(async () => {
    if (!supabase) {
      toast.error('Supabase не настроен — групповой режим недоступен');
      return;
    }

    setCreatingRoom(true);
    try {
      let currentUserId = userId;

      // Гостя логиним анонимно: иначе комната не к кому привязать.
      if (!currentUserId) {
        const { data, error: authError } = await supabase.auth.signInAnonymously();
        if (authError) {
          // Анонимный вход может быть отключён в настройках проекта Supabase.
          throw new Error(
            'Не удалось войти. Включите Anonymous Sign-in в Supabase → Authentication → Providers',
          );
        }
        currentUserId = data.user?.id ?? null;
      }

      if (!currentUserId) throw new Error('Не удалось определить пользователя');

      const { data, error } = await supabase
        .from('rooms')
        .insert({ host_id: currentUserId, title: 'Где поедим?' })
        .select()
        .single();

      if (error) throw error;

      const room = data as { id: string };

      // Хост сразу становится участником — иначе не увидит собственные пожелания.
      await supabase
        .from('room_members')
        .insert({ room_id: room.id, user_id: currentUserId });

      analytics.roomCreated(room.id);
      toast.success('Комната создана — отправьте ссылку друзьям');
      setRoomSheetOpen(false);
      navigate(`/room/${room.id}`);
    } catch (err) {
      console.error('[AI] Ошибка создания комнаты:', err);
      toast.error(err instanceof Error ? err.message : 'Не удалось создать комнату');
    } finally {
      setCreatingRoom(false);
    }
  }, [userId, navigate]);

  const advice = weatherAdvice(weather);
  const remaining = Math.max(0, limit - used);

  return (
    <div className="flex h-screen-safe flex-col">
      <Header
        title="ИИ-помощник"
        subtitle={weather ? `Сейчас в Таллинне ${weatherLabel(weather)}` : 'Подберёт место под ваш запрос'}
        action={
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setRoomSheetOpen(true)}
              aria-label="Групповой режим"
            >
              <Users className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={clear}
              disabled={messages.length <= 1}
              aria-label="Очистить чат"
            >
              <Eraser className="h-5 w-5" />
            </Button>
          </div>
        }
      />

      {/* Индикатор лимита */}
      <div className="flex items-center justify-between gap-2 border-b border-border/50 px-4 py-2">
        <Badge variant={limitReached ? 'warning' : 'muted'}>
          {limitReached
            ? 'Лимит на сегодня исчерпан'
            : `Осталось ${remaining} ${remaining === 1 ? 'запрос' : 'запросов'} из ${limit}`}
        </Badge>

        {advice && <span className="truncate text-[11px] text-muted-foreground">{advice}</span>}
      </div>

      {!isSupabaseConfigured && (
        <div className="px-4 pt-3">
          <SetupBanner />
        </div>
      )}

      {denied && (
        <div className="px-4 pt-3">
          <GeolocationBanner onRetry={requestLocation} />
        </div>
      )}

      {/* Лента сообщений */}
      <div
        ref={scrollRef}
        className="flex flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-4 scroll-smooth-ios"
        role="log"
        aria-live="polite"
        aria-label="История чата"
      >
        {visible.length === 0 && messages.length <= 1 && !sending && (
          <EmptyState
            emoji="🤖"
            title="Пока не вижу мест рядом"
            description="Разрешите геолокацию или откройте вкладку «Рядом», чтобы я знал, что вокруг вас."
            action={{ label: 'Ко вкладке «Рядом»', onClick: () => navigate('/nearby') }}
          />
        )}

        {messages.map((message) => (
          <ChatBubble
            key={message.id}
            message={message}
            favoriteIds={favoriteIds}
            onOpenPlace={handleOpenPlace}
            onToggleFavorite={handleToggleFavorite}
            onRetry={retry}
          />
        ))}

        {sending && <ChatMessageSkeleton />}
      </div>

      {/* Быстрые чипсы */}
      {messages.length <= 1 && !sending && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-2">
          {QUICK_CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => void handleSend(chip.prompt)}
              disabled={limitReached}
              className={cn(
                'flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-xs font-medium transition-colors',
                'hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50',
              )}
            >
              <span aria-hidden="true">{chip.emoji}</span>
              {chip.label}
            </button>
          ))}
        </div>
      )}

      {/* Поле ввода */}
      <form
        onSubmit={handleSubmit}
        className="pb-composer safe-bottom border-t border-border/50 bg-background p-3"
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={limitReached ? 'Лимит исчерпан — попробуйте рулетку' : 'Что хочется поесть?'}
            disabled={limitReached}
            aria-label="Сообщение ИИ-помощнику"
            className={cn(
              'max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-border bg-card px-4 py-3 text-base',
              'placeholder:text-muted-foreground/70',
              'focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
            style={{ height: 'auto' }}
            onInput={(e) => {
              // Автовысота textarea: растёт до max-h, дальше скроллится.
              const target = e.currentTarget;
              target.style.height = 'auto';
              target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
            }}
          />

          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || sending || limitReached}
            aria-label="Отправить сообщение"
            className="shrink-0"
          >
            <ArrowUp className="h-5 w-5" />
          </Button>
        </div>

        <p className="mt-1.5 px-1 text-[10px] text-muted-foreground">
          Gemini + OpenAI. Места берутся из реальной выдачи рядом с вами.
        </p>
      </form>

      {/* Групповой режим */}
      <Sheet
        open={roomSheetOpen}
        onClose={() => setRoomSheetOpen(false)}
        title="Групповой режим"
        description="Пусть каждый напишет, что хочет — ИИ найдёт компромисс"
      >
        <div className="flex flex-col gap-4 pb-4">
          <div className="flex flex-col gap-2 rounded-2xl bg-muted/50 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4" aria-hidden="true" />
              Как это работает
            </h3>
            <ol className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              <li>1. Вы создаёте комнату и получаете ссылку</li>
              <li>2. Друзья открывают ссылку и пишут свои пожелания</li>
              <li>3. Когда все готовы — ИИ предлагает общее решение</li>
              <li>4. Комната живёт 6 часов, потом закрывается сама</li>
            </ol>
          </div>

          <Button onClick={handleCreateRoom} loading={creatingRoom} size="lg" className="w-full">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Создать комнату
          </Button>

          <p className="text-center text-[11px] text-muted-foreground">
            Гостевой вход выполнится автоматически, если вы не авторизованы.
          </p>
        </div>
      </Sheet>

      <PlaceDetails
        place={selectedPlace}
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        isFavorite={selectedPlace ? favoriteIds.has(selectedPlace.id) : false}
        onToggleFavorite={handleToggleFavorite}
      />

      {/* Анимация «печатает» внизу экрана */}
      <AnimatePresence>
        {sending && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="pointer-events-none fixed bottom-24 left-1/2 -translate-x-1/2"
          >
            <span className="flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-card">
              <Sparkles className="h-3 w-3 animate-pulse text-primary" aria-hidden="true" />
              ИИ подбирает варианты...
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
