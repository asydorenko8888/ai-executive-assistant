import type { VerifiedCalendarEvent } from '@/src/features/agent/execution/actionExecutionTypes';
import { logCalendarCreate } from '@/src/features/agent/execution/calendarCreateLogger';
import { formatVerifiedEventScheduleRangeForUi } from '@/src/features/agent/calendar/calendarAuthoritativeEvent';
import { getExecutiveCalendarTimezone } from '@/src/features/agent/calendar/calendarTimezone';
import {
  getChatLocaleFromVoiceLanguage,
  type VoiceLanguageCode,
} from '@/src/features/chat/services/voiceLanguageLocale';

export function buildNaturalCalendarCreateSuccessReply(params: {
  event: VerifiedCalendarEvent;
  languageCode: VoiceLanguageCode;
  referenceNow?: Date;
}) {
  const locale = getChatLocaleFromVoiceLanguage(params.languageCode);
  const referenceNow = params.referenceNow ?? new Date();
  const timeZone = getExecutiveCalendarTimezone();
  const exactTitle = params.event.summary.trim();
  const scheduleLabel =
    formatVerifiedEventScheduleRangeForUi({
      event: params.event,
      referenceNow,
      locale,
      timeZone,
    }) ?? '';

  let reply = '';

  if (locale === 'uk') {
    reply = `Подію створено успішно:\nНазва: ${exactTitle}\nФактичний час: ${scheduleLabel}`;
  } else if (locale === 'ru') {
    reply = `Событие создано успешно:\nНазвание: ${exactTitle}\nФактическое время: ${scheduleLabel}`;
  } else {
    reply = `Event created successfully:\nTitle: ${exactTitle}\nActual time: ${scheduleLabel}`;
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
