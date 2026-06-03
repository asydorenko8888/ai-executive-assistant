import { ensureCalendarAuthForTool } from '@/src/features/agent/calendar/calendarAuthCapabilities';
import { createGoogleCalendarEventOnBackend } from '@/src/features/agent/calendar/googleCalendarBackendApi';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import type { CalendarCreateEventPayload } from '@/src/features/agent/execution/actionExecutionTypes';
import {
  createCalendarToolFailure,
  createCalendarToolSuccess,
  type CalendarToolResponse,
} from '@/src/features/agent/execution/calendarToolContract';
import { logCalendarGoogleApiResponse } from '@/src/features/agent/calendar/calendarExecutionDebugLog';
import { logCalendarCreate } from '@/src/features/agent/execution/calendarCreateLogger';
import { mapCaughtCalendarApiError } from '@/src/features/agent/calendar/calendarApiToolErrorMapper';
import { logExecutionAudit } from '@/src/features/agent/execution/executionAuditLogger';

export async function createGoogleCalendarEvent(
  payload: CalendarCreateEventPayload,
  languageCode: VoiceLanguageCode = 'en-US',
): Promise<CalendarToolResponse> {
  const auth = await ensureCalendarAuthForTool('google_calendar_create_event');

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
    operation: 'POST /google-calendar/events',
    summary: payload.summary,
  });

  try {
    logCalendarCreate('insert started', { path: 'POST /google-calendar/events', summary: payload.summary });
    const response = await createGoogleCalendarEventOnBackend(payload);
    logCalendarCreate('insert result', {
      executionState: response.executionState,
      verified: response.verified,
      eventId: response.event?.id ?? null,
    });
    logCalendarGoogleApiResponse({
      status: response.executionState,
      eventId: response.event?.id ?? null,
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
      !response.event?.id
    ) {
      logExecutionAudit('verification_response', { verified: false, reason: 'backend_did_not_confirm' });

      return createCalendarToolFailure(
        'VERIFY_FAILED',
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
    return await mapCaughtCalendarApiError({
      error,
      languageCode,
      action: 'POST /google-calendar/events',
      calendarChanged: false,
    });
  }
}
