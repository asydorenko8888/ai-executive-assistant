import type { WeatherSnapshot } from '@/src/features/weather/types';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguageLocale';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguageLocale';

export type WeatherFetchParams = {
  latitude: number;
  longitude: number;
  languageCode: VoiceLanguageCode;
  referenceNow?: Date;
};

export type WeatherCityFetchParams = {
  city: string;
  languageCode: VoiceLanguageCode;
  referenceNow?: Date;
};

function mapLanguageCode(languageCode: VoiceLanguageCode): 'en' | 'ru' | 'uk' {
  const locale = getChatLocaleFromVoiceLanguage(languageCode);

  if (locale === 'uk') {
    return 'uk';
  }

  if (locale === 'ru') {
    return 'ru';
  }

  return 'en';
}

export type WeatherFetcher = (params: {
  path: string;
  query: Record<string, string>;
}) => Promise<WeatherSnapshot | null>;

let weatherFetcherOverride: WeatherFetcher | null = null;
const DEFAULT_WEATHER_TIMEZONE = 'America/Chicago';

export function setWeatherFetcherForTests(fetcher: WeatherFetcher | null) {
  weatherFetcherOverride = fetcher;
}

export function isWeatherFetcherOverridden() {
  return weatherFetcherOverride !== null;
}

async function resolveWeatherTimeZone() {
  if (weatherFetcherOverride) {
    return DEFAULT_WEATHER_TIMEZONE;
  }

  const { env } = await import('@/src/shared/config');
  return env.calendarTimezone;
}

async function requestWeather(query: Record<string, string>) {
  console.log('[weather_fetch]', { endpointParams: query });

  if (weatherFetcherOverride) {
    return weatherFetcherOverride({ path: '/weather', query });
  }

  try {
    const { apiClient } = await import('@/src/shared/api');
    const { env } = await import('@/src/shared/config');

    return await apiClient.get<WeatherSnapshot>({
      path: '/weather',
      query,
    });
  } catch (error) {
    console.log('[weather] fetch failed', error instanceof Error ? error.message : error);
    return null;
  }
}

export async function fetchWeatherSnapshot(params: WeatherFetchParams): Promise<WeatherSnapshot | null> {
  const referenceNow = params.referenceNow ?? new Date();
  const timeZone = await resolveWeatherTimeZone();

  return requestWeather({
    lat: String(params.latitude),
    lon: String(params.longitude),
    lang: mapLanguageCode(params.languageCode),
    timeZone,
    referenceNowMs: String(referenceNow.getTime()),
  });
}

export async function fetchWeatherByCity(params: WeatherCityFetchParams): Promise<WeatherSnapshot | null> {
  const referenceNow = params.referenceNow ?? new Date();
  const timeZone = await resolveWeatherTimeZone();

  return requestWeather({
    city: params.city,
    lang: mapLanguageCode(params.languageCode),
    timeZone,
    referenceNowMs: String(referenceNow.getTime()),
  });
}
