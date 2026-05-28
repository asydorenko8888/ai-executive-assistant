import { getActiveGoogleCalendarSession } from '@/src/features/agent/calendar/googleCalendarAuth';
import type { CalendarCreateEventPayload } from '@/src/features/agent/execution/actionExecutionTypes';
import { verifyGoogleCalendarCreateResponse } from '@/src/features/agent/execution/actionExecutionVerifier';
import { logActionExecution, logActionExecutionError } from '@/src/features/agent/execution/actionExecutionLogger';

const GOOGLE_CALENDAR_EVENTS_ENDPOINT = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

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
    summary: payload.summary,
  });

  const session = await getActiveGoogleCalendarSession();

  if (!session?.accessToken) {
    return {
      ok: false,
      errorCode: 'calendar_not_connected',
      errorMessage: 'Google Calendar is not connected.',
    };
  }

  try {
    const response = await fetch(GOOGLE_CALENDAR_EVENTS_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: payload.summary,
        location: payload.location,
        start: payload.start,
        end: payload.end,
      }),
    });

    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      const apiMessage =
        typeof body.error === 'object' &&
        body.error !== null &&
        'message' in body.error &&
        typeof (body.error as { message?: string }).message === 'string'
          ? (body.error as { message: string }).message
          : response.statusText;

      logActionExecution('execution_result', {
        tool: 'google_calendar_create_event',
        status: 'failed',
        httpStatus: response.status,
        errorCode: response.status === 403 ? 'calendar_write_forbidden' : 'calendar_api_error',
        apiMessage,
      });

      if (response.status === 403) {
        return {
          ok: false,
          errorCode: 'calendar_write_forbidden',
          errorMessage:
            'Google Calendar rejected the write — reconnect calendar to grant event creation permission.',
          httpStatus: 403,
        };
      }

      return {
        ok: false,
        errorCode: 'calendar_api_unavailable',
        errorMessage: apiMessage || 'Google Calendar API unavailable.',
        httpStatus: response.status,
      };
    }

    const verification = verifyGoogleCalendarCreateResponse(
      payload.summary,
      body as Parameters<typeof verifyGoogleCalendarCreateResponse>[1],
    );

    if (!verification.verified || !verification.event) {
      return {
        ok: false,
        errorCode: 'calendar_verification_failed',
        errorMessage: verification.reason ?? 'Calendar API response could not be verified.',
        httpStatus: response.status,
      };
    }

    logActionExecution('execution_result', {
      tool: 'google_calendar_create_event',
      status: 'success',
      eventId: verification.event.id,
    });

    return {
      ok: true,
      verified: true,
      event: verification.event,
    };
  } catch (error) {
    logActionExecutionError('execution_failed', error, { tool: 'google_calendar_create_event' });

    return {
      ok: false,
      errorCode: 'calendar_network_error',
      errorMessage: error instanceof Error ? error.message : 'Network error while creating calendar event.',
    };
  }
}
