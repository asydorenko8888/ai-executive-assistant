import { createGoogleCalendarEventOnBackend } from '@/src/features/agent/calendar/googleCalendarBackendApi';
import type { CalendarCreateEventPayload } from '@/src/features/agent/execution/actionExecutionTypes';
import {
  createCalendarToolFailure,
  createCalendarToolSuccess,
  type CalendarToolResponse,
} from '@/src/features/agent/execution/calendarToolContract';
import { logExecutionAudit } from '@/src/features/agent/execution/executionAuditLogger';
import { ApiError } from '@/src/shared/api/api-error';

export async function createGoogleCalendarEvent(
  payload: CalendarCreateEventPayload,
): Promise<CalendarToolResponse> {
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
      logExecutionAudit('verification_response', { verified: false, reason: 'backend_did_not_confirm' });

      return createCalendarToolFailure(
        'CALENDAR_VERIFICATION_FAILED',
        'Google Calendar did not return a verified event.',
      );
    }

    logExecutionAudit('verification_response', {
      verified: true,
      eventId: response.event.id,
    });

    return createCalendarToolSuccess({
      id: response.event.id,
      summary: response.event.summary,
      location: response.event.location,
      startsAt: response.event.startsAt,
      endsAt: response.event.endsAt,
      htmlLink: response.event.htmlLink,
    });
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null;
    const code = apiError?.code;

    logExecutionAudit('api_response', {
      ok: false,
      status: apiError?.status,
      code,
      message: apiError?.message,
    });

    if (apiError?.status === 401 || code === 'calendar_not_connected') {
      return createCalendarToolFailure('GOOGLE_CALENDAR_NOT_CONNECTED', 'Google Calendar is not connected.');
    }

    if (apiError?.status === 403 || code === 'calendar_write_forbidden') {
      return createCalendarToolFailure('GOOGLE_WRITE_PERMISSION_MISSING', 'GOOGLE_WRITE_PERMISSION_MISSING');
    }

    if (code === 'calendar_confirmation_timeout') {
      return createCalendarToolFailure(
        'CALENDAR_CONFIRMATION_TIMEOUT',
        'Still waiting for confirmation from Google Calendar.',
      );
    }

    return createCalendarToolFailure(
      'CALENDAR_API_UNAVAILABLE',
      apiError?.message || 'Google Calendar API unavailable.',
    );
  }
}
