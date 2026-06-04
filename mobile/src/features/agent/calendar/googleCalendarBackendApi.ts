import type { CalendarCreateEventPayload, CalendarUpdateEventPayload } from '@/src/features/agent/execution/actionExecutionTypes';
import type { CalendarExecutionState } from '@/src/features/agent/execution/calendarExecutionStates';
import type { GoogleCalendarSession } from '@/src/features/agent/calendar/googleCalendarStorage';
import { calendarBackendRequest } from '@/src/features/agent/calendar/calendarBackendRequest';

export type GoogleCalendarBackendStatus = {
  connected: boolean;
  hasWriteAccess: boolean;
  writeEnabled?: boolean;
  hasCalendarEventsScope?: boolean;
  connectedEmail?: string;
  expiresAt?: string;
  scopes: string[];
  authStatus?: string;
  requiredScope?: string;
  token?: {
    accessToken: string | null;
    refreshTokenPresent: boolean;
    scopes: string[];
    hasCalendarEventsScope?: boolean;
  };
};

export type GoogleCalendarDebugSnapshot = GoogleCalendarBackendStatus & {
  authStatus?: string;
  calendarConnected?: boolean;
  requiredScope?: string;
  lastTestInsert?: {
    status: string;
    code?: string;
    message?: string;
    eventId?: string;
  };
};

export type GoogleCalendarBackendEvent = {
  id: string;
  summary: string;
  location?: string;
  startsAt: string;
  endsAt: string;
  htmlLink?: string;
};

export type GoogleCalendarCreateApiResponse = {
  event: GoogleCalendarBackendEvent;
  eventId?: string;
  verified: boolean;
  verificationFetched: boolean;
  executionState?: CalendarExecutionState;
  status?: string;
  code?: string;
};

export function normalizeGoogleCalendarMutationApiResponse(
  response: GoogleCalendarCreateApiResponse,
): GoogleCalendarCreateApiResponse {
  const executionState =
    response.executionState ??
    (response.status === 'SUCCESS' || response.code === 'SUCCESS' ? 'success' : 'failed');

  return {
    ...response,
    executionState,
  };
}

export type PendingCalendarCreateAction = {
  id: string;
  type: 'calendar.create';
  payload: CalendarCreateEventPayload;
  transcript: string;
  languageCode: string;
  createdAt: string;
};

export async function fetchGoogleCalendarBackendStatus() {
  return calendarBackendRequest<GoogleCalendarBackendStatus>({
    operation: 'status',
    action: 'GET /google-calendar/status',
    method: 'GET',
    path: '/google-calendar/status',
  });
}

export async function fetchGoogleCalendarDebugSnapshot() {
  return calendarBackendRequest<GoogleCalendarDebugSnapshot>({
    operation: 'status',
    action: 'GET /google-calendar/debug',
    method: 'GET',
    path: '/google-calendar/debug',
  });
}

export async function runGoogleCalendarTestInsert(timeZone?: string) {
  return calendarBackendRequest<{
    status: string;
    code?: string;
    message?: string;
    eventId?: string;
    event?: GoogleCalendarBackendEvent;
  }>({
    operation: 'create',
    action: 'POST /google-calendar/debug/test-insert',
    method: 'POST',
    path: '/google-calendar/debug/test-insert',
    body: timeZone ? { timeZone } : {},
  });
}

export async function syncGoogleCalendarSessionToBackend(session: GoogleCalendarSession) {
  return calendarBackendRequest<GoogleCalendarBackendStatus, {
    accessToken: string;
    refreshToken?: string;
    tokenType?: string;
    scopes: string[];
    expiresAt?: string;
    connectedEmail?: string;
  }>({
    operation: 'session',
    action: 'POST /google-calendar/session',
    method: 'POST',
    path: '/google-calendar/session',
    body: {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      tokenType: session.tokenType,
      scopes: session.scopes,
      expiresAt: session.expiresAt,
      connectedEmail: session.connectedEmail,
    },
  });
}

export async function createGoogleCalendarEventOnBackend(payload: CalendarCreateEventPayload) {
  return calendarBackendRequest<GoogleCalendarCreateApiResponse, CalendarCreateEventPayload>({
    operation: 'create',
    action: 'POST /google-calendar/events',
    method: 'POST',
    path: '/google-calendar/events',
    body: payload,
  });
}

export async function fetchGoogleCalendarEventsFromBackend(params: {
  timeMin: string;
  timeMax: string;
}) {
  const query = new URLSearchParams({
    timeMin: params.timeMin,
    timeMax: params.timeMax,
  });

  return calendarBackendRequest<{
    events: GoogleCalendarBackendEvent[];
  }>({
    operation: 'search',
    action: 'GET /google-calendar/events',
    method: 'GET',
    path: `/google-calendar/events?${query.toString()}`,
  });
}

export async function fetchGoogleCalendarEventByIdFromBackend(eventId: string) {
  return calendarBackendRequest<{
    event: GoogleCalendarBackendEvent;
  }>({
    operation: 'read',
    action: 'GET /google-calendar/events/:id',
    method: 'GET',
    path: `/google-calendar/events/${encodeURIComponent(eventId)}`,
  });
}

export async function deleteGoogleCalendarEventOnBackend(eventId: string) {
  return calendarBackendRequest<GoogleCalendarCreateApiResponse>({
    operation: 'delete',
    action: 'DELETE /google-calendar/events/:id',
    method: 'DELETE',
    path: `/google-calendar/events/${encodeURIComponent(eventId)}`,
  });
}

export async function updateGoogleCalendarEventOnBackend(
  eventId: string,
  payload: CalendarUpdateEventPayload,
) {
  return calendarBackendRequest<GoogleCalendarCreateApiResponse, CalendarUpdateEventPayload>({
    operation: 'update',
    action: 'PATCH /google-calendar/events/:id',
    method: 'PATCH',
    path: `/google-calendar/events/${encodeURIComponent(eventId)}`,
    body: payload,
  });
}

export async function enqueueCalendarCreatePendingAction(params: {
  payload: CalendarCreateEventPayload;
  transcript: string;
  languageCode: string;
}) {
  return calendarBackendRequest<{ action: PendingCalendarCreateAction }, typeof params & { type: 'calendar.create' }>({
    operation: 'create',
    action: 'POST /google-calendar/pending-actions',
    method: 'POST',
    path: '/google-calendar/pending-actions',
    body: {
      type: 'calendar.create',
      ...params,
    },
  });
}

export async function resumeGoogleCalendarPendingActions() {
  const response = await calendarBackendRequest<{
    resumed?: boolean;
    actionId?: string;
    transcript?: string;
    languageCode?: string;
    event?: GoogleCalendarBackendEvent;
    verified?: boolean;
    verificationFetched?: boolean;
    executionState?: CalendarExecutionState;
  }>({
    operation: 'create',
    action: 'POST /google-calendar/pending-actions/resume',
    method: 'POST',
    path: '/google-calendar/pending-actions/resume',
  });

  if (!response.resumed || !response.event || !response.verified || !response.verificationFetched) {
    return null;
  }

  return {
    actionId: response.actionId ?? '',
    transcript: response.transcript ?? '',
    languageCode: response.languageCode ?? 'en-US',
    event: response.event,
    verified: true,
    verificationFetched: true,
    executionState: response.executionState ?? 'success',
  };
}

export async function disconnectGoogleCalendarOnBackend() {
  return calendarBackendRequest<{ disconnected: boolean }>({
    operation: 'session',
    action: 'DELETE /google-calendar/session',
    method: 'DELETE',
    path: '/google-calendar/session',
  });
}
