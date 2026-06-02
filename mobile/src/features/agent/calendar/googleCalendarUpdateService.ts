import { ensureCalendarAuthForTool } from '@/src/features/agent/calendar/calendarAuthCapabilities';
import { updateGoogleCalendarEventOnBackend } from '@/src/features/agent/calendar/googleCalendarBackendApi';
import {
  logCalendarUpdateFailed,
  logCalendarUpdatePatchRequest,
  logCalendarUpdatePatchResponse,
  logCalendarUpdateVerified,
  logCalendarUpdateVerifyFetch,
} from '@/src/features/agent/calendar/calendarUpdateLogger';
import { verifyUpdatedEventMatchesPayload } from '@/src/features/agent/calendar/calendarUpdateVerification';
import type { CalendarUpdateEventPayload } from '@/src/features/agent/execution/actionExecutionTypes';
import {
  createCalendarToolFailure,
  createCalendarToolSuccess,
  type CalendarToolResponse,
} from '@/src/features/agent/execution/calendarToolContract';
import { logCalendarGoogleApiResponse } from '@/src/features/agent/calendar/calendarExecutionDebugLog';
import { logExecutionAudit } from '@/src/features/agent/execution/executionAuditLogger';
import { ApiError } from '@/src/shared/api/api-error';

export async function updateGoogleCalendarEvent(
  eventId: string,
  payload: CalendarUpdateEventPayload,
  options?: { originalStartsAt?: string },
): Promise<CalendarToolResponse> {
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
    summary: payload.summary ?? null,
    start: payload.start,
    end: payload.end,
  });

  try {
    const response = await updateGoogleCalendarEventOnBackend(eventId, payload);

    logCalendarUpdatePatchResponse({
      executionState: response.executionState,
      verified: response.verified,
      verificationFetched: response.verificationFetched,
      eventId: response.event?.id ?? eventId,
    });

    logCalendarUpdateVerifyFetch({
      eventId: response.event?.id ?? eventId,
      startsAt: response.event?.startsAt ?? null,
      endsAt: response.event?.endsAt ?? null,
      verificationFetched: response.verificationFetched,
    });
    logCalendarGoogleApiResponse({
      status: response.executionState,
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

    if (
      response.executionState !== 'success' ||
      !response.verified ||
      !response.verificationFetched ||
      !response.event?.id ||
      response.event.id !== eventId
    ) {
      logCalendarUpdateFailed({
        eventId,
        reason: 'backend_did_not_confirm',
        executionState: response.executionState,
        verified: response.verified,
        verificationFetched: response.verificationFetched,
      });
      logExecutionAudit('verification_response', { verified: false, reason: 'backend_did_not_confirm' });

      return createCalendarToolFailure(
        'VERIFY_FAILED',
        'Google Calendar did not return a verified updated event.',
      );
    }

    const clientVerification = verifyUpdatedEventMatchesPayload(response.event, payload, {
      requestedEventId: eventId,
      originalStartsAt: options?.originalStartsAt,
    });

    if (!clientVerification.ok) {
      logCalendarUpdateFailed({
        eventId: response.event.id,
        reason: 'client_verify_mismatch',
        expectedStart: clientVerification.expectedStart,
        expectedEnd: clientVerification.expectedEnd,
        actualStart: clientVerification.actualStart,
        actualEnd: clientVerification.actualEnd,
      });
      logExecutionAudit('verification_response', { verified: false, reason: 'client_verify_mismatch' });

      return createCalendarToolFailure(
        'VERIFY_FAILED',
        'Google Calendar event times did not match the requested update after verification fetch.',
      );
    }

    logCalendarUpdateVerified({
      eventId: response.event.id,
      startsAt: response.event.startsAt,
      endsAt: response.event.endsAt,
    });

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

    logCalendarUpdateFailed({
      eventId,
      reason: 'api_error',
      status: apiError?.status ?? null,
      code: code ?? null,
      message: apiError?.message ?? (error instanceof Error ? error.message : 'unknown error'),
    });

    logExecutionAudit('api_response', {
      ok: false,
      status: apiError?.status,
      code,
      message: apiError?.message,
    });

    if (apiError?.status === 401 || code === 'calendar_not_connected') {
      return createCalendarToolFailure('GOOGLE_CALENDAR_NOT_CONNECTED', 'Google Calendar is not connected.');
    }

    if (code === 'CALENDAR_EVENT_NOT_FOUND') {
      return createCalendarToolFailure('CALENDAR_EVENT_NOT_FOUND', 'No matching calendar event was found.');
    }

    if (
      code === 'GOOGLE_CALENDAR_WRITE_NOT_GRANTED' ||
      code === 'WRITE_SCOPE_MISSING' ||
      apiError?.status === 403 ||
      code === 'calendar_write_forbidden'
    ) {
      const detail =
        code === 'GOOGLE_CALENDAR_WRITE_NOT_GRANTED'
          ? apiError?.message || 'Google Calendar write permission was not granted.'
          : 'WRITE_SCOPE_MISSING: https://www.googleapis.com/auth/calendar.events';

      return createCalendarToolFailure(
        code === 'GOOGLE_CALENDAR_WRITE_NOT_GRANTED' ? 'GOOGLE_CALENDAR_WRITE_NOT_GRANTED' : 'WRITE_SCOPE_MISSING',
        detail,
      );
    }

    if (code === 'VERIFY_FAILED') {
      return createCalendarToolFailure('VERIFY_FAILED', apiError?.message || 'VERIFY_FAILED');
    }

    if (code === 'calendar_confirmation_timeout') {
      return createCalendarToolFailure(
        'CALENDAR_CONFIRMATION_TIMEOUT',
        'CALENDAR_CONFIRMATION_TIMEOUT: Google Calendar API timeout',
      );
    }

    return createCalendarToolFailure(
      'CALENDAR_API_UNAVAILABLE',
      apiError?.message || 'Google Calendar API unavailable.',
    );
  }
}
