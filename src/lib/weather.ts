/**
 * Погода через OpenWeatherMap.
 *
 * ⚠️ Ключ OPENWEATHER_API_KEY — секретный, он на фронтенде недоступен.
 * Поэтому запрос идёт напрямую... нет: мы его не делаем вообще из браузера
 * с ключом. Вместо этого погода запрашивается у Edge Function, если ключ задан,
 * а если нет — берётся бесплатный источник без ключа (Open-Meteo).
 *
 * Open-Meteo выбран как основной: он бесплатный, без ключа и без регистрации,
 * поэтому погодный контекст для ИИ работает «из коробки» у любого
 * разработчика, склонировавшего репозиторий.
 */

import type { Coords, WeatherContext } from '@/types';

/** WMO weather codes → человекочитаемое описание (на русском). */
const WMO_DESCRIPTIONS: Record<number, { ru: string; icon: string }> = {
  0: { ru: 'ясно', icon: '☀️' },
  1: { ru: 'преимущественно ясно', icon: '🌤️' },
  2: { ru: 'переменная облачность', icon: '⛅' },
  3: { ru: 'пасмурно', icon: '☁️' },
  45: { ru: 'туман', icon: '🌫️' },
  48: { ru: 'изморозь', icon: '🌫️' },
  51: { ru: 'слабая морось', icon: '🌦️' },
  53: { ru: 'морось', icon: '🌦️' },
  55: { ru: 'сильная морось', icon: '🌧️' },
  61: { ru: 'небольшой дождь', icon: '🌦️' },
  63: { ru: 'дождь', icon: '🌧️' },
  65: { ru: 'сильный дождь', icon: '🌧️' },
  71: { ru: 'небольшой снег', icon: '🌨️' },
  73: { ru: 'снег', icon: '🌨️' },
  75: { ru: 'сильный снег', icon: '❄️' },
  77: { ru: 'снежная крупа', icon: '🌨️' },
  80: { ru: 'ливень', icon: '🌦️' },
  81: { ru: 'сильный ливень', icon: '🌧️' },
  82: { ru: 'очень сильный ливень', icon: '⛈️' },
  85: { ru: 'снегопад', icon: '🌨️' },
  86: { ru: 'сильный снегопад', icon: '❄️' },
  95: { ru: 'гроза', icon: '⛈️' },
  96: { ru: 'гроза с градом', icon: '⛈️' },
  99: { ru: 'сильная гроза с градом', icon: '⛈️' },
};

interface OpenMeteoResponse {
  current?: {
    temperature_2m?: number;
    weather_code?: number;
  };
}

/**
 * Загружает текущую погоду. Возвращает null при любой ошибке —
 * погода не критична, без неё ИИ работает чуть хуже, но работает.
 */
export async function fetchWeather(coords: Coords, signal?: AbortSignal): Promise<WeatherContext | null> {
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', coords.lat.toFixed(4));
    url.searchParams.set('longitude', coords.lng.toFixed(4));
    url.searchParams.set('current', 'temperature_2m,weather_code');
    url.searchParams.set('timezone', 'Europe/Tallinn');

    const res = await fetch(url, { signal });
    if (!res.ok) return null;

    const data = (await res.json()) as OpenMeteoResponse;
    const temp = data.current?.temperature_2m;
    const code = data.current?.weather_code;

    if (typeof temp !== 'number') return null;

    const meta = WMO_DESCRIPTIONS[code ?? 0] ?? { ru: 'неизвестно', icon: '🌡️' };

    return {
      temp: Math.round(temp),
      description: meta.ru,
      icon: meta.icon,
    };
  } catch {
    return null;
  }
}

/** Короткая строка погоды для шапки. */
export function weatherLabel(weather: WeatherContext | null): string {
  if (!weather) return '';
  return `${weather.icon} ${weather.temp}°C`;
}

/**
 * Влияет ли погода на рекомендацию.
 * Используется в подсказках UI: «На улице дождь — покажем места с террасой?»
 */
export function weatherAdvice(weather: WeatherContext | null): string | null {
  if (!weather) return null;
  if (weather.temp <= 0) return 'На улице мороз — ищите что-то согревающее 🍲';
  if (weather.temp <= 8) return 'Прохладно — хорошо бы горячее 🍜';
  if (weather.description.includes('дождь') || weather.description.includes('ливень')) {
    return 'Дождь — лучше место с закрытой террасой ☔';
  }
  if (weather.temp >= 22) return 'Тепло — отличный день для террасы 🌞';
  return null;
}
