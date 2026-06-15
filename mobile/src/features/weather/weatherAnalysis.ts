import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguageLocale';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguageLocale';
import type { WeatherHourlyPoint, WeatherIntent, WeatherSnapshot } from '@/src/features/weather/types';
import {
  analyzeScopedRain,
  describeRainPeriod,
  filterPointsForDay,
  filterUpcomingHourlyPoints,
  formatHourLabel,
  getDeviceTimeZone,
  localDateKey,
  type RainPeriod,
  type RainTimingScope,
} from '@/src/features/weather/weatherRainForecast';
import {
  DAY_MS,
  getWeatherDayOffset,
  isDayAfterTomorrowScope,
  isEveningTimeScope,
  isFutureForecastDayScope,
  isMorningTimeScope,
  isSpecificDateScope,
} from '@/src/features/weather/weatherTimeScope';

export type WeatherAnalysisScope = RainTimingScope;

export type WeatherAnalysis = {
  scope: WeatherAnalysisScope;
  location: string;
  tempMin: number;
  tempMax: number;
  currentTemp: number;
  windKph: number;
  windy: boolean;
  needsJacket: boolean;
  rainExpected: boolean;
  rainPeriods: RainPeriod[];
  relevantRainPeriod: RainPeriod | null;
  rainSummaryClause: string;
  rainSummarySentence: string;
  umbrellaNeeded: boolean;
  targetDayKey?: string;
  targetLabel?: string;
};

function formatLocationLabel(snapshot: WeatherSnapshot) {
  const { city, region } = snapshot.location;
  return region ? `${city}, ${region}` : city;
}

export function normalizeWeatherScope(timeScope: WeatherIntent['timeScope']): RainTimingScope {
  if (timeScope === 'unspecified' || timeScope === 'now') {
    return 'today';
  }

  return timeScope;
}

function resolveScopeDayKey(
  scope: RainTimingScope,
  referenceNowMs: number,
  timeZone: string,
  targetDayKey?: string,
) {
  if (scope === 'specific_date' && targetDayKey) {
    return targetDayKey;
  }

  if (scope === 'tomorrow') {
    return localDateKey(referenceNowMs + DAY_MS, timeZone);
  }

  if (
    scope === 'day_after_tomorrow' ||
    scope === 'day_after_tomorrow_morning' ||
    scope === 'day_after_tomorrow_evening'
  ) {
    return localDateKey(referenceNowMs + 2 * DAY_MS, timeZone);
  }

  return localDateKey(referenceNowMs, timeZone);
}

function resolveDayKeyForTimeScope(
  timeScope: WeatherIntent['timeScope'],
  referenceNowMs: number,
  timeZone: string,
  targetDayKey?: string,
) {
  if (isSpecificDateScope(timeScope) && targetDayKey) {
    return targetDayKey;
  }

  const offset = getWeatherDayOffset(timeScope);

  if (offset < 0) {
    return localDateKey(referenceNowMs, timeZone);
  }

  return localDateKey(referenceNowMs + offset * DAY_MS, timeZone);
}

function readHourInTimeZone(timeMs: number, timeZone: string) {
  return Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      hour12: false,
    }).format(new Date(timeMs)),
  );
}

function filterPointsByDayPart(
  points: WeatherHourlyPoint[],
  timeScope: WeatherIntent['timeScope'],
  timeZone: string,
) {
  if (isEveningTimeScope(timeScope)) {
    return points.filter((point) => readHourInTimeZone(point.timeMs, timeZone) >= 17);
  }

  if (isMorningTimeScope(timeScope)) {
    return points.filter((point) => {
      const hour = readHourInTimeZone(point.timeMs, timeZone);
      return hour >= 5 && hour <= 11;
    });
  }

  return points;
}

function aggregateHourlyDay(
  snapshot: WeatherSnapshot,
  dayKey: string,
  timeZone: string,
) {
  const dayPoints = filterPointsForDay(snapshot.hourly, timeZone, dayKey);

  if (!dayPoints.length) {
    return null;
  }

  const morningPoints = dayPoints.filter((point) => {
    const hour = readHourInTimeZone(point.timeMs, timeZone);
    return hour >= 5 && hour <= 11;
  });

  return {
    highC: Math.round(Math.max(...dayPoints.map((point) => point.tempC))),
    lowC: Math.round(Math.min(...dayPoints.map((point) => point.tempC))),
    morningLowC: morningPoints.length
      ? Math.round(Math.min(...morningPoints.map((point) => point.tempC)))
      : undefined,
    condition: dayPoints[0]?.condition ?? snapshot.current.condition,
  };
}

function resolveScopedHourlyPoints(
  snapshot: WeatherSnapshot,
  timeScope: WeatherIntent['timeScope'],
  referenceNowMs: number,
  timeZone: string,
  targetDayKey?: string,
) {
  const dayKey = resolveDayKeyForTimeScope(timeScope, referenceNowMs, timeZone, targetDayKey);

  if (isEveningTimeScope(timeScope) || isMorningTimeScope(timeScope)) {
    const dayPoints = filterPointsForDay(snapshot.hourly, timeZone, dayKey);
    const periodPoints = filterPointsByDayPart(dayPoints, timeScope, timeZone);

    if (isFutureForecastDayScope(timeScope)) {
      return periodPoints;
    }

    return periodPoints.filter((point) => point.timeMs > referenceNowMs);
  }

  if (timeScope === 'tomorrow' || isDayAfterTomorrowScope(timeScope) || isSpecificDateScope(timeScope)) {
    return filterPointsForDay(snapshot.hourly, timeZone, dayKey);
  }

  return filterUpcomingHourlyPoints(
    snapshot.hourly,
    referenceNowMs,
    timeZone,
    resolveScopeDayKey('today', referenceNowMs, timeZone),
  );
}

function resolveTemperatures(
  snapshot: WeatherSnapshot,
  timeScope: WeatherIntent['timeScope'],
  referenceNowMs: number,
  timeZone: string,
  targetDayKey?: string,
) {
  if (isEveningTimeScope(timeScope)) {
    const eveningPoints = resolveScopedHourlyPoints(snapshot, timeScope, referenceNowMs, timeZone, targetDayKey);
    const dayKey = resolveDayKeyForTimeScope(timeScope, referenceNowMs, timeZone, targetDayKey);
    const daySummary = aggregateHourlyDay(snapshot, dayKey, timeZone);
    const eveningTemp = eveningPoints.length
      ? Math.round(Math.min(...eveningPoints.map((point) => point.tempC)))
      : (daySummary?.lowC ?? snapshot.today.lowC);

    return {
      tempMin: eveningTemp,
      tempMax: eveningTemp,
      needsJacket: eveningTemp <= 14,
    };
  }

  if (isSpecificDateScope(timeScope) || isDayAfterTomorrowScope(timeScope)) {
    const dayKey = resolveDayKeyForTimeScope(timeScope, referenceNowMs, timeZone, targetDayKey);
    const daySummary = aggregateHourlyDay(snapshot, dayKey, timeZone);

    if (timeScope === 'day_after_tomorrow_morning') {
      const morningPoints = resolveScopedHourlyPoints(snapshot, timeScope, referenceNowMs, timeZone, targetDayKey);
      const tempMin = morningPoints.length
        ? Math.round(Math.min(...morningPoints.map((point) => point.tempC)))
        : (daySummary?.morningLowC ?? daySummary?.lowC ?? snapshot.today.lowC);
      const tempMax = daySummary?.highC ?? tempMin;

      return {
        tempMin,
        tempMax,
        needsJacket: tempMin <= 16,
      };
    }

    const tempMin = daySummary?.morningLowC ?? daySummary?.lowC ?? snapshot.today.lowC;
    const tempMax = daySummary?.highC ?? snapshot.today.highC;

    return {
      tempMin,
      tempMax,
      needsJacket: tempMin <= 16,
    };
  }

  if (timeScope === 'tomorrow') {
    const tempMin = snapshot.tomorrow?.morningLowC ?? snapshot.tomorrow?.lowC ?? snapshot.today.lowC;
    const tempMax = snapshot.tomorrow?.highC ?? snapshot.today.highC;

    return {
      tempMin,
      tempMax,
      needsJacket: tempMin <= 16,
    };
  }

  const tempMin = snapshot.today.lowC;
  const tempMax = snapshot.today.highC;

  return {
    tempMin,
    tempMax,
    needsJacket: tempMin <= 16,
  };
}

export function buildWeatherAnalysis(params: {
  snapshot: WeatherSnapshot;
  languageCode: VoiceLanguageCode;
  timeScope: WeatherIntent['timeScope'];
  referenceNow: Date;
  targetDayKey?: string;
  targetLabel?: string;
}): WeatherAnalysis {
  const locale = getChatLocaleFromVoiceLanguage(params.languageCode);
  const timeZone = getDeviceTimeZone();
  const referenceNowMs = params.referenceNow.getTime();
  const scope = normalizeWeatherScope(params.timeScope);
  const dayKey = resolveScopeDayKey(scope, referenceNowMs, timeZone, params.targetDayKey);
  const rainAnalysis = analyzeScopedRain({
    points: params.snapshot.hourly,
    referenceNowMs,
    timeZone,
    dayKey,
    scope,
    timeScope: params.timeScope,
    targetLabel: params.targetLabel,
  });
  const rainExpected = rainAnalysis.period !== null;
  const temperatures = resolveTemperatures(
    params.snapshot,
    params.timeScope,
    referenceNowMs,
    timeZone,
    params.targetDayKey,
  );
  const rainSummaryClause = describeRainPeriod({
    period: rainAnalysis.period,
    locale,
    timeZone,
    referenceNowMs,
    dayPoints: rainAnalysis.dayPoints,
    scope,
    style: 'clause',
    targetLabel: params.targetLabel,
  });
  const rainSummarySentence = describeRainPeriod({
    period: rainAnalysis.period,
    locale,
    timeZone,
    referenceNowMs,
    dayPoints: rainAnalysis.dayPoints,
    scope,
    style: 'sentence',
    targetLabel: params.targetLabel,
  });

  return {
    scope,
    location: formatLocationLabel(params.snapshot),
    tempMin: temperatures.tempMin,
    tempMax: temperatures.tempMax,
    currentTemp: params.snapshot.current.tempC,
    windKph: params.snapshot.current.windKph,
    windy: params.snapshot.current.windKph >= 25,
    needsJacket: temperatures.needsJacket,
    rainExpected,
    rainPeriods: rainAnalysis.periods,
    relevantRainPeriod: rainAnalysis.period,
    rainSummaryClause,
    rainSummarySentence,
    umbrellaNeeded: rainExpected,
    targetDayKey: params.targetDayKey,
    targetLabel: params.targetLabel,
  };
}

export function logWeatherAnalysis(analysis: WeatherAnalysis, referenceNow: Date, locale: 'uk' | 'ru' | 'en') {
  const timeZone = getDeviceTimeZone();

  console.log('[weather][analysis]', {
    localTime: formatHourLabel(referenceNow.getTime(), locale, timeZone),
    scope: analysis.scope,
    location: analysis.location,
    tempMin: analysis.tempMin,
    tempMax: analysis.tempMax,
    currentTemp: analysis.currentTemp,
    windKph: analysis.windKph,
    windy: analysis.windy,
    needsJacket: analysis.needsJacket,
    rainExpected: analysis.rainExpected,
    umbrellaNeeded: analysis.umbrellaNeeded,
    rainPeriodCount: analysis.rainPeriods.length,
    rainStart: analysis.relevantRainPeriod
      ? formatHourLabel(analysis.relevantRainPeriod.startMs, locale, timeZone)
      : null,
    rainEnd: analysis.relevantRainPeriod
      ? formatHourLabel(analysis.relevantRainPeriod.endMs, locale, timeZone)
      : null,
    rainSummaryClause: analysis.rainSummaryClause,
    rainSummarySentence: analysis.rainSummarySentence,
    forecastSlots: analysis.rainPeriods.flatMap((period) =>
      period.slots.map((point: WeatherHourlyPoint) => ({
        time: formatHourLabel(point.timeMs, locale, timeZone),
        pop: point.pop,
        rainMm: point.rainMm,
      })),
    ),
  });
}

export { aggregateHourlyDay, resolveDayKeyForTimeScope };
