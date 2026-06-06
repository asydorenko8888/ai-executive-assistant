import { parseGoogleCalendarInstant } from '@/src/features/agent/calendar/calendarTime';
import { getZonedTimeParts, zonedLocalToUtcMs } from '@/src/features/agent/calendar/calendarTimezone';
import type {
  CalendarDayContext,
  CalendarFreeSlot,
  NormalizedCalendarEvent,
  PreferredTimeRange,
} from '@/src/features/agent/calendarIntelligence/types';

const DEFAULT_SCHEDULING_DAY_END_MINUTES = 20 * 60;

function zonedMinuteAnchorMs(day: CalendarDayContext, clockMinutes: number) {
  const anchorYmd = {
    year: Number(day.dateKey.slice(0, 4)),
    month: Number(day.dateKey.slice(5, 7)),
    day: Number(day.dateKey.slice(8, 10)),
    hour: Math.floor(clockMinutes / 60),
    minute: clockMinutes % 60,
    second: 0,
  };

  return zonedLocalToUtcMs(anchorYmd, day.timezone);
}

/** Active at the requested clock minute: start <= requestedInstant < end (half-open). */
export function eventIsActiveAtRequestedTime(
  event: NormalizedCalendarEvent,
  clockMinutes: number,
  day: CalendarDayContext,
) {
  const requestedMs = zonedMinuteAnchorMs(day, clockMinutes);
  const startMs = parseGoogleCalendarInstant(event.startISO);
  const endMs = parseGoogleCalendarInstant(event.endISO);

  if (startMs === null || endMs === null) {
    return false;
  }

  return startMs <= requestedMs && endMs > requestedMs;
}

export function eventMatchesExactRequestedTime(
  event: NormalizedCalendarEvent,
  clockMinutes: number,
  day?: CalendarDayContext,
) {
  if (day) {
    return eventIsActiveAtRequestedTime(event, clockMinutes, day);
  }

  if (event.startMinutes === clockMinutes) {
    return true;
  }

  return event.startMinutes <= clockMinutes && event.endMinutes > clockMinutes;
}

export function getEventsForDay(
  events: NormalizedCalendarEvent[],
  day: CalendarDayContext,
): NormalizedCalendarEvent[] {
  return events.filter((event) => event.dateKey === day.dateKey);
}

export function splitDayEventsByPastAndFuture(
  events: NormalizedCalendarEvent[],
  day: CalendarDayContext,
  referenceNow: Date,
) {
  const nowMs = referenceNow.getTime();
  const pastEvents: NormalizedCalendarEvent[] = [];
  const futureEvents: NormalizedCalendarEvent[] = [];

  for (const event of getEventsForDay(events, day)) {
    const endMs = parseGoogleCalendarInstant(event.endISO);

    if (endMs === null) {
      continue;
    }

    if (endMs <= nowMs) {
      pastEvents.push(event);
      continue;
    }

    futureEvents.push(event);
  }

  return { pastEvents, futureEvents };
}

function getBusyEventsForFreeTime(
  events: NormalizedCalendarEvent[],
  day: CalendarDayContext,
  referenceNow: Date,
) {
  const nowMs = referenceNow.getTime();

  return getEventsForDay(events, day).filter((event) => {
    const endMs = parseGoogleCalendarInstant(event.endISO);

    return endMs !== null && endMs > nowMs;
  });
}

export function getEventsActiveAtTime(
  events: NormalizedCalendarEvent[],
  day: CalendarDayContext,
  clockMinutes: number,
) {
  const dayEvents = getEventsForDay(events, day);

  return dayEvents.filter((event) => eventIsActiveAtRequestedTime(event, clockMinutes, day));
}

/** Events whose start instant equals the requested clock minute. */
export function getEventsStartingAtTime(
  events: NormalizedCalendarEvent[],
  day: CalendarDayContext,
  clockMinutes: number,
) {
  const dayEvents = getEventsForDay(events, day);
  const requestedMs = zonedMinuteAnchorMs(day, clockMinutes);

  return dayEvents.filter((event) => {
    const startMs = parseGoogleCalendarInstant(event.startISO);

    if (startMs === null) {
      return false;
    }

    return startMs === requestedMs || event.startMinutes === clockMinutes;
  });
}

/** @deprecated Use getEventsActiveAtTime — kept for call sites. */
export function getEventsAtExactTime(
  events: NormalizedCalendarEvent[],
  day: CalendarDayContext,
  clockMinutes: number,
) {
  return getEventsActiveAtTime(events, day, clockMinutes);
}

/** Point-in-time READ — events active at the requested minute (half-open interval). */
export function getEventsAtTime(
  events: NormalizedCalendarEvent[],
  day: CalendarDayContext,
  clockMinutes: number,
) {
  return getEventsActiveAtTime(events, day, clockMinutes);
}

export function getNextEvent(
  events: NormalizedCalendarEvent[],
  day: CalendarDayContext,
  referenceNow: Date,
): NormalizedCalendarEvent | null {
  const { futureEvents } = splitDayEventsByPastAndFuture(events, day, referenceNow);

  return futureEvents[0] ?? null;
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

export type GetFreeWindowsOptions = {
  dayEndMinutes?: number;
  minDurationMinutes?: number;
  futureBusyEventsOnly?: boolean;
};

export function getFreeWindows(
  events: NormalizedCalendarEvent[],
  day: CalendarDayContext,
  referenceNow: Date,
  minDurationMinutes = 15,
  options?: GetFreeWindowsOptions,
): CalendarFreeSlot[] {
  const dayEvents = options?.futureBusyEventsOnly
    ? getBusyEventsForFreeTime(events, day, referenceNow)
    : getEventsForDay(events, day);
  const dayStartMinutes = 0;
  const dayEndMinutes = options?.dayEndMinutes ?? DEFAULT_SCHEDULING_DAY_END_MINUTES;
  const minGap = options?.minDurationMinutes ?? minDurationMinutes;
  const cursorStart = Math.max(dayStartMinutes, minutesFromReferenceOnDay(referenceNow, day));
  const slots: CalendarFreeSlot[] = [];
  let cursor = cursorStart;

  for (const event of dayEvents) {
    if (event.startMinutes > cursor) {
      const durationMinutes = event.startMinutes - cursor;

      if (durationMinutes >= minGap) {
        slots.push(buildFreeSlot(day, cursor, event.startMinutes));
      }
    }

    cursor = Math.max(cursor, event.endMinutes);
  }

  if (dayEndMinutes - cursor >= minGap) {
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
