import type { CalendarToolResponse } from '@/src/features/agent/execution/calendarToolContract';
import {
  buildFailureTerminalReply,
  isVerifiedCalendarUpdateSuccess,
} from '@/src/features/agent/calendar/calendarExecutionContract';
import { buildNaturalCalendarUpdateSuccessReply } from '@/src/features/agent/execution/calendarUpdateSuccessReply';
import type { CalendarExecutionState } from '@/src/features/agent/execution/calendarExecutionStates';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';

export type CalendarUpdateToolReplyBundle = {
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

export function buildCalendarUpdateToolReplyBundle(
  tool: CalendarToolResponse,
  languageCode: VoiceLanguageCode,
  options?: { referenceNow?: Date },
): CalendarUpdateToolReplyBundle {
  if (tool.status === 'SUCCESS' && isVerifiedCalendarUpdateSuccess(tool) && tool.event) {
    const copy = buildNaturalCalendarUpdateSuccessReply({
      event: tool.event,
      languageCode,
      referenceNow: options?.referenceNow,
    });

    return {
      tool,
      reply: copy.reply,
      spokenReply: copy.spokenReply,
      executionState: 'success',
      requiresCalendarAuth: false,
    };
  }

  if (tool.status === 'SUCCESS') {
    const text = buildFailureTerminalReply(
      'CALENDAR_EXECUTION_CONTRACT',
      'API success without verified event payload — update success reply blocked',
    );

    return {
      tool,
      reply: text,
      spokenReply: text,
      executionState: 'failed',
      requiresCalendarAuth: false,
    };
  }

  if (tool.status === 'PENDING') {
    const code = tool.errorCode ?? 'PENDING';
    const text = `PENDING: ${code}`;

    return {
      tool,
      reply: text,
      spokenReply: text,
      executionState: mapToolStatusToExecutionState(tool),
      requiresCalendarAuth: tool.errorCode === 'CALENDAR_AUTH_REQUIRED',
    };
  }

  const code = tool.errorCode ?? 'UNKNOWN';
  const detail = tool.error ?? 'unknown error';
  const text = `FAILURE: ${code}: ${detail}`;

  return {
    tool,
    reply: text,
    spokenReply: text,
    executionState: mapToolStatusToExecutionState(tool),
    requiresCalendarAuth:
      tool.errorCode === 'CALENDAR_AUTH_REQUIRED' ||
      tool.errorCode === 'WRITE_SCOPE_MISSING' ||
      tool.errorCode === 'GOOGLE_CALENDAR_WRITE_NOT_GRANTED' ||
      tool.errorCode === 'GOOGLE_WRITE_PERMISSION_MISSING',
  };
}
