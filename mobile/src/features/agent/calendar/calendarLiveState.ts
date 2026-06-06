import type { CalendarEvent } from '@/src/entities/calendar/types';
import { deduplicateCalendarEvents } from '@/src/features/agent/calendar/calendarEventDeduplication';
import { sortEventsChronologically } from '@/src/features/agent/calendar/calendarSchedule';

let liveCalendarEvents: CalendarEvent[] = [];
let liveCalendarEventsRefreshedAt: number | null = null;

export function getLiveCalendarEvents() {
  return liveCalendarEvents;
}

export function getLiveCalendarEventsRefreshedAt() {
  return liveCalendarEventsRefreshedAt;
}

export function setLiveCalendarEvents(events: CalendarEvent[]) {
  liveCalendarEvents = deduplicateCalendarEvents(events);
  liveCalendarEventsRefreshedAt = Date.now();
}

export function replaceLiveCalendarEvents(events: CalendarEvent[]) {
  setLiveCalendarEvents(events);
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

  return deduplicateCalendarEvents(sortEventsChronologically([...byId.values()]));
}

export function upsertLiveCalendarEvent(event: CalendarEvent) {
  liveCalendarEvents = mergeCalendarEventLists([event], liveCalendarEvents);
}
