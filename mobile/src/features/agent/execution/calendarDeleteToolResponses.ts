import type { CalendarToolResponse } from '@/src/features/agent/execution/calendarToolContract';
import {
  buildCalendarDeleteAllDayNotSupportedReply,
  buildCalendarDeleteAmbiguousReply,
  buildCalendarDeleteNotFoundReply,
  buildCalendarDeleteRecurringNotSupportedReply,
} from '@/src/features/agent/calendar/calendarDeleteNaturalReplies';
import { buildCalendarOperationInProgressReply } from '@/src/features/agent/calendar/calendarOperationUserReplies';
import { buildNaturalCalendarDeleteSuccessReply } from '@/src/features/agent/execution/calendarDeleteSuccessReply';
import type { CalendarExecutionState } from '@/src/features/agent/execution/calendarExecutionStates';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';

export type CalendarDeleteToolReplyBundle = {
  tool: CalendarToolResponse;
  reply: string;
  spokenReply: string;
  executionState: CalendarExecutionState;
  requiresCalendarAuth?: boolean;
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

function buildNaturalDeleteFailureReply(
  tool: CalendarToolResponse,
  languageCode: VoiceLanguageCode,
): string | null {
  const locale = getChatLocaleFromVoiceLanguage(languageCode);

  if (tool.errorCode === 'CALENDAR_EVENT_NOT_FOUND') {
    return buildCalendarDeleteNotFoundReply(locale);
  }

  if (tool.errorCode === 'CALENDAR_EVENT_AMBIGUOUS') {
    return buildCalendarDeleteAmbiguousReply(locale);
  }

  if (tool.errorCode === 'CALENDAR_RECURRING_NOT_SUPPORTED') {
    return buildCalendarDeleteRecurringNotSupportedReply(locale);
  }

  if (tool.errorCode === 'CALENDAR_ALL_DAY_NOT_SUPPORTED') {
    return buildCalendarDeleteAllDayNotSupportedReply(locale);
  }

  return null;
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
      requiresCalendarAuth: false,
    };
  }

  const naturalFailure = buildNaturalDeleteFailureReply(tool, languageCode);

  if (naturalFailure) {
    return {
      tool,
      reply: naturalFailure,
      spokenReply: naturalFailure,
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

  if (tool.errorCode === 'CALENDAR_OPERATION_IN_PROGRESS') {
    const text = buildCalendarOperationInProgressReply(languageCode);

    return {
      tool,
      reply: text,
      spokenReply: text,
      executionState: 'failed',
      requiresCalendarAuth: false,
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
