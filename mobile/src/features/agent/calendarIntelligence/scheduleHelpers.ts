import { parseGoogleCalendarInstant } from '@/src/features/agent/calendar/calendarTime';
import { getZonedTimeParts, zonedLocalToUtcMs } from '@/src/features/agent/calendar/calendarTimezone';
import type {
  CalendarDayContext,
  CalendarFreeSlot,
  NormalizedCalendarEvent,
  PreferredTimeRange,
} from '@/src/features/agent/calendarIntelligence/types';

const SAME_TIME_TOLERANCE_MINUTES = 30;
const DEFAULT_SCHEDULING_DAY_END_MINUTES = 20 * 60;

export function getEventsForDay(
  events: NormalizedCalendarEvent[],
  day: CalendarDayContext,
): NormalizedCalendarEvent[] {
  return events.filter((event) => event.dateKey === day.dateKey);
}

export function getEventsAtTime(
  events: NormalizedCalendarEvent[],
  day: CalendarDayContext,
  clockMinutes: number,
): NormalizedCalendarEvent[] {
  const dayEvents = getEventsForDay(events, day);

  return dayEvents.filter((event) => {
    const startsNear =
      Math.abs(event.startMinutes - clockMinutes) <= SAME_TIME_TOLERANCE_MINUTES;
    const spansTime =
      event.startMinutes <= clockMinutes && event.endMinutes > clockMinutes;

    return startsNear || spansTime;
  });
}

export function getNextEvent(
  events: NormalizedCalendarEvent[],
  day: CalendarDayContext,
  referenceNow: Date,
): NormalizedCalendarEvent | null {
  const nowMs = referenceNow.getTime();
  const dayEvents = getEventsForDay(events, day);

  for (const event of dayEvents) {
    const startMs = parseGoogleCalendarInstant(event.startISO);

    if (startMs !== null && startMs > nowMs) {
      return event;
    }
  }

  return null;
}

export function getLastEvent(
  events: NormalizedCalendarEvent[],
  day: CalendarDayContext,
): NormalizedCalendarEvent | null {
  const dayEvents = getEventsForDay(events, day);

  return dayEvents.length > 0 ? dayEvents[dayEvents.length - 1] : null;
}

export function findOverlappingEventPairs(events: NormalizedCalendarEvent[]) {
  const pairs: Array<{ first: NormalizedCalendarEvent; second: NormalizedCalendarEvent }> = [];

  for (let index = 0; index < events.length; index += 1) {
    for (let inner = index + 1; inner < events.length; inner += 1) {
      const first = events[index];
      const second = events[inner];

      if (first.startMinutes < second.endMinutes && second.startMinutes < first.endMinutes) {
        pairs.push({ first, second });
      }
    }
  }

  return pairs;
}

function minutesFromReferenceOnDay(referenceNow: Date, day: CalendarDayContext) {
  const parts = getZonedTimeParts(referenceNow, day.timezone);

  if (day.dayOffset > 0) {
    return 0;
  }

  if (day.dayOffset < 0) {
    return 24 * 60;
  }

  return parts.hour * 60 + parts.minute;
}

export function getFreeWindows(
  events: NormalizedCalendarEvent[],
  day: CalendarDayContext,
  referenceNow: Date,
  minDurationMinutes = 15,
): CalendarFreeSlot[] {
  const dayEvents = getEventsForDay(events, day);
  const dayStartMinutes = 0;
  const dayEndMinutes = DEFAULT_SCHEDULING_DAY_END_MINUTES;
  const cursorStart = Math.max(dayStartMinutes, minutesFromReferenceOnDay(referenceNow, day));
  const slots: CalendarFreeSlot[] = [];
  let cursor = cursorStart;

  for (const event of dayEvents) {
    if (event.startMinutes > cursor) {
      const durationMinutes = event.startMinutes - cursor;

      if (durationMinutes >= minDurationMinutes) {
        slots.push(buildFreeSlot(day, cursor, event.startMinutes));
      }
    }

    cursor = Math.max(cursor, event.endMinutes);
  }

  if (dayEndMinutes - cursor >= minDurationMinutes) {
    slots.push(buildFreeSlot(day, cursor, dayEndMinutes));
  }

  return slots;
}

function buildFreeSlot(day: CalendarDayContext, startMinutes: number, endMinutes: number): CalendarFreeSlot {
  const startISO = zonedMinutesToIso(day, startMinutes);
  const endISO = zonedMinutesToIso(day, endMinutes);

  return {
    startMinutes,
    endMinutes,
    durationMinutes: endMinutes - startMinutes,
    startISO,
    endISO,
  };
}

function zonedMinutesToIso(day: CalendarDayContext, minutes: number) {
  const anchorYmd = {
    year: Number(day.dateKey.slice(0, 4)),
    month: Number(day.dateKey.slice(5, 7)),
    day: Number(day.dateKey.slice(8, 10)),
    hour: Math.floor(minutes / 60),
    minute: minutes % 60,
    second: 0,
  };

  return new Date(zonedLocalToUtcMs(anchorYmd, day.timezone)).toISOString();
}

export function findBestSlot(
  events: NormalizedCalendarEvent[],
  day: CalendarDayContext,
  referenceNow: Date,
  durationMinutes: number,
  preferredRange?: PreferredTimeRange,
): CalendarFreeSlot | null {
  const windows = getFreeWindows(events, day, referenceNow, durationMinutes);

  const matching = windows.filter((window) => window.durationMinutes >= durationMinutes);

  if (matching.length === 0) {
    return null;
  }

  if (preferredRange) {
    const preferred = matching.find(
      (window) =>
        window.startMinutes >= preferredRange.startMinutes &&
        window.endMinutes <= preferredRange.endMinutes,
    );

    if (preferred && preferred.durationMinutes >= durationMinutes) {
      return preferred;
    }
  }

  return matching[0];
}
