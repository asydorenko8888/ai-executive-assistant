import type { CalendarToolResponse } from '@/src/features/agent/execution/calendarToolContract';
import { buildNaturalCalendarCreateSuccessReply } from '@/src/features/agent/execution/calendarCreateSuccessReply';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';

export type FactualCalendarReplyOptions = {
  languageCode: VoiceLanguageCode;
  referenceNow?: Date;
};

/** Factual failures/pending; natural confirmation on verified success. */
export function buildFactualCalendarToolReplies(
  tool: CalendarToolResponse,
  options: FactualCalendarReplyOptions,
) {
  if (tool.status === 'SUCCESS' && tool.event) {
    return buildNaturalCalendarCreateSuccessReply({
      event: tool.event,
      languageCode: options.languageCode,
      referenceNow: options.referenceNow,
    });
  }

  if (tool.status === 'SUCCESS') {
    const fallback =
      options.languageCode === 'uk-UA'
        ? 'Готово. Подію додано в Google Calendar.'
        : options.languageCode === 'ru-RU'
          ? 'Готово. Событие добавлено в Google Calendar.'
          : 'Done. The event was added to Google Calendar.';

    return {
      reply: fallback,
      spokenReply: fallback,
    };
  }

  if (tool.status === 'PENDING') {
    const code = tool.errorCode ?? 'PENDING';
    const text = `PENDING: ${code}`;

    return {
      reply: text,
      spokenReply: text,
    };
  }

  const code = tool.errorCode ?? 'UNKNOWN';
  const detail = tool.error ?? 'unknown error';
  const text = `FAILURE: ${code}: ${detail}`;

  return {
    reply: text,
    spokenReply: text,
  };
}
