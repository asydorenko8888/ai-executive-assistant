import type { CalendarToolResponse } from '@/src/features/agent/execution/calendarToolContract';
import {
  buildFailureTerminalReply,
  isVerifiedCalendarDeleteSuccess,
} from '@/src/features/agent/calendar/calendarExecutionContract';
import {
  buildCalendarDeleteAllDayNotSupportedReply,
  buildCalendarDeleteAmbiguousReply,
  buildCalendarDeleteApiFailureReply,
  buildCalendarDeleteNotFoundReply,
  buildCalendarDeleteRecurringNotSupportedReply,
  buildCalendarDeleteVerificationFailedReply,
} from '@/src/features/agent/calendar/calendarDeleteNaturalReplies';
import {
  buildCalendarApiUnavailableReply,
  buildCalendarToolUserReply,
} from '@/src/features/agent/calendar/calendarAuthUserReplies';
import { buildCalendarOperationInProgressReply } from '@/src/features/agent/calendar/calendarOperationUserReplies';
import {
  buildCalendarEventDisambiguationReply,
  type CalendarDisambiguationCandidate,
} from '@/src/features/agent/calendar/calendarEventDisambiguation';
import { buildNaturalCalendarDeleteSuccessReply } from '@/src/features/agent/execution/calendarDeleteSuccessReply';
import type { CalendarExecutionState } from '@/src/features/agent/execution/calendarExecutionStates';
import {
  getChatLocaleFromVoiceLanguage,
  type VoiceLanguageCode,
} from '@/src/features/chat/services/voiceLanguageLocale';

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
  options?: {
    referenceNow?: Date;
    disambiguationCandidates?: CalendarDisambiguationCandidate[];
    eventTitle?: string | null;
  },
): string | null {
  const locale = getChatLocaleFromVoiceLanguage(languageCode);

  if (tool.errorCode === 'CALENDAR_EVENT_NOT_FOUND') {
    return buildCalendarDeleteNotFoundReply(locale);
  }

  if (tool.errorCode === 'CALENDAR_EVENT_AMBIGUOUS') {
    if (options?.disambiguationCandidates?.length && options.referenceNow) {
      return buildCalendarEventDisambiguationReply({
        locale,
        action: 'delete',
        title: options.eventTitle ?? options.disambiguationCandidates[0]?.title ?? 'event',
        candidates: options.disambiguationCandidates,
        referenceNow: options.referenceNow,
      });
    }

    return buildCalendarDeleteAmbiguousReply(locale);
  }

  if (tool.errorCode === 'CALENDAR_RECURRING_NOT_SUPPORTED') {
    return buildCalendarDeleteRecurringNotSupportedReply(locale);
  }

  if (tool.errorCode === 'CALENDAR_ALL_DAY_NOT_SUPPORTED') {
    return buildCalendarDeleteAllDayNotSupportedReply(locale);
  }

  if (tool.errorCode === 'VERIFY_FAILED') {
    return buildCalendarDeleteVerificationFailedReply(locale);
  }

  if (tool.status === 'FAILURE' && tool.error) {
    return buildCalendarDeleteApiFailureReply(locale, tool.error);
  }

  return null;
}

export function buildCalendarDeleteToolReplyBundle(
  tool: CalendarToolResponse,
  languageCode: VoiceLanguageCode,
  options?: {
    referenceNow?: Date;
    disambiguationCandidates?: CalendarDisambiguationCandidate[];
    eventTitle?: string | null;
  },
): CalendarDeleteToolReplyBundle {
  if (tool.status === 'SUCCESS' && isVerifiedCalendarDeleteSuccess(tool) && tool.event) {
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

  if (tool.status === 'SUCCESS') {
    const text = buildFailureTerminalReply(
      'CALENDAR_EXECUTION_CONTRACT',
      'API success without verified delete confirmation — delete success reply blocked',
    );

    return {
      tool,
      reply: text,
      spokenReply: text,
      executionState: 'failed',
      requiresCalendarAuth: false,
    };
  }

  const naturalFailure = buildNaturalDeleteFailureReply(tool, languageCode, options);

  if (naturalFailure) {
    return {
      tool,
      reply: naturalFailure,
      spokenReply: naturalFailure,
      executionState: 'failed',
      requiresCalendarAuth: false,
    };
  }

  const authOrApiReply = buildCalendarToolUserReply(tool, languageCode);

  if (authOrApiReply) {
    return {
      tool,
      reply: authOrApiReply,
      spokenReply: authOrApiReply,
      executionState: mapToolStatusToExecutionState(tool),
      requiresCalendarAuth: tool.errorCode === 'CALENDAR_AUTH_REQUIRED',
    };
  }

  if (tool.status === 'PENDING') {
    const text = buildCalendarOperationInProgressReply(languageCode);

    return {
      tool,
      reply: text,
      spokenReply: text,
      executionState: mapToolStatusToExecutionState(tool),
      requiresCalendarAuth: false,
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

  const text = buildCalendarApiUnavailableReply(languageCode);

  return {
    tool,
    reply: text,
    spokenReply: text,
    executionState: mapToolStatusToExecutionState(tool),
    requiresCalendarAuth: false,
  };
}
