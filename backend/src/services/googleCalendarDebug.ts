import {
  buildTokenDebugLog,
  CALENDAR_EVENTS_WRITE_SCOPE,
  getGoogleCalendarConnectionStatus,
  getGoogleCalendarTokens,
} from './googleCalendarTokenStore.js';

export async function getGoogleCalendarDebugSnapshot(deviceId: string) {
  const [status, tokens] = await Promise.all([
    getGoogleCalendarConnectionStatus(deviceId),
    getGoogleCalendarTokens(deviceId),
  ]);

  const tokenDebug = buildTokenDebugLog(tokens);

  return {
    authStatus: status.connected ? 'connected' : 'not_connected',
    calendarConnected: status.connected,
    writeEnabled: status.writeEnabled,
    hasWriteAccess: status.hasWriteAccess,
    hasCalendarEventsScope: status.hasCalendarEventsScope,
    requiredScope: CALENDAR_EVENTS_WRITE_SCOPE,
    scopes: status.scopes,
    connectedEmail: status.connectedEmail ?? null,
    expiresAt: status.expiresAt ?? null,
    token: tokenDebug,
  };
}
