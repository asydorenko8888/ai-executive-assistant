import type { VerifiedCalendarEvent } from '@/src/features/agent/execution/actionExecutionTypes';
import { logCalendarCreate } from '@/src/features/agent/execution/calendarCreateLogger';
import {
  getExecutiveCalendarTimezone,
  getZonedTimeParts,
} from '@/src/features/agent/calendar/calendarTimezone';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';

function isSameZonedCalendarDay(leftMs: number, rightMs: number, timeZone: string) {
  const left = getZonedTimeParts(new Date(leftMs), timeZone);
  const right = getZonedTimeParts(new Date(rightMs), timeZone);

  return left.year === right.year && left.month === right.month && left.day === right.day;
}

function dayOffsetFromReference(instantMs: number, referenceMs: number, timeZone: string) {
  const ref = getZonedTimeParts(new Date(referenceMs), timeZone);
  const target = getZonedTimeParts(new Date(instantMs), timeZone);
  const refDay = Date.UTC(ref.year, ref.month - 1, ref.day);
  const targetDay = Date.UTC(target.year, target.month - 1, target.day);

  return Math.round((targetDay - refDay) / 86400000);
}

function formatDayPhrase(instantMs: number, referenceMs: number, locale: 'uk' | 'ru' | 'en', timeZone: string) {
  const offset = dayOffsetFromReference(instantMs, referenceMs, timeZone);

  if (offset === 0) {
    if (locale === 'uk') {
      return 'сьогодні';
    }

    if (locale === 'ru') {
      return 'сегодня';
    }

    return 'today';
  }

  if (offset === 1) {
    if (locale === 'uk') {
      return 'завтра';
    }

    if (locale === 'ru') {
      return 'завтра';
    }

    return 'tomorrow';
  }

  if (offset === 2) {
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

function formatTimePhrase(instantMs: number, locale: 'uk' | 'ru' | 'en', timeZone: string) {
  const parts = getZonedTimeParts(new Date(instantMs), timeZone);
  const hours = parts.hour;
  const minutes = parts.minute;
  const hour12 = hours % 12 || 12;
  const clock =
    minutes > 0 ? `${hour12}:${String(minutes).padStart(2, '0')}` : `${hour12}`;

  if (locale === 'uk') {
    if (hours >= 17) {
      return `${clock} вечора`;
    }

    if (hours >= 12) {
      return `${clock} дня`;
    }

    if (hours >= 5) {
      return `${clock} ранку`;
    }

    return `${clock} ночі`;
  }

  if (locale === 'ru') {
    if (hours >= 17) {
      return `${clock} вечера`;
    }

    if (hours >= 12) {
      return `${clock} дня`;
    }

    if (hours >= 5) {
      return `${clock} утра`;
    }

    return `${clock} ночи`;
  }

  const date = new Date(instantMs);

  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: minutes > 0 ? '2-digit' : undefined,
    timeZone,
  });
}

function formatScheduleLabel(
  instantMs: number,
  referenceMs: number,
  locale: 'uk' | 'ru' | 'en',
  timeZone: string,
) {
  return `${formatDayPhrase(instantMs, referenceMs, locale, timeZone)}, ${formatTimePhrase(instantMs, locale, timeZone)}`;
}

export function buildNaturalCalendarUpdateSuccessReply(params: {
  event: VerifiedCalendarEvent;
  languageCode: VoiceLanguageCode;
  referenceNow?: Date;
  previousStartsAt?: string;
  timeZone?: string;
}) {
  const locale = getChatLocaleFromVoiceLanguage(params.languageCode);
  const referenceNow = params.referenceNow ?? new Date();
  const timeZone = params.timeZone ?? getExecutiveCalendarTimezone();
  const newStartMs = Date.parse(params.event.startsAt);
  const startMs = Number.isNaN(newStartMs) ? referenceNow.getTime() : newStartMs;
  const exactTitle = params.event.summary.trim();
  const newScheduleLabel = formatScheduleLabel(startMs, referenceNow.getTime(), locale, timeZone);

  const previousMs = params.previousStartsAt ? Date.parse(params.previousStartsAt) : Number.NaN;
  const hasPrevious = !Number.isNaN(previousMs);
  const oldScheduleLabel = hasPrevious
    ? formatScheduleLabel(previousMs, referenceNow.getTime(), locale, timeZone)
    : null;

  let reply = '';

  if (locale === 'uk') {
    reply = hasPrevious
      ? `Подію перенесено:\nНазва: ${exactTitle}\nБуло: ${oldScheduleLabel}\nСтало: ${newScheduleLabel}`
      : `Подію оновлено успішно:\nНазва: ${exactTitle}\nНовий час: ${newScheduleLabel}`;
  } else if (locale === 'ru') {
    reply = hasPrevious
      ? `Событие перенесено:\nНазвание: ${exactTitle}\nБыло: ${oldScheduleLabel}\nСтало: ${newScheduleLabel}`
      : `Событие обновлено успешно:\nНазвание: ${exactTitle}\nНовое время: ${newScheduleLabel}`;
  } else {
    reply = hasPrevious
      ? `Event rescheduled:\nTitle: ${exactTitle}\nPrevious: ${oldScheduleLabel}\nNew: ${newScheduleLabel}`
      : `Event updated successfully:\nTitle: ${exactTitle}\nNew time: ${newScheduleLabel}`;
  }

  logCalendarCreate('update success reply', {
    eventId: params.event.id,
    summary: exactTitle,
    startsAt: params.event.startsAt,
    previousStartsAt: params.previousStartsAt ?? null,
    sameDay: hasPrevious ? isSameZonedCalendarDay(previousMs, startMs, timeZone) : null,
    reply,
  });

  return {
    reply,
    spokenReply: reply,
  };
}
