import type { CalendarEvent } from '@/src/entities/calendar/types';
import type { AgendaItem } from '@/src/entities/home/types';
import { formatLocationShort } from '@/src/features/agent/calendar/calendarLocation';
import { formatTimeInLocalTimezone } from '@/src/features/agent/calendar/calendarTime';

const CALENDAR_SUMMARY_EVENT_LIMIT = 3;

export function mapCalendarEventsToAgenda(
  events: CalendarEvent[],
  limit = CALENDAR_SUMMARY_EVENT_LIMIT,
): AgendaItem[] {
  return events.slice(0, limit).map((event) => {
    const locationLabel = event.location ? formatLocationShort(event.location) || event.location : '';

    return {
      time: event.isAllDay ? 'All day' : formatTimeInLocalTimezone(event.startsAt),
      title: event.title,
      detail: locationLabel || 'Calendar event',
    };
  });
}

export function resolveHomeCalendarAgenda(params: {
  isCalendarConnected: boolean;
  upcomingEvents: CalendarEvent[];
  demoAgenda: AgendaItem[];
}): AgendaItem[] {
  if (!params.isCalendarConnected) {
    console.log('[Calendar Fix] Calendar Summary — using demo agenda (not connected)', {
      demoTitles: params.demoAgenda.map((item) => item.title),
    });
    return params.demoAgenda;
  }

  const agenda = mapCalendarEventsToAgenda(params.upcomingEvents);

  console.log('[Calendar Fix] Calendar Summary — using real Google Calendar events', {
    source: 'orchestrator.snapshot.upcomingCalendarEvents',
    totalUpcoming: params.upcomingEvents.length,
    displayedTitles: agenda.map((item) => item.title),
    realEventTitles: params.upcomingEvents.slice(0, 8).map((event) => event.title),
  });

  return agenda;
}
