import { ensureCalendarAuthForTool } from '@/src/features/agent/calendar/calendarAuthCapabilities';
import { mapCaughtCalendarApiError } from '@/src/features/agent/calendar/calendarApiToolErrorMapper';
import { deleteGoogleCalendarEventOnBackend } from '@/src/features/agent/calendar/googleCalendarBackendApi';
import {
  createCalendarToolFailure,
  createCalendarToolSuccess,
  type CalendarToolResponse,
} from '@/src/features/agent/execution/calendarToolContract';
import {
  logDeleteBackendResponse,
  logDeleteVerificationResult,
} from '@/src/features/agent/calendar/calendarDeleteDiagnostics';
import { logCalendarCreate } from '@/src/features/agent/execution/calendarCreateLogger';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';

export async function deleteGoogleCalendarEvent(
  eventId: string,
  languageCode: VoiceLanguageCode = 'en-US',
): Promise<CalendarToolResponse> {
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
    logDeleteBackendResponse({
      eventId: response.event?.id ?? eventId,
      verified: response.verified,
      verificationFetched: response.verificationFetched,
      status: response.executionState,
    });
    logDeleteVerificationResult({
      verified: response.verified,
      eventId: response.event?.id ?? eventId,
    });
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
    return await mapCaughtCalendarApiError({
      error,
      languageCode,
      action: 'DELETE /google-calendar/events',
      calendarChanged: false,
    });
  }
}
