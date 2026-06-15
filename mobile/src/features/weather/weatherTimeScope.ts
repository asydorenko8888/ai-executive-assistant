import type { WeatherTimeScope } from '@/src/features/weather/types';

export const DAY_MS = 86_400_000;

type ScopedDayToken = WeatherTimeScope | 'day_after_tomorrow' | 'day_after_tomorrow_morning' | 'day_after_tomorrow_evening';

export function isDayAfterTomorrowScope(timeScope: ScopedDayToken): boolean {
  return (
    timeScope === 'day_after_tomorrow' ||
    timeScope === 'day_after_tomorrow_morning' ||
    timeScope === 'day_after_tomorrow_evening'
  );
}

export function isSpecificDateScope(timeScope: WeatherTimeScope): boolean {
  return timeScope === 'specific_date';
}

export function isFutureForecastDayScope(timeScope: WeatherTimeScope): boolean {
  return timeScope === 'tomorrow' || isDayAfterTomorrowScope(timeScope) || isSpecificDateScope(timeScope);
}

export function getWeatherDayOffset(timeScope: WeatherTimeScope): number {
  if (isDayAfterTomorrowScope(timeScope)) {
    return 2;
  }

  if (timeScope === 'tomorrow') {
    return 1;
  }

  if (isSpecificDateScope(timeScope)) {
    return -1;
  }

  return 0;
}

export function isEveningTimeScope(timeScope: WeatherTimeScope): boolean {
  return timeScope === 'evening' || timeScope === 'day_after_tomorrow_evening';
}

export function isMorningTimeScope(timeScope: WeatherTimeScope): boolean {
  return timeScope === 'morning' || timeScope === 'day_after_tomorrow_morning';
}

export function resolveWeatherDayLabel(
  timeScope: WeatherTimeScope,
  locale: 'uk' | 'ru' | 'en',
): 'today' | 'tomorrow' | 'day_after_tomorrow' {
  if (isDayAfterTomorrowScope(timeScope)) {
    return 'day_after_tomorrow';
  }

  if (timeScope === 'tomorrow') {
    return 'tomorrow';
  }

  return 'today';
}

export function isMultiDayForecastScope(timeScope: WeatherTimeScope): boolean {
  return timeScope === 'next_5_days' || timeScope === 'next_week';
}

export function formatWeatherDayLabel(timeScope: WeatherTimeScope, locale: 'uk' | 'ru' | 'en'): string {
  const day = resolveWeatherDayLabel(timeScope, locale);

  if (day === 'day_after_tomorrow') {
    if (locale === 'uk') {
      return 'Післязавтра';
    }

    if (locale === 'ru') {
      return 'Послезавтра';
    }

    return 'Day after tomorrow';
  }

  if (day === 'tomorrow') {
    if (locale === 'uk') {
      return 'Завтра';
    }

    if (locale === 'ru') {
      return 'Завтра';
    }

    return 'Tomorrow';
  }

  if (locale === 'uk') {
    return 'Сьогодні';
  }

  if (locale === 'ru') {
    return 'Сегодня';
  }

  return 'Today';
}
