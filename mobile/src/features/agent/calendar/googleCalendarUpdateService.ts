import { ensureCalendarAuthForTool } from '@/src/features/agent/calendar/calendarAuthCapabilities';
import { updateGoogleCalendarEventOnBackend } from '@/src/features/agent/calendar/googleCalendarBackendApi';
import {
  logCalendarUpdateFailed,
  logCalendarUpdatePatchRequest,
  logCalendarUpdatePatchResponse,
  logCalendarUpdateVerified,
  logCalendarUpdateVerifyFetch,
} from '@/src/features/agent/calendar/calendarUpdateLogger';
import { buildAuthoritativeUpdateToolResponse } from '@/src/features/agent/calendar/calendarAuthoritativeMutationTool';
import type { CalendarUpdateEventPayload } from '@/src/features/agent/execution/actionExecutionTypes';
import {
  createCalendarToolFailure,
  type CalendarToolResponse,
} from '@/src/features/agent/execution/calendarToolContract';
import { logCalendarGoogleApiResponse } from '@/src/features/agent/calendar/calendarExecutionDebugLog';
import { mapCaughtCalendarApiError } from '@/src/features/agent/calendar/calendarApiToolErrorMapper';
import { logExecutionAudit } from '@/src/features/agent/execution/executionAuditLogger';
import type { VoiceLanguageCode } from '@/src/features/chat/services/voiceLanguage';

export async function updateGoogleCalendarEvent(
  eventId: string,
  payload: CalendarUpdateEventPayload,
  options?: { originalStartsAt?: string; languageCode?: VoiceLanguageCode },
): Promise<CalendarToolResponse> {
  const languageCode = options?.languageCode ?? 'en-US';
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
      status: response.executionState ?? 'unknown',
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

    const tool = await buildAuthoritativeUpdateToolResponse({
      eventId,
      backendResponse: response,
    });

    if (tool.status === 'SUCCESS' && tool.event) {
      logCalendarUpdateVerified({
        eventId: tool.event.id,
        startsAt: tool.event.startsAt,
        endsAt: tool.event.endsAt,
      });
    } else {
      logCalendarUpdateFailed({
        eventId,
        reason: 'authoritative_read_failed',
        message: tool.error ?? 'verification failed',
      });
    }

    logExecutionAudit('verification_response', {
      verified: tool.verified,
      verificationFetched: tool.verificationFetched,
      eventId: tool.eventId ?? null,
      status: tool.status,
    });

    return tool;
  } catch (error) {
    logCalendarUpdateFailed({
      eventId,
      reason: 'api_error',
      message: error instanceof Error ? error.message : 'unknown error',
    });

    return await mapCaughtCalendarApiError({
      error,
      languageCode,
      action: 'PATCH /google-calendar/events',
      calendarChanged: false,
    });
  }
}
