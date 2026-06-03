import { refreshCalendarAuthCapabilities } from '@/src/features/agent/calendar/calendarAuthCapabilities';
import type { CalendarAuthCapabilities } from '@/src/features/agent/calendar/calendarAuthCapabilities';

export type CalendarWriteAccessState = {
  connected: boolean;
  hasWriteAccess: boolean;
  writeEnabled: boolean;
  hasCalendarEventsScope: boolean;
  scopes: string[];
  connectedEmail?: string;
  source: 'backend' | 'local' | 'merged';
  canReadCalendar: boolean;
  canWriteCalendar: boolean;
  inSync: boolean;
  capabilities: CalendarAuthCapabilities;
};

export async function resolveCalendarWriteAccessState(): Promise<CalendarWriteAccessState> {
  const capabilities = await refreshCalendarAuthCapabilities({ heal: true });

  return {
    connected: capabilities.canReadCalendar,
    hasWriteAccess: capabilities.canWriteCalendar,
    writeEnabled: capabilities.canWriteCalendar,
    hasCalendarEventsScope: capabilities.canWriteCalendar,
    scopes: capabilities.scopes,
    connectedEmail: capabilities.connectedEmail,
    source: capabilities.backendStatus ? 'backend' : capabilities.localConnected ? 'local' : 'merged',
    canReadCalendar: capabilities.canReadCalendar,
    canWriteCalendar: capabilities.canWriteCalendar,
    inSync: capabilities.inSync,
    capabilities,
  };
}
