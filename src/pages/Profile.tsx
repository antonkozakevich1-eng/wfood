/**
 * Вкладка «Профиль»: настройки, история выборов, вход, тема, язык.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  ChevronRight,
  LogIn,
  LogOut,
  MapPin,
  Moon,
  Sun,
  Trash2,
  User as UserIcon,
  Utensils,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Sheet } from '@/components/ui/sheet';
import { EmptyState } from '@/components/layout/EmptyState';
import { useAuthStore } from '@/stores/authStore';
import { useHistoryStore } from '@/stores/placesStore';
import { useTheme } from '@/hooks/useTheme';
import { isSupabaseConfigured } from '@/lib/supabase';
import { toast } from '@/hooks/useToast';
import { formatDistance, pluralRu } from '@/lib/utils';
import { useFavorites } from '@/hooks/useFavorites';
import type { Language } from '@/types';

const DIETS = [
  { value: 'none', label: 'Без ограничений', emoji: '🍽️' },
  { value: 'vegetarian', label: 'Вегетарианское', emoji: '🥗' },
  { value: 'vegan', label: 'Веганское', emoji: '🌱' },
  { value: 'halal', label: 'Халяль', emoji: '🕌' },
  { value: 'kosher', label: 'Кошерное', emoji: '✡️' },
  { value: 'gluten_free', label: 'Без глютена', emoji: '🌾' },
  { value: 'lactose_free', label: 'Без лактозы', emoji: '🥛' },
];

const ALLERGIES = [
  { value: 'nuts', label: 'Орехи' },
  { value: 'gluten', label: 'Глютен' },
  { value: 'lactose', label: 'Лактоза' },
  { value: 'seafood', label: 'Морепродукты' },
  { value: 'eggs', label: 'Яйца' },
  { value: 'soy', label: 'Соя' },
];

const BUDGETS = [10, 15, 20, 30, 50, 100];

export default function Profile() {
  const navigate = useNavigate();
  const { theme, isDark, setTheme } = useTheme();

  const profile = useAuthStore((s) => s.profile);
  const userId = useAuthStore((s) => s.userId);
  const email = useAuthStore((s) => s.email);
  const loading = useAuthStore((s) => s.loading);
  const signInWithMagicLink = useAuthStore((s) => s.signInWithMagicLink);
  const signOut = useAuthStore((s) => s.signOut);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const setLanguage = useAuthStore((s) => s.setLanguage);

  const history = useHistoryStore((s) => s.history);
  const clearHistory = useHistoryStore((s) => s.clear);

  const { places: favorites } = useFavorites();

  const [loginOpen, setLoginOpen] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [dietOpen, setDietOpen] = useState(false);
  const [allergyOpen, setAllergyOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);

  useEffect(() => {
    // Блокируем прокрутку фона, пока открыт sheet с логином.
    if (!loginOpen) setEmailInput('');
  }, [loginOpen]);

  const handleSignIn = useCallback(async () => {
    const value = emailInput.trim();
    if (!value) return;

    // Простая валидация: не отправляем на сервер очевидный мусор.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      toast.error('Введите корректный email');
      return;
    }

    setSigningIn(true);
    try {
      await signInWithMagicLink(value);
      toast.success('Проверьте почту — мы отправили ссылку для входа');
      setLoginOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось войти');
    } finally {
      setSigningIn(false);
    }
  }, [emailInput, signInWithMagicLink]);

  const handleSignOut = useCallback(async () => {
    try {
      await signOut();
      toast.success('Вы вышли из аккаунта');
    } catch {
      toast.error('Не удалось выйти');
    }
  }, [signOut]);

  const handleUpdate = useCallback(
    async (patch: Parameters<typeof updateProfile>[0]) => {
      try {
        await updateProfile(patch);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Не удалось сохранить');
      }
    },
    [updateProfile],
  );

  const activeDiet = DIETS.find((d) => d.value === profile?.diet);
  const acceptedCount = history.filter((h) => h.accepted).length;

  return (
    <div className="flex flex-1 flex-col pb-nav">
      <Header title="Профиль" subtitle={email ?? 'Гостевой режим'} />

      <div className="flex flex-1 flex-col gap-5 px-4 py-4">
        {/* Карточка пользователя */}
        <section className="flex items-center gap-3 rounded-2xl bg-card p-4 shadow-soft">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/25 to-secondary/40 text-2xl">
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt=""
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              <UserIcon className="h-6 w-6 text-primary" aria-hidden="true" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{profile?.username ?? 'Гость'}</p>
            <p className="truncate text-xs text-muted-foreground">
              {email ?? 'Войдите, чтобы синхронизировать данные'}
            </p>
          </div>

          {userId ? (
            <Button variant="ghost" size="icon-sm" onClick={handleSignOut} aria-label="Выйти">
              <LogOut className="h-4 w-4" />
            </Button>
          ) : (
            <Button size="sm" onClick={() => setLoginOpen(true)} disabled={!isSupabaseConfigured}>
              <LogIn className="h-4 w-4" aria-hidden="true" />
              Войти
            </Button>
          )}
        </section>

        {/* Статистика */}
        <section className="grid grid-cols-3 gap-2">
          <div className="flex flex-col items-center gap-0.5 rounded-2xl bg-card p-3 shadow-soft">
            <span className="text-xl font-bold">{favorites.length}</span>
            <span className="text-[10px] text-muted-foreground">В избранном</span>
          </div>
          <div className="flex flex-col items-center gap-0.5 rounded-2xl bg-card p-3 shadow-soft">
            <span className="text-xl font-bold">{history.length}</span>
            <span className="text-[10px] text-muted-foreground">Выборов</span>
          </div>
          <div className="flex flex-col items-center gap-0.5 rounded-2xl bg-card p-3 shadow-soft">
            <span className="text-xl font-bold">{acceptedCount}</span>
            <span className="text-[10px] text-muted-foreground">Решено идти</span>
          </div>
        </section>

        {/* Настройки еды */}
        <section className="flex flex-col gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Utensils className="h-4 w-4" aria-hidden="true" />
            Предпочтения в еде
          </h2>

          <button
            type="button"
            onClick={() => setDietOpen(true)}
            className="flex items-center gap-3 rounded-2xl bg-card p-3.5 text-left shadow-soft transition-colors hover:bg-muted/40"
          >
            <span className="text-xl" aria-hidden="true">
              {activeDiet?.emoji ?? '🍽️'}
            </span>
            <span className="flex-1">
              <span className="block text-sm font-medium">Диета</span>
              <span className="text-xs text-muted-foreground">
                {activeDiet?.label ?? 'Не указана'}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => setAllergyOpen(true)}
            className="flex items-center gap-3 rounded-2xl bg-card p-3.5 text-left shadow-soft transition-colors hover:bg-muted/40"
          >
            <span className="text-xl" aria-hidden="true">
              ⚠️
            </span>
            <span className="flex-1">
              <span className="block text-sm font-medium">Аллергии</span>
              <span className="text-xs text-muted-foreground">
                {profile?.allergies && profile.allergies.length > 0
                  ? profile.allergies
                      .map((a) => ALLERGIES.find((x) => x.value === a)?.label ?? a)
                      .join(', ')
                  : 'Не указаны'}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => setBudgetOpen(true)}
            className="flex items-center gap-3 rounded-2xl bg-card p-3.5 text-left shadow-soft transition-colors hover:bg-muted/40"
          >
            <span className="text-xl" aria-hidden="true">
              💰
            </span>
            <span className="flex-1">
              <span className="block text-sm font-medium">Бюджет по умолчанию</span>
              <span className="text-xs text-muted-foreground">
                {profile?.default_budget
                  ? `до ${profile.default_budget} € на человека`
                  : 'Не указан'}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </button>
        </section>

        {/* Внешний вид */}
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Внешний вид</h2>

          <div className="flex items-center justify-between rounded-2xl bg-card p-3.5 shadow-soft">
            <div className="flex items-center gap-3">
              {isDark ? (
                <Moon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              ) : (
                <Sun className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              )}
              <div>
                <p className="text-sm font-medium">Тёмная тема</p>
                <p className="text-xs text-muted-foreground">
                  {theme === 'system' ? 'Как в системе' : isDark ? 'Включена' : 'Выключена'}
                </p>
              </div>
            </div>
            <Switch
              checked={isDark}
              onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
              aria-label="Тёмная тема"
            />
          </div>

          <div className="flex items-center justify-between rounded-2xl bg-card p-3.5 shadow-soft">
            <div>
              <p className="text-sm font-medium">Язык интерфейса</p>
              <p className="text-xs text-muted-foreground">
                {profile?.language === 'en' ? 'English' : 'Русский'}
              </p>
            </div>
            <div className="flex gap-1 rounded-full bg-muted p-0.5">
              {(['ru', 'en'] as Language[]).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setLanguage(lang)}
                  aria-pressed={profile?.language === lang}
                  className={
                    profile?.language === lang
                      ? 'rounded-full bg-card px-3 py-1.5 text-xs font-semibold shadow-sm'
                      : 'rounded-full px-3 py-1.5 text-xs text-muted-foreground transition-colors'
                  }
                >
                  {lang.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-2xl bg-card p-3.5 shadow-soft">
            <div className="flex items-center gap-3">
              <MapPin className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">Город</p>
                <p className="text-xs text-muted-foreground">
                  {profile?.city ?? 'Tallinn'}, {profile?.country ?? 'EE'}
                </p>
              </div>
            </div>
            <Badge variant="muted">Пилот</Badge>
          </div>
        </section>

        {/* История */}
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Bell className="h-4 w-4" aria-hidden="true" />
              История выборов
            </h2>
            {history.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  clearHistory();
                  toast.success('История очищена');
                }}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
                Очистить
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <EmptyState
              emoji="🎰"
              title="История пуста"
              description="Покрутите рулетку — здесь появятся ваши выборы и решения."
              action={{ label: 'К рулетке', onClick: () => navigate('/roulette') }}
              className="py-6"
            />
          ) : (
            <ul className="flex flex-col gap-1.5">
              {history.slice(0, 10).map((entry, index) => (
                <li
                  key={`${entry.place.id}-${entry.at}`}
                  className="flex items-center gap-3 rounded-xl bg-card px-3 py-2.5 shadow-soft"
                >
                  <span className="text-lg" aria-hidden="true">
                    {entry.accepted ? '✅' : '🎲'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{entry.place.name}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(entry.at).toLocaleDateString('ru-RU', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {entry.place.distance_m > 0 &&
                        ` · ${formatDistance(entry.place.distance_m)}`}
                    </span>
                  </span>
                  {index === 0 && <Badge variant="muted">последнее</Badge>}
                </li>
              ))}
            </ul>
          )}

          {history.length > 10 && (
            <p className="text-center text-[11px] text-muted-foreground">
              Показаны последние 10 из {history.length}{' '}
              {pluralRu(history.length, 'записи', 'записей', 'записей')}
            </p>
          )}
        </section>

        {/* О приложении */}
        <section className="flex flex-col gap-2 pb-4">
          <div className="rounded-2xl bg-card p-4 shadow-soft">
            <p className="text-sm font-semibold">WFOOD</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Данные о заведениях: OpenStreetMap (бесплатно и открыто) с возможностью
              обогащения из Google Places. ИИ: Google Gemini с резервом на OpenAI.
            </p>
            <p className="mt-2 text-[10px] text-muted-foreground">
              Версия 1.0.0 · Пилот: Таллинн, Эстония
            </p>
          </div>
        </section>
      </div>

      {/* Вход */}
      <Sheet
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        title="Вход"
        description="Отправим ссылку для входа на почту — пароль не нужен"
      >
        <div className="flex flex-col gap-4 pb-4">
          <Input
            type="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            inputMode="email"
            aria-label="Email для входа"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSignIn();
            }}
          />
          <Button
            onClick={handleSignIn}
            loading={signingIn || loading}
            disabled={!emailInput.trim()}
            size="lg"
            className="w-full"
          >
            Отправить ссылку
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            Войдя, вы сохраните избранное и подборки на всех устройствах.
          </p>
        </div>
      </Sheet>

      {/* Диета */}
      <Sheet open={dietOpen} onClose={() => setDietOpen(false)} title="Диета">
        <div className="flex flex-col gap-1.5 pb-4">
          {DIETS.map((diet) => (
            <button
              key={diet.value}
              type="button"
              onClick={() => {
                void handleUpdate({ diet: diet.value === 'none' ? null : diet.value });
                setDietOpen(false);
              }}
              className={
                profile?.diet === diet.value ||
                (diet.value === 'none' && !profile?.diet)
                  ? 'flex items-center gap-3 rounded-xl bg-primary/10 px-3.5 py-3 text-left'
                  : 'flex items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-colors hover:bg-muted'
              }
            >
              <span className="text-xl" aria-hidden="true">
                {diet.emoji}
              </span>
              <span className="text-sm font-medium">{diet.label}</span>
            </button>
          ))}
        </div>
      </Sheet>

      {/* Аллергии */}
      <Sheet
        open={allergyOpen}
        onClose={() => setAllergyOpen(false)}
        title="Аллергии"
        description="Будем предупреждать о risky местах"
      >
        <div className="flex flex-col gap-3 pb-4">
          <div className="flex flex-wrap gap-2">
            {ALLERGIES.map((allergy) => {
              const isSelected = profile?.allergies?.includes(allergy.value) ?? false;
              return (
                <button
                  key={allergy.value}
                  type="button"
                  onClick={() => {
                    const current = profile?.allergies ?? [];
                    const next = isSelected
                      ? current.filter((a) => a !== allergy.value)
                      : [...current, allergy.value];
                    void handleUpdate({ allergies: next });
                  }}
                  aria-pressed={isSelected}
                  className={
                    isSelected
                      ? 'h-9 rounded-full border border-primary bg-primary px-4 text-xs font-medium text-primary-foreground'
                      : 'h-9 rounded-full border border-border bg-card px-4 text-xs font-medium transition-colors hover:border-primary/40'
                  }
                >
                  {allergy.label}
                </button>
              );
            })}
          </div>
          <Button variant="outline" className="w-full" onClick={() => setAllergyOpen(false)}>
            Готово
          </Button>
        </div>
      </Sheet>

      {/* Бюджет */}
      <Sheet open={budgetOpen} onClose={() => setBudgetOpen(false)} title="Бюджет по умолчанию">
        <div className="grid grid-cols-3 gap-2 pb-4">
          {BUDGETS.map((budget) => (
            <button
              key={budget}
              type="button"
              onClick={() => {
                void handleUpdate({ default_budget: budget });
                setBudgetOpen(false);
              }}
              className={
                profile?.default_budget === budget
                  ? 'h-12 rounded-xl border border-primary bg-primary/10 text-sm font-semibold'
                  : 'h-12 rounded-xl border border-border text-sm font-medium transition-colors hover:border-primary/40'
              }
            >
              {budget} €
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
