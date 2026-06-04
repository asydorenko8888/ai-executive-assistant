import { ensureCalendarAuthForTool } from '@/src/features/agent/calendar/calendarAuthCapabilities';
import { mapCaughtCalendarApiError } from '@/src/features/agent/calendar/calendarApiToolErrorMapper';
import {
  deleteGoogleCalendarEventOnBackend,
  normalizeGoogleCalendarMutationApiResponse,
} from '@/src/features/agent/calendar/googleCalendarBackendApi';
import { mapGoogleBackendEventToVerified } from '@/src/features/agent/calendar/calendarAuthoritativeEvent';
import { buildAuthoritativeDeleteToolResponse } from '@/src/features/agent/calendar/calendarAuthoritativeMutationTool';
import {
  createCalendarToolFailure,
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
    const response = normalizeGoogleCalendarMutationApiResponse(
      await deleteGoogleCalendarEventOnBackend(eventId),
    );
    logDeleteBackendResponse({
      eventId: response.event?.id ?? response.eventId ?? eventId,
      verified: response.verified,
      verificationFetched: response.verificationFetched,
      status: response.executionState ?? 'unknown',
    });
    logDeleteVerificationResult({
      verified: response.verified,
      eventId: response.event?.id ?? eventId,
    });
    logCalendarCreate('delete result', {
      eventId: response.event?.id ?? eventId,
      verified: response.verified,
    });

    return buildAuthoritativeDeleteToolResponse({
      eventId,
      backendResponse: response,
      deletedEventSnapshot: response.event
        ? mapGoogleBackendEventToVerified(response.event)
        : null,
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
