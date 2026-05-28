import { createGoogleCalendarEventOnBackend } from '@/src/features/agent/calendar/googleCalendarBackendApi';
import type { CalendarCreateEventPayload } from '@/src/features/agent/execution/actionExecutionTypes';
import { logActionExecution } from '@/src/features/agent/execution/actionExecutionLogger';
import { verifyGoogleCalendarCreateResponse } from '@/src/features/agent/execution/actionExecutionVerifier';
import { ApiError } from '@/src/shared/api/api-error';

export type GoogleCalendarWriteResult =
  | {
      ok: true;
      verified: true;
      event: NonNullable<ReturnType<typeof verifyGoogleCalendarCreateResponse>['event']>;
    }
  | {
      ok: false;
      errorCode: string;
      errorMessage: string;
      httpStatus?: number;
    };

export async function createGoogleCalendarEvent(
  payload: CalendarCreateEventPayload,
): Promise<GoogleCalendarWriteResult> {
  logActionExecution('execution_started', {
    tool: 'google_calendar_create_event',
    channel: 'backend',
    summary: payload.summary,
  });

  try {
    const response = await createGoogleCalendarEventOnBackend(payload);
    const verification = verifyGoogleCalendarCreateResponse(payload.summary, {
      id: response.event.id,
      summary: response.event.summary,
      location: response.event.location,
      start: { dateTime: response.event.startsAt },
      end: { dateTime: response.event.endsAt },
      htmlLink: response.event.htmlLink,
      status: 'confirmed',
    });

    if (!verification.verified || !verification.event) {
      return {
        ok: false,
        errorCode: 'calendar_verification_failed',
        errorMessage: verification.reason ?? 'Calendar API response could not be verified.',
      };
    }

    logActionExecution('execution_result', {
      tool: 'google_calendar_create_event',
      status: 'success',
      eventId: verification.event.id,
      channel: 'backend',
    });

    return {
      ok: true,
      verified: true,
      event: verification.event,
    };
  } catch (error) {
    const apiError = error instanceof ApiError ? error : null;

    if (apiError?.status === 401) {
      return {
        ok: false,
        errorCode: 'calendar_not_connected',
        errorMessage: 'Google Calendar is not connected.',
        httpStatus: 401,
      };
    }

    if (apiError?.status === 403) {
      return {
        ok: false,
        errorCode: 'calendar_write_forbidden',
        errorMessage: 'Google Calendar write access is missing.',
        httpStatus: 403,
      };
    }

    return {
      ok: false,
      errorCode: 'calendar_api_unavailable',
      errorMessage: apiError?.message || 'Google Calendar API unavailable.',
      httpStatus: apiError?.status,
    };
  }
}
