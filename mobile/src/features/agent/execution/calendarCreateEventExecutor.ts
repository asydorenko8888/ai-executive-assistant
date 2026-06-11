import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { createGoogleCalendarEvent } from '@/src/features/agent/calendar/googleCalendarWriteService';
import { resolveCalendarWriteAccessState } from '@/src/features/agent/calendar/calendarWriteAccess';
import { buildCalendarCreateEventPayload } from '@/src/features/agent/execution/calendarEventPayloadBuilder';
import type { ActionExecutionResult } from '@/src/features/agent/execution/actionExecutionTypes';
import type { CalendarExecutionState } from '@/src/features/agent/execution/calendarExecutionStates';
import {
  createCalendarToolFailure,
  createCalendarToolPending,
  createCalendarToolSuccess,
  type CalendarToolResponse,
} from '@/src/features/agent/execution/calendarToolContract';
import { buildCalendarCreateDedupeKey } from '@/src/features/agent/calendar/calendarCreateDedupeKey';
import {
  clearPendingCalendarConflictContext,
  endCalendarCreateOperation,
  endCalendarOperation,
  setLastCalendarToolResponse,
  shouldBlockCalendarRecreate,
  tryBeginCalendarCreateOperation,
} from '@/src/features/agent/execution/calendarExecutionSession';
import { resolveAfterEventCreateSchedule } from '@/src/features/agent/calendar/calendarAfterEventSchedule';
import { recordVerifiedCalendarEventContext } from '@/src/features/agent/calendar/calendarMutationEventContext';
import { appendCalendarCreateConflictCheckSkippedNotice } from '@/src/features/agent/calendar/calendarCreateConflictRefreshNotice';
import { blockCalendarMutationOnScheduleConflict } from '@/src/features/agent/calendar/calendarScheduleConflictGuard';
import { computeDayOffsetFromInstant } from '@/src/features/agent/calendarIntelligence/calendarNaturalDateParser';
import { getExecutiveCalendarTimezone } from '@/src/features/agent/calendar/calendarTimezone';
import { refreshCalendarStateAfterCreate } from '@/src/features/agent/calendar/calendarPostCreateRefresh';
import { logCalendarDecision } from '@/src/features/agent/calendar/calendarDecisionLogger';
import { markCalendarWriteAvailableInSession } from '@/src/features/agent/calendar/calendarWriteSession';
import { logCalendarToolPayload, logCalendarGoogleApiResponse } from '@/src/features/agent/calendar/calendarExecutionDebugLog';
import { logCalendarCreate } from '@/src/features/agent/execution/calendarCreateLogger';
import {
  logCalendarMutationStart,
  logCalendarMutationVerification,
} from '@/src/features/agent/calendar/calendarMutationDiagnostics';
import { logExecutionAudit, logCalendarExecutionStateTransition } from '@/src/features/agent/execution/executionAuditLogger';
import { enqueueCalendarCreateAction } from '@/src/features/agent/execution/pendingActionQueue';
import {
  buildCalendarToolReplyBundle,
  type CalendarToolReplyBundle,
} from '@/src/features/agent/execution/calendarToolResponses';
import type { CalendarOperationalUxPhase } from '@/src/features/agent/calendar/calendarOAuthExecutionService';

export type CalendarCreateExecutionParams = {
  transcript: string;
  languageCode: VoiceLanguageCode;
  calendarConnected: boolean;
  referenceNow: Date;
  /** Current user message only — never merged history. */
  titleSourceTranscript?: string;
  skipScheduleConflictCheck?: boolean;
  scheduleOverride?: {
    startMs: number;
    endMs: number;
    explicitDayOffset: number;
  };
};

export type CalendarCreateExecutionOutcome = CalendarToolReplyBundle & {
  result: ActionExecutionResult;
  scheduleIso?: string | null;
  operationalUxPhase?: CalendarOperationalUxPhase;
  pendingActionId?: string;
  verified: boolean;
};

function mapUxPhase(state: CalendarExecutionState): CalendarOperationalUxPhase {
  if (state === 'authenticating') {
    return 'connecting';
  }

  if (state === 'verifying_event') {
    return 'verifying_event';
  }

  if (state === 'creating_event') {
    return 'creating_event';
  }

  if (state === 'success') {
    return 'event_created';
  }

  if (state === 'failed') {
    return 'failed';
  }

  return 'idle';
}

function mapToolToActionResult(tool: CalendarToolResponse): ActionExecutionResult {
  return {
    status: tool.status === 'SUCCESS' ? 'success' : tool.status === 'PENDING' ? 'pending' : 'failed',
    tool: 'google_calendar_create_event',
    verified: tool.verified,
    errorCode: tool.errorCode,
    errorMessage: tool.error,
    event: tool.event,
  };
}

function finalizeOutcome(
  bundle: CalendarToolReplyBundle,
  scheduleIso: string | null,
  pendingActionId?: string,
): CalendarCreateExecutionOutcome {
  setLastCalendarToolResponse(bundle.tool);

  return {
    ...bundle,
    result: mapToolToActionResult(bundle.tool),
    scheduleIso,
    operationalUxPhase: mapUxPhase(bundle.executionState),
    pendingActionId,
    verified: bundle.tool.verified,
  };
}

export async function executeCalendarCreateEvent(
  params: CalendarCreateExecutionParams,
): Promise<CalendarCreateExecutionOutcome> {
  logCalendarCreate('routing', {
    action: 'executeCalendarCreateEvent',
    transcriptPreview: params.transcript.slice(0, 120),
  });
  logCalendarMutationStart({
    intent: 'create_calendar_event',
    originalCommand: params.titleSourceTranscript ?? params.transcript,
  });
  logExecutionAudit('request', { transcriptPreview: params.transcript.slice(0, 120) });

  logExecutionAudit('parsed_intent', { stage: 'parsing' });
  logCalendarExecutionStateTransition({
    from: 'parsing',
    to: 'parsing',
    tool: 'google_calendar_create_event',
  });

  const afterEventSchedule = await resolveAfterEventCreateSchedule({
    transcript: params.transcript,
    referenceNow: params.referenceNow,
  });

  if (afterEventSchedule.ok === false && afterEventSchedule.reason === 'ambiguous') {
    const tool = createCalendarToolFailure(
      'CALENDAR_EVENT_AMBIGUOUS',
      'Multiple events match the anchor event. Please specify which one.',
    );
    endCalendarOperation({ failed: true });
    return finalizeOutcome(
      buildCalendarToolReplyBundle(tool, params.languageCode, { referenceNow: params.referenceNow }),
      null,
    );
  }

  const timeZone = getExecutiveCalendarTimezone();
  const scheduleOverride =
    params.scheduleOverride ??
    (afterEventSchedule.ok === true
      ? {
          startMs: afterEventSchedule.startMs,
          endMs: afterEventSchedule.endMs,
          explicitDayOffset: computeDayOffsetFromInstant(
            params.referenceNow,
            afterEventSchedule.startMs,
            timeZone,
          ),
        }
      : undefined);

  const payloadResult = buildCalendarCreateEventPayload({
    transcript: params.transcript,
    titleSourceTranscript: params.titleSourceTranscript ?? params.transcript,
    languageCode: params.languageCode,
    referenceNow: params.referenceNow,
    scheduleOverride,
  });

  if (!payloadResult.ok) {
    const tool = createCalendarToolFailure(
      payloadResult.reason === 'past_time_needs_clarification'
        ? 'CALENDAR_SCHEDULE_IN_PAST'
        : 'CALENDAR_DATE_PARSE_FAILED',
      payloadResult.detail,
    );
    endCalendarOperation({ failed: true });
    return finalizeOutcome(
      buildCalendarToolReplyBundle(tool, params.languageCode, { referenceNow: params.referenceNow }),
      null,
    );
  }

  const dedupeKey = buildCalendarCreateDedupeKey({
    title: payloadResult.payload.summary,
    startMs: payloadResult.startMs,
    timeZone,
  });

  if (shouldBlockCalendarRecreate(dedupeKey)) {
    const blocked = createCalendarToolFailure(
      'CALENDAR_MAX_RETRIES_EXCEEDED',
      'Calendar create already attempted for this request.',
    );
    return finalizeOutcome(
      buildCalendarToolReplyBundle(blocked, params.languageCode, { referenceNow: params.referenceNow }),
      null,
    );
  }

  logCalendarToolPayload({
    summary: payloadResult.payload.summary,
    start: payloadResult.payload.start,
    end: payloadResult.payload.end,
    scheduleIso: payloadResult.scheduleIso ?? null,
  });

  const conflictGate = await blockCalendarMutationOnScheduleConflict({
    operation: 'create',
    sourceTranscript: params.transcript,
    titleSourceTranscript: params.titleSourceTranscript ?? params.transcript,
    languageCode: params.languageCode,
    proposedTitle: payloadResult.payload.summary,
    proposedStartMs: payloadResult.startMs,
    proposedEndMs: payloadResult.endMs,
    referenceNow: params.referenceNow,
    skipScheduleConflictCheck: params.skipScheduleConflictCheck,
  });
  const conflictCheckSkippedDueToRefreshFailure =
    conflictGate.skippedConflictCheckDueToRefreshFailure ?? false;

  if (conflictCheckSkippedDueToRefreshFailure) {
    console.log('[Calendar Conflict Refresh]', {
      stage: 'pre_create_conflict_check_skipped',
      reason: 'calendar_refresh_failed',
    });
  }

  if (conflictGate.block) {
    endCalendarCreateOperation({ dedupeKey, failed: true });

    return {
      ...buildCalendarToolReplyBundle(conflictGate.block.tool, params.languageCode, {
        referenceNow: params.referenceNow,
      }),
      result: mapToolToActionResult(conflictGate.block.tool),
      scheduleIso: payloadResult.scheduleIso,
      verified: false,
      reply: conflictGate.block.reply,
      spokenReply: conflictGate.block.spokenReply,
      executionState: 'failed',
    };
  }

  const access = await resolveCalendarWriteAccessState();

  logCalendarDecision('writeAvailable', {
    canReadCalendar: access.canReadCalendar,
    canWriteCalendar: access.canWriteCalendar,
    inSync: access.inSync,
  });
  logCalendarDecision('writeScope', {
    scopes: access.scopes,
    hasCalendarEventsScope: access.hasCalendarEventsScope,
  });

  if (!access.canWriteCalendar) {
    logCalendarDecision('reasonForRefusal', {
      reason: access.canReadCalendar ? 'write_scope_missing' : 'calendar_not_connected',
      desyncReason: access.capabilities.desyncReason ?? null,
    });

    if (!access.canReadCalendar) {
      await enqueueCalendarCreateAction({
        payload: payloadResult.payload,
        transcript: params.transcript,
        languageCode: params.languageCode,
      });

      const tool = createCalendarToolPending('CALENDAR_AUTH_REQUIRED', 'CALENDAR_AUTH_REQUIRED');
      endCalendarCreateOperation({ dedupeKey, failed: false });
      return finalizeOutcome(
        buildCalendarToolReplyBundle(tool, params.languageCode, { referenceNow: params.referenceNow }),
        payloadResult.scheduleIso,
      );
    }

    const tool = createCalendarToolFailure(
      'WRITE_SCOPE_MISSING',
      'WRITE_SCOPE_MISSING: reconnect Google Calendar and grant event write access (calendar.events).',
    );
    endCalendarCreateOperation({ dedupeKey, failed: true });
    return finalizeOutcome(
      buildCalendarToolReplyBundle(tool, params.languageCode, { referenceNow: params.referenceNow }),
      payloadResult.scheduleIso,
    );
  }

  if (!tryBeginCalendarCreateOperation(dedupeKey)) {
    logCalendarDecision('reasonForRefusal', {
      reason: 'create_dedupe_blocked',
      dedupeKey,
    });

    const tool = createCalendarToolFailure(
      'CALENDAR_MAX_RETRIES_EXCEEDED',
      'Calendar create already attempted for this request.',
    );
    return finalizeOutcome(
      buildCalendarToolReplyBundle(tool, params.languageCode, { referenceNow: params.referenceNow }),
      payloadResult.scheduleIso,
    );
  }

  logCalendarExecutionStateTransition({
    from: 'parsing',
    to: 'creating_event',
    tool: 'google_calendar_create_event',
  });

  let tool: CalendarToolResponse;

  try {
    logCalendarCreate('start/end', {
      start: payloadResult.payload.start.dateTime,
      end: payloadResult.payload.end.dateTime,
      timeZone: payloadResult.payload.start.timeZone,
    });
    logCalendarCreate('insert started', {
      summary: payloadResult.payload.summary,
      start: payloadResult.payload.start,
    });
    tool = await createGoogleCalendarEvent(payloadResult.payload, params.languageCode);
    logCalendarCreate('insert result', {
      status: tool.status,
      errorCode: tool.errorCode ?? null,
      eventId: tool.eventId ?? null,
      verified: tool.verified,
    });
    logCalendarCreate('verification result', {
      verified: tool.verified,
      eventId: tool.eventId ?? null,
      errorCode: tool.errorCode ?? null,
    });

    if (tool.status === 'FAILURE' && tool.errorCode === 'GOOGLE_CALENDAR_NOT_CONNECTED') {
      await enqueueCalendarCreateAction({
        payload: payloadResult.payload,
        transcript: params.transcript,
        languageCode: params.languageCode,
      });
      tool = createCalendarToolPending('CALENDAR_AUTH_REQUIRED', 'CALENDAR_AUTH_REQUIRED');
      endCalendarCreateOperation({ dedupeKey, failed: false });
      return finalizeOutcome(
        buildCalendarToolReplyBundle(tool, params.languageCode, { referenceNow: params.referenceNow }),
        payloadResult.scheduleIso,
      );
    }

    if (tool.status === 'FAILURE') {
      endCalendarCreateOperation({ dedupeKey, failed: true });
      return finalizeOutcome(
        buildCalendarToolReplyBundle(tool, params.languageCode, { referenceNow: params.referenceNow }),
        payloadResult.scheduleIso,
      );
    }

    if (tool.status === 'PENDING') {
      endCalendarCreateOperation({ dedupeKey, failed: false });
      return finalizeOutcome(
        buildCalendarToolReplyBundle(tool, params.languageCode, { referenceNow: params.referenceNow }),
        payloadResult.scheduleIso,
      );
    }

    if (tool.status === 'SUCCESS' && !tool.verified) {
      endCalendarCreateOperation({ dedupeKey, failed: true });
      const unverified = createCalendarToolFailure(
        'VERIFY_FAILED',
        'Google Calendar did not confirm the created event.',
      );
      logCalendarMutationVerification({
        intent: 'create_calendar_event',
        verified: false,
        verificationFetched: tool.verificationFetched,
        eventId: tool.eventId ?? null,
        detail: 'unverified_success',
      });
      return finalizeOutcome(
        buildCalendarToolReplyBundle(unverified, params.languageCode, { referenceNow: params.referenceNow }),
        payloadResult.scheduleIso,
      );
    }

    logCalendarExecutionStateTransition({
      from: 'creating_event',
      to: 'success',
      tool: 'google_calendar_create_event',
      detail: tool.eventId,
    });

    clearPendingCalendarConflictContext();
    endCalendarOperation({ failed: false, createdEventId: tool.eventId ?? null });

    logCalendarMutationVerification({
      intent: 'create_calendar_event',
      verified: tool.status === 'SUCCESS' && tool.verified,
      verificationFetched: tool.verificationFetched,
      eventId: tool.eventId ?? null,
      detail: tool.status === 'SUCCESS' && !tool.verified ? 'unverified_success' : undefined,
    });

    if (tool.status === 'SUCCESS' && tool.eventId && tool.event) {
      markCalendarWriteAvailableInSession();
      logCalendarDecision('createAttemptSucceeded', {
        eventId: tool.eventId,
        verified: tool.verified,
      });

      logCalendarCreate('inserted eventId', { eventId: tool.eventId });

      const refresh = await refreshCalendarStateAfterCreate({
        eventId: tool.eventId,
        userTranscript: params.transcript,
        extractedTitle: payloadResult.payload.summary,
        startIso: tool.event.startsAt,
        endIso: tool.event.endsAt,
        referenceNow: params.referenceNow,
      }).catch((refreshError) => {
        console.log('[Calendar Refresh] post-create refresh failed', refreshError);
        return null;
      });

      if (refresh?.verifiedEvent) {
        tool = {
          ...tool,
          event: {
            id: refresh.verifiedEvent.id,
            summary: refresh.verifiedEvent.title,
            startsAt: refresh.verifiedEvent.startsAt,
            endsAt: refresh.verifiedEvent.endsAt,
            location: refresh.verifiedEvent.location ?? tool.event.location,
            htmlLink: tool.event.htmlLink,
          },
        };
      }

      if (tool.verified && tool.event && tool.eventId) {
        await recordVerifiedCalendarEventContext({
          eventId: tool.eventId,
          title: tool.event.summary ?? payloadResult.payload.summary,
          startISO: tool.event.startsAt,
          endISO: tool.event.endsAt,
          actionType: 'create',
          recurrenceRrule: payloadResult.payload.recurrence?.[0] ?? null,
          clearPendingReason: 'create_completed',
          referenceNow: params.referenceNow,
          languageCode: params.languageCode,
        });
      }
    }

    const bundle = buildCalendarToolReplyBundle(tool, params.languageCode, {
      referenceNow: params.referenceNow,
    });

    if (conflictCheckSkippedDueToRefreshFailure && tool.status === 'SUCCESS') {
      const withNotice = appendCalendarCreateConflictCheckSkippedNotice({
        reply: bundle.reply,
        spokenReply: bundle.spokenReply,
        languageCode: params.languageCode,
      });

      return finalizeOutcome(
        {
          ...bundle,
          reply: withNotice.reply,
          spokenReply: withNotice.spokenReply,
        },
        payloadResult.scheduleIso,
      );
    }

    return finalizeOutcome(bundle, payloadResult.scheduleIso);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Calendar operation error';
    tool = createCalendarToolFailure('CALENDAR_OPERATION_ERROR', message);
    endCalendarCreateOperation({ dedupeKey, failed: true });
    return finalizeOutcome(
      buildCalendarToolReplyBundle(tool, params.languageCode, { referenceNow: params.referenceNow }),
      payloadResult.scheduleIso,
    );
  }
}

export function buildOutcomeFromVerifiedBackendEvent(
  languageCode: VoiceLanguageCode,
  event: NonNullable<ActionExecutionResult['event']>,
  referenceNow?: Date,
) {
  const tool = createCalendarToolSuccess(event);
  return finalizeOutcome(
    buildCalendarToolReplyBundle(tool, languageCode, { referenceNow }),
    null,
  );
}

export function buildSuccessReplyFromVerifiedEvent(
  languageCode: VoiceLanguageCode,
  event: NonNullable<ActionExecutionResult['event']>,
) {
  return buildOutcomeFromVerifiedBackendEvent(languageCode, event).reply;
}
