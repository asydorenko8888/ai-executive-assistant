import type { WeatherHourlyPoint } from '@/src/features/weather/types';
import { isDayAfterTomorrowScope, isFutureForecastDayScope } from '@/src/features/weather/weatherTimeScope';
import type { WeatherTimeScope } from '@/src/features/weather/types';

export function getDeviceTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function isRainyHourlyPoint(point: WeatherHourlyPoint) {
  return point.pop >= 50 || point.rainMm > 0;
}

export const FORECAST_SLOT_MS = 3 * 60 * 60 * 1000;
const MAX_GAP_BETWEEN_RAIN_SLOTS_MS = FORECAST_SLOT_MS + 60 * 1000;

export type RainPeriod = {
  startMs: number;
  endMs: number;
  slots: WeatherHourlyPoint[];
};

export function localDateKey(timeMs: number, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(timeMs));
}

export function formatHourLabel(timeMs: number, locale: 'uk' | 'ru' | 'en', timeZone: string) {
  const formatter = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : locale === 'uk' ? 'uk-UA' : 'ru-RU', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  return formatter.format(new Date(timeMs));
}

function slotEndMs(point: WeatherHourlyPoint) {
  return point.timeMs + FORECAST_SLOT_MS;
}

export function filterPointsForDay(points: WeatherHourlyPoint[], timeZone: string, dayKey: string) {
  return [...points]
    .filter((point) => localDateKey(point.timeMs, timeZone) === dayKey)
    .sort((left, right) => left.timeMs - right.timeMs);
}

export function filterUpcomingHourlyPoints(
  points: WeatherHourlyPoint[],
  referenceNowMs: number,
  timeZone: string,
  dayKey?: string,
) {
  return points.filter((point) => {
    if (point.timeMs <= referenceNowMs) {
      return false;
    }

    if (dayKey && localDateKey(point.timeMs, timeZone) !== dayKey) {
      return false;
    }

    return true;
  });
}

export function groupRainPeriods(points: WeatherHourlyPoint[]): RainPeriod[] {
  const sorted = [...points].sort((left, right) => left.timeMs - right.timeMs);
  const periods: RainPeriod[] = [];
  let current: RainPeriod | null = null;

  for (const point of sorted) {
    if (!isRainyHourlyPoint(point)) {
      current = null;
      continue;
    }

    const previousSlot = current?.slots[current.slots.length - 1];

    if (!current || !previousSlot || point.timeMs - previousSlot.timeMs > MAX_GAP_BETWEEN_RAIN_SLOTS_MS) {
      current = {
        startMs: point.timeMs,
        endMs: slotEndMs(point),
        slots: [point],
      };
      periods.push(current);
      continue;
    }

    current.slots.push(point);
    current.endMs = slotEndMs(point);
  }

  return periods;
}

export function selectRelevantRainPeriod(periods: RainPeriod[], referenceNowMs: number) {
  return periods.find((period) => period.endMs > referenceNowMs) ?? null;
}

function hasRainAfterPeriodOnDay(
  period: RainPeriod,
  dayPoints: WeatherHourlyPoint[],
) {
  return dayPoints.some(
    (point) => point.timeMs >= period.endMs && isRainyHourlyPoint(point),
  );
}

function isMorningRainUntilPeriod(
  period: RainPeriod,
  dayPoints: WeatherHourlyPoint[],
  timeZone: string,
) {
  const dryBeforePeriod = dayPoints.some(
    (point) => point.timeMs < period.startMs && !isRainyHourlyPoint(point),
  );

  if (dryBeforePeriod) {
    return false;
  }

  const endHour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      hour12: false,
    }).format(new Date(period.endMs)),
  );

  return endHour <= 12;
}

function formatMorningHint(timeMs: number, locale: 'uk' | 'ru' | 'en', timeZone: string) {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      hour12: false,
    }).format(new Date(timeMs)),
  );

  if (hour > 11) {
    return '';
  }

  if (locale === 'uk') {
    return ' ранку';
  }

  if (locale === 'ru') {
    return ' утра';
  }

  return ' in the morning';
}

export type RainDescriptionStyle = 'sentence' | 'clause';

export function describeRainPeriod(params: {
  period: RainPeriod | null;
  locale: 'uk' | 'ru' | 'en';
  timeZone: string;
  referenceNowMs: number;
  dayPoints: WeatherHourlyPoint[];
  scope: RainTimingScope;
  style?: RainDescriptionStyle;
  targetLabel?: string;
}): string {
  const style = params.style ?? 'sentence';
  const { period, locale, timeZone, referenceNowMs, dayPoints, scope, targetLabel } = params;

  if (!period) {
    if (locale === 'uk') {
      return style === 'clause' ? 'дощу не очікується' : 'Дощу не очікується.';
    }

    if (locale === 'ru') {
      return style === 'clause' ? 'дождя не ожидается' : 'Дождя не ожидается.';
    }

    return style === 'clause' ? 'no rain is expected' : 'No rain is expected.';
  }

  const startLabel = formatHourLabel(period.startMs, locale, timeZone);
  const endLabel = formatHourLabel(period.endMs, locale, timeZone);
  const dryAfter = !hasRainAfterPeriodOnDay(period, dayPoints);
  const morningRainUntil = isMorningRainUntilPeriod(period, dayPoints, timeZone);
  const upcomingStart = period.startMs > referenceNowMs;
  const morningHint = morningRainUntil ? formatMorningHint(period.endMs, locale, timeZone) : '';
  const tomorrowPrefix =
    scope === 'tomorrow'
      ? locale === 'uk'
        ? 'Завтра '
        : locale === 'ru'
          ? 'Завтра '
          : 'Tomorrow '
      : isDayAfterTomorrowScope(scope)
        ? locale === 'uk'
          ? 'Післязавтра '
          : locale === 'ru'
            ? 'Послезавтра '
            : 'Day after tomorrow '
        : scope === 'specific_date' && targetLabel
          ? locale === 'en'
            ? `On ${targetLabel} `
            : `${targetLabel.charAt(0).toUpperCase()}${targetLabel.slice(1)} `
          : '';

  if (morningRainUntil && dryAfter) {
    if (locale === 'uk') {
      const text =
        style === 'clause'
          ? `опади можливі до ${endLabel}${morningHint}, після цього без дощу`
          : `${tomorrowPrefix}опади можливі до ${endLabel}${morningHint}, після цього без дощу.`;
      return text;
    }

    if (locale === 'ru') {
      const text =
        style === 'clause'
          ? `осадки возможны до ${endLabel}${morningHint}, после этого без дождя`
          : `${tomorrowPrefix}осадки возможны до ${endLabel}${morningHint}, после этого без дождя.`;
      return text;
    }

    return style === 'clause'
      ? `precipitation is possible until ${endLabel}${morningHint}, then dry`
      : `${tomorrowPrefix}precipitation is possible until ${endLabel}${morningHint}, then dry.`;
  }

  if (upcomingStart && dryAfter && period.slots.length === 1) {
    if (locale === 'uk') {
      return style === 'clause'
        ? `дощ можливий після ${startLabel}`
        : `${tomorrowPrefix}дощ можливий після ${startLabel}.`;
    }

    if (locale === 'ru') {
      return style === 'clause'
        ? `дождь возможен после ${startLabel}`
        : `${tomorrowPrefix}дождь возможен после ${startLabel}.`;
    }

    return style === 'clause'
      ? `rain is possible after ${startLabel}`
      : `${tomorrowPrefix}rain is possible after ${startLabel}.`;
  }

  if (upcomingStart && dryAfter && period.slots.length > 1) {
    if (locale === 'uk') {
      return style === 'clause'
        ? `дощ можливий приблизно з ${startLabel} до ${endLabel}`
        : `${tomorrowPrefix}дощ очікується приблизно з ${startLabel} до ${endLabel}.`;
    }

    if (locale === 'ru') {
      return style === 'clause'
        ? `дождь возможен примерно с ${startLabel} до ${endLabel}`
        : `${tomorrowPrefix}дождь ожидается примерно с ${startLabel} до ${endLabel}.`;
    }

    return style === 'clause'
      ? `rain is possible roughly from ${startLabel} to ${endLabel}`
      : `${tomorrowPrefix}rain is expected roughly from ${startLabel} to ${endLabel}.`;
  }

  if (upcomingStart) {
    if (locale === 'uk') {
      return style === 'clause'
        ? `дощ можливий з ${startLabel}`
        : `${tomorrowPrefix}дощ можливий з ${startLabel}.`;
    }

    if (locale === 'ru') {
      return style === 'clause'
        ? `дождь возможен с ${startLabel}`
        : `${tomorrowPrefix}дождь возможен с ${startLabel}.`;
    }

    return style === 'clause'
      ? `rain is possible from ${startLabel}`
      : `${tomorrowPrefix}rain is possible from ${startLabel}.`;
  }

  if (locale === 'uk') {
    return style === 'clause'
      ? `дощ можливий до ${endLabel}`
      : `${tomorrowPrefix}дощ можливий до ${endLabel}.`;
  }

  if (locale === 'ru') {
    return style === 'clause'
      ? `дождь возможен до ${endLabel}`
      : `${tomorrowPrefix}дождь возможен до ${endLabel}.`;
  }

  return style === 'clause'
    ? `rain is possible until ${endLabel}`
    : `${tomorrowPrefix}rain is possible until ${endLabel}.`;
}

export type RainTimingScope =
  | 'today'
  | 'tomorrow'
  | 'day_after_tomorrow'
  | 'day_after_tomorrow_morning'
  | 'day_after_tomorrow_evening'
  | 'specific_date'
  | 'morning'
  | 'evening'
  | 'unspecified';

export function analyzeScopedRain(params: {
  points: WeatherHourlyPoint[];
  referenceNowMs: number;
  timeZone: string;
  dayKey: string;
  scope: RainTimingScope;
  timeScope?: WeatherTimeScope;
  targetLabel?: string;
}) {
  const dayPoints = filterPointsForDay(params.points, params.timeZone, params.dayKey);
  const effectiveTimeScope = params.timeScope ?? params.scope;
  const periodScopedPoints =
    effectiveTimeScope === 'day_after_tomorrow_evening' || effectiveTimeScope === 'evening'
      ? dayPoints.filter((point) => {
          const hour = Number(
            new Intl.DateTimeFormat('en-US', {
              timeZone: params.timeZone,
              hour: 'numeric',
              hour12: false,
            }).format(new Date(point.timeMs)),
          );

          return hour >= 17;
        })
      : effectiveTimeScope === 'day_after_tomorrow_morning' || effectiveTimeScope === 'morning'
        ? dayPoints.filter((point) => {
            const hour = Number(
              new Intl.DateTimeFormat('en-US', {
                timeZone: params.timeZone,
                hour: 'numeric',
                hour12: false,
              }).format(new Date(point.timeMs)),
            );

            return hour >= 5 && hour <= 11;
          })
        : dayPoints;
  const scopedPoints = isFutureForecastDayScope(effectiveTimeScope)
    ? periodScopedPoints
    : periodScopedPoints.filter((point) => point.timeMs > params.referenceNowMs);
  const periods = groupRainPeriods(scopedPoints);
  const period = selectRelevantRainPeriod(periods, params.referenceNowMs);

  return {
    dayPoints,
    scopedPoints,
    periods,
    period,
  };
}

function resolveScopeAndDayKey(
  scope: RainTimingScope,
  referenceNowMs: number,
  timeZone: string,
) {
  if (scope === 'tomorrow') {
    return {
      scope,
      dayKey: localDateKey(referenceNowMs + 86_400_000, timeZone),
    };
  }

  if (isDayAfterTomorrowScope(scope)) {
    return {
      scope,
      dayKey: localDateKey(referenceNowMs + 2 * 86_400_000, timeZone),
    };
  }

  return {
    scope: scope === 'unspecified' ? 'today' : scope,
    dayKey: localDateKey(referenceNowMs, timeZone),
  };
}

export function buildRainTimingText(params: {
  points: WeatherHourlyPoint[];
  referenceNowMs: number;
  locale: 'uk' | 'ru' | 'en';
  timeZone?: string;
  scope?: RainTimingScope;
  style?: RainDescriptionStyle;
  logContext?: string;
}): string {
  const timeZone = params.timeZone ?? getDeviceTimeZone();
  const scopeInfo = resolveScopeAndDayKey(params.scope ?? 'today', params.referenceNowMs, timeZone);
  const analysis = analyzeScopedRain({
    points: params.points,
    referenceNowMs: params.referenceNowMs,
    timeZone,
    dayKey: scopeInfo.dayKey,
    scope: scopeInfo.scope,
  });

  const answer = describeRainPeriod({
    period: analysis.period,
    locale: params.locale,
    timeZone,
    referenceNowMs: params.referenceNowMs,
    dayPoints: analysis.dayPoints,
    scope: scopeInfo.scope,
    style: params.style,
  });

  if (params.logContext) {
    logWeatherRainDebug({
      localTime: formatHourLabel(params.referenceNowMs, params.locale, timeZone),
      timeZone,
      requestedDay: scopeInfo.scope,
      forecastSlots: analysis.scopedPoints.map((point) => ({
        time: formatHourLabel(point.timeMs, params.locale, timeZone),
        pop: point.pop,
        rainMm: point.rainMm,
        rainy: isRainyHourlyPoint(point),
      })),
      rainPeriod: analysis.period,
      rainStart: analysis.period ? formatHourLabel(analysis.period.startMs, params.locale, timeZone) : null,
      rainEnd: analysis.period ? formatHourLabel(analysis.period.endMs, params.locale, timeZone) : null,
      finalAnswer: answer,
    });
  }

  return answer;
}

/** @deprecated use buildRainTimingText */
export function buildUpcomingRainTimingReply(params: {
  points: WeatherHourlyPoint[];
  referenceNowMs: number;
  locale: 'uk' | 'ru' | 'en';
  timeZone?: string;
  dayKey?: string;
  scope?: RainTimingScope;
}) {
  return buildRainTimingText({
    points: params.points,
    referenceNowMs: params.referenceNowMs,
    locale: params.locale,
    timeZone: params.timeZone,
    scope: params.scope ?? (params.dayKey ? 'today' : 'today'),
    style: 'sentence',
    logContext: 'buildUpcomingRainTimingReply',
  });
}

/** @deprecated use buildRainTimingText */
export function buildPracticalRainTimingClause(params: {
  points: WeatherHourlyPoint[];
  referenceNowMs: number;
  locale: 'uk' | 'ru' | 'en';
  timeZone?: string;
  dayKey?: string;
  scope?: RainTimingScope;
}) {
  return buildRainTimingText({
    points: params.points,
    referenceNowMs: params.referenceNowMs,
    locale: params.locale,
    timeZone: params.timeZone,
    scope: params.scope,
    style: 'clause',
    logContext: 'buildPracticalRainTimingClause',
  });
}

/** @deprecated use analyzeScopedRain().period */
export function findUpcomingRainWindow(points: WeatherHourlyPoint[], referenceNowMs: number) {
  const period = selectRelevantRainPeriod(groupRainPeriods(points), referenceNowMs);

  if (!period) {
    return null;
  }

  return {
    startMs: period.startMs,
    endMs: period.endMs,
    slotCount: period.slots.length,
  };
}

export function hasUpcomingRainInScope(params: {
  points: WeatherHourlyPoint[];
  referenceNowMs: number;
  timeZone: string;
  dayKey: string;
  scope: RainTimingScope;
}) {
  return analyzeScopedRain(params).period !== null;
}

function logWeatherRainDebug(details: {
  localTime: string;
  timeZone: string;
  requestedDay: RainTimingScope;
  forecastSlots: Array<{
    time: string;
    pop: number;
    rainMm: number;
    rainy: boolean;
  }>;
  rainPeriod: RainPeriod | null;
  rainStart: string | null;
  rainEnd: string | null;
  finalAnswer: string;
}) {
  console.log('[weather][rain]', details);
}
