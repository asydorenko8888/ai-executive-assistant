import { formatDateKey } from '@/src/features/agent/calendarIntelligence/zonedEventTime';
import { getZonedYmd, type ZonedYmd } from '@/src/features/agent/calendar/calendarTimezone';
import type { WeatherSnapshot, WeatherTimeScope } from '@/src/features/weather/types';
import { filterPointsForDay, getDeviceTimeZone, localDateKey } from '@/src/features/weather/weatherRainForecast';

export type WeatherTimeTarget = {
  timeScope: WeatherTimeScope;
  targetDayKey?: string;
  targetLabel?: string;
  forecastOutOfRange?: boolean;
};

export type ParseWeatherTimeTargetOptions = {
  referenceNow?: Date;
  timeZone?: string;
  locale?: 'uk' | 'ru' | 'en';
};

const DAY_AFTER_TOMORROW =
  /(?:^|[\s,.;:!?—-])(?:післязавтра|послезавтра|day\s+after\s+tomorrow)(?:[\s,.;:!?—-]|$)/iu;
const TOMORROW = /(?:^|[\s,.;:!?—-])(?:завтра|tomorrow)(?:[\s,.;:!?—-]|$)/iu;
const EVENING =
  /(?:^|[\s,.;:!?—-])(?:вечером|evening|tonight|сегодня вечером|ввечері)(?:[\s,.;:!?—-]|$)/iu;
const MORNING =
  /(?:^|[\s,.;:!?—-])(?:утром|morning|рано утром|вранці)(?:[\s,.;:!?—-]|$)/iu;
const NEXT_WEEK =
  /(?:^|[\s,.;:!?—-])(?:next\s+week|на\s+следующ(?:ей|ую)\s+недел(?:е|ю)|наступного\s+тижня|на\s+наступному\s+тижн(?:і|i)|на\s+наступний\s+тиждень)(?:[\s,.;:!?—-]|$)/iu;

const FIVE_DAY_RANGE =
  /(?:^|[\s,.;:!?—-])(?:(?:в|на|for)\s+)?(?:ближайш(?:ие|их|ие)?|следующ(?:ие|их|ие)?|найближч(?:і|их)?|next)\s+(?:(?:5|п(?:'|’)?ять|п'ять|five)\s+(?:дн(?:ей|я|ів|ні)|days?)|5\s+дн(?:ей|я|ів|ні)?)(?:[\s,.;:!?—-]|$)|(?:^|[\s,.;:!?—-])(?:five\s+day\s+forecast|на\s+(?:5|п(?:'|’)?ять|п'ять)\s+дн(?:ей|я|ів|ні)?|наступн(?:і|их)\s+5\s+дн(?:ів|ні)?)(?:[\s,.;:!?—-]|$)/iu;
const ISO_DATE = /(?:^|[\s,.;:!?—-])(\d{4})-(\d{2})-(\d{2})(?:[\s,.;:!?—-]|$)/iu;
const SLASH_DATE = /(?:^|[\s,.;:!?—-])(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?:[\s,.;:!?—-]|$)/iu;

const MONTH_ENTRIES: Array<{ month: number; pattern: RegExp; ru: string; uk: string; en: string }> = [
  { month: 1, pattern: /(?:январ(?:я|ь)?|січн(?:я|ь)?|january)/iu, ru: 'января', uk: 'січня', en: 'January' },
  { month: 2, pattern: /(?:феврал(?:я|ь)?|лют(?:ого|ий|ні)?|february)/iu, ru: 'февраля', uk: 'лютого', en: 'February' },
  { month: 3, pattern: /(?:март(?:а|е)?|березн(?:я|ь)?|march)/iu, ru: 'марта', uk: 'березня', en: 'March' },
  { month: 4, pattern: /(?:апрел(?:я|ь)?|квітн(?:я|ь)?|april)/iu, ru: 'апреля', uk: 'квітня', en: 'April' },
  { month: 5, pattern: /(?:ма(?:я|й|ї)|травн(?:я|ь)?|may)/iu, ru: 'мая', uk: 'травня', en: 'May' },
  { month: 6, pattern: /(?:июн(?:я|ь)?|червн(?:я|ь)?|june)/iu, ru: 'июня', uk: 'червня', en: 'June' },
  { month: 7, pattern: /(?:июл(?:я|ь)?|липн(?:я|ь)?|july)/iu, ru: 'июля', uk: 'липня', en: 'July' },
  { month: 8, pattern: /(?:август(?:а|е)?|серпн(?:я|ь)?|august)/iu, ru: 'августа', uk: 'серпня', en: 'August' },
  { month: 9, pattern: /(?:сентябр(?:я|ь)?|вересн(?:я|ь)?|september)/iu, ru: 'сентября', uk: 'вересня', en: 'September' },
  { month: 10, pattern: /(?:октябр(?:я|ь)?|жовтн(?:я|ь)?|october)/iu, ru: 'октября', uk: 'жовтня', en: 'October' },
  { month: 11, pattern: /(?:ноябр(?:я|ь)?|листопад(?:а|у)?|november)/iu, ru: 'ноября', uk: 'листопада', en: 'November' },
  { month: 12, pattern: /(?:декабр(?:я|ь)?|грудн(?:я|ь)?|december)/iu, ru: 'декабря', uk: 'грудня', en: 'December' },
];

function findMonthEntry(token: string) {
  return MONTH_ENTRIES.find((entry) => entry.pattern.test(token));
}

function formatMonthDayLabel(day: number, month: number, locale: 'uk' | 'ru' | 'en') {
  const entry = MONTH_ENTRIES.find((item) => item.month === month);

  if (!entry) {
    return `${day}.${month}`;
  }

  if (locale === 'en') {
    return `${entry.en} ${day}`;
  }

  if (locale === 'uk') {
    return `${day} ${entry.uk}`;
  }

  return `${day} ${entry.ru}`;
}

function formatDayKeyLabel(dayKey: string, locale: 'uk' | 'ru' | 'en') {
  const [, monthText, dayText] = dayKey.split('-');
  const month = Number(monthText);
  const day = Number(dayText);

  return formatMonthDayLabel(day, month, locale);
}

function resolveYmdToDayKey(ymd: ZonedYmd) {
  return formatDateKey(ymd);
}

function resolveMonthDayToDayKey(day: number, month: number, referenceNow: Date, timeZone: string) {
  const refYmd = getZonedYmd(referenceNow, timeZone);
  let year = refYmd.year;
  let candidate = resolveYmdToDayKey({ year, month, day });

  if (candidate < resolveYmdToDayKey(refYmd)) {
    year += 1;
    candidate = resolveYmdToDayKey({ year, month, day });
  }

  return candidate;
}

function parseSpecificDate(
  transcript: string,
  referenceNow: Date,
  timeZone: string,
  locale: 'uk' | 'ru' | 'en',
): { dayKey: string; label: string } | null {
  const isoMatch = transcript.match(ISO_DATE);

  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const dayKey = resolveYmdToDayKey({ year, month, day });

    return {
      dayKey,
      label: formatDayKeyLabel(dayKey, locale),
    };
  }

  const slashMatch = transcript.match(SLASH_DATE);

  if (slashMatch) {
    const month = Number(slashMatch[1]);
    const day = Number(slashMatch[2]);
    const yearToken = slashMatch[3];
    const year = yearToken
      ? yearToken.length === 2
        ? 2000 + Number(yearToken)
        : Number(yearToken)
      : getZonedYmd(referenceNow, timeZone).year;
    const dayKey = yearToken
      ? resolveYmdToDayKey({ year, month, day })
      : resolveMonthDayToDayKey(day, month, referenceNow, timeZone);

    return {
      dayKey,
      label: formatMonthDayLabel(day, month, locale),
    };
  }

  const dayMonthMatch = transcript.match(
    /(?:^|[\s,.;:!?—-])(\d{1,2})\s+([\p{L}]+)(?:[\s,.;:!?—-]|$)/iu,
  );

  if (dayMonthMatch) {
    const day = Number(dayMonthMatch[1]);
    const monthEntry = findMonthEntry(dayMonthMatch[2]);

    if (monthEntry) {
      const dayKey = resolveMonthDayToDayKey(day, monthEntry.month, referenceNow, timeZone);

      return {
        dayKey,
        label: formatMonthDayLabel(day, monthEntry.month, locale),
      };
    }
  }

  const monthDayMatch = transcript.match(
    /(?:^|[\s,.;:!?—-])([\p{L}]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:[\s,.;:!?—-]|$)/iu,
  );

  if (monthDayMatch) {
    const monthEntry = findMonthEntry(monthDayMatch[1]);
    const day = Number(monthDayMatch[2]);

    if (monthEntry) {
      const dayKey = resolveMonthDayToDayKey(day, monthEntry.month, referenceNow, timeZone);

      return {
        dayKey,
        label: formatMonthDayLabel(day, monthEntry.month, locale),
      };
    }
  }

  return null;
}

export function isFiveDayForecastIntent(transcript: string) {
  return FIVE_DAY_RANGE.test(transcript.trim());
}

function nextWeekLabel(locale: 'uk' | 'ru' | 'en') {
  if (locale === 'uk') {
    return 'наступного тижня';
  }

  if (locale === 'ru') {
    return 'на следующей неделе';
  }

  return 'next week';
}

export function isDayKeyInForecastSnapshot(
  dayKey: string,
  snapshot: WeatherSnapshot,
  referenceNowMs: number,
  timeZone: string,
) {
  const todayKey = localDateKey(referenceNowMs, timeZone);

  if (dayKey < todayKey) {
    return false;
  }

  return filterPointsForDay(snapshot.hourly, timeZone, dayKey).length > 0;
}

export function buildWeatherForecastOutOfRangeReply(params: {
  locale: 'uk' | 'ru' | 'en';
  periodLabel: string;
}) {
  if (params.locale === 'uk') {
    return `На ${params.periodLabel} я можу дати прогноз тільки на найближчі 5 днів.`;
  }

  if (params.locale === 'ru') {
    return `На ${params.periodLabel} я могу дать прогноз только на ближайшие 5 дней.`;
  }

  return `For ${params.periodLabel}, I can only give a forecast for the next 5 days.`;
}

export function parseWeatherTimeTarget(
  transcript: string,
  options: ParseWeatherTimeTargetOptions = {},
): WeatherTimeTarget {
  const referenceNow = options.referenceNow ?? new Date();
  const timeZone = options.timeZone ?? getDeviceTimeZone();
  const locale = options.locale ?? 'ru';

  const hasDayAfterTomorrow = DAY_AFTER_TOMORROW.test(transcript);
  const hasTomorrow = TOMORROW.test(transcript);
  const hasEvening = EVENING.test(transcript);
  const hasMorning = MORNING.test(transcript);

  if (hasDayAfterTomorrow) {
    if (hasEvening) {
      return { timeScope: 'day_after_tomorrow_evening' };
    }

    if (hasMorning) {
      return { timeScope: 'day_after_tomorrow_morning' };
    }

    return { timeScope: 'day_after_tomorrow' };
  }

  if (hasTomorrow) {
    return { timeScope: 'tomorrow' };
  }

  if (FIVE_DAY_RANGE.test(transcript)) {
    return { timeScope: 'next_5_days' };
  }

  if (NEXT_WEEK.test(transcript)) {
    return {
      timeScope: 'next_week',
      targetLabel: nextWeekLabel(locale),
    };
  }

  const specificDate = parseSpecificDate(transcript, referenceNow, timeZone, locale);

  if (specificDate) {
    return {
      timeScope: 'specific_date',
      targetDayKey: specificDate.dayKey,
      targetLabel: specificDate.label,
    };
  }

  if (hasEvening) {
    return { timeScope: 'evening' };
  }

  if (hasMorning) {
    return { timeScope: 'morning' };
  }

  if (/(?:^|[\s,.;:!?—-])(?:сейчас|сегодня|today|now|сьогодні|зараз)(?:[\s,.;:!?—-]|$)/iu.test(transcript)) {
    return {
      timeScope: /(?:^|[\s,.;:!?—-])(?:сейчас|now|зараз)(?:[\s,.;:!?—-]|$)/iu.test(transcript) ? 'now' : 'today',
    };
  }

  return { timeScope: 'unspecified' };
}

export function finalizeWeatherTimeTarget(params: {
  target: WeatherTimeTarget;
  snapshot: WeatherSnapshot;
  referenceNowMs: number;
  timeZone: string;
}): WeatherTimeTarget {
  if (params.target.forecastOutOfRange) {
    return params.target;
  }

  if (params.target.timeScope !== 'specific_date' || !params.target.targetDayKey) {
    return params.target;
  }

  const inRange = isDayKeyInForecastSnapshot(
    params.target.targetDayKey,
    params.snapshot,
    params.referenceNowMs,
    params.timeZone,
  );

  if (inRange) {
    return params.target;
  }

  return {
    ...params.target,
    forecastOutOfRange: true,
  };
}
