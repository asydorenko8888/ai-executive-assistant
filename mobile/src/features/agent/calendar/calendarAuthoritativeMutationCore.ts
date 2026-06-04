import {
  isReadableVerifiedCalendarEvent,
  mapGoogleBackendEventToVerified,
} from '@/src/features/agent/calendar/calendarAuthoritativeEvent';
import type { GoogleCalendarCreateApiResponse } from '@/src/features/agent/calendar/googleCalendarBackendApi';
import {
  createCalendarToolFailure,
  type CalendarToolResponse,
} from '@/src/features/agent/execution/calendarToolContract';
import type { VerifiedCalendarEvent } from '@/src/features/agent/execution/actionExecutionTypes';

export function backendClaimsVerified(
  response: Pick<GoogleCalendarCreateApiResponse, 'executionState' | 'verified' | 'verificationFetched'> & {
    status?: string;
    code?: string;
  },
) {
  const executionOk =
    response.executionState === 'success' ||
    response.status === 'SUCCESS' ||
    response.code === 'SUCCESS';

  return executionOk && response.verified === true && response.verificationFetched === true;
}

export type ReadVerifiedCalendarEventById = (eventId: string) => Promise<VerifiedCalendarEvent | null>;
export type ConfirmCalendarEventDeleted = (eventId: string) => Promise<boolean>;

export async function buildAuthoritativeCreateToolResponseCore(params: {
  eventId: string;
  backendResponse: GoogleCalendarCreateApiResponse;
  readEventById: ReadVerifiedCalendarEventById;
}): Promise<CalendarToolResponse> {
  if (!backendClaimsVerified(params.backendResponse)) {
    return createCalendarToolFailure(
      'VERIFY_FAILED',
      'Google Calendar did not confirm the created event.',
    );
  }

  const authoritative =
    (await params.readEventById(params.eventId)) ??
    (params.backendResponse.event && isReadableVerifiedCalendarEvent(params.backendResponse.event)
      ? mapGoogleBackendEventToVerified(params.backendResponse.event)
      : null);

  if (!authoritative) {
    return createCalendarToolFailure(
      'VERIFY_FAILED',
      'Google Calendar create succeeded but the event could not be read back for confirmation.',
    );
  }

  return {
    status: 'SUCCESS',
    eventId: authoritative.id,
    event: authoritative,
    verified: true,
    verificationFetched: true,
  };
}

export async function buildAuthoritativeUpdateToolResponseCore(params: {
  eventId: string;
  backendResponse: GoogleCalendarCreateApiResponse;
  readEventById: ReadVerifiedCalendarEventById;
}): Promise<CalendarToolResponse> {
  if (!backendClaimsVerified(params.backendResponse)) {
    return createCalendarToolFailure(
      'VERIFY_FAILED',
      'Google Calendar did not confirm the updated event.',
    );
  }

  const authoritative = await params.readEventById(params.eventId);

  if (!authoritative) {
    return createCalendarToolFailure(
      'VERIFY_FAILED',
      'Google Calendar update succeeded but the event could not be read back for confirmation.',
    );
  }

  return {
    status: 'SUCCESS',
    eventId: authoritative.id,
    event: authoritative,
    verified: true,
    verificationFetched: true,
  };
}

export async function buildAuthoritativeDeleteToolResponseCore(params: {
  eventId: string;
  backendResponse: GoogleCalendarCreateApiResponse;
  confirmDeleted: ConfirmCalendarEventDeleted;
  deletedEventSnapshot?: VerifiedCalendarEvent | null;
}): Promise<CalendarToolResponse> {
  if (!backendClaimsVerified(params.backendResponse)) {
    return createCalendarToolFailure(
      'VERIFY_FAILED',
      'Google Calendar did not confirm deletion.',
    );
  }

  const stillPresent = !(await params.confirmDeleted(params.eventId));

  if (stillPresent) {
    return createCalendarToolFailure(
      'VERIFY_FAILED',
      'Google Calendar still returned the event after delete.',
    );
  }

  const snapshot =
    params.deletedEventSnapshot ??
    (params.backendResponse.event
      ? mapGoogleBackendEventToVerified(params.backendResponse.event)
      : null);

  if (!snapshot?.id) {
    return createCalendarToolFailure(
      'VERIFY_FAILED',
      'Deletion verification succeeded but no deleted event snapshot is available.',
    );
  }

  return {
    status: 'SUCCESS',
    eventId: snapshot.id,
    event: snapshot,
    verified: true,
    verificationFetched: true,
  };
}
