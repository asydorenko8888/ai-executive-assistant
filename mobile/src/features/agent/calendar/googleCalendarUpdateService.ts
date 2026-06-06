import { ensureCalendarAuthForTool } from '@/src/features/agent/calendar/calendarAuthCapabilities';
import { updateGoogleCalendarEventOnBackend } from '@/src/features/agent/calendar/googleCalendarBackendApi';
import {
  logCalendarUpdateFailed,
  logCalendarUpdatePatchRequest,
  logCalendarUpdatePatchResponse,
  logCalendarUpdateVerified,
  logCalendarUpdateVerifyFetch,
} from '@/src/features/agent/calendar/calendarUpdateLogger';
import { buildAuthoritativeUpdateToolResponse } from '@/src/features/agent/calendar/calendarAuthoritativeMutationTool';
import type { CalendarUpdateEventPayload } from '@/src/features/agent/execution/actionExecutionTypes';
import {
  createCalendarToolFailure,
  type CalendarToolResponse,
} from '@/src/features/agent/execution/calendarToolContract';
import { logCalendarGoogleApiResponse } from '@/src/features/agent/calendar/calendarExecutionDebugLog';
import { mapCaughtCalendarApiError } from '@/src/features/agent/calendar/calendarApiToolErrorMapper';
import { logCalendarMoveWorkflow } from '@/src/features/agent/calendar/calendarMoveWorkflowLogger';
import {
  logCalendarMoveExecutorCalled,
} from '@/src/features/agent/calendar/calendarMoveTraceLogger';
import { tryRecoverVerifiedUpdateAfterPatch } from '@/src/features/agent/calendar/calendarUpdateVerificationRecovery';
import { logExecutionAudit } from '@/src/features/agent/execution/executionAuditLogger';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import { toApiError } from '@/src/shared/api/api-error';

export async function updateGoogleCalendarEvent(
  eventId: string,
  payload: CalendarUpdateEventPayload,
  options?: { originalStartsAt?: string; languageCode?: VoiceLanguageCode },
): Promise<CalendarToolResponse> {
  const languageCode = options?.languageCode ?? 'en-US';
  const auth = await ensureCalendarAuthForTool('google_calendar_update_event');

  if (!auth.canWriteCalendar) {
    if (!auth.canReadCalendar) {
      return createCalendarToolFailure(
        'GOOGLE_CALENDAR_NOT_CONNECTED',
        'Google Calendar is not connected on the server for this device.',
      );
    }

    return createCalendarToolFailure(
      'WRITE_SCOPE_MISSING',
      'WRITE_SCOPE_MISSING: reconnect Google Calendar and grant event write access (calendar.events).',
    );
  }

  logExecutionAudit('tool_call', {
    operation: `PATCH /google-calendar/events/${eventId}`,
    summary: payload.summary ?? null,
  });

  logCalendarUpdatePatchRequest({
    eventId,
    oldStartsAt: options?.originalStartsAt ?? null,
    requestedStart: payload.start.dateTime ?? null,
    requestedEnd: payload.end.dateTime ?? null,
    summary: payload.summary ?? null,
    start: payload.start,
    end: payload.end,
  });
  logCalendarMoveExecutorCalled({
    executor: 'updateGoogleCalendarEvent',
    transcript: `PATCH ${eventId}`,
  });

  logCalendarMoveWorkflow('MOVE_PATCH_ATTEMPT', {
    eventId,
    oldStartsAt: options?.originalStartsAt ?? null,
    requestedStart: payload.start.dateTime ?? null,
    requestedEnd: payload.end.dateTime ?? null,
    summary: payload.summary ?? null,
    start: payload.start.dateTime ?? null,
    end: payload.end.dateTime ?? null,
  });
  logCalendarMoveWorkflow('MOVE_PATCH_SENT', {
    eventId,
    oldStartsAt: options?.originalStartsAt ?? null,
    requestedStart: payload.start.dateTime ?? null,
    summary: payload.summary ?? null,
    start: payload.start.dateTime ?? null,
    end: payload.end.dateTime ?? null,
  });
  logCalendarMoveWorkflow('GOOGLE_UPDATE_START', {
    eventId,
    oldStartsAt: options?.originalStartsAt ?? null,
    requestedStart: payload.start.dateTime ?? null,
    summary: payload.summary ?? null,
    start: payload.start.dateTime ?? null,
    end: payload.end.dateTime ?? null,
  });

  try {
    const response = await updateGoogleCalendarEventOnBackend(eventId, payload);

    logCalendarMoveWorkflow('MOVE_PATCH_RESULT', {
      eventId: response.event?.id ?? eventId,
      executionState: response.executionState ?? null,
      verified: response.verified ?? null,
      verificationFetched: response.verificationFetched ?? null,
    });

    logCalendarMoveWorkflow('GOOGLE_UPDATE_SUCCESS', {
      eventId: response.event?.id ?? eventId,
      executionState: response.executionState ?? null,
      verified: response.verified ?? null,
    });

    logCalendarUpdatePatchResponse({
      executionState: response.executionState,
      verified: response.verified,
      verificationFetched: response.verificationFetched,
      eventId: response.event?.id ?? eventId,
      patchStartsAt: response.event?.startsAt ?? null,
      patchEndsAt: response.event?.endsAt ?? null,
      requestedStart: payload.start.dateTime ?? null,
      requestedEnd: payload.end.dateTime ?? null,
    });

    logCalendarUpdateVerifyFetch({
      eventId: response.event?.id ?? eventId,
      startsAt: response.event?.startsAt ?? null,
      endsAt: response.event?.endsAt ?? null,
      verificationFetched: response.verificationFetched,
    });
    logCalendarGoogleApiResponse({
      status: response.executionState ?? 'unknown',
      eventId: response.event?.id ?? eventId,
      verified: response.verified,
      verificationFetched: response.verificationFetched,
    });

    logExecutionAudit('api_response', {
      executionState: response.executionState,
      verified: response.verified,
      verificationFetched: response.verificationFetched,
      eventId: response.event?.id ?? null,
    });

    let tool: CalendarToolResponse;

    try {
      tool = await buildAuthoritativeUpdateToolResponse({
        eventId,
        backendResponse: response,
      });
    } catch (verificationError) {
      logCalendarUpdateFailed({
        eventId,
        reason: 'authoritative_read_exception',
        message:
          verificationError instanceof Error
            ? verificationError.message
            : 'authoritative verification failed',
      });

      return createCalendarToolFailure(
        'VERIFY_FAILED',
        'Google Calendar did not confirm the update.',
      );
    }

    logCalendarMoveWorkflow('MOVE_VERIFY_RESULT', {
      status: tool.status,
      verified: tool.verified ?? false,
      verificationFetched: tool.verificationFetched ?? false,
      eventId: tool.eventId ?? eventId,
      errorCode: tool.errorCode ?? null,
    });

    if (tool.status === 'SUCCESS' && tool.event) {
      logCalendarMoveWorkflow('MOVE_VERIFY_SUCCESS', {
        eventId: tool.event.id,
      });
      logCalendarUpdateVerified({
        eventId: tool.event.id,
        startsAt: tool.event.startsAt,
        endsAt: tool.event.endsAt,
      });
    } else {
      logCalendarMoveWorkflow('MOVE_VERIFY_FAILED', {
        eventId,
        oldStartsAt: options?.originalStartsAt ?? null,
        requestedStart: payload.start.dateTime ?? null,
        reason: tool.errorCode ?? 'authoritative_read_failed',
        error: tool.error ?? null,
      });
      logCalendarUpdateFailed({
        eventId,
        reason: 'authoritative_read_failed',
        message: tool.error ?? 'verification failed',
      });
    }

    logExecutionAudit('verification_response', {
      verified: tool.verified,
      verificationFetched: tool.verificationFetched,
      eventId: tool.eventId ?? null,
      status: tool.status,
    });

    return tool;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    const apiError = toApiError(error);

    if (apiError.code === 'VERIFY_FAILED') {
      logCalendarMoveWorkflow('MOVE_VERIFY_RESULT', {
        eventId,
        oldStartsAt: options?.originalStartsAt ?? null,
        requestedStart: payload.start.dateTime ?? null,
        phase: 'client_retry_after_verify_failed',
        reason: message,
      });

      const recovered = await tryRecoverVerifiedUpdateAfterPatch({
        eventId,
        payload,
        oldStartsAt: options?.originalStartsAt,
      });

      if (recovered) {
        logCalendarMoveWorkflow('MOVE_VERIFY_SUCCESS', {
          eventId: recovered.eventId ?? eventId,
          recoveredAfterVerifyFailed: true,
        });
        logCalendarUpdateVerified({
          eventId: recovered.eventId ?? eventId,
          startsAt: recovered.event?.startsAt ?? null,
          endsAt: recovered.event?.endsAt ?? null,
        });

        return recovered;
      }
    }

    logCalendarMoveWorkflow('MOVE_EXCEPTION', {
      phase: 'googleCalendarUpdateService',
      eventId,
      reason: message,
    });

    logCalendarUpdateFailed({
      eventId,
      reason: 'api_error',
      message,
    });

    return await mapCaughtCalendarApiError({
      error,
      languageCode,
      action: 'PATCH /google-calendar/events',
      calendarChanged: false,
    });
  }
}
