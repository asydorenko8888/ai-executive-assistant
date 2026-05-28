import {
  fetchGoogleCalendarBackendStatus,
  type GoogleCalendarBackendStatus,
} from '@/src/features/agent/calendar/googleCalendarBackendApi';
import { getGoogleCalendarConnection } from '@/src/features/agent/calendar/googleCalendarAuth';
import { loadGoogleCalendarSession, type GoogleCalendarSession } from '@/src/features/agent/calendar/googleCalendarStorage';

const WRITE_SCOPE_MARKERS = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar',
] as const;

export function sessionHasCalendarWriteScope(session: GoogleCalendarSession | null) {
  if (!session) {
    return false;
  }

  const joined = session.scopes.join(' ').toLowerCase();

  return WRITE_SCOPE_MARKERS.some((scope) => joined.includes(scope));
}

export type CalendarWriteAccessState = {
  connected: boolean;
  hasWriteAccess: boolean;
  connectedEmail?: string;
  source: 'backend' | 'local' | 'merged';
};

function mergeAccessState(
  backend: GoogleCalendarBackendStatus | null,
  localConnected: boolean,
  localWrite: boolean,
): CalendarWriteAccessState {
  const connected = Boolean(backend?.connected || localConnected);
  const hasWriteAccess = Boolean(backend?.hasWriteAccess || localWrite);

  return {
    connected,
    hasWriteAccess,
    connectedEmail: backend?.connectedEmail,
    source: backend ? 'merged' : localConnected ? 'local' : 'backend',
  };
}

export async function resolveCalendarWriteAccessState(): Promise<CalendarWriteAccessState> {
  const [backendStatus, localConnection, localSession] = await Promise.all([
    fetchGoogleCalendarBackendStatus().catch(() => null),
    getGoogleCalendarConnection(),
    loadGoogleCalendarSession(),
  ]);

  const localConnected = localConnection.status === 'connected';
  const localWrite = sessionHasCalendarWriteScope(localSession);

  return mergeAccessState(backendStatus, localConnected, localWrite);
}
