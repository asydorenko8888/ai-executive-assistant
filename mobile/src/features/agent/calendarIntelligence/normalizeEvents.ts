import type { CalendarEvent } from '@/src/entities/calendar/types';
import {
  getEventEndTimestamp,
  getEventStartTimestamp,
  isCancelledCalendarEvent,
  isTimedCalendarEvent,
  sortEventsChronologically,
} from '@/src/features/agent/calendar/calendarSchedule';
import { DEFAULT_CALENDAR_INTELLIGENCE_TIMEZONE } from '@/src/features/agent/calendarIntelligence/resolveTargetDay';
import type { NormalizedCalendarEvent } from '@/src/features/agent/calendarIntelligence/types';
import {
  zonedDateKeyFromInstant,
  zonedMinutesFromInstant,
} from '@/src/features/agent/calendarIntelligence/zonedEventTime';

function isSchedulableEvent(event: CalendarEvent) {
  if (isCancelledCalendarEvent(event) || !isTimedCalendarEvent(event)) {
    return false;
  }

  if (getEventStartTimestamp(event) === null || getEventEndTimestamp(event) === null) {
    return false;
  }

  return Boolean(event.title.trim());
}

export function normalizeCalendarEvents(
  events: CalendarEvent[],
  timeZone = DEFAULT_CALENDAR_INTELLIGENCE_TIMEZONE,
): NormalizedCalendarEvent[] {
  const raw = sortEventsChronologically(events).filter(isSchedulableEvent);

  console.log(
    '[Calendar Raw Events]',
    raw.map((event) => ({
      id: event.id,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
    })),
  );

  const normalized = raw
    .map((event): NormalizedCalendarEvent | null => {
      const dateKey = zonedDateKeyFromInstant(event.startsAt, timeZone);
      const startMinutes = zonedMinutesFromInstant(event.startsAt, timeZone);
      const endMinutes = zonedMinutesFromInstant(event.endsAt, timeZone);

      if (dateKey === null || startMinutes === null || endMinutes === null) {
        return null;
      }

      return {
        id: event.id,
        title: event.title.trim(),
        startISO: event.startsAt,
        endISO: event.endsAt,
        startMinutes,
        endMinutes: Math.max(endMinutes, startMinutes + 1),
        dateKey,
        location: event.location,
      };
    })
    .filter((event): event is NormalizedCalendarEvent => event !== null)
    .sort((left, right) => {
      if (left.startMinutes !== right.startMinutes) {
        return left.startMinutes - right.startMinutes;
      }

      return left.title.localeCompare(right.title);
    });

  console.log('[Calendar Normalized Events]', normalized);

  return normalized;
}
