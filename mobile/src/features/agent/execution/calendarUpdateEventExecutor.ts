import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { findCalendarEventForUpdate } from '@/src/features/agent/calendar/calendarEventMatcher';
import {
  pendingContextFromExtraction,
} from '@/src/features/agent/calendar/calendarUpdatePendingContext';
import {
  syncConversationStateForMoveClarification,
  syncConversationStateForUpdateSelection,
} from '@/src/features/agent/calendar/calendarConversationSync';
import { calendarEventsToDisambiguationCandidates } from '@/src/features/agent/calendar/calendarEventDisambiguation';
import { extractCalendarUpdateParameters } from '@/src/features/agent/calendar/calendarUpdateIntentExtractor';
import { logCalendarMutationAudit } from '@/src/features/agent/calendar/calendarMutationAudit';
import {
  logCalendarMutationStart,
  logCalendarMutationVerification,
} from '@/src/features/agent/calendar/calendarMutationDiagnostics';
import { logUpdateSuccess } from '@/src/features/agent/calendarIntelligence/calendarReadDiagnostics';
import { logUpdateNotFound } from '@/src/features/agent/calendar/calendarUpdateResolutionDiagnostics';
import { recordVerifiedCalendarEventContext } from '@/src/features/agent/calendar/calendarMutationEventContext';
import { blockCalendarMutationOnScheduleConflict } from '@/src/features/agent/calendar/calendarScheduleConflictGuard';
import { updateGoogleCalendarEvent } from '@/src/features/agent/calendar/googleCalendarUpdateService';
import { resolveCalendarWriteAccessState } from '@/src/features/agent/calendar/calendarWriteAccess';
import { logCalendarDecision } from '@/src/features/agent/calendar/calendarDecisionLogger';
import {
  logCalendarUpdateFailed,
  logCalendarUpdateIntent,
  logUpdateExecutionStarted,
} from '@/src/features/agent/calendar/calendarUpdateLogger';
import { assertResolvedTargetMatchesPayload } from '@/src/features/agent/calendar/calendarUpdateEventResolution';
import {
  buildCalendarUpdatePayloadFromResolution,
  buildCalendarUpdatePayloadFromStoredTarget,
  type CalendarUpdatePayloadBuildResult,
} from '@/src/features/agent/execution/calendarUpdatePayloadBuilder';
import type { CalendarStoredUpdateTarget } from '@/src/features/agent/calendar/calendarPendingConflictTarget';
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
  storedUpdateTarget?: CalendarStoredUpdateTarget;
};

async function guardUpdateScheduleConflict(params: {
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
  transcript: string;
  titleSourceTranscript?: string;
  matchedTitle: string;
  matchedStartsAt: string;
  matchedEndsAt: string;
  payloadResult: Extract<CalendarUpdatePayloadBuildResult, { ok: true }>;
  skipScheduleConflictCheck?: boolean;
}): Promise<CalendarUpdateExecutionOutcome | null> {
  const matchedStartMs = Date.parse(params.matchedStartsAt);
  const matchedEndMs = Date.parse(params.matchedEndsAt);
  const durationMs = Math.max(matchedEndMs - matchedStartMs, 30 * 60_000);
  const proposedEndMs = params.payloadResult.toMs + durationMs;

  const conflictBlock = await blockCalendarMutationOnScheduleConflict({
    operation: 'update',
    sourceTranscript: params.transcript,
    titleSourceTranscript: params.titleSourceTranscript,
    languageCode: params.languageCode,
    proposedTitle: params.matchedTitle,
    proposedStartMs: params.payloadResult.toMs,
    proposedEndMs,
    referenceNow: params.referenceNow,
    updateEventId: params.payloadResult.eventId,
    targetOriginalStartsAt: params.matchedStartsAt,
    targetOriginalEndsAt: params.matchedEndsAt,
    skipScheduleConflictCheck: params.skipScheduleConflictCheck,
  });

  if (!conflictBlock) {
    return null;
  }

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

async function executeVerifiedCalendarUpdate(params: {
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
  payloadResult: Extract<CalendarUpdatePayloadBuildResult, { ok: true }>;
  matchedStartsAt: string;
  matchedTitle: string;
  requestedEventTitle?: string | null;
  conflictOverride?: boolean;
}): Promise<CalendarUpdateExecutionOutcome> {
  logCalendarUpdateIntent({
    eventId: params.payloadResult.eventId,
    title: params.matchedTitle,
    toMs: params.payloadResult.toMs,
  });

  const tool: CalendarToolResponse = await updateGoogleCalendarEvent(
    params.payloadResult.eventId,
    params.payloadResult.payload,
    { originalStartsAt: params.matchedStartsAt },
  );

  if (tool.status === 'SUCCESS' && tool.verified) {
    logCalendarMutationAudit(
      {
        operationType: 'MOVE',
        requestedEvent: params.requestedEventTitle ?? params.matchedTitle,
        resolvedEvent: tool.event?.summary ?? params.matchedTitle,
        eventId: tool.eventId ?? params.payloadResult.eventId,
        oldTime: params.matchedStartsAt,
        newTime: tool.event?.startsAt ?? params.payloadResult.payload.start.dateTime ?? null,
        conflictDetected: Boolean(params.conflictOverride),
        conflictOverride: Boolean(params.conflictOverride),
        status: 'success',
      },
      { languageCode: params.languageCode, referenceNow: params.referenceNow },
    );
    logUpdateSuccess({
      eventId: params.payloadResult.eventId,
      title: params.matchedTitle,
      fromStart: params.matchedStartsAt,
      toStart: params.payloadResult.payload.start.dateTime ?? params.matchedStartsAt,
    });
    clearPendingCalendarUpdateIntent();
    clearPendingCalendarConflictContext();
    endCalendarOperation({ failed: false });
    if (tool.eventId && tool.event) {
      recordVerifiedCalendarEventContext({
        eventId: tool.eventId,
        title: tool.event.summary ?? params.matchedTitle,
        startISO: tool.event.startsAt,
        endISO: tool.event.endsAt,
        actionType: 'update',
        clearPendingReason: 'update_completed',
        referenceNow: params.referenceNow,
        languageCode: params.languageCode,
      });
    }
    logCalendarMutationVerification({
      intent: 'update_calendar_event',
      verified: true,
      verificationFetched: tool.verificationFetched,
      eventId: tool.eventId ?? null,
    });
    return {
      ...buildCalendarUpdateToolReplyBundle(tool, params.languageCode, {
        referenceNow: params.referenceNow,
        previousStartsAt: params.matchedStartsAt,
      }),
      verified: true,
    };
  }

  if (tool.status === 'SUCCESS' && !tool.verified) {
    endCalendarOperation({ failed: true });
    logCalendarMutationAudit(
      {
        operationType: 'MOVE',
        requestedEvent: params.requestedEventTitle ?? params.matchedTitle,
        resolvedEvent: params.matchedTitle,
        eventId: params.payloadResult.eventId,
        oldTime: params.matchedStartsAt,
        newTime: params.payloadResult.payload.start.dateTime ?? null,
        conflictDetected: Boolean(params.conflictOverride),
        conflictOverride: Boolean(params.conflictOverride),
        status: 'failed',
        detail: 'verification_failed',
      },
      { languageCode: params.languageCode, referenceNow: params.referenceNow },
    );
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
  return {
    ...buildCalendarUpdateToolReplyBundle(tool, params.languageCode, {
      referenceNow: params.referenceNow,
    }),
    verified: false,
  };
}

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

  if (!tryBeginCalendarOperation(
    params.storedUpdateTarget
      ? `confirmed-update:${params.storedUpdateTarget.eventId}`
      : params.transcript,
  )) {
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
    if (params.storedUpdateTarget) {
      const payloadResult = buildCalendarUpdatePayloadFromStoredTarget({
        eventId: params.storedUpdateTarget.eventId,
        title: params.storedUpdateTarget.title,
        originalStartsAt: params.storedUpdateTarget.originalStartsAt,
        originalEndsAt: params.storedUpdateTarget.originalEndsAt,
        requestedStartMs: params.storedUpdateTarget.requestedStartMs,
        requestedEndMs: params.storedUpdateTarget.requestedEndMs,
        languageCode: params.languageCode,
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

      const conflictOutcome = await guardUpdateScheduleConflict({
        languageCode: params.languageCode,
        referenceNow: params.referenceNow,
        transcript: params.transcript,
        matchedTitle: params.storedUpdateTarget.title,
        matchedStartsAt: params.storedUpdateTarget.originalStartsAt,
        matchedEndsAt: params.storedUpdateTarget.originalEndsAt,
        payloadResult,
        skipScheduleConflictCheck: params.skipScheduleConflictCheck,
      });

      if (conflictOutcome) {
        return conflictOutcome;
      }

      return executeVerifiedCalendarUpdate({
        languageCode: params.languageCode,
        referenceNow: params.referenceNow,
        payloadResult,
        matchedStartsAt: params.storedUpdateTarget.originalStartsAt,
        matchedTitle: params.storedUpdateTarget.title,
      });
    }

    const matchResult = await findCalendarEventForUpdate({
      transcript: params.transcript,
      referenceNow: params.referenceNow,
    });

    const requestedTitle =
      matchResult.requestedEventName ?? matchResult.titleQuery ?? null;

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

    if (matchResult.resolutionFailureReason) {
      endCalendarOperation({ failed: true });
      const reason = matchResult.resolutionFailureReason;

      if (reason === 'ambiguous') {
        const extracted = extractCalendarUpdateParameters(params.transcript, params.referenceNow);
        const candidates = calendarEventsToDisambiguationCandidates(matchResult.candidates);
        const pendingUpdate = {
          ...pendingContextFromExtraction({
            sourceTranscript: params.transcript,
            extraction: extracted,
          }),
          candidates,
        };
        setPendingCalendarUpdateContext(pendingUpdate);
        syncConversationStateForUpdateSelection(pendingUpdate, params.languageCode);
        const tool = createCalendarToolFailure(
          'CALENDAR_EVENT_AMBIGUOUS',
          matchResult.resolutionDetail ?? 'Multiple matching calendar events found.',
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
            requestedEventTitle: requestedTitle,
            disambiguationCandidates: candidates,
          }),
          verified: false,
        };
      }

      if (reason === 'no_time_change' && matchResult.match) {
        logCalendarMutationAudit(
          {
            operationType: 'MOVE',
            requestedEvent: requestedTitle ?? matchResult.match.title,
            resolvedEvent: matchResult.match.title,
            eventId: matchResult.match.id,
            oldTime: matchResult.match.startsAt,
            newTime: matchResult.match.startsAt,
            conflictDetected: false,
            conflictOverride: false,
            status: 'no_op_blocked',
            detail: matchResult.resolutionDetail ?? 'no_time_change',
          },
          { languageCode: params.languageCode, referenceNow: params.referenceNow },
        );
        const tool = createCalendarToolFailure(
          'CALENDAR_NO_TIME_CHANGE',
          matchResult.resolutionDetail ?? 'Requested time matches current start.',
        );
        return {
          ...buildCalendarUpdateToolReplyBundle(tool, params.languageCode, {
            referenceNow: params.referenceNow,
            requestedEventTitle: requestedTitle ?? matchResult.match.title,
          }),
          verified: false,
        };
      }

      if (reason === 'time_parse_failed') {
        const tool = createCalendarToolFailure(
          'CALENDAR_DATE_PARSE_FAILED',
          matchResult.resolutionDetail ?? 'Could not parse destination time.',
        );
        return {
          ...buildCalendarUpdateToolReplyBundle(tool, params.languageCode, {
            referenceNow: params.referenceNow,
            requestedEventTitle: requestedTitle,
          }),
          verified: false,
        };
      }

      const formatClock = (ms: number) => {
        const date = new Date(ms);
        const pad = (value: number) => String(value).padStart(2, '0');
        return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
      };

      logUpdateNotFound({
        requestedTitle: requestedTitle ?? matchResult.titleQuery,
        requestedFromTime: matchResult.targetMs ? formatClock(matchResult.targetMs) : 'unknown',
        requestedToTime: matchResult.toMs ? formatClock(matchResult.toMs) : 'unknown',
      });

      const tool = createCalendarToolFailure(
        'CALENDAR_EVENT_NOT_FOUND',
        matchResult.resolutionDetail ?? 'Could not find a matching calendar event to update.',
      );
      logCalendarMutationVerification({
        intent: 'update_calendar_event',
        verified: false,
        verificationFetched: false,
        eventId: matchResult.match?.id ?? null,
        detail: reason,
      });
      return {
        ...buildCalendarUpdateToolReplyBundle(tool, params.languageCode, {
          referenceNow: params.referenceNow,
          requestedEventTitle: requestedTitle,
        }),
        verified: false,
      };
    }

    if (!matchResult.resolvedIntent || !matchResult.match) {
      endCalendarOperation({ failed: true });
      const tool = createCalendarToolFailure(
        'CALENDAR_EVENT_NOT_FOUND',
        'Could not resolve calendar update intent.',
      );
      return {
        ...buildCalendarUpdateToolReplyBundle(tool, params.languageCode, {
          referenceNow: params.referenceNow,
          requestedEventTitle: requestedTitle,
        }),
        verified: false,
      };
    }

    const payloadResult = buildCalendarUpdatePayloadFromResolution({
      resolution: matchResult.resolvedIntent,
      languageCode: params.languageCode,
    });

    if (!payloadResult.ok) {
      endCalendarOperation({ failed: true });
      const tool = createCalendarToolFailure(
        'CALENDAR_OPERATION_ERROR',
        payloadResult.detail,
      );
      return {
        ...buildCalendarUpdateToolReplyBundle(tool, params.languageCode, {
          referenceNow: params.referenceNow,
          requestedEventTitle: matchResult.resolvedIntent.requestedEventName,
        }),
        verified: false,
      };
    }

    const integrity = assertResolvedTargetMatchesPayload({
      resolution: matchResult.resolvedIntent,
      payloadEventId: payloadResult.eventId,
      payloadTitle: payloadResult.payload.summary ?? matchResult.resolvedIntent.requestedEventName,
    });

    if (!integrity.ok) {
      endCalendarOperation({ failed: true });
      const tool = createCalendarToolFailure(
        'CALENDAR_OPERATION_ERROR',
        integrity.detail,
      );
      logCalendarMutationVerification({
        intent: 'update_calendar_event',
        verified: false,
        verificationFetched: false,
        eventId: matchResult.match.id,
        detail: 'target_integrity_failed',
      });
      return {
        ...buildCalendarUpdateToolReplyBundle(tool, params.languageCode, {
          referenceNow: params.referenceNow,
          requestedEventTitle: matchResult.resolvedIntent.requestedEventName,
        }),
        verified: false,
      };
    }

    const conflictOutcome = await guardUpdateScheduleConflict({
      languageCode: params.languageCode,
      referenceNow: params.referenceNow,
      transcript: params.transcript,
      matchedTitle: matchResult.resolvedIntent.requestedEventName,
      matchedStartsAt: matchResult.match.startsAt,
      matchedEndsAt: matchResult.match.endsAt,
      payloadResult,
      skipScheduleConflictCheck: params.skipScheduleConflictCheck,
    });

    if (conflictOutcome) {
      return conflictOutcome;
    }

    return executeVerifiedCalendarUpdate({
      languageCode: params.languageCode,
      referenceNow: params.referenceNow,
      payloadResult,
      matchedStartsAt: matchResult.match.startsAt,
      matchedTitle: matchResult.match.title,
      requestedEventTitle: matchResult.resolvedIntent.requestedEventName,
      conflictOverride: params.skipScheduleConflictCheck,
    });
  } catch (error) {
    endCalendarOperation({ failed: true });
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
