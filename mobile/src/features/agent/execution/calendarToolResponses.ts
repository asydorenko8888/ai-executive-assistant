import type { CalendarToolResponse } from '@/src/features/agent/execution/calendarToolContract';
import { isVerifiedCalendarCreateSuccess } from '@/src/features/agent/calendar/calendarExecutionContract';
import { buildFactualCalendarToolReplies } from '@/src/features/agent/execution/factualCalendarReplies';
import type { CalendarExecutionState } from '@/src/features/agent/execution/calendarExecutionStates';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguageLocale';

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

export type CalendarToolReplyOptions = {
  referenceNow?: Date;
};

export function buildCalendarToolReplyBundle(
  tool: CalendarToolResponse,
  languageCode: VoiceLanguageCode,
  options?: CalendarToolReplyOptions,
): CalendarToolReplyBundle {
  const copy = buildFactualCalendarToolReplies(tool, {
    languageCode,
    referenceNow: options?.referenceNow,
  });
  const blockedUnverifiedSuccess =
    tool.status === 'SUCCESS' && !isVerifiedCalendarCreateSuccess(tool);

  return {
    tool,
    reply: copy.reply,
    spokenReply: copy.spokenReply,
    executionState: blockedUnverifiedSuccess ? 'failed' : mapToolStatusToExecutionState(tool),
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
  options?: CalendarToolReplyOptions,
) {
  return buildCalendarToolReplyBundle(last, languageCode, options);
}
