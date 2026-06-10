import type { CalendarEvent } from '@/src/entities/calendar/types';
import type { AgendaItem } from '@/src/entities/home/types';
import {
  logBriefingCalendarEventSource,
  resolveBriefingCalendarEvents,
} from '@/src/features/agent/calendar/briefingCalendarEvents';
import { formatLocationShort } from '@/src/features/agent/calendar/calendarLocation';
import { getEventStartTimestamp } from '@/src/features/agent/calendar/calendarSchedule';
import { formatTimeInLocalTimezone, getLocalEndOfDay } from '@/src/features/agent/calendar/calendarTime';
import type { ExecutiveAgentSnapshot } from '@/src/features/agent/types';

export { filterVisibleCalendarEvents } from '@/src/features/agent/calendar/calendarVisibleEvents';
export { logBriefingCalendarEventSource } from '@/src/features/agent/calendar/briefingCalendarEvents';

export const CALENDAR_SUMMARY_EVENT_LIMIT = 3;
export const NO_CALENDAR_EVENTS_TODAY_MESSAGE = 'No calendar events for today';

export type VisibleCalendarAgendaSource = 'disconnected' | 'google_calendar' | 'fallback_demo';

export type VisibleCalendarAgendaResult = {
  source: VisibleCalendarAgendaSource;
  totalRawEvents: number;
  visibleEvents: CalendarEvent[];
  visibleCalendarAgendaItems: AgendaItem[];
};

export function mapCalendarEventsToAgenda(
  events: CalendarEvent[],
  limit = CALENDAR_SUMMARY_EVENT_LIMIT,
): AgendaItem[] {
  return events.slice(0, limit).map((event) => {
    const locationLabel = event.location ? formatLocationShort(event.location) || event.location : '';

    return {
      id: event.id,
      startsAt: event.startsAt,
      time: formatTimeInLocalTimezone(event.startsAt),
      title: event.title,
      detail: locationLabel || 'Calendar event',
    };
  });
}

export function formatEventsTodayLabel(eventCount: number): string {
  const safeCount = Math.max(0, eventCount);
  return `${safeCount} event${safeCount === 1 ? '' : 's'} today`;
}

export function countUpcomingEventsToday(events: CalendarEvent[], referenceNow: Date) {
  const nowTimestamp = referenceNow.getTime();
  const endOfToday = getLocalEndOfDay(referenceNow).getTime();

  return events.filter((event) => {
    const startTimestamp = getEventStartTimestamp(event);

    return (
      startTimestamp !== null &&
      startTimestamp > nowTimestamp &&
      startTimestamp < endOfToday
    );
  }).length;
}

export function resolveVisibleCalendarAgenda(params: {
  isCalendarConnected: boolean;
  upcomingEvents: CalendarEvent[];
  referenceDate?: Date;
  limit?: number;
  snapshot?: Pick<ExecutiveAgentSnapshot, 'calendarConnection' | 'upcomingCalendarEvents'>;
}): VisibleCalendarAgendaResult {
  const referenceNow = params.referenceDate ?? new Date();
  const limit = params.limit ?? CALENDAR_SUMMARY_EVENT_LIMIT;

  if (!params.isCalendarConnected) {
    logBriefingCalendarEventSource({
      source: 'disconnected',
      fetchedEventCount: 0,
      todayEventCount: 0,
      visibleEventCount: 0,
      titles: [],
    });

    return {
      source: 'disconnected',
      totalRawEvents: 0,
      visibleEvents: [],
      visibleCalendarAgendaItems: [],
    };
  }

  const resolved = resolveBriefingCalendarEvents({
    snapshot: params.snapshot ?? {
      calendarConnection: { provider: 'google', status: 'connected' },
      upcomingCalendarEvents: params.upcomingEvents,
    },
    referenceNow,
  });
  const visibleCalendarAgendaItems = mapCalendarEventsToAgenda(resolved.events, limit);

  return {
    source: resolved.source === 'google_calendar' ? 'google_calendar' : 'fallback_demo',
    totalRawEvents: resolved.fetchedEventCount,
    visibleEvents: resolved.events,
    visibleCalendarAgendaItems,
  };
}

/** @deprecated Use resolveVisibleCalendarAgenda().visibleCalendarAgendaItems */
export function resolveHomeCalendarAgenda(params: {
  isCalendarConnected: boolean;
  upcomingEvents: CalendarEvent[];
  referenceDate?: Date;
  limit?: number;
}): AgendaItem[] {
  return resolveVisibleCalendarAgenda(params).visibleCalendarAgendaItems;
}
