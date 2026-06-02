import { formatClockLabelFromInstantMs } from '@/src/features/agent/calendar/calendarUpdateScheduleParser';
import {
  getExecutiveCalendarTimezone,
  getZonedTimeParts,
  getZonedYmd,
} from '@/src/features/agent/calendar/calendarTimezone';

export function formatCalendarDayPhrase(
  instantMs: number,
  referenceMs: number,
  locale: 'uk' | 'ru' | 'en',
  timeZone: string,
) {
  const start = getZonedYmd(new Date(instantMs), timeZone);
  const reference = getZonedYmd(new Date(referenceMs), timeZone);
  const sameDay =
    start.year === reference.year && start.month === reference.month && start.day === reference.day;

  if (sameDay) {
    if (locale === 'uk') {
      return 'сьогодні';
    }

    if (locale === 'ru') {
      return 'сегодня';
    }

    return 'today';
  }

  const tomorrowRef = getZonedYmd(new Date(referenceMs + 24 * 60 * 60 * 1000), timeZone);
  const isTomorrow =
    start.year === tomorrowRef.year &&
    start.month === tomorrowRef.month &&
    start.day === tomorrowRef.day;

  if (isTomorrow) {
    if (locale === 'uk') {
      return 'завтра';
    }

    if (locale === 'ru') {
      return 'завтра';
    }

    return 'tomorrow';
  }

  const dayAfterRef = getZonedYmd(new Date(referenceMs + 2 * 24 * 60 * 60 * 1000), timeZone);
  const isDayAfter =
    start.year === dayAfterRef.year &&
    start.month === dayAfterRef.month &&
    start.day === dayAfterRef.day;

  if (isDayAfter) {
    if (locale === 'uk') {
      return 'післязавтра';
    }

    if (locale === 'ru') {
      return 'послезавтра';
    }

    return 'the day after tomorrow';
  }

  const intlLocale = locale === 'ru' ? 'ru-RU' : locale === 'uk' ? 'uk-UA' : 'en-US';
  const parts = getZonedTimeParts(new Date(instantMs), timeZone);

  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).toLocaleDateString(intlLocale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

/** Safe UI clock label — always 24-hour HH:mm, never "1 дня" / "3 ночи". */
export function formatCalendarClock24ForUi(instantMs: number, timeZone?: string) {
  return formatClockLabelFromInstantMs(instantMs, timeZone ?? getExecutiveCalendarTimezone());
}

export function formatCalendarScheduleLabelForUi(params: {
  instantMs: number;
  referenceMs: number;
  locale: 'uk' | 'ru' | 'en';
  timeZone?: string;
}) {
  const timeZone = params.timeZone ?? getExecutiveCalendarTimezone();

  return `${formatCalendarDayPhrase(params.instantMs, params.referenceMs, params.locale, timeZone)}, ${formatCalendarClock24ForUi(params.instantMs, timeZone)}`;
}
