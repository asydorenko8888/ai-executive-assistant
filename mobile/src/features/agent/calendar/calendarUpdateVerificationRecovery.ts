import {
  isReadableVerifiedCalendarEvent,
  mapGoogleBackendEventToVerified,
} from '@/src/features/agent/calendar/calendarAuthoritativeEvent';
import { fetchGoogleCalendarEventByIdFromBackend } from '@/src/features/agent/calendar/googleCalendarBackendApi';
import { verifyUpdateWithRetryReads } from '@/src/features/agent/calendar/calendarUpdateVerificationRetry';
import type { CalendarUpdateEventPayload } from '@/src/features/agent/execution/actionExecutionTypes';
import type { CalendarToolResponse } from '@/src/features/agent/execution/calendarToolContract';

export async function tryRecoverVerifiedUpdateAfterPatch(params: {
  eventId: string;
  payload: CalendarUpdateEventPayload;
  oldStartsAt?: string | null;
}): Promise<CalendarToolResponse | null> {
  const verification = await verifyUpdateWithRetryReads({
    eventId: params.eventId,
    payload: params.payload,
    oldStartsAt: params.oldStartsAt,
    readEvent: async () => {
      const response = await fetchGoogleCalendarEventByIdFromBackend(params.eventId);
      const event = response.event ? mapGoogleBackendEventToVerified(response.event) : null;

      return event && isReadableVerifiedCalendarEvent(event) ? event : null;
    },
  });

  if (!verification.verified || !verification.event) {
    return null;
  }

  return {
    status: 'SUCCESS',
    eventId: verification.event.id,
    event: verification.event,
    verified: true,
    verificationFetched: true,
  };
}
