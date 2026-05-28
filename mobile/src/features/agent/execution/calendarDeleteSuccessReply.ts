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
      reply: `Подію видалено успішно:\nНазва: ${title}\nЧас: ${timeLabel}`,
      spokenReply: `Готово. Я видалив: ${title} — ${timeLabel}.`,
    };
  }

  if (locale === 'ru') {
    return {
      reply: `Событие удалено успешно:\nНазвание: ${title}\nВремя: ${timeLabel}`,
      spokenReply: `Готово. Я удалил: ${title} — ${timeLabel}.`,
    };
  }

  return {
    reply: `Event removed successfully:\nTitle: ${title}\nTime: ${timeLabel}`,
    spokenReply: `Done. I removed: ${title} — ${timeLabel}.`,
  };
}
