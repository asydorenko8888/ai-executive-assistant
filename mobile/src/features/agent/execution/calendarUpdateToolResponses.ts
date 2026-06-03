import type { CalendarToolResponse } from '@/src/features/agent/execution/calendarToolContract';
import {
  buildFailureTerminalReply,
  isVerifiedCalendarUpdateSuccess,
} from '@/src/features/agent/calendar/calendarExecutionContract';
import {
  buildCalendarApiUnavailableReply,
  buildCalendarToolUserReply,
} from '@/src/features/agent/calendar/calendarAuthUserReplies';
import { buildCalendarOperationInProgressReply } from '@/src/features/agent/calendar/calendarOperationUserReplies';
import {
  buildCalendarEventDisambiguationReply,
  type CalendarDisambiguationCandidate,
} from '@/src/features/agent/calendar/calendarEventDisambiguation';
import {
  buildCalendarUpdateAmbiguousReply,
  buildCalendarUpdateNoTimeChangeReply,
  buildCalendarUpdateNotFoundReply,
  buildCalendarUpdateTimeParseFailedReply,
} from '@/src/features/agent/calendar/calendarUpdateNaturalReplies';
import { buildNaturalCalendarUpdateSuccessReply } from '@/src/features/agent/execution/calendarUpdateSuccessReply';
import type { CalendarExecutionState } from '@/src/features/agent/execution/calendarExecutionStates';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { getChatLocaleFromVoiceLanguage } from '@/src/features/chat/services/voiceLanguage';

export type CalendarUpdateToolReplyBundle = {
  tool: CalendarToolResponse;
  reply: string;
  spokenReply: string;
  executionState: CalendarExecutionState;
  requiresCalendarAuth: boolean;
};

function buildNaturalUpdateFailureReply(
  tool: CalendarToolResponse,
  languageCode: VoiceLanguageCode,
  options?: {
    eventTitle?: string | null;
    referenceNow?: Date;
    disambiguationCandidates?: CalendarDisambiguationCandidate[];
  },
): string | null {
  const locale = getChatLocaleFromVoiceLanguage(languageCode);

  if (tool.errorCode === 'CALENDAR_EVENT_NOT_FOUND') {
    return buildCalendarUpdateNotFoundReply(locale);
  }

  if (tool.errorCode === 'CALENDAR_EVENT_AMBIGUOUS') {
    if (options?.disambiguationCandidates?.length && options.referenceNow) {
      return buildCalendarEventDisambiguationReply({
        locale,
        action: 'update',
        title: options.eventTitle ?? options.disambiguationCandidates[0]?.title ?? 'event',
        candidates: options.disambiguationCandidates,
        referenceNow: options.referenceNow,
      });
    }

    return buildCalendarUpdateAmbiguousReply(locale);
  }

  if (tool.errorCode === 'CALENDAR_NO_TIME_CHANGE') {
    return buildCalendarUpdateNoTimeChangeReply(locale, options?.eventTitle ?? 'that event');
  }

  if (tool.errorCode === 'CALENDAR_DATE_PARSE_FAILED') {
    return buildCalendarUpdateTimeParseFailedReply(locale);
  }

  return null;
}

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
  options?: {
    referenceNow?: Date;
    previousStartsAt?: string;
    requestedEventTitle?: string | null;
    disambiguationCandidates?: CalendarDisambiguationCandidate[];
  },
): CalendarUpdateToolReplyBundle {
  if (tool.status === 'SUCCESS' && isVerifiedCalendarUpdateSuccess(tool) && tool.event) {
    const copy = buildNaturalCalendarUpdateSuccessReply({
      event: tool.event,
      languageCode,
      referenceNow: options?.referenceNow,
      previousStartsAt: options?.previousStartsAt,
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

  const naturalFailure = buildNaturalUpdateFailureReply(tool, languageCode, {
    eventTitle: options?.requestedEventTitle,
    referenceNow: options?.referenceNow,
    disambiguationCandidates: options?.disambiguationCandidates,
  });

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
