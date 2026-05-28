import type { CalendarToolResponse } from '@/src/features/agent/execution/calendarToolContract';
import { buildNaturalCalendarDeleteSuccessReply } from '@/src/features/agent/execution/calendarDeleteSuccessReply';
import type { CalendarExecutionState } from '@/src/features/agent/execution/calendarExecutionStates';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';

export type CalendarDeleteToolReplyBundle = {
  tool: CalendarToolResponse;
  reply: string;
  spokenReply: string;
  executionState: CalendarExecutionState;
};

function mapToolStatusToExecutionState(tool: CalendarToolResponse): CalendarExecutionState {
  if (tool.status === 'SUCCESS') {
    return 'success';
  }

  if (tool.status === 'PENDING') {
    return 'authenticating';
  }

  return 'failed';
}

export function buildCalendarDeleteToolReplyBundle(
  tool: CalendarToolResponse,
  languageCode: VoiceLanguageCode,
  options?: { referenceNow?: Date },
): CalendarDeleteToolReplyBundle {
  if (tool.status === 'SUCCESS' && tool.event) {
    const copy = buildNaturalCalendarDeleteSuccessReply({
      event: tool.event,
      languageCode,
      referenceNow: options?.referenceNow,
    });

    return {
      tool,
      reply: copy.reply,
      spokenReply: copy.spokenReply,
      executionState: 'success',
    };
  }

  if (tool.status === 'PENDING') {
    const text = `PENDING: ${tool.errorCode ?? 'PENDING'}`;
    return { tool, reply: text, spokenReply: text, executionState: 'authenticating' };
  }

  const code = tool.errorCode ?? 'UNKNOWN';
  const detail = tool.error ?? 'unknown error';
  const text = `FAILURE: ${code}: ${detail}`;

  return {
    tool,
    reply: text,
    spokenReply: text,
    executionState: mapToolStatusToExecutionState(tool),
  };
}
