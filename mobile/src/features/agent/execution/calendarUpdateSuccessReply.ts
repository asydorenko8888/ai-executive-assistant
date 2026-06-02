import type { VerifiedCalendarEvent } from '@/src/features/agent/execution/actionExecutionTypes';
import { logCalendarCreate } from '@/src/features/agent/execution/calendarCreateLogger';
import { formatCalendarScheduleLabelForUi } from '@/src/features/agent/calendar/calendarScheduleDisplay';
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
  const referenceMs = referenceNow.getTime();
  const newScheduleLabel = formatCalendarScheduleLabelForUi({
    instantMs: startMs,
    referenceMs,
    locale,
    timeZone,
  });

  const previousMs = params.previousStartsAt ? Date.parse(params.previousStartsAt) : Number.NaN;
  const hasPrevious = !Number.isNaN(previousMs);
  const oldScheduleLabel = hasPrevious
    ? formatCalendarScheduleLabelForUi({
        instantMs: previousMs,
        referenceMs,
        locale,
        timeZone,
      })
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
