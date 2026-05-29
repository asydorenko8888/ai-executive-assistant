import { ensureCalendarAuthForTool } from '@/src/features/agent/calendar/calendarAuthCapabilities';
import { deleteGoogleCalendarEventOnBackend } from '@/src/features/agent/calendar/googleCalendarBackendApi';
import {
  createCalendarToolFailure,
  createCalendarToolSuccess,
  type CalendarToolResponse,
} from '@/src/features/agent/execution/calendarToolContract';
import { logCalendarCreate } from '@/src/features/agent/execution/calendarCreateLogger';
import { ApiError } from '@/src/shared/api/api-error';

export async function deleteGoogleCalendarEvent(eventId: string): Promise<CalendarToolResponse> {
  const auth = await ensureCalendarAuthForTool('google_calendar_delete_event');

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

  logCalendarCreate('delete started', { eventId });

  try {
    const response = await deleteGoogleCalendarEventOnBackend(eventId);
    logCalendarCreate('delete result', {
      eventId: response.event?.id ?? eventId,
      verified: response.verified,
    });

    if (
      !response.verified ||
      !response.verificationFetched ||
      !response.event?.id
    ) {
      return createCalendarToolFailure('VERIFY_FAILED', 'Google Calendar did not confirm deletion.');
    }

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

    if (apiError?.status === 401 || code === 'calendar_not_connected') {
      return createCalendarToolFailure('GOOGLE_CALENDAR_NOT_CONNECTED', 'Google Calendar is not connected.');
    }

    if (code === 'CALENDAR_EVENT_NOT_FOUND') {
      return createCalendarToolFailure('CALENDAR_EVENT_NOT_FOUND', 'No matching calendar event was found.');
    }

    if (code === 'WRITE_SCOPE_MISSING' || code === 'GOOGLE_CALENDAR_WRITE_NOT_GRANTED' || apiError?.status === 403) {
      return createCalendarToolFailure(
        'WRITE_SCOPE_MISSING',
        'WRITE_SCOPE_MISSING: reconnect Google Calendar and grant event write access (calendar.events).',
      );
    }

    return createCalendarToolFailure(
      'CALENDAR_API_UNAVAILABLE',
      apiError?.message || 'Google Calendar API unavailable.',
    );
  }
}
