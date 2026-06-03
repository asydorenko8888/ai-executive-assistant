import type { CalendarToolResponse } from '@/src/features/agent/execution/calendarToolContract';
import { buildFailureTerminalReply } from '@/src/features/agent/calendar/calendarExecutionContract';
import {
  buildCalendarApiUnavailableReply,
  buildCalendarToolUserReply,
} from '@/src/features/agent/calendar/calendarAuthUserReplies';
import { buildCalendarOperationInProgressReply } from '@/src/features/agent/calendar/calendarOperationUserReplies';
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

  if (tool.errorCode === 'CALENDAR_OPERATION_IN_PROGRESS') {
    const text = buildCalendarOperationInProgressReply(options.languageCode);

    return {
      reply: text,
      spokenReply: text,
    };
  }

  const text = buildCalendarApiUnavailableReply(options.languageCode);

  return {
    reply: text,
    spokenReply: text,
  };
}
