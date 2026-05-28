import type { CalendarEvent } from '@/src/entities/calendar/types';
import {
  filterUpcomingTimedEvents,
  getEventEndTimestamp,
  getEventStartTimestamp,
  isCancelledCalendarEvent,
  isTimedCalendarEvent,
} from '@/src/features/agent/calendar/calendarSchedule';

function isVisibleCalendarEvent(event: CalendarEvent): boolean {
  if (isCancelledCalendarEvent(event)) {
    return false;
  }

  if (!isTimedCalendarEvent(event)) {
    return false;
  }

  if (getEventStartTimestamp(event) === null || getEventEndTimestamp(event) === null) {
    return false;
  }

  if (!event.title.trim()) {
    return false;
  }

  return true;
}

export function filterVisibleCalendarEvents(
  events: CalendarEvent[],
  referenceNow: Date,
): CalendarEvent[] {
  return filterUpcomingTimedEvents(
    events.filter(isVisibleCalendarEvent),
    referenceNow,
  );
}
