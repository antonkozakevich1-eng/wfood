/**
 * Групповой режим: комната для друзей.
 *
 * Синхронизация через Supabase Realtime: пожелания участников появляются
 * у всех без перезагрузки. Когда все отметились «готов», хост запускает
 * сборку общего решения — оно уходит в Edge Function ai-chat в режиме room.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Copy, LogIn, Sparkles, Users } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { EmptyState } from '@/components/layout/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useNearbyPlaces } from '@/hooks/useNearbyPlaces';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { sendAiMessage, toPlaceContext } from '@/lib/ai-client';
import { fetchPlacesByIds } from '@/lib/places';
import { toast } from '@/hooks/useToast';
import { analytics } from '@/lib/analytics';
import { pluralRu } from '@/lib/utils';
import type { Place, Room, RoomMember, RoomSuggestion } from '@/types';

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  const { effectiveCoords } = useGeolocation();
  const { visible } = useNearbyPlaces(effectiveCoords);

  const userId = useAuthStore((s) => s.userId);
  const profile = useAuthStore((s) => s.profile);

  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [suggestions, setSuggestions] = useState<RoomSuggestion[]>([]);
  const [wish, setWish] = useState('');
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [decisionPlaces, setDecisionPlaces] = useState<Place[]>([]);
  const [decisionText, setDecisionText] = useState('');

  const isMember = useMemo(
    () => members.some((m) => m.user_id === userId),
    [members, userId],
  );
  const isHost = room?.host_id === userId;
  const allReady = members.length > 0 && members.every((m) => m.is_ready);

  /** Защита от двойного вступления при StrictMode. */
  const joiningRef = useRef(false);

  // --- Загрузка комнаты ---
  const loadRoom = useCallback(async () => {
    if (!supabase || !roomId) return;

    try {
      const [roomRes, membersRes, suggestionsRes] = await Promise.all([
        supabase.from('rooms').select('*').eq('id', roomId).maybeSingle(),
        supabase.from('room_members').select('*').eq('room_id', roomId),
        supabase
          .from('room_suggestions')
          .select('*')
          .eq('room_id', roomId)
          .order('created_at', { ascending: true }),
      ]);

      if (roomRes.error) throw roomRes.error;

      setRoom(roomRes.data as Room | null);
      setMembers((membersRes.data ?? []) as RoomMember[]);
      setSuggestions((suggestionsRes.data ?? []) as RoomSuggestion[]);

      // Если решение уже принято — подтягиваем карточку места.
      const decision = (roomRes.data as Room | null)?.decision;
      if (decision?.place_id) {
        const places = await fetchPlacesByIds([decision.place_id]);
        setDecisionPlaces(places);
        setDecisionText(decision.reasoning);
      }
    } catch (err) {
      console.error('[Room] Ошибка загрузки:', err);
      toast.error('Не удалось загрузить комнату');
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    void loadRoom();
  }, [loadRoom]);

  // --- Realtime-подписка ---
  useEffect(() => {
    if (!supabase || !roomId) return;

    // Локальная ссылка: TypeScript не сохраняет сужение типа внутри колбэка.
    const client = supabase;

    // Один канал на все три таблицы: меньше соединений, синхронные обновления.
    const channel = client
      .channel(`room:${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_suggestions', filter: `room_id=eq.${roomId}` },
        () => void loadRoom(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${roomId}` },
        () => void loadRoom(),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        () => void loadRoom(),
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [roomId, loadRoom]);

  /**
   * Автовступление: если пользователь вошёл в комнату по ссылке —
   * он должен стать участником без лишних кнопок.
   */
  useEffect(() => {
    if (!supabase || !roomId || loading || !userId || isMember || joiningRef.current) return;
    if (room?.status !== 'open') return;

    joiningRef.current = true;
    setJoining(true);

    void (async () => {
      try {
        const { error } = await supabase.from('room_members').insert({
          room_id: roomId,
          user_id: userId,
          guest_name: profile?.username ?? null,
        });

        // 23505 = уже участник, это не ошибка.
        if (error && error.code !== '23505') throw error;

        analytics.roomJoined(roomId);
        await loadRoom();
      } catch (err) {
        console.error('[Room] Не удалось вступить:', err);
      } finally {
        joiningRef.current = false;
        setJoining(false);
      }
    })();
  }, [roomId, loading, userId, isMember, room?.status, profile?.username, loadRoom]);

  const handleAddWish = useCallback(async () => {
    const value = wish.trim();
    if (!value || !supabase || !roomId || !userId) return;

    try {
      const { error } = await supabase.from('room_suggestions').insert({
        room_id: roomId,
        user_id: userId,
        wish: value,
      });
      if (error) throw error;

      setWish('');
      // Обновление придёт через Realtime, но локально применим сразу —
      // чтобы не было ощущения «ничего не произошло».
      await loadRoom();
    } catch (err) {
      console.error('[Room] Ошибка добавления пожелания:', err);
      toast.error('Не удалось отправить пожелание');
    }
  }, [wish, roomId, userId, loadRoom]);

  const toggleReady = useCallback(async () => {
    if (!supabase || !roomId || !userId) return;

    const me = members.find((m) => m.user_id === userId);
    if (!me) return;

    try {
      const { error } = await supabase
        .from('room_members')
        .update({ is_ready: !me.is_ready })
        .eq('room_id', roomId)
        .eq('user_id', userId);
      if (error) throw error;
      await loadRoom();
    } catch (err) {
      console.error('[Room] Ошибка переключения готовности:', err);
      toast.error('Не удалось изменить статус');
    }
  }, [roomId, userId, members, loadRoom]);

  /** Собирает общее решение через ИИ. */
  const handleDecide = useCallback(async () => {
    if (!supabase || !roomId || visible.length === 0) {
      toast.error('Нет мест рядом для подбора');
      return;
    }

    setDeciding(true);
    try {
      // Пожелания участников собираем в один текст: Edge Function получает
      // их как часть сообщения и учитывает при поиске компромисса.
      const wishes = suggestions
        .map((s) => s.wish)
        .filter((w): w is string => typeof w === 'string' && w.length > 0);

      const message =
        wishes.length > 0
          ? `Собери общее решение для группы. Пожелания участников:\n${wishes.map((w, i) => `${i + 1}. ${w}`).join('\n')}`
          : 'Собери общее решение для группы — пожеланий не было, предложи универсальные варианты.';

      const response = await sendAiMessage({
        message,
        roomId,
        places: toPlaceContext(visible),
        mode: 'room',
        lat: effectiveCoords.lat,
        lng: effectiveCoords.lng,
      });

      const places = await fetchPlacesByIds(response.place_ids);

      setDecisionText(response.reply);
      setDecisionPlaces(places);

      if (places.length > 0 && places[0]) {
        const winner = places[0];
        const { error } = await supabase
          .from('rooms')
          .update({
            status: 'decided',
            decision: {
              place_id: winner.id,
              place_name: winner.name,
              reasoning: response.reply,
              decided_at: new Date().toISOString(),
            },
          })
          .eq('id', roomId);
        if (error) throw error;

        analytics.roomDecided(roomId, winner.id);
        toast.success(`Решено: ${winner.name} 🎉`);
      } else {
        toast.info('ИИ не нашёл общего варианта — попробуйте расширить фильтры');
      }

      await loadRoom();
    } catch (err) {
      console.error('[Room] Ошибка сборки решения:', err);
      toast.error(err instanceof Error ? err.message : 'Не удалось собрать решение');
    } finally {
      setDeciding(false);
    }
  }, [roomId, visible, suggestions, effectiveCoords, loadRoom]);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success('Ссылка скопирована — отправьте друзьям');
    } catch {
      toast.error('Не удалось скопировать');
    }
  }, []);

  if (loading) {
    return (
      <div className="flex flex-1 flex-col pb-nav">
        <Header title="Комната" />
        <div className="flex flex-col gap-3 p-4">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex flex-1 flex-col pb-nav">
        <Header title="Комната" />
        <EmptyState
          emoji="🚪"
          title="Комната не найдена"
          description="Возможно, ссылка устарела или комната закрылась (они живут 6 часов)."
          action={{ label: 'Создать новую', onClick: () => navigate('/ai') }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col pb-nav">
      <Header
        title={room.title}
        subtitle={`${members.length} ${pluralRu(members.length, 'участник', 'участника', 'участников')}`}
        action={
          <Button variant="ghost" size="icon-sm" onClick={handleCopyLink} aria-label="Скопировать ссылку">
            <Copy className="h-5 w-5" />
          </Button>
        }
      />

      <div className="flex flex-1 flex-col gap-4 px-4 py-4">
        {/* Статус */}
        <section className="flex flex-wrap items-center gap-2">
          <Badge variant={room.status === 'decided' ? 'success' : 'default'}>
            {room.status === 'decided' ? '✅ Решение принято' : '🟢 Идёт сбор пожеланий'}
          </Badge>
          {allReady && room.status === 'open' && <Badge variant="accent">Все готовы</Badge>}
          <Badge variant="muted">
            до {new Date(room.expires_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
          </Badge>
        </section>

        {/* Участники */}
        <section className="flex flex-col gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4" aria-hidden="true" />
            Участники
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {members.map((member) => (
              <span
                key={member.user_id}
                className={
                  member.is_ready
                    ? 'flex items-center gap-1.5 rounded-full bg-emerald-500/12 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400'
                    : 'flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs'
                }
              >
                {member.is_ready && <Check className="h-3 w-3" aria-hidden="true" />}
                {member.user_id === userId ? 'Вы' : (member.guest_name ?? 'Гость')}
                {member.user_id === room.host_id && ' 👑'}
              </span>
            ))}
            {members.length === 0 && (
              <p className="text-xs text-muted-foreground">Пока никого. Отправьте ссылку друзьям.</p>
            )}
          </div>
        </section>

        {/* Решение */}
        <AnimatePresence>
          {room.status === 'decided' && decisionPlaces.length > 0 && decisionPlaces[0] && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-2 rounded-2xl bg-gradient-to-br from-primary/12 to-secondary/20 p-4"
            >
              <h2 className="font-display text-lg font-bold">🎉 Идём в {decisionPlaces[0].name}</h2>
              {decisionText && <p className="text-sm text-muted-foreground">{decisionText}</p>}
              <Button
                className="mt-1 w-full"
                onClick={() => {
                  const place = decisionPlaces[0];
                  if (place) {
                    window.open(
                      `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}&travelmode=walking`,
                      '_blank',
                      'noopener',
                    );
                  }
                }}
              >
                Построить маршрут
              </Button>
            </motion.section>
          )}
        </AnimatePresence>

        {/* Пожелания */}
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Пожелания</h2>

          {suggestions.length === 0 ? (
            <p className="rounded-2xl bg-muted/50 p-3.5 text-xs text-muted-foreground">
              Пока пусто. Напишите, что хочется съесть — например, «хочу суп» или «только не суши».
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {suggestions.map((suggestion) => (
                <li
                  key={suggestion.id}
                  className="flex items-start gap-2 rounded-xl bg-card px-3.5 py-2.5 text-sm shadow-soft"
                >
                  <span aria-hidden="true">💬</span>
                  <span className="flex-1">
                    {suggestion.wish}
                    {suggestion.user_id === userId && (
                      <span className="ml-1.5 text-[10px] text-muted-foreground">(вы)</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {room.status === 'open' && (
            <div className="flex gap-2">
              <Input
                value={wish}
                onChange={(e) => setWish(e.target.value)}
                placeholder="Что хочется?"
                aria-label="Ваше пожелание"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleAddWish();
                }}
              />
              <Button onClick={handleAddWish} disabled={!wish.trim()} aria-label="Добавить пожелание">
                <LogIn className="h-4 w-4" />
              </Button>
            </div>
          )}
        </section>

        {/* Действия */}
        {room.status === 'open' && isMember && (
          <section className="flex flex-col gap-2 pb-4">
            <Button
              variant={members.find((m) => m.user_id === userId)?.is_ready ? 'outline' : 'default'}
              onClick={toggleReady}
              className="w-full"
            >
              {members.find((m) => m.user_id === userId)?.is_ready
                ? 'Отменить готовность'
                : 'Я готов'}
            </Button>

            {isHost && (
              <Button
                variant="accent"
                onClick={handleDecide}
                loading={deciding}
                disabled={visible.length === 0}
                className="w-full"
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                Собрать общее решение
              </Button>
            )}

            {!isHost && (
              <p className="text-center text-xs text-muted-foreground">
                Решение собирает хост комнаты, когда все готовы.
              </p>
            )}
          </section>
        )}

        {joining && (
          <p className="text-center text-xs text-muted-foreground">Подключаем вас к комнате...</p>
        )}
      </div>
    </div>
  );
}
