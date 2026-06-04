import { parseGoogleCalendarInstant } from '@/src/features/agent/calendar/calendarTime';

export type CalendarDurationLocale = 'ru' | 'uk' | 'en';

export type FormatDurationUntilResult = {
  diffMinutes: number;
  formattedDuration: string;
  isPast: boolean;
  isNow: boolean;
};

export function computeDurationUntilMinutes(targetStart: Date, referenceNow: Date) {
  return Math.floor((targetStart.getTime() - referenceNow.getTime()) / 60000);
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

export function formatDurationUntil(
  targetStart: Date,
  referenceNow: Date,
  locale: CalendarDurationLocale,
): FormatDurationUntilResult {
  const diffMinutes = computeDurationUntilMinutes(targetStart, referenceNow);

  if (diffMinutes < 0) {
    const formattedDuration =
      locale === 'uk'
        ? 'подія вже почалася'
        : locale === 'ru'
          ? 'событие уже началось'
          : 'the event has already started';

    return {
      diffMinutes,
      formattedDuration,
      isPast: true,
      isNow: false,
    };
  }

  if (diffMinutes === 0) {
    const formattedDuration =
      locale === 'uk' ? 'зараз' : locale === 'ru' ? 'прямо сейчас' : 'right now';

    return {
      diffMinutes: 0,
      formattedDuration,
      isPast: false,
      isNow: true,
    };
  }

  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;

  return {
    diffMinutes,
    formattedDuration: formatDurationParts(hours, minutes, locale),
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
  referenceNowIso: string;
  selectedEventTitle: string;
  selectedEventStartIso: string;
  diffMinutes: number;
  formattedDuration: string;
}) {
  console.log('[calendar_time_until]', params);
}
