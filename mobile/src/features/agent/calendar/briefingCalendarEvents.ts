import type { CalendarEvent } from '@/src/entities/calendar/types';
import { filterTimedEventsForDay } from '@/src/features/agent/calendar/calendarSchedule';
import { getLocalDayBounds } from '@/src/features/agent/calendar/calendarTime';
import { filterVisibleCalendarEvents } from '@/src/features/agent/calendar/calendarVisibleEvents';
import type { ExecutiveAgentSnapshot } from '@/src/features/agent/types';

export type BriefingCalendarEventSource = 'google_calendar' | 'fallback_demo' | 'disconnected';

export type BriefingCalendarEventsResult = {
  source: BriefingCalendarEventSource;
  events: CalendarEvent[];
  fetchedEventCount: number;
  todayEventCount: number;
};

export function filterFetchedEventsForToday(events: CalendarEvent[], referenceNow: Date) {
  const { dayEnd } = getLocalDayBounds(referenceNow);

  return filterTimedEventsForDay(events, referenceNow, dayEnd.getTime());
}

export function logBriefingCalendarEventSource(params: {
  source: BriefingCalendarEventSource;
  fetchedEventCount: number;
  todayEventCount: number;
  visibleEventCount: number;
  titles: string[];
}) {
  console.log('[Morning Briefing] calendar event source:', {
    source: params.source,
    fetchedEventCount: params.fetchedEventCount,
    todayEventCount: params.todayEventCount,
    visibleEventCount: params.visibleEventCount,
    titles: params.titles,
  });
}

export function resolveBriefingCalendarEvents(params: {
  snapshot: ExecutiveAgentSnapshot;
  referenceNow: Date;
}): BriefingCalendarEventsResult {
  const isCalendarConnected = params.snapshot.calendarConnection?.status === 'connected';

  if (!isCalendarConnected) {
    logBriefingCalendarEventSource({
      source: 'disconnected',
      fetchedEventCount: 0,
      todayEventCount: 0,
      visibleEventCount: 0,
      titles: [],
    });

    return {
      source: 'disconnected',
      events: [],
      fetchedEventCount: 0,
      todayEventCount: 0,
    };
  }

  const fetchedEvents = params.snapshot.upcomingCalendarEvents;
  const todayEvents = filterFetchedEventsForToday(fetchedEvents, params.referenceNow);
  const visibleEvents = filterVisibleCalendarEvents(todayEvents, params.referenceNow);

  logBriefingCalendarEventSource({
    source: 'google_calendar',
    fetchedEventCount: fetchedEvents.length,
    todayEventCount: todayEvents.length,
    visibleEventCount: visibleEvents.length,
    titles: visibleEvents.map((event) => event.title),
  });

  return {
    source: 'google_calendar',
    events: visibleEvents,
    fetchedEventCount: fetchedEvents.length,
    todayEventCount: todayEvents.length,
  };
}
