import {
  isReadableVerifiedCalendarEvent,
  mapGoogleBackendEventToVerified,
} from '@/src/features/agent/calendar/calendarAuthoritativeEvent';
import { fetchGoogleCalendarEventByIdFromBackend } from '@/src/features/agent/calendar/googleCalendarBackendApi';
import type { VerifiedCalendarEvent } from '@/src/features/agent/execution/actionExecutionTypes';

export async function fetchAuthoritativeCalendarEventById(
  eventId: string,
): Promise<VerifiedCalendarEvent | null> {
  const trimmedId = eventId.trim();

  if (!trimmedId) {
    return null;
  }

  try {
    const response = await fetchGoogleCalendarEventByIdFromBackend(trimmedId);
    const event = response.event ? mapGoogleBackendEventToVerified(response.event) : null;

    return event && isReadableVerifiedCalendarEvent(event) ? event : null;
  } catch (error) {
    console.log('[Calendar Authoritative Fetch] failed', {
      eventId: trimmedId,
      message: error instanceof Error ? error.message : String(error),
    });

    return null;
  }
}

export async function confirmCalendarEventDeleted(eventId: string) {
  const event = await fetchAuthoritativeCalendarEventById(eventId);

  return event === null;
}
