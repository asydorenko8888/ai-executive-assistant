import type { CalendarCreateEventPayload } from '@/src/features/agent/execution/actionExecutionTypes';
import type { GoogleCalendarSession } from '@/src/features/agent/calendar/googleCalendarStorage';
import { apiClient } from '@/src/shared/api';

export type GoogleCalendarBackendStatus = {
  connected: boolean;
  hasWriteAccess: boolean;
  connectedEmail?: string;
  expiresAt?: string;
  scopes: string[];
};

export type GoogleCalendarBackendEvent = {
  id: string;
  summary: string;
  location?: string;
  startsAt: string;
  endsAt: string;
  htmlLink?: string;
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
  return apiClient.post<{ event: GoogleCalendarBackendEvent; verified: boolean }, CalendarCreateEventPayload>({
    path: '/google-calendar/events',
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
  }>({
    path: '/google-calendar/pending-actions/resume',
  });

  if (!response.resumed || !response.event) {
    return null;
  }

  return {
    actionId: response.actionId ?? '',
    transcript: response.transcript ?? '',
    languageCode: response.languageCode ?? 'en-US',
    event: response.event,
    verified: Boolean(response.verified),
  };
}

export async function disconnectGoogleCalendarOnBackend() {
  return apiClient.delete<{ disconnected: boolean }>({
    path: '/google-calendar/session',
  });
}
