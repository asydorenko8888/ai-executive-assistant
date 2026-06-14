import {
  isReadableVerifiedCalendarEvent,
  mapGoogleBackendEventToVerified,
} from '@/src/features/agent/calendar/calendarAuthoritativeEvent';
import { fetchGoogleCalendarEventByIdFromBackend } from '@/src/features/agent/calendar/googleCalendarBackendApi';
import type { VerifiedCalendarEvent } from '@/src/features/agent/execution/actionExecutionTypes';
import { toApiError } from '@/src/shared/api/api-error';

export type AuthoritativeEventFetchOutcome =
  | { kind: 'found'; event: VerifiedCalendarEvent }
  | { kind: 'absent' }
  | { kind: 'unavailable'; message: string };

export async function fetchAuthoritativeCalendarEventOutcome(
  eventId: string,
): Promise<AuthoritativeEventFetchOutcome> {
  const trimmedId = eventId.trim();

  if (!trimmedId) {
    return { kind: 'unavailable', message: 'missing eventId' };
  }

  try {
    const response = await fetchGoogleCalendarEventByIdFromBackend(trimmedId);
    const event = response.event ? mapGoogleBackendEventToVerified(response.event) : null;

    if (event && isReadableVerifiedCalendarEvent(event)) {
      return { kind: 'found', event };
    }

    return { kind: 'unavailable', message: 'unreadable event payload' };
  } catch (error) {
    const apiError = toApiError(error);

    if (apiError.status === 404 || apiError.code === 'CALENDAR_EVENT_NOT_FOUND') {
      return { kind: 'absent' };
    }

    console.log('[Calendar Authoritative Fetch] failed', {
      eventId: trimmedId,
      status: apiError.status,
      code: apiError.code ?? null,
      message: apiError.message,
    });

    return {
      kind: 'unavailable',
      message: apiError.message || 'verification fetch failed',
    };
  }
}

export async function fetchAuthoritativeCalendarEventById(
  eventId: string,
): Promise<VerifiedCalendarEvent | null> {
  const outcome = await fetchAuthoritativeCalendarEventOutcome(eventId);

  return outcome.kind === 'found' ? outcome.event : null;
}

export type CalendarDeletionConfirmation = 'confirmed' | 'still_present' | 'unavailable';

export async function confirmCalendarEventDeleted(eventId: string): Promise<CalendarDeletionConfirmation> {
  const outcome = await fetchAuthoritativeCalendarEventOutcome(eventId);

  if (outcome.kind === 'absent') {
    return 'confirmed';
  }

  if (outcome.kind === 'found') {
    return 'still_present';
  }

  return 'unavailable';
}
