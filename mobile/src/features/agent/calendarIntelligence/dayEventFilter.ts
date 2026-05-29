import type { CalendarEvent } from '@/src/entities/calendar/types';
import {
  isCancelledCalendarEvent,
  isTimedCalendarEvent,
  sortEventsChronologically,
} from '@/src/features/agent/calendar/calendarSchedule';
import type { CalendarDayContext } from '@/src/features/agent/calendarIntelligence/types';

function isDaySchedulableEvent(event: CalendarEvent) {
  return (
    !isCancelledCalendarEvent(event) &&
    isTimedCalendarEvent(event) &&
    Boolean(event.title.trim())
  );
}

export function filterRawEventsForDay(events: CalendarEvent[], day: CalendarDayContext) {
  return sortEventsChronologically(events.filter(isDaySchedulableEvent)).filter((event) => {
    const start = Date.parse(event.startsAt);

    if (Number.isNaN(start)) {
      return false;
    }

    return start >= day.range.rangeStartMs && start < day.range.rangeEndMs;
  });
}
