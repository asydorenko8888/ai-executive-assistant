import {
  fetchGoogleCalendarBackendStatus,
  type GoogleCalendarBackendStatus,
} from '@/src/features/agent/calendar/googleCalendarBackendApi';
import { getGoogleCalendarConnection } from '@/src/features/agent/calendar/googleCalendarAuth';
import {
  scopesIncludeCalendarEventsWrite,
  scopesIncludeCalendarWrite,
} from '@/src/features/agent/calendar/googleCalendarScopes';
import { isCalendarWriteAvailableInSession } from '@/src/features/agent/calendar/calendarWriteSession';
import { loadGoogleCalendarSession, type GoogleCalendarSession } from '@/src/features/agent/calendar/googleCalendarStorage';

export function sessionHasCalendarWriteScope(session: GoogleCalendarSession | null) {
  if (!session) {
    return false;
  }

  return scopesIncludeCalendarWrite(session.scopes);
}

export function sessionHasCalendarEventsWriteScope(session: GoogleCalendarSession | null) {
  if (!session) {
    return false;
  }

  return scopesIncludeCalendarEventsWrite(session.scopes);
}

export type CalendarWriteAccessState = {
  connected: boolean;
  hasWriteAccess: boolean;
  writeEnabled: boolean;
  hasCalendarEventsScope: boolean;
  scopes: string[];
  connectedEmail?: string;
  source: 'backend' | 'local' | 'merged';
};

function mergeAccessState(
  backend: GoogleCalendarBackendStatus | null,
  localConnected: boolean,
  localWrite: boolean,
  localSession: GoogleCalendarSession | null,
): CalendarWriteAccessState {
  const connected = Boolean(backend?.connected || localConnected);
  const backendScopes = backend?.scopes ?? localSession?.scopes ?? [];
  const hasCalendarEventsScope =
    Boolean(backend?.hasCalendarEventsScope) ||
    scopesIncludeCalendarEventsWrite(backendScopes) ||
    sessionHasCalendarEventsWriteScope(localSession);
  const hasWriteAccess = Boolean(backend?.hasWriteAccess || localWrite);
  const writeEnabled = Boolean(backend?.writeEnabled ?? hasCalendarEventsScope);

  return {
    connected,
    hasWriteAccess,
    writeEnabled,
    hasCalendarEventsScope,
    scopes: backendScopes,
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

  const merged = mergeAccessState(backendStatus, localConnected, localWrite, localSession);

  if (isCalendarWriteAvailableInSession() && merged.connected) {
    return {
      ...merged,
      hasWriteAccess: true,
      writeEnabled: true,
      hasCalendarEventsScope: true,
      source: 'merged',
    };
  }

  return merged;
}
