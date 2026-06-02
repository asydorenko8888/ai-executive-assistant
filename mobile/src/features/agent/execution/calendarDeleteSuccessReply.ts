import type { VerifiedCalendarEvent } from '@/src/features/agent/execution/actionExecutionTypes';
import { formatCalendarClock24ForUi, formatCalendarDayPhrase } from '@/src/features/agent/calendar/calendarScheduleDisplay';
import { getExecutiveCalendarTimezone } from '@/src/features/agent/calendar/calendarTimezone';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';

export function buildNaturalCalendarDeleteSuccessReply(params: {
  event: VerifiedCalendarEvent;
  languageCode: VoiceLanguageCode;
  referenceNow?: Date;
}) {
  const locale = getChatLocaleFromVoiceLanguage(params.languageCode);
  const referenceNow = params.referenceNow ?? new Date();
  const title = params.event.summary.trim();
  const startMs = Date.parse(params.event.startsAt);
  const instantMs = Number.isNaN(startMs) ? referenceNow.getTime() : startMs;
  const timeZone = getExecutiveCalendarTimezone();
  const dayPhrase = formatCalendarDayPhrase(instantMs, referenceNow.getTime(), locale, timeZone);
  const timeLabel = formatCalendarClock24ForUi(instantMs, timeZone);

  if (locale === 'uk') {
    const spokenReply = `Я видалив подію: ${title}, ${dayPhrase}, ${timeLabel}.`;
    return {
      reply: spokenReply,
      spokenReply,
    };
  }

  if (locale === 'ru') {
    const spokenReply = `Событие удалено: ${title}, ${dayPhrase}, ${timeLabel}.`;
    return {
      reply: spokenReply,
      spokenReply,
    };
  }

  const spokenReply = `I deleted the event: ${title}, ${dayPhrase}, ${timeLabel}.`;
  return {
    reply: spokenReply,
    spokenReply,
  };
}
