import type { CalendarToolResponse } from '@/src/features/agent/execution/calendarToolContract';
import { buildFactualCalendarToolReplies } from '@/src/features/agent/execution/factualCalendarReplies';
import type { CalendarExecutionState } from '@/src/features/agent/execution/calendarExecutionStates';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';

export type CalendarToolReplyBundle = {
  tool: CalendarToolResponse;
  reply: string;
  spokenReply: string;
  executionState: CalendarExecutionState;
  requiresCalendarAuth: boolean;
};

function mapToolStatusToExecutionState(tool: CalendarToolResponse): CalendarExecutionState {
  if (tool.status === 'SUCCESS') {
    return 'success';
  }

  if (tool.status === 'PENDING') {
    return tool.errorCode === 'CALENDAR_AUTH_REQUIRED' ? 'authenticating' : 'verifying_event';
  }

  return 'failed';
}

export function buildCalendarToolReplyBundle(
  tool: CalendarToolResponse,
  _languageCode: VoiceLanguageCode,
): CalendarToolReplyBundle {
  const copy = buildFactualCalendarToolReplies(tool);

  return {
    tool,
    reply: copy.reply,
    spokenReply: copy.spokenReply,
    executionState: mapToolStatusToExecutionState(tool),
    requiresCalendarAuth:
      tool.errorCode === 'CALENDAR_AUTH_REQUIRED' ||
      tool.errorCode === 'WRITE_SCOPE_MISSING' ||
      tool.errorCode === 'GOOGLE_CALENDAR_WRITE_NOT_GRANTED' ||
      tool.errorCode === 'GOOGLE_WRITE_PERMISSION_MISSING',
  };
}

export function buildCalendarToolReplyFromLastResult(
  languageCode: VoiceLanguageCode,
  last: CalendarToolResponse,
) {
  return buildCalendarToolReplyBundle(last, languageCode);
}
