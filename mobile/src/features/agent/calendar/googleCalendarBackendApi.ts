import type { CalendarCreateEventPayload, CalendarUpdateEventPayload } from '@/src/features/agent/execution/actionExecutionTypes';
import type { CalendarExecutionState } from '@/src/features/agent/execution/calendarExecutionStates';
import type { GoogleCalendarSession } from '@/src/features/agent/calendar/googleCalendarStorage';
import { apiClient } from '@/src/shared/api';

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
  verified: boolean;
  verificationFetched: boolean;
  executionState: CalendarExecutionState;
};

export type PendingCalendarCreateAction = {
  id: string;
  type: 'calendar.create';
  payload: CalendarCreateEventPayload;
  transcript: string;
  languageCode: string;
  createdAt: string;
};

export async function fetchGoogleCalendarBackendStatus() {
  return apiClient.get<GoogleCalendarBackendStatus>({
    path: '/google-calendar/status',
  });
}

export async function fetchGoogleCalendarDebugSnapshot() {
  return apiClient.get<GoogleCalendarDebugSnapshot>({
    path: '/google-calendar/debug',
  });
}

export async function runGoogleCalendarTestInsert(timeZone?: string) {
  return apiClient.post<{
    status: string;
    code?: string;
    message?: string;
    eventId?: string;
    event?: GoogleCalendarBackendEvent;
  }>({
    path: '/google-calendar/debug/test-insert',
    body: timeZone ? { timeZone } : {},
  });
}

export async function syncGoogleCalendarSessionToBackend(session: GoogleCalendarSession) {
  return apiClient.post<GoogleCalendarBackendStatus, {
    accessToken: string;
    refreshToken?: string;
    tokenType?: string;
    scopes: string[];
    expiresAt?: string;
    connectedEmail?: string;
  }>({
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
  return apiClient.post<GoogleCalendarCreateApiResponse, CalendarCreateEventPayload>({
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

  return apiClient.get<{
    events: GoogleCalendarBackendEvent[];
  }>({
    path: `/google-calendar/events?${query.toString()}`,
  });
}

export async function fetchGoogleCalendarEventByIdFromBackend(eventId: string) {
  return apiClient.get<{
    event: GoogleCalendarBackendEvent;
  }>({
    path: `/google-calendar/events/${encodeURIComponent(eventId)}`,
  });
}

export async function deleteGoogleCalendarEventOnBackend(eventId: string) {
  return apiClient.delete<GoogleCalendarCreateApiResponse>({
    path: `/google-calendar/events/${encodeURIComponent(eventId)}`,
  });
}

export async function updateGoogleCalendarEventOnBackend(
  eventId: string,
  payload: CalendarUpdateEventPayload,
) {
  return apiClient.patch<GoogleCalendarCreateApiResponse, CalendarUpdateEventPayload>({
    path: `/google-calendar/events/${encodeURIComponent(eventId)}`,
    body: payload,
  });
}

export async function enqueueCalendarCreatePendingAction(params: {
  payload: CalendarCreateEventPayload;
  transcript: string;
  languageCode: string;
}) {
  return apiClient.post<{ action: PendingCalendarCreateAction }, typeof params & { type: 'calendar.create' }>({
    path: '/google-calendar/pending-actions',
    body: {
      type: 'calendar.create',
      ...params,
    },
  });
}

export async function resumeGoogleCalendarPendingActions() {
  const response = await apiClient.post<{
    resumed?: boolean;
    actionId?: string;
    transcript?: string;
    languageCode?: string;
    event?: GoogleCalendarBackendEvent;
    verified?: boolean;
    verificationFetched?: boolean;
    executionState?: CalendarExecutionState;
  }>({
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
  return apiClient.delete<{ disconnected: boolean }>({
    path: '/google-calendar/session',
  });
}
