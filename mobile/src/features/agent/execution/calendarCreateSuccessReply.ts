import type { VerifiedCalendarEvent } from '@/src/features/agent/execution/actionExecutionTypes';
import { logCalendarCreate } from '@/src/features/agent/execution/calendarCreateLogger';
import { formatCalendarScheduleLabelForUi } from '@/src/features/agent/calendar/calendarScheduleDisplay';
import { getExecutiveCalendarTimezone } from '@/src/features/agent/calendar/calendarTimezone';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';

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
  const scheduleLabel = formatCalendarScheduleLabelForUi({
    instantMs: Number.isNaN(startMs) ? referenceMs : startMs,
    referenceMs,
    locale,
    timeZone,
  });

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
