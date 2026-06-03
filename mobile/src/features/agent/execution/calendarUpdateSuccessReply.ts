import type { VerifiedCalendarEvent } from '@/src/features/agent/execution/actionExecutionTypes';
import { logCalendarCreate } from '@/src/features/agent/execution/calendarCreateLogger';
import {
  formatVerifiedEventScheduleRangeForUi,
  formatVerifiedEventStartLabelForUi,
} from '@/src/features/agent/calendar/calendarAuthoritativeEvent';
import {
  getExecutiveCalendarTimezone,
  getZonedTimeParts,
} from '@/src/features/agent/calendar/calendarTimezone';
import {
  getChatLocaleFromVoiceLanguage,
  type VoiceLanguageCode,
} from '@/src/features/chat/services/voiceLanguageLocale';

function isSameZonedCalendarDay(leftMs: number, rightMs: number, timeZone: string) {
  const left = getZonedTimeParts(new Date(leftMs), timeZone);
  const right = getZonedTimeParts(new Date(rightMs), timeZone);

  return left.year === right.year && left.month === right.month && left.day === right.day;
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
  const exactTitle = params.event.summary.trim();
  const actualScheduleLabel =
    formatVerifiedEventScheduleRangeForUi({
      event: params.event,
      referenceNow,
      locale,
      timeZone,
    }) ?? '';

  const previousMs = params.previousStartsAt ? Date.parse(params.previousStartsAt) : Number.NaN;
  const hasPrevious = !Number.isNaN(previousMs);
  const oldScheduleLabel = hasPrevious
    ? formatVerifiedEventStartLabelForUi({
        event: { startsAt: params.previousStartsAt! },
        referenceNow,
        locale,
        timeZone,
      })
    : null;

  let reply = '';

  if (locale === 'uk') {
    reply = hasPrevious
      ? `Подію перенесено:\nНазва: ${exactTitle}\nБуло: ${oldScheduleLabel}\nФактичний час: ${actualScheduleLabel}`
      : `Подію оновлено успішно:\nНазва: ${exactTitle}\nФактичний час: ${actualScheduleLabel}`;
  } else if (locale === 'ru') {
    reply = hasPrevious
      ? `Событие перенесено:\nНазвание: ${exactTitle}\nБыло: ${oldScheduleLabel}\nФактическое время: ${actualScheduleLabel}`
      : `Событие обновлено успешно:\nНазвание: ${exactTitle}\nФактическое время: ${actualScheduleLabel}`;
  } else {
    reply = hasPrevious
      ? `${exactTitle} moved successfully.\nPrevious time: ${oldScheduleLabel}\nActual time: ${actualScheduleLabel}`
      : `${exactTitle} updated successfully.\nActual time: ${actualScheduleLabel}`;
  }

  const newStartMs = Date.parse(params.event.startsAt);

  logCalendarCreate('update success reply', {
    eventId: params.event.id,
    summary: exactTitle,
    startsAt: params.event.startsAt,
    endsAt: params.event.endsAt,
    previousStartsAt: params.previousStartsAt ?? null,
    sameDay:
      hasPrevious && !Number.isNaN(newStartMs)
        ? isSameZonedCalendarDay(previousMs, newStartMs, timeZone)
        : null,
    reply,
  });

  return {
    reply,
    spokenReply: reply,
  };
}
