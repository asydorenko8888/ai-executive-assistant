import { parseGoogleCalendarInstant } from '@/src/features/agent/calendar/calendarTime';
import { getExecutiveCalendarTimezone } from '@/src/features/agent/calendar/calendarTimezone';

export type CalendarDurationLocale = 'ru' | 'uk' | 'en';

export type FormatDurationUntilResult = {
  diffMinutes: number;
  formattedDuration: string;
  isPast: boolean;
  isNow: boolean;
};

export function computeDurationUntilDiffMs(targetStart: Date, referenceNow: Date) {
  return targetStart.getTime() - referenceNow.getTime();
}

export function computeDurationUntilMinutes(targetStart: Date, referenceNow: Date) {
  const diffMs = computeDurationUntilDiffMs(targetStart, referenceNow);
  return Math.floor(diffMs / 60000);
}

function ruHourLabel(hours: number) {
  const mod10 = hours % 10;
  const mod100 = hours % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${hours} час`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return `${hours} часа`;
  }

  return `${hours} часов`;
}

function ruMinuteLabel(minutes: number) {
  const mod10 = minutes % 10;
  const mod100 = minutes % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${minutes} минута`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return `${minutes} минуты`;
  }

  return `${minutes} минут`;
}

function ukHourLabel(hours: number) {
  const mod10 = hours % 10;
  const mod100 = hours % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${hours} година`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return `${hours} години`;
  }

  return `${hours} годин`;
}

function ukMinuteLabel(minutes: number) {
  const mod10 = minutes % 10;
  const mod100 = minutes % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${minutes} хвилина`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return `${minutes} хвилини`;
  }

  return `${minutes} хвилин`;
}

/** Human-readable duration from a non-negative minute count (<60 → minutes only; 60+ → hours + minutes). */
export function formatTotalMinutesAsDuration(
  totalMinutes: number,
  locale: CalendarDurationLocale,
) {
  const safeMinutes = Math.max(0, Math.floor(totalMinutes));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;

  return formatDurationParts(hours, minutes, locale);
}

function formatDurationParts(hours: number, minutes: number, locale: CalendarDurationLocale) {
  if (locale === 'ru') {
    if (hours > 0 && minutes > 0) {
      return `${ruHourLabel(hours)} ${ruMinuteLabel(minutes)}`;
    }

    if (hours > 0) {
      return ruHourLabel(hours);
    }

    return ruMinuteLabel(minutes);
  }

  if (locale === 'uk') {
    if (hours > 0 && minutes > 0) {
      return `${ukHourLabel(hours)} ${ukMinuteLabel(minutes)}`;
    }

    if (hours > 0) {
      return ukHourLabel(hours);
    }

    return ukMinuteLabel(minutes);
  }

  if (hours > 0 && minutes > 0) {
    return `${hours} hour${hours === 1 ? '' : 's'} ${minutes} minute${minutes === 1 ? '' : 's'}`;
  }

  if (hours > 0) {
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }

  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

function formatPastDuration(locale: CalendarDurationLocale) {
  if (locale === 'uk') {
    return 'Подія вже почалася або завершилася';
  }

  if (locale === 'ru') {
    return 'Событие уже началось или завершилось';
  }

  return 'The event has already started or ended';
}

export function formatDurationUntil(
  targetStart: Date,
  referenceNow: Date,
  locale: CalendarDurationLocale,
): FormatDurationUntilResult {
  const diffMs = computeDurationUntilDiffMs(targetStart, referenceNow);
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMs <= 0) {
    return {
      diffMinutes,
      formattedDuration: formatPastDuration(locale),
      isPast: true,
      isNow: false,
    };
  }

  return {
    diffMinutes,
    formattedDuration: formatTotalMinutesAsDuration(diffMinutes, locale),
    isPast: false,
    isNow: false,
  };
}

export function formatDurationUntilFromEventStartIso(params: {
  eventStartIso: string;
  referenceNow: Date;
  locale: CalendarDurationLocale;
}) {
  const parsedStart = parseGoogleCalendarInstant(params.eventStartIso);

  if (parsedStart === null) {
    return null;
  }

  return formatDurationUntil(new Date(parsedStart), params.referenceNow, params.locale);
}

export function logCalendarTimeUntilDebug(params: {
  query: string;
  referenceNow: Date;
  selectedEventTitle: string;
  selectedEventStartIso: string;
  diffMinutes: number;
  formattedDuration: string;
  timeZone?: string;
}) {
  const timeZone = params.timeZone ?? getExecutiveCalendarTimezone();
  const parsedStart = parseGoogleCalendarInstant(params.selectedEventStartIso);
  const locale = 'sv-SE';

  console.log('[calendar_time_until]', {
    query: params.query,
    nowLocal: params.referenceNow.toLocaleString(locale, { timeZone }),
    matchedEventTitle: params.selectedEventTitle,
    eventStartRaw: params.selectedEventStartIso,
    eventStartParsedLocal:
      parsedStart === null ? null : new Date(parsedStart).toLocaleString(locale, { timeZone }),
    diffMinutes: params.diffMinutes,
    formattedDuration: params.formattedDuration,
  });
}
