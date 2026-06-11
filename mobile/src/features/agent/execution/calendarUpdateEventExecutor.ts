import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { fetchCalendarEventsForMutationSearch } from '@/src/features/agent/calendar/calendarMutationEventSearch';
import { findCalendarEventForUpdate } from '@/src/features/agent/calendar/calendarEventMatcher';
import { getActiveCalendarEvent } from '@/src/features/agent/calendar/calendarActiveEventContext';
import { resolveMoveEventReference } from '@/src/features/agent/calendar/calendarConversationEventMemory';
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
import { ensureVisibleCalendarMoveReply } from '@/src/features/agent/calendar/calendarMoveExceptionReply';
import { recordVerifiedCalendarEventContext } from '@/src/features/agent/calendar/calendarMutationEventContext';
import { clearPendingCalendarState } from '@/src/features/agent/calendar/calendarPendingStateLifecycle';
import { blockCalendarMutationOnScheduleConflict } from '@/src/features/agent/calendar/calendarScheduleConflictGuard';
import { updateGoogleCalendarEvent } from '@/src/features/agent/calendar/googleCalendarUpdateService';
import { resolveCalendarWriteAccessState } from '@/src/features/agent/calendar/calendarWriteAccess';
import { logCalendarDecision } from '@/src/features/agent/calendar/calendarDecisionLogger';
import {
  logCalendarMoveTargetEvent,
  logCalendarMoveWorkflow,
} from '@/src/features/agent/calendar/calendarMoveWorkflowLogger';
import {
  logCalendarExecutionBlocked,
  logCalendarMoveEventSelected,
  logCalendarMoveExecutorCalled,
  logCalendarMoveTargetTimeResolved,
  logCalendarPendingActionCreated,
  logCalendarUpdateExecutorStarted,
} from '@/src/features/agent/calendar/calendarMoveTraceLogger';
import {
  logCalendarUpdateFailed,
  logCalendarUpdateIntent,
  logUpdateExecutionStarted,
} from '@/src/features/agent/calendar/calendarUpdateLogger';
import { assertResolvedTargetMatchesPayload } from '@/src/features/agent/calendar/calendarUpdateEventResolution';
import {
  buildCalendarUpdateEventPayload,
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
  getPendingCalendarUpdateContext,
  setPendingCalendarUpdateContext,
  tryBeginCalendarOperation,
} from '@/src/features/agent/execution/calendarExecutionSession';

export type CalendarUpdateExecutionParams = {
  transcript: string;
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
  skipScheduleConflictCheck?: boolean;
  storedUpdateTarget?: CalendarStoredUpdateTarget;
  selectedEventId?: string | null;
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
  endOperation: (failed: boolean, failureReason?: string | null) => void;
}): Promise<CalendarUpdateExecutionOutcome | null> {
  const matchedStartMs = Date.parse(params.matchedStartsAt);
  const matchedEndMs = Date.parse(params.matchedEndsAt);
  const durationMs = Math.max(matchedEndMs - matchedStartMs, 30 * 60_000);
  const proposedEndMs = params.payloadResult.toMs + durationMs;

  const conflictGate = await blockCalendarMutationOnScheduleConflict({
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

  if (!conflictGate.block) {
    if (conflictGate.skippedConflictCheckDueToRefreshFailure) {
      console.log('[Calendar Conflict Refresh]', {
        stage: 'pre_update_conflict_check_skipped',
        reason: 'calendar_refresh_failed',
      });
    }

    return null;
  }

  params.endOperation(true, 'schedule_conflict_blocked');
  logCalendarMoveWorkflow('MOVE_COMPLETE', {
    success: false,
    reason: 'schedule_conflict_blocked',
  });

  return {
    ...buildCalendarUpdateToolReplyBundle(conflictGate.block.tool, params.languageCode, {
      referenceNow: params.referenceNow,
    }),
    reply: conflictGate.block.reply,
    spokenReply: conflictGate.block.spokenReply,
    verified: false,
  };
}

async function executeVerifiedCalendarUpdate(params: {
  languageCode: VoiceLanguageCode;
  referenceNow: Date;
  payloadResult: Extract<CalendarUpdatePayloadBuildResult, { ok: true }>;
  matchedStartsAt: string;
  matchedEndsAt: string;
  matchedTitle: string;
  requestedEventTitle?: string | null;
  conflictOverride?: boolean;
  endOperation: (failed: boolean, failureReason?: string | null) => void;
}): Promise<CalendarUpdateExecutionOutcome> {
  logCalendarUpdateIntent({
    eventId: params.payloadResult.eventId,
    title: params.matchedTitle,
    toMs: params.payloadResult.toMs,
  });

  logCalendarMoveTargetEvent({
    eventId: params.payloadResult.eventId,
    title: params.matchedTitle,
    startsAt: params.matchedStartsAt,
    endsAt: params.matchedEndsAt,
  });

  logCalendarMoveEventSelected({
    eventId: params.payloadResult.eventId,
    title: params.matchedTitle,
    startsAt: params.matchedStartsAt,
    endsAt: params.matchedEndsAt,
  });

  logCalendarMoveTargetTimeResolved({
    eventId: params.payloadResult.eventId,
    requestedStart: params.payloadResult.payload.start.dateTime ?? '',
    requestedEnd: params.payloadResult.payload.end.dateTime ?? '',
  });

  try {
    logCalendarMoveExecutorCalled({
      executor: 'updateGoogleCalendarEvent',
      transcript: params.payloadResult.payload.summary ?? params.matchedTitle,
    });

    const tool: CalendarToolResponse = await updateGoogleCalendarEvent(
      params.payloadResult.eventId,
      params.payloadResult.payload,
      { originalStartsAt: params.matchedStartsAt, languageCode: params.languageCode },
    );

    logCalendarMoveWorkflow('MOVE_VERIFY_RESULT', {
      status: tool.status,
      verified: tool.verified ?? false,
      verificationFetched: tool.verificationFetched ?? false,
      eventId: tool.eventId ?? params.payloadResult.eventId,
      errorCode: tool.errorCode ?? null,
    });

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
        toStart: tool.event?.startsAt ?? params.matchedStartsAt,
      });
      clearPendingCalendarUpdateIntent();
      clearPendingCalendarConflictContext();
      params.endOperation(false);
      if (tool.eventId && tool.event) {
        await recordVerifiedCalendarEventContext({
          eventId: tool.eventId,
          title: tool.event.summary ?? params.matchedTitle,
          startISO: tool.event.startsAt,
          endISO: tool.event.endsAt,
          actionType: 'update',
          clearPendingReason: 'update_completed',
          referenceNow: params.referenceNow,
          languageCode: params.languageCode,
          previousStartISO: params.matchedStartsAt,
        });
      } else {
        clearPendingCalendarState('update_completed_without_event_payload');
      }
      logCalendarMutationVerification({
        intent: 'update_calendar_event',
        verified: true,
        verificationFetched: tool.verificationFetched,
        eventId: tool.eventId ?? null,
      });
      logCalendarMoveWorkflow('MOVE_VERIFY_SUCCESS', {
        eventId: tool.eventId ?? params.payloadResult.eventId,
      });
      logCalendarMoveWorkflow('MOVE_COMPLETE', {
        success: true,
        eventId: tool.eventId ?? params.payloadResult.eventId,
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
      params.endOperation(true);
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
      logCalendarMoveWorkflow('MOVE_COMPLETE', {
        success: false,
        reason: 'verification_failed',
        eventId: params.payloadResult.eventId,
      });
      return {
        ...buildCalendarUpdateToolReplyBundle(unverified, params.languageCode, {
          referenceNow: params.referenceNow,
        }),
        verified: false,
      };
    }

    params.endOperation(true);
    logCalendarUpdateFailed({
      reason: 'executor_tool_failure',
      errorCode: tool.errorCode ?? null,
      error: tool.error ?? null,
    });
    logCalendarMoveWorkflow('MOVE_FAILED', {
      reason: tool.errorCode ?? 'tool_failure',
      eventId: params.payloadResult.eventId,
    });
    logCalendarMoveWorkflow('MOVE_COMPLETE', {
      success: false,
      reason: tool.errorCode ?? 'tool_failure',
      eventId: params.payloadResult.eventId,
    });
    return {
      ...buildCalendarUpdateToolReplyBundle(tool, params.languageCode, {
        referenceNow: params.referenceNow,
      }),
      verified: false,
    };
  } catch (error) {
    params.endOperation(true);
    logCalendarUpdateFailed({
      reason: 'verified_update_exception',
      message: error instanceof Error ? error.message : 'Calendar update error',
    });
    const message = error instanceof Error ? error.message : 'Calendar update error';
    const failureTool = createCalendarToolFailure('CALENDAR_OPERATION_ERROR', message);
    logCalendarMoveWorkflow('MOVE_COMPLETE', {
      success: false,
      reason: 'verified_update_exception',
      eventId: params.payloadResult.eventId,
    });
    return {
      ...buildCalendarUpdateToolReplyBundle(failureTool, params.languageCode, {
        referenceNow: params.referenceNow,
      }),
      verified: false,
    };
  }
}

export type CalendarUpdateExecutionOutcome = CalendarUpdateToolReplyBundle & {
  verified: boolean;
};

export async function executeCalendarUpdateEvent(
  params: CalendarUpdateExecutionParams,
): Promise<CalendarUpdateExecutionOutcome> {
  try {
    return await executeCalendarUpdateEventUnsafe(params);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'неизвестная ошибка';

    logCalendarMoveWorkflow('MOVE_EXCEPTION', {
      phase: 'executeCalendarUpdateEvent',
      reason,
      transcriptPreview: params.transcript.slice(0, 120),
    });

    const failureTool = createCalendarToolFailure('CALENDAR_OPERATION_ERROR', reason);
    const bundle = buildCalendarUpdateToolReplyBundle(failureTool, params.languageCode, {
      referenceNow: params.referenceNow,
    });
    const reply = ensureVisibleCalendarMoveReply({
      reply: bundle.reply,
      languageCode: params.languageCode,
      fallbackReason: reason,
    });

    return {
      ...bundle,
      reply,
      spokenReply: reply,
      verified: false,
    };
  }
}

async function executeCalendarUpdateEventUnsafe(
  params: CalendarUpdateExecutionParams,
): Promise<CalendarUpdateExecutionOutcome> {
  logCalendarUpdateExecutorStarted({
    transcript: params.transcript,
    selectedEventId: params.selectedEventId ?? null,
    storedUpdateTargetId: params.storedUpdateTarget?.eventId ?? null,
  });
  logCalendarMoveExecutorCalled({
    executor: 'executeCalendarUpdateEvent',
    transcript: params.transcript,
  });
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
      : params.selectedEventId
        ? `selected-update:${params.selectedEventId}`
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

  let operationEnded = false;
  const endOperation = (failed: boolean, failureReason?: string | null) => {
    if (!operationEnded) {
      endCalendarOperation({
        failed,
        failureReason: failureReason ?? null,
      });
      operationEnded = true;
    }
  };

  logCalendarMoveWorkflow('MOVE_START', {
    transcript: params.transcript.slice(0, 120),
    storedUpdateTarget: params.storedUpdateTarget?.eventId ?? null,
    selectedEventId: params.selectedEventId ?? null,
  });

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
        endOperation(true);
        logCalendarMoveWorkflow('MOVE_COMPLETE', {
          success: false,
          reason: payloadResult.reason,
        });
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
        endOperation,
      });

      if (conflictOutcome) {
        return conflictOutcome;
      }

      return await executeVerifiedCalendarUpdate({
        languageCode: params.languageCode,
        referenceNow: params.referenceNow,
        payloadResult,
        matchedStartsAt: params.storedUpdateTarget.originalStartsAt,
        matchedEndsAt: params.storedUpdateTarget.originalEndsAt,
        matchedTitle: params.storedUpdateTarget.title,
        endOperation,
      });
    }

    if (params.selectedEventId) {
      logCalendarMoveWorkflow('MOVE_EVENT_SELECTED', {
        eventId: params.selectedEventId,
      });
      const pendingUpdate = getPendingCalendarUpdateContext();
      const scheduleTranscript = pendingUpdate?.sourceTranscript.trim() || params.transcript;
      const memoryRef = getActiveCalendarEvent(params.referenceNow) ?? resolveMoveEventReference(params.referenceNow);
      const { events, fetchOk } = await fetchCalendarEventsForMutationSearch({
        referenceNow: params.referenceNow,
        transcript: scheduleTranscript,
        memoryRef,
      });

      if (!fetchOk) {
        endCalendarOperation({ failed: true });
        const tool = createCalendarToolFailure(
          'CALENDAR_READ_FAILED',
          'Could not refresh Google Calendar before update.',
        );
        return {
          ...buildCalendarUpdateToolReplyBundle(tool, params.languageCode, {
            referenceNow: params.referenceNow,
          }),
          verified: false,
        };
      }

      const matchedEvent = events.find((event) => event.id === params.selectedEventId) ?? null;

      if (!matchedEvent) {
        endCalendarOperation({ failed: true });
        const tool = createCalendarToolFailure(
          'CALENDAR_EVENT_NOT_FOUND',
          'Could not find the selected calendar event to update.',
        );
        return {
          ...buildCalendarUpdateToolReplyBundle(tool, params.languageCode, {
            referenceNow: params.referenceNow,
          }),
          verified: false,
        };
      }

      const payloadResult = buildCalendarUpdateEventPayload({
        transcript: scheduleTranscript,
        languageCode: params.languageCode,
        referenceNow: params.referenceNow,
        matchedEvent,
      });

      if (!payloadResult.ok) {
        endOperation(true);
        logCalendarMoveWorkflow('MOVE_COMPLETE', {
          success: false,
          reason: payloadResult.reason,
        });
        const tool = createCalendarToolFailure(
          payloadResult.reason === 'date_parse_failed'
            ? 'CALENDAR_DATE_PARSE_FAILED'
            : payloadResult.reason === 'no_time_change'
              ? 'CALENDAR_NO_TIME_CHANGE'
              : payloadResult.reason === 'title_parse_failed'
                ? 'CALENDAR_DATE_PARSE_FAILED'
                : 'CALENDAR_EVENT_NOT_FOUND',
          payloadResult.detail,
        );
        return {
          ...buildCalendarUpdateToolReplyBundle(tool, params.languageCode, {
            referenceNow: params.referenceNow,
            requestedEventTitle: matchedEvent.title,
          }),
          verified: false,
        };
      }

      const conflictOutcome = await guardUpdateScheduleConflict({
        languageCode: params.languageCode,
        referenceNow: params.referenceNow,
        transcript: scheduleTranscript,
        matchedTitle: matchedEvent.title,
        matchedStartsAt: matchedEvent.startsAt,
        matchedEndsAt: matchedEvent.endsAt,
        payloadResult,
        skipScheduleConflictCheck: params.skipScheduleConflictCheck,
        endOperation,
      });

      if (conflictOutcome) {
        return conflictOutcome;
      }

      return await executeVerifiedCalendarUpdate({
        languageCode: params.languageCode,
        referenceNow: params.referenceNow,
        payloadResult,
        matchedStartsAt: matchedEvent.startsAt,
        matchedEndsAt: matchedEvent.endsAt,
        matchedTitle: matchedEvent.title,
        endOperation,
      });
    }

    const matchResult = await findCalendarEventForUpdate({
      transcript: params.transcript,
      referenceNow: params.referenceNow,
    });

    const requestedTitle =
      matchResult.requestedEventName ?? matchResult.titleQuery ?? null;

    if (!matchResult.fetchOk) {
      endOperation(true);
      logCalendarMoveWorkflow('MOVE_COMPLETE', {
        success: false,
        reason: 'event_search_fetch_failed',
      });
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
      const reason = matchResult.resolutionFailureReason;

      logCalendarExecutionBlocked({
        reason,
        intent: 'update_calendar_event',
        eventId: matchResult.match?.id ?? null,
        title: requestedTitle ?? matchResult.match?.title ?? null,
        transcript: params.transcript,
        source: 'executeCalendarUpdateEvent',
      });

      if (reason === 'ambiguous') {
        endOperation(false);
        const extracted = extractCalendarUpdateParameters(params.transcript, params.referenceNow);
        const candidates = calendarEventsToDisambiguationCandidates(matchResult.candidates);
        const pendingUpdate = {
          ...pendingContextFromExtraction({
            sourceTranscript: params.transcript,
            extraction: extracted,
            referenceNow: params.referenceNow,
          }),
          candidates,
        };
        setPendingCalendarUpdateContext(pendingUpdate);
        logCalendarPendingActionCreated({
          action: 'move',
          sourceTranscript: params.transcript,
          title: extracted.title,
          candidateCount: candidates.length,
          candidateEventIds: candidates.map((candidate) => candidate.eventId),
          toStartISO: extracted.toStartISO,
        });
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
        logCalendarMoveWorkflow('MOVE_COMPLETE', {
          success: false,
          reason: 'ambiguous_candidates',
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
        endOperation(true);
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
        logCalendarMoveWorkflow('MOVE_COMPLETE', {
          success: false,
          reason: 'no_time_change',
        });
        return {
          ...buildCalendarUpdateToolReplyBundle(tool, params.languageCode, {
            referenceNow: params.referenceNow,
            requestedEventTitle: requestedTitle ?? matchResult.match.title,
          }),
          verified: false,
        };
      }

      if (reason === 'time_parse_failed') {
        endOperation(true);
        const tool = createCalendarToolFailure(
          'CALENDAR_DATE_PARSE_FAILED',
          matchResult.resolutionDetail ?? 'Could not parse destination time.',
        );
        logCalendarMoveWorkflow('MOVE_COMPLETE', {
          success: false,
          reason: 'time_parse_failed',
        });
        return {
          ...buildCalendarUpdateToolReplyBundle(tool, params.languageCode, {
            referenceNow: params.referenceNow,
            requestedEventTitle: requestedTitle,
          }),
          verified: false,
        };
      }

      endOperation(true);

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
      logCalendarMoveWorkflow('MOVE_COMPLETE', {
        success: false,
        reason,
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
      endOperation(true);
      logCalendarMoveWorkflow('MOVE_COMPLETE', {
        success: false,
        reason: 'unresolved_intent',
      });
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
      endOperation(true);
      logCalendarMoveWorkflow('MOVE_COMPLETE', {
        success: false,
        reason: 'payload_build_failed',
      });
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

    logCalendarMoveWorkflow('MOVE_NEW_TIME_PARSED', {
      eventId: payloadResult.eventId,
      toMs: payloadResult.toMs,
      start: payloadResult.payload.start.dateTime ?? null,
      end: payloadResult.payload.end.dateTime ?? null,
    });

    const integrity = assertResolvedTargetMatchesPayload({
      resolution: matchResult.resolvedIntent,
      payloadEventId: payloadResult.eventId,
      payloadTitle: payloadResult.payload.summary ?? matchResult.resolvedIntent.requestedEventName,
    });

    if (!integrity.ok) {
      endOperation(true);
      logCalendarMoveWorkflow('MOVE_COMPLETE', {
        success: false,
        reason: 'target_integrity_failed',
      });
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
      endOperation,
    });

    if (conflictOutcome) {
      return conflictOutcome;
    }

    return await executeVerifiedCalendarUpdate({
      languageCode: params.languageCode,
      referenceNow: params.referenceNow,
      payloadResult,
      matchedStartsAt: matchResult.match.startsAt,
      matchedEndsAt: matchResult.match.endsAt,
      matchedTitle: matchResult.match.title,
      requestedEventTitle: matchResult.resolvedIntent.requestedEventName,
      conflictOverride: params.skipScheduleConflictCheck,
      endOperation,
    });
  } catch (error) {
    endOperation(true);
    logCalendarUpdateFailed({
      reason: 'executor_exception',
      message: error instanceof Error ? error.message : 'Calendar update error',
    });
    const message = error instanceof Error ? error.message : 'Calendar update error';
    const failureTool = createCalendarToolFailure('CALENDAR_OPERATION_ERROR', message);
    logCalendarMoveWorkflow('MOVE_COMPLETE', {
      success: false,
      reason: 'executor_exception',
    });
    return {
      ...buildCalendarUpdateToolReplyBundle(failureTool, params.languageCode, {
        referenceNow: params.referenceNow,
      }),
      verified: false,
    };
  } finally {
    if (!operationEnded) {
      endOperation(true, 'operation_lock_leaked');
      logCalendarMoveWorkflow('MOVE_COMPLETE', {
        success: false,
        reason: 'operation_lock_leaked',
      });
    }
  }
}
