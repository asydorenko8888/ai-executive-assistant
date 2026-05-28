import { createGoogleCalendarEventOnBackend } from '@/src/features/agent/calendar/googleCalendarBackendApi';
import type { CalendarCreateEventPayload } from '@/src/features/agent/execution/actionExecutionTypes';
import type { CalendarExecutionState } from '@/src/features/agent/execution/calendarExecutionStates';
import { logExecutionAudit } from '@/src/features/agent/execution/executionAuditLogger';
import type { VerifiedCalendarEvent } from '@/src/features/agent/execution/actionExecutionTypes';
import { ApiError } from '@/src/shared/api/api-error';

export type GoogleCalendarWriteResult =
  | {
      ok: true;
      verified: true;
      verificationFetched: true;
      executionState: 'success';
      event: VerifiedCalendarEvent;
    }
  | {
      ok: false;
      verified: false;
      verificationFetched: boolean;
      executionState: CalendarExecutionState;
      errorCode: string;
      errorMessage: string;
      httpStatus?: number;
    };

function mapBackendEvent(event: {
  id: string;
  summary: string;
  location?: string;
  startsAt: string;
  endsAt: string;
  htmlLink?: string;
}): VerifiedCalendarEvent {
  return {
    id: event.id,
    summary: event.summary,
    location: event.location,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    htmlLink: event.htmlLink,
  };
}

export async function createGoogleCalendarEvent(
  payload: CalendarCreateEventPayload,
): Promise<GoogleCalendarWriteResult> {
  logExecutionAudit('request', {
    tool: 'google_calendar_create_event',
    summary: payload.summary,
  });

  logExecutionAudit('tool_call', {
    operation: 'POST /google-calendar/events',
    summary: payload.summary,
  });

  try {
    const response = await createGoogleCalendarEventOnBackend(payload);

    logExecutionAudit('api_response', {
      executionState: response.executionState,
      verified: response.verified,
      verificationFetched: response.verificationFetched,
      eventId: response.event?.id ?? null,
    });

    if (
      response.executionState !== 'success' ||
      !response.verified ||
      !response.verificationFetched ||
      !response.event?.id
    ) {
      logExecutionAudit('verification_response', {
        verified: false,
        reason: 'backend_did_not_confirm',
      });

      return {
        ok: false,
        verified: false,
        verificationFetched: Boolean(response.verificationFetched),
        executionState: response.executionState === 'success' ? 'failed' : response.executionState,
        errorCode: 'calendar_verification_failed',
        errorMessage: 'Google Calendar did not return a verified event.',
      };
    }

    logExecutionAudit('verification_response', {
      verified: true,
      eventId: response.event.id,
    });

    return {
      ok: true,
      verified: true,
      verificationFetched: true,
      executionState: 'success',
      event: mapBackendEvent(response.event),
    };
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null;
    const errorCode =
      apiError?.code ??
      (apiError?.status === 401
        ? 'calendar_not_connected'
        : apiError?.status === 403
          ? 'calendar_write_forbidden'
          : apiError?.status === 408
            ? 'calendar_confirmation_timeout'
            : 'calendar_api_unavailable');

    logExecutionAudit('api_response', {
      ok: false,
      errorCode,
      message: apiError?.message,
    });

    return {
      ok: false,
      verified: false,
      verificationFetched: false,
      executionState: errorCode === 'calendar_confirmation_timeout' ? 'failed' : 'failed',
      errorCode,
      errorMessage: apiError?.message || 'Google Calendar API unavailable.',
      httpStatus: apiError?.status,
    };
  }
}
