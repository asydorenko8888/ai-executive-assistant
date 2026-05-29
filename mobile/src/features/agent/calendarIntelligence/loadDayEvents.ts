import type { CalendarEvent } from '@/src/entities/calendar/types';
import { fetchCalendarEventsForZonedDay } from '@/src/features/agent/calendar/calendarAgendaQuery';
import {
  isCancelledCalendarEvent,
  isTimedCalendarEvent,
  sortEventsChronologically,
} from '@/src/features/agent/calendar/calendarSchedule';
import type { CalendarDayContext } from '@/src/features/agent/calendarIntelligence/types';

export { filterRawEventsForDay } from '@/src/features/agent/calendarIntelligence/dayEventFilter';

function isDaySchedulableEvent(event: CalendarEvent) {
  return (
    !isCancelledCalendarEvent(event) &&
    isTimedCalendarEvent(event) &&
    Boolean(event.title.trim())
  );
}

export async function loadCalendarEventsForTargetDay(params: {
  referenceNow: Date;
  day: CalendarDayContext;
}): Promise<CalendarEvent[]> {
  const { events } = await fetchCalendarEventsForZonedDay(params.referenceNow, params.day.dayOffset);

  return sortEventsChronologically(events.filter(isDaySchedulableEvent));
}
