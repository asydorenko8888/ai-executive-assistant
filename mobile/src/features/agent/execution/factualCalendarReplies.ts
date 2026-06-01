import type { CalendarToolResponse } from '@/src/features/agent/execution/calendarToolContract';
import { buildFailureTerminalReply } from '@/src/features/agent/calendar/calendarExecutionContract';
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
    const text = buildFailureTerminalReply(
      'CALENDAR_EXECUTION_CONTRACT',
      'API success without verified event payload — success reply blocked',
    );

    return {
      reply: text,
      spokenReply: text,
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

  if (tool.errorCode === 'CALENDAR_SCHEDULE_CONFLICT' && tool.error) {
    return {
      reply: tool.error,
      spokenReply: tool.error,
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
