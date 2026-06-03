import {
  confirmCalendarEventDeleted,
  fetchAuthoritativeCalendarEventById,
} from '@/src/features/agent/calendar/calendarAuthoritativeMutationFetch';
import {
  buildAuthoritativeCreateToolResponseCore,
  buildAuthoritativeDeleteToolResponseCore,
  buildAuthoritativeUpdateToolResponseCore,
  type ConfirmCalendarEventDeleted,
  type ReadVerifiedCalendarEventById,
} from '@/src/features/agent/calendar/calendarAuthoritativeMutationCore';
import type { GoogleCalendarCreateApiResponse } from '@/src/features/agent/calendar/googleCalendarBackendApi';
import type { CalendarToolResponse } from '@/src/features/agent/execution/calendarToolContract';
import type { VerifiedCalendarEvent } from '@/src/features/agent/execution/actionExecutionTypes';

type AuthoritativeMutationReaders = {
  readEventById?: ReadVerifiedCalendarEventById;
  confirmDeleted?: ConfirmCalendarEventDeleted;
};

export async function buildAuthoritativeCreateToolResponse(params: {
  eventId: string;
  backendResponse: GoogleCalendarCreateApiResponse;
} & AuthoritativeMutationReaders): Promise<CalendarToolResponse> {
  return buildAuthoritativeCreateToolResponseCore({
    eventId: params.eventId,
    backendResponse: params.backendResponse,
    readEventById: params.readEventById ?? fetchAuthoritativeCalendarEventById,
  });
}

export async function buildAuthoritativeUpdateToolResponse(params: {
  eventId: string;
  backendResponse: GoogleCalendarCreateApiResponse;
} & AuthoritativeMutationReaders): Promise<CalendarToolResponse> {
  return buildAuthoritativeUpdateToolResponseCore({
    eventId: params.eventId,
    backendResponse: params.backendResponse,
    readEventById: params.readEventById ?? fetchAuthoritativeCalendarEventById,
  });
}

export async function buildAuthoritativeDeleteToolResponse(params: {
  eventId: string;
  backendResponse: GoogleCalendarCreateApiResponse;
  deletedEventSnapshot?: VerifiedCalendarEvent | null;
} & AuthoritativeMutationReaders): Promise<CalendarToolResponse> {
  return buildAuthoritativeDeleteToolResponseCore({
    eventId: params.eventId,
    backendResponse: params.backendResponse,
    confirmDeleted: params.confirmDeleted ?? confirmCalendarEventDeleted,
    deletedEventSnapshot: params.deletedEventSnapshot,
  });
}
