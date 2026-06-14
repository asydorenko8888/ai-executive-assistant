import type { VerifiedCalendarEvent } from '@/src/features/agent/execution/actionExecutionTypes';

export const MAX_CALENDAR_TOOL_RETRIES = 1;

export type CalendarToolStatus = 'SUCCESS' | 'FAILURE' | 'PENDING';

export type CalendarToolErrorCode =
  | 'GOOGLE_CALENDAR_WRITE_NOT_GRANTED'
  | 'WRITE_SCOPE_MISSING'
  | 'VERIFY_FAILED'
  | 'GOOGLE_WRITE_PERMISSION_MISSING'
  | 'GOOGLE_CALENDAR_NOT_CONNECTED'
  | 'CALENDAR_AUTH_REQUIRED'
  | 'CALENDAR_CONFIRMATION_TIMEOUT'
  | 'CALENDAR_VERIFICATION_FAILED'
  | 'CALENDAR_API_UNAVAILABLE'
  | 'CALENDAR_DATE_PARSE_FAILED'
  | 'CALENDAR_OPERATION_IN_PROGRESS'
  | 'CALENDAR_MAX_RETRIES_EXCEEDED'
  | 'CALENDAR_OPERATION_ERROR'
  | 'CALENDAR_EVENT_NOT_FOUND'
  | 'CALENDAR_READ_FAILED'
  | 'CALENDAR_EVENT_AMBIGUOUS'
  | 'CALENDAR_NO_TIME_CHANGE'
  | 'CALENDAR_RECURRING_DELETE_SCOPE_REQUIRED'
  | 'CALENDAR_ALL_DAY_NOT_SUPPORTED'
  | 'CALENDAR_SCHEDULE_CONFLICT'
  | 'CALENDAR_DUPLICATE_TITLE'
  | 'CALENDAR_SCHEDULE_IN_PAST';

export type CalendarToolResponse = {
  status: CalendarToolStatus;
  eventId?: string;
  error?: string;
  errorCode?: CalendarToolErrorCode;
  event?: VerifiedCalendarEvent;
  verified: boolean;
  verificationFetched: boolean;
};

export function createCalendarToolSuccess(event: VerifiedCalendarEvent): CalendarToolResponse {
  return {
    status: 'SUCCESS',
    eventId: event.id,
    event,
    verified: true,
    verificationFetched: true,
  };
}

export function createCalendarToolFailure(
  errorCode: CalendarToolErrorCode,
  error: string,
): CalendarToolResponse {
  return {
    status: 'FAILURE',
    error,
    errorCode,
    verified: false,
    verificationFetched: false,
  };
}

export function createCalendarToolPending(errorCode: CalendarToolErrorCode, error: string): CalendarToolResponse {
  return {
    status: 'PENDING',
    error,
    errorCode,
    verified: false,
    verificationFetched: false,
  };
}

export function isTerminalCalendarToolStatus(status: CalendarToolStatus) {
  return status === 'SUCCESS' || status === 'FAILURE';
}
