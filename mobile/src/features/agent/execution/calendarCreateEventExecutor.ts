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
import {
  endCalendarOperation,
  setLastCalendarToolResponse,
  shouldBlockCalendarRecreate,
  tryBeginCalendarOperation,
} from '@/src/features/agent/execution/calendarExecutionSession';
import { refreshCalendarStateAfterCreate } from '@/src/features/agent/calendar/calendarPostCreateRefresh';
import { logCalendarDecision } from '@/src/features/agent/calendar/calendarDecisionLogger';
import { markCalendarWriteAvailableInSession } from '@/src/features/agent/calendar/calendarWriteSession';
import { logCalendarCreate } from '@/src/features/agent/execution/calendarCreateLogger';
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
  logExecutionAudit('request', { transcriptPreview: params.transcript.slice(0, 120) });

  if (shouldBlockCalendarRecreate(params.transcript)) {
    const blocked = createCalendarToolFailure(
      'CALENDAR_MAX_RETRIES_EXCEEDED',
      'Calendar create already attempted for this request.',
    );
    return finalizeOutcome(
      buildCalendarToolReplyBundle(blocked, params.languageCode, { referenceNow: params.referenceNow }),
      null,
    );
  }

  logExecutionAudit('parsed_intent', { stage: 'parsing' });
  logCalendarExecutionStateTransition({
    from: 'parsing',
    to: 'parsing',
    tool: 'google_calendar_create_event',
  });

  const payloadResult = buildCalendarCreateEventPayload({
    transcript: params.transcript,
    languageCode: params.languageCode,
    referenceNow: params.referenceNow,
  });

  if (!payloadResult.ok) {
    const tool = createCalendarToolFailure('CALENDAR_DATE_PARSE_FAILED', payloadResult.detail);
    endCalendarOperation({ failed: true });
    return finalizeOutcome(
      buildCalendarToolReplyBundle(tool, params.languageCode, { referenceNow: params.referenceNow }),
      null,
    );
  }

  const access = await resolveCalendarWriteAccessState();

  logCalendarDecision('writeAvailable', {
    connected: access.connected,
    writeEnabled: access.writeEnabled,
  });
  logCalendarDecision('writeScope', {
    scopes: access.scopes,
    hasCalendarEventsScope: access.hasCalendarEventsScope,
  });

  if (!access.writeEnabled) {
    logCalendarDecision('reasonForRefusal', {
      reason: 'write_scope_missing',
    });
    const tool = createCalendarToolFailure(
      'WRITE_SCOPE_MISSING',
      'WRITE_SCOPE_MISSING: reconnect Google Calendar and grant event write access (calendar.events).',
    );
    endCalendarOperation({ failed: true });
    return finalizeOutcome(
      buildCalendarToolReplyBundle(tool, params.languageCode, { referenceNow: params.referenceNow }),
      payloadResult.scheduleIso,
    );
  }

  if (!access.connected) {
    await enqueueCalendarCreateAction({
      payload: payloadResult.payload,
      transcript: params.transcript,
      languageCode: params.languageCode,
    });

    const tool = createCalendarToolPending('CALENDAR_AUTH_REQUIRED', 'CALENDAR_AUTH_REQUIRED');
    endCalendarOperation({ failed: false });
    return finalizeOutcome(
      buildCalendarToolReplyBundle(tool, params.languageCode, { referenceNow: params.referenceNow }),
      payloadResult.scheduleIso,
    );
  }

  if (!tryBeginCalendarOperation(params.transcript)) {
    logCalendarDecision('reasonForRefusal', {
      reason: 'operation_blocked_or_in_progress',
    });

    const tool = createCalendarToolFailure(
      'CALENDAR_OPERATION_IN_PROGRESS',
      'Calendar operation already in progress.',
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
    tool = await createGoogleCalendarEvent(payloadResult.payload);
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
      endCalendarOperation({ failed: false });
      return finalizeOutcome(
        buildCalendarToolReplyBundle(tool, params.languageCode, { referenceNow: params.referenceNow }),
        payloadResult.scheduleIso,
      );
    }

    if (tool.status === 'FAILURE') {
      endCalendarOperation({ failed: true });
      return finalizeOutcome(
        buildCalendarToolReplyBundle(tool, params.languageCode, { referenceNow: params.referenceNow }),
        payloadResult.scheduleIso,
      );
    }

    if (tool.status === 'PENDING') {
      endCalendarOperation({ failed: false });
      return finalizeOutcome(
        buildCalendarToolReplyBundle(tool, params.languageCode, { referenceNow: params.referenceNow }),
        payloadResult.scheduleIso,
      );
    }

    logCalendarExecutionStateTransition({
      from: 'creating_event',
      to: 'success',
      tool: 'google_calendar_create_event',
      detail: tool.eventId,
    });

    endCalendarOperation({ failed: false });

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
    }

    return finalizeOutcome(
      buildCalendarToolReplyBundle(tool, params.languageCode, { referenceNow: params.referenceNow }),
      payloadResult.scheduleIso,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Calendar operation error';
    tool = createCalendarToolFailure('CALENDAR_OPERATION_ERROR', message);
    endCalendarOperation({ failed: true });
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
