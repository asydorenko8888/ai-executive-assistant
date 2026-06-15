import type { WeatherSnapshot, WeatherTimeScope } from '@/src/features/weather/types';
import { aggregateHourlyDay } from '@/src/features/weather/weatherAnalysis';
import { filterPointsForDay, getDeviceTimeZone, localDateKey } from '@/src/features/weather/weatherRainForecast';
import { DAY_MS } from '@/src/features/weather/weatherTimeScope';

const MONTH_LABELS: Record<'uk' | 'ru' | 'en', string[]> = {
  ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
  uk: ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

export type FiveDayForecastDay = {
  dayKey: string;
  label: string;
  lowC: number;
  highC: number;
  condition: string;
  pop: number;
};

function formatTemp(tempC: number) {
  const sign = tempC > 0 ? '+' : '';
  return `${sign}${tempC}°C`;
}

function formatLocationLabel(snapshot: WeatherSnapshot) {
  const { city, region } = snapshot.location;
  return region ? `${city}, ${region}` : city;
}

function formatDayOffsetLabel(dayOffset: number, dayKey: string, locale: 'uk' | 'ru' | 'en') {
  if (dayOffset === 0) {
    if (locale === 'uk') {
      return 'Сьогодні';
    }

    if (locale === 'ru') {
      return 'Сегодня';
    }

    return 'Today';
  }

  if (dayOffset === 1) {
    if (locale === 'uk') {
      return 'Завтра';
    }

    if (locale === 'ru') {
      return 'Завтра';
    }

    return 'Tomorrow';
  }

  if (dayOffset === 2) {
    if (locale === 'uk') {
      return 'Післязавтра';
    }

    if (locale === 'ru') {
      return 'Послезавтра';
    }

    return 'Day after tomorrow';
  }

  const [, monthText, dayText] = dayKey.split('-');
  const month = Number(monthText);
  const day = Number(dayText);
  const monthLabel = MONTH_LABELS[locale][month - 1] ?? monthText;

  if (locale === 'en') {
    return `${monthLabel} ${day}`;
  }

  return `${day} ${monthLabel}`;
}

function formatDayRange(lowC: number, highC: number, locale: 'uk' | 'ru' | 'en') {
  if (locale === 'uk') {
    return `від ${formatTemp(lowC)} до ${formatTemp(highC)}`;
  }

  if (locale === 'ru') {
    return `от ${formatTemp(lowC)} до ${formatTemp(highC)}`;
  }

  return `from ${formatTemp(lowC)} to ${formatTemp(highC)}`;
}

export function collectFiveDayForecastDays(params: {
  snapshot: WeatherSnapshot;
  referenceNow: Date;
  locale: 'uk' | 'ru' | 'en';
  timeZone?: string;
}): FiveDayForecastDay[] {
  const timeZone = params.timeZone ?? getDeviceTimeZone();
  const referenceNowMs = params.referenceNow.getTime();
  const days: FiveDayForecastDay[] = [];

  for (let offset = 0; offset < 5; offset += 1) {
    const dayKey = localDateKey(referenceNowMs + offset * DAY_MS, timeZone);
    const dayPoints = filterPointsForDay(params.snapshot.hourly, timeZone, dayKey);
    const aggregate = aggregateHourlyDay(params.snapshot, dayKey, timeZone);

    if (!dayPoints.length || !aggregate) {
      continue;
    }

    let lowC = aggregate.lowC;
    let highC = aggregate.highC;

    if (offset === 0) {
      lowC = Math.min(lowC, params.snapshot.today.lowC);
      highC = Math.max(highC, params.snapshot.today.highC);
    } else if (offset === 1 && params.snapshot.tomorrow) {
      lowC = Math.min(lowC, params.snapshot.tomorrow.lowC);
      highC = Math.max(highC, params.snapshot.tomorrow.highC);
    }

    days.push({
      dayKey,
      label: formatDayOffsetLabel(offset, dayKey, params.locale),
      lowC,
      highC,
      condition: aggregate.condition,
      pop: Math.max(...dayPoints.map((point) => point.pop)),
    });
  }

  return days;
}

function buildFiveDayForecastHeader(locale: 'uk' | 'ru' | 'en', location: string) {
  if (locale === 'uk') {
    return `Прогноз на найближчі 5 днів у ${location}:`;
  }

  if (locale === 'ru') {
    return `Прогноз на ближайшие 5 дней в ${location}:`;
  }

  return `5-day forecast for ${location}:`;
}

function buildNextWeekPreamble(locale: 'uk' | 'ru' | 'en') {
  if (locale === 'uk') {
    return 'У мене є прогноз лише на найближчі 5 днів. Ось він:';
  }

  if (locale === 'ru') {
    return 'У меня есть прогноз только на ближайшие 5 дней. Вот он:';
  }

  return 'I only have a forecast for the next 5 days. Here it is:';
}

function buildForecastDayLine(day: FiveDayForecastDay, locale: 'uk' | 'ru' | 'en') {
  return `${day.label}: ${day.condition.toLowerCase()}, ${formatDayRange(day.lowC, day.highC, locale)}`;
}

export function buildFiveDayForecastReply(params: {
  snapshot: WeatherSnapshot;
  locale: 'uk' | 'ru' | 'en';
  referenceNow: Date;
  timeScope: Extract<WeatherTimeScope, 'next_5_days' | 'next_week'>;
}) {
  const location = formatLocationLabel(params.snapshot);
  const days = collectFiveDayForecastDays({
    snapshot: params.snapshot,
    referenceNow: params.referenceNow,
    locale: params.locale,
  });

  if (!days.length) {
    if (params.locale === 'uk') {
      return 'Зараз немає даних для 5-денного прогнозу.';
    }

    if (params.locale === 'ru') {
      return 'Сейчас нет данных для 5-дневного прогноза.';
    }

    return 'There is no 5-day forecast data right now.';
  }

  const lines = days.map((day) => buildForecastDayLine(day, params.locale));
  const body = [buildFiveDayForecastHeader(params.locale, location), ...lines].join('\n');

  if (params.timeScope === 'next_week') {
    return `${buildNextWeekPreamble(params.locale)}\n${body}`;
  }

  return body;
}
