import type { CalendarEvent } from '@/src/entities/calendar/types';
import type { AgendaItem } from '@/src/entities/home/types';
import { formatLocationShort } from '@/src/features/agent/calendar/calendarLocation';
import { formatTimeInLocalTimezone } from '@/src/features/agent/calendar/calendarTime';
import { filterVisibleCalendarEvents } from '@/src/features/agent/calendar/calendarVisibleEvents';

export { filterVisibleCalendarEvents } from '@/src/features/agent/calendar/calendarVisibleEvents';

export const CALENDAR_SUMMARY_EVENT_LIMIT = 3;

export type VisibleCalendarAgendaSource = 'demo' | 'google_calendar';

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

export function resolveVisibleCalendarAgenda(params: {
  isCalendarConnected: boolean;
  upcomingEvents: CalendarEvent[];
  demoAgenda: AgendaItem[];
  referenceDate?: Date;
  limit?: number;
}): VisibleCalendarAgendaResult {
  const referenceNow = params.referenceDate ?? new Date();
  const limit = params.limit ?? CALENDAR_SUMMARY_EVENT_LIMIT;
  const totalRawEvents = params.upcomingEvents.length;

  if (!params.isCalendarConnected) {
    const visibleCalendarAgendaItems = params.demoAgenda.slice(0, limit);

    console.log(
      '[Calendar Count]',
      'demo',
      params.demoAgenda.length,
      visibleCalendarAgendaItems.length,
      visibleCalendarAgendaItems.map((item) => item.title),
    );

    return {
      source: 'demo',
      totalRawEvents: params.demoAgenda.length,
      visibleEvents: [],
      visibleCalendarAgendaItems,
    };
  }

  const visibleEvents = filterVisibleCalendarEvents(params.upcomingEvents, referenceNow);
  const visibleCalendarAgendaItems = mapCalendarEventsToAgenda(visibleEvents, limit);

  console.log(
    '[Calendar Count]',
    'google_calendar',
    totalRawEvents,
    visibleCalendarAgendaItems.length,
    visibleCalendarAgendaItems.map((item) => item.title),
  );

  return {
    source: 'google_calendar',
    totalRawEvents,
    visibleEvents,
    visibleCalendarAgendaItems,
  };
}

/** @deprecated Use resolveVisibleCalendarAgenda().visibleCalendarAgendaItems */
export function resolveHomeCalendarAgenda(params: {
  isCalendarConnected: boolean;
  upcomingEvents: CalendarEvent[];
  demoAgenda: AgendaItem[];
  referenceDate?: Date;
  limit?: number;
}): AgendaItem[] {
  return resolveVisibleCalendarAgenda(params).visibleCalendarAgendaItems;
}
