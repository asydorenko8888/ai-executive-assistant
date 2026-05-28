import type { CalendarEvent } from '@/src/entities/calendar/types';
import { filterVisibleCalendarEvents } from '@/src/features/agent/calendar/calendarVisibleEvents';
import { formatTimeInLocalTimezone } from '@/src/features/agent/calendar/calendarTime';
import type { ExecutiveAgentSnapshot } from '@/src/features/agent/types';

export function formatAssistantCalendarEvent(event: CalendarEvent): string {
  const time = formatTimeInLocalTimezone(event.startsAt);
  const locationSuffix = event.location ? ` — ${event.location}` : '';

  return `${time} — ${event.title}${locationSuffix}`;
}

export function getAssistantVisibleCalendarEvents(
  snapshot: ExecutiveAgentSnapshot,
  referenceNow: Date,
): CalendarEvent[] {
  if (snapshot.calendarConnection?.status !== 'connected') {
    return [];
  }

  return filterVisibleCalendarEvents(snapshot.upcomingCalendarEvents, referenceNow);
}

export function buildAssistantVisibleCalendarEventsLine(events: CalendarEvent[]): string {
  if (events.length === 0) {
    return 'No remaining timed events are scheduled on the connected Google Calendar for today.';
  }

  const formattedEvents = events.map(formatAssistantCalendarEvent);

  return `Visible Google Calendar events for today (authoritative list; mention only these, do not invent others): ${formattedEvents.join('; ')}.`;
}
