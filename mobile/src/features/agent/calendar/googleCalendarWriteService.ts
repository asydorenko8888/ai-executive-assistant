import { ensureCalendarAuthForTool } from '@/src/features/agent/calendar/calendarAuthCapabilities';
import { createGoogleCalendarEventOnBackend } from '@/src/features/agent/calendar/googleCalendarBackendApi';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';
import type { CalendarCreateEventPayload } from '@/src/features/agent/execution/actionExecutionTypes';
import { buildAuthoritativeCreateToolResponse } from '@/src/features/agent/calendar/calendarAuthoritativeMutationTool';
import {
  createCalendarToolFailure,
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

    const tool = await buildAuthoritativeCreateToolResponse({
      eventId: response.event?.id ?? '',
      backendResponse: response,
    });

    logExecutionAudit('verification_response', {
      verified: tool.verified,
      verificationFetched: tool.verificationFetched,
      eventId: tool.eventId ?? null,
      status: tool.status,
    });

    return tool;
  } catch (error) {
    return await mapCaughtCalendarApiError({
      error,
      languageCode,
      action: 'POST /google-calendar/events',
      calendarChanged: false,
    });
  }
}
