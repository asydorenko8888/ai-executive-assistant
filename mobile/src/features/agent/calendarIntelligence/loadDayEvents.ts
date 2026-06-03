import type { CalendarEvent } from '@/src/entities/calendar/types';
import { loadCalendarQueryEvents } from '@/src/features/agent/calendar/calendarQueryEventSource';
import type { CalendarDayContext } from '@/src/features/agent/calendarIntelligence/types';

export { filterRawEventsForDay } from '@/src/features/agent/calendarIntelligence/dayEventFilter';

export async function loadCalendarEventsForTargetDay(params: {
  referenceNow: Date;
  day: CalendarDayContext;
  transcript?: string;
}): Promise<CalendarEvent[]> {
  const { events } = await loadCalendarQueryEvents({
    referenceNow: params.referenceNow,
    day: params.day,
    transcript: params.transcript,
  });

  return events;
}
