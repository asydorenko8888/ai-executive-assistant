import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { findCalendarEventForUpdate } from '@/src/features/agent/calendar/calendarEventMatcher';
import {
  pendingContextFromExtraction,
} from '@/src/features/agent/calendar/calendarUpdatePendingContext';
import { extractCalendarUpdateParameters } from '@/src/features/agent/calendar/calendarUpdateIntentExtractor';
import {
  logCalendarMutationStart,
  logCalendarMutationVerification,
} from '@/src/features/agent/calendar/calendarMutationDiagnostics';
import { logUpdateSuccess } from '@/src/features/agent/calendarIntelligence/calendarReadDiagnostics';
import { logUpdateNotFound } from '@/src/features/agent/calendar/calendarUpdateResolutionDiagnostics';
import { blockCalendarMutationOnScheduleConflict } from '@/src/features/agent/calendar/calendarScheduleConflictGuard';
import { refreshCalendarAgendaState } from '@/src/features/agent/calendar/calendarPostCreateRefresh';
import { updateGoogleCalendarEvent } from '@/src/features/agent/calendar/googleCalendarUpdateService';
import { resolveCalendarWriteAccessState } from '@/src/features/agent/calendar/calendarWriteAccess';
import { logCalendarDecision } from '@/src/features/agent/calendar/calendarDecisionLogger';
import {
  logCalendarUpdateFailed,
  logCalendarUpdateIntent,
  logUpdateExecutionStarted,
} from '@/src/features/agent/calendar/calendarUpdateLogger';
import { parseCalendarUpdateSchedule } from '@/src/features/agent/calendar/calendarUpdateScheduleParser';
import { buildCalendarUpdateEventPayload } from '@/src/features/agent/execution/calendarUpdatePayloadBuilder';
import type { CalendarToolResponse } from '@/src/features/agent/execution/calendarToolContract';
import {
  createCalendarToolFailure,
  createCalendarToolPending,
} from '@/src/features/agent/execution/calendarToolContract';
import {
  buildCalendarUpdateToolReplyBundle,
  type CalendarUpdateToolReplyBundle,
} from '@/src/features/agent/execution/calendarUpdateToolResponses';
import {
  clearPendingCalendarConflictContext,
  clearPendingCalendarUpdateIntent,
  endCalendarOperation,
  setPendingCalendarUpdateContext,
  tryBeginCalendarOperation,
} from '@/src/features/agent/execution/calendarExecutionSession';

export type CalendarUpdateExecutionParams = {
  transcript: string;
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
  skipScheduleConflictCheck?: boolean;
};

export type CalendarUpdateExecutionOutcome = CalendarUpdateToolReplyBundle & {
  verified: boolean;
};

export async function executeCalendarUpdateEvent(
  params: CalendarUpdateExecutionParams,
): Promise<CalendarUpdateExecutionOutcome> {
  logUpdateExecutionStarted({
    action: 'executeCalendarUpdateEvent',
    transcriptPreview: params.transcript.slice(0, 120),
  });
  logCalendarUpdateIntent({
    action: 'executeCalendarUpdateEvent',
    transcriptPreview: params.transcript.slice(0, 120),
  });
  logCalendarMutationStart({
    intent: 'update_calendar_event',
    originalCommand: params.transcript,
  });

  const schedule = parseCalendarUpdateSchedule(params.transcript, params.referenceNow);

  if (!schedule.ok) {
    const tool = createCalendarToolFailure('CALENDAR_DATE_PARSE_FAILED', schedule.detail);
    return {
      ...buildCalendarUpdateToolReplyBundle(tool, params.languageCode, {
        referenceNow: params.referenceNow,
      }),
      verified: false,
    };
  }

  const access = await resolveCalendarWriteAccessState();

  logCalendarDecision('writeAvailable', {
    canReadCalendar: access.canReadCalendar,
    canWriteCalendar: access.canWriteCalendar,
  });

  if (!access.canReadCalendar) {
    const tool = createCalendarToolPending('CALENDAR_AUTH_REQUIRED', 'CALENDAR_AUTH_REQUIRED');
    return {
      ...buildCalendarUpdateToolReplyBundle(tool, params.languageCode, {
        referenceNow: params.referenceNow,
      }),
      verified: false,
    };
  }

  if (!access.canWriteCalendar) {
    const tool = createCalendarToolFailure(
      'WRITE_SCOPE_MISSING',
      'WRITE_SCOPE_MISSING: reconnect Google Calendar and grant event write access (calendar.events).',
    );
    return {
      ...buildCalendarUpdateToolReplyBundle(tool, params.languageCode, {
        referenceNow: params.referenceNow,
      }),
      verified: false,
    };
  }

  if (!tryBeginCalendarOperation(params.transcript)) {
    const tool = createCalendarToolFailure(
      'CALENDAR_OPERATION_IN_PROGRESS',
      'Calendar operation already in progress.',
    );
    return {
      ...buildCalendarUpdateToolReplyBundle(tool, params.languageCode, {
        referenceNow: params.referenceNow,
      }),
      verified: false,
    };
  }

  try {
    const matchResult = await findCalendarEventForUpdate({
      transcript: params.transcript,
      referenceNow: params.referenceNow,
      fromMs: schedule.ok && schedule.kind === 'from_to' ? schedule.fromMs : undefined,
    });

    if (!matchResult.fetchOk) {
      endCalendarOperation({ failed: true });
      const tool = createCalendarToolFailure(
        'CALENDAR_READ_FAILED',
        'Could not refresh Google Calendar before update.',
      );
      logCalendarMutationVerification({
        intent: 'update_calendar_event',
        verified: false,
        verificationFetched: false,
        eventId: null,
        detail: 'fresh_read_failed',
      });
      return {
        ...buildCalendarUpdateToolReplyBundle(tool, params.languageCode, {
          referenceNow: params.referenceNow,
        }),
        verified: false,
      };
    }

    if (matchResult.ambiguous) {
      endCalendarOperation({ failed: true });
      const extracted = extractCalendarUpdateParameters(params.transcript, params.referenceNow);
      setPendingCalendarUpdateContext(
        pendingContextFromExtraction({
          sourceTranscript: params.transcript,
          extraction: extracted,
        }),
      );
      const tool = createCalendarToolFailure(
        'CALENDAR_EVENT_AMBIGUOUS',
        'Multiple matching calendar events found.',
      );
      logCalendarMutationVerification({
        intent: 'update_calendar_event',
        verified: false,
        verificationFetched: false,
        eventId: null,
        detail: 'ambiguous_candidates',
      });
      return {
        ...buildCalendarUpdateToolReplyBundle(tool, params.languageCode, {
          referenceNow: params.referenceNow,
        }),
        verified: false,
      };
    }

    if (!matchResult.match) {
      endCalendarOperation({ failed: true });

      const formatClock = (ms: number) => {
        const date = new Date(ms);
        const pad = (value: number) => String(value).padStart(2, '0');
        return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
      };

      logUpdateNotFound({
        requestedTitle: matchResult.titleQuery,
        requestedFromTime: matchResult.targetMs ? formatClock(matchResult.targetMs) : 'unknown',
        requestedToTime: matchResult.toMs ? formatClock(matchResult.toMs) : 'unknown',
      });

      const tool = createCalendarToolFailure(
        'CALENDAR_EVENT_NOT_FOUND',
        'Could not find a matching calendar event to update.',
      );
      logCalendarMutationVerification({
        intent: 'update_calendar_event',
        verified: false,
        verificationFetched: false,
        eventId: null,
        detail: 'not_found',
      });
      return {
        ...buildCalendarUpdateToolReplyBundle(tool, params.languageCode, {
          referenceNow: params.referenceNow,
        }),
        verified: false,
      };
    }

    const payloadResult = buildCalendarUpdateEventPayload({
      transcript: params.transcript,
      languageCode: params.languageCode,
      referenceNow: params.referenceNow,
      matchedEvent: matchResult.match,
    });

    if (!payloadResult.ok) {
      endCalendarOperation({ failed: true });
      const tool = createCalendarToolFailure(
        payloadResult.reason === 'date_parse_failed'
          ? 'CALENDAR_DATE_PARSE_FAILED'
          : payloadResult.reason === 'title_parse_failed'
            ? 'CALENDAR_DATE_PARSE_FAILED'
            : 'CALENDAR_EVENT_NOT_FOUND',
        payloadResult.detail,
      );
      return {
        ...buildCalendarUpdateToolReplyBundle(tool, params.languageCode, {
          referenceNow: params.referenceNow,
        }),
        verified: false,
      };
    }

    const matchedStartMs = Date.parse(matchResult.match.startsAt);
    const matchedEndMs = Date.parse(matchResult.match.endsAt);
    const durationMs = Math.max(matchedEndMs - matchedStartMs, 30 * 60_000);
    const proposedEndMs = payloadResult.toMs + durationMs;

    const conflictBlock = await blockCalendarMutationOnScheduleConflict({
      operation: 'update',
      sourceTranscript: params.transcript,
      languageCode: params.languageCode,
      proposedTitle: matchResult.match.title,
      proposedStartMs: payloadResult.toMs,
      proposedEndMs,
      referenceNow: params.referenceNow,
      updateEventId: payloadResult.eventId,
      skipScheduleConflictCheck: params.skipScheduleConflictCheck,
    });

    if (conflictBlock) {
      endCalendarOperation({ failed: true });

      return {
        ...buildCalendarUpdateToolReplyBundle(conflictBlock.tool, params.languageCode, {
          referenceNow: params.referenceNow,
        }),
        reply: conflictBlock.reply,
        spokenReply: conflictBlock.spokenReply,
        verified: false,
      };
    }

    logCalendarUpdateIntent({
      eventId: payloadResult.eventId,
      title: matchResult.match.title,
      fromMs: matchResult.targetMs ?? undefined,
      toMs: payloadResult.toMs,
    });

    const tool: CalendarToolResponse = await updateGoogleCalendarEvent(
      payloadResult.eventId,
      payloadResult.payload,
    );

    if (tool.status === 'SUCCESS' && tool.verified) {
      logUpdateSuccess({
        eventId: payloadResult.eventId,
        title: matchResult.match.title,
        fromStart: matchResult.match.startsAt,
        toStart: payloadResult.payload.start.dateTime ?? matchResult.match.startsAt,
      });
      await refreshCalendarAgendaState(params.referenceNow).catch((error) => {
        console.log('[Calendar Refresh] post-update refresh failed', error);
      });
      clearPendingCalendarUpdateIntent();
      clearPendingCalendarConflictContext();
      endCalendarOperation({ failed: false });
      logCalendarMutationVerification({
        intent: 'update_calendar_event',
        verified: true,
        verificationFetched: tool.verificationFetched,
        eventId: tool.eventId ?? null,
      });
      return {
        ...buildCalendarUpdateToolReplyBundle(tool, params.languageCode, {
          referenceNow: params.referenceNow,
          previousStartsAt: matchResult.match.startsAt,
        }),
        verified: true,
      };
    }

    if (tool.status === 'SUCCESS' && !tool.verified) {
      endCalendarOperation({ failed: true });
      clearPendingCalendarUpdateIntent();
      const unverified = createCalendarToolFailure(
        'VERIFY_FAILED',
        'Google Calendar did not confirm the update.',
      );
      logCalendarMutationVerification({
        intent: 'update_calendar_event',
        verified: false,
        verificationFetched: tool.verificationFetched,
        eventId: tool.eventId ?? null,
        detail: 'unverified_success',
      });
      return {
        ...buildCalendarUpdateToolReplyBundle(unverified, params.languageCode, {
          referenceNow: params.referenceNow,
        }),
        verified: false,
      };
    }

    endCalendarOperation({ failed: true });
    logCalendarUpdateFailed({
      reason: 'executor_tool_failure',
      errorCode: tool.errorCode ?? null,
      error: tool.error ?? null,
    });
    clearPendingCalendarUpdateIntent();
    return {
      ...buildCalendarUpdateToolReplyBundle(tool, params.languageCode, {
        referenceNow: params.referenceNow,
      }),
      verified: false,
    };
  } catch (error) {
    endCalendarOperation({ failed: true });
    clearPendingCalendarUpdateIntent();
    logCalendarUpdateFailed({
      reason: 'executor_exception',
      message: error instanceof Error ? error.message : 'Calendar update error',
    });
    const message = error instanceof Error ? error.message : 'Calendar update error';
    const failureTool = createCalendarToolFailure('CALENDAR_OPERATION_ERROR', message);
    return {
      ...buildCalendarUpdateToolReplyBundle(failureTool, params.languageCode, {
        referenceNow: params.referenceNow,
      }),
      verified: false,
    };
  }
}
