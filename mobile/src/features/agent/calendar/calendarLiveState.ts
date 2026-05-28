import type { CalendarEvent } from '@/src/entities/calendar/types';
import { sortEventsChronologically } from '@/src/features/agent/calendar/calendarSchedule';

let liveCalendarEvents: CalendarEvent[] = [];

export function getLiveCalendarEvents() {
  return liveCalendarEvents;
}

export function setLiveCalendarEvents(events: CalendarEvent[]) {
  liveCalendarEvents = sortEventsChronologically([...events]);
}

export function mergeCalendarEventLists(
  primary: CalendarEvent[],
  secondary: CalendarEvent[] = [],
): CalendarEvent[] {
  const byId = new Map<string, CalendarEvent>();

  for (const event of secondary) {
    byId.set(event.id, event);
  }

  for (const event of primary) {
    byId.set(event.id, event);
  }

  return sortEventsChronologically([...byId.values()]);
}

export function upsertLiveCalendarEvent(event: CalendarEvent) {
  liveCalendarEvents = mergeCalendarEventLists([event], liveCalendarEvents);
}
