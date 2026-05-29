import type { VerifiedCalendarEvent } from '@/src/features/agent/execution/actionExecutionTypes';
import { logCalendarCreate } from '@/src/features/agent/execution/calendarCreateLogger';
import { formatTimeInExecutiveTimezone } from '@/src/features/agent/calendar/calendarTime';
import {
  getExecutiveCalendarTimezone,
  getZonedTimeParts,
  getZonedYmd,
} from '@/src/features/agent/calendar/calendarTimezone';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';

function isSameExecutiveDay(leftMs: number, rightMs: number, timeZone: string) {
  const left = getZonedYmd(new Date(leftMs), timeZone);
  const right = getZonedYmd(new Date(rightMs), timeZone);

  return left.year === right.year && left.month === right.month && left.day === right.day;
}

function isTomorrowExecutive(startMs: number, referenceMs: number, timeZone: string) {
  const start = getZonedYmd(new Date(startMs), timeZone);
  const tomorrow = getZonedYmd(new Date(referenceMs + 24 * 60 * 60 * 1000), timeZone);

  return start.year === tomorrow.year && start.month === tomorrow.month && start.day === tomorrow.day;
}

function formatDayPhrase(startMs: number, referenceMs: number, locale: 'uk' | 'ru' | 'en', timeZone: string) {
  if (isSameExecutiveDay(startMs, referenceMs, timeZone)) {
    if (locale === 'uk') {
      return 'сьогодні';
    }

    if (locale === 'ru') {
      return 'сегодня';
    }

    return 'today';
  }

  if (isTomorrowExecutive(startMs, referenceMs, timeZone)) {
    if (locale === 'uk') {
      return 'завтра';
    }

    if (locale === 'ru') {
      return 'завтра';
    }

    return 'tomorrow';
  }

  const intlLocale = locale === 'ru' ? 'ru-RU' : locale === 'uk' ? 'uk-UA' : 'en-US';
  const parts = getZonedTimeParts(new Date(startMs), timeZone);

  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).toLocaleDateString(intlLocale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function formatTimePhrase(startsAt: string, locale: 'uk' | 'ru' | 'en', timeZone: string) {
  const clock = formatTimeInExecutiveTimezone(startsAt, timeZone);
  const parts = getZonedTimeParts(new Date(startsAt), timeZone);
  const hours = parts.hour;
  const minutes = parts.minute;
  const hour12 = hours % 12 || 12;
  const withMinutes =
    minutes > 0 ? `${hour12}:${String(minutes).padStart(2, '0')}` : `${hour12}`;

  if (locale === 'uk') {
    if (hours >= 17) {
      return `${withMinutes} вечора`;
    }

    if (hours >= 12) {
      return `${withMinutes} дня`;
    }

    if (hours >= 5) {
      return `${withMinutes} ранку`;
    }

    return `${withMinutes} ночі`;
  }

  if (locale === 'ru') {
    if (hours >= 17) {
      return `${withMinutes} вечера`;
    }

    if (hours >= 12) {
      return `${withMinutes} дня`;
    }

    if (hours >= 5) {
      return `${withMinutes} утра`;
    }

    return `${withMinutes} ночи`;
  }

  return clock;
}

export function buildNaturalCalendarCreateSuccessReply(params: {
  event: VerifiedCalendarEvent;
  languageCode: VoiceLanguageCode;
  referenceNow?: Date;
}) {
  const locale = getChatLocaleFromVoiceLanguage(params.languageCode);
  const referenceNow = params.referenceNow ?? new Date();
  const timeZone = getExecutiveCalendarTimezone();
  const startMs = Date.parse(params.event.startsAt);
  const referenceMs = referenceNow.getTime();
  const exactTitle = params.event.summary.trim();
  const dayPhrase = formatDayPhrase(startMs, referenceMs, locale, timeZone);
  const timePhrase = formatTimePhrase(params.event.startsAt, locale, timeZone);
  const scheduleLabel = `${dayPhrase}, ${timePhrase}`;

  let reply = '';

  if (locale === 'uk') {
    reply = `Подію створено успішно:\nНазва: ${exactTitle}\nЧас: ${scheduleLabel}`;
  } else if (locale === 'ru') {
    reply = `Событие создано успешно:\nНазвание: ${exactTitle}\nВремя: ${scheduleLabel}`;
  } else {
    reply = `Event created successfully:\nTitle: ${exactTitle}\nTime: ${scheduleLabel}`;
  }

  logCalendarCreate('success reply', {
    eventId: params.event.id,
    summary: exactTitle,
    startsAt: params.event.startsAt,
    reply,
  });

  return {
    reply,
    spokenReply: reply,
  };
}
