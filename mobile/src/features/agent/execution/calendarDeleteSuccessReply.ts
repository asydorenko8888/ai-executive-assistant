import type { VerifiedCalendarEvent } from '@/src/features/agent/execution/actionExecutionTypes';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';
import { formatTimeInLocalTimezone } from '@/src/features/agent/calendar/calendarTime';

export function buildNaturalCalendarDeleteSuccessReply(params: {
  event: VerifiedCalendarEvent;
  languageCode: VoiceLanguageCode;
  referenceNow?: Date;
}) {
  const locale = getChatLocaleFromVoiceLanguage(params.languageCode);
  const title = params.event.summary.trim();
  const timeLabel = formatTimeInLocalTimezone(params.event.startsAt);

  if (locale === 'uk') {
    return {
      reply: `Готово. Я видалив: ${title} — ${timeLabel}.`,
      spokenReply: `Готово. Я видалив: ${title} — ${timeLabel}.`,
    };
  }

  if (locale === 'ru') {
    return {
      reply: `Готово. Я удалил: ${title} — ${timeLabel}.`,
      spokenReply: `Готово. Я удалил: ${title} — ${timeLabel}.`,
    };
  }

  return {
    reply: `Done. I removed: ${title} — ${timeLabel}.`,
    spokenReply: `Done. I removed: ${title} — ${timeLabel}.`,
  };
}
